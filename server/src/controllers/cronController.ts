import type { Request, Response } from 'express';
import crypto from 'crypto';
import { syncAllRouters } from '../services/syncService';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';
import { logger } from '../config/logger';

/** Constant-time compare, so a wrong secret cannot be guessed byte by byte. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Runs one MikroTik sync pass, for platforms that cannot keep a background
 * worker alive (Vercel and other serverless hosts). On a long-running host the
 * in-process worker does this on a timer instead and this route is unnecessary.
 *
 * Authenticated by CRON_SECRET rather than a session: the caller is a scheduler,
 * not a person. Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>`.
 */
export async function runSync(req: Request, res: Response): Promise<void> {
  if (!env.cronSecret) {
    throw ApiError.forbidden('Scheduled sync is not enabled. Set CRON_SECRET to use it.');
  }

  const header = req.headers.authorization ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!provided || !secretMatches(provided, env.cronSecret)) {
    // Deliberately terse: a scheduler does not need a diagnostic.
    throw ApiError.unauthorized('Invalid scheduler credentials.');
  }

  const startedAt = Date.now();
  await syncAllRouters();
  const durationMs = Date.now() - startedAt;

  logger.info('Scheduled sync completed', { durationMs });
  res.json({ ok: true, durationMs, ranAt: new Date().toISOString() });
}
