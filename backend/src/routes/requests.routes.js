import { Router } from 'express';
import crypto from 'node:crypto';
import { body } from 'express-validator';
import { db } from '../db/store.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { handleValidation } from '../middleware/validate.js';
import { audit } from '../middleware/audit.js';
import { ApiError } from '../middleware/errorHandler.js';
import { STATUS, NEXT_STEP, canTransition, pushHistory } from '../domain/workflow.js';
import * as svc from '../domain/distributionService.js';

const router = Router();

async function loadRequest(req, res, next) {
  try {
    const r = await db.requests.getById(req.params.id);
    if (!r) return res.status(404).json({ error: 'not_found', message: 'Request not found.' });
    req.materialRequest = r;
    next();
  } catch (e) {
    next(e);
  }
}

// Requesters see their own; stores/approver/admin see all.
router.get('/', authenticate, async (req, res) => {
  let rows = await db.requests.all();
  if (req.user.role === 'requester') rows = rows.filter((r) => r.createdBy.id === req.user.id);
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ requests: rows });
});

router.get('/:id', authenticate, loadRequest, async (req, res) => {
  const r = req.materialRequest;
  if (req.user.role === 'requester' && r.createdBy.id !== req.user.id) {
    return res.status(403).json({ error: 'forbidden' });
  }
  res.json({
    request: r,
    deliveries: await db.deliveries.filter((d) => d.requestId === r.id),
    returns: await db.returns.filter((d) => d.requestId === r.id),
    invoices: await db.invoices.filter((d) => d.requestId === r.id),
  });
});

// --- Create Material Request (draft) ----------------------------------------
router.post(
  '/',
  authenticate,
  authorize('requester', 'storekeeper', 'admin'),
  [
    body('lines').isArray({ min: 1 }).withMessage('At least one line item is required.'),
    body('lines.*.materialId').isString(),
    body('lines.*.qty').isInt({ min: 1 }),
    body('department').optional().isString(),
    body('notes').optional().isString(),
  ],
  handleValidation,
  async (req, res) => {
    const lines = [];
    for (const l of req.body.lines) {
      const mat = await db.materials.getById(l.materialId);
      if (!mat) throw new ApiError(422, 'invalid_material', `Unknown material: ${l.materialId}`);
      lines.push({
        materialId: mat.id,
        materialCode: mat.code,
        materialName: mat.name,
        qty: Number(l.qty),
        unitPrice: mat.unitPrice,
        uom: mat.uom,
        allocatedQty: mat.allocatedQty,
      });
    }
    const now = new Date().toISOString();
    const request = {
      id: crypto.randomUUID(),
      requestNo: await svc.nextRequestNo(),
      department: req.body.department || 'EGA',
      notes: req.body.notes || '',
      lines,
      status: STATUS.DRAFT,
      nextStep: NEXT_STEP[STATUS.DRAFT],
      createdBy: { id: req.user.id, name: req.user.name, role: req.user.role },
      history: [],
      salesOrderNo: null,
      deliveryNoteNo: null,
      invoiceNo: null,
      createdAt: now,
      updatedAt: now,
    };
    pushHistory(request, STATUS.DRAFT, req.user, 'Material request created');
    await db.requests.insert(request);
    await audit(req.user, 'request.create', request.id, { requestNo: request.requestNo });
    res.status(201).json({ request });
  }
);

// --- Submit -----------------------------------------------------------------
router.post('/:id/submit', authenticate, loadRequest, async (req, res) => {
  const r = req.materialRequest;
  if (r.createdBy.id !== req.user.id && req.user.role === 'requester') {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (!canTransition(r.status, STATUS.SUBMITTED)) {
    throw new ApiError(409, 'invalid_state', `Cannot submit a request in ${r.status}.`);
  }
  pushHistory(r, STATUS.SUBMITTED, req.user, 'Material request submitted');
  await db.requests.update(r.id, r);
  await audit(req.user, 'request.submit', r.id, {});
  res.json({ request: r });
});

// --- Receipt Acknowledgement (-> allocation gate) ---------------------------
router.post('/:id/acknowledge', authenticate, authorize('storekeeper', 'admin'), loadRequest, async (req, res) => {
  res.json({ request: await svc.acknowledge(req.materialRequest, req.user) });
});

// --- EGA Approval = Yes ------------------------------------------------------
router.post(
  '/:id/approve',
  authenticate,
  authorize('approver', 'admin'),
  loadRequest,
  [body('note').optional().isString()],
  async (req, res) => {
    res.json({ request: await svc.approve(req.materialRequest, req.user, req.body.note) });
  }
);

// --- EGA Approval = No -------------------------------------------------------
router.post(
  '/:id/reject',
  authenticate,
  authorize('approver', 'admin'),
  loadRequest,
  [body('reason').optional().isString()],
  async (req, res) => {
    res.json({ request: await svc.reject(req.materialRequest, req.user, req.body.reason) });
  }
);

// --- Delivery Note (delivery to the person) ---------------------------------
router.post(
  '/:id/deliver',
  authenticate,
  authorize('storekeeper', 'admin'),
  loadRequest,
  [body('recipientEmployeeId').isString().withMessage('recipientEmployeeId is required.')],
  handleValidation,
  async (req, res) => {
    res.json(await svc.deliver(req.materialRequest, req.user, { recipientEmployeeId: req.body.recipientEmployeeId }));
  }
);

// --- Material Return ---------------------------------------------------------
router.post(
  '/:id/return',
  authenticate,
  authorize('storekeeper', 'requester', 'admin'),
  loadRequest,
  [body('lines').isArray({ min: 1 }), body('reason').optional().isString()],
  handleValidation,
  async (req, res) => {
    const record = await svc.createReturn(req.materialRequest, req.user, { lines: req.body.lines, reason: req.body.reason });
    res.status(201).json({ return: record });
  }
);

// --- Delivery Note Consolidation --------------------------------------------
router.post('/:id/consolidate', authenticate, authorize('storekeeper', 'admin'), loadRequest, async (req, res) => {
  res.json({ request: await svc.consolidate(req.materialRequest, req.user) });
});

// --- Invoice to EGA ----------------------------------------------------------
router.post('/:id/invoice', authenticate, authorize('storekeeper', 'admin'), loadRequest, async (req, res) => {
  res.json(await svc.invoice(req.materialRequest, req.user));
});

export default router;
