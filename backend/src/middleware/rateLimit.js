// Rate limiting.
// Security doc: protect against brute-force / account-takeover. Auth endpoints
// get a tight limit; the general API a looser one.
// Set RATE_LIMIT_DISABLED=1 in .env for unlimited attempts (dev/demos only).
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

function passthrough(req, res, next) {
  next();
}

function createLimiter(options) {
  if (config.rateLimit.disabled) return passthrough;
  return rateLimit(options);
}

export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20, // 20 auth attempts / 15 min / IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many attempts. Please try again later.' },
});

export const apiLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 200, // 200 requests / minute / IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many requests.' },
});
