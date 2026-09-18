import express, { type Request } from 'express';
import helmet from 'helmet';
import cors, { type CorsOptionsDelegate } from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import api from './routes';
import { apiLimiter } from './middleware/rateLimit';
import { sanitizeMongo } from './middleware/validate';
import { errorHandler, notFoundHandler } from './middleware/error';
import { env } from './config/env';

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(sanitizeMongo);

  /**
   * Liveness: the process is up. This is what a platform health check should
   * point at -- a brief database blip should not make the host kill and
   * redeploy a service that is otherwise fine.
   */
  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  /** Readiness: reports whether the database is actually usable right now. */
  app.get('/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({
      status: dbUp ? 'ok' : 'degraded',
      database: dbUp ? 'connected' : 'disconnected',
      // Hotspot authentication runs on MikroTik and is unaffected by this service.
      hotspotAuthentication: 'handled by MikroTik, independent of this service',
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  // CORS applies only to the API. Static assets are same-origin, and Vite marks
  // its bundles `crossorigin`, so the browser sends an Origin header for them
  // too -- running them through a CORS check only creates failures.
  app.use('/api', cors(corsDelegate), apiLimiter, api);
  // An unmatched /api path must stay JSON, never fall through to the SPA shell.
  app.use('/api', notFoundHandler);

  mountClient(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Same-origin callers and non-browser clients need no CORS headers at all.
 * A cross-origin caller is allowed only if CORS_ORIGIN lists it. An origin that
 * is not allowed is declined rather than thrown on: throwing turns a routine
 * CORS decision into a 500 with a stack trace, when the correct outcome is to
 * omit the headers and let the browser enforce it.
 */
const corsDelegate: CorsOptionsDelegate<Request> = (req, callback) => {
  const origin = req.headers.origin;
  if (!origin) return callback(null, { origin: false });

  let sameOrigin = false;
  try {
    sameOrigin = new URL(origin).host === req.headers.host;
  } catch {
    sameOrigin = false; // malformed Origin header
  }

  if (sameOrigin || env.corsOrigin.includes(origin)) {
    return callback(null, { origin, credentials: true });
  }
  callback(null, { origin: false });
};

/**
 * Serves the built frontend when it is present, so one deployment can host both
 * the API and the interface with no cross-origin request between them. When the
 * client has not been built (API-only deployments, tests) this is a no-op.
 */
function mountClient(app: express.Express): void {
  const indexFile = path.join(env.clientDistPath, 'index.html');
  if (!fs.existsSync(indexFile)) return;

  // Vite fingerprints asset filenames, so they cache indefinitely; index.html
  // must not, or a deploy would leave browsers on the previous bundle.
  app.use(express.static(env.clientDistPath, { index: false, maxAge: '1y', etag: true }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(indexFile);
  });
}
