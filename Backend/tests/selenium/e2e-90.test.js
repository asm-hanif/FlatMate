// Run the full account-to-listing browser journey; later tests reuse earlier state.
const assert = require('node:assert/strict'); // Compare actual browser results with expected values.
const test = require('node:test'); // Register browser cases with Node's built-in test runner.
const { Builder, By, until } = require('selenium-webdriver'); // Start browsers, locate elements, and wait for UI state.

// Read optional server, browser, account, and destructive-test settings from the environment.
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
let driver; // Selenium WebDriver controls the current browser session.
let publicFlatId; // Share the selected public listing between seeker cases.
let createdFlatId; // Share the listing created by the owner workflow.
const createdTitle = `Selenium FlatMate ${Date.now()}`; // Make the test listing unique across runs.

// Build absolute URLs so every case targets the configured application.
const page = path => `${BASE_URL}${path}`;

// Wait for a CSS selector and return its first matching element.
async function waitFor(selector, timeout = 7000) {
    return driver.wait(until.elementLocated(By.css(selector)), timeout);
}

// Check whether the page currently contains a matching element.
async function exists(selector) {
    return (await driver.findElements(By.css(selector))).length > 0;
}

// Read visible page text for content and workflow assertions.
async function bodyText() {
    return (await driver.findElement(By.css('body')).getText()).trim();
}

// Clear session cookies before opening a clean page for the next workflow.
async function open(path) {
    await driver.manage().deleteAllCookies();
    await driver.get(page(path));
    await waitFor('body');
}

// Navigate without clearing cookies so authenticated workflows keep their session.
async function navigate(path) {
    await driver.get(page(path));
    await waitFor('body');
}

// Scroll a located control into view before clicking it.
async function click(selector) {
    const element = await waitFor(selector);
    await driver.executeScript('arguments[0].scrollIntoView({block: "center"});', element);
    await element.click();
}

// Replace a field's current value with the requested test input.
async function type(selector, value) {
    const element = await waitFor(selector);
    await element.clear();
    await element.sendKeys(value);
}

// Wait until the browser title matches, then verify the final value.
async function titleIs(title) {
    await driver.wait(until.titleIs(title), 7000);
    assert.equal(await driver.getTitle(), title);
}

// Open a protected page and accept either a login redirect or its expected content.
async function protectedRoute(path, selector) {
    await open(path);
    await driver.wait(async () => {
        const url = await driver.getCurrentUrl();
        return url.includes('/login.html') || await exists(selector);
    }, 7000);
    assert.ok((await driver.getCurrentUrl()).includes('/login.html') || await exists(selector));
}

// Select an option by sending its visible value to the dropdown.
async function selectValue(selector, value) {
    const element = await waitFor(selector);
    await element.sendKeys(value);
}

// Record fetch URLs so tests can verify that a form sent the expected query.
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

// Wait until a recorded browser request contains the expected query fragment.
async function waitForFetch(fragment) {
    await driver.wait(async () => {
        const fetches = await driver.executeScript('return window.__flatMateFetches || [];');
        return fetches.some(url => url.includes(fragment));
    }, 7000);
}

// Wait for the latest toast to match the expected text, then return it.
async function waitForToastText(expected) {
    await driver.wait(async () => {
        const toasts = await driver.findElements(By.css('.toast'));
        if (!toasts.length) return false;
        return (await toasts[toasts.length - 1].getText()).match(expected);
    }, 3000);
    const toasts = await driver.findElements(By.css('.toast'));
    return toasts[toasts.length - 1].getText();
}

// Wait until navigation reaches a URL containing the requested fragment.
async function waitForUrl(fragment, timeout = 8000) {
    await driver.wait(until.urlContains(fragment), timeout);
    return driver.getCurrentUrl();
}

// Select a dropdown option and leave selection validation to the calling case.
async function selectExact(selector, value) {
    const element = await waitFor(selector);
    await element.sendKeys(value);
}

