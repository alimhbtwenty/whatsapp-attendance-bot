---
name: geo-team-qa-lessons
description: Checklist of real Geo Team defects found by Antigravity QA agents and Claude's triage, each with the test that guards it. Use before writing or reviewing any change to Geo Team (attendance, reminders, archive, accessibility, Android bridge), before writing a test, and when triaging another agent's branch. Append new lessons after every triage.
---

# Geo Team QA lessons

Every item below was a real bug in this app. It was proven by a test that failed, and it was fixed. Before you change code in one of these areas, check the matching item. Before you review a change, check every item it touches.

## How to use
1. Find the area your change touches in the sections below.
2. Check each item against your diff. If an item applies, the listed test must still pass, and new behaviour needs a test written the same way.
3. After you triage an agent's branch, add every new real finding here: one line, the rule, and the test that guards it.

## Writing tests
- **Pin the page clock** (`page.clock.install`) in every test.
  - An entry within ±30 min of "now" counts as live. If the site has no saved location, that opens the "ثبت موقعیت" dialog and blocks clicks.
  - Four tests used to fail only at certain hours: `restart-durability`, `storage-quota`, `messenger-support-archive` and `lock-bypass`.
- **Reproduce before fixing.** Run the new test on the base commit and keep the FAIL line.
- **Do not `await` a page call that waits on `appConfirm()`.** The test hangs. Call it without awaiting the confirm (`evaluate(() => { fn(); })`), then click `#confirmOkBtn`.
- **When a test fails, check the default form values.** The exit field already defaults to "now". Set a sentinel value before asserting that code filled it.
- **Watch for timestamp ids in filters.** Record ids are millisecond timestamps (about 1.8e12), so a filter like `id >= 900000` matches every record.
- **Never weaken an assertion to get green.** Fix the code, or fix a wrong premise in the test, and say which one you did.

## Attendance and pairing (ADR-0001)
- **Same-day pairing needs `in ≤ out`.** Night shifts pair with `diff === 1 && out < in`. Both `pairedEntry()` and `openEntryMatch()` must use the same rule. Guarded by `flow-audit-defects`.
- **Greeting only in a person's first message of the day.** A night-shift exit in the morning counts as that day's first message. Filter `otherPersons`. Guarded by `flow-audit-defects`.
- **Deleting a record resets the repeat guard (`lastCommit`).** Otherwise the same report cannot be recorded again for 10 minutes. Guarded by `flow-audit-defects`.
- **On a shared phone, every per-day or per-person query skips other accounts' records** (`otherPersons`). Guarded by `shared-phone`.
- **Every query on `geomat_logs_v2` must say which `type` it wants.** Imported support records belong to other people. Monthly report people are counted from attendance only. Guarded by `support-archive-share`.

## Reminders and notifications
- **The reminder time comes from one helper, `exitReminderAt(o)`.**
  - An entry at or after `reminderTime` is reminded the next day.
  - The native schedule and the in-app banner (`isOpenEntryOverdue`) both use it.
  - Guarded by `android-bridge-defects` and `reminder-timing`.
- **Native state flags must be cleared on every path that re-arms them.** If `schedule()` keeps `fired` for a future time, `restore()` drops the reminder after a reboot. The same applies to `.complete` in the durable mirror.
- **Tapping the notification (`open`) behaves like the «ثبت خروج» button.** It opens attendance, sets the exit to "now" (only when the exit is today or a night shift) and scrolls to `#outTimeRow`. Guarded by `notification-exit-now`.
- **A new bridge method needs a fallback for older APKs.** Check `typeof br.newMethod === 'function'` first. Example: `scheduleExitReminder2`.

## Archive and shared files (ADR-0004)
- **Imports are append-only.**
  - The key is `by.id|id`: ids collide across phones.
  - Never overwrite or drop a record.
  - Never call `writeLogs` for an import, because it trims the oldest records when the archive is full. Refuse the import instead.
- **Validate every field from a file:** its type, its length, a round-trip date check (`2026-13-45` still makes a `Date`) and an allow-list of fields. Escape every field on display.
- **Attendance and support are separate archive sections** (`archiveSection`), each with its own company filter and Excel. The team-file buttons live only in the support section. Guarded by `support-archive-share`.
- **The gap reason («بین دو حضور») is admin-only**, both in the archive card and in the Excel column. The record still stores it, and the deficit rule is unchanged. Guarded by `gap-admin-only`.
- **Delete only the clicked record** (`deleteLogItem(id, byId)`), never every record that shares its id.
- **The technical file (`geomat_inventory_v1`) never goes into any export.** Assert this in the export test.

## Accessibility (axe in tests)
- **Every `role="dialog"` has a name.** Use `aria-labelledby` to point at its title (give the title default text), or `aria-label`. Guarded by `ui-defects`.
- **Technical values (IP, mask, URL) inside RTL text get `dir="ltr"`.** Otherwise «10.0.0.9 / 255.255.255.0» shows reversed. Do not use `dir="auto"` on Persian text: a leading Latin word flips the whole paragraph. Guarded by `support-record-popup`.
- **Every input has a label.** A placeholder is not a label.
- **Scrollable regions such as chip rows need `tabindex="0"`** and a name.
- **Check contrast in both themes.** A colour that passes in light can fail in dark. Use a token (`--on-danger`), not a hard-coded colour. Guarded by `reminder-timing`.

## Triage of another agent's branch
- **Fetch it, and check that its base is the current head** (`git merge-base --is-ancestor`).
- **Run its tests on the current code** to see them FAIL.
- **Read the fix critically.** Agent fixes were right in idea but often only half done: the reminder fix missed the banner, and the contrast fix covered only the light theme.
- **Bring in only `src/`, tests and the report** (`git checkout <branch> -- <paths>`). Then run `npm run build`. Never copy generated files.
- **Run `npm test`, then write `docs/reviews/antigravity/claude-triage-<date>.md`** and add the lessons here.
