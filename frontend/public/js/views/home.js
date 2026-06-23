import { h, clear, statusChip, roleLabel, timeAgo, spinner, money } from '../ui.js';
import { api } from '../api.js';

const ACTIVE = ['SUBMITTED', 'ACKNOWLEDGED', 'PENDING_APPROVAL', 'APPROVED', 'SO_CREATED', 'DELIVERED', 'CONSOLIDATED'];

export async function renderHome(screen, ctx) {
  clear(screen);
  screen.appendChild(spinner());
  let requests = [];
  try {
    requests = (await api.requests()).requests;
  } catch (e) {
    clear(screen);
    screen.appendChild(h('div', { class: 'empty' }, [h('div', { class: 'ico' }, '⚠️'), e.message]));
    return;
  }
  clear(screen);

  const active = requests.filter((r) => ACTIVE.includes(r.status)).length;
  const invoiced = requests.filter((r) => r.status === 'INVOICED');
  const pendingApproval = requests.filter((r) => r.status === 'PENDING_APPROVAL').length;
  const totalInvoiced = invoiced.reduce((s, r) => s + (r.invoiceAmount || 0), 0);

  // Greeting
  screen.appendChild(
    h('div', { style: 'margin:2px 2px 14px' }, [
      h('div', { class: 'strong', style: 'font-size:20px' }, `Hi, ${ctx.user.name.split(' ')[0]} 👋`),
      h('div', { class: 'muted small' }, `${roleLabel(ctx.user.role)} · E&E × Focus 9 distribution`),
    ])
  );

  // Tiles
  const tiles = [
    { n: requests.length, l: 'Total requests' },
    { n: active, l: 'In progress' },
  ];
  if (ctx.user.role === 'approver' || ctx.user.role === 'admin') tiles.push({ n: pendingApproval, l: 'Awaiting approval' });
  if (ctx.user.role === 'storekeeper' || ctx.user.role === 'admin') tiles.push({ n: money(totalInvoiced), l: 'Invoiced to E&E', wide: true });
  if (ctx.user.role === 'requester') tiles.push({ n: invoiced.length, l: 'Completed' });

  screen.appendChild(h('div', { class: 'tiles' }, tiles.map((t) => h('div', { class: 'tile' }, [h('div', { class: 'n' }, String(t.n)), h('div', { class: 'l' }, t.l)]))));

  // Primary action
  if (ctx.user.role === 'requester' || ctx.user.role === 'storekeeper' || ctx.user.role === 'admin') {
    screen.appendChild(h('button', { class: 'btn', style: 'margin-top:16px', onclick: () => ctx.navigate('catalog') }, '➕  New material request'));
  }
  if (ctx.user.role === 'approver' || ctx.user.role === 'admin') {
    screen.appendChild(h('button', { class: 'btn secondary', style: 'margin-top:10px', onclick: () => ctx.navigate('approvals') }, `🗳️  Review approvals${pendingApproval ? ` (${pendingApproval})` : ''}`));
  }

  // Recent
  screen.appendChild(h('div', { class: 'section-title' }, 'Recent activity'));
  if (!requests.length) {
    screen.appendChild(h('div', { class: 'empty' }, [h('div', { class: 'ico' }, '📦'), 'No requests yet. Create your first material request.']));
    return;
  }
  requests.slice(0, 6).forEach((r) => screen.appendChild(requestCard(r, ctx)));
}

export function requestCard(r, ctx) {
  const itemCount = r.lines.reduce((s, l) => s + l.qty, 0);
  return h('div', { class: 'card tap', onclick: () => ctx.navigate('request/' + r.id) }, [
    h('div', { class: 'row between' }, [
      h('div', { class: 'mono strong' }, r.requestNo),
      statusChip(r.status),
    ]),
    h('div', { class: 'row between', style: 'margin-top:8px' }, [
      h('div', { class: 'small muted' }, `${r.lines.length} item${r.lines.length > 1 ? 's' : ''} · ${itemCount} unit${itemCount > 1 ? 's' : ''} · ${r.department}`),
      h('div', { class: 'small muted' }, timeAgo(r.updatedAt || r.createdAt)),
    ]),
    r.salesOrderNo ? h('div', { class: 'small muted', style: 'margin-top:6px' }, `Focus 9 SO: ${r.salesOrderNo}${r.invoiceNo ? ' · ' + r.invoiceNo : ''}`) : null,
  ]);
}
