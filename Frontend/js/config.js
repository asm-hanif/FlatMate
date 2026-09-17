// FlatMate cross-origin configuration
//
// When Frontend (Vercel) and Backend (Render) are deployed on different
// domains, every request to "/api/..." needs to go to the Backend's
// actual URL instead of a same-origin relative path, and needs cookies
// attached explicitly (browsers don't send them cross-origin by default).
//
// Rather than edit every fetch() call across every page (there are many),
// this file transparently rewrites them. Every other script just keeps
// calling fetch('/api/...') exactly as before and it works in both setups:
//   - Local/monolithic (Backend serves Frontend): API_BASE_URL is '',
//     requests stay same-origin, nothing changes.
//   - Split deployment (Vercel + Render): API_BASE_URL is the Render
//     URL, requests are rewritten to it automatically with credentials.
//
// SET THIS to your deployed backend URL (no trailing slash) once you
// know it, e.g. 'https://flatmate-backend.onrender.com'. Leave it as ''
// while Backend still serves Frontend itself (e.g. local development).

window.FM_CONFIG = {
    API_BASE_URL: '' // <-- e.g. 'https://flatmate-backend.onrender.com'
};

(function () {
    'use strict';

    const BASE = (window.FM_CONFIG.API_BASE_URL || '').replace(/\/$/, '');

    // Used wherever the app renders an <img>/<video> src that came from
    // the database as a root-relative path like "/uploads/images/x.jpg".
    window.fmUrl = function (path) {
        if (!path) return path;
        if (/^https?:\/\//i.test(path)) return path; // already absolute
        if (path.startsWith('/uploads/')) return BASE + path;
        return path; // frontend-hosted assets (favicon, css, js) stay as-is
    };

    if (!BASE) return; // same-origin setup — no rewriting needed

    const originalFetch = window.fetch.bind(window);

    window.fetch = function (input, init) {
        let url = typeof input === 'string' ? input : (input && input.url) || '';
        const isApiCall = url.startsWith('/api/');
        const isUploadCall = url.startsWith('/uploads/');

        if (!isApiCall && !isUploadCall) {
            return originalFetch(input, init);
        }

        const rewrittenUrl = BASE + url;
        const options = { ...(init || {}) };

        // Every API call needs cookies attached cross-origin, or session
        // auth (login state) silently breaks.
        if (isApiCall && !options.credentials) {
            options.credentials = 'include';
        }

        if (typeof input === 'string') {
            return originalFetch(rewrittenUrl, options);
        }

        // input was a Request object — rebuild it with the new URL.
        return originalFetch(new Request(rewrittenUrl, input), options);
    };
})();
