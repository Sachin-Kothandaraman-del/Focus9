// End-to-end smoke test of the full E&E distribution flow over HTTP.
// Run the server first (npm start), then: npm run test:flow
const BASE = process.env.BASE_URL || 'http://localhost:4000';

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}

// Full MFA login: password -> OTP -> tokens.
async function login(email, password = 'Passw0rd!23') {
  const step1 = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  if (!step1.json?.devOtp) throw new Error(`login step1 failed for ${email}: ${JSON.stringify(step1.json)}`);
  const step2 = await api('/api/auth/verify-otp', {
    method: 'POST',
    body: { userId: step1.json.userId, code: step1.json.devOtp },
  });
  if (!step2.json?.accessToken) throw new Error(`OTP verify failed for ${email}`);
  return step2.json;
}

async function main() {
  console.log(`\nE&E × Focus 9 — end-to-end flow test against ${BASE}\n`);

  const health = await api('/api/health');
  check('health endpoint up', health.status === 200 && health.json.status === 'ok');

  // --- Auth / MFA ----------------------------------------------------------
  const requester = await login('requester@eande.ae');
  const stores = await login('stores@eande.ae');
  const approver = await login('approver@eande.ae');
  const admin = await login('admin@eande.ae');
  check('MFA login works for all roles', !!(requester.accessToken && stores.accessToken && approver.accessToken && admin.accessToken));

  check('weak password rejected on register', (await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Weak', email: `weak${Date.now()}@eande.ae`, password: 'weak' },
  })).status === 422);

  // --- Materials -----------------------------------------------------------
  const mats = (await api('/api/materials', { token: requester.accessToken })).json.materials;
  check('material catalogue loads', mats.length >= 5, `got ${mats?.length}`);
  const helmet = mats.find((m) => m.code === 'PPE-HLMT'); // allocatedQty 2
  const gloves = mats.find((m) => m.code === 'PPE-GLOV'); // allocatedQty 6

  // ========================================================================
  // PATH A: within allocation -> auto-approved -> SO created automatically
  // ========================================================================
  console.log('\n  -- Path A: within allocation (auto-approve) --');
  let a = (await api('/api/requests', {
    method: 'POST',
    token: requester.accessToken,
    body: { department: 'Pot Line 1', lines: [{ materialId: helmet.id, qty: 1 }, { materialId: gloves.id, qty: 2 }] },
  })).json.request;
  check('request created (DRAFT)', a.status === 'DRAFT');

  a = (await api(`/api/requests/${a.id}/submit`, { method: 'POST', token: requester.accessToken })).json.request;
  check('request submitted', a.status === 'SUBMITTED');

  a = (await api(`/api/requests/${a.id}/acknowledge`, { method: 'POST', token: stores.accessToken })).json.request;
  check('within allocation -> auto-approved + SO created', a.status === 'SO_CREATED' && !!a.salesOrderNo, `status=${a.status} so=${a.salesOrderNo}`);

  const deliverA = (await api(`/api/requests/${a.id}/deliver`, {
    method: 'POST', token: stores.accessToken, body: { recipientEmployeeId: 'EE1001' },
  })).json;
  check('delivery note issued + PROSAFE validated', deliverA.request?.status === 'DELIVERED' && !!deliverA.request?.deliveryNoteNo);

  a = (await api(`/api/requests/${a.id}/consolidate`, { method: 'POST', token: stores.accessToken })).json.request;
  check('delivery notes consolidated', a.status === 'CONSOLIDATED');

  const invA = (await api(`/api/requests/${a.id}/invoice`, { method: 'POST', token: stores.accessToken })).json;
  check('invoice to E&E posted', invA.request?.status === 'INVOICED' && invA.invoice?.invoiceNo && invA.invoice?.totalAmount > 0,
    `status=${invA.request?.status} inv=${invA.invoice?.invoiceNo}`);

  // ========================================================================
  // PATH B: exceeds allocation -> E&E approval required
  // ========================================================================
  console.log('\n  -- Path B: exceeds allocation (needs E&E approval) --');
  let b = (await api('/api/requests', {
    method: 'POST', token: requester.accessToken,
    body: { department: 'Casthouse', lines: [{ materialId: helmet.id, qty: 5 }] }, // allocated 2 -> exceeds
  })).json.request;
  b = (await api(`/api/requests/${b.id}/submit`, { method: 'POST', token: requester.accessToken })).json.request;
  b = (await api(`/api/requests/${b.id}/acknowledge`, { method: 'POST', token: stores.accessToken })).json.request;
  check('exceeds allocation -> PENDING_APPROVAL', b.status === 'PENDING_APPROVAL', `status=${b.status}`);

  check('requester cannot approve (RBAC)', (await api(`/api/requests/${b.id}/approve`, { method: 'POST', token: requester.accessToken })).status === 403);

  b = (await api(`/api/requests/${b.id}/approve`, { method: 'POST', token: approver.accessToken, body: { note: 'Approved — shift expansion' } })).json.request;
  check('E&E approval -> SO created', b.status === 'SO_CREATED' && !!b.salesOrderNo, `status=${b.status}`);

  // Reject path on a fresh exceeding request
  let c = (await api('/api/requests', { method: 'POST', token: requester.accessToken, body: { lines: [{ materialId: helmet.id, qty: 9 }] } })).json.request;
  c = (await api(`/api/requests/${c.id}/submit`, { method: 'POST', token: requester.accessToken })).json.request;
  c = (await api(`/api/requests/${c.id}/acknowledge`, { method: 'POST', token: stores.accessToken })).json.request;
  c = (await api(`/api/requests/${c.id}/reject`, { method: 'POST', token: approver.accessToken, body: { reason: 'Excessive qty' } })).json.request;
  check('E&E rejection works', c.status === 'REJECTED');

  // --- Return flow ---------------------------------------------------------
  const ret = (await api(`/api/requests/${a.id}/return`, {
    method: 'POST', token: stores.accessToken, body: { lines: [{ materialId: helmet.id, qty: 1 }], reason: 'Damaged' },
  })).json;
  check('material return posted to ERP', !!ret.return?.returnNo, JSON.stringify(ret));

  // --- Security / RBAC negatives ------------------------------------------
  check('no token -> 401', (await api('/api/requests')).status === 401);
  check('bad token -> 401', (await api('/api/requests', { token: 'garbage' })).status === 401);
  check('requester cannot read audit (RBAC)', (await api('/api/admin/audit', { token: requester.accessToken })).status === 403);

  // --- ERP queue + audit visibility (admin) --------------------------------
  const erp = (await api('/api/admin/erp/status', { token: admin.accessToken })).json;
  check('ERP queue recorded calls (queue+retry)', erp.queue.total > 0 && erp.queue.failed === 0, JSON.stringify(erp.queue));
  const auditLog = (await api('/api/admin/audit', { token: admin.accessToken })).json;
  check('audit trail populated', auditLog.audit.length > 0);

  console.log(`\n──────────────────────────────────────────────`);
  console.log(`  RESULT: ${passed} passed, ${failed} failed`);
  console.log(`──────────────────────────────────────────────\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
