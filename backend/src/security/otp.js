// One-Time-Password based MFA.
// Security doc: "Implement multi-factor authentication (MFA), such as a
// one-time password (OTP), to significantly reduce account takeover risks."
//
// The OTP is hashed before storage (never stored in plain text), expires, and
// is single-use with a small attempt budget. In production OTP_DELIVERY would
// be 'sms' or 'email'; in dev we surface it so the flow is testable.
import crypto from 'node:crypto';
import { db } from '../db/store.js';
import { config } from '../config.js';

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

export async function generateOtp(userId) {
  const code = ('' + Math.floor(100000 + Math.random() * 900000)); // 6 digits
  const now = Date.now();

  // Invalidate any previous unused OTPs for this user.
  const prior = await db.otps.filter((o) => o.userId === userId && !o.consumed);
  for (const o of prior) await db.otps.update(o.id, { consumed: true });

  const record = {
    id: crypto.randomUUID(),
    userId,
    codeHash: hashCode(code),
    expiresAt: now + config.otp.ttlSeconds * 1000,
    attempts: 0,
    consumed: false,
    createdAt: new Date(now).toISOString(),
  };
  await db.otps.insert(record);

  // Simulated delivery channel.
  if (config.otp.delivery === 'dev') {
    console.log(`[OTP] (dev delivery) user=${userId} code=${code}`);
  }
  // Only the dev environment returns the code to the caller.
  return { code: config.otp.delivery === 'dev' ? code : undefined, expiresIn: config.otp.ttlSeconds };
}

export async function verifyOtp(userId, code) {
  const candidates = await db.otps.filter((o) => o.userId === userId && !o.consumed);
  const otp = candidates.sort((a, b) => b.expiresAt - a.expiresAt)[0];

  if (!otp) return { ok: false, reason: 'no_otp' };
  if (Date.now() > otp.expiresAt) {
    await db.otps.update(otp.id, { consumed: true });
    return { ok: false, reason: 'expired' };
  }
  if (otp.attempts >= 5) {
    await db.otps.update(otp.id, { consumed: true });
    return { ok: false, reason: 'too_many_attempts' };
  }
  if (otp.codeHash !== hashCode(code)) {
    await db.otps.update(otp.id, { attempts: otp.attempts + 1 });
    return { ok: false, reason: 'mismatch' };
  }
  await db.otps.update(otp.id, { consumed: true });
  return { ok: true };
}
