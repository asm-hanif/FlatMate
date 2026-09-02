const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePassword, validateGmailAddress } = require('../../server/validators');

test('validatePassword: rejects too short', () => {
    assert.ok(validatePassword('Ab1'));
});

test('validatePassword: rejects too long (17 chars)', () => {
    assert.ok(validatePassword('Abcdef123456789XY'));
});

test('validatePassword: accepts exactly 6 chars with all requirements', () => {
    assert.strictEqual(validatePassword('Abc12x'), null);
});

test('validatePassword: accepts exactly 16 chars', () => {
    assert.strictEqual(validatePassword('Abcdef123456789X'), null);
});

test('validatePassword: rejects missing uppercase', () => {
    assert.ok(validatePassword('abcdef1'));
});

test('validatePassword: rejects missing lowercase', () => {
    assert.ok(validatePassword('ABCDEF1'));
});

test('validatePassword: rejects missing number', () => {
    assert.ok(validatePassword('Abcdefg'));
});

test('validatePassword: rejects all-lowercase, all-uppercase, all-digit inputs', () => {
    assert.ok(validatePassword('abcdef'));
    assert.ok(validatePassword('ABCDEF'));
    assert.ok(validatePassword('123456'));
});

test('validatePassword: accepts a realistic strong password', () => {
    assert.strictEqual(validatePassword('MyPass123'), null);
});

test('validatePassword: empty/undefined/null input rejected, does not throw', () => {
    assert.ok(validatePassword(''));
    assert.ok(validatePassword(undefined));
    assert.ok(validatePassword(null));
});

test('validateGmailAddress: accepts a plain gmail address', () => {
    assert.strictEqual(validateGmailAddress('test@gmail.com'), null);
});

test('validateGmailAddress: accepts mixed-case domain (normalized)', () => {
    assert.strictEqual(validateGmailAddress('Test.User123@GMAIL.COM'), null);
});

test('validateGmailAddress: rejects non-gmail domains', () => {
    assert.ok(validateGmailAddress('test@yahoo.com'));
    assert.ok(validateGmailAddress('test@outlook.com'));
    assert.ok(validateGmailAddress('test@gmail.co'));
});

test('validateGmailAddress: rejects malformed addresses', () => {
    assert.ok(validateGmailAddress('@gmail.com'));
    assert.ok(validateGmailAddress('bad@gmail'));
    assert.ok(validateGmailAddress('notanemail'));
    assert.ok(validateGmailAddress(''));
});

test('validateGmailAddress: rejects gmail lookalike domains', () => {
    assert.ok(validateGmailAddress('test@gmail.com.evil.com'));
    assert.ok(validateGmailAddress('test@gmail.con'));
});
