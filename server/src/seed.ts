import { connectDatabase, disconnectDatabase } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';
import { User, hashPassword, PackageModel, Location } from './models';

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

async function seed(): Promise<void> {
  await connectDatabase();

  const location = await Location.findOneAndUpdate(
    { name: 'Main Site' },
    { $setOnInsert: { name: 'Main Site', description: 'Starlink + MikroTik + outdoor AP' } },
    { upsert: true, new: true },
  );

  for (const pkg of PACKAGES) {
    await PackageModel.updateOne({ name: pkg.name }, { $setOnInsert: { ...pkg, currency: 'GHS' } }, { upsert: true });
  }

  const existing = await User.findOne({ username: env.seedAdminUsername.toLowerCase() });
  if (existing) {
    logger.info('Bootstrap administrator already exists, leaving it untouched', {
      username: existing.username,
    });
  } else {
    await User.create({
      name: 'Administrator',
      username: env.seedAdminUsername.toLowerCase(),
      passwordHash: await hashPassword(env.seedAdminPassword),
      role: 'SUPER_ADMIN',
      locationId: location._id,
      status: 'ACTIVE',
    });
    // Log the stored form: usernames are lowercased by the schema, so what was
    // configured and what you sign in as are not always spelled the same.
    logger.info('Bootstrap administrator created -- change this password at first login', {
      username: env.seedAdminUsername.toLowerCase(),
    });
  }

  await disconnectDatabase();
}

seed().catch((err) => {
  logger.error('Seed failed', { error: (err as Error).message });
  process.exit(1);
});
