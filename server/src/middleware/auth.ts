import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';
import { User, type Role } from '../models';

export interface AuthenticatedUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  locationId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function signToken(user: AuthenticatedUser): string {
  return jwt.sign(user, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized();

    let payload: AuthenticatedUser;
    try {
      payload = jwt.verify(header.slice(7), env.jwtSecret) as AuthenticatedUser;
    } catch {
      throw ApiError.unauthorized('Your session has expired. Please sign in again.');
    }

    // Re-check the account each request so a disabled seller loses access
    // immediately rather than when their token happens to expire.
    const user = await User.findById(payload.id);
    if (!user || user.status !== 'ACTIVE') throw ApiError.unauthorized('This account is no longer active.');

    req.user = {
      id: String(user._id),
      username: user.username,
      name: user.name,
      role: user.role,
      ...(user.locationId ? { locationId: String(user.locationId) } : {}),
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };
}

export const requireAdmin = authorize('SUPER_ADMIN', 'ADMIN');
export const requireSuperAdmin = authorize('SUPER_ADMIN');

export function actorFrom(req: Request) {
  return {
    ...(req.user ? { id: req.user.id, username: req.user.username } : {}),
    ...(req.ip ? { ipAddress: req.ip } : {}),
  };
}
