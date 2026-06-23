// ---------------------------------------------------------------------------
// Focus 9 ERP connector (the "translator" in the System Requirement doc).
//
//   "Your backend validates the data and calls a REST API endpoint on the ERP
//    (e.g., /api/resource/Sales Order) with the transformed order information."
//
//   "Act as a buffer to protect your ERP from heavy traffic. It can queue
//    orders and retry failed requests, preventing data loss if the ERP is
//    temporarily slow."
//
// Licenses doc: the app's consumers do NOT consume ERP seats; all ERP calls go
// through a single FOCUS9_INTEGRATION_USER configured in the environment.
//
// FOCUS9_MODE=mock  -> uses the in-process simulator below (default; lets the
//                      whole system run end-to-end with no external ERP).
// FOCUS9_MODE=live  -> issues real HTTPS calls to FOCUS9_BASE_URL using the
//                      integration user's API key. The request/response mapping
//                      is centralised here so only this file changes once
//                      Focus Softnet provides the exact endpoint contract.
// ---------------------------------------------------------------------------
import crypto from 'node:crypto';
import { config } from '../config.js';

let soCounter = 1000;
let dnCounter = 5000;
let invCounter = 9000;

function newRef(prefix, n) {
  return `${prefix}-${config.focus9.companyCode}-${n}`;
}

/** Simulate realistic ERP latency / occasional transient failure for the
 *  queue+retry mechanism to exercise. */
function simulateLatency() {
  return new Promise((resolve) => setTimeout(resolve, 40 + Math.random() * 60));
}

// --- LIVE transport (template) ---------------------------------------------
async function liveCall(method, path, payload) {
  const url = `${config.focus9.baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      // Security doc: token/API-key auth over TLS; secret from env only.
      Authorization: `Bearer ${config.focus9.apiKey}`,
      'X-Focus9-Company': config.focus9.companyCode,
      'X-Integration-User': config.focus9.integrationUser,
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Focus9 ${method} ${path} failed: ${res.status} ${text}`);
    err.transient = res.status >= 500 || res.status === 429;
    throw err;
  }
  return res.json();
}

// --- MOCK transport ---------------------------------------------------------
const mock = {
  async createSalesOrder(order) {
    await simulateLatency();
    return {
      focus9SalesOrderId: crypto.randomUUID(),
      salesOrderNo: newRef('SO', ++soCounter),
      status: 'CONFIRMED',
      companyCode: config.focus9.companyCode,
      postedAt: new Date().toISOString(),
    };
  },
  async postDeliveryNote(dn) {
    await simulateLatency();
    return {
      focus9DeliveryId: crypto.randomUUID(),
      deliveryNoteNo: newRef('DN', ++dnCounter),
      status: 'DELIVERED',
      postedAt: new Date().toISOString(),
    };
  },
  async postInvoice(inv) {
    await simulateLatency();
    const amount = inv.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    return {
      focus9InvoiceId: crypto.randomUUID(),
      invoiceNo: newRef('INV', ++invCounter),
      status: 'POSTED',
      totalAmount: Number(amount.toFixed(2)),
      currency: 'AED',
      postedAt: new Date().toISOString(),
    };
  },
  async postMaterialReturn(ret) {
    await simulateLatency();
    return {
      focus9ReturnId: crypto.randomUUID(),
      returnNo: newRef('RTN', ++dnCounter),
      status: 'RECEIVED',
      postedAt: new Date().toISOString(),
    };
  },
};

// --- Public, ERP-agnostic interface ----------------------------------------
// Routes/domain code only ever see these methods, never the transport details.
export const focus9 = {
  mode: config.focus9.mode,

  async createSalesOrder(order) {
    if (config.focus9.mode === 'live') {
      return liveCall('POST', '/resource/Sales Order', mapOrderToFocus9(order));
    }
    return mock.createSalesOrder(order);
  },

  async postDeliveryNote(dn) {
    if (config.focus9.mode === 'live') return liveCall('POST', '/resource/Delivery Note', dn);
    return mock.postDeliveryNote(dn);
  },

  async postInvoice(inv) {
    if (config.focus9.mode === 'live') return liveCall('POST', '/resource/Sales Invoice', inv);
    return mock.postInvoice(inv);
  },

  async postMaterialReturn(ret) {
    if (config.focus9.mode === 'live') return liveCall('POST', '/resource/Delivery Return', ret);
    return mock.postMaterialReturn(ret);
  },
};

// Transform app payload -> Focus 9 expected shape. (System Requirement doc:
// "format it to match the structure your ERP expects".)
function mapOrderToFocus9(order) {
  return {
    company: config.focus9.companyCode,
    customer: order.customerCode || 'E&E',
    transaction_date: new Date().toISOString().slice(0, 10),
    items: order.lines.map((l) => ({
      item_code: l.materialCode,
      qty: l.qty,
      rate: l.unitPrice,
      uom: l.uom || 'NOS',
    })),
    reference: order.requestNo,
  };
}