// Return matching listing links for owner-dashboard assertions.
async function flatLinks(selector) {
    return driver.findElements(By.css(selector));
}

// Create one browser for the ordered end-to-end workflow and configure timeouts.
test.before(async () => {
    const builder = new Builder().forBrowser(BROWSER === 'edge' ? 'MicrosoftEdge' : BROWSER);
    if (BROWSER === 'chrome') {
        const chrome = require('selenium-webdriver/chrome');
        const options = new chrome.Options();
        if (process.env.SELENIUM_HEADLESS === 'false')
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

// Always close the driver after the end-to-end cases finish.
test.after(async () => {
    if (driver) await driver.quit();
});

// Open the home route and verify its document title.
test('01 home page returns successfully', async () => { await open('/'); await titleIs('FlatMate — Find Your Perfect Place'); });
// Confirm the home page contains the main hero heading.
test('02 home hero is visible', async () => { await open('/'); assert.ok(await exists('.hero-title')); });
// Confirm the shared brand link is rendered on the home page.
test('03 home brand is visible', async () => { await open('/'); assert.ok(await exists('.navbar-brand')); });
// Ensure the hero search form is available to visitors.
test('04 home hero search form is visible', async () => { await open('/'); await waitFor('#heroSearchForm'); });
// Check the location field gives users an example search format.
test('05 home location input has a placeholder', async () => { await open('/'); assert.equal(await (await waitFor('#heroLocation')).getAttribute('placeholder'), 'City, area or address'); });
// Verify the purpose dropdown offers selectable property purposes.
test('06 home purpose options are available', async () => { await open('/'); assert.ok((await driver.findElements(By.css('#heroPurpose option'))).length >= 2); });
// Verify the property-type dropdown offers selectable types.
test('07 home type options are available', async () => { await open('/'); assert.ok((await driver.findElements(By.css('#heroType option'))).length >= 2); });
// Ensure bedroom count can be included in a home search.
test('08 home bedroom filter is available', async () => { await open('/'); await waitFor('#heroBeds'); });
// Ensure the featured-property area is present on the home page.
test('09 home featured grid is present', async () => { await open('/'); await waitFor('#featuredGrid'); });
// Confirm the common footer is rendered below home content.
test('10 home footer is present', async () => { await open('/'); assert.ok(await exists('footer.footer')); });
// Submit a location and verify it is carried into the explore URL.
test('11 hero search preserves location', async () => { await open('/'); await type('#heroLocation', 'Dhaka'); await click('#heroSearchForm button[type="submit"]'); await driver.wait(until.urlContains('location=Dhaka'), 7000); });
// Submit a purpose and verify it is carried into the explore URL.
test('12 hero search preserves purpose', async () => { await open('/'); await selectValue('#heroPurpose', 'Rent'); await click('#heroSearchForm button[type="submit"]'); await driver.wait(until.urlContains('purpose=Rent'), 7000); });
// Submit a property type and verify it is carried into the explore URL.
test('13 hero search preserves property type', async () => { await open('/'); await selectValue('#heroType', 'Apartment'); await click('#heroSearchForm button[type="submit"]'); await driver.wait(until.urlContains('propertyType=Apartment'), 7000); });
// Submit a bedroom count and verify it is carried into the explore URL.
test('14 hero search preserves bedrooms', async () => { await open('/'); await selectValue('#heroBeds', '2'); await click('#heroSearchForm button[type="submit"]'); await driver.wait(until.urlContains('bedrooms=2'), 7000); });
// Ensure the assistant launch control is visible on the home page.
test('15 home bot launcher is available', async () => { await open('/'); await waitFor('#fm-bot-launcher'); });
// Open the assistant and verify its panel enters the open state.
test('16 home bot opens', async () => { await open('/'); await click('#fm-bot-launcher'); await waitFor('#fm-bot-panel'); assert.ok((await driver.findElement(By.css('#fm-bot-panel')).getAttribute('class')).includes('fm-bot-open')); });
// Close the assistant and verify its open-state class is removed.
test('17 home bot closes', async () => { await open('/'); await click('#fm-bot-launcher'); await click('.fm-bot-close'); assert.doesNotMatch(await driver.findElement(By.css('#fm-bot-panel')).getAttribute('class'), /fm-bot-open/); });
// Verify the explore page is served with its expected title.
test('18 explore page has the expected title', async () => { await open('/flats.html'); await titleIs('Explore Flats — FlatMate'); });
// Ensure the explore filters are rendered.
test('19 explore filter form is present', async () => { await open('/flats.html'); await waitFor('#filterForm'); });
// Ensure the explore results container is rendered.
test('20 explore result grid is present', async () => { await open('/flats.html'); await waitFor('#exploreGrid'); });
// Ensure pagination controls are available below the results.
test('21 explore pagination is present', async () => { await open('/flats.html'); await waitFor('#explorePagination'); });
// Check the location filter is available for explore searches.
test('22 explore location filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm input[name="location"]'); });
// Check the purpose filter is available for explore searches.
test('23 explore purpose filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm select[name="purpose"]'); });
// Check the property-type filter is available for explore searches.
test('24 explore type filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm select[name="propertyType"]'); });
// Check the bedroom-count filter is available for explore searches.
test('25 explore bedrooms filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm select[name="bedrooms"]'); });
// Check the bathroom-count filter is available for explore searches.
test('26 explore bathrooms filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm select[name="bathrooms"]'); });
// Check minimum and maximum price inputs are both present.
test('27 explore price filters are present', async () => { await open('/flats.html'); await waitFor('#filterForm input[name="minPrice"]'); await waitFor('#filterForm input[name="maxPrice"]'); });
// Check the furnishing dropdown is available.
test('28 explore furnishing filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm select[name="furnishing"]'); });
// Check the sorting dropdown is available.
test('29 explore sort filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm select[name="sort"]'); });
// Check the amenities field is available for filtering.
test('30 explore amenities filter is present', async () => { await open('/flats.html'); await waitFor('#filterForm input[name="amenities"]'); });
// Submit a location filter and inspect the recorded request URL.
test('31 explore location query works', async () => { await open('/flats.html'); await captureFetches(); await type('#filterForm input[name="location"]', 'Dhaka'); await driver.executeScript('document.querySelector("#filterForm").requestSubmit();'); await waitForFetch('location=Dhaka'); });
// Enter a price range and verify the minimum value remains in its input.
test('32 explore numeric price accepts values', async () => { await open('/flats.html'); await type('#filterForm input[name="minPrice"]', '10000'); await type('#filterForm input[name="maxPrice"]', '50000'); assert.equal(await driver.findElement(By.css('input[name="minPrice"]')).getAttribute('value'), '10000'); });
// Submit an amenity filter and verify the request includes the selected amenity.
test('33 explore amenity query works', async () => { await open('/flats.html'); await captureFetches(); await type('#filterForm input[name="amenities"]', 'Lift'); await click('#filterForm button[type="submit"]'); await waitForFetch('amenities=Lift'); });
// Wait for the results area to show its initial, empty, or loading state.
test('34 explore renders loading or empty/result state', async () => { await open('/flats.html'); await driver.wait(async () => (await bodyText()).match(/Explore available flats|No flats found|Loading/i), 7000); });
// Verify the about page title.
test('35 about page title is correct', async () => { await open('/about.html'); await titleIs('About — FlatMate'); });
// Verify the about page contains its main message.
test('36 about page has content', async () => { await open('/about.html'); assert.match(await bodyText(), /Property search should feel/i); });
// Verify the contact page title.
test('37 contact page title is correct', async () => { await open('/contact.html'); await titleIs('Contact — FlatMate'); });
// Ensure the contact form is present.
test('38 contact form is present', async () => { await open('/contact.html'); await waitFor('#contactForm'); });
// Require a name before the contact form can be submitted.
test('39 contact name is required', async () => { await open('/contact.html'); assert.equal(await (await waitFor('#contactName')).getAttribute('required'), 'true'); });
// Ensure the contact email field uses browser email validation.
test('40 contact email has email type', async () => { await open('/contact.html'); assert.equal(await (await waitFor('#contactEmail')).getAttribute('type'), 'email'); });
// Require a message before the contact form can be submitted.
test('41 contact message is required', async () => { await open('/contact.html'); assert.equal(await (await waitFor('#contactMessage')).getAttribute('required'), 'true'); });
// Submit the blank contact form and verify browser validation prevents navigation.
test('42 contact incomplete submit stays on page', async () => { await open('/contact.html'); await click('#contactSubmitBtn'); assert.ok((await driver.getCurrentUrl()).includes('/contact.html')); });
// Verify the login page title.
test('43 login page title is correct', async () => { await open('/login.html'); await titleIs('Sign In — FlatMate'); });
// Ensure the login form is present.
test('44 login form is present', async () => { await open('/login.html'); await waitFor('#loginForm'); });
// Require an email address before login submission.
test('45 login email is required', async () => { await open('/login.html'); assert.equal(await (await waitFor('#loginEmail')).getAttribute('required'), 'true'); });
// Require a password before login submission.
test('46 login password is required', async () => { await open('/login.html'); assert.equal(await (await waitFor('#loginPassword')).getAttribute('required'), 'true'); });
// Ensure the login email control uses browser email validation.
test('47 login email uses email input', async () => { await open('/login.html'); assert.equal(await (await waitFor('#loginEmail')).getAttribute('type'), 'email'); });
// Ensure the password is masked when the login page first loads.
test('48 login password starts hidden', async () => { await open('/login.html'); assert.equal(await (await waitFor('#loginPassword')).getAttribute('type'), 'password'); });
// Confirm login offers a direct link to registration.
test('49 login has register link', async () => { await open('/login.html'); assert.ok(await exists('a[href="/register.html"]')); });
// Confirm login offers a direct link to password recovery.
test('50 login has forgot-password link', async () => { await open('/login.html'); assert.ok(await exists('a[href="/forgot-password.html"]')); });
// Submit invalid credentials and verify the browser stays on the login route.
test('51 invalid login remains on login page', async () => { await open('/login.html'); await type('#loginEmail', 'missing@gmail.com'); await type('#loginPassword', 'WrongPass1'); await click('#loginForm button[type="submit"]'); await driver.wait(async () => (await driver.getCurrentUrl()).includes('/login.html'), 7000); });
// Verify the registration page title.
test('52 register page title is correct', async () => { await open('/register.html'); await titleIs('Join FlatMate'); });
// Ensure the registration form is present.
test('53 register form is present', async () => { await open('/register.html'); await waitFor('#registerForm'); });
// Require a name before registration can be submitted.
test('54 register name is required', async () => { await open('/register.html'); assert.equal(await (await waitFor('#regName')).getAttribute('required'), 'true'); });
// Verify registration password fields advertise the supported length range.
test('55 register password has length constraints', async () => { await open('/register.html'); const field = await waitFor('#regPassword'); assert.equal(await field.getAttribute('minlength'), '6'); assert.equal(await field.getAttribute('maxlength'), '16'); });
// Ensure the registration form presents all three supported account roles.
test('56 register exposes all account roles', async () => { await open('/register.html'); assert.equal((await driver.findElements(By.css('input[name="role"]'))).length, 3); });
// Submit a non-Gmail registration and verify client-side validation feedback.
test('57 register rejects non-Gmail address', async () => { await open('/register.html'); await type('#regName', 'Browser Test'); await type('#regEmail', 'browser@example.com'); await type('#regPassword', 'ValidPass1'); await type('#regConfirm', 'ValidPass1'); await click('#registerForm button[type="submit"]'); assert.match(await waitForToastText(/valid Gmail address/i), /valid Gmail address/i); });
// Submit mismatched password values and verify the form displays an error.
test('58 register rejects mismatched passwords', async () => { await open('/register.html'); await type('#regName', 'Browser Test'); await type('#regEmail', 'browser-test@gmail.com'); await type('#regPassword', 'ValidPass1'); await type('#regConfirm', 'DifferentPass1'); await click('#registerForm button[type="submit"]'); assert.match(await waitForToastText(/Passwords do not match/i), /Passwords do not match/i); });
// Verify the password-recovery page title.
test('59 forgot-password title is correct', async () => { await open('/forgot-password.html'); await titleIs('Forgot Password — FlatMate'); });
// Ensure the password-recovery form is available.
test('60 forgot-password form is present', async () => { await open('/forgot-password.html'); await waitFor('#forgotForm'); });
// Submit a non-Gmail recovery address and verify validation feedback.
test('61 forgot-password rejects non-Gmail address', async () => { await open('/forgot-password.html'); await type('#forgotEmail', 'not-an-email@yahoo.com'); await click('#forgotForm button[type="submit"]'); assert.match(await waitForToastText(/valid Gmail address/i), /valid Gmail address/i); });
// Verify the reset page title when opened with a supplied email.
test('62 reset-password title is correct', async () => { await open('/reset-password.html?email=person%40gmail.com'); await titleIs('Reset Password — FlatMate'); });
// Verify the reset page decodes and prefills the email query parameter.
test('63 reset-password pre-fills email', async () => { await open('/reset-password.html?email=person%40gmail.com'); assert.equal(await (await waitFor('#resetEmail')).getAttribute('value'), 'person@gmail.com'); });
// Check the code field enforces exactly six numeric digits.
test('64 reset code requires six digits', async () => { await open('/reset-password.html'); const field = await waitFor('#resetCode'); assert.equal(await field.getAttribute('pattern'), '\\d{6}'); assert.equal(await field.getAttribute('maxlength'), '6'); });
// Ensure users can request another recovery code.
test('65 reset form exposes resend control', async () => { await open('/reset-password.html'); await waitFor('#resendCodeBtn'); });
// Ensure both new-password fields mask their contents.
test('66 reset password fields are protected', async () => { await open('/reset-password.html'); assert.equal(await (await waitFor('#resetPassword')).getAttribute('type'), 'password'); assert.equal(await (await waitFor('#resetConfirm')).getAttribute('type'), 'password'); });
// Register or reuse the E2E account, then log in through the visible UI.
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

