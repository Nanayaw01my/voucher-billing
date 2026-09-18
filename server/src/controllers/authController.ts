import { z } from 'zod';
import type { Request, Response } from 'express';
import { User } from '../models';
import { signToken, actorFrom } from '../middleware/auth';
import { ApiError } from '../utils/apiError';
import { recordAudit } from '../services/auditService';

export const loginSchema = z.object({
  username: z.string().min(1, 'Enter your username').toLowerCase().trim(),
  password: z.string().min(1, 'Enter your password'),
});

export async function login(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body as z.infer<typeof loginSchema>;
  const user = await User.findOne({ username }).select('+passwordHash');

  // Same message either way, so the form cannot be used to enumerate accounts.
  const invalid = ApiError.unauthorized('That username and password do not match.');
  if (!user || !(await user.verifyPassword(password))) {
    await recordAudit({ username, ...(req.ip ? { ipAddress: req.ip } : {}) }, 'LOGIN_FAILED', 'User', undefined, { username });
    throw invalid;
  }
  if (user.status !== 'ACTIVE') throw ApiError.forbidden('This account has been disabled. Ask an administrator to re-enable it.');

  user.lastLoginAt = new Date();
  await user.save();

  const profile = {
    id: String(user._id),
    username: user.username,
    name: user.name,
    role: user.role,
    ...(user.locationId ? { locationId: String(user.locationId) } : {}),
  };
  await recordAudit({ id: user._id, username: user.username, ...(req.ip ? { ipAddress: req.ip } : {}) }, 'LOGIN', 'User', String(user._id));

  res.json({ token: signToken(profile), user: profile });
}

export async function me(req: Request, res: Response): Promise<void> {
  res.json({ user: req.user });
}

export async function logout(req: Request, res: Response): Promise<void> {
  // JWTs are stateless: the client discards the token. We record the intent.
  await recordAudit(actorFrom(req), 'LOGOUT', 'User', req.user?.id);
  res.json({ ok: true });
}
