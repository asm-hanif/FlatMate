# FlatMate E2E Test Plan

## Execution

Start PostgreSQL and the application first:

```powershell
cd Backend
npm install
npm run dev
```

In a second terminal, run all Selenium files, including the 90-case suite:

```powershell
cd Backend
npm run test:selenium
```

Optional settings:

```powershell
$env:TEST_BASE_URL = 'http://localhost:3000'
$env:SELENIUM_BROWSER = 'chrome' # chrome, firefox, or edge
$env:SELENIUM_HEADLESS = 'false' # set to false to watch the browser
npm run test:selenium
```

The authenticated 67-90 journey requires the supplied test account password
without storing it in source control:

```powershell
$env:E2E_EMAIL = 'asmhanif811496@gmail.com'
$env:E2E_PASSWORD = '<the account password>'
Remove-Item Env:RUN_ACCOUNT_DELETION -ErrorAction SilentlyContinue
node --test tests/selenium/e2e-90.test.js
```

Case 67 registers or logs in as `ASM_Hanif` with the `Both` role, providing
both Home Seeker and Property Owner capabilities from the start. Cases 70-88
exercise search, save, report, add, edit, search-again, and delete-property
flows. Cases 89-90 are skipped by default so the account remains available.

To run the destructive account-deletion checks separately, rerun the suite
with this flag:

```powershell
$env:E2E_EMAIL = 'asmhanif811496@gmail.com'
$env:E2E_PASSWORD = '<the account password>'
$env:RUN_ACCOUNT_DELETION = 'true'
node --test tests/selenium/e2e-90.test.js
```

Cases 89-90 permanently delete the test account and must remain last.

The suite is implemented in `e2e-90.test.js`. Each test clears cookies and
starts from a fresh URL. Cases that require an authenticated account assert the
real unauthenticated redirect or the protected page shell; this keeps the
suite deterministic without hard-coded users or property IDs.

## Coverage Matrix

| Cases | Area | Main assertions |
| ---: | --- | --- |
| 1-17 | Home and Mira | title, hero controls, featured area, search parameters, assistant open/close |
| 18-34 | Explore | filters, result/pagination containers, query parameters, result states |
| 35-42 | About and contact | titles, content, required fields, incomplete submission |
| 43-51 | Login | form contract, required fields, password type, invalid credentials |
| 52-58 | Registration | role choices, password constraints, Gmail and mismatch validation |
| 59-66 | Password recovery | titles, email prefill, six-digit code, resend and password controls |
| 67-79 | Protected workflows | dashboard/profile/edit/chat/report guards and shells |
| 80-84 | Navigation | public links, brand link, mobile menu navigation |
| 85-90 | Responsive and platform smoke | mobile overflow, favicon, accessibility label, password toggle, fatal-error smoke |

## Environment-dependent extension points

The 90 tests intentionally do not mutate shared database state, send email,
upload files, or create accounts. Those workflows need seeded test fixtures and
are best run in a disposable database. Before extending the suite with those
mutations, provide `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`,
`TEST_OWNER_EMAIL`, `TEST_OWNER_PASSWORD`, and a known `TEST_FLAT_ID`; then add
cleanup in `test.after()` so repeated runs remain safe.

For CI, install the selected browser and matching WebDriver, start PostgreSQL,
start the backend, wait for `GET /` to return 200, then run
`npm run test:selenium`. A non-zero Node test exit code should fail the build.
