// FlatMate — shared account validation (mirrors Backend/server/validators.js)
window.FM_VALIDATE = {
    passwordMessage:
        'Password must be 6-16 characters and include at least one uppercase letter, ' +
        'one lowercase letter, and one number.',

    emailMessage: 'Please use a valid Gmail address (must end with @gmail.com).',

    password(value) {
        const v = String(value || '');
        if (v.length < 6 || v.length > 16) return this.passwordMessage;
        if (!/[A-Z]/.test(v)) return this.passwordMessage;
        if (!/[a-z]/.test(v)) return this.passwordMessage;
        if (!/[0-9]/.test(v)) return this.passwordMessage;
        return null;
    },

    gmail(value) {
        const v = String(value || '').trim().toLowerCase();
        if (!/^[a-z0-9._%+-]+@gmail\.com$/.test(v)) return this.emailMessage;
        return null;
    }
};
