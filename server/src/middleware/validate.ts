import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { ApiError } from '../utils/apiError';

type Source = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || source,
        message: issue.message,
      }));
      return next(ApiError.badRequest('Some of the values you sent are not valid.', details));
    }
    if (source === 'query') {
      // req.query is a getter in Express 5; assign onto a scratch property.
      (req as Request & { validatedQuery?: unknown }).validatedQuery = result.data;
    } else {
      req[source] = result.data as never;
    }
    next();
  };
}

export function queryOf<T>(req: Request): T {
  return ((req as Request & { validatedQuery?: unknown }).validatedQuery ?? req.query) as T;
}

/**
 * Strips `$`-prefixed and dotted keys from anything user-supplied, so a crafted
 * body can never smuggle a Mongo operator into a query.
 */
export function sanitizeMongo(req: Request, _res: Response, next: NextFunction): void {
  const scrub = (value: unknown, depth = 0): unknown => {
    if (depth > 6 || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete (value as Record<string, unknown>)[key];
      } else {
        scrub((value as Record<string, unknown>)[key], depth + 1);
      }
    }
    return value;
  };
  scrub(req.body);
  scrub(req.params);
  scrub(req.query);
  next();
}
