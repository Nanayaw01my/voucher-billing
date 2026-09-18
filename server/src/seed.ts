import { connectDatabase, disconnectDatabase } from './config/db';
import { logger } from './config/logger';
import { bootstrapIfEmpty } from './services/bootstrap';

/**
 * Manual entry point for the same first-run setup the server performs at
 * startup. Useful for seeding a database without deploying anything.
 */
async function seed(): Promise<void> {
  await connectDatabase();
  const result = await bootstrapIfEmpty();

  if (result.skippedReason) logger.info(`Nothing to do: ${result.skippedReason}`);
  else logger.info('Seed complete', { ...result });

  await disconnectDatabase();
}

seed().catch((err) => {
  logger.error('Seed failed', { error: (err as Error).message });
  process.exit(1);
});
