import { z } from 'zod';
import type { Request, Response } from 'express';
import { getActiveUsers, disconnectUser } from '../services/syncService';
import { getDashboard, getReports } from '../services/dashboardService';
import { queryOf } from '../middleware/validate';
import { recordAudit } from '../services/auditService';
import { actorFrom } from '../middleware/auth';

export const activeUsersSchema = z.object({ routerId: z.string().optional() });

export async function listActiveUsers(req: Request, res: Response): Promise<void> {
  const { routerId } = queryOf<z.infer<typeof activeUsersSchema>>(req);
  res.json(await getActiveUsers(routerId));
}

export const disconnectSchema = z.object({ routerId: z.string().min(1, 'Which router is this session on?') });

export async function disconnectActiveUser(req: Request, res: Response): Promise<void> {
  const { routerId } = req.body as z.infer<typeof disconnectSchema>;
  // `id` is the router-side .id from the same pooled connection's active list.
  await disconnectUser(routerId, req.params.id as string);
  await recordAudit(actorFrom(req), 'USER_DISCONNECTED', 'Session', req.params.id, { routerId });
  res.json({ ok: true });
}

export async function dashboard(_req: Request, res: Response): Promise<void> {
  res.json(await getDashboard());
}

export const reportsSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export async function reports(req: Request, res: Response): Promise<void> {
  const query = queryOf<z.infer<typeof reportsSchema>>(req);
  res.json(await getReports(query));
}