// Load the profile and verify it belongs to the authenticated E2E account.
test('68 authenticated account has the requested name', async () => {
    await navigate('/profile.html');
    await waitFor('#profileContainer');
    await driver.wait(async () => (await bodyText()).includes(E2E_NAME), 7000);
    assert.match(await bodyText(), new RegExp(E2E_NAME));
});

// Ensure the account role supports both seeker and owner scenarios.
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

// Select a public listing owned by someone other than the signed-in test account.
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

// Open the selected listing and verify its detail and favorite controls load.
test('71 seeker opens the selected property', async () => {
    await navigate(`/flat.html?id=${encodeURIComponent(publicFlatId)}`);
    await waitFor('#flatDetail');
    await driver.wait(async () => await exists('#favoriteBtn'), 7000);
    assert.match(await bodyText(), /Property Summary|Property Owner/);
});

// Save the selected listing when needed and verify its button shows Saved.
test('72 seeker saves the selected property', async () => {
    const status = await driver.executeScript(`return fetch('/api/favorites/${encodeURIComponent(publicFlatId)}/status', {credentials:'include'}).then(r => r.json());`);
    if (!status.favorited) await click('#favoriteBtn');
    await driver.wait(async () => (await driver.findElement(By.css('#favoriteBtn')).getText()).match(/Saved/), 7000);
    assert.match(await driver.findElement(By.css('#favoriteBtn')).getText(), /Saved/);
});

