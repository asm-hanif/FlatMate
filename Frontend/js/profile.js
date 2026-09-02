// FlatMate profile, profile editing, requests and favorites.
(function () {
    'use strict';

    const profileContainer = document.getElementById('profileContainer');

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-BD', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    }

    async function getSession() {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        return res.json();
    }

    if (profileContainer) loadProfile();

    async function loadProfile() {
        try {
            const session = await getSession();
            if (!session.authenticated) throw new Error('Not authenticated');
            const res = await fetch('/api/profile', { credentials: 'include' });
            const user = await res.json();
            if (!res.ok) throw new Error(user.error || 'Unable to load profile');
            renderProfile(user);
        } catch (err) {
            profileContainer.innerHTML = '<p>Please log in to view your profile.</p>';
        }
    }

    function renderProfile(user) {
        const avatar = user.AvatarUrl ? fmUrl(user.AvatarUrl) : '/favicon.ico';
        const normalizedRole = String(user.Role || 'User');
        const isOwner = ['Owner','Both'].includes(normalizedRole);
        const isSeeker = ['User','Both'].includes(normalizedRole);
        const role = normalizedRole === 'Both' ? 'Owner & Home Seeker' : (isOwner ? 'Property Owner' : 'Home Seeker');

        profileContainer.innerHTML = `
            <div class="profile-header">
                <img src="${escapeHtml(avatar)}" alt="Profile avatar" class="profile-avatar" onerror="this.onerror=null;this.src='/favicon.ico';" />
                <div>
                    <span class="profile-role">${escapeHtml(role)}</span>
                    <h1 class="profile-name">${escapeHtml(user.Name || 'User')}</h1>
                    <div class="profile-meta-grid">
                        <p><i class="fas fa-envelope"></i> ${escapeHtml(user.Email || 'Not provided')}</p>
                        <p><i class="fas fa-phone"></i> ${escapeHtml(user.Phone || 'Not provided')}</p>
                        <p><i class="fas fa-map-pin"></i> ${escapeHtml(user.Address || 'No address on file')}</p>
                    </div>
                    ${user.Bio ? `<p class="profile-bio">"${escapeHtml(user.Bio)}"</p>` : ''}
                    <p class="profile-member-since">Member since ${formatDate(user.CreatedAt)}</p>
                    <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem;"><a href="/edit-profile.html" class="btn btn-outline"><i class="fas fa-pen"></i> Edit Profile</a>${isOwner ? '<a href="/owner-dashboard.html" class="btn btn-primary"><i class="fas fa-house"></i> My Properties</a>' : ''}</div>
                </div>
            </div>
            <div id="profileRequests"></div>
            ${isSeeker ? '<div id="profileFavorites" style="margin-top:2rem;"></div>' : ''}
        `;

        if (typeof loadMyRequests === 'function' && isSeeker) loadMyRequests();
        if (isSeeker) loadFavorites();
    }

    async function loadFavorites() {
        const container = document.getElementById('profileFavorites');
        if (!container) return;
        try {
            const res = await fetch('/api/favorites', { credentials: 'include' });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Unable to load favorites');
            if (!data.favorites.length) {
                container.innerHTML = `<div class="profile-section"><h3>Saved Properties</h3><p>No saved properties yet. Explore properties and save the ones you like.</p><a href="/flats.html" class="btn btn-outline">Explore Properties</a></div>`;
                return;
            }
            container.innerHTML = `<div class="profile-section"><h3>Saved Properties</h3><div class="property-grid">${data.favorites.map(flat => `
                <article class="property-card">
                    <div class="property-card-image"><img src="${escapeHtml(flat.mainImage ? fmUrl(flat.mainImage) : '/favicon.ico')}" alt="${escapeHtml(flat.Title)}" loading="lazy"></div>
                    <div class="property-card-body">
                        <h3 class="property-card-title">${escapeHtml(flat.Title)}</h3>
                        <p class="property-card-location">${escapeHtml(flat.City || flat.AreaName || flat.Address || 'Location not specified')}</p>
                        <span style="display:inline-block;margin:.35rem 0;font-size:.8rem;font-weight:700;">${escapeHtml(flat.AvailabilityStatus || 'Available')}</span>
                        <strong>৳${Number(flat.Price || 0).toLocaleString('en-BD')}</strong>
                        <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap;">
                            <a class="btn btn-outline btn-small" href="/flat.html?id=${encodeURIComponent(flat.Id)}">View</a>
                            <button class="btn btn-small" onclick="removeProfileFavorite(${Number(flat.Id)}, this)">Remove</button>
                        </div>
                    </div>
                </article>`).join('')}</div></div>`;
        } catch (err) {
            container.innerHTML = '<p>Could not load saved properties.</p>';
        }
    }

    window.removeProfileFavorite = async function (flatId, button) {
        try {
            const res = await fetch(`/api/favorites/${encodeURIComponent(flatId)}`, { method: 'DELETE', credentials: 'include' });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Unable to remove favorite');
            button.closest('.property-card')?.remove();
            showToast('Property removed from favorites.');
        } catch (err) {
            showToast(err.message || 'Unable to remove favorite.', 'error');
        }
    };

    const editProfileForm = document.getElementById('editProfileForm');
    if (editProfileForm) {
        const avatarFile = document.getElementById('editAvatarFile');
        const avatarPreview = document.getElementById('avatarPreview');

        (async function loadEditProfile() {
            try {
                const res = await fetch('/api/profile', { credentials: 'include' });
                const user = await res.json();
                if (!res.ok) throw new Error(user.error || 'Unable to load profile');
                document.getElementById('editName').value = user.Name || '';
                document.getElementById('editRole').value = user.Role || 'User';
                document.getElementById('editPhone').value = user.Phone || '';
                document.getElementById('editAddress').value = user.Address || '';
                document.getElementById('editBio').value = user.Bio || '';
                avatarPreview.src = user.AvatarUrl ? fmUrl(user.AvatarUrl) : '/favicon.ico';
            } catch (err) {
                showToast(err.message || 'Could not load profile.', 'error');
            }
        })();

        avatarFile?.addEventListener('change', () => {
            const file = avatarFile.files?.[0];
            if (!file) return;
            if (file.size > 10 * 1024 * 1024) {
                showToast('Profile image must be 10 MB or smaller.', 'error');
                avatarFile.value = '';
                return;
            }
            if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
                showToast('Use JPG, PNG, WEBP or GIF.', 'error');
                avatarFile.value = '';
                return;
            }
            avatarPreview.src = URL.createObjectURL(file);
        });

        editProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('editPassword')?.value || '';

            if (password) {
                const passwordError = window.FM_VALIDATE?.password(password);
                if (passwordError) {
                    showToast(passwordError, 'error');
                    return;
                }
            }

            const formData = new FormData();
            formData.append('name', document.getElementById('editName').value.trim());
            formData.append('role', document.getElementById('editRole').value);
            formData.append('phone', document.getElementById('editPhone').value.trim());
            formData.append('address', document.getElementById('editAddress').value.trim());
            formData.append('bio', document.getElementById('editBio').value.trim());
            if (password) formData.append('password', password);
            if (avatarFile?.files?.[0]) formData.append('avatar', avatarFile.files[0]);

            const button = editProfileForm.querySelector('button[type="submit"]');
            button.disabled = true;
            try {
                const res = await fetch('/api/profile', {
                    method: 'PUT', credentials: 'include', body: formData
                });
                const result = await res.json();
                if (!res.ok) throw new Error(result.error || 'Update failed');
                showToast('Profile updated successfully!');
                setTimeout(() => window.location.href = '/profile.html', 500);
            } catch (err) {
                showToast(err.message || 'Network error', 'error');
            } finally {
                button.disabled = false;
            }
        });
    }

    const deleteBtn = document.getElementById('deleteAccountBtn');
    deleteBtn?.addEventListener('click', async () => {
        const confirmation = prompt('This permanently deletes your account. Type DELETE to continue:');
        if (confirmation !== 'DELETE') { if (confirmation !== null) showToast('Deletion cancelled. Type DELETE exactly.', 'error'); return; }
        const password = prompt('Enter your current password to confirm deletion:');
        if (!password) return;
        deleteBtn.disabled = true;
        try {
            const res = await fetch('/api/auth/account', { method:'DELETE', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({confirmation,password}) });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Could not delete account.');
            alert('Your FlatMate account has been permanently deleted.');
            window.location.href = '/';
        } catch (err) { showToast(err.message || 'Could not delete account.', 'error'); deleteBtn.disabled = false; }
    });

})();