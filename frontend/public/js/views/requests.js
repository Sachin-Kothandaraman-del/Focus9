import { h, clear, statusChip, spinner, toast, money, dateTime } from '../ui.js';
import { api } from '../api.js';
import { requestCard } from './home.js';

const FILTERS = ['All', 'In progress', 'Approval', 'Completed'];

export async function renderRequests(screen, ctx) {
  clear(screen);
  screen.appendChild(spinner());
  let requests = [];
  try {
    requests = (await api.requests()).requests;
  } catch (e) {
    clear(screen);
    screen.appendChild(h('div', { class: 'empty' }, e.message));
    return;
  }
  clear(screen);
  screen.appendChild(h('div', { class: 'strong', style: 'font-size:19px;margin:2px 2px 12px' }, ctx.user.role === 'requester' ? 'My requests' : 'All requests'));

  let filter = 'All';
  const bar = h('div', { class: 'row', style: 'gap:8px;overflow-x:auto;margin-bottom:12px;padding-bottom:2px' });
  const listWrap = h('div');
  FILTERS.forEach((f) => {
    const b = h('button', { class: 'btn sm ' + (f === filter ? '' : 'outline'), onclick: () => { filter = f; paint(); } }, f);
    b.dataset.f = f; bar.appendChild(b);
  });
  screen.append(bar, listWrap);

  function paint() {
    bar.querySelectorAll('button').forEach((b) => (b.className = 'btn sm ' + (b.dataset.f === filter ? '' : 'outline')));
    clear(listWrap);
    let rows = requests;
    if (filter === 'In progress') rows = rows.filter((r) => ['SUBMITTED', 'ACKNOWLEDGED', 'APPROVED', 'SO_CREATED', 'DELIVERED', 'CONSOLIDATED'].includes(r.status));
    if (filter === 'Approval') rows = rows.filter((r) => r.status === 'PENDING_APPROVAL');
    if (filter === 'Completed') rows = rows.filter((r) => ['INVOICED', 'REJECTED', 'CANCELLED'].includes(r.status));
    if (!rows.length) { listWrap.appendChild(h('div', { class: 'empty' }, [h('div', { class: 'ico' }, '🗂️'), 'Nothing here.'])); return; }
    rows.forEach((r) => listWrap.appendChild(requestCard(r, ctx)));
  }
  paint();
}

export async function renderRequestDetail(screen, ctx, id) {
  clear(screen);
  screen.appendChild(spinner());
  let data;
  try {
    data = await api.request(id);
  } catch (e) {
    clear(screen);
    screen.appendChild(h('div', { class: 'empty' }, e.message));
    return;
  }
  const r = data.request;
  clear(screen);

  screen.appendChild(h('button', { class: 'btn outline sm', style: 'margin-bottom:12px', onclick: () => history.back() }, '← Back'));

  // Header card
  screen.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'row between' }, [h('div', { class: 'mono strong', style: 'font-size:16px' }, r.requestNo), statusChip(r.status)]),
    h('div', { class: 'small muted', style: 'margin-top:6px' }, `${r.department} · raised by ${r.createdBy.name} · ${dateTime(r.createdAt)}`),
    r.nextStep ? h('div', { class: 'small', style: 'margin-top:8px;color:var(--ega-dark)' }, `Next: ${r.nextStep}`) : null,
  ]));

  // Focus 9 references
  if (r.salesOrderNo || r.deliveryNoteNo || r.invoiceNo) {
    screen.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'section-title', style: 'margin:0 0 6px' }, 'Focus 9 references'),
      r.salesOrderNo ? kv('Sales Order', r.salesOrderNo) : null,
      r.deliveryNoteNo ? kv('Delivery Note', r.deliveryNoteNo) : null,
      r.recipient ? kv('Delivered to', `${r.recipient.name} (${r.recipient.id})`) : null,
      r.invoiceNo ? kv('Invoice', `${r.invoiceNo} · ${money(r.invoiceAmount)}`) : null,
    ]));
  }

  // Line items
  const itemsTotal = r.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  screen.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'section-title', style: 'margin:0 0 8px' }, 'Items'),
    ...r.lines.map((l) =>
      h('div', { class: 'kv' }, [
        h('span', { class: 'k' }, [l.materialName, l.qty > l.allocatedQty ? h('span', { class: 'chip over', style: 'margin-left:6px' }, `>${l.allocatedQty}`) : null]),
        h('span', {}, `${l.qty} × ${money(l.unitPrice)}`),
      ])
    ),
    h('div', { class: 'kv', style: 'font-weight:700' }, [h('span', {}, 'Total'), h('span', {}, money(itemsTotal))]),
  ]));

  // Allocation breach detail
  if (r.allocation && !r.allocation.within) {
    screen.appendChild(h('div', { class: 'card', style: 'border-color:#f3d6a0;background:#fffdf6' }, [
      h('div', { class: 'section-title', style: 'margin:0 0 6px;color:var(--warn)' }, '⚠️ Exceeds allocation'),
      ...r.allocation.exceeded.map((e) => h('div', { class: 'small' }, `${e.materialName}: requested ${e.requested}, allocated ${e.allocated} (over by ${e.over})`)),
    ]));
  }

  // Actions (role + status aware)
  const actions = buildActions(r, ctx, () => renderRequestDetail(screen, ctx, id));
  if (actions.length) screen.appendChild(h('div', { class: 'card' }, [h('div', { class: 'section-title', style: 'margin:0 0 10px' }, 'Actions'), ...actions]));

  // Timeline
  screen.appendChild(h('div', { class: 'section-title' }, 'Workflow timeline'));
  const tl = h('div', { class: 'timeline' });
  [...r.history].reverse().forEach((ev, i) =>
    tl.appendChild(h('div', { class: 'tl-item' + (i === 0 ? '' : ' muted-dot') }, [
      h('div', { class: 'tl-status' }, ev.status.replace(/_/g, ' ')),
      h('div', { class: 'tl-note' }, ev.note),
      h('div', { class: 'tl-meta' }, `${ev.by ? ev.by.name + ' · ' : ''}${dateTime(ev.at)}`),
    ]))
  );
  screen.appendChild(tl);
}

