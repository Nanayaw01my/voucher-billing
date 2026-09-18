import type { Types } from 'mongoose';
import { RouterModel, SessionModel, Voucher, type IRouter } from '../models';
import { routerPool, type ActiveHotspotUser } from './mikrotik';
import { decryptSecret } from '../utils/crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';

export interface ActiveUserView extends ActiveHotspotUser {
  routerId: string;
  routerName: string;
  locationId?: string;
  voucherId?: string;
  voucherCode?: string;
  packageName?: string;
  totalBytes: number | null;
}

export interface ActiveUsersResult {
  /** Straight from /ip/hotspot/active -- this is live router state, not Mongo. */
  source: 'router';
  fetchedAt: string;
  users: ActiveUserView[];
  /** Routers we could not reach. The list above is incomplete by exactly these. */
  degraded: Array<{ routerId: string; routerName: string; reason: string }>;
}

async function enabledRouters(routerId?: string): Promise<IRouter[]> {
  const filter: Record<string, unknown> = { status: 'ACTIVE' };
  if (routerId) filter._id = routerId;
  return RouterModel.find(filter);
}

export async function getActiveUsers(routerId?: string): Promise<ActiveUsersResult> {
  const routers = await enabledRouters(routerId);
  const users: ActiveUserView[] = [];
  const degraded: ActiveUsersResult['degraded'] = [];

  // One round trip per router, run in parallel rather than per UI widget.
  const results = await Promise.all(
    routers.map(async (router) => ({
      router,
      outcome: await routerPool.tryWith(String(router._id), (service) => service.listActive()),
    })),
  );

  const usernames = results.flatMap((r) => (r.outcome.ok ? r.outcome.value.map((u) => u.username) : []));
  const vouchers = usernames.length
    ? await Voucher.find({ username: { $in: usernames } }).populate('packageId', 'name').lean()
    : [];
  const voucherByUsername = new Map(vouchers.map((v) => [v.username, v]));

  for (const { router, outcome } of results) {
    if (!outcome.ok) {
      degraded.push({ routerId: String(router._id), routerName: router.name, reason: outcome.reason });
      continue;
    }
    for (const entry of outcome.value) {
      const voucher = voucherByUsername.get(entry.username);
      users.push({
        ...entry,
        routerId: String(router._id),
        routerName: router.name,
        ...(router.locationId ? { locationId: String(router.locationId) } : {}),
        ...(voucher ? { voucherId: String(voucher._id), voucherCode: voucher.code } : {}),
        ...(voucher?.packageId ? { packageName: (voucher.packageId as unknown as { name?: string }).name } : {}),
        totalBytes: entry.bytesIn === null || entry.bytesOut === null ? null : entry.bytesIn + entry.bytesOut,
      });
    }
  }

  return { source: 'router', fetchedAt: new Date().toISOString(), users, degraded };
}

export async function disconnectUser(routerId: string, activeId: string): Promise<void> {
  const service = await routerPool.acquire(routerId);
  await service.disconnectActive(activeId);
}

/**
 * Reconciles one router against Mongo:
 *   1. open a Session for every username newly seen active
 *   2. close the Sessions whose username vanished, writing final accounting
 *   3. mirror per-user accounting counters onto the voucher
 *
 * Closed sessions are never rewritten. Because this is poll-based, usage is
 * accurate to within one poll interval and is labelled as accounting data.
 */
