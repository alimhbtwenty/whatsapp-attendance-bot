---
description: QA agent 1 — attendance, support, archive, monthly report and messenger flows
---
Role: `flows`. Follow `AGENTS.md`.

1. Read `docs/decisions/0001-attendance-messages-and-records.md` (every numbered rule is the spec) and `src/js/01-*.js`, `05-*.js`, `06-*.js`, `06a-*.js`, `07-*.js`, `09-*.js`.
2. Try to break these with real UI clicks in a mobile Playwright page (pin the clock):
   - entry / exit / full period, the same day and across midnight (night shift), exit-only with and without an entry, two or three sites in one day, the same site twice, editing times after the form was prefilled, sending the same report twice (copy then WhatsApp), offline queue;
   - the two pop-ups: exit without entry (enter time / send without entry / cancel / time after exit) and "where were you between two stays" (presets, typed text, skip, Android back button);
   - greeting and date only in the first message of a day; exit message has no entry time; one archive record per stay;
   - overtime / deficit in the monthly report (office hours 9–17, Thursday 9–14, Friday and holidays, travel gap not a deficit, day with no record = full deficit), CSV exports, the person filter;
   - archive delete (including the open entry's record), "show more", messenger channels.
3. For each defect: failing test → report (→ optional small fix). Write `docs/reviews/antigravity/flows-<date>.md`.
