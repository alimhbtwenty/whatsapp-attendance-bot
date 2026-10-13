---
description: QA agent 5 — Android code review (bridge, biometric, exit reminder, durable storage)
---
Role: `android`. Follow `AGENTS.md`. First read `.claude/skills/geo-team-qa-lessons/SKILL.md`: hunt for the same kinds of bugs in code it does not list, and do not re-report listed ones. Report only; do not change Java.

1. Read `android/app/src/main/AndroidManifest.xml` and every file in `android/app/src/main/java/com/geomatco/attendance/`, plus the JS that calls the bridge (`grep -n AndroidBridge src/js/*.js`).
2. If this machine has the Android SDK: `cd android && ./gradlew assembleDebug` must succeed; install on an emulator or phone (Android 10–15) and check: exit-reminder notification at the reminder time with the app closed and after a reboot; the "test notification" button in Settings; notification buttons (record exit, 30 min later, ✕); fingerprint/face login prompt on app open; delete a record then reboot immediately — the record must not come back; file save/restore; external links open outside the app; the Android back button.
3. Without an SDK, review the code for: methods callable by a non-app page (`pageIsApp`), exported components, PendingIntent flags, thread safety, file writes that are not atomic, exceptions that crash the app, API-level checks (minSdk 21, targetSdk 34).
4. Report: `docs/reviews/antigravity/android-<date>.md` (device/emulator model and Android version for every runtime finding).