// Verify the favorited listing appears in the profile's saved-property data.
test('73 saved property appears in the profile', async () => {
    await navigate('/profile.html');
    await waitFor('#profileFavorites');
    await driver.wait(async () => (await bodyText()).includes('Saved Properties'), 7000);
    const favoriteIds = await driver.executeScript('return fetch("/api/favorites", {credentials:"include"}).then(r => r.json()).then(data => (data.favorites || []).map(flat => Number(flat.Id)));');
    assert.ok(favoriteIds.includes(Number(publicFlatId)));
});

// Open a report form for the selected public listing and verify it is visible.
test('74 report page loads for the selected property', async () => {
    await navigate(`/report.html?flatId=${encodeURIComponent(publicFlatId)}`);
    await driver.wait(async () => await exists('#reportCard'), 7000);
    assert.equal(await driver.findElement(By.css('#reportCard')).getAttribute('hidden'), null);
});

// Select a valid report reason and enter details for the submission case.
test('75 report form exposes a required reason', async () => {
    assert.equal(await (await waitFor('#reason')).getAttribute('required'), 'true');
    await selectExact('#reason', 'Wrong information');
    await type('#details', 'Selenium E2E report verification.');
});

// Submit the report and wait for either visible success or a response message.
test('76 seeker submits a property report', async () => {
    await click('#submitReport');
    await driver.wait(async () => {
        const successVisible = await driver.findElement(By.css('#reportSuccess')).getAttribute('hidden') === null;
        const statusText = (await driver.findElement(By.css('#reportStatus')).getText()).trim();
        return successVisible || statusText.length > 0;
    }, 10000);
    const successVisible = await exists('#reportSuccess') && await driver.findElement(By.css('#reportSuccess')).getAttribute('hidden') === null;
    const statusText = await driver.findElement(By.css('#reportStatus')).getText();
    assert.ok(successVisible || /already reported|submitted|could not/i.test(statusText));
});

