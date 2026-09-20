import { z } from 'zod';
import type { Request, Response } from 'express';
import {
  Voucher, SessionModel, Sale, ImportBatch, AuditLog,
  PackageModel, Location, RouterModel, AccessPoint, User,
} from '../models';
import { routerPool } from '../services/mikrotik';
import { recordAudit } from '../services/auditService';
import { actorFrom } from '../middleware/auth';

/**
 * Scopes are grouped by what cannot survive without the rest. Vouchers,
 * sessions, sales and import batches all reference each other, so clearing
 * one alone would leave records pointing at things that no longer exist.
 */
export const SCOPES = ['vouchers', 'auditLogs', 'configuration'] as const;
export type Scope = (typeof SCOPES)[number];

export const systemResetSchema = z.object({
  scopes: z.array(z.enum(SCOPES)).min(1, 'Choose at least one thing to clear'),
  /** Typed by the operator; checked here too, not only in the browser. */
  confirm: z.literal('RESET', { errorMap: () => ({ message: 'Type RESET to confirm' }) }),
});

/**
 * Clears data in bulk. Two things it deliberately never does:
 *
 *  - It never deletes user accounts. Removing the administrator you are signed
 *    in as would lock everyone out of a system whose only recovery path is a
 *    hosting-dashboard environment variable.
 *  - It never touches the MikroTik. Vouchers exist there as real hotspot users
 *    serving paying customers; clearing this system's records is a bookkeeping
 *    action, not a network one.
 */
export async function resetSystem(req: Request, res: Response): Promise<void> {
  const { scopes } = req.body as z.infer<typeof systemResetSchema>;
  const deleted: Record<string, number> = {};

  if (scopes.includes('vouchers')) {
    // Children first, so nothing is briefly pointing at a deleted parent.
    deleted.sessions = (await SessionModel.deleteMany({})).deletedCount ?? 0;
    deleted.sales = (await Sale.deleteMany({})).deletedCount ?? 0;
    deleted.vouchers = (await Voucher.deleteMany({})).deletedCount ?? 0;
    deleted.importBatches = (await ImportBatch.deleteMany({})).deletedCount ?? 0;
  }

  if (scopes.includes('configuration')) {
    deleted.packages = (await PackageModel.deleteMany({})).deletedCount ?? 0;
    deleted.accessPoints = (await AccessPoint.deleteMany({})).deletedCount ?? 0;
    // Drop pooled connections before the credentials behind them disappear.
    routerPool.closeAll();
    deleted.routers = (await RouterModel.deleteMany({})).deletedCount ?? 0;
    deleted.locations = (await Location.deleteMany({})).deletedCount ?? 0;
  }

  if (scopes.includes('auditLogs')) {
    deleted.auditLogs = (await AuditLog.deleteMany({})).deletedCount ?? 0;
  }

  // Written last on purpose: even a reset that wiped the audit log leaves this
  // one entry behind, so the reset itself is never invisible.
  await recordAudit(actorFrom(req), 'SYSTEM_RESET', 'System', undefined, { scopes, deleted });

  res.json({
    deleted,
    scopes,
    usersKept: await User.countDocuments(),
    note: 'User accounts and the MikroTik were not touched.',
  });
}
