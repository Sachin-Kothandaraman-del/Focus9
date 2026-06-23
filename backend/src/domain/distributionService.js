// Business logic for the EGA distribution workflow. Routes stay thin; all ERP
// interaction + state transitions live here. All persistence is async so the
// same code runs over the local file store or Supabase Postgres.
import crypto from 'node:crypto';
import { db } from '../db/store.js';
import { focus9 } from '../erp/focus9Connector.js';
import { prosafe } from '../erp/prosafeConnector.js';
import { runWithQueue } from '../erp/queue.js';
import { audit } from '../middleware/audit.js';
import { ApiError } from '../middleware/errorHandler.js';
import { STATUS, canTransition, pushHistory, evaluateAllocation } from './workflow.js';

export async function nextRequestNo() {
  // Derive the sequence from existing data so numbers don't collide.
  const nums = (await db.requests.all())
    .map((r) => parseInt(String(r.requestNo).split('-').pop(), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 100) + 1;
  return `MR-${new Date().getFullYear()}-${next}`;
}

async function materialsById() {
  const map = {};
  (await db.materials.all()).forEach((m) => (map[m.id] = m));
  return map;
}

/** Receipt Acknowledgement + allocation gate. */
export async function acknowledge(request, actor) {
  if (!canTransition(request.status, STATUS.ACKNOWLEDGED)) {
    throw new ApiError(409, 'invalid_state', `Cannot acknowledge a request in ${request.status}.`);
  }
  pushHistory(request, STATUS.ACKNOWLEDGED, actor, 'Receipt acknowledged by stores');

  // "Within Allocated Qtys?" decision from the flow chart.
  const allocation = evaluateAllocation(request.lines, await materialsById());
  request.allocation = allocation;

  if (allocation.within) {
    pushHistory(request, STATUS.APPROVED, actor, 'Within allocated quantities — auto-approved');
    await db.requests.update(request.id, request);
    await audit(actor, 'request.acknowledge.autoapprove', request.id, { allocation });
    return ensureSalesOrder(request, actor);
  }

  pushHistory(request, STATUS.PENDING_APPROVAL, actor, 'Exceeds allocation — routed to EGA approval');
  const saved = await db.requests.update(request.id, request);
  await audit(actor, 'request.acknowledge.needsapproval', request.id, { exceeded: allocation.exceeded });
  return saved;
}

/** EGA Approval = Yes. */
export async function approve(request, actor, note) {
  if (!canTransition(request.status, STATUS.APPROVED)) {
    throw new ApiError(409, 'invalid_state', `Cannot approve a request in ${request.status}.`);
  }
  pushHistory(request, STATUS.APPROVED, actor, note || 'Approved by EGA');
  await db.requests.update(request.id, request);
  await audit(actor, 'request.approve', request.id, { note });
  return ensureSalesOrder(request, actor);
}

/** EGA Approval = No. */
export async function reject(request, actor, reason) {
  if (!canTransition(request.status, STATUS.REJECTED)) {
    throw new ApiError(409, 'invalid_state', `Cannot reject a request in ${request.status}.`);
  }
  pushHistory(request, STATUS.REJECTED, actor, reason || 'Rejected by EGA');
  const saved = await db.requests.update(request.id, request);
  await audit(actor, 'request.reject', request.id, { reason });
  return saved;
}

/** SO Creation in Focus 9 (runs as soon as a request is APPROVED). */
export async function ensureSalesOrder(request, actor) {
  if (request.salesOrderNo) return request;
  const order = {
    requestNo: request.requestNo,
    customerCode: 'EGA',
    lines: request.lines.map((l) => ({
      materialId: l.materialId,
      materialCode: l.materialCode,
      qty: l.qty,
      unitPrice: l.unitPrice,
      uom: l.uom,
    })),
  };
  const so = await runWithQueue('createSalesOrder', order, () => focus9.createSalesOrder(order));
  request.salesOrderNo = so.salesOrderNo;
  request.focus9SalesOrderId = so.focus9SalesOrderId;
  pushHistory(request, STATUS.SO_CREATED, actor, `Sales Order ${so.salesOrderNo} created in Focus 9`);
  const saved = await db.requests.update(request.id, request);
  await audit(actor, 'request.so.created', request.id, { salesOrderNo: so.salesOrderNo });
  return saved;
}

/** Delivery Note — "Delivery to the person". Recipient validated via PROSAFE. */
export async function deliver(request, actor, { recipientEmployeeId }) {
  if (!canTransition(request.status, STATUS.DELIVERED)) {
    throw new ApiError(409, 'invalid_state', `Cannot deliver a request in ${request.status}.`);
  }
  const check = await prosafe.validateEmployee(recipientEmployeeId);
  if (!check.valid) {
    throw new ApiError(422, 'invalid_recipient', `PROSAFE: employee ${recipientEmployeeId} is not valid/active.`);
  }

  const dnPayload = { salesOrderNo: request.salesOrderNo, recipient: check.employee, lines: request.lines };
  const dn = await runWithQueue('postDeliveryNote', dnPayload, () => focus9.postDeliveryNote(dnPayload));

  const delivery = await db.deliveries.insert({
    id: crypto.randomUUID(),
    requestId: request.id,
    requestNo: request.requestNo,
    deliveryNoteNo: dn.deliveryNoteNo,
    focus9DeliveryId: dn.focus9DeliveryId,
    recipient: check.employee,
    lines: request.lines,
    consolidated: false,
    createdAt: new Date().toISOString(),
  });

  request.deliveryNoteNo = dn.deliveryNoteNo;
  request.recipient = check.employee;
  pushHistory(request, STATUS.DELIVERED, actor, `Delivery Note ${dn.deliveryNoteNo} issued to ${check.employee.name}`);
  await db.requests.update(request.id, request);
  await audit(actor, 'request.delivered', request.id, { deliveryNoteNo: dn.deliveryNoteNo, recipient: recipientEmployeeId });
  return { request, delivery };
}

/** Material Return branch. */
export async function createReturn(request, actor, { lines, reason }) {
  if (![STATUS.DELIVERED, STATUS.CONSOLIDATED, STATUS.INVOICED].includes(request.status)) {
    throw new ApiError(409, 'invalid_state', 'Returns are only possible after delivery.');
  }
  const payload = { requestNo: request.requestNo, deliveryNoteNo: request.deliveryNoteNo, lines, reason };
  const ret = await runWithQueue('postMaterialReturn', payload, () => focus9.postMaterialReturn(payload));

  const record = await db.returns.insert({
    id: crypto.randomUUID(),
    requestId: request.id,
    requestNo: request.requestNo,
    returnNo: ret.returnNo,
    focus9ReturnId: ret.focus9ReturnId,
    lines,
    reason: reason || '',
    createdAt: new Date().toISOString(),
  });
  await audit(actor, 'request.return', request.id, { returnNo: ret.returnNo, reason });
  return record;
}

/** Delivery Note Consolidation. */
export async function consolidate(request, actor) {
  if (!canTransition(request.status, STATUS.CONSOLIDATED)) {
    throw new ApiError(409, 'invalid_state', `Cannot consolidate a request in ${request.status}.`);
  }
  const dns = await db.deliveries.filter((d) => d.requestId === request.id);
  for (const d of dns) await db.deliveries.update(d.id, { consolidated: true });
  pushHistory(request, STATUS.CONSOLIDATED, actor, 'Delivery notes consolidated');
  const saved = await db.requests.update(request.id, request);
  await audit(actor, 'request.consolidate', request.id, {});
  return saved;
}

/** Invoice to EGA (Focus 9). */
export async function invoice(request, actor) {
  if (!canTransition(request.status, STATUS.INVOICED)) {
    throw new ApiError(409, 'invalid_state', `Cannot invoice a request in ${request.status}.`);
  }
  const payload = {
    salesOrderNo: request.salesOrderNo,
    customer: 'EGA',
    lines: request.lines.map((l) => ({ materialCode: l.materialCode, qty: l.qty, unitPrice: l.unitPrice })),
  };
  const inv = await runWithQueue('postInvoice', payload, () => focus9.postInvoice(payload));

  const record = await db.invoices.insert({
    id: crypto.randomUUID(),
    requestId: request.id,
    requestNo: request.requestNo,
    invoiceNo: inv.invoiceNo,
    focus9InvoiceId: inv.focus9InvoiceId,
    totalAmount: inv.totalAmount,
    currency: inv.currency,
    createdAt: new Date().toISOString(),
  });

  request.invoiceNo = inv.invoiceNo;
  request.invoiceAmount = inv.totalAmount;
  pushHistory(request, STATUS.INVOICED, actor, `Invoice ${inv.invoiceNo} (${inv.currency} ${inv.totalAmount}) posted to EGA`);
  await db.requests.update(request.id, request);
  await audit(actor, 'request.invoice', request.id, { invoiceNo: inv.invoiceNo, amount: inv.totalAmount });
  return { request, invoice: record };
}
