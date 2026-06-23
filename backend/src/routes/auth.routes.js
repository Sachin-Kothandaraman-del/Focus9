import { Router } from 'express';
import crypto from 'node:crypto';
import { body } from 'express-validator';
import { db } from '../db/store.js';
import { handleValidation } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { audit } from '../middleware/audit.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../security/password.js';
import { issueAccessToken, issueRefreshToken, verifyRefreshToken } from '../security/tokens.js';
import { generateOtp, verifyOtp } from '../security/otp.js';

const router = Router();
const VALID_ROLES = ['requester', 'storekeeper', 'approver', 'admin'];

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, employeeId: u.employeeId || null };
}

// --- Register ---------------------------------------------------------------
router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name is required.'),
    body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
    body('password').isString(),
    body('role').optional().isIn(VALID_ROLES),
  ],
  handleValidation,
  async (req, res) => {
    const { name, email, password, role } = req.body;
    const strength = validatePasswordStrength(password);
    if (!strength.ok) {
      return res.status(422).json({
        error: 'weak_password',
        message: `Password must contain ${strength.failures.join(', ')}.`,
      });
    }
    if (await db.users.find((u) => u.email === email)) {
      return res.status(409).json({ error: 'email_taken', message: 'An account with that email already exists.' });
    }
    const user = await db.users.insert({
      id: crypto.randomUUID(),
      name,
      email,
      role: VALID_ROLES.includes(role) ? role : 'requester',
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString(),
    });
    await audit(publicUser(user), 'auth.register', user.id, {});
    res.status(201).json({ user: publicUser(user) });
  }
);

// --- Login step 1: password -> issue OTP (MFA) ------------------------------
router.post(
  '/login',
  authLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').isString()],
  handleValidation,
  async (req, res) => {
    const { email, password } = req.body;
    const user = await db.users.find((u) => u.email === email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email or password.' });
    }
    const otp = await generateOtp(user.id);
    await audit(publicUser(user), 'auth.login.otp_issued', user.id, {});
    res.json({
      mfaRequired: true,
      userId: user.id,
      message: 'Password accepted. Enter the one-time code to continue.',
      devOtp: otp.code, // dev-only; undefined when OTP_DELIVERY != dev
      otpExpiresIn: otp.expiresIn,
    });
  }
);

// --- Login step 2: OTP -> issue JWTs ----------------------------------------
router.post(
  '/verify-otp',
  authLimiter,
  [body('userId').isString(), body('code').isString().isLength({ min: 6, max: 6 })],
  handleValidation,
  async (req, res) => {
    const { userId, code } = req.body;
    const user = await db.users.getById(userId);
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });

    const result = await verifyOtp(userId, code);
    if (!result.ok) {
      await audit(publicUser(user), 'auth.login.otp_failed', user.id, { reason: result.reason });
      return res.status(401).json({ error: 'otp_invalid', reason: result.reason, message: 'Invalid or expired code.' });
    }

    const tokenId = crypto.randomUUID();
    const refresh = issueRefreshToken(user, tokenId);
    await db.refreshTokens.insert({ id: tokenId, userId: user.id, createdAt: new Date().toISOString(), revoked: false });
    await audit(publicUser(user), 'auth.login.success', user.id, {});

    res.json({ accessToken: issueAccessToken(user), refreshToken: refresh, user: publicUser(user) });
  }
);

// --- Refresh access token ---------------------------------------------------
router.post('/refresh', [body('refreshToken').isString()], handleValidation, async (req, res) => {
  try {
    const payload = verifyRefreshToken(req.body.refreshToken);
    const stored = await db.refreshTokens.getById(payload.jti);
    if (!stored || stored.revoked) return res.status(401).json({ error: 'invalid_refresh' });
    const user = await db.users.getById(payload.sub);
    if (!user) return res.status(401).json({ error: 'invalid_refresh' });
    res.json({ accessToken: issueAccessToken(user) });
  } catch {
    res.status(401).json({ error: 'invalid_refresh', message: 'Refresh token invalid or expired.' });
  }
});

// --- Logout (revoke refresh token) ------------------------------------------
router.post('/logout', authenticate, [body('refreshToken').optional().isString()], async (req, res) => {
  if (req.body.refreshToken) {
    try {
      const payload = verifyRefreshToken(req.body.refreshToken);
      if (await db.refreshTokens.getById(payload.jti)) await db.refreshTokens.update(payload.jti, { revoked: true });
    } catch {
      /* ignore */
    }
  }
  res.json({ ok: true });
});

// --- Current user -----------------------------------------------------------
router.get('/me', authenticate, async (req, res) => {
  const user = await db.users.getById(req.user.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({ user: publicUser(user) });
});

// --- Delete own account -----------------------------------------------------
// Removes the user and their auth artifacts (refresh tokens + OTPs). Business
// records they raised (requests, deliveries, invoices) are intentionally kept
// for audit/ERP integrity.
router.delete('/account', authenticate, async (req, res) => {
  const userId = req.user.id;
  const user = await db.users.getById(userId);
  if (!user) return res.status(404).json({ error: 'not_found', message: 'Account not found.' });

  for (const t of await db.refreshTokens.filter((t) => t.userId === userId)) await db.refreshTokens.delete(t.id);
  for (const o of await db.otps.filter((o) => o.userId === userId)) await db.otps.delete(o.id);
  await db.users.delete(userId);

  await audit(publicUser(user), 'auth.account.delete', userId, { email: user.email });
  res.json({ ok: true, message: 'Your account has been deleted.' });
});

export default router;