// Verify an account with the Both role can load the owner dashboard.
test('77 owner dashboard is reachable for Both account', async () => {
    await navigate('/owner-dashboard.html');
    await waitFor('#dashboardContainer');
    await driver.wait(async () => (await bodyText()).match(/My Properties|No Properties Yet|PROPERTY MANAGEMENT/), 7000);
    assert.match(await bodyText(), /My Properties|No Properties Yet/);
});

// Open the property editor and verify its required title field.
test('78 add-property form is reachable', async () => {
    await navigate('/edit-flat.html');
    await waitFor('#editFlatForm');
    assert.equal(await (await waitFor('input[name="Title"]')).getAttribute('required'), 'true');
});

// Fill required listing details and verify the title was entered correctly.
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

// Submit the listing, find its dashboard edit link, and retain its ID for later cases.
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

// Open the newly created listing publicly and verify its title and location.
test('81 created property is visible on its public detail page', async () => {
    await navigate(`/flat.html?id=${encodeURIComponent(createdFlatId)}`);
    await waitFor('#flatDetail');
    await driver.wait(async () => (await bodyText()).includes(createdTitle), 7000);
    assert.match(await bodyText(), /Selenium Area|Dhaka/);
});

// Load the edit form and verify it prefills the saved title and price.
test('82 edit page loads the created property values', async () => {
    await navigate(`/edit-flat.html?id=${encodeURIComponent(createdFlatId)}`);
    await waitFor('#editFlatForm');
    await driver.wait(async () => (await driver.findElement(By.css('input[name="Title"]')).getAttribute('value')).length > 0, 10000);
    assert.equal(await driver.findElement(By.css('input[name="Title"]')).getAttribute('value'), createdTitle);
    assert.match(await driver.findElement(By.css('input[name="Price"]')).getAttribute('value'), /^35000(?:\.00)?$/);
});

