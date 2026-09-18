import { syncAllRouters } from '../services/syncService';
import { env } from '../config/env';
import { logger } from '../config/logger';

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Polls every enabled router on an interval to open and close Session records
 * and mirror accounting counters. Runs one pass at a time -- a slow Starlink
 * link must not stack overlapping syncs.
 */
export function startSyncWorker(): void {
  if (timer) return;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await syncAllRouters();
    } catch (err) {
      logger.error('Sync pass failed', { error: (err as Error).message });
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => void tick(), env.syncIntervalMs);
  void tick();
  logger.info('MikroTik sync worker started', { intervalMs: env.syncIntervalMs });
}

export function stopSyncWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
