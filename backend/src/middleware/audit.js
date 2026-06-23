// Audit trail.
// Security doc: "Focus 9 supports robust security features like audit trails,
// activity logs..." We mirror that on the middleware side: every meaningful
// state change is recorded with actor, action, target and metadata.
import crypto from 'node:crypto';
import { db } from '../db/store.js';

export async function audit(actor, action, target, meta = {}) {
  const entry = {
    id: crypto.randomUUID(),
    actorId: actor?.id || 'system',
    actorName: actor?.name || 'system',
    actorRole: actor?.role || 'system',
    action,
    target,
    meta,
    at: new Date().toISOString(),
  };
  await db.audit.insert(entry);
  return entry;
}
