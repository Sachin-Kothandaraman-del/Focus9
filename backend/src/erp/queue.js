// ERP call buffer with retry/backoff.
//
// System Requirement doc: the middleware should "queue orders and retry failed
// requests, preventing data loss if the ERP is temporarily slow."
//
// Every ERP operation is recorded as a durable queue entry (visible to admins
// for traceability) and executed through withRetry so transient ERP failures
// are absorbed rather than lost.
import crypto from 'node:crypto';
import { db } from '../db/store.js';

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 75;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run an ERP operation with a durable queue record and exponential backoff.
 * @param {string} type  e.g. 'createSalesOrder'
 * @param {object} payload  the data sent to the ERP (stored for traceability)
 * @param {() => Promise<any>} fn  the actual connector call
 */
export async function runWithQueue(type, payload, fn) {
  const entry = db.erpQueue.insert({
    id: crypto.randomUUID(),
    type,
    payload,
    status: 'pending',
    attempts: 0,
    result: null,
    lastError: null,
    createdAt: new Date().toISOString(),
  });

  let attempt = 0;
  let lastErr;
  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    try {
      const result = await fn();
      db.erpQueue.update(entry.id, { status: 'done', attempts: attempt, result });
      return result;
    } catch (err) {
      lastErr = err;
      const transient = err.transient !== false; // mock errors treated as transient
      db.erpQueue.update(entry.id, {
        status: 'retrying',
        attempts: attempt,
        lastError: err.message,
      });
      if (!transient || attempt >= MAX_ATTEMPTS) break;
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  db.erpQueue.update(entry.id, { status: 'failed', lastError: lastErr?.message });
  const e = new Error(`ERP operation '${type}' failed after ${attempt} attempts: ${lastErr?.message}`);
  e.status = 502;
  e.code = 'erp_unavailable';
  throw e;
}
