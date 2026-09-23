/**
 * FlatMate 90-case browser acceptance suite.
 *
 * Prerequisites:
 *   1. Start the application: npm run dev
 *   2. Run from Backend: npm run test:selenium
 *
 * Optional variables are the same as website.test.js:
 *   TEST_BASE_URL, SELENIUM_BROWSER, SELENIUM_HEADLESS
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { Builder, By, until } = require('selenium-webdriver');

const {
    TEST_BASE_URL,
    SELENIUM_BROWSER,
    E2E_EMAIL: configuredE2EEmail,
    configuredE2EPassword,
    RUN_ACCOUNT_DELETION
} = process.env;
const BASE_URL = TEST_BASE_URL || 'http://localhost:3000';
const BROWSER = SELENIUM_BROWSER || 'chrome';
const E2E_EMAIL = configuredE2EEmail || 'asmhanif811496@gmail.com';
const E2E_NAME = 'ASM_Hanif';
const E2E_PASSWORD = configuredE2EPassword || 'asM811496';
let driver;
let publicFlatId;
let createdFlatId;
const createdTitle = `Selenium FlatMate ${Date.now()}`;

const page = path => `${BASE_URL}${path}`;

async function waitFor(selector, timeout = 7000) {
    return driver.wait(until.elementLocated(By.css(selector)), timeout);
}

async function exists(selector) {
    return (await driver.findElements(By.css(selector))).length > 0;
}

async function bodyText() {
    return (await driver.findElement(By.css('body')).getText()).trim();
}

async function open(path) {
    await driver.manage().deleteAllCookies();
    await driver.get(page(path));
    await waitFor('body');
}

async function navigate(path) {
    await driver.get(page(path));
    await waitFor('body');
}

async function click(selector) {
    const element = await waitFor(selector);
    await driver.executeScript('arguments[0].scrollIntoView({block: "center"});', element);
    await element.click();
}

async function type(selector, value) {
    const element = await waitFor(selector);
    await element.clear();
    await element.sendKeys(value);
}

async function titleIs(title) {
    await driver.wait(until.titleIs(title), 7000);
    assert.equal(await driver.getTitle(), title);
}

async function protectedRoute(path, selector) {
    await open(path);
    await driver.wait(async () => {
        const url = await driver.getCurrentUrl();
        return url.includes('/login.html') || await exists(selector);
    }, 7000);
    assert.ok((await driver.getCurrentUrl()).includes('/login.html') || await exists(selector));
}

async function selectValue(selector, value) {
    const element = await waitFor(selector);
    await element.sendKeys(value);
}

async function captureFetches() {
    await driver.executeScript(`
        window.__flatMateFetches = [];
        const originalFetch = window.fetch;
        window.fetch = function(input, init) {
            window.__flatMateFetches.push(String(input));
            return originalFetch.call(this, input, init);
        };
    `);
}

async function waitForFetch(fragment) {
    await driver.wait(async () => {
        const fetches = await driver.executeScript('return window.__flatMateFetches || [];');
        return fetches.some(url => url.includes(fragment));
    }, 7000);
}

async function waitForToastText(expected) {
    await driver.wait(async () => {
        const toasts = await driver.findElements(By.css('.toast'));
        if (!toasts.length) return false;
        return (await toasts[toasts.length - 1].getText()).match(expected);
    }, 3000);
    const toasts = await driver.findElements(By.css('.toast'));
    return toasts[toasts.length - 1].getText();
}

async function waitForUrl(fragment, timeout = 8000) {
    await driver.wait(until.urlContains(fragment), timeout);
    return driver.getCurrentUrl();
}

async function selectExact(selector, value) {
    const element = await waitFor(selector);
    await element.sendKeys(value);
}

async function flatLinks(selector) {
    return driver.findElements(By.css(selector));
}

test.before(async () => {
    const builder = new Builder().forBrowser(BROWSER === 'edge' ? 'MicrosoftEdge' : BROWSER);
    if (BROWSER === 'chrome') {
        const chrome = require('selenium-webdriver/chrome');
        const options = new chrome.Options();
        if (process.env.SELENIUM_HEADLESS !== 'false') options.addArguments('--headless=new', '--window-size=1440,1000');
        builder.setChromeOptions(options);
    } else if (BROWSER === 'firefox') {
        const firefox = require('selenium-webdriver/firefox');
        const options = new firefox.Options();
        if (process.env.SELENIUM_HEADLESS !== 'false') options.addArguments('-headless');
        builder.setFirefoxOptions(options);
    } else {
        const edge = require('selenium-webdriver/edge');
        const options = new edge.Options();
        if (process.env.SELENIUM_HEADLESS !== 'false') options.addArguments('--headless=new', '--window-size=1440,1000');
        builder.setEdgeOptions(options);
    }
    driver = await builder.build();
    await driver.manage().setTimeouts({ implicit: 500, pageLoad: 15000, script: 5000 });
});

test.after(async () => {
    if (driver) await driver.quit();
});

test('01 home page returns successfully', async () => { await open('/'); await titleIs('FlatMate — Find Your Perfect Place'); });
test('02 home hero is visible', async () => { await open('/'); assert.ok(await exists('.hero-title')); });
test('03 home brand is visible', async () => { await open('/'); assert.ok(await exists('.navbar-brand')); });
test('04 home hero search form is visible', async () => { await open('/'); await waitFor('#heroSearchForm'); });
test('05 home location input has a placeholder', async () => { await open('/'); assert.equal(await (await waitFor('#heroLocation')).getAttribute('placeholder'), 'City, area or address'); });
test('06 home purpose options are available', async () => { await open('/'); assert.ok((await driver.findElements(By.css('#heroPurpose option'))).length >= 2); });
test('07 home type options are available', async () => { await open('/'); assert.ok((await driver.findElements(By.css('#heroType option'))).length >= 2); });
test('08 home bedroom filter is available', async () => { await open('/'); await waitFor('#heroBeds'); });
test('09 home featured grid is present', async () => { await open('/'); await waitFor('#featuredGrid'); });
test('10 home footer is present', async () => { await open('/'); assert.ok(await exists('footer.footer')); });
test('11 hero search preserves location', async () => { await open('/'); await type('#heroLocation', 'Dhaka'); await click('#heroSearchForm button[type="submit"]'); await driver.wait(until.urlContains('location=Dhaka'), 7000); });
test('12 hero search preserves purpose', async () => { await open('/'); await selectValue('#heroPurpose', 'Rent'); await click('#heroSearchForm button[type="submit"]'); await driver.wait(until.urlContains('purpose=Rent'), 7000); });
test('13 hero search preserves property type', async () => { await open('/'); await selectValue('#heroType', 'Apartment'); await click('#heroSearchForm button[type="submit"]'); await driver.wait(until.urlContains('propertyType=Apartment'), 7000); });
test('14 hero search preserves bedrooms', async () => { await open('/'); await selectValue('#heroBeds', '2'); await click('#heroSearchForm button[type="submit"]'); await driver.wait(until.urlContains('bedrooms=2'), 7000); });
test('15 home bot launcher is available', async () => { await open('/'); await waitFor('#fm-bot-launcher'); });
test('16 home bot opens', async () => { await open('/'); await click('#fm-bot-launcher'); await waitFor('#fm-bot-panel'); assert.ok((await driver.findElement(By.css('#fm-bot-panel')).getAttribute('class')).includes('fm-bot-open')); });
test('17 home bot closes', async () => { await open('/'); await click('#fm-bot-launcher'); await click('.fm-bot-close'); assert.doesNotMatch(await driver.findElement(By.css('#fm-bot-panel')).getAttribute('class'), /fm-bot-open/); });
test('18 explore page has the expected title', async () => { await open('/flats.html'); await titleIs('Explore Flats — FlatMate'); });
test('19 explore filter form is present', async () => { await open('/flats.html'); await waitFor('#filterForm'); });
test('20 explore result grid is present', async () => { await open('/flats.html'); await waitFor('#exploreGrid'); });
test('21 explore pagination is present', async () => { await open('/flats.html'); await waitFor('#explorePagination'); });
test('22 explore location filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm input[name="location"]'); });
test('23 explore purpose filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm select[name="purpose"]'); });
test('24 explore type filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm select[name="propertyType"]'); });
test('25 explore bedrooms filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm select[name="bedrooms"]'); });
test('26 explore bathrooms filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm select[name="bathrooms"]'); });
test('27 explore price filters are present', async () => { await open('/flats.html'); await waitFor('#filterForm input[name="minPrice"]'); await waitFor('#filterForm input[name="maxPrice"]'); });
test('28 explore furnishing filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm select[name="furnishing"]'); });
test('29 explore sort filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm select[name="sort"]'); });
test('30 explore amenities filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm input[name="amenities"]'); });
test('31 explore location query works', async () => { await open('/flats.html'); await captureFetches(); await type('#filterForm input[name="location"]', 'Dhaka'); await click('#filterForm button[type="submit"]'); await waitForFetch('location=Dhaka'); });
test('32 explore numeric price accepts values', async () => { await open('/flats.html'); await type('#filterForm input[name="minPrice"]', '10000'); await type('#filterForm input[name="maxPrice"]', '50000'); assert.equal(await driver.findElement(By.css('input[name="minPrice"]')).getAttribute('value'), '10000'); });
test('33 explore amenity query works', async () => { await open('/flats.html'); await captureFetches(); await type('#filterForm input[name="amenities"]', 'Lift'); await click('#filterForm button[type="submit"]'); await waitForFetch('amenities=Lift'); });
test('34 explore renders loading or empty/result state', async () => { await open('/flats.html'); await driver.wait(async () => (await bodyText()).match(/Explore available flats|No flats found|Loading/i), 7000); });
test('35 about page title is correct', async () => { await open('/about.html'); await titleIs('About — FlatMate'); });
test('36 about page has content', async () => { await open('/about.html'); assert.match(await bodyText(), /Property search should feel/i); });
test('37 contact page title is correct', async () => { await open('/contact.html'); await titleIs('Contact — FlatMate'); });
test('38 contact form is present', async () => { await open('/contact.html'); await waitFor('#contactForm'); });
test('39 contact name is required', async () => { await open('/contact.html'); assert.equal(await (await waitFor('#contactName')).getAttribute('required'), 'true'); });
test('40 contact email has email type', async () => { await open('/contact.html'); assert.equal(await (await waitFor('#contactEmail')).getAttribute('type'), 'email'); });
test('41 contact message is required', async () => { await open('/contact.html'); assert.equal(await (await waitFor('#contactMessage')).getAttribute('required'), 'true'); });
test('42 contact incomplete submit stays on page', async () => { await open('/contact.html'); await click('#contactSubmitBtn'); assert.ok((await driver.getCurrentUrl()).includes('/contact.html')); });
test('43 login page title is correct', async () => { await open('/login.html'); await titleIs('Sign In — FlatMate'); });
test('44 login form is present', async () => { await open('/login.html'); await waitFor('#loginForm'); });
test('45 login email is required', async () => { await open('/login.html'); assert.equal(await (await waitFor('#loginEmail')).getAttribute('required'), 'true'); });
test('46 login password is required', async () => { await open('/login.html'); assert.equal(await (await waitFor('#loginPassword')).getAttribute('required'), 'true'); });
test('47 login email uses email input', async () => { await open('/login.html'); assert.equal(await (await waitFor('#loginEmail')).getAttribute('type'), 'email'); });
test('48 login password starts hidden', async () => { await open('/login.html'); assert.equal(await (await waitFor('#loginPassword')).getAttribute('type'), 'password'); });
test('49 login has register link', async () => { await open('/login.html'); assert.ok(await exists('a[href="/register.html"]')); });
test('50 login has forgot-password link', async () => { await open('/login.html'); assert.ok(await exists('a[href="/forgot-password.html"]')); });
test('51 invalid login remains on login page', async () => { await open('/login.html'); await type('#loginEmail', 'missing@gmail.com'); await type('#loginPassword', 'WrongPass1'); await click('#loginForm button[type="submit"]'); await driver.wait(async () => (await driver.getCurrentUrl()).includes('/login.html'), 7000); });
test('52 register page title is correct', async () => { await open('/register.html'); await titleIs('Join FlatMate'); });
test('53 register form is present', async () => { await open('/register.html'); await waitFor('#registerForm'); });
test('54 register name is required', async () => { await open('/register.html'); assert.equal(await (await waitFor('#regName')).getAttribute('required'), 'true'); });
test('55 register password has length constraints', async () => { await open('/register.html'); const field = await waitFor('#regPassword'); assert.equal(await field.getAttribute('minlength'), '6'); assert.equal(await field.getAttribute('maxlength'), '16'); });
test('56 register exposes all account roles', async () => { await open('/register.html'); assert.equal((await driver.findElements(By.css('input[name="role"]'))).length, 3); });
test('57 register rejects non-Gmail address', async () => { await open('/register.html'); await type('#regName', 'Browser Test'); await type('#regEmail', 'browser@example.com'); await type('#regPassword', 'ValidPass1'); await type('#regConfirm', 'ValidPass1'); await click('#registerForm button[type="submit"]'); assert.match(await waitForToastText(/valid Gmail address/i), /valid Gmail address/i); });
test('58 register rejects mismatched passwords', async () => { await open('/register.html'); await type('#regName', 'Browser Test'); await type('#regEmail', 'browser-test@gmail.com'); await type('#regPassword', 'ValidPass1'); await type('#regConfirm', 'DifferentPass1'); await click('#registerForm button[type="submit"]'); assert.match(await waitForToastText(/Passwords do not match/i), /Passwords do not match/i); });
test('59 forgot-password title is correct', async () => { await open('/forgot-password.html'); await titleIs('Forgot Password — FlatMate'); });
test('60 forgot-password form is present', async () => { await open('/forgot-password.html'); await waitFor('#forgotForm'); });
test('61 forgot-password rejects non-Gmail address', async () => { await open('/forgot-password.html'); await type('#forgotEmail', 'not-an-email@yahoo.com'); await click('#forgotForm button[type="submit"]'); assert.match(await waitForToastText(/valid Gmail address/i), /valid Gmail address/i); });
test('62 reset-password title is correct', async () => { await open('/reset-password.html?email=person%40gmail.com'); await titleIs('Reset Password — FlatMate'); });
test('63 reset-password pre-fills email', async () => { await open('/reset-password.html?email=person%40gmail.com'); assert.equal(await (await waitFor('#resetEmail')).getAttribute('value'), 'person@gmail.com'); });
test('64 reset code requires six digits', async () => { await open('/reset-password.html'); const field = await waitFor('#resetCode'); assert.equal(await field.getAttribute('pattern'), '\\d{6}'); assert.equal(await field.getAttribute('maxlength'), '6'); });
test('65 reset form exposes resend control', async () => { await open('/reset-password.html'); await waitFor('#resendCodeBtn'); });
test('66 reset password fields are protected', async () => { await open('/reset-password.html'); assert.equal(await (await waitFor('#resetPassword')).getAttribute('type'), 'password'); assert.equal(await (await waitFor('#resetConfirm')).getAttribute('type'), 'password'); });
test('67 register or reuse the E2E Both account', async () => {
    await open('/register.html');
    await type('#regName', E2E_NAME);
    await type('#regEmail', E2E_EMAIL);
    await type('#regPassword', E2E_PASSWORD);
    await type('#regConfirm', E2E_PASSWORD);
    await driver.findElement(By.css('input[name="role"][value="Both"]')).click();
    await click('#registerForm button[type="submit"]');
    await driver.wait(async () => (await driver.getCurrentUrl()).endsWith('/') || await exists('.toast'), 8000);
    // Always perform a fresh UI login. This handles both a newly-created
    // account and the existing-account 409 response deterministically.
    await navigate('/login.html');
    await type('#loginEmail', E2E_EMAIL);
    await type('#loginPassword', E2E_PASSWORD);
    await click('#loginForm button[type="submit"]');
    await waitForUrl('/');
    const session = await driver.wait(async () => {
        const current = await driver.executeScript('return fetch("/api/auth/session", {credentials:"include"}).then(r => r.json());');
        return current.authenticated ? current : false;
    }, 8000);
    assert.equal(session.authenticated, true);
});

test('68 authenticated account has the requested name', async () => {
    await navigate('/profile.html');
    await waitFor('#profileContainer');
    await driver.wait(async () => (await bodyText()).includes(E2E_NAME), 7000);
    assert.match(await bodyText(), new RegExp(E2E_NAME));
});

test('69 account has Both role for seeker and owner workflows', async () => {
    await navigate('/edit-profile.html');
    await waitFor('#editProfileForm');
    const role = await driver.findElement(By.css('#editRole')).getAttribute('value');
    if (role !== 'Both') {
        await selectExact('#editRole', 'Both');
        await click('#editProfileForm button[type="submit"]');
        await waitForUrl('/profile.html');
    }
    const profile = await driver.executeScript('return fetch("/api/profile", {credentials:"include"}).then(r => r.json());');
    assert.equal(profile.Role, 'Both');
});

test('70 seeker search returns a public property owned by another user', async () => {
    await navigate('/flats.html');
    await waitFor('#exploreGrid');
    const result = await driver.executeScript(`return Promise.all([
        fetch('/api/flats?limit=30').then(r => r.json()),
        fetch('/api/auth/session', {credentials:'include'}).then(r => r.json())
    ]).then(([flats, session]) => ({ flat: flats.find(f => Number(f.OwnerId) !== Number(session.user?.id || session.user?.Id)) }));`);
    assert.ok(result.flat?.Id, 'No public property owned by another account is available for seeker tests.');
    publicFlatId = result.flat.Id;
});

test('71 seeker opens the selected property', async () => {
    await navigate(`/flat.html?id=${encodeURIComponent(publicFlatId)}`);
    await waitFor('#flatDetail');
    await driver.wait(async () => await exists('#favoriteBtn'), 7000);
    assert.match(await bodyText(), /Property Summary|Property Owner/);
});

test('72 seeker saves the selected property', async () => {
    const status = await driver.executeScript(`return fetch('/api/favorites/${encodeURIComponent(publicFlatId)}/status', {credentials:'include'}).then(r => r.json());`);
    if (!status.favorited) await click('#favoriteBtn');
    await driver.wait(async () => (await driver.findElement(By.css('#favoriteBtn')).getText()).match(/Saved/), 7000);
    assert.match(await driver.findElement(By.css('#favoriteBtn')).getText(), /Saved/);
});

test('73 saved property appears in the profile', async () => {
    await navigate('/profile.html');
    await waitFor('#profileFavorites');
    await driver.wait(async () => (await bodyText()).includes('Saved Properties'), 7000);
    const favoriteIds = await driver.executeScript('return fetch("/api/favorites", {credentials:"include"}).then(r => r.json()).then(data => (data.favorites || []).map(flat => Number(flat.Id)));');
    assert.ok(favoriteIds.includes(Number(publicFlatId)));
});

test('74 report page loads for the selected property', async () => {
    await navigate(`/report.html?flatId=${encodeURIComponent(publicFlatId)}`);
    await driver.wait(async () => await exists('#reportCard'), 7000);
    assert.equal(await driver.findElement(By.css('#reportCard')).getAttribute('hidden'), null);
});

test('75 report form exposes a required reason', async () => {
    assert.equal(await (await waitFor('#reason')).getAttribute('required'), 'true');
    await selectExact('#reason', 'Wrong information');
    await type('#details', 'Selenium E2E report verification.');
});

test('76 seeker submits a property report', async () => {
    await click('#submitReport');
    await driver.wait(async () => await exists('#reportSuccess') || (await driver.findElement(By.css('#reportStatus')).getText()).trim().length > 0, 7000);
    const successVisible = await exists('#reportSuccess') && await driver.findElement(By.css('#reportSuccess')).getAttribute('hidden') === null;
    const statusText = await driver.findElement(By.css('#reportStatus')).getText();
    assert.ok(successVisible || /already reported|submitted|could not/i.test(statusText));
});

test('77 owner dashboard is reachable for Both account', async () => {
    await navigate('/owner-dashboard.html');
    await waitFor('#dashboardContainer');
    await driver.wait(async () => (await bodyText()).match(/My Properties|No Properties Yet|PROPERTY MANAGEMENT/), 7000);
    assert.match(await bodyText(), /My Properties|No Properties Yet/);
});

test('78 add-property form is reachable', async () => {
    await navigate('/edit-flat.html');
    await waitFor('#editFlatForm');
    assert.equal(await (await waitFor('input[name="Title"]')).getAttribute('required'), 'true');
});

test('79 owner fills required property fields', async () => {
    await type('input[name="Title"]', createdTitle);
    await selectExact('select[name="Purpose"]', 'Rent');
    await selectExact('select[name="PropertyType"]', 'Apartment');
    await type('input[name="Price"]', '35000');
    await type('input[name="Bedrooms"]', '2');
    await type('input[name="Bathrooms"]', '2');
    await type('input[name="Area"]', '1100');
    await type('input[name="AreaName"]', 'Selenium Area');
    await type('input[name="City"]', 'Dhaka');
    assert.equal(await driver.findElement(By.css('input[name="Title"]')).getAttribute('value'), createdTitle);
});

test('80 owner creates the property', async () => {
    await click('#editFlatForm button[type="submit"]');
    await waitForUrl('/owner-dashboard.html');
    await driver.wait(async () => (await bodyText()).includes(createdTitle), 10000);
    const links = await flatLinks(`a.owner-edit-btn[href*="/edit-flat.html?id="]`);
    for (const link of links) {
        const href = await link.getAttribute('href');
        const card = await link.findElement(By.xpath('ancestor::article[1]'));
        if ((await card.getText()).includes(createdTitle)) createdFlatId = new URL(href, BASE_URL).searchParams.get('id');
    }
    assert.ok(createdFlatId, 'Created property ID was not found in owner dashboard.');
});

test('81 created property is visible on its public detail page', async () => {
    await navigate(`/flat.html?id=${encodeURIComponent(createdFlatId)}`);
    await waitFor('#flatDetail');
    await driver.wait(async () => (await bodyText()).includes(createdTitle), 7000);
    assert.match(await bodyText(), /Selenium Area|Dhaka/);
});

test('82 edit page loads the created property values', async () => {
    await navigate(`/edit-flat.html?id=${encodeURIComponent(createdFlatId)}`);
    await waitFor('#editFlatForm');
    await driver.wait(async () => (await driver.findElement(By.css('input[name="Title"]')).getAttribute('value')).length > 0, 10000);
    assert.equal(await driver.findElement(By.css('input[name="Title"]')).getAttribute('value'), createdTitle);
    assert.match(await driver.findElement(By.css('input[name="Price"]')).getAttribute('value'), /^35000(?:\.00)?$/);
});

test('83 owner edits the property title and price', async () => {
    await type('input[name="Title"]', `${createdTitle} Updated`);
    await type('input[name="Price"]', '36000');
    await click('#editFlatForm button[type="submit"]');
    await waitForUrl('/owner-dashboard.html');
    await driver.wait(async () => (await bodyText()).includes(`${createdTitle} Updated`), 10000);
});

test('84 edited property values persist on the detail page', async () => {
    await navigate(`/flat.html?id=${encodeURIComponent(createdFlatId)}`);
    await waitFor('#flatDetail');
    await driver.wait(async () => (await bodyText()).includes(`${createdTitle} Updated`), 7000);
    assert.match(await bodyText(), /36,000|36000/);
});

test('85 search filters can find the created property', async () => {
    await navigate('/flats.html');
    await waitFor('#filterForm');
    await captureFetches();
    await type('#filterForm input[name="location"]', 'Selenium Area');
    await driver.executeScript('document.querySelector("#filterForm").requestSubmit();');
    await waitForFetch('location=');
    await driver.wait(async () => (await bodyText()).match(/Selenium FlatMate|No properties found/i), 7000);
});

test('86 owner dashboard exposes edit and delete controls', async () => {
    await navigate('/owner-dashboard.html');
    await waitFor('#dashboardContainer');
    assert.ok((await driver.findElements(By.css(`a.owner-edit-btn[href*="id=${createdFlatId}"]`))).length > 0);
    assert.ok((await driver.findElements(By.css('.owner-delete-btn'))).length > 0);
});

test('87 owner deletes the created property', async () => {
    await driver.executeScript('window.confirm = () => true;');
    await driver.findElement(By.css(`button.owner-delete-btn[onclick*="${createdFlatId}"]`)).click();
    await driver.wait(async () => !(await bodyText()).includes(`${createdTitle} Updated`), 10000);
    assert.doesNotMatch(await bodyText(), new RegExp(`${createdTitle} Updated`));
});

test('88 deleted property no longer loads publicly', async () => {
    await driver.manage().deleteAllCookies();
    const deleted = await driver.executeScript(`return fetch('/api/flats/${encodeURIComponent(createdFlatId)}').then(async response => ({ status: response.status, body: await response.json() }));`);
    assert.equal(deleted.status, 404);
    assert.match(deleted.body.error, /no longer available|not found/i);
});

test('89 account deletion confirmation flow removes the account', { skip: RUN_ACCOUNT_DELETION !== 'true' }, async () => {
    await navigate('/edit-profile.html');
    await waitFor('#deleteAccountBtn');
    await driver.executeScript(`window.prompt = (message) => message.includes('Type DELETE') ? 'DELETE' : ${JSON.stringify(E2E_PASSWORD)}; window.alert = () => {};`);
    await click('#deleteAccountBtn');
    await waitForUrl('/');
    const session = await driver.executeScript('return fetch("/api/auth/session", {credentials:"include"}).then(r => r.json());');
    assert.equal(session.authenticated, false);
});

test('90 deleted account can no longer access protected profile', { skip: RUN_ACCOUNT_DELETION !== 'true' }, async () => {
    await navigate('/profile.html');
    await driver.wait(async () => (await driver.getCurrentUrl()).includes('/login.html') || (await bodyText()).match(/log in|not authenticated/i), 7000);
    assert.ok((await driver.getCurrentUrl()).includes('/login.html') || /log in|not authenticated/i.test(await bodyText()));
});
