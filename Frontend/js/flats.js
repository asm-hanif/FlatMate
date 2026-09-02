// FlatMate property listing, search, detail, requests, favorites and owner email.
(function () {
    'use strict';

    function escapeHtml(value) {
        return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
    function escapeAttr(value) { return escapeHtml(value); }
    function isAvailable(flat) { return flat.AvailabilityStatus === 'Available' || !flat.AvailabilityStatus; }
    function statusLabel(status) {
        const s = status || 'Available';
        return s === 'Rented' ? 'RENTED' : s === 'Sold' ? 'SOLD' : s === 'Hidden' ? 'HIDDEN' : s === 'Expired' ? 'EXPIRED' : 'AVAILABLE';
    }
    function statusClass(status) {
        const s = String(status || 'Available').toLowerCase();
        return `availability-${s}`;
    }
    function priceDisplay(flat) {
        const amount = `৳${Number(flat.Price || 0).toLocaleString('en-BD')}`;
        if (flat.Purpose === 'Rent') return `${amount} / ${escapeHtml(flat.RentPeriod || 'Monthly')}`;
        return amount;
    }

    const featuredGrid = document.getElementById('featuredGrid');
    if (featuredGrid) loadFeatured();

    async function loadFeatured() {
        try {
            const res = await fetch('/api/flats?limit=6');
            const flats = await res.json();
            featuredGrid.innerHTML = flats.length ? flats.slice(0, 6).map(propertyCard).join('') : '<p>No properties found.</p>';
        } catch (_) { featuredGrid.innerHTML = '<p>Error loading properties.</p>'; }
    }

    function propertyCard(flat) {
        const imageUrl = flat.mainImage ? fmUrl(flat.mainImage) : '/favicon.ico';
        const purposeBadge = flat.Purpose === 'Rent' ? 'FOR RENT' : flat.Purpose === 'Sale' ? 'FOR SALE' : 'RENT & SALE';
        const unavailable = !isAvailable(flat);
        return `<div class="property-card" onclick="window.location.href='/flat.html?id=${encodeURIComponent(flat.Id)}'">
            <div class="property-card-image">
                <img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(flat.Title)}" loading="lazy" />
                <span class="property-badge">${purposeBadge}</span>
                <span class="property-badge ${statusClass(flat.AvailabilityStatus)}" style="left:auto;right:12px;">${statusLabel(flat.AvailabilityStatus)}</span>
            </div>
            <div class="property-card-body">
                <h3 class="property-card-title">${escapeHtml(flat.Title)}</h3>
                <p class="property-card-location"><i class="fas fa-map-pin"></i> ${escapeHtml(flat.City || flat.AreaName || flat.Address || 'Location not specified')}</p>
                <div class="property-card-details"><span><i class="fas fa-bed"></i> ${flat.Bedrooms || 0}</span><span><i class="fas fa-bath"></i> ${flat.Bathrooms || 0}</span><span><i class="fas fa-ruler-combined"></i> ${flat.Area || 0} ${escapeHtml(flat.AreaUnit || 'sq ft')}</span></div>
                <div class="property-card-footer"><span class="property-card-price">${priceDisplay(flat)}</span><a href="/flat.html?id=${encodeURIComponent(flat.Id)}" class="btn btn-outline btn-small" onclick="event.stopPropagation()">View Property →</a></div>
                ${unavailable ? `<div style="margin-top:.6rem;font-weight:700;">${statusLabel(flat.AvailabilityStatus)}</div>` : ''}
            </div>
        </div>`;
    }

    const exploreGrid = document.getElementById('exploreGrid');
    const explorePagination = document.getElementById('explorePagination');
    let explorePage = 1;
    const filterForm = document.getElementById('filterForm');
    if (exploreGrid) {
        loadExplore();
        filterForm?.addEventListener('submit', e => { e.preventDefault(); explorePage = 1; loadExplore(); });
    }
    async function loadExplore() {
        if (!exploreGrid) return;
        const params = new URLSearchParams();
        if (filterForm) for (const [key, value] of new FormData(filterForm).entries()) if (value) params.append(key, value);
        params.set('page', String(explorePage)); params.set('limit', '12');
        try {
            const res = await fetch(`/api/flats?${params.toString()}`);
            const flats = await res.json();
            exploreGrid.innerHTML = flats.length ? flats.map(propertyCard).join('') : '<p style="grid-column:1/-1;text-align:center;padding:3rem;">No properties found. Try adjusting your filters.</p>';
            if (explorePagination) explorePagination.innerHTML = `<button class="btn btn-outline btn-small" ${flats.length < 12 ? 'disabled' : ''} onclick="window.nextExplorePage()">${flats.length === 12 ? 'Next Page →' : 'End of Results'}</button>`;
        } catch (_) { exploreGrid.innerHTML = '<p>Error loading properties.</p>'; }
    }

    window.nextExplorePage = function(){ if (exploreGrid && explorePagination && !explorePagination.querySelector('button')?.disabled) { explorePage++; loadExplore(); window.scrollTo({top:0,behavior:'smooth'}); } };

    const detailContainer = document.getElementById('flatDetail');
    if (detailContainer) {
        const id = new URLSearchParams(location.search).get('id');
        if (id) loadFlatDetail(id);
    }

    async function loadFlatDetail(id) {
        try {
            const res = await fetch(`/api/flats/${encodeURIComponent(id)}`);
            const flat = await res.json();
            if (!res.ok) throw new Error(flat.error || 'Property not found');
            renderDetail(flat);
            initializeFavoriteButton(flat.Id);
        } catch (err) {
            detailContainer.innerHTML = `<div class="chat-error">${escapeHtml(err.message || 'Property not found.')}</div>`;
        }
    }

    function propertySummaryRows(flat) {
        const purposeLabel = flat.Purpose === 'Rent' ? 'For Rent' : flat.Purpose === 'Sale' ? 'For Sale' : 'For Rent & Sale';
        const location = [flat.AreaName, flat.City].filter(Boolean).join(', ') || flat.Address || 'Not specified';
        const size = flat.Area ? `${flat.Area} ${flat.AreaUnit || 'sq ft'}` : null;
        const landArea = flat.LandArea ? `${flat.LandArea} ${flat.LandAreaUnit || 'sq ft'}` : 'N/A';
        const garages = (Number(flat.Parking) || 0) + (Number(flat.CoveredParking) || 0);

        return [
            ['Property Name', flat.Title],
            ['Property Type', flat.PropertyType],
            ['Property For', purposeLabel],
            ['Location', location],
            ['Construction Status', flat.ConstructionStatus],
            ['Property Size', size],
            ['Transaction Type', flat.TransactionType],
            ['Floor Available On', flat.FloorAvailableOn || (flat.Floor ? `${flat.Floor}${flat.TotalFloors ? ' of ' + flat.TotalFloors : ''}` : null)],
            ['Bedroom', flat.Bedrooms != null ? String(flat.Bedrooms).padStart(2, '0') : null],
            ['Baths', flat.Bathrooms != null ? String(flat.Bathrooms).padStart(2, '0') : null],
            ['Balconies', flat.Balconies != null ? flat.Balconies : null],
            ['Garages', garages ? `Parking ${garages}` : null],
            ['Total Floor', flat.TotalFloors],
            ['Furnishing', flat.Furnished],
            ['Facing', flat.Facing ? `${flat.Facing} Facing` : null],
            ['Land Area', landArea]
        ];
    }

    function renderDetail(flat) {
        const media = flat.media || [];
        const images = media.filter(m => m.MediaType === 'image');
        const videos = media.filter(m => m.MediaType === 'video');
        const mainImage = images[0]?.Url ? fmUrl(images[0].Url) : '/favicon.ico';
        const purposeBadge = flat.Purpose === 'Rent' ? 'FOR RENT' : flat.Purpose === 'Sale' ? 'FOR SALE' : 'RENT & SALE';
        const available = isAvailable(flat);
        const sessionPromise = fetch('/api/auth/session', { credentials: 'include' }).then(r => r.json()).catch(() => ({ authenticated: false }));
        const amenityMap = {
            'Mosque/Prayer Room': flat.MosquePrayerRoom, Security: flat.Security, Lift: flat.Lift,
            'Fire Exit': flat.FireExit, 'WASA Connection': flat.WASAConnection, 'Self Water Supply': flat.SelfWaterSupply,
            'Hot Water': flat.HotWater, 'Cylinder Gas': flat.CylinderGas, Electricity: flat.Electricity,
            Generator: flat.Generator, 'Telephone Line': flat.TelephoneLine, Intercom: flat.Intercom,
            CCTV: flat.CCTV, 'Wi-Fi Connectivity': flat.WifiConnectivity, 'Security Alarm System': flat.SecurityAlarmSystem,
            'Satellite/Cable TV': flat.CableTV, 'Electronic Security': flat.ElectronicSecurity, 'Swimming Pool': flat.SwimmingPool,
            Gymnasium: flat.Gym, Garden: flat.Garden, 'Solar Panels': flat.SolarPanels,
            'Guest Parking': flat.GuestParking, 'Servant Room': flat.ServantQuarter, 'Servant Toilet': flat.ServantToilet,
            'Fire Protection': flat.FireProtection, 'Departmental Store': flat.DepartmentalStore,
            'Air Conditioning': flat.AirConditioning, Heating: flat.Heating, 'Community Hall': flat.CommunityHall,
            Rooftop: flat.Rooftop, Playground: flat.Playground, 'Pet Friendly': flat.PetFriendly,
            Laundry: flat.Laundry, 'Water Supply': flat.Water, 'Gas Line': flat.Gas, Internet: flat.Internet, Guard: flat.Guard
        };
        const amenities = Object.keys(amenityMap).filter(k => amenityMap[k]);
        const thumbs = images.slice(1).map(img => `<img src="${escapeAttr(fmUrl(img.Url))}" alt="Thumbnail" onclick="changeMainImage('${escapeAttr(fmUrl(img.Url))}')">`).join('') + (videos.length ? `<div class="video-thumb" onclick="playVideo('${escapeAttr(fmUrl(videos[0].Url))}')"><i class="fas fa-play-circle"></i></div>` : '');

        const ownerId = Number(flat.OwnerId);
        const ownerButtons = available ? `
            ${flat.Purpose === 'Rent' || flat.Purpose === 'Rent & Sale' ? `<button class="btn btn-primary" onclick="sendRequest('${flat.Id}','Rent')"><i class="fas fa-handshake"></i> Request to Rent</button>` : ''}
            ${flat.Purpose === 'Sale' || flat.Purpose === 'Rent & Sale' ? `<button class="btn btn-primary" onclick="sendRequest('${flat.Id}','Buy')"><i class="fas fa-home"></i> I Want to Buy</button>` : ''}
            <button class="btn btn-outline" id="chatOwnerBtn" onclick="contactOwner('${flat.Id}')"><i class="fas fa-comments"></i> Message Owner</button>
            <button class="btn btn-outline" id="emailOwnerBtn" onclick="emailOwner('${flat.Id}')"><i class="fas fa-envelope"></i> Email Owner</button>` : `
            <div style="padding:1rem;border-radius:8px;background:#f5f4ef;font-weight:600;">This property is <strong>${statusLabel(flat.AvailabilityStatus).toLowerCase()}</strong>. Requests, chat and email are disabled until the owner marks it available.</div>`;

        detailContainer.innerHTML = `
            <div class="gallery"><div class="gallery-main" id="galleryMain"><img src="${escapeAttr(mainImage)}" alt="${escapeAttr(flat.Title)}" id="mainImage"></div><div class="gallery-thumbs">${thumbs}</div></div>
            <div class="detail-grid">
                <div class="detail-info">
                    <span class="property-badge" style="position:static;display:inline-block;margin-bottom:.5rem;">${purposeBadge}</span>
                    <span class="property-badge ${statusClass(flat.AvailabilityStatus)}" style="position:static;display:inline-block;margin:0 0 .5rem .4rem;">${statusLabel(flat.AvailabilityStatus)}</span>
                    <h2>${escapeHtml(flat.Title)}</h2>
                    <p><i class="fas fa-map-pin"></i> ${escapeHtml(flat.City || flat.AreaName || flat.Address || 'Location not specified')}</p>
                    <div class="detail-price">${priceDisplay(flat)}</div>
                    ${flat.SecurityDeposit ? `<p style="color:#6b7280;font-size:0.9rem;margin-top:-0.5rem;">+ Security Deposit: ৳${Number(flat.SecurityDeposit).toLocaleString('en-US')}</p>` : ''}
                    <h3 style="margin:1.5rem 0 0.75rem;">Property Summary</h3>
                    <div class="detail-specs property-summary-grid">${propertySummaryRows(flat).map(([label, value]) => value ? `<div><strong>${escapeHtml(label)}</strong> ${escapeHtml(String(value))}</div>` : '').join('')}</div>
                    <h3 style="margin:1.5rem 0 0.75rem;">Property Features</h3>
                    <div class="amenities-list">${amenities.length ? amenities.map(a => `<span class="amenity-chip"><i class="fas fa-check-circle"></i> ${escapeHtml(a)}</span>`).join('') : '<p style="color:#6b7280;">No specific features listed.</p>'}</div>
                    <div style="margin-top:2rem;"><h3>Description</h3><p>${escapeHtml(flat.Description || 'No description provided.')}</p></div>
                    ${flat.Latitude && flat.Longitude ? `<div class="property-location-section"><div class="property-location-header"><div><span class="property-location-eyebrow">PROPERTY LOCATION</span><h3>Find This Property</h3><p><i class="fas fa-location-dot"></i> ${escapeHtml(flat.Address || flat.AreaName || flat.City || 'Property location')}</p></div><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${flat.Latitude},${flat.Longitude}`)}" target="_blank" rel="noopener noreferrer" class="google-map-btn">Open in Google Maps</a></div><div class="property-map-wrapper"><iframe src="https://www.google.com/maps?q=${encodeURIComponent(`${flat.Latitude},${flat.Longitude}`)}&z=15&output=embed" width="100%" height="100%" style="border:0;" allowfullscreen loading="lazy" title="Property location"></iframe></div></div>` : ''}
                </div>
                <div class="detail-sidebar"><div class="owner-card"><h3>Property Owner</h3><p><strong>${escapeHtml(flat.owner?.Name || 'Owner')}</strong></p><p><i class="fas fa-phone"></i> ${escapeHtml(flat.owner?.Phone || 'Not provided')}</p><p><i class="fas fa-envelope"></i> ${escapeHtml(flat.owner?.Email || 'Not provided')}</p><div style="display:flex;flex-direction:column;gap:.5rem;margin-top:1rem;">${ownerButtons}<button class="btn btn-danger-outline" onclick="reportProperty('${flat.Id}')"><i class="fas fa-flag"></i> Report Property</button><button id="favoriteBtn" class="btn btn-outline" onclick="toggleFavorite('${flat.Id}')"><i class="far fa-heart"></i> Save Property</button></div></div></div>
            </div>`;

        sessionPromise.then(session => {
            if (Number(session.user?.id || session.user?.Id) === ownerId) {
                document.getElementById('chatOwnerBtn')?.remove();
                document.getElementById('emailOwnerBtn')?.remove();
            }
        });
    }

    async function initializeFavoriteButton(flatId) {
        const button = document.getElementById('favoriteBtn');
        if (!button) return;
        try {
            const session = await (await fetch('/api/auth/session', { credentials: 'include' })).json();
            if (!session.authenticated || !['User','Both'].includes(session.user?.role)) { button.remove(); return; }
            const data = await (await fetch(`/api/favorites/${encodeURIComponent(flatId)}/status`, { credentials: 'include' })).json();
            button.innerHTML = data.favorited ? '<i class="fas fa-heart"></i> Saved' : '<i class="far fa-heart"></i> Save Property';
        } catch (_) {}
    }

    window.changeMainImage = function (url) { const el = document.getElementById('mainImage'); if (el) el.src = url; };
    window.playVideo = function (url) { const main = document.getElementById('galleryMain'); if (main) main.innerHTML = `<video controls autoplay style="width:100%;height:100%;object-fit:contain"><source src="${escapeAttr(url)}"></video>`; };

    window.sendRequest = async function (flatId, type) {
        try {
            const session = await (await fetch('/api/auth/session', { credentials: 'include' })).json();
            if (!session.authenticated) { showToast('Please log in first.', 'error'); location.href = `/login.html?redirect=/flat.html?id=${encodeURIComponent(flatId)}`; return; }
            if (!['User','Both'].includes(session.user?.role)) { showToast('Choose Seeker or Both in your profile to send requests.', 'error'); return; }
            const message = prompt('Add a message (optional):');
            if (message === null) return;
            const res = await fetch('/api/requests', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flatId: Number(flatId), type, message }) });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to send request');
            showToast('Request sent successfully!');
        } catch (err) { showToast(err.message || 'Network error', 'error'); }
    };

    window.contactOwner = async function (flatId) {
        try {
            const session = await (await fetch('/api/auth/session', { credentials: 'include' })).json();
            if (!session.authenticated) { showToast('Please log in first.', 'error'); location.href = `/login.html?redirect=/flat.html?id=${encodeURIComponent(flatId)}`; return; }
            if (!['User','Both'].includes(session.user?.role)) { showToast('Choose Seeker or Both in your profile to contact owners.', 'error'); return; }
            const response = await fetch('/api/chat/conversations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flatId: Number(flatId) }) });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Unable to open conversation.');
            location.href = '/chat.html';
        } catch (error) { showToast(error.message || 'Unable to open chat.', 'error'); }
    };

    window.emailOwner = async function (flatId) {
        const message = prompt('Write the email you want to send to the owner:');
        if (message === null) return;
        if (!message.trim()) { showToast('Please enter a message.', 'error'); return; }
        try {
            const session = await (await fetch('/api/auth/session', { credentials: 'include' })).json();
            if (!session.authenticated) { showToast('Please log in first.', 'error'); location.href = `/login.html?redirect=/flat.html?id=${encodeURIComponent(flatId)}`; return; }
            const res = await fetch(`/api/contact/owner/${encodeURIComponent(flatId)}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message.trim() }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Unable to send email.');
            showToast('Your email has been sent to the owner.');
        } catch (err) { showToast(err.message || 'Unable to send email.', 'error'); }
    };

    window.toggleFavorite = async function (flatId) {
        try {
            const session = await (await fetch('/api/auth/session', { credentials: 'include' })).json();
            if (!session.authenticated) { showToast('Please log in first.', 'error'); location.href = `/login.html?redirect=/flat.html?id=${encodeURIComponent(flatId)}`; return; }
            if (!['User','Both'].includes(session.user?.role)) { showToast('Choose Seeker or Both in your profile to save properties.', 'info'); return; }
            const status = await (await fetch(`/api/favorites/${encodeURIComponent(flatId)}/status`, { credentials: 'include' })).json();
            const response = await fetch(`/api/favorites/${encodeURIComponent(flatId)}`, { method: status.favorited ? 'DELETE' : 'POST', credentials: 'include' });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Could not update favorite.');
            const button = document.getElementById('favoriteBtn');
            if (button) button.innerHTML = data.favorited ? '<i class="fas fa-heart"></i> Saved' : '<i class="far fa-heart"></i> Save Property';
            showToast(data.favorited ? 'Property saved.' : 'Property removed from favorites.');
        } catch (error) { showToast(error.message || 'Could not update favorite.', 'error'); }
    };

    window.reportProperty = async function(flatId) {
        const session = await (await fetch('/api/auth/session',{credentials:'include'})).json();
        if (!session.authenticated) { showToast('Please log in first.','error'); location.href=`/login.html?redirect=${encodeURIComponent(location.pathname+location.search)}`; return; }
        const reason = prompt('Report reason:\n1. Fake property\n2. Scam or suspicious behavior\n3. Wrong information\n4. Duplicate listing\n5. Already rented/sold\n6. Inappropriate content\n7. Other\n\nType the exact reason:');
        const allowed=['Fake property','Scam or suspicious behavior','Wrong information','Duplicate listing','Already rented/sold','Inappropriate content','Other'];
        if (!allowed.includes(reason)) { if(reason!==null) showToast('Please choose a valid report reason.','error'); return; }
        const details=prompt('Additional details (optional):')||'';
        try { const res=await fetch(`/api/reports/flats/${flatId}`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason,details})}); const data=await res.json(); if(!res.ok)throw new Error(data.error||'Could not report property.'); showToast(data.message||'Report submitted.'); } catch(e){showToast(e.message,'error');}
    };

})();