export async function syncRouter(routerId: string): Promise<{ opened: number; closed: number; updated: number }> {
  const outcome = await routerPool.tryWith(routerId, async (service) => ({
    active: await service.listActive(),
    users: await service.listHotspotUsers(),
  }));

  if (!outcome.ok) {
    logger.warn('Router sync skipped', { routerId, reason: outcome.reason });
    return { opened: 0, closed: 0, updated: 0 };
  }

  const router = await RouterModel.findById(routerId);
  if (!router) return { opened: 0, closed: 0, updated: 0 };

  const { active, users } = outcome.value;
  const accountingByName = new Map(users.map((user) => [user.name, user]));
  const activeUsernames = new Set(active.map((entry) => entry.username));

  const openSessions = await SessionModel.find({ routerId, isOpen: true });
  const openByUsername = new Map(openSessions.map((session) => [session.username, session]));

  const vouchers = await Voucher.find({ username: { $in: users.map((u) => u.name) } }).select('username');
  const voucherIdByUsername = new Map(vouchers.map((v) => [v.username, v._id as Types.ObjectId]));

  let opened = 0;
  let closed = 0;

  for (const entry of active) {
    if (openByUsername.has(entry.username)) continue;
    await SessionModel.create({
      voucherId: voucherIdByUsername.get(entry.username),
      routerId: router._id,
      locationId: router.locationId,
      username: entry.username,
      ipAddress: entry.address,
      macAddress: entry.macAddress,
      // Back-date to the real login using the uptime the router reports.
      loginTime: new Date(Date.now() - (entry.uptimeSeconds ?? 0) * 1000),
      isOpen: true,
    });
    opened += 1;
  }

  for (const session of openSessions) {
    if (activeUsernames.has(session.username)) continue;
    const accounting = accountingByName.get(session.username);
    const logoutTime = new Date();
    session.logoutTime = logoutTime;
    session.durationSeconds = Math.max(0, Math.round((logoutTime.getTime() - session.loginTime.getTime()) / 1000));
    if (accounting) {
      session.uploadBytes = accounting.bytesIn ?? undefined;
      session.downloadBytes = accounting.bytesOut ?? undefined;
      session.totalBytes =
        accounting.bytesIn !== null && accounting.bytesOut !== null ? accounting.bytesIn + accounting.bytesOut : undefined;
    }
    session.terminationReason = 'disconnected';
    session.isOpen = false;
    await session.save();
    closed += 1;
  }

  // Mirror accounting onto vouchers and move their management status forward.
  let updated = 0;
  const operations = users
    .filter((user) => voucherIdByUsername.has(user.name))
    .map((user) => {
      const hasUsage = (user.uptimeSeconds ?? 0) > 0 || (user.bytesIn ?? 0) > 0 || (user.bytesOut ?? 0) > 0;
      const exhausted =
        (user.limitUptimeSeconds !== null && (user.uptimeSeconds ?? 0) >= user.limitUptimeSeconds) ||
        (user.limitBytesTotal !== null && (user.bytesIn ?? 0) + (user.bytesOut ?? 0) >= user.limitBytesTotal);

      const set: Record<string, unknown> = {
        uptimeUsedSeconds: user.uptimeSeconds ?? 0,
        uploadBytes: user.bytesIn ?? 0,
        downloadBytes: user.bytesOut ?? 0,
        lastSyncedAt: new Date(),
        pushedToRouter: true,
      };
      if (user.disabled) set.status = 'DISABLED';
      else if (exhausted) set.status = 'EXPIRED';
      else if (activeUsernames.has(user.name)) set.status = 'ACTIVE';
      else if (hasUsage) set.status = 'USED';

      return {
        updateOne: {
          filter: { username: user.name },
          update: {
            $set: set,
            ...(hasUsage ? { $min: { activatedAt: new Date(Date.now() - (user.uptimeSeconds ?? 0) * 1000) } } : {}),
          },
        },
      };
    });

  for (let i = 0; i < operations.length; i += 500) {
    const result = await Voucher.bulkWrite(operations.slice(i, i + 500), { ordered: false });
    updated += result.modifiedCount ?? 0;
  }

  await RouterModel.updateOne({ _id: routerId }, { $set: { lastSyncedAt: new Date(), lastSeen: new Date() } });
  return { opened, closed, updated };
}

export async function syncAllRouters(): Promise<void> {
  const routers = await enabledRouters();
  for (const router of routers) {
    try {
      const result = await syncRouter(String(router._id));
      logger.debug('Router synced', { router: router.name, ...result });
    } catch (err) {
      logger.warn('Router sync failed', { router: router.name, error: (err as Error).message });
    }
  }
}

/** Pushes vouchers that exist only in Mongo up to their router. */
export async function pushVouchersToRouter(routerId: string, voucherIds?: string[]): Promise<{ pushed: number; failed: Array<{ code: string; reason: string }> }> {
  const filter: Record<string, unknown> = { routerId, pushedToRouter: false };
  if (voucherIds?.length) filter._id = { $in: voucherIds };

  const vouchers = await Voucher.find(filter).select('+encryptedPassword').limit(5000);
  if (vouchers.length === 0) return { pushed: 0, failed: [] };

  const service = await routerPool.acquire(routerId);
  const failed: Array<{ code: string; reason: string }> = [];
  let pushed = 0;

  for (const voucher of vouchers) {
    try {
      await service.addHotspotUser({
        name: voucher.username,
        password: decryptSecret(voucher.encryptedPassword, env.voucherSecretKey),
        profile: voucher.profileName,
        limitUptimeSeconds: voucher.limitUptimeSeconds ?? null,
        limitBytesTotalBytes: voucher.dataLimitBytes ?? null,
        comment: `voucher:${voucher.code}`,
      });
      voucher.pushedToRouter = true;
      voucher.pushedAt = new Date();
      await voucher.save();
      pushed += 1;
    } catch (err) {
      failed.push({ code: voucher.code, reason: err instanceof Error ? err.message : 'unknown error' });
    }
  }

  return { pushed, failed };
}
