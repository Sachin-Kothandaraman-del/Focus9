import { Router } from 'express';
import { db } from '../db/store.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { focus9 } from '../erp/focus9Connector.js';
import { prosafe } from '../erp/prosafeConnector.js';

const router = Router();

// ERP/connector health & mode (admin visibility).
router.get('/erp/status', authenticate, authorize('admin', 'storekeeper'), async (req, res) => {
  const queue = await db.erpQueue.all();
  res.json({
    focus9: { mode: focus9.mode },
    prosafe: { mode: prosafe.mode },
    queue: {
      total: queue.length,
      done: queue.filter((q) => q.status === 'done').length,
      failed: queue.filter((q) => q.status === 'failed').length,
      pending: queue.filter((q) => ['pending', 'retrying'].includes(q.status)).length,
    },
  });
});

// Durable ERP call queue (traceability for the "queue + retry" requirement).
router.get('/erp/queue', authenticate, authorize('admin', 'storekeeper'), async (req, res) => {
  const queue = await db.erpQueue.all();
  res.json({ queue: queue.slice(-100).reverse() });
});

// Audit trail.
router.get('/audit', authenticate, authorize('admin'), async (req, res) => {
  const rows = await db.audit.all();
  res.json({ audit: rows.slice(-200).reverse() });
});

// Deliveries / invoices / returns listings.
router.get('/deliveries', authenticate, authorize('admin', 'storekeeper'), async (req, res) => {
  res.json({ deliveries: (await db.deliveries.all()).reverse() });
});
router.get('/invoices', authenticate, authorize('admin', 'storekeeper'), async (req, res) => {
  res.json({ invoices: (await db.invoices.all()).reverse() });
});
router.get('/returns', authenticate, authorize('admin', 'storekeeper'), async (req, res) => {
  res.json({ returns: (await db.returns.all()).reverse() });
});

export default router;
