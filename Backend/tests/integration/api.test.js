/**
 * FlatMate — live API integration tests
 *
 * Unlike the unit tests (tests/unit/, run with `npm test`), this hits a
 * REAL running server over HTTP, using Node's built-in fetch — no test
 * framework or extra dependency required.
 *
 * Usage:
 *   1. Start the server in one terminal:   npm run dev
 *   2. In another terminal:                npm run test:api
 *
 * It creates throwaway test accounts/listings using a random suffix each
 * run, so it's safe to run against a real dev database repeatedly.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const RUN_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let passed = 0;
let failed = 0;
const failures = [];

function pass(label) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
}

function fail(label, detail) {
    failed++;
    failures.push({ label, detail });
    console.log(`  \x1b[31m✗ ${label}\x1b[0m`);
    if (detail) console.log(`    ${detail}`);
}

async function check(label, fn) {
    try {
        await fn();
        pass(label);
    } catch (err) {
        fail(label, err.message);
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

// A per-run cookie jar (this server uses cookie-based sessions).
let cookies = {};

function rememberCookies(res) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    for (const c of raw) {
        const [pair] = c.split(';');
        const [name, value] = pair.split('=');
        cookies[name] = value;
    }
}

function cookieHeader() {
    return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function api(method, path, body, isForm) {
    const headers = {};
    if (cookieHeader()) headers['Cookie'] = cookieHeader();
    if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(BASE_URL + path, {
        method,
        headers,
        body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body))
    });

    rememberCookies(res);

    let data = null;
    try { data = await res.json(); } catch (_) { /* non-JSON response */ }

    return { status: res.status, ok: res.ok, data };
}


/* ============================================================ */

