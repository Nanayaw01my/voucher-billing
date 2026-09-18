import { createApp } from './app';
import { connectDatabase, disconnectDatabase } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';
import { startSyncWorker, stopSyncWorker } from './workers/syncWorker';
import { routerPool } from './services/mikrotik';

async function main(): Promise<void> {
  await connectDatabase();

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
