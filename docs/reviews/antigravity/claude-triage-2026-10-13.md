# Triage of the Antigravity branches (2026-10-13)

All three branches were based on `11adfb9`, the head of PR #4. The `ui` and `android` agents have not pushed anything yet.

| Branch | Report | Decision |
|---|---|---|
| `antigravity/data-safety-2026-10-13` | no findings | Report kept. |
| `antigravity/security-2026-10-13` | no findings, plus a 13-check test | Report and `tests/e2e/security-deep-audit.js` kept. The test passes on the current code. |
| `antigravity/flows-2026-10-13` | 3 findings and 1 accessibility fix | All accepted (below). |

## flows findings
Each finding was reproduced on `11adfb9` with `tests/e2e/flow-audit-defects.js`, which produced 4 FAIL lines. All of them pass after the fix.

1. **An exit before the entry on the same day was paired as a 23-hour stay.**
   - Cause: `openEntryMatch()` returned the open entry for any same-day exit.
   - The archive path in `pairedEntry()` already required `in ≤ out` for a same-day pair, so the fallback now applies the same rule. Night shifts are unaffected: the exit is on the next date, so `diff === 1`.
   - **Accepted.**
2. **A report deleted from the archive could not be recorded again for 10 minutes.**
   - Cause: `lastCommit` still matched the deleted report, so the resend was treated as a repeat and nothing was saved.
   - Fix: `deleteLogItem()` now resets `lastCommit`.
   - **Accepted.**
3. **After a night-shift exit in the morning, a new entry the same afternoon got a second greeting and date line.**
   - This went against ADR-0001: only the first message of the day greets.
   - Fix: `isFirstAttendanceOfDay()` now also counts a stay that crosses midnight into the day. It also ignores other people's records on a shared phone, in line with `otherPersons`.
   - **Accepted.**
4. **The channel pills had no keyboard access** (`tabindex` and `role="region"` were missing).
   - This is axe's "scrollable region must be focusable" rule.
   - **Accepted.**

## Found while verifying
Four tests depended on the time of day. Sending an entry within 30 minutes of the current time counts as a "live" entry. For a site with no saved location, that opens the "record location" dialog, which blocked the next click.

- **Tests affected:** `restart-durability` (entries at 08:00 and 09:30), `storage-quota` (08:00), `messenger-support-archive` (09:00) and `lock-bypass`.
- **What happened:** `restart-durability` failed at 10:0x Tehran time, and `storage-quota` fails with the clock set to 08:10.
- **Fix:** these four tests now pin the page clock away from their entry times. No assertion changed.

## Round 2: ui and android (based on `8105da9`)
Both branches were reproduced on `8105da9`: `ui-defects` failed 10 checks and `android-bridge-defects` failed 1.

| Finding | Decision |
|---|---|
| android #1: `ExitReminder.schedule()` kept `fired` when the reminder moved to a later time, so `restore()` dropped it after a reboot | **Accepted.** The agent was not allowed to touch `android/`, so I fixed it myself: `.remove("fired")` in `schedule()`. |
| android #2: an entry at or after the reminder time got the notification 60 seconds later | **Accepted and completed.** The in-app banner (`isOpenEntryOverdue`) had the same bug. Both now use `exitReminderAt()`. Guarded by `reminder-timing`. |
| ui #1: dialogs had no accessible name | **Accepted.** Dialogs with a title element use `aria-labelledby`, and the titles got default text. |
| ui #2: the vault password fields had no labels | **Accepted.** |
| ui #3: the delete button's contrast was too low | **Accepted, but the fix was incomplete.** The agent's `#fff` only fixed the light theme; the dark theme measured 3.46:1. There is now an `--on-danger` token for each theme, checked in both themes by `reminder-timing`. |

## From now on
Every triage adds its real findings, and the mistakes in agent fixes, to `.claude/skills/geo-team-qa-lessons/SKILL.md`. Antigravity agents read that file first (`AGENTS.md`, `.agent/rules`, `.agent/workflows`).
