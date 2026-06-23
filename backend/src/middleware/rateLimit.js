// Rate limiting.
// Security doc: protect against brute-force / account-takeover. Auth endpoints
// get a tight limit; the general API a looser one.
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20, // 20 auth attempts / 15 min / IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many attempts. Please try again later.' },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 200, // 200 requests / minute / IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many requests.' },
});
