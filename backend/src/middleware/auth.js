// Authentication + Role-Based Access Control (RBAC).
// Security doc: "practice least-privilege access, ensuring users and systems
// only have the permissions they need."
import { verifyAccessToken } from '../security/tokens.js';

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'missing_token', message: 'Authorization Bearer token required.' });
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, name: payload.name, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token', message: 'Token is invalid or expired.' });
  }
}

/** Restrict a route to one or more roles. */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'forbidden',
        message: `Requires role: ${roles.join(' or ')}. You are '${req.user.role}'.`,
      });
    }
    next();
  };
}
