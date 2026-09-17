(function () {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    const flatId = Number(params.get('flatId'));

    const card = document.getElementById('reportCard');
    const formWrap = document.getElementById('reportFormWrap');
    const form = document.getElementById('reportForm');
    const success = document.getElementById('reportSuccess');
    const status = document.getElementById('reportStatus');
    const submitButton = document.getElementById('submitReport');

    const title = document.getElementById('propertyTitle');
    const imageWrap = document.getElementById('propertyImageWrap');
    const image = document.getElementById('propertyImage');
    const location = document.getElementById('propertyLocation');
    const purpose = document.getElementById('propertyPurpose');
    const price = document.getElementById('propertyPrice');

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatPrice(flat) {
        const amount = `৳${Number(flat.Price || 0).toLocaleString('en-BD')}`;
        if (flat.Purpose === 'Rent') return `${amount} / ${flat.RentPeriod || 'Monthly'}`;
        return amount;
    }

    async function loadPage() {
        if (!Number.isInteger(flatId) || flatId <= 0) {
            status.textContent = 'The property link is invalid.';
            return;
        }

        try {
            const sessionResponse = await fetch('/api/auth/session', { credentials: 'include' });
            const session = await sessionResponse.json();

            if (!session.authenticated) {
                window.location.href = `/login.html?redirect=${encodeURIComponent(`/report.html?flatId=${flatId}`)}`;
                return;
            }

            const response = await fetch(`/api/flats/${encodeURIComponent(flatId)}`);
            const flat = await response.json();

            if (!response.ok) {
                throw new Error(flat.error || 'Property not found.');
            }

            if (Number(flat.OwnerId) === Number(session.user?.id)) {
                throw new Error('You cannot report your own property.');
            }

            title.textContent = flat.Title || 'Property';
            location.textContent = [flat.AreaName, flat.City].filter(Boolean).join(', ') || flat.Address || 'Location not provided';
            purpose.textContent = flat.Purpose || 'Property listing';
            price.textContent = formatPrice(flat);

            const firstImage = (flat.media || []).find(media => String(media.MediaType).toLowerCase() === 'image');
            if (firstImage?.Url) {
                image.src = window.fmUrl ? window.fmUrl(firstImage.Url) : firstImage.Url;
                image.alt = flat.Title || 'Property image';
                imageWrap.hidden = false;
            }

            document.getElementById('reportBack').href = `/flat.html?id=${encodeURIComponent(flatId)}`;
            document.getElementById('cancelReport').href = `/flat.html?id=${encodeURIComponent(flatId)}`;
            document.getElementById('successBack').href = `/flat.html?id=${encodeURIComponent(flatId)}`;

            card.hidden = false;
        } catch (error) {
            title.textContent = 'Unable to open report';
            status.textContent = error.message || 'Could not load this property.';
            card.hidden = false;
            formWrap.querySelector('#reportForm').hidden = true;
            formWrap.querySelector('.report-intro').hidden = true;
            formWrap.querySelector('.report-note').hidden = true;
        }
    }

    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        status.textContent = '';

        const reason = document.getElementById('reason').value;
        const details = document.getElementById('details').value.trim();

        if (!reason) {
            status.textContent = 'Please select a reason for reporting.';
            return;
        }

        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        try {
            const response = await fetch(`/api/reports/flats/${encodeURIComponent(flatId)}`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason, details })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Could not submit your report.');
            }

            form.hidden = true;
            document.querySelector('.report-intro').hidden = true;
            document.querySelector('.report-note').hidden = true;
            success.hidden = false;
            document.getElementById('successMessage').textContent =
                data.message || 'Your report has been submitted and sent for review.';
        } catch (error) {
            status.textContent = error.message || 'Could not submit your report. Please try again.';
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fas fa-flag"></i> Submit Report';
        }
    });

    loadPage();
})();
