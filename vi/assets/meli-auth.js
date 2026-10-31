(() => {
 'use strict';

 const AUTH_URL = (window.MELI_AUTH_URL || 'https://auth.meliq.ai').replace(/\/+$/, '');
 const API = AUTH_URL + '/api/v1';
 const STORAGE_KEY = 'melicare.auth.session.v1';
 const EXPIRY_SKEW_MS = 30_000;

 let memorySession = null;
 let refreshPromise = null;

 function readStorage() {
  try {
   const raw = sessionStorage.getItem(STORAGE_KEY);
   if (!raw) return null;
   const parsed = JSON.parse(raw);
   if (!parsed || typeof parsed.accessToken !== 'string') return null;
   return parsed;
  } catch (_) {
   return null;
  }
 }

 function writeStorage(session) {
  memorySession = session;
  try {
   if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
   else sessionStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
 }

 function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
   const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
   const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
   return JSON.parse(atob(padded));
  } catch (_) {
   return null;
  }
 }

 function accessExpiresAt(accessToken, expiresIn) {
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
   return Date.now() + expiresIn * 1000;
  }
  const payload = decodeJwtPayload(accessToken);
  if (payload && Number.isFinite(payload.exp)) return payload.exp * 1000;
  return Date.now() + 15 * 60 * 1000;
 }

 function normalizeSession(data) {
  if (!data || typeof data.accessToken !== 'string') {
   throw new Error('Phản hồi đăng nhập không hợp lệ.');
  }
  return {
   accessToken: data.accessToken,
   refreshToken: typeof data.refreshToken === 'string' ? data.refreshToken : null,
   expiresAt: accessExpiresAt(data.accessToken, data.expiresIn),
   user: data.user && typeof data.user === 'object' ? data.user : null,
  };
 }

 function getSession() {
  if (memorySession) return memorySession;
  memorySession = readStorage();
  return memorySession;
 }

 function setSession(data, options = {}) {
  const previous = getSession();
  const session = normalizeSession(data);
  if (options.keepWorkspaceRole && (previous?.workspaceRole === 'admin' || previous?.workspaceRole === 'doctor')) {
   session.workspaceRole = previous.workspaceRole;
  }
  writeStorage(session);
  dispatch('melicare:auth-changed', { session });
  return session;
 }

 function clearSession() {
  writeStorage(null);
  dispatch('melicare:auth-changed', { session: null });
 }

 function getWorkspaceRole() {
  const role = getSession()?.workspaceRole;
  return role === 'admin' || role === 'doctor' ? role : null;
 }

 function setWorkspaceRole(role) {
  if (role !== 'admin' && role !== 'doctor') {
   throw new Error('Vai trò không hợp lệ.');
  }
  const session = getSession();
  if (!session?.accessToken) {
   throw new Error('Chưa đăng nhập.');
  }
  session.workspaceRole = role;
  writeStorage(session);
  dispatch('melicare:auth-changed', { session });
  return role;
 }

 function clearWorkspaceRole() {
  const session = getSession();
  if (!session) return null;
  delete session.workspaceRole;
  writeStorage(session);
  dispatch('melicare:auth-changed', { session });
  return session;
 }

 function dispatch(name, detail) {
  try {
   window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch (_) {}
 }

 function isAccessFresh(session, skewMs = EXPIRY_SKEW_MS) {
  return !!(session && session.accessToken && Number(session.expiresAt) - skewMs > Date.now());
 }

 async function parseError(response) {
  let message = 'Yêu cầu xác thực thất bại.';
  try {
   const body = await response.json();
   if (typeof body?.message === 'string') message = body.message;
   else if (Array.isArray(body?.message) && body.message.length) message = body.message.join(', ');
   else if (typeof body?.error === 'string') message = body.error;
  } catch (_) {
   if (response.status === 401) message = 'Tài khoản hoặc mật khẩu không đúng.';
   else if (response.status >= 500) message = 'Máy chủ xác thực đang gặp sự cố. Thử lại sau.';
  }
  const error = new Error(message);
  error.status = response.status;
  return error;
 }

 async function request(path, options = {}) {
  const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
  if (options.body != null && !headers['Content-Type']) {
   headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(API + path, {
   method: options.method || 'GET',
   headers,
   body: options.body != null ? JSON.stringify(options.body) : undefined,
   credentials: 'include',
   signal: options.signal,
  });
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
 }

 async function login(identifier, password, options = {}) {
  const id = String(identifier || '').trim();
  const pwd = String(password || '');
  if (!id || !pwd) {
   const error = new Error('Vui lòng nhập tài khoản và mật khẩu.');
   error.status = 400;
   throw error;
  }
  const data = await request('/auth/login', {
   method: 'POST',
   body: { identifier: id, password: pwd },
   signal: options.signal,
  });
  return setSession(data);
 }

 // POST /auth/register requires username, displayName and password; it returns a session like login.
 async function register(profile, options = {}) {
  const body = {
   username: String(profile?.username || '').trim(),
   displayName: String(profile?.displayName || '').trim(),
   password: String(profile?.password || ''),
  };
  const email = String(profile?.email || '').trim();
  if (email) body.email = email;
  if (!body.username || !body.displayName || !body.password) {
   const error = new Error('Vui lòng nhập họ tên, tên đăng nhập và mật khẩu.');
   error.status = 400;
   throw error;
  }
  const data = await request('/auth/register', { method: 'POST', body, signal: options.signal });
  return setSession(data);
 }

 async function refresh(options = {}) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
   const current = getSession();
   const body = {};
   if (current?.refreshToken) body.refreshToken = current.refreshToken;
   try {
    const data = await request('/auth/refresh', {
     method: 'POST',
     body,
     signal: options.signal,
    });
    return setSession(data, { keepWorkspaceRole: true });
   } catch (error) {
    if (error.status === 401 || error.status === 403) clearSession();
    throw error;
   } finally {
    refreshPromise = null;
   }
  })();
  return refreshPromise;
 }

 // Revokes the refresh token server-side (best effort) and always clears the local session.
 async function logout() {
  const refreshToken = getSession()?.refreshToken;
  try {
   await request('/auth/logout', { method: 'POST', body: refreshToken ? { refreshToken } : {} });
  } catch (_) {}
  clearSession();
 }

 async function getValidAccessToken(options = {}) {
  const session = getSession();
  if (isAccessFresh(session)) return session.accessToken;
  try {
   const renewed = await refresh(options);
   return renewed.accessToken;
  } catch (_) {
   return null;
  }
 }

 function getAccessToken() {
  const session = getSession();
  return session?.accessToken || null;
 }

 function getRefreshToken() {
  const session = getSession();
  return session?.refreshToken || null;
 }

 function getUser() {
  return getSession()?.user || null;
 }

 function isAuthenticated() {
  return !!getSession()?.accessToken;
 }

 function primaryRole(user = getUser()) {
  const roles = Array.isArray(user?.roles) ? user.roles.map(String) : [];
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('doctor') || roles.includes('physician') || roles.includes('operator')) return 'doctor';
  return roles[0] || 'doctor';
 }

 // Hosts that receive the access token as ?token=..., taken from the `sso` routes in melicare-routes.js.
 function tokenHandoffHosts() {
  const routes = (window.MELICARE_SITE && window.MELICARE_SITE.routes) || [];
  return new Set(routes.filter((route) => route.sso).map((route) => new URL(route.href, location.href).hostname));
 }

 function isTokenHandoffUrl(url) {
  try {
   return tokenHandoffHosts().has(new URL(url, location.href).hostname);
  } catch (_) {
   return false;
  }
 }

 function withAccessToken(url, token) {
  const target = new URL(url, location.href);
  if (token) target.searchParams.set('token', token);
  else target.searchParams.delete('token');
  return target.toString();
 }

 async function resolveHandoffUrl(url) {
  const token = await getValidAccessToken();
  return withAccessToken(url, token || '');
 }

 async function openUrl(url, options = {}) {
  let href = String(url || '');
  if (isTokenHandoffUrl(href)) {
   const token = await getValidAccessToken();
   if (!token) {
    const login = new URL((window.MELICARE_SITE && window.MELICARE_SITE.login) || 'MELICARE_Login.html', location.href);
    login.searchParams.set('next', href);
    location.assign(login.toString());
    return;
   }
   href = withAccessToken(href, token);
  }
  if (options.newTab) window.open(href, '_blank', 'noopener,noreferrer');
  else location.assign(href);
 }

 function bindTokenHandoffLinks(root = document) {
  root.addEventListener(
   'click',
   (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
     return;
    }
    if (!isTokenHandoffUrl(link.href)) return;
    event.preventDefault();
    openUrl(link.href, { newTab: link.target === '_blank' });
   },
   true,
  );
 }

 window.MELI_AUTH = Object.freeze({
  AUTH_URL,
  API,
  login,
  register,
  logout,
  refresh,
  getSession,
  setSession,
  clearSession,
  getAccessToken,
  getRefreshToken,
  getValidAccessToken,
  getUser,
  getWorkspaceRole,
  setWorkspaceRole,
  clearWorkspaceRole,
  isAuthenticated,
  isAccessFresh,
  primaryRole,
  decodeJwtPayload,
  isTokenHandoffUrl,
  isMedibotUrl: isTokenHandoffUrl,
  withAccessToken,
  resolveHandoffUrl,
  resolveMedibotUrl: resolveHandoffUrl,
  openUrl,
  bindTokenHandoffLinks,
  bindMedibotLinks: bindTokenHandoffLinks,
 });
})();


