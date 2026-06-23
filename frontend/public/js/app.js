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
    h('div', { class: 'avatar', title: 'Sign out', onclick: signOut }, initials(user.name)),
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

function signOut() {
  session.clear();
  location.hash = '';
  boot();
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
