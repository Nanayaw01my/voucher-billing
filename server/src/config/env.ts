import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const isProd = process.env.NODE_ENV === 'production';

/**
 * A 32-byte encryption key. The development fallback is deliberately NOT
 * available in production: a missing key there must stop the process, never
 * quietly encrypt real router and voucher passwords under a placeholder that
 * is committed to this repository.
 *
 * These two keys must stay stable for the life of the deployment. Changing one
 * makes every secret already encrypted under it unreadable.
 */
function hexKey(name: string, devFallback: string): Buffer {
  const raw = required(name, isProd ? undefined : devFallback);
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(`${name} must be 64 hex characters (32 bytes). Generate one with: openssl rand -hex 32`);
  }
  return Buffer.from(raw, 'hex');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd,
  port: Number(process.env.PORT ?? 4000),
  mongoUri: required('MONGODB_URI', isProd ? undefined : 'mongodb://127.0.0.1:27017/voucher_billing'),
  jwtSecret: required('JWT_SECRET', isProd ? undefined : 'dev-only-insecure-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  routerSecretKey: hexKey('ROUTER_SECRET_KEY', 'a'.repeat(64)),
  voucherSecretKey: hexKey('VOUCHER_SECRET_KEY', 'b'.repeat(64)),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  syncEnabled: (process.env.SYNC_ENABLED ?? 'true') === 'true',
  syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS ?? 60_000),
  routerTimeoutMs: Number(process.env.ROUTER_TIMEOUT_MS ?? 8_000),
  seedAdminUsername: process.env.SEED_ADMIN_USERNAME ?? 'admin',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!',
  /**
   * When the built frontend is present the API serves it too, so a single
   * Render service covers both and there is no cross-origin request at all.
   */
  clientDistPath: process.env.CLIENT_DIST_PATH ?? path.resolve(__dirname, '../../../client/dist'),
};
