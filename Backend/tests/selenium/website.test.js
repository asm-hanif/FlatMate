/**
 * FlatMate browser smoke tests.
 *
 * Start the app before running this suite:
 *   npm run dev
 *
 * Then, in another terminal:
 *   npm run test:selenium
 *
 * Optional environment variables:
 *   TEST_BASE_URL=http://localhost:3000
 *   SELENIUM_BROWSER=chrome|firefox|edge
 *   SELENIUM_HEADLESS=false
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { Builder, By, until } = require('selenium-webdriver');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const BROWSER = process.env.SELENIUM_BROWSER || 'chrome';

let driver;

function page(path) {
    return `${BASE_URL}${path}`;
}

async function waitFor(selector, timeout = 5000) {
    return driver.wait(until.elementLocated(By.css(selector)), timeout);
}

async function titleShouldBe(expected) {
    await driver.wait(until.titleIs(expected), 5000);
    assert.equal(await driver.getTitle(), expected);
}

async function click(selector) {
    const element = await waitFor(selector);
    await driver.executeScript('arguments[0].scrollIntoView({block: "center"});', element);
    await element.click();
}

async function clearAndType(selector, value) {
    const element = await waitFor(selector);
    await element.clear();
    await element.sendKeys(value);
}

async function waitForText(selector, timeout = 5000) {
    await driver.wait(async () => {
        const elements = await driver.findElements(By.css(selector));
        if (!elements.length) return false;
        return (await elements[elements.length - 1].getText()).trim().length > 0;
    }, timeout);
    const elements = await driver.findElements(By.css(selector));
    return elements[elements.length - 1];
}

test.before(async () => {
    const builder = new Builder().forBrowser(BROWSER === 'edge' ? 'MicrosoftEdge' : BROWSER);

    if (BROWSER === 'chrome') {
        const chrome = require('selenium-webdriver/chrome');
        const options = new chrome.Options();
        if (process.env.SELENIUM_HEADLESS !== 'false') {
            options.addArguments('--headless=new', '--window-size=1440,1000');
        }
        builder.setChromeOptions(options);
    } else if (BROWSER === 'firefox') {
        const firefox = require('selenium-webdriver/firefox');
        const options = new firefox.Options();
        if (process.env.SELENIUM_HEADLESS !== 'false') options.addArguments('-headless');
        builder.setFirefoxOptions(options);
    } else if (BROWSER === 'edge' || BROWSER === 'MicrosoftEdge') {
        const edge = require('selenium-webdriver/edge');
        const options = new edge.Options();
        if (process.env.SELENIUM_HEADLESS !== 'false') {
            options.addArguments('--headless=new', '--window-size=1440,1000');
        }
        builder.setEdgeOptions(options);
    }

    driver = await builder.build();
    await driver.manage().setTimeouts({ implicit: 1000, pageLoad: 15000, script: 5000 });
});

test.after(async () => {
    if (driver) await driver.quit();
});

test('homepage loads with hero, search controls, and public navigation', async () => {
    await driver.get(page('/'));
    await titleShouldBe('FlatMate — Find Your Perfect Place');
    assert.match(await (await waitFor('.hero-title')).getText(), /Find a place that/);
    await waitFor('#heroSearchForm');
    await waitFor('#heroLocation');
    await waitFor('#heroPurpose');
    await waitFor('#heroType');
    await waitFor('#heroBeds');
    await waitFor('.navbar-brand');
});

test('homepage hero search navigates with query parameters', async () => {
    await driver.get(page('/'));
    await clearAndType('#heroLocation', 'Dhaka');
    await (await waitFor('#heroPurpose')).sendKeys('Rent');
    await (await waitFor('#heroType')).sendKeys('Apartment');
    await (await waitFor('#heroBeds')).sendKeys('2');
    await click('#heroSearchForm button[type="submit"]');
    await driver.wait(until.urlContains('/flats.html?'), 5000);
    const url = await driver.getCurrentUrl();
    assert.match(url, /location=Dhaka/);
    assert.match(url, /purpose=Rent/);
    assert.match(url, /propertyType=Apartment/);
    assert.match(url, /bedrooms=2/);
});

test('explore page loads filters and property results area', async () => {
    await driver.get(page('/flats.html'));
    await titleShouldBe('Explore Flats — FlatMate');
    await waitFor('#filterForm');
    await waitFor('#exploreGrid');
    await waitFor('#explorePagination');
    assert.equal((await driver.findElements(By.css('#filterForm select[name="purpose"]'))).length, 1);
    assert.equal((await driver.findElements(By.css('#filterForm select[name="propertyType"]'))).length, 1);
});

test('explore filters submit without leaving the page', async () => {
    await driver.get(page('/flats.html'));
    await clearAndType('#filterForm input[name="location"]', 'Dhaka');
    await (await waitFor('#filterForm select[name="purpose"]')).sendKeys('Rent');
    await click('#filterForm button[type="submit"]');
    await driver.wait(async () => (await driver.getCurrentUrl()).endsWith('/flats.html'), 5000);
    await waitFor('#exploreGrid');
    assert.match(await driver.findElement(By.css('body')).then(element => element.getText()), /Explore available flats/);
});

test('public pages have the expected titles and main content', async () => {
    const pages = [
        ['/about.html', 'About — FlatMate', /Property search should feel/],
        ['/contact.html', 'Contact — FlatMate', /Let's talk about home/],
        ['/login.html', 'Sign In — FlatMate', /Welcome back/],
        ['/register.html', 'Join FlatMate', /Create your account/],
        ['/forgot-password.html', 'Forgot Password — FlatMate', /Forgot your password/],
        ['/reset-password.html?email=test%40gmail.com', 'Reset Password — FlatMate', /Enter your code/]
    ];

    for (const [path, expectedTitle, expectedText] of pages) {
        await driver.get(page(path));
        await titleShouldBe(expectedTitle);
        assert.match(await driver.findElement(By.css('body')).then(element => element.getText()), expectedText);
    }
});

test('navbar links navigate between public pages', async () => {
    await driver.get(page('/about.html'));
    await click('nav a[href="/flats.html"]');
    await driver.wait(until.urlContains('/flats.html'), 5000);
    await click('nav a[href="/contact.html"]');
    await driver.wait(until.urlContains('/contact.html'), 5000);
    await click('nav a[href="/"]');
    await driver.wait(async () => (await driver.getCurrentUrl()).endsWith('/'), 5000);
});

test('mobile navigation opens and closes', async () => {
    await driver.get(page('/about.html'));
    await driver.manage().window().setRect({ width: 390, height: 844 });
    await click('#navToggle');
    const nav = await waitFor('#navbarNav');
    assert.match(await nav.getAttribute('class'), /open/);
    await click('nav a[href="/flats.html"]');
    await driver.wait(until.urlContains('/flats.html'), 5000);
    await driver.manage().window().setRect({ width: 1440, height: 1000 });
});

test('register form rejects a non-Gmail address in the browser', async () => {
    await driver.get(page('/register.html'));
    await clearAndType('#regName', 'Browser Test User');
    await clearAndType('#regEmail', 'browser-test@example.com');
    await clearAndType('#regPassword', 'ValidPass1');
    await clearAndType('#regConfirm', 'ValidPass1');
    await click('#registerForm button[type="submit"]');
    const toast = await waitFor('.toast.error');
    assert.match(await toast.getText(), /valid Gmail address/i);
});

test('register form rejects mismatched passwords in the browser', async () => {
    await driver.get(page('/register.html'));
    await clearAndType('#regName', 'Browser Test User');
    await clearAndType('#regEmail', 'browser-test@gmail.com');
    await clearAndType('#regPassword', 'ValidPass1');
    await clearAndType('#regConfirm', 'DifferentPass1');
    await click('#registerForm button[type="submit"]');
    const toast = await waitForText('.toast.error');
    assert.match(await toast.getText(), /Passwords do not match/i);
});

test('login form has required browser validation', async () => {
    await driver.get(page('/login.html'));
    const email = await waitFor('#loginEmail');
    const password = await waitFor('#loginPassword');
    assert.equal(await email.getAttribute('required'), 'true');
    assert.equal(await password.getAttribute('required'), 'true');
    assert.equal(await email.getAttribute('type'), 'email');
});

test('forgot-password form rejects a non-Gmail address', async () => {
    await driver.get(page('/forgot-password.html'));
    await clearAndType('#forgotEmail', 'not-an-email@yahoo.com');
    await click('#forgotForm button[type="submit"]');
    const toast = await waitForText('.toast.error');
    assert.match(await toast.getText(), /valid Gmail address/i);
});

test('reset-password pre-fills email and enforces a six-digit code', async () => {
    await driver.get(page('/reset-password.html?email=person%40gmail.com'));
    assert.equal(await (await waitFor('#resetEmail')).getAttribute('value'), 'person@gmail.com');
    await clearAndType('#resetCode', '123');
    const code = await waitFor('#resetCode');
    assert.equal(await code.getAttribute('pattern'), '\\d{6}');
    assert.equal(await driver.executeScript('return arguments[0].validity.patternMismatch;', code), true);
});

test('contact form exposes required fields and does not submit incomplete data', async () => {
    await driver.get(page('/contact.html'));
    const form = await waitFor('#contactForm');
    const name = await waitFor('#contactName');
    const email = await waitFor('#contactEmail');
    const message = await waitFor('#contactMessage');
    assert.equal(await name.getAttribute('required'), 'true');
    assert.equal(await email.getAttribute('required'), 'true');
    assert.equal(await message.getAttribute('required'), 'true');
    assert.equal(await form.getAttribute('id'), 'contactForm');
});

test('AI assistant opens and closes on public pages', async () => {
    await driver.get(page('/'));
    await click('#fm-bot-launcher');
    const panel = await waitFor('#fm-bot-panel');
    assert.match(await panel.getAttribute('class'), /fm-bot-open/);
    await click('.fm-bot-close');
    assert.doesNotMatch(await panel.getAttribute('class'), /fm-bot-open/);
});