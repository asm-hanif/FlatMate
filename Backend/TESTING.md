# FlatMate — Testing Guide

Three layers of testing are included. Run them in this order.

## 1. Unit tests (no server or database needed)

```
cd Backend
npm install
npm test
```

Runs 28 tests against pure logic: password/email validation rules, and the
flat-controller field definitions (including a dedicated regression test for
the bug that once broke "Add Property" — a duplicate `AvailabilityStatus`
column in the INSERT statement). These run in under a second and don't touch
the database at all.

If you ever add a new property field, `npm test` will fail loudly if it's
accidentally placed in two categories at once (e.g. both `TEXT_FIELDS` and
`AMENITY_FIELDS`) — that mistake is exactly what caused the original bug.

## 2. Live API integration tests (server + database required)

```
# Terminal 1
cd Backend
npm run dev

# Terminal 2
cd Backend
npm run test:api
```

This exercises the real, running server over HTTP — registration validation,
login/logout, session persistence, creating a property with only required
fields, creating one with every single field + amenities filled in, editing
every field, toggling amenities on/off, availability status transitions,
favorites, the AI price advisor and flat-finder, and critically: **uploading
new photos, removing existing ones, and doing both in the same request** —
using throwaway test accounts (`test.owner.<random>@gmail.com`, etc.) so it's
safe to run repeatedly against a real dev database.

It prints a pass/fail count and exits non-zero if anything fails, so it's
safe to wire into a CI pipeline too.

## 3. Manual QA checklist

Things that need an actual browser — the automated tests above cover
*whether the API behaves correctly*, not *whether the page looks/feels right*.

### Accounts
- [ ] Register as a User with a valid Gmail address + strong password → auto-logged-in, redirected to home (no separate login step)
- [ ] Register as an Owner → same, and the navbar shows Owner-only links (Dashboard, Add Property)
- [ ] Try registering with a non-Gmail address → rejected with a clear message, both instantly (client-side) and if you bypass JS (server-side)
- [ ] Try registering with a weak password (e.g. `abc123`, all lowercase, too short/long) → rejected with the specific rule explained
- [ ] Try registering with an email that's already in use → rejected, doesn't crash
- [ ] Log out, log back in with correct credentials → works
- [ ] Log in with a wrong password → clear error, not a generic failure
- [ ] Click the eye icon on every password field (login, register, edit-profile) → toggles visibility correctly
- [ ] Stay logged in, close the browser, reopen the next day → still logged in (30-day rolling session)
- [ ] Restart the server while logged in → session survives (Postgres-backed, not memory)
- [ ] Click "Forgot password?" on the login page → goes to `/forgot-password.html`, enter a registered email → generic "code sent" message, redirected to `/reset-password.html`, and the code actually arrives by email within a minute
- [ ] Enter that email in "forgot password" but for an account that doesn't exist → same generic message (no indication the account doesn't exist)
- [ ] On the reset page, enter the wrong 6-digit code → clear "invalid or expired" error, password NOT changed (confirm by logging in with the old password afterward)
- [ ] Enter the correct code + a new valid password → success, auto-logged-in, redirected home
- [ ] Log out and log back in with the NEW password → works
- [ ] Try the OLD password after a successful reset → correctly rejected
- [ ] Enter a wrong code 5 times in a row → locked out with "too many attempts," and even the real code no longer works after that (must click "Resend code" to get a fresh one)
- [ ] Wait past 10 minutes (or check `dbo.PasswordResets` in the database) → an expired code is rejected with the same "invalid or expired" message
- [ ] Click "Resend code" → a new code arrives; the old code from before no longer works once a new one is requested
- [ ] Try a weak new password on the reset page (e.g. `abc123`) → rejected with the same password rule message used at registration

### Listing a property (Owner)
- [ ] "Add Property" with only the required fields (Title, Purpose, Type, Price) → succeeds
- [ ] Fill in the full Property Summary (Construction Status, Transaction Type, Facing, Land Area, Floor Available On, Security Deposit) → all save and display correctly on the listing page
- [ ] Set Bedrooms/Bathrooms/Balconies/Parking/Covered Parking using the number inputs → increase/decrease works identically for all of them
- [ ] Check a wide spread of the Property Features checkboxes → all persist
- [ ] Upload multiple images + one video → all appear in the gallery
- [ ] Publish → redirected to the dashboard, new listing appears

