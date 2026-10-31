(() => {
    'use strict';

    function scriptUrl(name) {
        const current = document.currentScript;
        if (current?.src) return new URL(name, current.src).href;
        return new URL('assets/' + name, document.baseURI).href;
    }

    function boot() {
        const auth = window.MELI_AUTH;
        const site = window.MELICARE_SITE;
        if (!auth) {
            console.error('meli-auth.js must load before melicare-auth.js');
            return;
        }
        if (!site) {
            console.error('melicare-routes.js must load before melicare-auth.js');
            return;
        }

        const paths = site.dashboards;
        const icon = '<svg class="mc-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';

        function sessionUser() {
            const user = auth.getUser();
            if (!user) return null;
            const workspaceRole = auth.getWorkspaceRole();
            return {
                id: user.id,
                username: user.username,
                name: user.displayName || user.username,
                role: workspaceRole,
                roles: Array.isArray(user.roles) ? user.roles : [],
                email: user.email || null,
                raw: user,
            };
        }

        function get() {
            return sessionUser();
        }

        async function logout() {
            await auth.logout();
            location.assign(site.home);
        }

        function dashboard(user = get()) {
            if (user?.role) location.assign(paths[user.role] || paths.doctor);
            else if (user) location.assign(site.login);
            else location.assign(site.login);
        }

        window.MELICARE_DEMO_AUTH = { getUser: get, logout, openDashboard: dashboard };
        window.MELICARE_AUTH = { getUser: get, logout, openDashboard: dashboard, openUrl: auth.openUrl };
        auth.bindTokenHandoffLinks(document);

        function ready() {
            const requiredRole = document.body.dataset.mcDashboard;
            const user = get();
            if (requiredRole) {
                if (!user) {
                    location.replace(site.login);
                    return;
                }
                if (!user.role) {
                    location.replace(site.login);
                    return;
                }
                if (user.role !== requiredRole) {
                    location.replace(paths[user.role] || site.login);
                    return;
                }
            }

            document.querySelectorAll('[data-mc-account]').forEach((b) => {
                b.innerHTML = icon + '<span class="mc-account-label"></span>';
                b.querySelector('span').textContent = user ? user.name : 'Sign in';
                b.setAttribute('aria-label', user ? 'Account ' + user.name : 'Sign in to MELICARE');
                b.setAttribute('aria-expanded', 'false');
            });

            let menu = null;
            let trigger = null;

            function close() {
                menu?.remove();
                menu = null;
                trigger?.setAttribute('aria-expanded', 'false');
            }

            document.addEventListener('melicare:close-account-menu', () => close());

            function openMenu(button) {
                if (menu && trigger === button) {
                    close();
                    return;
                }
                close();
                trigger = button;
                menu = document.createElement('div');
                menu.className = 'mc-account-menu';
                menu.setAttribute('role', 'dialog');
                menu.setAttribute('aria-label', 'Account');
                const name = document.createElement('strong');
                name.textContent = user.name;
                menu.append(name);
                const detail = document.createElement('small');
                const roleLabel = user.role === 'admin' ? 'Hospital management' : user.role === 'doctor' ? 'Physician' : 'No role selected';
                detail.textContent = roleLabel + ' · Signed in';
                menu.append(detail);
                if (user.role) {
                    const link = document.createElement('a');
                    link.href = paths[user.role];
                    link.textContent = 'Open my dashboard';
                    menu.append(link);
                }
                const switchRole = document.createElement('a');
                switchRole.href = site.login;
                switchRole.textContent = 'Switch workspace role';
                switchRole.addEventListener('click', (e) => {
                    e.preventDefault();
                    auth.clearWorkspaceRole();
                    location.assign(site.login);
                });
                menu.append(switchRole);
                const out = document.createElement('button');
                out.type = 'button';
                out.dataset.mcLogout = '';
                out.textContent = 'Sign out';
                menu.append(out);
                document.body.append(menu);
                const r = button.getBoundingClientRect();
                menu.style.top = r.bottom + 10 + 'px';
                menu.style.right = Math.max(12, innerWidth - r.right) + 'px';
                button.setAttribute('aria-expanded', 'true');
                (menu.querySelector('a') || out).focus();
            }

            document.addEventListener('click', (e) => {
                const out = e.target.closest('[data-mc-logout]');
                if (out) {
                    e.preventDefault();
                    logout();
                    return;
                }
                const b = e.target.closest('[data-mc-account]');
                if (b) {
                    e.preventDefault();
                    if (user) openMenu(b);
                    else location.assign(site.login);
                    return;
                }
                if (menu && !menu.contains(e.target)) close();
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && menu) {
                    close();
                    trigger?.focus();
                }
            });
            window.addEventListener('resize', close);

            const form = document.getElementById('mc-login-form');
            if (!form) return;

            const loginInput = document.getElementById('mc-username');
            const pass = document.getElementById('mc-password');
            const error = document.getElementById('mc-login-error');
            const submit = document.getElementById('mc-login-submit');
            const showPassword = document.getElementById('mc-show-password');
            const roleStep = document.getElementById('mc-role-step');
            const loginStep = document.getElementById('mc-login-step');
            const roleUserLabel = document.getElementById('mc-role-user');

            const clear = () => {
                if (!error) return;
                error.hidden = true;
                error.textContent = '';
                loginInput?.removeAttribute('aria-invalid');
                pass?.removeAttribute('aria-invalid');
            };

            function showRoleStep(current = get()) {
                if (loginStep) loginStep.hidden = true;
                if (roleStep) roleStep.hidden = false;
                if (roleUserLabel && current) {
                    roleUserLabel.textContent = current.name + (current.username ? ' · ' + current.username : '');
                }
                roleStep?.querySelector('[data-workspace-role]')?.focus();
            }

            function showLoginStep() {
                if (roleStep) roleStep.hidden = true;
                if (loginStep) loginStep.hidden = false;
            }

            form.addEventListener('input', clear);

            if (showPassword && pass) {
                showPassword.addEventListener('click', (e) => {
                    const visible = pass.type === 'password';
                    pass.type = visible ? 'text' : 'password';
                    e.currentTarget.textContent = visible ? 'Hide' : 'Show';
                    e.currentTarget.setAttribute('aria-pressed', String(visible));
                });
            }

            roleStep?.querySelectorAll('[data-workspace-role]').forEach((button) => {
                button.addEventListener('click', () => {
                    const role = button.dataset.workspaceRole;
                    try {
                        auth.setWorkspaceRole(role);
                        dashboard(get());
                    } catch (err) {
                        if (error) {
                            error.textContent = err?.message || 'Could not select the role.';
                            error.hidden = false;
                            showLoginStep();
                        }
                    }
                });
            });

            document.getElementById('mc-role-back')?.addEventListener('click', () => {
                auth.clearSession();
                showLoginStep();
                clear();
                loginInput?.focus();
            });

            // Set by MELI_AUTH.openUrl when an external app needs a session first; only token-handoff hosts are honoured.
            const next = new URLSearchParams(location.search).get('next');
            const handoff = next && auth.isTokenHandoffUrl(next) ? next : null;
            if (handoff && user) {
                auth.openUrl(handoff);
                return;
            }

            if (user?.role) {
                dashboard(user);
                return;
            }
            if (user && !user.role) {
                showRoleStep(user);
                return;
            }

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                clear();
                const identifier = loginInput.value.trim();
                const password = pass.value;
                if (!identifier || !password) {
                    error.textContent = 'Please enter your account and password.';
                    error.hidden = false;
                    return;
                }
                submit.disabled = true;
                try {
                    await auth.login(identifier, password);
                    pass.value = '';
                    if (handoff) {
                        await auth.openUrl(handoff);
                        return;
                    }
                    showRoleStep(get());
                } catch (err) {
                    error.textContent = err?.message || 'Sign-in failed. Please try again.';
                    error.hidden = false;
                    loginInput.setAttribute('aria-invalid', 'true');
                    pass.setAttribute('aria-invalid', 'true');
                    pass.focus();
                } finally {
                    submit.disabled = false;
                }
            });
        }

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
        else ready();
    }

    if (window.MELI_AUTH) {
        boot();
        return;
    }

    const loader = document.createElement('script');
    loader.src = scriptUrl('meli-auth.js?v=20261017');
    loader.onload = boot;
    loader.onerror = () => console.error('Failed to load meli-auth.js');
    (document.head || document.documentElement).appendChild(loader);
})();
