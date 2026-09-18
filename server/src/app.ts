import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';
import api from './routes';
import { apiLimiter } from './middleware/rateLimit';
import { sanitizeMongo } from './middleware/validate';
import { errorHandler, notFoundHandler } from './middleware/error';
import { env } from './config/env';

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin || env.corsOrigin.includes(origin)) return cb(null, true);
        cb(new Error('Origin not allowed'));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(sanitizeMongo);

  /** Liveness probe: reports database state without requiring a session. */
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

  app.use('/api', apiLimiter, api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
