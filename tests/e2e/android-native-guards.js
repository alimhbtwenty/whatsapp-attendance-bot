// نگهبان‌های کد اندروید (یافته‌های android-r4 #1–#4): اجرای Java در این محیط ممکن نیست،
// پس این تست وجود همان شرط‌ها را در سورس بررسی می‌کند. رفتار واقعی را فقط گوشی یا APK نشان می‌دهد.
const fs = require('fs');
const path = require('path');
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);

const dir = path.join(__dirname, '../../android/app/src/main/java/com/geomatco/attendance');
const exit = fs.readFileSync(path.join(dir, 'ExitReminder.java'), 'utf8');
const main = fs.readFileSync(path.join(dir, 'MainActivity.java'), 'utf8');

// بدنه یک متد را از امضایش تا بستن آکولادش برمی‌گرداند
function body(src, signature) {
  const start = src.indexOf(signature);
  if (start < 0) return '';
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  return '';
}

const schedule = body(exit, 'static void schedule(Context ctx, String title, String body, long at, String key, String ongoingTitle');
const snooze = body(exit, 'if (ACTION_SNOOZE.equals(action))');
const restore = body(exit, 'static void restore(Context ctx)');
const onResult = body(main, 'public void onRequestPermissionsResult(');

ok('snooze remembers the snoozed entry (snoozeKey/snoozeAt written)', /snoozeKey/.test(snooze) && /snoozeAt/.test(snooze));
ok('schedule keeps a live snooze instead of overwriting it with the reminder time', /snoozeKey/.test(schedule) && /snoozeAt/.test(schedule) && /return;/.test(schedule.slice(schedule.indexOf('snoozeKey'), schedule.indexOf('snoozeKey') + 200)));
ok('schedule cancels the old reminder notification when the time or entry changes', /cancel\(NOTIFICATION_ID\)/.test(schedule) && /at != p\.getLong\("at", 0\)/.test(schedule));
ok('restore shows the still-open reminder again after a restart', /show\(ctx, title, body\)/.test(restore) && /fired/.test(restore));
ok('restoreOngoing exists and restore uses it', /static void restoreOngoing\(/.test(exit) && /restoreOngoing\(ctx\)/.test(restore));
ok('MainActivity handles the notification permission result', /requestCode == REQ_NOTIFICATIONS/.test(onResult) && /ExitReminder\.restoreOngoing\(this\)/.test(onResult));

const failed = [schedule, snooze, restore, onResult].some(s => !s);
ok('all four methods were found in source', !failed);
