// FlatMate — Main Application Script
// Handles global UI, navbar, session, toasts

(function() {
    'use strict';

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/\"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // -------------------- DOM refs --------------------
    const navToggle = document.getElementById('navToggle');
    const navbarNav = document.getElementById('navbarNav');
    const navbarActions = document.getElementById('navbarActions');

    // -------------------- Unread messages --------------------
    let unreadMessageCount = 0;

    // -------------------- Navbar toggle --------------------
    if (navToggle) {
        navToggle.addEventListener('click', () => {
            navbarNav.classList.toggle('open');
        });
    }

    // Close nav on link click (mobile)
    document.querySelectorAll('.navbar-nav ul a').forEach(link => {
        link.addEventListener('click', () => {
            navbarNav.classList.remove('open');
        });
    });

    // -------------------- Session / Auth UI --------------------
    async function updateNavbar() {
        if (!navbarActions) return;
        try {
            const res = await fetch('/api/auth/session', { credentials: 'include' });
            const data = await res.json();

            if (data.authenticated) {
                const user = data.user || {};
                const isOwner = ['Owner', 'Both'].includes(user.role);
                const firstName = escapeHtml((user.name || 'Account').split(' ')[0]);

                navbarActions.innerHTML = `
                    <button class="notification-btn nav-icon-btn" id="notificationBtn" title="Notifications" aria-label="Notifications">
                        <i class="far fa-bell"></i>
                        <span id="notificationBadge" class="notification-badge" hidden>0</span>
                    </button>
                    <div class="nav-account" id="navAccount">
                        <button class="nav-account-trigger" id="navAccountTrigger" aria-expanded="false" aria-haspopup="true">
                            <span class="nav-avatar"><i class="far fa-user"></i></span>
                            <span class="nav-account-name">${firstName}</span>
                            <i class="fas fa-chevron-down nav-account-chevron"></i>
                        </button>
                        <div class="nav-account-menu" id="navAccountMenu" role="menu">
                            <div class="nav-menu-user">
                                <strong>${escapeHtml(user.name || 'Account')}</strong>
                                <span>${isOwner ? (user.role === 'Both' ? 'Seeker & Owner' : 'Owner') : 'Home Seeker'}</span>
                            </div>
                            <div class="nav-menu-divider"></div>
                            <a href="/dashboard.html" role="menuitem"><i class="fas fa-table-cells-large"></i><span>Dashboard</span></a>
                            <a href="/chat.html" role="menuitem"><i class="far fa-comment-dots"></i><span>Messages</span></a>
                            <a href="/profile.html" role="menuitem"><i class="far fa-user"></i><span>My Profile</span></a>
                            <div class="nav-menu-divider"></div>
                            <button id="logoutBtn" class="nav-menu-signout" role="menuitem"><i class="fas fa-arrow-right-from-bracket"></i><span>Sign Out</span></button>
                        </div>
                    </div>
                `;

                setupNotifications();

                const trigger = document.getElementById('navAccountTrigger');
                const account = document.getElementById('navAccount');
                trigger?.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const open = account.classList.toggle('open');
                    trigger.setAttribute('aria-expanded', String(open));
                });
                document.addEventListener('click', () => {
                    account?.classList.remove('open');
                    trigger?.setAttribute('aria-expanded', 'false');
                }, { once: true });

                document.getElementById('logoutBtn')?.addEventListener('click', async () => {
                    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); }
                    finally { window.location.href = '/'; }
                });
            } else {
                navbarActions.innerHTML = `
                    <a href="/login.html" class="nav-signin">Sign In</a>
                    <a href="/register.html" class="btn btn-primary btn-small nav-join">Join FlatMate</a>
                `;
            }
        } catch (err) {
            console.error('Failed to get session:', err);
        }
    }

    async function setupNotifications() {
        const btn = document.getElementById('notificationBtn');
        if (!btn) return;
        try {
            const res = await fetch('/api/notifications', {credentials:'include'});
            const data = await res.json();
            if (!res.ok) return;
            const badge=document.getElementById('notificationBadge');
            if (badge) { badge.textContent=data.unread||0; badge.hidden=!(data.unread>0); }
            btn.addEventListener('click', async () => {
                const existing=document.getElementById('notificationPanel'); if(existing){existing.remove();return;}
                const panel=document.createElement('div'); panel.id='notificationPanel'; panel.className='notification-panel';
                panel.innerHTML=`<div class="notification-panel-head"><strong>Notifications</strong><button id="markAllNotifications">Mark all read</button></div><div class="notification-list">${(data.notifications||[]).map(n=>`<a class="notification-item ${n.IsRead?'':'unread'}" href="${escapeHtml(n.Link||'#')}" data-id="${Number(n.Id)}"><strong>${escapeHtml(n.Title)}</strong><span>${escapeHtml(n.Message||'')}</span></a>`).join('') || '<p class="notification-empty">No notifications yet.</p>'}</div>`;
                document.body.appendChild(panel);
                panel.querySelector('#markAllNotifications')?.addEventListener('click', async()=>{await fetch('/api/notifications/read-all',{method:'PUT',credentials:'include'});panel.remove();setupNotifications();});
                panel.querySelectorAll('.notification-item.unread').forEach(item=>item.addEventListener('click',async()=>{await fetch(`/api/notifications/${item.dataset.id}/read`,{method:'PUT',credentials:'include'});}));
            });
        } catch (_) {}
    }

    // -------------------- Toast system --------------------
    window.showToast = function(message, type = 'success') {

        const container =
            document.getElementById('toastContainer') ||
            (() => {

                const c = document.createElement('div');

                c.id = 'toastContainer';
                c.className = 'toast-container';

                document.body.appendChild(c);

                return c;
            })();

        const toast = document.createElement('div');

        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 4000);
    };

    // -------------------- Init --------------------
    updateNavbar();

    // Expose for other scripts
    window.FlatMate = {
        updateNavbar
    };

})();