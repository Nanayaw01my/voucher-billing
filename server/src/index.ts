import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';
import { startSyncWorker, stopSyncWorker } from './workers/syncWorker';
import { routerPool } from './services/mikrotik';
import { bootstrapIfEmpty } from './services/bootstrap';

async function main(): Promise<void> {
  await connectDatabase();

  // First run on an empty database creates the packages, a default location
  // and the administrator, so a hosted deployment needs no shell access.
  try {
    const bootstrap = await bootstrapIfEmpty();
    if (bootstrap.adminCreated) logger.info('Bootstrapped an empty database');
  } catch (err) {
    // Never block startup on this: the API is still useful, and the cause is logged.
    logger.error('First-run setup failed', { error: (err as Error).message });
  }

  const server = createApp().listen(env.port, () => {
    logger.info(`API listening on port ${env.port}`, { env: env.nodeEnv });
  });

  if (env.syncEnabled) startSyncWorker();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down`);
    stopSyncWorker();
    routerPool.closeAll();
    server.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Failed to start', { error: (err as Error).message });
  process.exit(1);
});
