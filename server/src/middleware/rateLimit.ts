import rateLimit from 'express-rate-limit';

const message = { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again shortly.' } };

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});

/** Login is the one endpoint worth throttling hard. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});

/** Generation and import are expensive; keep them to a human pace. */
export const heavyLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});