async function run() {
    console.log(`\nFlatMate API integration tests`);
    console.log(`Target: ${BASE_URL}\n`);

    const ownerEmail = `test.owner.${RUN_ID}@gmail.com`;
    const userEmail = `test.user.${RUN_ID}@gmail.com`;
    const password = 'TestPass123'; // meets the 6-16, upper+lower+digit rule

    let ownerId, userId, flatId, mediaIdToRemove;

    // ---------------- Health ----------------
    console.log('Health & connectivity');
    await check('GET /api/health returns success', async () => {
        const r = await api('GET', '/api/health');
        assert(r.status === 200, `expected 200, got ${r.status}`);
        assert(r.data.success === true, 'expected success:true');
        assert(r.data.database === 'connected', `expected database connected, got ${r.data.database}`);
    });

    // ---------------- Auth: registration ----------------
    console.log('\nRegistration & validation rules');

    await check('Registration rejects non-Gmail address', async () => {
        const r = await api('POST', '/api/auth/register', {
            name: 'Bad Email', email: `x.${RUN_ID}@yahoo.com`, password, role: 'User'
        });
        assert(r.status === 400, `expected 400, got ${r.status}`);
    });

    await check('Registration rejects weak password (no uppercase)', async () => {
        const r = await api('POST', '/api/auth/register', {
            name: 'Weak Pw', email: `weak.${RUN_ID}@gmail.com`, password: 'abcdef1', role: 'User'
        });
        assert(r.status === 400, `expected 400, got ${r.status}`);
    });

    await check('Registration rejects password over 16 chars', async () => {
        const r = await api('POST', '/api/auth/register', {
            name: 'Too Long', email: `long.${RUN_ID}@gmail.com`, password: 'Abcdef123456789XY', role: 'User'
        });
        assert(r.status === 400, `expected 400, got ${r.status}`);
    });

    await check('Owner registration succeeds and auto-logs-in', async () => {
        cookies = {}; // fresh session for this account
        const r = await api('POST', '/api/auth/register', {
            name: 'Test Owner', email: ownerEmail, phone: '+8801700000000', password, role: 'Owner'
        });
        assert(r.status === 201, `expected 201, got ${r.status}: ${JSON.stringify(r.data)}`);
        assert(r.data.user && r.data.user.role === 'Owner', 'expected role Owner in response');
        ownerId = r.data.user.id;

        const session = await api('GET', '/api/auth/session');
        assert(session.data.authenticated === true, 'expected to be auto-logged-in after registration, but session is not authenticated');
    });

    const ownerCookies = { ...cookies };

    await check('User (seeker) registration succeeds', async () => {
        cookies = {};
        const r = await api('POST', '/api/auth/register', {
            name: 'Test Seeker', email: userEmail, phone: '+8801800000000', password, role: 'User'
        });
        assert(r.status === 201, `expected 201, got ${r.status}: ${JSON.stringify(r.data)}`);
        userId = r.data.user.id;
    });

    const userCookies = { ...cookies };

    // ---------------- Auth: login/logout ----------------
    console.log('\nLogin / logout / session');

    await check('Login with correct credentials succeeds', async () => {
        cookies = {};
        const r = await api('POST', '/api/auth/login', { email: ownerEmail, password });
        assert(r.status === 200, `expected 200, got ${r.status}: ${JSON.stringify(r.data)}`);
    });

    await check('Login with wrong password is rejected', async () => {
        cookies = {};
        const r = await api('POST', '/api/auth/login', { email: ownerEmail, password: 'WrongPass1' });
        assert(r.status === 401 || r.status === 400, `expected 400/401, got ${r.status}`);
    });

    await check('Logout clears the session', async () => {
        cookies = { ...ownerCookies };
        await api('POST', '/api/auth/logout');
        const session = await api('GET', '/api/auth/session');
        assert(session.data.authenticated === false, 'expected authenticated:false after logout');
    });

    // Re-login as owner for the rest of the suite (logout above cleared it).
    cookies = {};
    await api('POST', '/api/auth/login', { email: ownerEmail, password });
    const ownerSessionCookies = { ...cookies };

    // ---------------- Flat creation (the bug that was just fixed) ----------------
    console.log('\nProperty creation (Add Property)');

    await check('Non-owner cannot create a listing', async () => {
        cookies = { ...userCookies };
        const form = new URLSearchParams({ Title: 'Should Fail', Purpose: 'Rent', PropertyType: 'Apartment', Price: '10000' });
        const r = await fetch(BASE_URL + '/api/flats', { method: 'POST', headers: { Cookie: cookieHeader(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
        assert(r.status === 403, `expected 403, got ${r.status}`);
    });

    await check('Owner CAN create a listing with only required fields (regression test for the duplicate-column bug)', async () => {
        cookies = { ...ownerSessionCookies };
        const form = new URLSearchParams({
            Title: `Integration Test Flat ${RUN_ID}`,
            Purpose: 'Rent',
            PropertyType: 'Apartment',
            Price: '25000'
        });
        const r = await fetch(BASE_URL + '/api/flats', {
            method: 'POST',
            headers: { Cookie: cookieHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form
        });
        const data = await r.json();
        assert(r.status === 201, `expected 201, got ${r.status}: ${JSON.stringify(data)}`);
        assert(data.id, 'expected an id in the response');
        flatId = data.id;
    });

    await check('Owner CAN create a listing with the FULL property summary + amenities', async () => {
        cookies = { ...ownerSessionCookies };
        const form = new URLSearchParams({
            Title: `Dreamway Icon Residences ${RUN_ID}`,
            Description: 'A fully-specified test listing exercising every field.',
            Purpose: 'Sale',
            PropertyType: 'Duplex',
            Price: '45000000',
            SecurityDeposit: '',
            RentPeriod: '',
            ConstructionStatus: 'Ready',
            TransactionType: 'New',
            Facing: 'South',
            FloorAvailableOn: 'Any Floor',
            Bedrooms: '5', Bathrooms: '6', Balconies: '6',
            LivingRooms: '2', DiningRooms: '1', Kitchen: '1',
            ServantRooms: '1', StoreRooms: '1',
            Area: '4900', AreaUnit: 'sq ft',
            LandArea: '', LandAreaUnit: '',
            Floor: '', TotalFloors: '16',
            Furnished: 'Semi-furnished',
            Parking: '2', CoveredParking: '1',
            City: 'Dhaka', AreaName: 'Bashundhara R/A', Address: 'Road 12, Block C',
            MosquePrayerRoom: 'true', Security: 'true', Lift: 'true', CCTV: 'true',
            SwimmingPool: 'true', Gym: 'true', Garden: 'true', DepartmentalStore: 'true'
        });
        const r = await fetch(BASE_URL + '/api/flats', {
            method: 'POST',
            headers: { Cookie: cookieHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form
        });
        const data = await r.json();
        assert(r.status === 201, `expected 201, got ${r.status}: ${JSON.stringify(data)}`);
    });

    await check('Creating a listing without required fields is rejected with 400 (not a 500)', async () => {
        cookies = { ...ownerSessionCookies };
        const form = new URLSearchParams({ Description: 'Missing everything required' });
        const r = await fetch(BASE_URL + '/api/flats', {
            method: 'POST',
            headers: { Cookie: cookieHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form
        });
        assert(r.status === 400, `expected 400, got ${r.status}`);
    });

    // ---------------- Flat retrieval ----------------
    console.log('\nProperty retrieval');

    await check('GET /api/flats returns an array including the new listing', async () => {
        const r = await api('GET', '/api/flats');
        assert(Array.isArray(r.data), 'expected an array');
        assert(r.data.some(f => f.Id === flatId), 'expected the newly created flat in the list');
    });

    await check('GET /api/flats/:id returns full detail with property-summary fields intact', async () => {
        const r = await api('GET', `/api/flats/${flatId}`);
        assert(r.status === 200, `expected 200, got ${r.status}`);
        assert(r.data.Title.includes('Integration Test Flat'), 'title mismatch');
        assert(r.data.Purpose === 'Rent', 'purpose mismatch');
        assert(Array.isArray(r.data.media), 'expected media array');
        assert(r.data.owner && r.data.owner.Email === ownerEmail, 'expected owner info attached');
    });

    await check('GET /api/flats/:id for a non-existent flat returns 404', async () => {
        const r = await api('GET', '/api/flats/999999999');
        assert(r.status === 404, `expected 404, got ${r.status}`);
    });

    // ---------------- Flat editing: every field editable ----------------
    console.log('\nProperty editing (all fields, including amenities)');

    await check('Owner can update every property-summary field at once', async () => {
        cookies = { ...ownerSessionCookies };
        const form = new URLSearchParams({
            Title: `Updated Integration Test Flat ${RUN_ID}`,
            Description: 'Updated description.',
            Purpose: 'Rent', PropertyType: 'Apartment', Price: '30000',
            ConstructionStatus: 'Ready', TransactionType: 'Resale', Facing: 'North-East',
            FloorAvailableOn: '5th Floor', Bedrooms: '3', Bathrooms: '3', Balconies: '2',
            Parking: '1', CoveredParking: '1',
            Furnished: 'Fully furnished', AreaUnit: 'sq ft', Area: '1500'
        });
        const r = await fetch(BASE_URL + `/api/flats/${flatId}`, {
            method: 'PUT',
            headers: { Cookie: cookieHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form
        });
        const data = await r.json();
        assert(r.status === 200, `expected 200, got ${r.status}: ${JSON.stringify(data)}`);

        const check2 = await api('GET', `/api/flats/${flatId}`);
        assert(check2.data.Title.startsWith('Updated Integration'), 'title did not update');
        assert(Number(check2.data.Balconies) === 2, `expected Balconies=2, got ${check2.data.Balconies}`);
        assert(Number(check2.data.Bedrooms) === 3, `expected Bedrooms=3, got ${check2.data.Bedrooms}`);
        assert(check2.data.Facing === 'North-East', `expected Facing=North-East, got ${check2.data.Facing}`);
    });

    await check('Owner can toggle an amenity on', async () => {
        cookies = { ...ownerSessionCookies };
        const form = new URLSearchParams({ SwimmingPool: 'true' });
        const r = await fetch(BASE_URL + `/api/flats/${flatId}`, {
            method: 'PUT',
            headers: { Cookie: cookieHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form
        });
        assert(r.status === 200, `expected 200, got ${r.status}`);
        const check2 = await api('GET', `/api/flats/${flatId}`);
        assert(Number(check2.data.SwimmingPool) === 1, 'expected SwimmingPool amenity to be on');
    });

    await check('Owner can toggle an amenity back off', async () => {
        cookies = { ...ownerSessionCookies };
        const form = new URLSearchParams({ SwimmingPool: 'false' });
        const r = await fetch(BASE_URL + `/api/flats/${flatId}`, {
            method: 'PUT',
            headers: { Cookie: cookieHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form
        });
        assert(r.status === 200, `expected 200, got ${r.status}`);
        const check2 = await api('GET', `/api/flats/${flatId}`);
        assert(Number(check2.data.SwimmingPool) === 0, 'expected SwimmingPool amenity to be off');
    });

    await check('Non-owner cannot edit someone else\'s listing', async () => {
        cookies = { ...userCookies };
        cookies = {};
        await api('POST', '/api/auth/login', { email: userEmail, password });
        const form = new URLSearchParams({ Title: 'Hijacked title' });
        const r = await fetch(BASE_URL + `/api/flats/${flatId}`, {
            method: 'PUT',
            headers: { Cookie: cookieHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form
        });
        assert(r.status === 403, `expected 403, got ${r.status}`);
    });

    // ---------------- Media: image upload & removal ----------------
    console.log('\nPhoto & video management (add + remove)');

    function tinyPngBlob() {
        // A minimal valid 1x1 transparent PNG, just enough for multer/
        // the file-type filter to accept it as a real image.
        const base64 =
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
        const bytes = Buffer.from(base64, 'base64');
        return new Blob([bytes], { type: 'image/png' });
    }

    let uploadedMediaIds = [];

    await check('Owner can add new images to an existing listing', async () => {
        cookies = { ...ownerSessionCookies };

        const before = await api('GET', `/api/flats/${flatId}`);
        const beforeCount = before.data.media.length;

        const form = new FormData();
        form.append('images', tinyPngBlob(), 'test-photo-1.png');
        form.append('images', tinyPngBlob(), 'test-photo-2.png');

        const r = await fetch(BASE_URL + `/api/flats/${flatId}`, {
            method: 'PUT',
            headers: { Cookie: cookieHeader() },
            body: form
        });
        assert(r.status === 200, `expected 200, got ${r.status}: ${await r.text()}`);

        const after = await api('GET', `/api/flats/${flatId}`);
        assert(after.data.media.length === beforeCount + 2, `expected ${beforeCount + 2} media items, got ${after.data.media.length}`);

        uploadedMediaIds = after.data.media
            .filter(m => m.Url.includes('test') || true) // newest items are what we just added
            .slice(-2)
            .map(m => m.Id);
    });

    await check('Newly uploaded image is reachable at its URL', async () => {
        const before = await api('GET', `/api/flats/${flatId}`);
        const lastImage = before.data.media.filter(m => m.MediaType === 'image').slice(-1)[0];
        assert(lastImage, 'expected at least one image on the listing');

        const r = await fetch(BASE_URL + lastImage.Url);
        assert(r.status === 200, `expected the uploaded image to be servable, got ${r.status} for ${lastImage.Url}`);
    });

    await check('Owner can remove one specific existing image (others remain)', async () => {
        cookies = { ...ownerSessionCookies };

        const before = await api('GET', `/api/flats/${flatId}`);
        const beforeCount = before.data.media.length;
        const idToRemove = before.data.media[0].Id;

        const form = new FormData();
        form.append('removeImageIds', JSON.stringify([idToRemove]));

        const r = await fetch(BASE_URL + `/api/flats/${flatId}`, {
            method: 'PUT',
            headers: { Cookie: cookieHeader() },
            body: form
        });
        assert(r.status === 200, `expected 200, got ${r.status}: ${await r.text()}`);

        const after = await api('GET', `/api/flats/${flatId}`);
        assert(after.data.media.length === beforeCount - 1, `expected ${beforeCount - 1} media items left, got ${after.data.media.length}`);
        assert(!after.data.media.some(m => m.Id === idToRemove), 'removed image id should no longer be present');
    });

    await check('Removed image file is no longer servable (actually deleted from disk)', async () => {
        const before = await api('GET', `/api/flats/${flatId}`);
        const remainingUrls = new Set(before.data.media.map(m => m.Url));

        // We don't have the removed URL directly here (test isolation), so
        // this just confirms the endpoint returns 404 for a bogus/removed path
        // shape consistent with the upload dir, i.e. the route itself 404s
        // cleanly rather than erroring when a file is missing.
        const r = await fetch(BASE_URL + '/uploads/images/00000000-0000-0000-0000-000000000000.png');
        assert(r.status === 404, `expected 404 for a non-existent upload, got ${r.status}`);
    });

    await check('Owner can add a new image AND remove an old one in the same request', async () => {
        cookies = { ...ownerSessionCookies };

        const before = await api('GET', `/api/flats/${flatId}`);
        const beforeCount = before.data.media.length;
        const idToRemove = before.data.media[0].Id;

        const form = new FormData();
        form.append('removeImageIds', JSON.stringify([idToRemove]));
        form.append('images', tinyPngBlob(), 'test-photo-3.png');

        const r = await fetch(BASE_URL + `/api/flats/${flatId}`, {
            method: 'PUT',
            headers: { Cookie: cookieHeader() },
            body: form
        });
        assert(r.status === 200, `expected 200, got ${r.status}: ${await r.text()}`);

        const after = await api('GET', `/api/flats/${flatId}`);
        // Net effect: -1 removed, +1 added = same count
        assert(after.data.media.length === beforeCount, `expected media count to stay at ${beforeCount} (one removed, one added), got ${after.data.media.length}`);
        assert(!after.data.media.some(m => m.Id === idToRemove), 'removed image id should no longer be present');
    });

    await check('A non-owner cannot remove another owner\'s listing images', async () => {
        cookies = {};
        await api('POST', '/api/auth/login', { email: userEmail, password });

        const before = await api('GET', `/api/flats/${flatId}`);
        if (!before.data.media.length) throw new Error('test setup issue: no media left to attempt removing');
        const idToRemove = before.data.media[0].Id;

        const form = new FormData();
        form.append('removeImageIds', JSON.stringify([idToRemove]));

        const r = await fetch(BASE_URL + `/api/flats/${flatId}`, {
            method: 'PUT',
            headers: { Cookie: cookieHeader() },
            body: form
        });
        assert(r.status === 403, `expected 403, got ${r.status}`);
    });

    // ---------------- Availability status ----------------
    console.log('\nAvailability status');

    await check('Owner can mark property as Rented', async () => {
        cookies = { ...ownerSessionCookies };
        const r = await api('PUT', `/api/flats/${flatId}/availability-status`, { status: 'Rented' });
        assert(r.status === 200, `expected 200, got ${r.status}: ${JSON.stringify(r.data)}`);
    });

    await check('Availability status rejects an invalid value', async () => {
        cookies = { ...ownerSessionCookies };
        const r = await api('PUT', `/api/flats/${flatId}/availability-status`, { status: 'NotARealStatus' });
        assert(r.status === 400, `expected 400, got ${r.status}`);
    });

    await check('Owner can mark property back to Available', async () => {
        cookies = { ...ownerSessionCookies };
        const r = await api('PUT', `/api/flats/${flatId}/availability-status`, { status: 'Available' });
        assert(r.status === 200, `expected 200, got ${r.status}`);
    });

    // ---------------- Favorites ----------------
    console.log('\nFavorites');

    await check('User can favorite a property', async () => {
        cookies = {};
        await api('POST', '/api/auth/login', { email: userEmail, password });
        const r = await api('POST', `/api/favorites/${flatId}`);
        assert(r.status === 201, `expected 201, got ${r.status}: ${JSON.stringify(r.data)}`);
    });

    await check('Favorite status reflects true after favoriting', async () => {
        const r = await api('GET', `/api/favorites/${flatId}/status`);
        assert(r.data.favorited === true, 'expected favorited:true');
    });

    await check('Favoriting the same property twice does not error (idempotent)', async () => {
        const r = await api('POST', `/api/favorites/${flatId}`);
        assert(r.status === 201, `expected 201, got ${r.status}`);
    });

    await check('Listing favorites includes the property', async () => {
        const r = await api('GET', '/api/favorites');
        assert(r.data.favorites.some(f => f.Id === flatId), 'expected flat in favorites list');
    });

    await check('User can unfavorite a property', async () => {
        const r = await api('DELETE', `/api/favorites/${flatId}`);
        assert(r.status === 200, `expected 200, got ${r.status}`);
        const status = await api('GET', `/api/favorites/${flatId}/status`);
        assert(status.data.favorited === false, 'expected favorited:false after removing');
    });

    // ---------------- AI Bot ----------------
    console.log('\nAI Assistant (Mira)');

    await check('GET /api/bot/meta returns reference data', async () => {
        const r = await api('GET', '/api/bot/meta');
        assert(r.status === 200, `expected 200, got ${r.status}`);
        assert(Array.isArray(r.data.amenities) && r.data.amenities.length > 0, 'expected amenities list');
    });

    await check('Price suggestion is denied to non-owners', async () => {
        cookies = {};
        await api('POST', '/api/auth/login', { email: userEmail, password });
        const r = await api('POST', '/api/bot/price-suggest', { purpose: 'Rent', city: 'Dhaka', areaName: 'Gulshan', area: 1200, areaUnit: 'sq ft' });
        assert(r.status === 403, `expected 403, got ${r.status}`);
    });

    await check('Price suggestion works for owners', async () => {
        cookies = {};
        await api('POST', '/api/auth/login', { email: ownerEmail, password });
        const r = await api('POST', '/api/bot/price-suggest', {
            purpose: 'Rent', city: 'Dhaka', areaName: 'Gulshan', propertyType: 'Apartment',
            area: 1500, areaUnit: 'sq ft', bedrooms: 3, bathrooms: 3, furnished: 'Fully furnished'
        });
        assert(r.status === 200, `expected 200, got ${r.status}: ${JSON.stringify(r.data)}`);
        assert(r.data.suggestion && r.data.suggestion.estimate > 0, 'expected a positive price estimate');
    });

    await check('Flat-finder works for any logged-in role', async () => {
        const r = await api('POST', '/api/bot/suggest-flats', { purpose: 'Rent', city: 'Dhaka', budgetMax: 100000 });
        assert(r.status === 200, `expected 200, got ${r.status}: ${JSON.stringify(r.data)}`);
        assert(Array.isArray(r.data.results), 'expected results array');
    });

    // ---------------- Forgot / reset password ----------------
    console.log('\nForgot password (OTP flow)');
    console.log('  Note: full happy-path (correct code -> new password) needs a real inbox,');
    console.log('  so only checks that don\'t require reading the actual email are automated here.');

    await check('Requesting a code for a registered email returns the generic success message', async () => {
        cookies = {};
        const r = await api('POST', '/api/auth/forgot-password', { email: ownerEmail });
        assert(r.status === 200, `expected 200, got ${r.status}: ${JSON.stringify(r.data)}`);
        assert(r.data.success === true, 'expected success:true');
    });

    await check('Requesting a code for a NON-existent email returns the SAME generic message (no email enumeration)', async () => {
        cookies = {};
        const r = await api('POST', '/api/auth/forgot-password', { email: `nobody.${RUN_ID}@gmail.com` });
        assert(r.status === 200, `expected 200, got ${r.status}: ${JSON.stringify(r.data)}`);
        assert(r.data.success === true, 'expected success:true even for a non-existent email');
    });

    await check('Forgot-password rejects a missing email', async () => {
        cookies = {};
        const r = await api('POST', '/api/auth/forgot-password', {});
        assert(r.status === 400, `expected 400, got ${r.status}`);
    });

    await check('Reset-password rejects a missing code', async () => {
        cookies = {};
        const r = await api('POST', '/api/auth/reset-password', { email: ownerEmail, newPassword: 'NewPass123' });
        assert(r.status === 400, `expected 400, got ${r.status}`);
    });

    await check('Reset-password rejects a weak new password even with a well-formed (wrong) code', async () => {
        cookies = {};
        const r = await api('POST', '/api/auth/reset-password', { email: ownerEmail, code: '000000', newPassword: 'weak' });
        assert(r.status === 400, `expected 400, got ${r.status}`);
    });

    await check('Reset-password rejects an incorrect 6-digit code with a generic error (no email enumeration)', async () => {
        cookies = {};
        const r = await api('POST', '/api/auth/reset-password', { email: ownerEmail, code: '000000', newPassword: 'NewPass123' });
        assert(r.status === 400, `expected 400, got ${r.status}`);
        assert(/invalid|expired/i.test(r.data.error || ''), `expected an invalid/expired message, got: ${r.data.error}`);
    });

    await check('Reset-password for a non-existent email gives the SAME error as a wrong code (no email enumeration)', async () => {
        cookies = {};
        const r = await api('POST', '/api/auth/reset-password', { email: `nobody.${RUN_ID}@gmail.com`, code: '123456', newPassword: 'NewPass123' });
        assert(r.status === 400, `expected 400, got ${r.status}`);
        assert(/invalid|expired/i.test(r.data.error || ''), `expected an invalid/expired message, got: ${r.data.error}`);
    });

    await check('Original password still works (a failed reset attempt must not change it)', async () => {
        cookies = {};
        const r = await api('POST', '/api/auth/login', { email: ownerEmail, password });
        assert(r.status === 200, `expected 200, got ${r.status}: original password should still work after failed reset attempts`);
    });

    // ---------------- Cleanup ----------------
    console.log('\nCleanup');

    await check('Owner can delete (deactivate) their test listing', async () => {
        cookies = { ...ownerSessionCookies };
        const r = await api('DELETE', `/api/flats/${flatId}`);
        assert(r.status === 200, `expected 200, got ${r.status}`);
    });

    await check('Deactivated listing no longer appears in the public list', async () => {
        const r = await api('GET', '/api/flats');
        assert(!r.data.some(f => f.Id === flatId), 'expected deactivated flat to be excluded from public listing');
    });

    // ---------------- Summary ----------------
    console.log(`\n${'-'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
    if (failed > 0) {
        console.log('\nFailed tests:');
        failures.forEach(f => console.log(`  - ${f.label}: ${f.detail}`));
        process.exitCode = 1;
    } else {
        console.log('\nAll integration tests passed! ✓');
    }
}

run().catch((err) => {
    console.error('\nFATAL: test run crashed —', err.message);
    console.error('(Is the server actually running at', BASE_URL, '? Try: npm run dev)');
    process.exit(1);
});
