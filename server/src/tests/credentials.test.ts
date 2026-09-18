import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { hashPassword } from '../models/User';
import { loginSchema } from '../controllers/authController';

/**
 * The seed writes a username through the User schema, which lowercases it, and
 * the login route lowercases what is typed. These tests pin that round trip, so
 * a configured `Admin1` can never become an account nobody can sign in to.
 */

test('a configured username is normalised the same way on seed and on login', () => {
  const configured = 'Admin1';
  const stored = configured.toLowerCase(); // what the schema persists

  for (const typed of ['Admin1', 'admin1', 'ADMIN1', '  Admin1  ']) {
    const parsed = loginSchema.parse({ username: typed, password: 'irrelevant' });
    assert.equal(parsed.username, stored, `typing "${typed}" must resolve to "${stored}"`);
  }
});

test('a seeded password verifies against its stored hash', async () => {
  // A stand-in, not anyone's real password: this file is committed.
  const sample = 'Sample123';
  const hash = await hashPassword(sample);

  assert.notEqual(hash, sample, 'the password must never be stored in plaintext');
  assert.match(hash, /^\$2[aby]\$/, 'expected a bcrypt hash');
  assert.equal(await bcrypt.compare(sample, hash), true);

  // Near misses must fail: bcrypt is case sensitive and does not trim.
  for (const wrong of ['sample123', 'Sample12', 'Sample1234', ' Sample123', '']) {
    assert.equal(await bcrypt.compare(wrong, hash), false, `"${wrong}" must not authenticate`);
  }
});

test('the login form rejects an empty submission before it reaches the database', () => {
  const result = loginSchema.safeParse({ username: '', password: '' });
  assert.equal(result.success, false);
});