### Editing a property (Owner)
- [ ] Open an existing listing to edit → every field is pre-filled correctly, including amenity checkboxes matching what was saved
- [ ] Change several Property Summary fields at once → all save together
- [ ] Uncheck a previously-checked amenity → turns off and stays off after reload
- [ ] Existing photos show as thumbnails with a × button
- [ ] Click × on a photo → dims and shows ↺ (undo); click ↺ → restores it
- [ ] Remove a photo for real (don't undo) and save → photo is gone from the listing afterward, and gone from the gallery on the public page too
- [ ] Add new photos while also removing old ones in the same save → both happen correctly
- [ ] Try to edit a property you don't own (e.g. via direct URL) → blocked with a clear error
- [ ] Mark a property Rented/Sold from the dashboard → status badge updates on the public listing; pending requests for it get auto-rejected

### Browsing & searching (User)
- [ ] Home page loads featured properties with images
- [ ] Search/filter by location, purpose, property type, price range, bedrooms, bathrooms, furnishing, amenities → results narrow correctly
- [ ] Open a property → Property Summary section matches exactly what the owner entered, Property Features list shows only the checked ones
- [ ] Favorite a property (heart icon) → appears in your profile's favorites; un-favorite → disappears
- [ ] Send a message to the owner via the property page → appears in Messages for both sides
- [ ] Submit a rental/purchase request → appears in your profile and the owner's dashboard

### Profile
- [ ] View your own profile (User and Owner) → gradient banner, avatar, info all display correctly
- [ ] Edit profile: change name, phone, address, bio, avatar → all save and reflect immediately in the navbar and profile page
- [ ] Change password via edit-profile → same strength rules enforced as registration; can log in with the new password afterward
- [ ] Upload an animated GIF as avatar → works and animates

### Contact & email
- [ ] Run `npm run test:mail` first — an isolated diagnostic that tests only the SMTP connection and explains exactly what's wrong if it fails (see "Diagnosing email failures" below)
- [ ] Submit the Contact page form → success message; email actually arrives (check the inbox configured in `MAIL_TO`)
- [ ] Use "Email Owner" from a property page → owner actually receives it
- [ ] Check server logs on startup for `✓ SMTP email connection verified` — if it says otherwise, mail won't send even if the UI shows success in some flows, so confirm this line specifically

#### Diagnosing email failures ("Invalid login" / 535 errors)

Run this first, before touching any code:
```
cd Backend
npm run test:mail
```
It prints exactly which part of the config is wrong, or — if the config
looks correct but Gmail still rejects it — the most likely account-side
causes, in order of likelihood:

1. **2-Step Verification is OFF** on the Google account. App Passwords only
   work when 2FA is enabled — if it's off, *every* app password fails with
   this exact error, no matter how many new ones you generate. Check:
   https://myaccount.google.com/security
2. The app password was revoked, or generating a new one didn't actually
   get saved into `.env`. Check the list at
   https://myaccount.google.com/apppasswords
3. `SMTP_USER` doesn't match the account the app password belongs to.
4. **If deployed** (Render, etc.): the same `SMTP_PASS` must *also* be set
   in that platform's own environment variables — `.env` is gitignored and
   never gets uploaded there, so updating it locally has no effect on a
   deployed instance until you update it in the hosting dashboard too.

### AI Assistant (Mira)
- [ ] Open the chat bubble on several different pages → appears everywhere, remembers you're logged in
- [ ] As an Owner, ask for a price suggestion → get a plausible price + range + explanation + comparables, with a working "use this price" button that pre-fills the Add Property form
- [ ] As a User, try to ask for a price suggestion → politely redirected to flat-finding instead
- [ ] Ask to find flats matching a budget/location → get ranked results with fairness tags
- [ ] Say "hi", "how are you", "thanks", "tell me a joke", "bye" → Mira responds naturally, not just menu options
- [ ] Type nonsense/off-topic text → gets a friendly fallback, not an error

### Responsive / cross-browser
- [ ] Resize to mobile width (or use browser dev tools device mode) on: home, flats list, flat detail, edit-flat, profile, chat → layouts adapt, nothing overlaps or overflows
- [ ] Test in at least two browsers (e.g. Chrome + Firefox, or Chrome + Safari)
- [ ] Check the favicon shows correctly in the browser tab

## 4. Security spot-checks

- [ ] Try accessing `/api/flats/:id` for another user's data while logged in as someone else → only public fields returned, no leakage of unrelated private data
- [ ] Try submitting a create/edit-flat request without being logged in → 401/403, not a crash
- [ ] Try submitting a create-flat request as a `User` role (not `Owner`) → 403
- [ ] Try SQL-injection-style input in a search field, e.g. `' OR '1'='1` → treated as a literal search string, no error, no data leak (queries are parameterized throughout, but worth confirming)
- [ ] Try XSS-style input in a listing title/description, e.g. `<script>alert(1)</script>` → rendered as literal text on the page, not executed (check `flat.html`, `flats.js`, `profile.js` all use `escapeHtml`)
- [ ] Confirm `.env` is not committed/exposed and isn't served as a static file (`GET /.env` should 404)
- [ ] Confirm uploaded files can't be executed — e.g. try uploading a `.html` or `.js` file disguised with an image extension and confirm the `fileFilter` in `flatRoutes.js`/`profileRoutes.js` rejects it based on real MIME type, not just the filename

## Known non-issues worth understanding, not "bugs"

- **`npm run test:api` needs the server actually running first** — it's a live integration test, not a mock. `Failed to fetch`/connection errors mean the server isn't up, not that the API is broken.
- **Uploaded files are lost on redeploy on most Render plans** (ephemeral disk) — expected, documented in the main README's deployment section, not something this test suite can catch.
- **The AI price model needs at least a few real listings before its "blends in real data" feature does anything visible** — with an empty/near-empty database it falls back to the simulated training data, which is normal and expected, not a fault.