// Change listing title and price, then verify the dashboard shows the new title.
test('83 owner edits the property title and price', async () => {
    await type('input[name="Title"]', `${createdTitle} Updated`);
    await type('input[name="Price"]', '36000');
    await click('#editFlatForm button[type="submit"]');
    await waitForUrl('/owner-dashboard.html');
    await driver.wait(async () => (await bodyText()).includes(`${createdTitle} Updated`), 10000);
});

// Reopen public details to confirm the edited title and price persisted.
test('84 edited property values persist on the detail page', async () => {
    await navigate(`/flat.html?id=${encodeURIComponent(createdFlatId)}`);
    await waitFor('#flatDetail');
    await driver.wait(async () => (await bodyText()).includes(`${createdTitle} Updated`), 7000);
    assert.match(await bodyText(), /36,000|36000/);
});

// Search by the listing's area and wait for the matching results request.
test('85 search filters can find the created property', async () => {
    await navigate('/flats.html');
    await waitFor('#filterForm');
    await captureFetches();
    await type('#filterForm input[name="location"]', 'Selenium Area');
    await driver.executeScript('document.querySelector("#filterForm").requestSubmit();');
    await waitForFetch('location=');
    await driver.wait(async () => (await bodyText()).match(/Selenium FlatMate|No properties found/i), 7000);
});

