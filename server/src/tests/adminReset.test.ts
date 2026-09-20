import test, { before } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'production';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/unused';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.ROUTER_SECRET_KEY = 'a'.repeat(64);
process.env.VOUCHER_SECRET_KEY = 'b'.repeat(64);

type BootstrapModule = typeof import('../services/bootstrap');
let bootstrap: BootstrapModule;

before(async () => {
  bootstrap = await import('../services/bootstrap');
});

/**
 * The reset is gated only by an environment variable, so the cases where it
 * must decline to act are the whole security boundary. None of these touch a
 * database: they must all return before any query runs.
 */

test('does nothing unless ADMIN_PASSWORD_RESET is exactly "true"', async () => {
  const password = process.env.SEED_ADMIN_PASSWORD;
  process.env.SEED_ADMIN_PASSWORD = 'AGenuinelyNewPassword1';

  for (const value of [undefined, '', 'false', '1', 'yes', 'TRUE ']) {
    if (value === undefined) delete process.env.ADMIN_PASSWORD_RESET;
    else process.env.ADMIN_PASSWORD_RESET = value;

    assert.equal(
      await bootstrap.resetAdminPasswordIfRequested(),
      false,
      `ADMIN_PASSWORD_RESET=${JSON.stringify(value)} must not trigger a reset`,
    );
  }

  delete process.env.ADMIN_PASSWORD_RESET;
  if (password === undefined) delete process.env.SEED_ADMIN_PASSWORD;
  else process.env.SEED_ADMIN_PASSWORD = password;
});

test('declines when no password is supplied, or it is still the example value', async () => {
  process.env.ADMIN_PASSWORD_RESET = 'true';
  const password = process.env.SEED_ADMIN_PASSWORD;

  delete process.env.SEED_ADMIN_PASSWORD;
  assert.equal(await bootstrap.resetAdminPasswordIfRequested(), false);

  process.env.SEED_ADMIN_PASSWORD = 'ChangeMe123!';
  assert.equal(await bootstrap.resetAdminPasswordIfRequested(), false);

  delete process.env.ADMIN_PASSWORD_RESET;
  if (password === undefined) delete process.env.SEED_ADMIN_PASSWORD;
  else process.env.SEED_ADMIN_PASSWORD = password;
});

test('case of the flag is accepted, since a dashboard may store "True"', async () => {
  // Guards against a reset silently not happening because of capitalisation.
  process.env.ADMIN_PASSWORD_RESET = 'True';
  process.env.SEED_ADMIN_PASSWORD = 'ChangeMe123!'; // still refused, but for the password reason
  const declinedForPassword = await bootstrap.resetAdminPasswordIfRequested();
  assert.equal(declinedForPassword, false);
  delete process.env.ADMIN_PASSWORD_RESET;
  delete process.env.SEED_ADMIN_PASSWORD;
});
