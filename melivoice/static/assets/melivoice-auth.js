/* MELI Voice — đăng nhập qua portal MELICARE + MeliAuth. Nạp trong <head>, sau /config.js.
   MELI Voice không có form đăng nhập: portal mở lại trang này với ?token=<access token>; token được
   lưu vào localStorage rồi xóa khỏi URL. Refresh token chỉ nằm trong cookie HTTP-only của MeliAuth.
   Trang /login: chưa có phiên thì chuyển sang portal; mọi trang khác: chưa có phiên thì về /login. */
(function () {
  'use strict';
  var CFG = window.MELI_VOICE_CONFIG || {};
  var PORTAL_URL = new URL(CFG.portalUrl || 'https://melicare.meliq.ai/').href;
  var PORTAL_HOME = new URL('MELICARE.html', PORTAL_URL).href;
  var PORTAL_LOGIN = new URL('MELICARE_Login.html', PORTAL_URL).href;
  var AUTH_URL = (CFG.authUrl || 'https://auth.meliq.ai').replace(/\/+$/, '');
  var AUTH_API = AUTH_URL + '/api/v1/auth';
  var DEV_LOGIN = !!CFG.devLogin;
  var STORAGE_KEY = 'melivoice.auth.session.v1';
  var EXPIRY_SKEW_MS = 30000;   // làm mới sớm để token không hết hạn giữa chừng một request
  var DEFAULT_REDIRECT = '/';
  var LOGIN_PATH = '/login';

  /* ---------- ứng dụng MELICARE (giống assets/melicare-routes.js của portal) ---------- */
  var portal = function (p) { return new URL(p, PORTAL_URL).href; };
  var APP_GROUPS = [['ops', 'Vận hành bệnh viện'], ['care', 'Khám chữa bệnh']];
  var APPS = [
    { id: 'melior', name: 'MELIOR', icon: 'or', href: portal('MELI_OR.html'), group: 'ops', tone: '#1689ba' },
    { id: 'meliocr', name: 'MELIOCR', icon: 'ocr', href: 'https://meliocr.meliq.ai/login', group: 'ops', tone: '#af801e' },
    { id: 'melivoice', name: 'MELIVoice', icon: 'voice', href: 'https://melivoice.meliq.ai/', group: 'ops', tone: '#8062ba' },
    { id: 'meliguide', name: 'MELIGuide', icon: 'guide', href: 'https://medibot.leira.com.vn/login', group: 'ops', tone: '#328b7b' },
    { id: 'melivlm', name: 'MELIVLM', icon: 'vlm', href: portal('MELI_VLM.html'), group: 'care', tone: '#5377c1' },
    { id: 'melicdss', name: 'MELICDSS', icon: 'cdss', href: 'https://cdss.leira.com.vn/login', group: 'care', tone: '#418b88' },
    { id: 'melidx', name: 'MELIDx', icon: 'dx', href: portal('MELIDx.html'), group: 'care', tone: '#9a69b6' },
    { id: 'melipos', name: 'MELIPos', icon: 'pos', href: portal('MELIPostOp.html'), group: 'care', tone: '#c26374' }
  ];
  var CURRENT_APP_ID = 'melivoice';
  // Ứng dụng nhận access token qua ?token=..., kèm đường dẫn dùng khi link không có
  var TOKEN_HANDOFF_HOSTS = { 'medibot.leira.com.vn': '/login', 'cdss.leira.com.vn': '/login', 'meliocr.meliq.ai': '/login' };

  function appLaunchUrl(url, token) {
    var target;
    try { target = new URL(url); } catch (e) { return url; }
    var path = TOKEN_HANDOFF_HOSTS[target.hostname];
    if (!token || !path) return url;
    if (target.pathname === '/') target.pathname = path;
    target.searchParams.set('token', token);
    return target.href;
  }

  /* Portal đăng nhập xong sẽ mở `next` kèm ?token=... (chỉ với host trong danh sách handoff của portal). */
  function portalLoginUrl(redirect) {
    var next = new URL(LOGIN_PATH, location.origin);
    if (redirect && redirect !== DEFAULT_REDIRECT) next.searchParams.set('redirect', redirect);
    var login = new URL(PORTAL_LOGIN);
    login.searchParams.set('next', next.href);
    return login.href;
  }

  /* Chỉ nhận đường dẫn trong ứng dụng, để ?redirect= không đưa người dùng sang trang khác. */
  function safeRedirect(raw) {
    if (!raw || raw.charAt(0) !== '/' || /^\/[\/\\]/.test(raw)) return DEFAULT_REDIRECT;
    if (/^\/login(\.html)?([?\/#]|$)/.test(raw)) return DEFAULT_REDIRECT;
    return raw;
  }

  /* ---------- JWT (chỉ đọc claim cho giao diện; backend mới kiểm tra chữ ký) ---------- */
  function b64decode(part) {
    var base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    var bin = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, function (c) { return c.charCodeAt(0); }));
  }
  function b64encode(value) {
    var bytes = new TextEncoder().encode(JSON.stringify(value));
    return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeJwtPayload(token) {
    var part = String(token || '').split('.')[1];
    if (!part) return null;
    try {
      var p = JSON.parse(b64decode(part));
      return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
    } catch (e) { return null; }
  }

  /* ---------- phiên đăng nhập ---------- */
  var current;   // undefined = chưa đọc storage
  function storage() { try { return window.localStorage; } catch (e) { return null; } }
  function read() {
    try {
      var s = JSON.parse((storage() && storage().getItem(STORAGE_KEY)) || 'null');
      return s && typeof s.accessToken === 'string' && s.user ? s : null;
    } catch (e) { return null; }
  }
  function notify() { window.dispatchEvent(new CustomEvent('melivoice:auth-changed', { detail: { session: current } })); }
  function getSession() {
    if (current === undefined) current = read();
    return current;
  }
  /* `silent`: không báo thay đổi, dùng khi trang sắp rời đi (đăng xuất) để không đua với lệnh chuyển về /login. */
  function setSession(session, silent) {
    current = session;
    try {
      if (session) storage().setItem(STORAGE_KEY, JSON.stringify(session));
      else storage().removeItem(STORAGE_KEY);
    } catch (e) { /* storage đầy hoặc bị chặn: phiên vẫn sống trong bộ nhớ của thẻ này */ }
    if (!silent) notify();
  }
  function clearSession(silent) { setSession(null, silent); }
  // Thẻ khác vừa đăng nhập hoặc đăng xuất
  window.addEventListener('storage', function (e) {
    if (e.key !== STORAGE_KEY) return;
    current = read(); notify();
  });

  function isFresh(s) { return !!s && s.expiresAt - EXPIRY_SKEW_MS > Date.now(); }
  function str(v) { return typeof v === 'string' ? v : null; }

  /* Phiên từ access token portal chuyển sang; null nếu không phải access token còn hạn. */
  function sessionFromToken(token) {
    var c = decodeJwtPayload(token);
    if (!c || typeof c.exp !== 'number' || c.exp * 1000 <= Date.now()) return null;
    if (c.type !== undefined && c.type !== 'access') return null;
    if (typeof c.sub !== 'number' && typeof c.sub !== 'string') return null;
    var username = str(c.username) || String(c.sub);
    return {
      accessToken: token, expiresAt: c.exp * 1000,
      user: { id: c.sub, username: username, displayName: str(c.displayName) || username,
        roles: Array.isArray(c.roles) ? c.roles.map(String) : [], email: str(c.email), avatarUrl: str(c.avatarUrl) }
    };
  }
  function sessionFromAuthResponse(res) {
    var exp = (decodeJwtPayload(res.accessToken) || {}).exp;
    return { accessToken: res.accessToken, expiresAt: res.expiresIn > 0 ? Date.now() + res.expiresIn * 1000 : Number(exp) * 1000, user: res.user };
  }

  /* ---------- MeliAuth: chỉ làm mới và thu hồi phiên ---------- */
  function callAuth(path) {
    // credentials: include để MeliAuth đọc/ghi cookie refresh HTTP-only
    return fetch(AUTH_API + path, {
      method: 'POST', credentials: 'include', body: '{}',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' }
    }).then(function (r) {
      if (r.ok) return r.status === 204 ? null : r.json();
      var err = new Error(r.status === 401 ? 'Phiên đăng nhập đã hết hạn.' : r.statusText);
      err.status = r.status;
      throw err;
    });
  }

  /* Người gọi đồng thời dùng chung một request: MeliAuth thu hồi mọi phiên khi refresh token bị dùng lại. */
  var refreshing = null;
  function refreshSession() {
    if (!refreshing) {
      refreshing = callAuth('/refresh').then(function (res) {
        var s = sessionFromAuthResponse(res);
        setSession(s);
        return s;
      }, function (e) {
        if (e.status === 401 || e.status === 403) clearSession();
        return null;
      }).then(function (s) { refreshing = null; return s; });
    }
    return refreshing;
  }

  /* Access token hiện tại, làm mới trước nếu sắp hết hạn. Lỗi mạng thì giữ token cũ, để 401 của backend quyết định. */
  function getAccessToken() {
    var s = getSession();
    if (!s) return Promise.resolve(null);
    if (isFresh(s)) return Promise.resolve(s.accessToken);
    return refreshSession().then(function (r) {
      return (r && r.accessToken) || (getSession() && getSession().accessToken) || null;
    });
  }

  /* fetch kèm Bearer token. Gặp 401 thì làm mới một lần rồi thử lại; vẫn 401 thì đăng xuất (trang tự về /login). */
  function authFetch(url, init) {
    init = init || {};
    function send(token) {
      var headers = new Headers(init.headers);
      if (token) headers.set('Authorization', 'Bearer ' + token);
      return fetch(url, Object.assign({}, init, { headers: headers }));
    }
    return getAccessToken().then(send).then(function (res) {
      if (res.status !== 401 || !getSession()) return res;
      return refreshSession().then(function (renewed) {
        return renewed ? send(renewed.accessToken) : res;
      }).then(function (r) {
        if (r.status === 401) clearSession();
        return r;
      });
    });
  }

  function signOut() {
    // Thu hồi phiên MeliAuth; lỗi mạng vẫn đăng xuất ở máy này
    return callAuth('/logout').catch(function () {}).then(function () {
      clearSession(true);
      // Không kèm `next`: portal còn phiên sẽ đăng nhập lại ngay vào đây
      location.assign(PORTAL_LOGIN);
    });
  }

  /* Đăng nhập giả khi chạy local với DEV_LOGIN (portal không trả token về localhost). */
  function devSignIn() {
    if (!DEV_LOGIN) return;
    var iat = Math.floor(Date.now() / 1000);
    var token = b64encode({ alg: 'none', typ: 'JWT' }) + '.' + b64encode({
      sub: 101, type: 'access', username: 'bacsi.dev', displayName: 'Bác sĩ (dev)', roles: ['doctor'],
      email: 'bacsi.dev@example.com', avatarUrl: null, iat: iat, exp: iat + 12 * 3600
    }) + '.dev';
    setSession(sessionFromToken(token));
  }

  function loginPath(redirect) {
    return redirect && redirect !== DEFAULT_REDIRECT ? LOGIN_PATH + '?redirect=' + encodeURIComponent(redirect) : LOGIN_PATH;
  }
  var leaving = false;
  function leave(url) {
    if (leaving) return;   // đã chuyển một lần; gọi lại sẽ hủy lần chuyển trước
    leaving = true;
    // Ẩn trang trong lúc chuyển hướng để không nháy giao diện của người chưa đăng nhập
    document.documentElement.style.visibility = 'hidden';
    location.replace(url);
  }

  /* ---------- xử lý URL khi nạp trang ---------- */
  var here = new URL(location.href);
  var onLogin = /^\/login(\.html)?\/?$/.test(here.pathname);
  var handoff = here.searchParams.get('token');
  if (handoff !== null) {
    here.searchParams.delete('token');
    var s = sessionFromToken(handoff);
    var target = onLogin ? safeRedirect(here.searchParams.get('redirect')) : here.pathname + here.search + here.hash;
    if (s) {
      setSession(s, true);
      // replace: token rời khỏi lịch sử trình duyệt
      if (onLogin) leave(target);
      else history.replaceState(history.state, '', target);
    } else {
      // Token hỏng dừng ở /login?error=token, để portal cấp token sai không gây vòng lặp chuyển hướng
      var p = new URLSearchParams({ error: 'token' });
      if (safeRedirect(target) !== DEFAULT_REDIRECT) p.set('redirect', safeRedirect(target));
      leave(LOGIN_PATH + '?' + p);
    }
  }
  if (!leaving) {
    if (onLogin) {
      if (!here.searchParams.has('error') && getSession()) leave(safeRedirect(here.searchParams.get('redirect')));
    } else {
      if (!getSession()) leave(loginPath(here.pathname + here.search));
      // Đăng xuất (ở thẻ này hoặc thẻ khác) thì về /login, nhớ trang đang mở
      window.addEventListener('melivoice:auth-changed', function () {
        if (!getSession()) leave(loginPath(location.pathname + location.search));
      });
    }
  }

  window.MELIVOICE_AUTH = Object.freeze({
    REDIRECTING: leaving,   // trang đang được chuyển đi, không cần dựng giao diện
    PORTAL_HOME: PORTAL_HOME, PORTAL_LOGIN: PORTAL_LOGIN, AUTH_URL: AUTH_URL, DEV_LOGIN: DEV_LOGIN,
    APPS: APPS, APP_GROUPS: APP_GROUPS, CURRENT_APP_ID: CURRENT_APP_ID,
    getSession: getSession, getAccessToken: getAccessToken, refreshSession: refreshSession,
    fetch: authFetch, signOut: signOut, devSignIn: devSignIn,
    appLaunchUrl: appLaunchUrl, portalLoginUrl: portalLoginUrl, safeRedirect: safeRedirect,
    decodeJwtPayload: decodeJwtPayload, sessionFromToken: sessionFromToken
  });
})();
