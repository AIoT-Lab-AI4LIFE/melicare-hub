/* MELI Voice — điều hướng: nút về MELICARE, menu tài khoản, bộ chuyển ứng dụng MELICARE và đồng bộ
   trang đang mở với URL (/ = Ghi âm, /history = Lịch sử). Nạp cuối <body>, sau script định nghĩa page(). */
(function () {
  'use strict';
  var A = window.MELIVOICE_AUTH;
  if (!A) return;
  var svg = function (body) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>'; };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- trang ↔ URL ---------- */
  var PATHS = { capture: '/', history: '/history' };
  var VIEWS = { '/': 0, '/index.html': 0, '/history': 1 };
  var show = window.page;
  window.page = function (id, b) {
    show(id, b);
    if (PATHS[id] && location.pathname !== PATHS[id]) history.pushState(null, '', PATHS[id] + location.hash);
  };
  // Bấm nút nav thật để chạy đủ các xử lý đi kèm (nạp lại lịch sử, aria-current...)
  function syncView() {
    var i = VIEWS[location.pathname], navs = document.querySelectorAll('.suite-local-nav .nav');
    if (i === undefined || !navs[i]) return;
    navs[i].click();
    if (i === 0) document.getElementById('capture').classList.remove('resultOnlyMode');
  }
  window.addEventListener('popstate', syncView);
  if (location.pathname === '/history') syncView();

  /* ---------- nút về MELICARE ---------- */
  var home = document.getElementById('meliHomeV63');
  if (home) home.href = A.PORTAL_HOME;

  /* ---------- menu tài khoản ---------- */
  var account = document.getElementById('meliAuthBtnV69');
  var menu = null;
  function closeAccount(focus) {
    if (!menu) return;
    menu.remove(); menu = null;
    account.setAttribute('aria-expanded', 'false');
    if (focus) account.focus({ preventScroll: true });
  }
  function openAccount() {
    var user = A.getSession().user;
    closeSwitcher();
    menu = document.createElement('div');
    menu.className = 'mc-account-menu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', 'Tài khoản');
    menu.innerHTML = '<strong>' + esc(user.displayName) + '</strong><small>' + esc(user.email || user.username) + '</small>' +
      '<a href="' + esc(A.PORTAL_HOME) + '">Về MELICARE</a><button type="button" data-mv-logout="">Đăng xuất</button>';
    document.body.append(menu);
    var r = account.getBoundingClientRect();
    menu.style.top = r.bottom + 10 + 'px';
    menu.style.right = Math.max(12, innerWidth - r.right) + 'px';
    account.setAttribute('aria-expanded', 'true');
    menu.querySelector('a').focus();
    menu.querySelector('[data-mv-logout]').addEventListener('click', function (e) {
      e.currentTarget.disabled = true;
      A.signOut();
    });
  }
  function renderAccount() {
    var s = A.getSession();
    if (!account || !s) return;
    account.innerHTML = svg('<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>') + '<span class="mc-account-label"></span>';
    account.querySelector('.mc-account-label').textContent = s.user.displayName;
    account.setAttribute('aria-label', 'Tài khoản ' + s.user.displayName);
    account.setAttribute('aria-haspopup', 'dialog');
    account.setAttribute('aria-expanded', 'false');
  }
  if (account) {
    renderAccount();
    account.addEventListener('click', function (e) {
      e.preventDefault();
      if (menu) closeAccount(); else openAccount();
    });
    // Thẻ khác làm mới phiên (đổi tên hiển thị...) thì cập nhật nút
    window.addEventListener('melivoice:auth-changed', function () { closeAccount(); renderAccount(); });
  }

  /* ---------- bộ chuyển ứng dụng (giống assets/melicare-navigation.js của portal) ---------- */
  var SHAPES = {
    or: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-9 3v5m-2.5-2.5h5"/>',
    ocr: '<path d="M7 3H4v4m13-4h3v4M4 17v4h3m13-4v4h-3M8 7h8M8 11h7M8 15h4"/><circle cx="17" cy="16" r="3"/><path d="m19 18 3 3"/>',
    voice: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
    guide: '<path d="M12 5v16M3 3c4 0 7 .5 9 2 2-1.5 5-2 9-2v16c-4 0-7 .5-9 2-2-1.5-5-2-9-2V3Z"/><path d="M6 7h3m6 0h3M6 11h3m6 0h3"/>',
    vlm: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m5 16 4-4 4 4 3-3 5 5"/><circle cx="15.5" cy="8" r="1.5"/>',
    cdss: '<rect x="4" y="4" width="16" height="18" rx="2"/><path d="M9 2h6v4H9zM7 11h3m-3 4h3m3-1 2 2 4-5"/>',
    dx: '<path d="M4 3v5a5 5 0 0 0 10 0V3M4 3h2m6 0h2M9 13v3a5 5 0 0 0 10 0v-2"/><circle cx="19" cy="11" r="3"/>',
    pos: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M3 12h4l2-4 3 8 2-4h7"/>',
    external: '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>'
  };
  var switchHost = document.querySelector('[data-mc-switch]');
  var switchBtn = switchHost && switchHost.querySelector('button');
  var panel = null;
  function closeSwitcher(focus) {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    switchBtn.setAttribute('aria-expanded', 'false');
    if (focus) switchBtn.focus({ preventScroll: true });
  }
  // Link mang token đang có; ứng dụng đích dùng nó để đăng nhập luôn
  function updateLinks() {
    var s = A.getSession(), token = s && s.accessToken;
    panel.querySelectorAll('a[data-mc-app]').forEach(function (a) { a.href = A.appLaunchUrl(a.getAttribute('data-href'), token); });
  }
  function position() {
    var r = switchBtn.getBoundingClientRect(), w = Math.min(328, innerWidth - 24);
    panel.style.width = w + 'px';
    panel.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.right - w)) + 'px';
    panel.style.top = Math.max(12, Math.min(r.bottom + 10, innerHeight - 120)) + 'px';
    panel.style.maxHeight = Math.max(96, innerHeight - parseFloat(panel.style.top) - 14) + 'px';
  }
  function openSwitcher(focus) {
    closeAccount();
    updateLinks();
    // Mở menu thì làm mới token sắp hết hạn để các link mang token dùng được
    A.getAccessToken().then(updateLinks);
    position();
    panel.hidden = false;
    switchBtn.setAttribute('aria-expanded', 'true');
    if (focus) panel.querySelector('a').focus({ preventScroll: true });
  }
  if (switchBtn) {
    panel = document.createElement('nav');
    panel.id = 'mc-switch-panel';
    panel.className = 'mc-switch-panel';
    panel.setAttribute('aria-label', 'Các ứng dụng MELICARE');
    panel.hidden = true;
    panel.innerHTML = '<div class="mc-switch-title">Ứng dụng MELICARE</div>' + A.APP_GROUPS.map(function (g) {
      return '<div class="mc-switch-group"><p class="mc-switch-heading">' + esc(g[1]) + '</p>' + A.APPS.filter(function (app) {
        return app.group === g[0] && app.id !== A.CURRENT_APP_ID;
      }).map(function (app) {
        // noreferrer: URL trang này không lộ sang ứng dụng khác; token đi trong chính link
        return '<a class="mc-switch-link" data-mc-app="' + app.id + '" data-href="' + esc(app.href) + '" href="' + esc(app.href) +
          '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(app.name) + ' — mở trong thẻ mới">' +
          '<span class="mc-switch-icon" style="--app-tone:' + app.tone + '">' + svg(SHAPES[app.icon]) + '</span>' +
          '<span class="mc-switch-name">' + esc(app.name) + '</span><span class="mc-switch-external">' + svg(SHAPES.external) + '</span></a>';
      }).join('') + '</div>';
    }).join('');
    document.body.append(panel);
    switchBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (panel.hidden) openSwitcher(); else closeSwitcher();
    });
    switchBtn.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { e.preventDefault(); openSwitcher(true); } });
    panel.addEventListener('click', function (e) { if (e.target.closest('a')) closeSwitcher(); });
    panel.addEventListener('keydown', function (e) {
      var links = [].slice.call(panel.querySelectorAll('a')), i = links.indexOf(document.activeElement), next;
      if (e.key === 'ArrowDown') next = (i + 1) % links.length;
      if (e.key === 'ArrowUp') next = (i - 1 + links.length) % links.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = links.length - 1;
      if (next !== undefined) { e.preventDefault(); links[next].focus(); }
    });
    window.addEventListener('resize', function () { if (!panel.hidden) position(); });
    window.addEventListener('scroll', function () { if (!panel.hidden) position(); }, { passive: true });
  }

  /* ---------- đóng menu khi bấm ra ngoài / Esc ---------- */
  document.addEventListener('click', function (e) {
    if (menu && !menu.contains(e.target) && !account.contains(e.target)) closeAccount();
    if (panel && !panel.hidden && !switchHost.contains(e.target) && !panel.contains(e.target)) closeSwitcher();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (menu) { e.preventDefault(); closeAccount(true); }
    if (panel && !panel.hidden) { e.preventDefault(); closeSwitcher(true); }
  });
  window.addEventListener('resize', function () { closeAccount(); });
})();
