# Agent rules (Antigravity, Gemini, Codex, any coding agent)

This repo is **Geo Team**: a Persian (RTL) offline PWA for site attendance and support reports, also shipped as an Android WebView APK. Claude Code is the lead maintainer; you are a **QA / bug-hunting agent**. Your job is to find real defects, prove them with a failing test, and hand them back. Read `CLAUDE.md` (project facts — they bind you too), `docs/HANDOFF.md`, `docs/decisions/` and `docs/data-model.md` before you start.

## Hard rules
1. **Branch:** work on your own branch `antigravity/<role>-<yyyy-mm-dd>` created from `ccr-6b68bcdc-nwkjfb`. Never push to `main` or to `ccr-6b68bcdc-nwkjfb`. Never force-push. Never merge.
2. **Never edit generated files by hand:** `index.html`, `sw.js`, `android/app/src/main/assets/*`. Edit `src/` and run `npm run build`.
3. **Never change stored data keys or record shapes** (`geomat_*` in localStorage). Updates must never break or lose user data.
4. **Never weaken a test** (no skipping, deleting, loosening assertions, raising timeouts to hide a bug). Never add `eslint-disable`.
5. **Never put secrets or passwords in plain text** anywhere (code, tests, logs, reports). The technical file (`geomat_inventory_v1`) never goes to WhatsApp, the messenger, Excel or reports.
6. **Reproduce first.** Every finding needs a test under `tests/e2e/` that FAILS on the current code (paste the FAIL line in your report). If you also fix it, the same test must PASS after the fix, and the whole suite must stay green.
7. **Scope:** fix only what your finding needs. No refactors, renames, dependency changes, or design changes. If a fix is bigger than ~40 lines or touches `android/`, report it without fixing.
8. **No false positives.** A finding needs a concrete path: exact inputs/steps → wrong result. "Might", "could", style nits and accepted risks (see `docs/security/threat-model.md`, "ریسک‌های پذیرفته‌شده") are not findings.
9. Do not commit `node_modules/`, screenshots, or `tests/output/`.

## Commands
```bash
npm ci
npx playwright install chromium      # once per machine
npm run build                        # after any change in src/
npm test                             # build check + lint + every tests/e2e/*.js — must print "all N test files passed"
node tools/test.mjs <name>           # one test file, e.g. node tools/test.mjs attendance-flow
node tools/screens.mjs tests/output/screens   # screenshots of every screen (360/412 px, dark/light); needs a server on :8765:  python3 -m http.server 8765
```
A test file is a plain Node script that prints `PASS <name>` / `FAIL <name>` lines (see any file in `tests/e2e/`, helpers in `tests/helpers/session.js`: `login(page)`, `unlockTech(page)`, admin phone `09120000001` / password `admin-pass-1`). Copy an existing test as a template. Use a mobile viewport (390×844, `isMobile: true`, `timezoneId: 'Asia/Tehran'`). Pin the clock with `page.clock.install(...)` so tests never depend on the time of day.

## Report (one file per agent)
Write `docs/reviews/antigravity/<role>-<yyyy-mm-dd>.md`:

| # | Severity (high/medium/low) | Where (file:line) | Steps → wrong result | Test (file + FAIL line) | Fixed? (commit) |
|---|---|---|---|---|---|

Then a short "checked and found fine" list. If you found nothing real, write exactly **no findings** and list what you checked. Commit the report and tests on your branch and push the branch. Do not open a PR to `main`; the owner gives the branch to Claude Code.
