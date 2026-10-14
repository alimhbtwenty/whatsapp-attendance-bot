// قرارداد صفحه با پل اندروید (AndroidBridge) با یک پل ساختگی: یادآوری خروج، دکمه‌های اعلان، بیومتریک بومی
const { chromium } = require('playwright');
const { login, ADMIN } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran', geolocation: { latitude: 35.7, longitude: 51.4 }, permissions: ['geolocation', 'clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-10-12T08:30:00+03:30') });
  await p.addInitScript(() => {
    const calls = window.__bridgeCalls = [];
    const store = {};
    window.AndroidBridge = {
      saveFile() {},
      bioStatus: () => 'available',
      bioEnrolled: (id) => !!store[id],
      bioEnroll: (id, raw, cb) => { calls.push(['bioEnroll', id]); store[id] = raw; setTimeout(() => window.__geoBioDone(cb, true, ''), 10); },
      bioUnlock: (id, cb) => { calls.push(['bioUnlock', id]); setTimeout(() => window.__geoBioDone(cb, !!store[id], store[id] || 'لغو شد'), 10); },
      bioRemove: (id) => { delete store[id]; },
      scheduleExitReminder: (title, body, at, key) => calls.push(['schedule', title, body, Number(at), key]),
      cancelExitReminder: () => calls.push(['cancel']),
      notificationPermission: () => 'granted',
      requestNotificationPermission: () => calls.push(['askPermission'])
    };
    if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1');
    localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه']));
    localStorage.setItem('geomat_sites_v1', JSON.stringify({ 'کرانه': { lat: 35.7, lng: 51.4, radius: 200, acc: 10 } }));
  });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(800);
  await login(p);
  // پیشنهاد بیومتریک بعد از اولین ورود با رمز → روشن
  await p.waitForSelector('#confirmModal.open'); await p.click('#confirmOkBtn'); await p.waitForTimeout(400);
  const calls = () => p.evaluate(() => window.__bridgeCalls);
  ok('native biometric enrolled with the team key', (await calls()).some(c => c[0] === 'bioEnroll'));
  // ورود همین لحظه → یادآوری در ساعت ۱۸:۰۰ امروز با متن بنر
  await p.evaluate(() => { selectedCompany = 'کرانه'; companyPickedManually = true; renderCompanies(); setAttendanceAction('in'); });
  await p.click('#inTimeRow .time-now-pill'); await p.waitForTimeout(1200);
  await p.click('#floatingDock .dock-copy-btn'); await p.waitForTimeout(2000);
  let sch = (await calls()).filter(c => c[0] === 'schedule').pop();
  ok('reminder scheduled on entry', !!sch && sch[1] === '⏰ خروج «کرانه» ثبت نشده' && sch[2].startsWith('ورود 08:30'), JSON.stringify(sch));
  ok('reminder at the reminder time (18:00 Tehran)', !!sch && new Date(sch[3]).toISOString() === '2026-10-12T14:30:00.000Z', sch && new Date(sch[3]).toISOString());
  // تغییر ساعت یادآوری → زمان‌بندی دوباره
  await p.evaluate(() => saveSettingField('reminderTime', '19:15')); await p.waitForTimeout(100);
  sch = (await calls()).filter(c => c[0] === 'schedule').pop();
  ok('reminder moves with the setting', new Date(sch[3]).toISOString() === '2026-10-12T15:45:00.000Z');
  // دکمه «ثبت خروج» اعلان وقتی برنامه قفل است → بعد از ورود فرم خروج همان ورود
  await p.evaluate(() => lockApp(true));
  await p.evaluate(() => window.handleNotificationAction('exit'));
  ok('notification action waits for login', await p.locator('#appLock.open').count() === 1);
  await p.click('#lockBioBtn'); await p.waitForTimeout(800);
  ok('native biometric login', await p.locator('#appLock.open').count() === 0);
  ok('exit form opened for the open entry', await p.evaluate(() => attendanceAction === 'out' && selectedCompany === 'کرانه'));
  // ثبت خروج → لغو یادآوری
  await p.click('#floatingDock .dock-copy-btn'); await p.waitForTimeout(2000);
  const last = (await calls()).pop();
  ok('reminder cancelled after exit', last[0] === 'cancel', JSON.stringify(last));
  ok('no errors', !errs.length, errs.join(';'));
  await b.close();
})();
