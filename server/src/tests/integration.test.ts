import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';

// The env module reads process.env at import time, so configure it first.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/placeholder';
process.env.JWT_SECRET = 'test-secret-value-for-integration-tests';
process.env.ROUTER_SECRET_KEY = 'a'.repeat(64);
process.env.VOUCHER_SECRET_KEY = 'b'.repeat(64);
process.env.SYNC_ENABLED = 'false';

let mongod: MongoMemoryServer | null = null;
let token: string;
let app: import('express').Express;
let request: typeof import('./helpers').httpRequest;

/**
 * Set when no MongoDB is reachable. These tests then skip instead of failing,
 * because a sandbox without a database says nothing about the code.
 * Point MONGODB_TEST_URI at a running mongod to run them against a real server.
 */
let unavailable: string | null = null;

/** Every test calls this first; returns true when the suite should stop early. */
function skipIfNoDatabase(t: { skip: (reason?: string) => void }): boolean {
  if (!unavailable) return false;
  t.skip(`no MongoDB available: ${unavailable}`);
  return true;
}

before(async () => {
  try {
    if (process.env.MONGODB_TEST_URI) {
      process.env.MONGODB_URI = process.env.MONGODB_TEST_URI;
    } else {
      mongod = await MongoMemoryServer.create();
      process.env.MONGODB_URI = mongod.getUri('voucher_test');
    }

    const mongoose = await import('mongoose');
    await mongoose.default.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  } catch (err) {
    unavailable = err instanceof Error ? err.message.split('\n')[0] ?? 'unknown error' : 'unknown error';
    return;
  }

  const { createApp } = await import('../app');
  app = createApp();
  ({ httpRequest: request } = await import('./helpers'));

  const { User, hashPassword } = await import('../models');
  await User.create({
    name: 'Test Admin',
    username: 'admin',
    passwordHash: await hashPassword('SuperSecret123'),
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
  });
});

after(async () => {
  if (unavailable) return;
  const mongoose = await import('mongoose');
  await mongoose.default.disconnect();
  await mongod?.stop();
});

test('rejects a bad password without revealing whether the account exists', async (t) => {
  if (skipIfNoDatabase(t)) return;
  const wrongPassword = await request(app, 'POST', '/api/auth/login', { body: { username: 'admin', password: 'nope' } });
  const noSuchUser = await request(app, 'POST', '/api/auth/login', { body: { username: 'ghost', password: 'nope' } });
  assert.equal(wrongPassword.status, 401);
  assert.equal(noSuchUser.status, 401);
  assert.equal(wrongPassword.body.error.message, noSuchUser.body.error.message);
});

test('signs in and returns a usable token', async (t) => {
  if (skipIfNoDatabase(t)) return;
  const response = await request(app, 'POST', '/api/auth/login', {
    body: { username: 'admin', password: 'SuperSecret123' },
  });
  assert.equal(response.status, 200);
  assert.ok(response.body.token);
  token = response.body.token;
});

test('refuses unauthenticated access to the voucher list', async (t) => {
  if (skipIfNoDatabase(t)) return;
  const response = await request(app, 'GET', '/api/vouchers');
  assert.equal(response.status, 401);
});

test('generates vouchers with unique codes and paginates them', async (t) => {
  if (skipIfNoDatabase(t)) return;
  const pkg = await request(app, 'POST', '/api/packages', {
    token,
    body: { name: '24 Hours', durationSeconds: 86400, price: 10, mikrotikProfile: 'VOUCHER-24H-1CODE' },
  });
  assert.equal(pkg.status, 201);

  const generated = await request(app, 'POST', '/api/vouchers/generate', {
    token,
    body: { packageId: pkg.body._id, quantity: 250, codeLength: 8, passwordMode: 'SAME' },
  });
  assert.equal(generated.status, 201);
  assert.equal(generated.body.generated, 250);

  const list = await request(app, 'GET', '/api/vouchers?limit=25', { token });
  assert.equal(list.body.data.length, 25, 'server-side pagination must cap the page');
  assert.equal(list.body.pagination.total, 250);

  const { Voucher } = await import('../models');
  const distinct = await Voucher.distinct('code');
  assert.equal(distinct.length, 250, 'every generated code must be unique');
});

test('never returns a voucher password in a list response', async (t) => {
  if (skipIfNoDatabase(t)) return;
  const list = await request(app, 'GET', '/api/vouchers?limit=5', { token });
  const serialised = JSON.stringify(list.body);
  assert.ok(!serialised.includes('encryptedPassword'));
  assert.ok(!serialised.includes('password'));
});

