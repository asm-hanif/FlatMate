// FlatMate — password visibility toggle
// Automatically wraps every <input type="password"> with a show/hide eye
// icon. No per-page markup changes needed — this runs on every page that
// includes it and finds password fields itself.

(function () {
    'use strict';

    function makeToggle(input) {
        if (input.dataset.fmToggled === '1') return;
        input.dataset.fmToggled = '1';

        const wrapper = document.createElement('div');
        wrapper.className = 'fm-password-wrapper';

        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fm-password-toggle';
        btn.setAttribute('aria-label', 'Show password');
        btn.innerHTML = '<i class="fas fa-eye"></i>';

        btn.addEventListener('click', () => {
            const showing = input.type === 'text';
            input.type = showing ? 'password' : 'text';
            btn.innerHTML = showing ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
            btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        });

        wrapper.appendChild(btn);
    }

    function init() {
        document.querySelectorAll('input[type="password"]').forEach(makeToggle);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Some forms (e.g. edit-profile) render fields after an async fetch —
    // watch for late-added password inputs too (debounced to avoid
    // re-scanning on every single DOM mutation across the app).
    let pending = null;
    const observer = new MutationObserver(() => {
        clearTimeout(pending);
        pending = setTimeout(init, 150);
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }
})();
