# Ten Sets verification

Run `npm test` for the workout data-preservation checks and `npm run build`
for the production build. `node scripts/verify-regions.mjs` validates the
18 muscle regions.

The browser scripts use Playwright and an installed Chrome browser. Set
`PLAYWRIGHT_MODULE` to an installed Playwright module path if it is not
available in the local package resolution path. Set `BASE_URL` to the
development server or existing production URL.

- `node verify/reshot-editing.mjs`: edits current and archived workouts,
  preserves pending and legacy totals, revisits AM dates, reloads, and
  checks themes and narrow layouts. Uses isolated browser storage.
- `node verify/reshot-body.mjs`: exercises front/back, drag, muscle picking,
  alternate figure, exact set totals, and light/mobile rendering. Uses
  isolated browser storage.
- `node verify/reshot-sync-navigation.mjs`: simulates Supabase entirely in
  memory to check that rapid edits survive immediate tracker navigation.
  External requests are blocked.

The first two scripts save screenshots in this directory. Close the browser
contexts after each run to discard their disposable local logs.

`node verify/reshot-cloud-editing.mjs` is a separate real-backend integration
check. It creates a uniquely named test account, verifies dated edits across
two fresh browser contexts, and deletes that account and its tracker rows in
`finally`. Run it only with authorization for that test-account lifecycle.
It requires the existing `.env.local` database credentials and `psql` (set
`PSQL_PATH` if needed). Secrets are read in memory and never printed.

The cleanup helper defaults to read-only inspection. Deletion requires
`--delete --email <generated-test-email> --id <exact-test-uuid>` and is
restricted to recent verification accounts in the existing Ten Sets project.
