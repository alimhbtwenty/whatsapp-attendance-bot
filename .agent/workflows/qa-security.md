---
description: QA agent 2 — security (XSS, roles, lock screen, team file, backup tampering)
---
Role: `security`. Follow `AGENTS.md`.

1. Read `docs/security/threat-model.md` (accepted risks are NOT findings), `docs/decisions/0002-*.md`, `0003-*.md`, `src/js/08-*.js`, `10-*.js`, `11-*.js`, `12-*.js`, `tools/build.mjs` (CSP).
2. Attack, without devtools on the victim's phone (attacker has a locked phone, or is a logged-in technician, or crafts a backup / team file):
   - stored XSS in every text that reaches `innerHTML` (company names, chat, records, technical-file fields, history, team names, gap reasons);
   - a technician doing admin-only things (delete, history, restore, users, audit) — through the UI, through a crafted backup or team file;
   - getting past the lock screen or the technical-file re-auth; password brute-force limits;
   - any password or team key ending up in plain text in localStorage, exports, backups, the messenger or the clipboard after 30 s;
   - the append-only history: can any path drop or overwrite a version?
3. Existing security tests: `tests/e2e/security.js`, `lock-bypass.js`, `team-file-and-restore-trust.js`, `history-xss.js` — don't duplicate them. Report: `docs/reviews/antigravity/security-<date>.md`. Do not fix security findings yourself; report them with the failing test.
