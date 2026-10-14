---
description: QA agent 3 — data safety on update, restore, phone restart and full storage
---
Role: `data-safety`. Follow `AGENTS.md`. First read `.claude/skills/geo-team-qa-lessons/SKILL.md`: hunt for the same kinds of bugs in code it does not list, and do not re-report listed ones.

1. Read `docs/data-model.md` (incl. "نسخه دوم روی دیسک"), `src/js/00a-durable-mirror.js`, `08-backup.js`, `13-migrations.js`, `tests/fixtures/*`, `tests/e2e/upgrade-from-old-versions.js`, `restart-durability.js`, `storage-quota.js`, `pwa-update.js`.
2. Try to lose or corrupt data:
   - open data from every old version (fixtures 1.1, 1.2, 1.3, 1.4p) and check every record, site, setting, chat message, technical-file version and account survives, and monthly totals are unchanged;
   - backup → restore on the same and on another phone; restore an old backup; restore the "before update" copy; a corrupt / huge / hostile backup file;
   - simulated phone restart (the fake Android bridge in `restart-durability.js`): lost writes at any point, crash between writes, full storage during restore;
   - storage near the ~5.2 M-character limit;
   - web-app update (service worker) from the released `main` build.
3. Report: `docs/reviews/antigravity/data-safety-<date>.md`. Data-loss findings: report with the failing test; do not fix.
