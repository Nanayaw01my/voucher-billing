import { User, hashPassword, PackageModel, Location, AuditLog } from '../models';
import { env } from '../config/env';
import { logger } from '../config/logger';

const PACKAGES = [
  { name: '1 Hour', durationSeconds: 3600, price: 2, mikrotikProfile: 'VOUCHER-1H-1CODE' },
  { name: '3 Hours', durationSeconds: 3 * 3600, price: 4, mikrotikProfile: 'VOUCHER-3H-1CODE' },
  { name: '6 Hours', durationSeconds: 6 * 3600, price: 6, mikrotikProfile: 'VOUCHER-6H-1CODE' },
  { name: '12 Hours', durationSeconds: 12 * 3600, price: 8, mikrotikProfile: 'VOUCHER-12H-1CODE' },
  { name: '24 Hours', durationSeconds: 24 * 3600, price: 10, mikrotikProfile: 'VOUCHER-24H-1CODE' },
  { name: '1 GB', dataLimitBytes: 1024 ** 3, price: 5, mikrotikProfile: 'VOUCHER-1GB' },
  { name: '2 GB', dataLimitBytes: 2 * 1024 ** 3, price: 9, mikrotikProfile: 'VOUCHER-2GB' },
  { name: '5 GB', dataLimitBytes: 5 * 1024 ** 3, price: 20, mikrotikProfile: 'VOUCHER-5GB' },
];

/**
 * Resets the administrator's password from the environment, for a deployment
 * with no shell access. Gated on ADMIN_PASSWORD_RESET, which only whoever
 * controls the hosting dashboard can set -- the same authority a shell would
 * give. It is loud in the logs and recorded in the audit trail.
 *
 * Needed because first-run setup deliberately does nothing once a user exists,
 * so changing SEED_ADMIN_PASSWORD afterwards otherwise has no effect at all.
 */
export async function resetAdminPasswordIfRequested(): Promise<boolean> {
  const flag = (process.env.ADMIN_PASSWORD_RESET ?? '').trim();
  if (flag.toLowerCase() !== 'true') {
    // A set-but-wrong value means someone is trying to use this and it is not
    // firing. Silence there would look identical to the feature being broken.
    if (flag) {
      logger.warn(
        `ADMIN_PASSWORD_RESET is set to "${flag}", which is not "true", so no password was reset`,
      );
    }
    return false;
  }

  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password === PLACEHOLDER_PASSWORD) {
    logger.warn('ADMIN_PASSWORD_RESET is set but SEED_ADMIN_PASSWORD is missing or still the example value');
    return false;
  }

  const username = env.seedAdminUsername.toLowerCase();
  const passwordHash = await hashPassword(password);
  const existing = await User.findOne({ username });

  if (existing) {
    existing.passwordHash = passwordHash;
    existing.status = 'ACTIVE'; // a locked-out admin is the case this exists for
    await existing.save();
  } else {
    await User.create({
      name: 'Administrator',
      username,
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    });
  }

  await AuditLog.create({
    username,
    action: 'ADMIN_PASSWORD_RESET',
    entity: 'User',
    metadata: { via: 'ADMIN_PASSWORD_RESET environment variable', created: !existing },
    timestamp: new Date(),
  });

  logger.warn(
    `Administrator password was reset for "${username}". Remove ADMIN_PASSWORD_RESET from the environment now -- ` +
      'while it is set, every restart resets this password again.',
  );
  return true;
}

/** The stand-in in .env.example. Never acceptable on a public deployment. */
const PLACEHOLDER_PASSWORD = 'ChangeMe123!';

export interface BootstrapResult {
  packagesCreated: number;
  locationCreated: boolean;
  adminCreated: boolean;
  skippedReason?: string;
}

/**
 * Creates the starting packages, a default location and the first
 * administrator. Safe to run repeatedly: it only ever adds what is missing,
 * and it will not touch a database that already has users.
 *
 * Runs automatically at startup so a hosted deployment needs no shell access.
 */
export async function bootstrapIfEmpty(): Promise<BootstrapResult> {
  const result: BootstrapResult = { packagesCreated: 0, locationCreated: false, adminCreated: false };

  const existingUsers = await User.countDocuments();
  if (existingUsers > 0) {
    // Name the administrators that exist. Without this, an operator who cannot
    // sign in has no way to tell a wrong password from a wrong username.
    const admins = await User.find({ role: { $in: ['SUPER_ADMIN', 'ADMIN'] } })
      .select('username role status')
      .lean();
    result.skippedReason =
      `database already has ${existingUsers} user(s); administrators: ` +
      (admins.map((a) => `${a.username} (${a.role}, ${a.status})`).join(', ') || 'none');
    return result;
  }

  // An empty database on a public host must not get a guessable administrator.
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (env.isProd && (!password || password === PLACEHOLDER_PASSWORD)) {
    result.skippedReason =
      'SEED_ADMIN_PASSWORD is not set (or is still the example value), so no administrator was created';
    logger.warn(
      'Database is empty but no administrator was created: set SEED_ADMIN_PASSWORD (and SEED_ADMIN_USERNAME) and redeploy',
    );
    return result;
  }

  const location = await Location.findOneAndUpdate(
    { name: 'Main Site' },
    { $setOnInsert: { name: 'Main Site', description: 'Starlink + MikroTik + outdoor AP' } },
    { upsert: true, new: true },
  );
  result.locationCreated = true;

  for (const pkg of PACKAGES) {
    const outcome = await PackageModel.updateOne(
      { name: pkg.name },
      { $setOnInsert: { ...pkg, currency: 'GHS' } },
      { upsert: true },
    );
    if (outcome.upsertedCount) result.packagesCreated += 1;
  }

  const username = env.seedAdminUsername.toLowerCase();
  await User.create({
    name: 'Administrator',
    username,
    passwordHash: await hashPassword(env.seedAdminPassword),
    role: 'SUPER_ADMIN',
    locationId: location._id,
    status: 'ACTIVE',
  });
  result.adminCreated = true;

  logger.info('First-run setup complete -- change this password after signing in', {
    username,
    packagesCreated: result.packagesCreated,
  });
  return result;
}
