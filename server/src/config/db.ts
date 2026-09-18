import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  logger.info('MongoDB connected');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

/**
 * Serverless-safe connection.
 *
 * On a platform like Vercel every request may land in a fresh module scope, but
 * warm instances are reused. Caching the *promise* on globalThis means
 * concurrent requests on a cold start share one handshake instead of each
 * opening its own, which is what exhausts an Atlas connection limit.
 */
const globalForMongoose = globalThis as typeof globalThis & {
  __voucherMongoose?: Promise<typeof mongoose>;
};

export function ensureDatabase(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);

  if (!globalForMongoose.__voucherMongoose) {
    mongoose.set('strictQuery', true);
    globalForMongoose.__voucherMongoose = mongoose
      .connect(env.mongoUri, {
        serverSelectionTimeoutMS: 10_000,
        // A serverless instance handles few concurrent requests, so a large
        // pool per instance only burns the cluster's connection budget.
        maxPoolSize: 5,
      })
      .catch((err) => {
        // Never cache a failed handshake, or the instance stays broken until
        // it is recycled.
        delete globalForMongoose.__voucherMongoose;
        throw err;
      });
  }
  return globalForMongoose.__voucherMongoose;
}
