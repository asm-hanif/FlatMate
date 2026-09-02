# FlatMate

FlatMate is a property marketplace built with HTML/CSS/JavaScript, Node.js/Express,
PostgreSQL, Gmail SMTP, and a self-contained AI price/flat advisor with a friendly
chat assistant ("Mira").

## Project structure

```
FlatMate/
├── Frontend/          All static pages, styles and browser-side scripts
│   ├── *.html
│   ├── css/
│   └── js/
│       └── config.js    sets the Backend URL for split deployments (see below)
└── Backend/            The Node/Express server, database layer and AI model
    ├── server.js
    ├── server/          routes / controllers / middleware / services / db
    ├── ai/              price model + flat recommendation engine (see below)
    ├── database/        PostgreSQL schema script (optional manual setup)
    ├── uploads/          images/videos/avatars written by the app at runtime
    ├── .env               your local configuration (never commit this)
    └── package.json
```

Frontend and Backend can run two ways:

- **Together (local development):** Backend serves Frontend itself as static
  files — one process, one URL, no CORS to think about. This is the default.
- **Split (production — Render + Vercel):** Backend runs on Render, Frontend
  is deployed separately on Vercel. `Frontend/js/config.js` is the one file
  you edit to point the Frontend at the Backend's URL — see "Deploying" below.

## Requirements
- Node.js 18+ (Node 22 recommended)
- PostgreSQL 14+ (local install, or a managed instance like Render Postgres)
- Optional Gmail App Password for email features

## Local setup

