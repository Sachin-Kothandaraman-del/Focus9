import { h, clear, spinner, timeAgo } from '../ui.js';
import { api } from '../api.js';

export async function renderAdmin(screen, ctx) {
  clear(screen);
  screen.appendChild(spinner());
  let status, queue, audit;
  try {
    [status, queue] = await Promise.all([api.erpStatus(), api.erpQueue()]);
    if (ctx.user.role === 'admin') audit = await api.audit();
  } catch (e) {
    clear(screen); screen.appendChild(h('div', { class: 'empty' }, e.message)); return;
  }
  clear(screen);

  screen.appendChild(h('div', { class: 'strong', style: 'font-size:19px;margin:2px 2px 12px' }, 'Integration & security'));

  // Connector status
  screen.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'section-title', style: 'margin:0 0 8px' }, 'ERP connectors'),
    row('Focus 9', status.focus9.mode === 'mock' ? '🟡 mock (simulator)' : '🟢 live'),
    row('PROSAFE', status.prosafe.mode === 'mock' ? '🟡 mock (simulator)' : '🟢 live'),
    h('div', { class: 'hint', style: 'margin-top:8px' }, 'Switch FOCUS9_MODE/PROSAFE_MODE to "live" in backend/.env to call the real ERP.'),
  ]));

  // ERP queue (queue + retry requirement)
  screen.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'section-title', style: 'margin:0 0 8px' }, 'ERP call queue (buffer + retry)'),
    h('div', { class: 'tiles', style: 'grid-template-columns:1fr 1fr 1fr' }, [
      mini(status.queue.done, 'Done', 'var(--ok)'),
      mini(status.queue.pending, 'Pending', 'var(--warn)'),
      mini(status.queue.failed, 'Failed', 'var(--danger)'),
    ]),
    h('div', { style: 'margin-top:10px' }, queue.queue.slice(0, 8).map((q) =>
      h('div', { class: 'kv' }, [
        h('span', { class: 'k mono small' }, q.type),
        h('span', { class: 'small' }, `${q.status} · ${q.attempts}× · ${timeAgo(q.createdAt)}`),
      ])
    )),
  ]));

  // Audit trail (admin only)
  if (audit) {
    screen.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'section-title', style: 'margin:0 0 8px' }, 'Audit trail (latest)'),
      ...audit.audit.slice(0, 14).map((a) =>
        h('div', { class: 'kv' }, [
          h('span', { class: 'k small' }, [h('b', {}, a.action), h('span', { class: 'muted' }, ` · ${a.actorName}`)]),
          h('span', { class: 'small muted' }, timeAgo(a.at)),
        ])
      ),
    ]));
  }

  screen.appendChild(h('div', { class: 'card', style: 'background:var(--ega-light);border-color:#bfe3d7' }, [
    h('div', { class: 'section-title', style: 'margin:0 0 6px;color:var(--ega-dark)' }, '🔒 Security posture'),
    ...['JWT access + refresh tokens', 'MFA via one-time passcode', 'bcrypt password hashing (cost 12)', 'Role-based access control', 'Rate limiting on auth + API', 'Helmet security headers + CSP', 'Input validation on every route', 'Full audit trail', 'Secrets in env only (no hardcoding)']
      .map((s) => h('div', { class: 'small', style: 'padding:3px 0' }, '✓ ' + s)),
  ]));
}

function row(k, v) { return h('div', { class: 'kv' }, [h('span', { class: 'k' }, k), h('span', { class: 'strong small' }, v)]); }
function mini(n, l, c) { return h('div', { class: 'tile', style: 'padding:10px' }, [h('div', { class: 'n', style: `font-size:22px;color:${c}` }, String(n)), h('div', { class: 'l' }, l)]); }
