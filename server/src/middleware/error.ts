import type { NextFunction, Request, Response } from 'express';
import { MongoServerError } from 'mongodb';
import mongoose from 'mongoose';
import { ApiError } from '../utils/apiError';
import { RouterOsApiError } from '../services/mikrotik/client';
import { logger } from '../config/logger';
import { env } from '../config/env';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`No API route matches ${req.method} ${req.path}.`));
}

/** Turns every failure into a human-readable message. Stack traces stay server-side. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let status = 500;
  let message = 'Something went wrong on our side. Please try again.';
  let code = 'INTERNAL_ERROR';
  let details: unknown;

  if (err instanceof ApiError) {
    ({ status, message, code, details } = { status: err.status, message: err.message, code: err.code, details: err.details });
  } else if (err instanceof RouterOsApiError) {
    status = 503;
    code = `ROUTER_${err.category}`;
    message =
      err.category === 'AUTH' ? 'The router rejected our credentials. Check the router username and password.'
      : err.category === 'TIMEOUT' ? 'The router did not answer in time. It may be offline or unreachable over Starlink.'
      : `The router refused the request: ${err.message}`;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Some of the values you sent are not valid.';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    code = 'BAD_IDENTIFIER';
    message = 'That identifier is not in a valid format.';
  } else if (err instanceof MongoServerError && err.code === 11000) {
    status = 409;
    code = 'DUPLICATE';
    const field = Object.keys(err.keyPattern ?? {})[0] ?? 'value';
    message = `That ${field} is already in use.`;
  } else if (err instanceof mongoose.Error.MongooseServerSelectionError) {
    status = 503;
    code = 'DATABASE_UNAVAILABLE';
    message = 'The database is unreachable right now. Hotspot access is unaffected; please retry shortly.';
  }

  if (status >= 500) {
    logger.error('Unhandled request failure', {
      path: req.path, method: req.method, error: (err as Error)?.message, stack: (err as Error)?.stack,
    });
  }

  res.status(status).json({
    error: { code, message, ...(details ? { details } : {}) },
    ...(env.isProd ? {} : { path: req.path }),
  });
}