1. **Create the database.** With PostgreSQL installed and running locally
   (defaults: host `localhost`, port `5432`, user `postgres`):
   ```
   createdb -U postgres flatmatedb
   ```
   (On Windows, run this from the "SQL Shell (psql)" that ships with the
   installer, or use pgAdmin's "Create Database" dialog instead.)

2. **Configure `Backend/.env`.** A working `.env` is already included,
   pre-filled to match a default local PostgreSQL install
   (`PGUSER=postgres`, `PGPASSWORD=123456`, `PGDATABASE=flatmatedb`) — update
   `PGPASSWORD` if yours differs. See `.env.example` for every option.

3. **Build the tables.** You don't have to do this by hand — the app creates
   every table, index and constraint automatically the first time it starts
   (`Backend/server/schema.js`). If you'd rather set it up explicitly first:
   ```
   psql -U postgres -d flatmatedb -f Backend/database/FlatMateDB.postgres.sql
   ```

4. **Install and run:**
   ```
   cd Backend
   npm install
   npm run dev      # or: npm start
   ```

5. Open http://localhost:3000 — Backend serves the Frontend directly, so
   that's the only URL you need locally.

## Deploying: Backend on Render, Frontend on Vercel

### 1. Render (Backend)
- New Web Service → connect your repo.
- **Root Directory:** `Backend`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- Add a Render PostgreSQL database (New → PostgreSQL), then copy its
  **Internal Database URL** into the web service's environment as
  `DATABASE_URL`.
- Environment variables to set (see `Backend/.env.example` for the full list):
  `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV=production`, `APP_BASE_URL`
  (your Render URL), `FRONTEND_URL` (your Vercel URL — add it after step 2),
  and the `SMTP_*` variables if you want email working.
- Uploaded photos/videos are written to Render's local disk, which is
  **ephemeral** on most plans (wiped on redeploy/restart). For anything
  beyond a demo, attach a Render Disk to `Backend/uploads`, or swap the
  upload logic to a cloud bucket (S3, Cloudinary, etc.) — not included here.

### 2. Vercel (Frontend)
- New Project → same repo.
- **Root Directory:** `Frontend`
- **Framework Preset:** Other (it's static files — no build step)
- Deploy. Vercel gives you a URL like `https://flatmate.vercel.app`.

### 3. Connect them
- In `Frontend/js/config.js`, set:
  ```js
  window.FM_CONFIG = {
      API_BASE_URL: 'https://your-backend.onrender.com'
  };
  ```
  Redeploy the Frontend after this change.
- Back on Render, set `FRONTEND_URL=https://flatmate.vercel.app` (comma-separate
  multiple origins, e.g. to also allow a Vercel preview URL) and redeploy the
  Backend. This is required — without it, the Backend rejects cross-origin
  requests from your Frontend for security.

That's it — every existing `fetch('/api/...')` call and every uploaded-image
URL in the Frontend is rewritten automatically at runtime by `config.js`, so
no other Frontend files need touching when you deploy.

## Features
- User and Owner accounts, with **auto-login right after registration** —
  no separate sign-in step needed
- 30-day rolling sessions stored in Postgres (not memory), so logins survive
  server restarts and don't expire mid-use
- Password visibility toggle on every password field
- Property listing with a full **Property Summary** (construction status,
  transaction type, facing, land area, floor availability, security deposit,
  bedrooms/bathrooms/balconies/parking as adjustable counts) and an extensive
  **Property Features** checklist (36 amenities)
- Edit listings: add new photos/video **and remove previously uploaded ones**
- Available/Rented/Sold property status
- Status-aware requests, chat and owner email
- Profile image upload including GIF/animated GIF files, and a redesigned
  profile page for both Users and Owners
- Favorites
- Owner dashboard and request management
- Gmail contact and owner-inquiry email
- **AI Price Advisor & Flat-Finder chat assistant ("Mira")** (see below) —
  a floating chat bubble on every page that can also just chat

## AI Assistant — Mira

A floating chat bubble (bottom-right of every page, `Frontend/js/bot.js` +
`Frontend/css/bot.css`) talks to a small self-contained AI model running
entirely inside the Node backend — no external AI API, no internet access
needed at runtime.

**For property owners — "what should I charge?"**
Mira asks a few questions (purpose, city/area, size, bedrooms, furnishing,
amenities) and returns a suggested rent/sale price with a range and plain-English
explanation, plus a few comparable active listings. One tap sends those details
straight into the "List a Property" form with the price pre-filled.
This is restricted to Owner accounts (`POST /api/bot/price-suggest`).

**For anyone — "find me a flat"**
Both Users and Owners can ask Mira to find matching active listings by
budget, location, bedrooms and amenities. Results are ranked (not just
filtered) so a near-miss on one criterion doesn't hide a great overall match,
and each result is tagged as a bargain / fair / above-market deal
(`POST /api/bot/suggest-flats`).

**Just chatting**
Mira also handles everyday conversation — greetings, "how are you", thanks,
jokes, goodbyes, and general small talk — via a pattern-matched chit-chat
library (`CHITCHAT_RULES` in `bot.js`), so she's a friendly presence even
when you're not asking about a property.

**How the pricing model works** (`Backend/ai/`)
- `data/locationRates.js` — hand-compiled per-neighbourhood rent/sale rate
  ranges for dozens of Dhaka, Chattogram, Sylhet and other Bangladeshi
  areas, built from published 2026 market data, with city-level and
  national fallbacks.
- `priceModel.js` — a real linear regression (hedonic pricing model, fitted
  with the normal-equation method in pure JavaScript) that learns how much
  bedrooms, bathrooms, floor position, furnishing and amenities move the
  price within a neighbourhood. It trains on a large simulated dataset
  grounded in that location data, **and automatically blends in FlatMate's
  own real listings** from the database as they accumulate — so accuracy
  improves over time with zero extra work.
- `recommendEngine.js` — scores and ranks active listings against a
  seeker's stated criteria, using the price model to flag good deals.

The model trains itself once at server startup (takes well under a second)
and caches to `Backend/ai/model/trained-weights.json`. To retrain manually
(e.g. after editing `locationRates.js`, or to pick up new real listings
immediately):

```
npm run train:price-model
```

Because the location rate table is hand-maintained reference data rather
than a live feed, it's worth refreshing every so often as the market moves —
just edit the ranges in `Backend/ai/data/locationRates.js`.

## Notes on the PostgreSQL migration

This project previously ran on SQL Server. The database layer
(`Backend/server/db.js`) now uses PostgreSQL (`pg`) but keeps the exact same
calling convention every controller already used (`@paramName` placeholders,
PascalCase result keys like `row.Id`/`row.Title`), so query code across the
app didn't need to be rewritten query-by-query — see the comments in `db.js`
and `server/columnCase.js` for how that compatibility layer works.


## Recent platform updates
- Account modes: Home Seeker, Property Owner, or Both; users can change this from Edit Profile.
- Permanent account deletion with password + DELETE confirmation.
- Advanced property sorting/pagination and view counts.
- Property reporting and in-app notifications endpoints.
- Hidden/expired listing states.
- Both-mode users can use seeker and owner functionality without separate accounts.
- Uploaded media remains local for development; use object storage/CDN before production scale.
