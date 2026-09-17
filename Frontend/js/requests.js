// Requests for home seekers
(function () {
    'use strict';

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatDatabaseDate(value) {
        if (!value) return '';
        const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
        if (match) {
            const date = new Date(Date.UTC(
                Number(match[1]), Number(match[2]) - 1, Number(match[3]),
                Number(match[4]), Number(match[5]), Number(match[6] || 0)
            ));
            return new Intl.DateTimeFormat('en-BD', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC'
            }).format(date);
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-BD');
    }

    window.loadMyRequests = async function () {
        const container = document.getElementById('profileRequests');
        if (!container) return;

        try {
            const res = await fetch('/api/requests/mine', { credentials: 'include' });
            const requests = await res.json();
            if (!res.ok) throw new Error(requests.error || 'Not authenticated');

            if (!requests.length) {
                container.innerHTML = '<div class="profile-section"><h3>My Requests</h3><p>No requests sent.</p></div>';
                return;
            }

            container.innerHTML = `
                <div class="profile-section">
                    <h3>My Requests</h3>
                    ${requests.map(r => `
                        <div class="request-item">
                            <div>
                                <strong>${escapeHtml(r.Type)}</strong> on
                                <em>${escapeHtml(r.FlatTitle)}</em>
                                (${escapeHtml(r.Purpose)} - ৳${Number(r.Price || 0).toLocaleString('en-BD')})
                                <br><small>${escapeHtml(r.Message || '')}</small>
                                ${r.OwnerName ? `<br><small>Owner: ${escapeHtml(r.OwnerName)}</small>` : ''}
                            </div>
                            <div>
                                <span class="request-status status-${escapeHtml(String(r.Status || '').toLowerCase())}">${escapeHtml(r.Status)}</span>
                                <span style="font-size:.8rem;margin-left:.5rem;">${formatDatabaseDate(r.CreatedAt)}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>`;
        } catch (err) {
            container.innerHTML = '<p>Could not load requests.</p>';
        }
    };
})();
