import { RouterOsClient, RouterOsApiError } from './client';
import { MikrotikService } from './mikrotikService';
import { RouterModel, type IRouter } from '../../models';
import { decryptSecret } from '../../utils/crypto';
import { env } from '../../config/env';
import { RouterUnavailableError } from '../../utils/apiError';
import { logger } from '../../config/logger';

interface PooledEntry {
  client: RouterOsClient;
  service: MikrotikService;
}

/**
 * One live connection per router, reused across requests. The dashboard and the
 * active-users page therefore cost one round trip per router, not one per widget.
 */
class RouterPool {
  private readonly entries = new Map<string, PooledEntry>();

  private async open(router: IRouter & { encryptedPassword: string }): Promise<PooledEntry> {
    const client = new RouterOsClient({
      host: router.host,
      port: router.port,
      username: router.username,
      password: decryptSecret(router.encryptedPassword, env.routerSecretKey),
      useTls: router.useTls,
      timeoutMs: env.routerTimeoutMs,
    });
    client.once('close', () => this.entries.delete(String(router._id)));
    await client.connect();
    return { client, service: new MikrotikService(client) };
  }

  async acquire(routerId: string): Promise<MikrotikService> {
    const cached = this.entries.get(routerId);
    if (cached?.client.isConnected) return cached.service;
    this.entries.delete(routerId);

    const router = await RouterModel.findById(routerId).select('+encryptedPassword');
    if (!router) throw new RouterUnavailableError(routerId, 'router not found');
    if (router.status !== 'ACTIVE') throw new RouterUnavailableError(router.name, 'router is disabled');

    try {
      const entry = await this.open(router as IRouter & { encryptedPassword: string });
      this.entries.set(routerId, entry);
      await RouterModel.updateOne(
        { _id: router._id },
        { $set: { connectionStatus: 'ONLINE', lastSeen: new Date() }, $unset: { lastError: '' } },
      );
      return entry.service;
    } catch (err) {
      const reason = err instanceof RouterOsApiError ? err.message : 'unknown error';
      await RouterModel.updateOne(
        { _id: router._id },
        { $set: { connectionStatus: 'OFFLINE', lastError: reason } },
      );
      logger.warn('Router connection failed', { router: router.name, reason });
      throw new RouterUnavailableError(router.name, reason);
    }
  }

  /**
   * Runs `work` against a router and converts any failure into a soft result,
   * so one offline router never breaks a page that spans several.
   */
  async tryWith<T>(
    routerId: string,
    work: (service: MikrotikService) => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
    try {
      const service = await this.acquire(routerId);
      return { ok: true, value: await work(service) };
    } catch (err) {
      this.release(routerId);
      const reason = err instanceof Error ? err.message : 'unknown error';
      return { ok: false, reason };
    }
  }

  release(routerId: string): void {
    const entry = this.entries.get(routerId);
    entry?.client.close();
    this.entries.delete(routerId);
  }

  closeAll(): void {
    for (const id of [...this.entries.keys()]) this.release(id);
  }
}

export const routerPool = new RouterPool();

/** One-off connection used by "Test connection" so a bad credential is never cached. */
export async function testRouterConnection(params: {
  host: string;
  port: number;
  username: string;
  password: string;
  useTls: boolean;
}): Promise<{ ok: boolean; identity?: string; version?: string; error?: string }> {
  const client = new RouterOsClient({ ...params, timeoutMs: env.routerTimeoutMs });
  try {
    await client.connect();
    const identity = await new MikrotikService(client).identity();
    return { ok: true, identity: identity.identity, version: identity.version };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
  } finally {
    client.close();
  }
}
