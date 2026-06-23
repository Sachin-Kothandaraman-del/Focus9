import { h, clear, initials, roleLabel, toast } from './ui.js';
import { api, session } from './api.js';
import { renderAuth } from './views/auth.js';
import { renderHome } from './views/home.js';
import { renderCatalog } from './views/catalog.js';
import { renderRequests, renderRequestDetail } from './views/requests.js';
import { renderApprovals } from './views/approvals.js';
import { renderAdmin } from './views/admin.js';

const root = document.getElementById('app');

// Hide splash shortly after load.
setTimeout(() => document.getElementById('splash')?.classList.add('hide'), 500);

// Offline indicator (offline-first UX from System Requirement doc).
function setOnline() { document.body.classList.toggle('is-offline', !navigator.onLine); }
window.addEventListener('online', () => { setOnline(); toast('Back online'); });
window.addEventListener('offline', setOnline);
setOnline();

// Register service worker for offline app-shell.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}

function navTabsFor(role) {
  const tabs = [{ id: 'home', icon: '🏠', label: 'Home' }];
  if (role === 'requester' || role === 'storekeeper' || role === 'admin') tabs.push({ id: 'requests', icon: '📋', label: 'Requests' });
  if (role === 'requester' || role === 'storekeeper' || role === 'admin') tabs.push({ id: 'catalog', icon: '➕', label: 'New' });
  if (role === 'approver' || role === 'admin') tabs.push({ id: 'approvals', icon: '🗳️', label: 'Approve' });
  if (role === 'storekeeper' || role === 'admin') tabs.push({ id: 'admin', icon: '⚙️', label: 'ERP' });
  return tabs;
}

let currentTab = 'home';

function navigate(route) {
  location.hash = '#/' + route;
}

function shell(user) {
  clear(root);
  root.className = 'app-frame';

  const header = h('header', { class: 'app-header' }, [
    h('div', {}, [h('div', { class: 'title' }, 'EGA Distribution'), h('div', { class: 'sub' }, `${roleLabel(user.role)} · Focus 9`)]),
    h('div', { class: 'spacer' }),
    h('span', { class: 'offline-pill' }, 'OFFLINE'),
    h('div', { class: 'avatar', title: 'Account', onclick: () => openAccountSheet(user) }, initials(user.name)),
  ]);

  const screen = h('main', { class: 'screen', id: 'screen' });

  const nav = h('nav', { class: 'bottom-nav' });
  const tabs = navTabsFor(user.role);
  tabs.forEach((t) =>
    nav.appendChild(h('button', { class: 'nav-item', 'data-tab': t.id, onclick: () => navigate(t.id) }, [
      h('span', { class: 'ni' }, t.icon),
      h('span', {}, t.label),
    ]))
  );

  root.append(header, screen, nav);
  return { screen, nav };
}

function highlightNav(nav, tab) {
  nav.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
}

async function route(refs, user) {
  const hash = location.hash.replace(/^#\/?/, '') || 'home';
  const [base, param] = hash.split('/');
  const ctx = { user, navigate, refreshBadges: () => {} };
  const { screen, nav } = refs;

  currentTab = ['home', 'requests', 'catalog', 'approvals', 'admin'].includes(base) ? base : (base === 'request' ? 'requests' : 'home');
  highlightNav(nav, currentTab);

  try {
    if (base === 'home') return renderHome(screen, ctx);
    if (base === 'requests') return renderRequests(screen, ctx);
    if (base === 'catalog') return renderCatalog(screen, ctx);
    if (base === 'approvals') return renderApprovals(screen, ctx);
    if (base === 'admin') return renderAdmin(screen, ctx);
    if (base === 'request' && param) return renderRequestDetail(screen, ctx, param);
    return renderHome(screen, ctx);
  } catch (e) {
    clear(screen);
    screen.appendChild(h('div', { class: 'empty' }, [h('div', { class: 'ico' }, '⚠️'), e.message]));
  }
}

// Account sheet: profile + log out + delete account.
function openAccountSheet(user) {
  const overlay = h('div', { class: 'sheet-overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  function close() { overlay.remove(); }

  const logoutBtn = h('button', { class: 'btn outline', onclick: doLogout }, '↩  Log out');

  // Delete uses a two-step confirm to avoid accidental taps.
  const deleteWrap = h('div');
  const deleteBtn = h('button', { class: 'btn danger', onclick: armDelete }, '🗑  Delete account');
  deleteWrap.appendChild(deleteBtn);

  function armDelete() {
    clear(deleteWrap);
    deleteWrap.append(
      h('div', { class: 'confirm-box' }, [
        h('div', { class: 'strong', style: 'margin-bottom:4px' }, 'Delete your account?'),
        h('div', { class: 'small muted', style: 'margin-bottom:10px' }, 'This permanently removes your sign-in. Requests you raised are kept for records. This cannot be undone.'),
        h('div', { class: 'btn-row' }, [
          h('button', { class: 'btn outline', onclick: () => { clear(deleteWrap); deleteWrap.appendChild(deleteBtn); } }, 'Cancel'),
          h('button', { class: 'btn danger', onclick: doDelete }, 'Yes, delete'),
        ]),
      ])
    );
  }

  async function doLogout() {
    logoutBtn.disabled = true; logoutBtn.textContent = 'Signing out…';
    try { await api.logout(session.tokens?.refreshToken); } catch { /* best effort */ }
    session.clear();
    close();
    toast('Signed out');
    location.hash = '';
    boot();
  }

  async function doDelete() {
    try {
      await api.deleteAccount();
      session.clear();
      close();
      toast('Account deleted');
      location.hash = '';
      boot();
    } catch (e) {
      toast(e.message, true);
    }
  }

  overlay.appendChild(
    h('div', { class: 'sheet', onclick: (e) => e.stopPropagation() }, [
      h('div', { class: 'sheet-handle' }),
      h('div', { class: 'row', style: 'gap:14px;margin-bottom:6px' }, [
        h('div', { class: 'avatar lg' }, initials(user.name)),
        h('div', {}, [
          h('div', { class: 'strong', style: 'font-size:17px' }, user.name),
          h('div', { class: 'small muted' }, user.email),
          h('span', { class: 'chip cat', style: 'margin-top:4px;display:inline-flex' }, roleLabel(user.role)),
        ]),
      ]),
      h('div', { class: 'sheet-actions' }, [logoutBtn, deleteWrap]),
      h('button', { class: 'btn outline', onclick: close }, 'Close'),
    ])
  );
  document.getElementById('app').appendChild(overlay);
}

async function startApp(user) {
  const refs = shell(user);
  const handler = () => route(refs, user);
  window.onhashchange = handler;
  if (!location.hash) location.hash = '#/home';
  else handler();
}

async function boot() {
  const tokens = session.tokens;
  if (tokens?.accessToken) {
    try {
      const { user } = await api.me();
      session.user = user;
      return startApp(user);
    } catch {
      session.clear();
    }
  }
  renderAuth(root, (user) => { location.hash = '#/home'; startApp(user); });
}

boot();