test('import stages a preview without writing anything, then imports on confirmation', async (t) => {
  if (skipIfNoDatabase(t)) return;
  const { Voucher } = await import('../models');
  const before = await Voucher.countDocuments();

  const file = [
    '/ip hotspot user add name=AAAA1111 password=AAAA1111 profile="VOUCHER-24H-1CODE" limit-uptime=24h',
    '/ip hotspot user add name=BBBB2222 password=BBBB2222 profile="VOUCHER-24H-1CODE" limit-uptime=24h',
    '/ip hotspot user add name=AAAA1111 password=AAAA1111 profile="VOUCHER-24H-1CODE" limit-uptime=24h',
    '/system reboot name=X',
    'total nonsense',
  ].join('\n');

  const preview = await request(app, 'POST', '/api/vouchers/import/preview', {
    token,
    file: { field: 'file', filename: 'vouchers.txt', content: file },
  });

  assert.equal(preview.status, 200);
  assert.equal(preview.body.totalRows, 5);
  assert.equal(preview.body.validCount, 2);
  assert.equal(preview.body.duplicateCount, 1);
  assert.equal(preview.body.invalidCount, 2);
  assert.equal(await Voucher.countDocuments(), before, 'preview must not write any voucher');

  const confirmed = await request(app, 'POST', `/api/vouchers/import/${preview.body.batchId}/confirm`, { token });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.imported, 2);
  assert.equal(await Voucher.countDocuments(), before + 2);

  // Confirming twice must not import twice.
  const again = await request(app, 'POST', `/api/vouchers/import/${preview.body.batchId}/confirm`, { token });
  assert.equal(again.status, 409);
});

test('a voucher already in the database is reported as a duplicate, not imported again', async (t) => {
  if (skipIfNoDatabase(t)) return;
  const preview = await request(app, 'POST', '/api/vouchers/import/preview', {
    token,
    file: {
      field: 'file', filename: 'again.txt',
      content: '/ip hotspot user add name=AAAA1111 password=AAAA1111 profile="VOUCHER-24H-1CODE" limit-uptime=24h',
    },
  });
  assert.equal(preview.body.validCount, 0);
  assert.equal(preview.body.duplicateCount, 1);
  assert.match(preview.body.rejections[0].reason, /already exists/);
});

test('strips Mongo operators from a request body', async (t) => {
  if (skipIfNoDatabase(t)) return;
  const response = await request(app, 'GET', '/api/vouchers?status=AVAILABLE', { token });
  assert.equal(response.status, 200);
  // A crafted operator in a filter must not become a query.
  const injected = await request(app, 'GET', '/api/vouchers?status[$ne]=NOTHING', { token });
  assert.equal(injected.status, 400, 'an operator object must fail validation rather than reach Mongo');
});

test('a seller cannot reach admin-only routes', async (t) => {
  if (skipIfNoDatabase(t)) return;
  const created = await request(app, 'POST', '/api/sellers', {
    token,
    body: { name: 'Kofi', username: 'kofi', password: 'SellerPass123', role: 'SELLER' },
  });
  assert.equal(created.status, 201);

  const login = await request(app, 'POST', '/api/auth/login', { body: { username: 'kofi', password: 'SellerPass123' } });
  const sellerToken = login.body.token;

  assert.equal((await request(app, 'GET', '/api/routers', { token: sellerToken })).status, 403);
  assert.equal((await request(app, 'GET', '/api/audit-logs', { token: sellerToken })).status, 403);
  assert.equal(
    (await request(app, 'POST', '/api/vouchers/generate', { token: sellerToken, body: { packageId: '000000000000000000000000', quantity: 1 } })).status,
    403,
  );
  // A seller may still list vouchers; they just see only their own.
  assert.equal((await request(app, 'GET', '/api/vouchers', { token: sellerToken })).status, 200);
});

test('recording a sale marks the voucher sold and blocks a second sale', async (t) => {
  if (skipIfNoDatabase(t)) return;
  const list = await request(app, 'GET', '/api/vouchers?status=AVAILABLE&limit=1', { token });
  const voucherId = list.body.data[0]._id;

  const sale = await request(app, 'POST', '/api/sales', { token, body: { voucherId, paymentMethod: 'CASH' } });
  assert.equal(sale.status, 201);
  assert.equal(sale.body.price, 10);

  const duplicate = await request(app, 'POST', '/api/sales', { token, body: { voucherId, paymentMethod: 'CASH' } });
  assert.equal(duplicate.status, 409);
});

test('the dashboard reports null lifetime usage until a router has actually been synced', async (t) => {
  if (skipIfNoDatabase(t)) return;
  const response = await request(app, 'GET', '/api/dashboard', { token });
  assert.equal(response.status, 200);
  assert.equal(response.body.bandwidth.lifetimeBytes, null);
  assert.equal(response.body.online.count, 0);
  assert.equal(response.body.sales.today.count, 1);
});

test('audit entries are written for the actions that matter', async (t) => {
  if (skipIfNoDatabase(t)) return;
  const response = await request(app, 'GET', '/api/audit-logs?limit=100', { token });
  const actions = new Set(response.body.data.map((row: { action: string }) => row.action));
  for (const expected of ['LOGIN', 'LOGIN_FAILED', 'VOUCHER_GENERATED', 'VOUCHER_IMPORTED', 'SALE_CREATED', 'SELLER_CREATED']) {
    assert.ok(actions.has(expected), `expected an audit entry for ${expected}`);
  }
  // No audit row may carry a password.
  assert.ok(!JSON.stringify(response.body).toLowerCase().includes('superSecret123'.toLowerCase()));
});

test('an unknown route returns a readable message, not a stack trace', async (t) => {
  if (skipIfNoDatabase(t)) return;
  const response = await request(app, 'GET', '/api/nope', { token });
  assert.equal(response.status, 404);
  assert.match(response.body.error.message, /No API route/);
  assert.ok(!JSON.stringify(response.body).includes('at Object'));
});
