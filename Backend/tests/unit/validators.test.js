// Keep the account-input rules covered without starting the app or database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePassword, validateGmailAddress } = require('../../server/validators');

// Reject a password shorter than the configured minimum.
test('validatePassword: rejects too short', () => {
    assert.ok(validatePassword('Ab1'));
});

// Reject a password longer than the configured maximum.
test('validatePassword: rejects too long (17 chars)', () => {
    assert.ok(validatePassword('Abcdef123456789XY'));
});

// Accept a password at the minimum length when it has each required character class.
test('validatePassword: accepts exactly 6 chars with all requirements', () => {
    assert.strictEqual(validatePassword('Abc12x'), null);
});

// Accept a valid password at the maximum supported length.
test('validatePassword: accepts exactly 16 chars', () => {
    assert.strictEqual(validatePassword('Abcdef123456789X'), null);
});

// Require at least one uppercase character.
test('validatePassword: rejects missing uppercase', () => {
    assert.ok(validatePassword('abcdef1'));
});

// Require at least one lowercase character.
test('validatePassword: rejects missing lowercase', () => {
    assert.ok(validatePassword('ABCDEF1'));
});

// Require at least one numeric character.
test('validatePassword: rejects missing number', () => {
    assert.ok(validatePassword('Abcdefg'));
});

// Reject passwords made of only one character class.
test('validatePassword: rejects all-lowercase, all-uppercase, all-digit inputs', () => {
    assert.ok(validatePassword('abcdef'));
    assert.ok(validatePassword('ABCDEF'));
    assert.ok(validatePassword('123456'));
});

// Accept a representative mixed-case password containing a digit.
test('validatePassword: accepts a realistic strong password', () => {
    assert.strictEqual(validatePassword('MyPass123'), null);
});

// Return validation errors for empty or absent values without throwing.
test('validatePassword: empty/undefined/null input rejected, does not throw', () => {
    assert.ok(validatePassword(''));
    assert.ok(validatePassword(undefined));
    assert.ok(validatePassword(null));
});

// Accept a basic address at the required Gmail domain.
test('validateGmailAddress: accepts a plain gmail address', () => {
    assert.strictEqual(validateGmailAddress('test@gmail.com'), null);
});

// Normalize domain casing while accepting a valid Gmail address.
test('validateGmailAddress: accepts mixed-case domain (normalized)', () => {
    assert.strictEqual(validateGmailAddress('Test.User123@GMAIL.COM'), null);
});

// Reject other providers and Gmail lookalike top-level domains.
test('validateGmailAddress: rejects non-gmail domains', () => {
    assert.ok(validateGmailAddress('test@yahoo.com'));
    assert.ok(validateGmailAddress('test@outlook.com'));
    assert.ok(validateGmailAddress('test@gmail.co'));
});

// Reject addresses missing a local part, domain, or valid email structure.
test('validateGmailAddress: rejects malformed addresses', () => {
    assert.ok(validateGmailAddress('@gmail.com'));
    assert.ok(validateGmailAddress('bad@gmail'));
    assert.ok(validateGmailAddress('notanemail'));
    assert.ok(validateGmailAddress(''));
});

// Reject domains that only imitate the exact gmail.com domain.
test('validateGmailAddress: rejects gmail lookalike domains', () => {
    assert.ok(validateGmailAddress('test@gmail.com.evil.com'));
    assert.ok(validateGmailAddress('test@gmail.con'));
});
