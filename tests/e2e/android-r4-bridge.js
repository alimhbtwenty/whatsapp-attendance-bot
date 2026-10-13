// بازبینی و آزمون پل اندروید و یادآوری خروج (دور ۴ - Antigravity Android QA)
// ۱. قرارداد scheduleExitReminder2 و اعلان ماندگار حضور (ongoing presence)
// ۲. قرارداد دکمه‌های اعلان (open, exit, dismiss) و لغو با ثبت خروج
// ۳. بازتولید شرایط مرزی اندروید: اسنوز، ری‌استارت گوشی، تغییر ساعت یادآوری، و ذخیره پایدار دیسک (store*)
const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    timezoneId: 'Asia/Tehran',
    geolocation: { latitude: 35.7, longitude: 51.4 },
    permissions: ['geolocation', 'clipboard-read', 'clipboard-write']
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(10000);
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));

  // ساعت ورود ثابت: ۰۸:۳۰ صبح دوشنبه ۲۱ مهر ۱۴۰۵
  await p.clock.install({ time: new Date('2026-10-12T08:30:00+03:30') });

  await p.addInitScript(() => {
    const calls = window.__bridgeCalls = [];
    const store = window.__bridgeStore = {};
    let seq = 1;

    // شبیه‌سازی دقیق منطق Java (ExitReminder و MainActivity) برای سنجش قرارداد پل
    const exitPrefs = window.__exitPrefs = {};
    window.__exitAlarm = null;

    window.AndroidBridge = {
      saveFile: (name, mime, content) => calls.push(['saveFile', name, mime, content]),
      bioStatus: () => 'available',
      bioEnrolled: (id) => !!store['bio_' + id],
      bioEnroll: (id, raw, cb) => {
        calls.push(['bioEnroll', id]);
        store['bio_' + id] = raw;
        setTimeout(() => window.__geoBioDone(cb, true, ''), 10);
      },
      bioUnlock: (id, cb) => {
        calls.push(['bioUnlock', id]);
        setTimeout(() => window.__geoBioDone(cb, !!store['bio_' + id], store['bio_' + id] || 'لغو شد'), 10);
      },
      bioRemove: (id) => { delete store['bio_' + id]; },

      scheduleExitReminder: (title, body, at, key) => {
        calls.push(['schedule', title, body, Number(at), key]);
        exitPrefs.title = title;
        exitPrefs.body = body;
        exitPrefs.at = Number(at);
        exitPrefs.key = key;
        delete exitPrefs.fired;
        window.__exitAlarm = Number(at);
      },

      scheduleExitReminder2: (title, body, at, key, ongoingTitle, ongoingBody) => {
        calls.push(['schedule2', title, body, Number(at), key, ongoingTitle, ongoingBody]);
        if (ongoingTitle && ongoingBody) {
          exitPrefs.ongoingTitle = ongoingTitle;
          exitPrefs.ongoingBody = ongoingBody;
        }
        // منطق واقعی خط ۵۱ ExitReminder.java:
        if (key === exitPrefs.fired && Number(at) <= Date.now() + 60000) {
          return;
        }
        exitPrefs.title = title;
        exitPrefs.body = body;
        exitPrefs.at = Number(at);
        exitPrefs.key = key;
        delete exitPrefs.fired;
        window.__exitAlarm = Number(at);
      },

      cancelExitReminder: () => {
        calls.push(['cancel']);
        for (const k in exitPrefs) delete exitPrefs[k];
        window.__exitAlarm = null;
      },

      testNotification: () => calls.push(['testNotification']),
      openBatterySettings: () => calls.push(['openBatterySettings']),
      notificationPermission: () => 'granted',
      requestNotificationPermission: () => calls.push(['askPermission']),

      // نسخه دوم داده روی دیسک (store*)
      storeSet: (key, val) => {
        calls.push(['storeSet', key]);
        store[key] = val;
        delete store[key + '.del'];
        return String(++seq);
      },
      storeRemove: (key) => {
        calls.push(['storeRemove', key]);
        delete store[key];
        store[key + '.del'] = '1';
        return String(++seq);
      },
      storeSnapshot: () => {
        calls.push(['storeSnapshot']);
        const data = {};
        const removed = [];
        for (const k in store) {
          if (k.endsWith('.del')) removed.push(k.slice(0, -4));
          else if (!k.startsWith('bio_')) data[k] = store[k];
        }
        return JSON.stringify({ seq, complete: true, data, removed });
      },
      storeMarkComplete: () => {
        calls.push(['storeMarkComplete']);
        return true;
      }
    };

    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه', 'صدف']));
    localStorage.setItem('geomat_sites_v1', JSON.stringify({ 'کرانه': { lat: 35.7, lng: 51.4, radius: 200, acc: 10 } }));
  });

  await p.goto(BASE + '/index.html');
  await p.waitForTimeout(800);
  await login(p);

  // بیومتریک بعد از ورود با رمز پیشنهاد می‌شود
  if (await p.locator('#confirmModal.open').count() > 0) {
    await p.click('#confirmOkBtn');
    await p.waitForTimeout(300);
  }

  const calls = () => p.evaluate(() => window.__bridgeCalls);

  // ۱. ثبت ورود در ۰۸:۳۰ -> زمان‌بندی یادآوری برای ۱۸:۰۰ و اعلان حضور ماندگار
  await p.evaluate(() => {
    selectedCompany = 'کرانه';
    companyPickedManually = true;
    renderCompanies();
    setAttendanceAction('in');
  });
  await p.click('#inTimeRow .time-now-pill');
  await p.waitForTimeout(1000);
  await p.click('#floatingDock .dock-copy-btn');
  await p.waitForTimeout(1500);

  const sch2 = (await calls()).filter(c => c[0] === 'schedule2').pop();
  ok('scheduleExitReminder2 invoked on clock-in', !!sch2, JSON.stringify(sch2));
  ok('reminder scheduled for 18:00 Tehran time', sch2 && new Date(sch2[3]).toISOString() === '2026-10-12T14:30:00.000Z', sch2 && new Date(sch2[3]).toISOString());
  ok('ongoing presence notification has correct site title', sch2 && sch2[5].includes('حضور در «کرانه»') && sch2[5].includes('08:30'), sch2 && sch2[5]);
  ok('ongoing presence notification has exit prompt body', sch2 && sch2[6] === 'برای ثبت خروج بزنید', sch2 && sch2[6]);

  // ۲. تغییر ساعت یادآوری در تنظیمات -> ارسال ساعت جدید به پل اندروید
  await p.evaluate(() => saveSettingField('reminderTime', '19:30'));
  await p.waitForTimeout(300);
  const schUpdated = (await calls()).filter(c => c[0] === 'schedule2').pop();
  ok('rescheduling reminder when setting changes', schUpdated && new Date(schUpdated[3]).toISOString() === '2026-10-12T16:00:00.000Z', schUpdated && new Date(schUpdated[3]).toISOString());

  // بازگرداندن ساعت یادآوری به ۱۸:۰۰
  await p.evaluate(() => saveSettingField('reminderTime', '18:00'));
  await p.waitForTimeout(300);

  // ۳. آزمون اعلان ماندگار و پل: شبیه‌سازی اسنوز در اندروید
  // ساعت ۱۸:۰۰ فرا می‌رسد و آلارم در اندروید شلیک می‌شود
  await p.clock.setFixedTime(new Date('2026-10-12T18:00:00+03:30'));
  await p.evaluate(() => {
    // شبیه‌سازی onReceive(ACTION_FIRE)
    window.__exitPrefs.fired = window.__exitPrefs.key;
    // کاربر دکمه اسنوز ۳۰ دقیقه را می‌زند: ACTION_SNOOZE
    window.__exitPrefs.at = Date.now() + 30 * 60 * 1000;
    delete window.__exitPrefs.fired; // باگ جاوا: حذف fired
    window.__exitAlarm = window.__exitPrefs.at;
  });

  const alarmBeforeSync = await p.evaluate(() => window.__exitAlarm);
  ok('snooze sets alarm 30 minutes ahead in Android prefs', alarmBeforeSync === new Date('2026-10-12T18:30:00+03:30').getTime(), String(alarmBeforeSync));

  // ۴. کاربر ۵ دقیقه بعد برنامه را باز می‌کند (ساعت ۱۸:۰۵)
  await p.clock.setFixedTime(new Date('2026-10-12T18:05:00+03:30'));
  // فراخوانی syncExitReminder همانند شروع برنامه یا تعویض تب
  await p.evaluate(() => syncExitReminder());
  await p.waitForTimeout(300);

  const alarmAfterSync = await p.evaluate(() => window.__exitAlarm);
  // بررسی باگ اسنوز: چون کد جاوا fired را پاک کرده، زمان آلارم از ۱۸:۳۰ به ۱۸:۰۶ (یک دقیقه بعد) بازنویسی می‌شود
  const snoozeOverwritten = alarmAfterSync === new Date('2026-10-12T18:06:00+03:30').getTime();
  ok('reproduced android snooze override bug: syncExitReminder overwrites 30m snooze to 1m', snoozeOverwritten, `alarm=${new Date(alarmAfterSync).toISOString()}`);

  // ۵. اکشن dismiss (دکمه ✕ اعلان): باز شدن پنجره تایید حذف ورود باز
  await p.evaluate(() => window.handleNotificationAction('dismiss'));
  await p.waitForTimeout(300);
  const confirmOpen = await p.locator('#confirmModal.open').count();
  ok('notification dismiss action prompts confirmation modal to discard open entry', confirmOpen === 1);

  // انصراف از بستن ورود باز
  await p.click('#confirmModal [data-click*="resolveConfirm"][data-click*="false"]');
  await p.waitForTimeout(300);
  const stillOpen = await p.evaluate(() => !!getOpenEntry());
  ok('canceling modal keeps open entry intact', stillOpen);

  // ۶. ثبت خروج نهایی -> لغو یادآوری در پل اندروید (cancelExitReminder)
  await p.evaluate(() => {
    setAttendanceAction('out');
    document.getElementById('outHour').value = '18';
    document.getElementById('outMin').value = '10';
  });
  await p.click('#floatingDock .dock-copy-btn');
  await p.waitForTimeout(1500);

  const cancelCall = (await calls()).filter(c => c[0] === 'cancel').pop();
  ok('cancelExitReminder called on exit commit', !!cancelCall, JSON.stringify(cancelCall));
  const prefsCleared = await p.evaluate(() => Object.keys(window.__exitPrefs).length === 0);
  ok('android exit prefs cleared after exit', prefsCleared);

  // ۷. دکمه بازگشت اندروید (handleBack)
  const backHandled = await p.evaluate(() => {
    // باز کردن یک پنجره یا تب
    openCalendar(new Date(), () => {});
    return window.handleBack && window.handleBack();
  });
  ok('android back button closes open calendar layer first', backHandled === true);

  // ۸. ذخیره نسخه دوم داده (storeSet / storeRemove)
  const storeKeys = await p.evaluate(() => Object.keys(window.__bridgeStore).filter(k => k.startsWith('geomat_')));
  ok('durable mirror wrote critical geomat keys to bridge', storeKeys.includes('geomat_logs_v2') && storeKeys.includes('geomat_open_entry_v1.del'), storeKeys.join(','));

  ok('no page errors throughout android bridge audit', !errs.length, errs.join(';'));
  await b.close();
})();
