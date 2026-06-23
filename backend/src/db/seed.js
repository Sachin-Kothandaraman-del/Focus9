// Seed demo users + material catalogue on first boot (idempotent).
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './store.js';

// Pre-hashed so seeding is fast and deterministic. Plain password below.
const DEMO_PASSWORD = 'Passw0rd!23';

const DEMO_USERS = [
  { name: 'Req Requester', email: 'requester@ega.ae', role: 'requester', employeeId: 'EGA1001' },
  { name: 'Stan Stores', email: 'stores@ega.ae', role: 'storekeeper', employeeId: 'EGA2001' },
  { name: 'Aisha Approver', email: 'approver@ega.ae', role: 'approver', employeeId: 'EGA3001' },
  { name: 'Adi Admin', email: 'admin@ega.ae', role: 'admin', employeeId: 'EGA9001' },
];

const MATERIALS = [
  { code: 'PPE-HLMT', name: 'Safety Helmet (Hard Hat)', category: 'Head Protection', uom: 'NOS', unitPrice: 45, allocatedQty: 2, stockQty: 500 },
  { code: 'PPE-GLOV', name: 'Heat-Resistant Gloves', category: 'Hand Protection', uom: 'PAIR', unitPrice: 30, allocatedQty: 6, stockQty: 800 },
  { code: 'PPE-BOOT', name: 'Steel-Toe Safety Boots', category: 'Foot Protection', uom: 'PAIR', unitPrice: 120, allocatedQty: 2, stockQty: 300 },
  { code: 'PPE-GOGL', name: 'Safety Goggles', category: 'Eye Protection', uom: 'NOS', unitPrice: 18, allocatedQty: 4, stockQty: 900 },
  { code: 'PPE-VEST', name: 'Hi-Vis Reflective Vest', category: 'Visibility', uom: 'NOS', unitPrice: 25, allocatedQty: 3, stockQty: 600 },
  { code: 'PPE-MASK', name: 'Respirator Mask (P3)', category: 'Respiratory', uom: 'NOS', unitPrice: 60, allocatedQty: 5, stockQty: 400 },
  { code: 'PPE-EARP', name: 'Ear Protection (Plugs)', category: 'Hearing', uom: 'PACK', unitPrice: 12, allocatedQty: 10, stockQty: 1000 },
  { code: 'PPE-SUIT', name: 'Aluminised Heat Suit', category: 'Body Protection', uom: 'NOS', unitPrice: 350, allocatedQty: 1, stockQty: 120 },
];

export async function ensureSeed() {
  if ((await db.users.count()) === 0) {
    const hash = bcrypt.hashSync(DEMO_PASSWORD, 12);
    for (const u of DEMO_USERS) {
      await db.users.insert({
        id: crypto.randomUUID(),
        ...u,
        passwordHash: hash,
        createdAt: new Date().toISOString(),
      });
    }
    console.log(`[seed] created ${DEMO_USERS.length} demo users (password: ${DEMO_PASSWORD})`);
  }

  if ((await db.materials.count()) === 0) {
    for (const m of MATERIALS) {
      await db.materials.insert({
        id: crypto.randomUUID(),
        ...m,
        active: true,
        createdAt: new Date().toISOString(),
      });
    }
    console.log(`[seed] created ${MATERIALS.length} materials`);
  }
}

export { DEMO_PASSWORD, DEMO_USERS };
