import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server/src/app';
import { ensureDatabase } from '../server/src/config/db';

/**
 * Vercel serverless entrypoint.
 *
 * A catch-all filename is used so the function receives the original request
 * path (/api/vouchers, /api/auth/login, ...) and the Express router matches it
 * exactly as it would on a long-running server.
 *
 * The app is built once per warm instance; only the database handshake is
 * awaited per request, and that is itself cached.
 */
const app = createApp();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await ensureDatabase();
  } catch {
    // A database that is unreachable must not surface as an opaque 500.
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message:
            'The database is unreachable right now. Hotspot access is unaffected; please retry shortly.',
        },
      }),
    );
    return;
  }

  (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}
