import { Router } from 'express';
import crypto from 'node:crypto';
import { body } from 'express-validator';
import { db } from '../db/store.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { handleValidation } from '../middleware/validate.js';
import { audit } from '../middleware/audit.js';

const router = Router();

// Catalogue of distributable materials (PPE / safety items, given PROSAFE).
router.get('/', authenticate, async (req, res) => {
  const materials = (await db.materials.all()).filter((m) => m.active !== false);
  res.json({ materials });
});

router.get('/:id', authenticate, async (req, res) => {
  const m = await db.materials.getById(req.params.id);
  if (!m) return res.status(404).json({ error: 'not_found' });
  res.json({ material: m });
});

// Create / update materials — stores or admin only.
router.post(
  '/',
  authenticate,
  authorize('storekeeper', 'admin'),
  [
    body('code').trim().isLength({ min: 2 }),
    body('name').trim().isLength({ min: 2 }),
    body('unitPrice').isFloat({ min: 0 }),
    body('allocatedQty').isInt({ min: 0 }),
    body('stockQty').optional().isInt({ min: 0 }),
    body('uom').optional().isString(),
  ],
  handleValidation,
  async (req, res) => {
    const { code, name, unitPrice, allocatedQty, stockQty, uom, category } = req.body;
    const material = await db.materials.insert({
      id: crypto.randomUUID(),
      code,
      name,
      category: category || 'General',
      uom: uom || 'NOS',
      unitPrice: Number(unitPrice),
      allocatedQty: Number(allocatedQty),
      stockQty: Number(stockQty ?? 1000),
      active: true,
      createdAt: new Date().toISOString(),
    });
    await audit(req.user, 'material.create', material.id, { code });
    res.status(201).json({ material });
  }
);

export default router;
