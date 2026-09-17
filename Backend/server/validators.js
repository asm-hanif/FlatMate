/**
 * Shared account validation rules — kept in one place so registration
 * and profile-password-change enforce exactly the same policy.
 */

const PASSWORD_RULES_MESSAGE =
    'Password must be 6-16 characters and include at least one uppercase letter, ' +
    'one lowercase letter, and one number.';

const EMAIL_RULES_MESSAGE =
    'Please use a valid Gmail address (must end with @gmail.com).';

function validatePassword(password) {
    const value = String(password || '');

    if (value.length < 6 || value.length > 16) {
        return PASSWORD_RULES_MESSAGE;
    }
    if (!/[A-Z]/.test(value)) return PASSWORD_RULES_MESSAGE;
    if (!/[a-z]/.test(value)) return PASSWORD_RULES_MESSAGE;
    if (!/[0-9]/.test(value)) return PASSWORD_RULES_MESSAGE;

    return null; // valid
}

function validateGmailAddress(email) {
    const value = String(email || '').trim().toLowerCase();

    // Basic shape check + must end with @gmail.com specifically.
    const gmailPattern = /^[a-z0-9._%+-]+@gmail\.com$/;

    if (!gmailPattern.test(value)) {
        return EMAIL_RULES_MESSAGE;
    }

    return null; // valid
}

module.exports = {
    validatePassword,
    validateGmailAddress,
    PASSWORD_RULES_MESSAGE,
    EMAIL_RULES_MESSAGE
};
