// Auth specific logic (login/register forms)
(function() {
    'use strict';

    // Login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (!res.ok) {
                    showToast(data.error || 'Login failed', 'error');
                    return;
                }
                showToast('Welcome back!');
                window.location.href = '/';
            } catch (err) {
                showToast('Network error', 'error');
            }
        });
    }

    // Register
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('regName').value;
            const email = document.getElementById('regEmail').value;
            const phone = document.getElementById('regPhone').value;
            const password = document.getElementById('regPassword').value;
            const confirm = document.getElementById('regConfirm').value;
            const role = document.querySelector('input[name="role"]:checked')?.value;

            const emailError = window.FM_VALIDATE?.gmail(email);
            if (emailError) {
                showToast(emailError, 'error');
                return;
            }

            const passwordError = window.FM_VALIDATE?.password(password);
            if (passwordError) {
                showToast(passwordError, 'error');
                return;
            }

            if (password !== confirm) {
                showToast('Passwords do not match', 'error');
                return;
            }
            try {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, phone, password, role })
                });
                const data = await res.json();
                if (!res.ok) {
                    showToast(data.error || 'Registration failed', 'error');
                    return;
                }
                showToast('Account created! Welcome to FlatMate.');
                window.location.href = '/';
            } catch (err) {
                showToast('Network error', 'error');
            }
        });
    }

    // Forgot password — step 1: request a code
    const forgotForm = document.getElementById('forgotForm');
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('forgotEmail').value.trim();

            const emailError = window.FM_VALIDATE?.gmail(email);
            if (emailError) {
                showToast(emailError, 'error');
                return;
            }

            const submitBtn = forgotForm.querySelector('button[type="submit"]');
            const originalText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending...'; }

            try {
                const res = await fetch('/api/auth/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json();

                if (!res.ok) {
                    showToast(data.error || 'Something went wrong. Please try again.', 'error');
                    return;
                }

                showToast('If that email is registered, a code has been sent.');
                window.location.href = '/reset-password.html?email=' + encodeURIComponent(email);

            } catch (err) {
                showToast('Network error — please try again.', 'error');
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
            }
        });
    }

    // Reset password — step 2: verify the code and set a new password
    const resetForm = document.getElementById('resetForm');
    if (resetForm) {
        const urlParams = new URLSearchParams(window.location.search);
        const prefillEmail = urlParams.get('email') || '';
        const emailField = document.getElementById('resetEmail');
        if (emailField && prefillEmail) emailField.value = prefillEmail;

        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('resetEmail').value.trim();
            const code = document.getElementById('resetCode').value.trim();
            const newPassword = document.getElementById('resetPassword').value;
            const confirm = document.getElementById('resetConfirm').value;

            if (!email) {
                showToast('Please enter your email.', 'error');
                return;
            }

            if (!/^\d{6}$/.test(code)) {
                showToast('Please enter the 6-digit code from your email.', 'error');
                return;
            }

            const passwordError = window.FM_VALIDATE?.password(newPassword);
            if (passwordError) {
                showToast(passwordError, 'error');
                return;
            }

            if (newPassword !== confirm) {
                showToast('Passwords do not match', 'error');
                return;
            }

            const submitBtn = resetForm.querySelector('button[type="submit"]');
            const originalText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Resetting...'; }

            try {
                const res = await fetch('/api/auth/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, code, newPassword })
                });
                const data = await res.json();

                if (!res.ok) {
                    showToast(data.error || 'Could not reset password.', 'error');
                    return;
                }

                showToast('Password updated! Welcome back.');
                window.location.href = '/';

            } catch (err) {
                showToast('Network error — please try again.', 'error');
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText; }
            }
        });

        // Resend code
        const resendBtn = document.getElementById('resendCodeBtn');
        if (resendBtn) {
            resendBtn.addEventListener('click', async () => {
                const email = document.getElementById('resetEmail').value.trim();
                const emailError = window.FM_VALIDATE?.gmail(email);
                if (emailError) {
                    showToast(emailError, 'error');
                    return;
                }

                resendBtn.disabled = true;
                const originalText = resendBtn.textContent;
                resendBtn.textContent = 'Sending...';

                try {
                    const res = await fetch('/api/auth/forgot-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });
                    const data = await res.json();
                    if (!res.ok) {
                        showToast(data.error || 'Could not resend the code.', 'error');
                    } else {
                        showToast('A new code has been sent if that email is registered.');
                    }
                } catch (err) {
                    showToast('Network error — please try again.', 'error');
                } finally {
                    resendBtn.disabled = false;
                    resendBtn.textContent = originalText;
                }
            });
        }
    }

})();