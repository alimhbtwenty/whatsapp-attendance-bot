# Geo Team (Geomat attendance app)

Persian (RTL) PWA for sending site entry/exit and support reports to WhatsApp, also shipped as an Android WebView APK.

## Start here
Read `docs/HANDOFF.md` (current state, open work, the owner's preferences), `docs/decisions/` (owner decisions not to re-decide) and `docs/data-model.md` (stored data / future server contract) before starting.

## Skills
Use the skills in `.claude/skills` for every task. Start with `using-agent-skills` to pick the right one for the phase of work (spec, implementation, `frontend-ui-engineering`, `browser-testing-with-devtools`, `debugging-and-error-recovery`, `code-review-and-quality`, `security-and-hardening`, ...), and review every change with `code-review-and-quality` before pushing.

## Project facts
- Source lives in `src/` (`index.template.html`, `styles/*.css`, `js/NN-*.js` concatenated in order into one classic script). `index.html` and `android/app/src/main/assets/*` are **generated**: edit `src/`, then run `npm run build`. CI fails if they are stale (`npm run check`).
- No inline `on*=` handlers: use `data-click='["fn", args...]'` (also data-input/change/keydown/paste/blur) and add `fn` to `UI_ACTION_NAMES` in `src/js/12-ui-events.js`; in JS templates use `uiAttr('click', 'fn', ...args)`. The CSP allows only the bundled script (by hash), so inline handlers are blocked.
- Tests: `npm test` (build check + every `tests/e2e/*.js` via `tools/test.mjs`). A test prints `PASS …`/`FAIL …`; any FAIL or non-zero exit fails CI and blocks the APK. Locally: `NODE_PATH=/opt/node22/lib/node_modules node tools/test.mjs [name]`.
- Updates must never break stored data: keep the `geomat_*` keys and record shapes; add schema changes as idempotent steps in `runMigrations()` (`src/js/13-migrations.js`). `tests/e2e/upgrade-from-old-versions.js` opens data made by real 1.1–1.4 builds (`tests/fixtures`).
- A release bumps together: `versionCode`/`versionName` in `android/app/build.gradle`, `CACHE_NAME` in both `sw.js` files, the release tag and notes in `.github/workflows/build-apk.yml`, and the version line in `README.md`.
- `confirm()`/`alert()` do not show in the Android WebView; use `appConfirm()`. File downloads go through `downloadFile()` (`AndroidBridge.saveFile` in the APK).
- Escape everything that goes into `innerHTML` with `escapeHtml()`.
- Stored dates (`date`) use Persian digits; compare with `dateISO` or the `jy/jm/jd` fields, not the display string.
- Test in a mobile-sized Chromium (Playwright) before pushing: reproduce the bug first, then show it fixed.
- Each stay is one archive record: entry creates it, exit completes it (`mergeExitIntoEntry`); never add a second record for an exit.
- The support technical file (`geomat_inventory_v1`) never goes into WhatsApp, the messenger, Excel or reports. Passwords are only stored encrypted with the team key (`encryptWith(session.key, …)`); never store or log them, or any account password, in plain text.
- Technical-file history is append-only: every change goes through `pushVersion()`; never overwrite or drop a version. Delete is admin-only and soft. Technicians may view, add and edit (ADR-0002).
