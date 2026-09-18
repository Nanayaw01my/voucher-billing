import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function hexKey(name: string, fallback: string): Buffer {
  const raw = required(name, fallback);
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error(`${name} must be a 32-byte hex string (64 hex characters)`);
  }
  return key;
}

const isProd = process.env.NODE_ENV === 'production';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd,
  port: Number(process.env.PORT ?? 4000),
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/voucher_billing'),
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
};
