// Password hashing + strong-password policy.
// Security doc: "Enforce strong password policies", "Never store sensitive
// data in plain text". We use bcrypt (pure-JS bcryptjs, no native build) with a
// work factor of 12.
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

// Policy: >= 10 chars, upper, lower, digit, symbol.
const POLICY = [
  { test: (p) => p.length >= 10, msg: 'at least 10 characters' },
  { test: (p) => /[A-Z]/.test(p), msg: 'an uppercase letter' },
  { test: (p) => /[a-z]/.test(p), msg: 'a lowercase letter' },
  { test: (p) => /[0-9]/.test(p), msg: 'a number' },
  { test: (p) => /[^A-Za-z0-9]/.test(p), msg: 'a symbol' },
];

export function validatePasswordStrength(password) {
  const failures = POLICY.filter((rule) => !rule.test(password || '')).map((r) => r.msg);
  return { ok: failures.length === 0, failures };
}

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}
