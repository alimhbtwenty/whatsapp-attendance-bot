# Geomat attendance app

Persian (RTL) PWA for sending site entry/exit and support reports to WhatsApp, also shipped as an Android WebView APK.

## Start here
Read `docs/HANDOFF.md` (current state, open work, the owner's preferences), `docs/decisions/` (owner decisions not to re-decide) and `docs/data-model.md` (stored data / future server contract) before starting.

## Skills
Use the skills in `.claude/skills` for every task. Start with `using-agent-skills` to pick the right one for the phase of work (spec, implementation, `frontend-ui-engineering`, `browser-testing-with-devtools`, `debugging-and-error-recovery`, `code-review-and-quality`, `security-and-hardening`, ...), and review every change with `code-review-and-quality` before pushing.

## Project facts
- The whole app is `index.html` (inline CSS/JS). `android/app/src/main/assets/index.html` and `assets/sw.js` must be byte-identical copies of the root files.
- A release bumps together: `versionCode`/`versionName` in `android/app/build.gradle`, `CACHE_NAME` in both `sw.js` files, the release tag and notes in `.github/workflows/build-apk.yml`, and the version line in `README.md`.
- `confirm()`/`alert()` do not show in the Android WebView; use `appConfirm()`. File downloads go through `downloadFile()` (`AndroidBridge.saveFile` in the APK).
- Escape everything that goes into `innerHTML` with `escapeHtml()`.
- Stored dates (`date`) use Persian digits; compare with `dateISO` or the `jy/jm/jd` fields, not the display string.
- Test in a mobile-sized Chromium (Playwright) before pushing: reproduce the bug first, then show it fixed.
- Each stay is one archive record: entry creates it, exit completes it (`mergeExitIntoEntry`); never add a second record for an exit.
- The support technical file (`geomat_inventory_v1`) never goes into WhatsApp, the messenger, Excel or reports. Passwords are only stored encrypted under the one master password (`encryptWith`/`vaultKey`); never store or log them in plain text.
