---
description: QA agent 4 — visual, RTL, accessibility and small-screen review
---
Role: `ui`. Follow `AGENTS.md`. First read `.claude/skills/geo-team-qa-lessons/SKILL.md`: hunt for the same kinds of bugs in code it does not list, and do not re-report listed ones.

1. Start `python3 -m http.server 8765` in the repo root, run `node tools/screens.mjs tests/output/screens` and look at every screenshot (360 and 412 px, dark and light). Also open the pop-ups, the technical-file editor, long company names, 5000 archive records (see `docs/reviews/round-08.md`).
2. Look for: text cut off or overlapping, horizontal scroll, wrong RTL order (Persian vs Latin digits/IPs), low contrast (WCAG AA), buttons smaller than 40 px, things hidden behind the floating dock or the keyboard, broken light theme, focus not visible, screen-reader labels missing (`tests/e2e/accessibility.js` runs axe — extend it, don't weaken it).
3. Report with the screenshot file name and a test where possible (axe rule, element size, `scrollWidth > clientWidth`). Small CSS fixes in `src/styles/` are allowed (then `npm run build`, `npm test`). Report: `docs/reviews/antigravity/ui-<date>.md`.
