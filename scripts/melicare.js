document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('meliAppNavV62');
  const btn = document.getElementById('meliAppNavBtnV62');
  if (!nav || !btn) return;

  btn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
  });

  document.addEventListener('click', e => {
    if (!nav.contains(e.target)) {
      nav.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      nav.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }
  });
});

document.addEventListener('DOMContentLoaded', () => {
  const SIGN_IN_URL = 'https://medibot.leira.com.vn/api/auth/sign-in';
  const area = document.getElementById('meliAuthAreaV67');
  const modal = document.getElementById('meliAuthModalV67');
  const closeBtn = document.getElementById('meliAuthCloseV67');
  const form = document.getElementById('meliAuthFormV67');
  const error = document.getElementById('meliAuthErrorV67');
  const userInput = document.getElementById('meliAuthUserV67');
  const passInput = document.getElementById('meliAuthPassV67');
  if (!area || !modal || !closeBtn || !form || !error || !userInput || !passInput) return;
  const submitBtn = form.querySelector('.meliAuthSubmitV67');
  let pendingNav = null;

  function getUser() {
    try { return JSON.parse(localStorage.getItem('melicareUserV67') || 'null') } catch (e) { return null }
  }

  function hasToken() {
    return !!localStorage.getItem('accessToken');
  }

  function compactName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'User';
    if (parts.length === 1) return parts[0].slice(0, 14);
    const short = parts[0] + ' ' + parts[parts.length - 1];
    return short.length > 14 ? (parts[0].charAt(0) + '. ' + parts[parts.length - 1]).slice(0, 14) : short;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function showError(message) {
    error.textContent = message;
    error.style.display = 'block';
  }

  function closeModal() {
    modal.classList.remove('open');
    pendingNav = null;
  }

  function openLogin(nav) {
    pendingNav = nav || null;
    error.style.display = 'none';
    modal.classList.add('open');
    const navMenu = document.getElementById('meliAppNavV62');
    const navBtn = document.getElementById('meliAppNavBtnV62');
    if (navMenu) navMenu.classList.remove('open');
    if (navBtn) navBtn.setAttribute('aria-expanded', 'false');
    setTimeout(() => userInput.focus(), 0);
  }

  function renderAuth() {
    const user = getUser();
    if (hasToken() && user && user.name) {
      const displayName = escapeHtml(compactName(user.name));
      area.innerHTML = `
        <button class="meliUserBtnV67" id="meliUserBtnV67" type="button" title="${escapeHtml(user.name)}">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>
          <span>${displayName}</span>
        </button>`;
    } else {
      area.innerHTML = `
        <button class="meliLoginBtnV67" id="meliLoginBtnV67" type="button">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>
          <span>Login</span>
        </button>`;
      document.getElementById('meliLoginBtnV67').addEventListener('click', () => openLogin(null));
    }
  }

  function tokenRedirectBase(link) {
    const href = link.getAttribute('href') || '';
    const label = (link.textContent || '').replace(/\s+/g, '');
    if (/medibot\.leira\.com\.vn\/login/i.test(href) || /MELIGuide/i.test(href) || /MELIGuide/i.test(label)) {
      return 'https://medibot.leira.com.vn/login?token=';
    }
    if (/cdss\.leira\.com\.vn\/login/i.test(href) || /MELICDSS/i.test(href) || /MELICDSS/i.test(label)) {
      return 'https://cdss.leira.com.vn/login?token=';
    }
    return '';
  }

  function tokenRedirectUrl(base) {
    const token = localStorage.getItem('accessToken') || '';
    return base + encodeURIComponent(token);
  }

  function continueAfterLogin() {
    const next = pendingNav;
    pendingNav = null;
    if (!next) return;
    const href = next.tokenBase ? tokenRedirectUrl(next.tokenBase) : next.href;
    if (next.target === '_blank') {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    window.location.assign(href);
  }

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  document.addEventListener('click', e => {
    const link = e.target.closest('#meliAppNavMenuV62 a, a.meli-tool-card');
    if (!link) return;
    const tokenBase = tokenRedirectBase(link);
    if (tokenBase) {
      e.preventDefault();
      e.stopPropagation();
      if (!hasToken()) {
        openLogin({ tokenBase: tokenBase });
        return;
      }
      window.location.assign(tokenRedirectUrl(tokenBase));
      return;
    }
    if (hasToken()) return;
    e.preventDefault();
    e.stopPropagation();
    openLogin({
      href: link.href,
      target: link.getAttribute('target')
    });
  }, true);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const username = userInput.value.trim();
    const password = passInput.value;
    if (!username || !password) {
      showError('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }
    error.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang đăng nhập...';
    try {
      const payload = JSON.stringify({ username, password });
      const init = {
        method: 'POST',
        headers: {
          'Accept': '*/*',
          'Content-Type': 'application/json'
        },
        body: payload
      };
      let res;
      try {
        res = await fetch(SIGN_IN_URL, init);
      } catch (networkError) {
        res = await fetch('/api/auth/sign-in', init);
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.accessToken) {
        const message = data.message || data.error || 'Đăng nhập không thành công. Kiểm tra lại tên đăng nhập và mật khẩu.';
        showError(typeof message === 'string' ? message : 'Đăng nhập không thành công.');
        return;
      }
      localStorage.setItem('accessToken', data.accessToken);
      const user = data.user || {};
      localStorage.setItem('melicareUserV67', JSON.stringify({
        name: user.fullName || user.email || username,
        username: user.email || username,
        id: user.id || ''
      }));
      modal.classList.remove('open');
      form.reset();
      renderAuth();
      continueAfterLogin();
    } catch (err) {
      showError('Không kết nối được máy chủ đăng nhập.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Đăng nhập';
    }
  });

  renderAuth();
});
