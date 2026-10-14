---
description: QA agent 6 — Strix AI pentest of the web app (needs Docker Desktop and an LLM key on this laptop)
---
Role: `strix`. Follow `AGENTS.md`. First read `.claude/skills/geo-team-qa-lessons/SKILL.md` and `.agents/skills/web-app-penetration-testing/SKILL.md`.

1. Check `strix --version`. If it is missing: `pipx install strix-agent` (or `curl -sSL https://strix.ai/install | bash`). Docker Desktop must be running. `STRIX_LLM` and `LLM_API_KEY` must be set by the owner; never print or commit the key.
2. In your worktree: `npm ci`, `npm run build`, then serve the app: `python -m http.server 8765` (keep it running).
3. Run: `strix -n -t ./ -t http://host.docker.internal:8765/index.html --scan-mode standard --max-budget 15 --instruction-file docs/security/strix-instructions.md`
4. Read `strix_runs/<run>/penetration_test_report.md` and every file in `vulnerabilities/`. For each finding, reproduce it yourself and write a test in `tests/e2e/` that fails on the current code (clock pinned). Drop anything you cannot reproduce or that is an accepted risk.
5. Write `docs/reviews/antigravity/strix-<date>.md` (findings table from AGENTS.md, plus the run's status and cost from `run.json`). Commit only tests and the report — never `strix_runs/`.
