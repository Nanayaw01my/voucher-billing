import test, { before } from 'node:test';
import assert from 'node:assert/strict';

// `import` statements are hoisted above assignments, so the environment is set
// here and the controller is loaded dynamically once it is in place.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.CRON_SECRET = 'a-correct-horse-battery-staple';

type CronModule = typeof import('../controllers/cronController');
type EnvModule = typeof import('../config/env');

let cron: CronModule;
let envModule: EnvModule;

before(async () => {
  cron = await import('../controllers/cronController');
  envModule = await import('../config/env');
});

function fakeRequest(authorization?: string) {
  return { headers: authorization ? { authorization } : {} } as never;
}
const fakeResponse = { json: () => undefined } as never;

async function expectStatus(authorization: string | undefined, status: number): Promise<void> {
  await assert.rejects(
    () => cron.runSync(fakeRequest(authorization), fakeResponse),
    (err: unknown) => {
      const apiError = err as { status?: number; message?: string };
      assert.equal(apiError.status, status, `expected ${status}, got ${apiError.status}: ${apiError.message}`);
      return true;
    },
  );
}

/**
 * The scheduled-sync route is reachable without a session, so its shared secret
 * is the only thing guarding it. None of these may ever become a success.
 */

test('the configured secret is actually loaded, so these tests are meaningful', () => {
  assert.equal(envModule.env.cronSecret, 'a-correct-horse-battery-staple');
});

test('a request with no Authorization header is rejected', async () => {
  await expectStatus(undefined, 401);
});

test('a wrong secret of exactly the same length is rejected', async () => {
  const wrong = 'b-correct-horse-battery-staple';
  assert.equal(wrong.length, envModule.env.cronSecret.length, 'test needs an equal-length value');
  await expectStatus(`Bearer ${wrong}`, 401);
});

test('a secret of a different length is rejected, not thrown on', async () => {
  // timingSafeEqual throws on a length mismatch, so the length guard must run first.
  await expectStatus('Bearer short', 401);
  await expectStatus(`Bearer ${'z'.repeat(500)}`, 401);
});

test('a non-Bearer scheme is rejected', async () => {
  await expectStatus(`Basic ${envModule.env.cronSecret}`, 401);
  await expectStatus(envModule.env.cronSecret, 401);
});

test('the route refuses to run when no secret is configured', async () => {
  const configured = envModule.env.cronSecret;
  try {
    (envModule.env as { cronSecret: string }).cronSecret = '';
    // Even presenting the previously valid secret must not work.
    await expectStatus(`Bearer ${configured}`, 403);
  } finally {
    (envModule.env as { cronSecret: string }).cronSecret = configured;
  }
});
