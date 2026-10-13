Target: Geo Team, a Persian (RTL) offline PWA. The repo is mounted read-only in intent: do NOT commit or push; write findings to strix_runs only.
Served locally by `python -m http.server 8765` from the repo root; the app is http://host.docker.internal:8765/index.html.

There is NO backend. All data lives in the browser's localStorage under geomat_* keys. Attack surface:
- Files the user imports: team file (Account → update team file), backup restore (Settings → restore), team archive file (Archive → Support → «📥 افزودن فایل آرشیو تیم»). Treat every field in them as attacker-controlled (XSS, prototype pollution, oversized/deep JSON, forged by.id, role escalation, deleting or overwriting existing records).
- Text the user types or pastes (company names, support report, chat, technical file fields) that is later rendered with innerHTML.
- The Content-Security-Policy (only the bundled script by hash): look for any way to run script or load remote content.
- Roles: tech vs admin. Admin-only: deleting technical-file items, history/restore, users panel, team file export, and seeing the «بین دو حضور» gap reason. Technical-file passwords are AES-GCM encrypted with the team key; plaintext must never be stored, logged or exported.
- The technical file (geomat_inventory_v1) must never appear in WhatsApp text, the messenger, Excel/CSV, the team archive file or reports.

Test accounts: on first run the app asks to create the admin. Use name «مدیر تست», phone 09120000001, password admin-pass-1. Create a technician from the account panel: 09120000002 / tech-pass-22.
Out of scope: the Android APK (file:// only), Google Play, GitHub. Accepted risks are listed in docs/security/threat-model.md («ریسک‌های پذیرفته‌شده»); do not report them.
Report each validated finding with exact steps and the file:line in src/ that causes it.