function kv(k, v) {
  return h('div', { class: 'kv' }, [h('span', { class: 'k' }, k), h('span', { class: 'mono' }, v)]);
}

function buildActions(r, ctx, refresh) {
  const role = ctx.user.role;
  const out = [];
  const act = async (fn, label) => {
    const btns = out;
    try {
      btns.forEach((b) => (b.disabled = true));
      await fn();
      toast(label + ' ✓');
      refresh();
    } catch (e) {
      toast(e.message, true);
      btns.forEach((b) => (b.disabled = false));
    }
  };

  if (r.status === 'DRAFT' && (r.createdBy.id === ctx.user.id || role === 'admin')) {
    out.push(h('button', { class: 'btn', onclick: () => act(() => api.submit(r.id), 'Submitted') }, 'Submit request'));
  }
  if (r.status === 'SUBMITTED' && (role === 'storekeeper' || role === 'admin')) {
    out.push(h('button', { class: 'btn', onclick: () => act(() => api.acknowledge(r.id), 'Acknowledged') }, '📥 Acknowledge receipt'));
  }
  if (r.status === 'PENDING_APPROVAL' && (role === 'approver' || role === 'admin')) {
    out.push(h('button', { class: 'btn', onclick: () => act(() => api.approve(r.id, 'Approved via app'), 'Approved') }, '✓ Approve (EGA)'));
    out.push(h('button', { class: 'btn danger', style: 'margin-top:8px', onclick: () => act(() => api.reject(r.id, 'Rejected via app'), 'Rejected') }, '✕ Reject'));
  }
  if (r.status === 'SO_CREATED' && (role === 'storekeeper' || role === 'admin')) {
    const sel = h('select', {}, ['EGA1001', 'EGA1002', 'EGA1003', 'EGA1004'].map((e) => h('option', { value: e }, e)));
    out.push(h('label', { class: 'field' }, [h('span', { class: 'lbl' }, 'Recipient (PROSAFE employee)'), sel]));
    out.push(h('button', { class: 'btn', onclick: () => act(() => api.deliver(r.id, sel.value), 'Delivery note issued') }, '🚚 Issue delivery note'));
  }
  if (r.status === 'DELIVERED' && (role === 'storekeeper' || role === 'admin')) {
    out.push(h('button', { class: 'btn', onclick: () => act(() => api.consolidate(r.id), 'Consolidated') }, '🧾 Consolidate delivery notes'));
  }
  if (r.status === 'CONSOLIDATED' && (role === 'storekeeper' || role === 'admin')) {
    out.push(h('button', { class: 'btn', onclick: () => act(() => api.invoice(r.id), 'Invoice posted') }, '💵 Raise invoice to EGA'));
  }
  if (['DELIVERED', 'CONSOLIDATED', 'INVOICED'].includes(r.status) && (role === 'storekeeper' || role === 'requester' || role === 'admin')) {
    out.push(h('button', { class: 'btn outline', style: 'margin-top:8px', onclick: () => act(() => api.returnItems(r.id, r.lines.map((l) => ({ materialId: l.materialId, qty: 1 })), 'Returned via app'), 'Return posted') }, '↩️ Return 1 of each item'));
  }
  return out;
}
