# FlatMate

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![GitHub Repo](https://img.shields.io/badge/GitHub-FlatMate-181717?logo=github)](https://github.com/asm-hanif/FlatMate)

FlatMate is a full-stack property marketplace for finding, listing, and managing flats.
It includes a browsable property platform, user/owner accounts, request management,
email notifications, and an embedded AI assistant called "Mira" that can suggest
pricing and match listings based on user preferences.

## Project structure

```
FlatMate/
├── Frontend/          All static pages, styles and browser-side scripts
│   ├── *.html
│   ├── css/
│   └── js/
└── Backend/            The Node/Express server, database layer and AI model
    ├── server.js
    ├── server/          routes / controllers / middleware / services / db
    ├── ai/              price model + flat recommendation engine (see below)
    ├── database/        PostgreSQL schema script (optional manual setup)
    ├── uploads/          images/videos/avatars written by the app at runtime
    ├── .env               your local configuration (never commit this)
    └── package.json
```

For local development, the Backend serves the Frontend as static files. Run the
Backend once and open the app at `http://localhost:3000`.

## Requirements
- Node.js 18+ (Node 22 recommended)
- PostgreSQL 14+ running locally
- Optional Gmail App Password for email features

## Local setup

1. **Create the database.** With PostgreSQL installed and running locally
   (defaults: host `localhost`, port `5432`, user `postgres`):
   ```
   createdb -U postgres flatmatedb
   ```
   (On Windows, run this from the "SQL Shell (psql)" that ships with the
   installer, or use pgAdmin's "Create Database" dialog instead.)

2. **Configure `Backend/.env`.** Set your local PostgreSQL credentials:
  `PGHOST=localhost`, `PGPORT=5432`, `PGUSER`, `PGPASSWORD`, and
  `PGDATABASE=flatmatedb`. Keep your `.env` local and out of commits.

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

## Tests

Run commands from the repository root. The unit suite uses no running server
or database. The API and Selenium suites require the local server and database;
Selenium also requires Chrome (or another configured Selenium browser).

Start the app in one terminal:

```bash
npm run dev
```

Then run the suites in another terminal:

```bash
npm test
npm --prefix Backend run test:api
npm --prefix Backend run test:selenium
```

The API suite creates temporary test accounts and listings, then deactivates
its test listing. The Selenium suite runs browser workflows against the local
app; its account-deletion cases are skipped unless `RUN_ACCOUNT_DELETION=true`.

## Branch workflow

For future updates, use a simple Git flow:

- `main` = stable branch
- `feature/<short-name>` = new feature work
- `fix/<short-name>` = bug fixes and patches
- `hotfix/<short-name>` = urgent fixes

Example workflow:

```bash
git checkout main
git pull origin main
git checkout -b feature/property-search-ui
git add .
git commit -m "Add property search improvements"
git push -u origin feature/property-search-ui
```

When work is ready, open a pull request into `main`, review the diff, and merge after validation.
See [BRANCH_WORKFLOW.md](BRANCH_WORKFLOW.md) for the full team workflow.

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
- Uploaded media is stored locally under `Backend/uploads/` during development.
