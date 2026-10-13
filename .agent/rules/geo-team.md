---
trigger: always_on
---
Read `.claude/skills/geo-team-qa-lessons/SKILL.md` first (past defects, test rules). Read and follow `AGENTS.md` at the repository root (and `CLAUDE.md`, which it points to) for every task in this workspace. Key points: work only on your own `antigravity/<role>-<date>` branch from `ccr-6b68bcdc-nwkjfb`; edit `src/` then `npm run build`, never the generated `index.html`/`sw.js`/Android assets; never change `geomat_*` storage keys or record shapes; every finding needs a failing test in `tests/e2e/`; never weaken tests; `npm test` must end with "all N test files passed"; write your report to `docs/reviews/antigravity/<role>-<date>.md`.
