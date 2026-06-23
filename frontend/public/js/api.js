// API client for the E&E × Focus 9 mobile app.
// Security doc: tokens are kept in memory + sessionStorage (not localStorage)
// and sent as Bearer tokens over the (HTTPS-capable) API. No secrets here.
const TOKEN_KEY = 'ee.tokens';
const USER_KEY = 'ee.user';

export const session = {
  get tokens() {
    try {
      return JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    } catch {
      return null;
    }
  },
  set tokens(v) {
    if (v) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(TOKEN_KEY);
  },
  get user() {
    try {
      return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  },
  set user(v) {
    if (v) sessionStorage.setItem(USER_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(USER_KEY);
  },
  clear() {
    this.tokens = null;
    this.user = null;
  },
};

async function request(path, { method = 'GET', body, auth = true, retry = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const tokens = session.tokens;
  if (auth && tokens?.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;

  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    const e = new Error('You appear to be offline.');
    e.offline = true;
    throw e;
  }

  // Transparent access-token refresh on 401.
  if (res.status === 401 && auth && retry && tokens?.refreshToken) {
    const ok = await tryRefresh();
    if (ok) return request(path, { method, body, auth, retry: false });
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = new Error(json?.message || json?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

async function tryRefresh() {
  const tokens = session.tokens;
  if (!tokens?.refreshToken) return false;
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    session.tokens = { ...tokens, accessToken: data.accessToken };
    return true;
  } catch {
    return false;
  }
}

export const api = {
  // auth
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  verifyOtp: (userId, code) => request('/auth/verify-otp', { method: 'POST', body: { userId, code }, auth: false }),
  register: (data) => request('/auth/register', { method: 'POST', body: data, auth: false }),
  me: () => request('/auth/me'),
  logout: (refreshToken) => request('/auth/logout', { method: 'POST', body: { refreshToken } }),
  deleteAccount: () => request('/auth/account', { method: 'DELETE' }),

  // catalogue & requests
  materials: () => request('/materials'),
  requests: () => request('/requests'),
  request: (id) => request('/requests/' + id),
  createRequest: (data) => request('/requests', { method: 'POST', body: data }),
  submit: (id) => request(`/requests/${id}/submit`, { method: 'POST' }),
  acknowledge: (id) => request(`/requests/${id}/acknowledge`, { method: 'POST' }),
  approve: (id, note) => request(`/requests/${id}/approve`, { method: 'POST', body: { note } }),
  reject: (id, reason) => request(`/requests/${id}/reject`, { method: 'POST', body: { reason } }),
  deliver: (id, recipientEmployeeId) => request(`/requests/${id}/deliver`, { method: 'POST', body: { recipientEmployeeId } }),
  consolidate: (id) => request(`/requests/${id}/consolidate`, { method: 'POST' }),
  invoice: (id) => request(`/requests/${id}/invoice`, { method: 'POST' }),
  returnItems: (id, lines, reason) => request(`/requests/${id}/return`, { method: 'POST', body: { lines, reason } }),

  // admin
  erpStatus: () => request('/admin/erp/status'),
  erpQueue: () => request('/admin/erp/queue'),
  audit: () => request('/admin/audit'),
};

export { request };
