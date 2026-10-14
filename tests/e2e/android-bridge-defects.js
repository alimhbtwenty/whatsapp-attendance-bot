// تست بازتولید ایراد پل اندروید: ورود در شیفت عصر/شب (ساعت ۲۰:۰۰) نباید ۶۰ ثانیه بعد آلارم خروج بزند
const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran', geolocation: { latitude: 35.7, longitude: 51.4 }, permissions: ['geolocation', 'clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  // ساعت ثابت ۲۰:۰۰ روز ۲۱ مهر (بعد از ساعت پیش‌فرض یادآوری ۱۸:۰۰)
  await p.clock.install({ time: new Date('2026-10-12T20:00:00+03:30') });
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
  await p.waitForSelector('#confirmModal.open'); await p.click('#confirmOkBtn'); await p.waitForTimeout(400);
  const calls = () => p.evaluate(() => window.__bridgeCalls);

  // ثبت ورود در ساعت ۲۰:۰۰ (شیفت عصر/شب)
  await p.evaluate(() => { selectedCompany = 'کرانه'; companyPickedManually = true; renderCompanies(); setAttendanceAction('in'); });
  await p.click('#inTimeRow .time-now-pill'); await p.waitForTimeout(1200);
  await p.click('#floatingDock .dock-copy-btn'); await p.waitForTimeout(2000);
  let sch = (await calls()).filter(c => c[0] === 'schedule').pop();
  ok('reminder scheduled on night shift entry', !!sch, JSON.stringify(sch));
  // ساعت یادآوری ۱۸:۰۰ است. ورود در ساعت ۲۰:۰۰ نباید ۶۰ ثانیه بعد (۲۰:۰۱) یادآوری خروج بدهد؛
  // بلکه باید ساعت ۱۸:۰۰ روز بعد (2026-10-13T14:30:00.000Z) زمان‌بندی شود
  const targetIso = sch ? new Date(sch[3]).toISOString() : '';
  ok('evening entry reminder scheduled for next day at reminder time, not 60 seconds after clock-in', targetIso === '2026-10-13T14:30:00.000Z', targetIso);

  ok('no errors', !errs.length, errs.join(';'));
  await b.close();
})();
