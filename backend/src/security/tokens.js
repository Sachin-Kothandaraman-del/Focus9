// JWT issuance & verification.
// Security doc: "token-based authentication (like JWT)". Short-lived access
// token + longer-lived refresh token. Secrets come from env only.
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function issueAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, email: user.email },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessTtl, issuer: 'ee-focus9-mw' }
  );
}

export function issueRefreshToken(user, tokenId) {
  return jwt.sign({ sub: user.id, jti: tokenId }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTtl,
    issuer: 'ee-focus9-mw',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret, { issuer: 'ee-focus9-mw' });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshSecret, { issuer: 'ee-focus9-mw' });
}
