/* Per-app login pages (<html data-tool-id="…" data-tool-login="true">) and the pages they guard (<html data-tool-id="…">).
 * Authentication is MeliAuth (meli-auth.js); destinations come from melicare-routes.js.
 * Signed out, the homepage sends "Open application" to <App>_Login.html in the same tab; a successful login then opens
 * the app there (sso apps receive ?token=… via MELI_AUTH.openUrl). Signed in, the homepage opens the app directly.
 */
(() => {
 'use strict';
 const auth = window.MELI_AUTH;
 const site = window.MELICARE_SITE;
 const root = document.documentElement;
 const app = site?.find(root.dataset.toolId);
 if (!auth || !app) return;
 const isLogin = root.dataset.toolLogin === 'true';
 const currentPage = () => decodeURIComponent(location.pathname.split('/').pop() || '');

 // An sso app on its own host (e.g. https://melipos.meliq.ai) may ask to come back to any page there.
 function sameAppHost(next) {
  if (!app.sso || !site.isExternal(app.href)) return null;
  try {
   const url = new URL(next);
   if (url.protocol !== 'https:' || url.host !== new URL(app.href).host) return null;
   url.searchParams.delete('token');
   return url.href;
  } catch (_) {
   return null;
  }
 }

 // Only pages that belong to this app are accepted as ?next=, so the login cannot redirect elsewhere.
 function destination(next) {
  const route = next && site.routes.find((item) => item.href === next && !site.isExternal(item.href));
  if (route && site.appFor(route.id) === app) return route.href;
  return (next && sameAppHost(next)) || app.href;
 }

 function loginUrl(page) {
  const url = new URL(app.login, location.href);
  if (page && destination(page) === page && page !== app.href) url.searchParams.set('next', page);
  return url.href;
 }

 if (!isLogin) {
  auth.getValidAccessToken().then((token) => {
   if (!token) {
    location.replace(loginUrl(currentPage()));
    return;
   }
   document.body.classList.remove('tool-locked');
  });
  return;
 }

 function ready() {
  const $ = (id) => document.getElementById(id);
  const heading = $('auth-heading');
  const description = $('auth-description');
  const success = $('auth-success');
  const tabs = Array.from(document.querySelectorAll('[data-auth-tab]'));

  function selectTab(mode, focus = false) {
   const register = mode === 'register';
   $('tool-login-panel').hidden = register;
   $('tool-register-panel').hidden = !register;
   heading.textContent = register ? 'Create your ' + app.name + ' account' : 'Welcome back';
   description.textContent = register ? 'Create a MeliAuth account to use ' + app.name + '.' : 'Sign in to continue your work.';
   tabs.forEach((tab) => {
    const active = tab.dataset.authTab === mode;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && focus) tab.focus();
   });
   success.hidden = true;
  }

  tabs.forEach((tab, index) => {
   tab.addEventListener('click', () => selectTab(tab.dataset.authTab));
   tab.addEventListener('keydown', (event) => {
    const keys = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    selectTab(tabs[keys[event.key]].dataset.authTab, true);
   });
  });
  document.querySelectorAll('[data-select-auth]').forEach((button) => button.addEventListener('click', () => {
   selectTab(button.dataset.selectAuth);
   $(button.dataset.selectAuth === 'register' ? 'register-name' : 'tool-username').focus();
  }));

  function togglePassword(button, input) {
   const show = input.type === 'password';
   input.type = show ? 'text' : 'password';
   button.textContent = show ? 'Hide' : 'Show';
   button.setAttribute('aria-pressed', String(show));
  }
  $('tool-show-password').addEventListener('click', (event) => togglePassword(event.currentTarget, $('tool-password')));
  document.querySelectorAll('[data-password-target]').forEach((button) => button.addEventListener('click', () => togglePassword(button, $(button.dataset.passwordTarget))));

  const target = destination(new URLSearchParams(location.search).get('next'));

  // Shared submit flow: one request at a time, errors shown inline, the app opened on success.
  function bindForm(form, submit, error, label, busyLabel, run) {
   let pending = false;
   form.addEventListener('input', () => {
    error.hidden = true;
    form.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'));
   });
   form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    pending = true;
    submit.disabled = true;
    submit.firstChild.textContent = busyLabel;
    try {
     if (await run() === false) return;
     await auth.openUrl(target);
    } catch (problem) {
     error.textContent = problem?.message || 'Could not reach the authentication server. Please try again.';
     error.hidden = false;
    } finally {
     pending = false;
     submit.disabled = false;
     submit.firstChild.textContent = label;
    }
   });
  }

  const username = $('tool-username');
  const password = $('tool-password');
  const loginError = $('tool-login-error');
  bindForm($('tool-login-form'), $('tool-login-submit'), loginError, 'Sign in ', 'Signing in… ', async () => {
   try {
    await auth.login(username.value, password.value);
   } catch (problem) {
    username.setAttribute('aria-invalid', 'true');
    password.setAttribute('aria-invalid', 'true');
    password.focus();
    throw problem;
   }
   password.value = '';
  });

  const registerPassword = $('register-password');
  const confirm = $('register-confirm');
  const registerError = $('register-error');
  bindForm($('tool-register-form'), $('register-submit'), registerError, 'Create account', 'Creating account…', async () => {
   if (registerPassword.value !== confirm.value) {
    registerError.textContent = 'The passwords do not match.';
    registerError.hidden = false;
    confirm.setAttribute('aria-invalid', 'true');
    confirm.focus();
    return false;
   }
   await auth.register({
    displayName: $('register-name').value,
    username: $('register-username').value,
    email: $('register-email').value,
    password: registerPassword.value,
   });
   registerPassword.value = '';
   confirm.value = '';
  });

  // Already signed in (e.g. back from the app): show who is signed in instead of the form.
  const signedIn = $('tool-preview-success');
  function render() {
   const user = auth.isAuthenticated() ? auth.getUser() : null;
   signedIn.hidden = !user;
   document.querySelector('.or-auth-tabs').hidden = !!user;
   if (!user) {
    selectTab(new URLSearchParams(location.search).get('view') === 'register' ? 'register' : 'login');
    return;
   }
   $('tool-login-panel').hidden = true;
   $('tool-register-panel').hidden = true;
   success.hidden = true;
   heading.textContent = 'You are signed in';
   description.textContent = 'A MeliAuth session is active in this window.';
   $('tool-preview-account').textContent = (user.displayName || user.username || 'MeliAuth account') + (user.username && user.displayName ? ' · ' + user.username : '');
  }
  $('tool-preview-continue').addEventListener('click', () => auth.openUrl(target));
  $('tool-preview-logout').addEventListener('click', async () => {
   await auth.logout();
   render();
   username.focus();
  });

  $('tool-login-fields').disabled = false;
  $('register-fields').disabled = false;
  render();
  window.addEventListener('pageshow', (event) => {
   if (event.persisted) render();
  });
 }

 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
 else ready();
})();
