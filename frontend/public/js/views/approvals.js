import { h, clear, spinner, money, dateTime, toast } from '../ui.js';
import { api } from '../api.js';

export async function renderApprovals(screen, ctx) {
  clear(screen);
  screen.appendChild(spinner());
  let requests = [];
  try {
    requests = (await api.requests()).requests;
  } catch (e) {
    clear(screen); screen.appendChild(h('div', { class: 'empty' }, e.message)); return;
  }
  clear(screen);
  const pending = requests.filter((r) => r.status === 'PENDING_APPROVAL');

  screen.appendChild(h('div', { class: 'strong', style: 'font-size:19px;margin:2px 2px 4px' }, 'E&E approvals'));
  screen.appendChild(h('div', { class: 'muted small', style: 'margin:0 2px 14px' }, 'Requests that exceed the per-person allocation.'));

  if (!pending.length) {
    screen.appendChild(h('div', { class: 'empty' }, [h('div', { class: 'ico' }, '✅'), 'No requests awaiting approval.']));
    return;
  }

  pending.forEach((r) => {
    const total = r.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const approveBtn = h('button', { class: 'btn', onclick: () => act(api.approve(r.id, 'Approved'), 'Approved') }, '✓ Approve');
    const rejectBtn = h('button', { class: 'btn danger', onclick: () => act(api.reject(r.id, 'Rejected'), 'Rejected') }, '✕ Reject');

    async function act(p, label) {
      approveBtn.disabled = rejectBtn.disabled = true;
      try { await p; toast(`${r.requestNo} ${label.toLowerCase()}`); renderApprovals(screen, ctx); ctx.refreshBadges?.(); }
      catch (e) { toast(e.message, true); approveBtn.disabled = rejectBtn.disabled = false; }
    }

    screen.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'row between' }, [h('div', { class: 'mono strong' }, r.requestNo), h('div', { class: 'small muted' }, dateTime(r.createdAt))]),
      h('div', { class: 'small muted', style: 'margin:6px 0' }, `${r.department} · ${r.createdBy.name} · ${money(total)}`),
      ...(r.allocation?.exceeded || []).map((e) => h('div', { class: 'small', style: 'color:var(--warn)' }, `${e.materialName}: ${e.requested} requested (allocation ${e.allocated})`)),
      h('div', { class: 'btn-row', style: 'margin-top:12px' }, [approveBtn, rejectBtn]),
      h('button', { class: 'btn outline sm', style: 'margin-top:8px', onclick: () => ctx.navigate('request/' + r.id) }, 'View details'),
    ]));
  });
}