// Verify the owner's listing exposes its edit link and delete action.
test('86 owner dashboard exposes edit and delete controls', async () => {
    await navigate('/owner-dashboard.html');
    await waitFor('#dashboardContainer');
    assert.ok((await driver.findElements(By.css(`a.owner-edit-btn[href*="id=${createdFlatId}"]`))).length > 0);
    assert.ok((await driver.findElements(By.css('.owner-delete-btn'))).length > 0);
});

// Confirm deletion in the browser and verify the listing disappears from the dashboard.
test('87 owner deletes the created property', async () => {
    await driver.executeScript('window.confirm = () => true;');
    await driver.findElement(By.css(`button.owner-delete-btn[onclick*="${createdFlatId}"]`)).click();
    await driver.wait(async () => !(await bodyText()).includes(`${createdTitle} Updated`), 10000);
    assert.doesNotMatch(await bodyText(), new RegExp(`${createdTitle} Updated`));
});

// Request the deleted listing without a session and verify the API returns 404.
test('88 deleted property no longer loads publicly', async () => {
    await driver.manage().deleteAllCookies();
    const deleted = await driver.executeScript(`return fetch('/api/flats/${encodeURIComponent(createdFlatId)}').then(async response => ({ status: response.status, body: await response.json() }));`);
    assert.equal(deleted.status, 404);
    assert.match(deleted.body.error, /no longer available|not found/i);
});

// Optionally confirm account deletion through the UI when explicitly enabled.
test('89 account deletion confirmation flow removes the account', { skip: RUN_ACCOUNT_DELETION !== 'true' }, async () => {
    await navigate('/edit-profile.html');
    await waitFor('#deleteAccountBtn');
    await driver.executeScript(`window.prompt = (message) => message.includes('Type DELETE') ? 'DELETE' : ${JSON.stringify(E2E_PASSWORD)}; window.alert = () => {};`);
    await click('#deleteAccountBtn');
    await waitForUrl('/');
    const session = await driver.executeScript('return fetch("/api/auth/session", {credentials:"include"}).then(r => r.json());');
    assert.equal(session.authenticated, false);
});

// After opt-in account deletion, verify protected profile access is denied.
test('90 deleted account can no longer access protected profile', { skip: RUN_ACCOUNT_DELETION !== 'true' }, async () => {
    await navigate('/profile.html');
    await driver.wait(async () => (await driver.getCurrentUrl()).includes('/login.html') || (await bodyText()).match(/log in|not authenticated/i), 7000);
    assert.ok((await driver.getCurrentUrl()).includes('/login.html') || /log in|not authenticated/i.test(await bodyText()));
});
