// یادآوری خروج و اعلان «حضور» (یافته Antigravity android #2 و درخواست مالک):
// - ورود بعد از ساعت یادآوری (شیفت عصر/شب) فردا همان ساعت یادآوری می‌گیرد، نه یک دقیقه بعد
// - بنر داخل برنامه هم همان را می‌گوید: ورود ۲۰:۰۰ ساعت ۲۰:۳۰ و ۰۲:۰۰ بامداد «دیر» نیست
// - اپ تازه scheduleExitReminder2 را با متن اعلان ماندگار «حضور» صدا می‌زند؛ خروج آن را لغو می‌کند
// - دکمه حذف در هر دو تم کنتراست کافی دارد (یافته Antigravity ui #3 فقط تم روشن را دیده بود)
const { chromium } = require('playwright');
const fs = require('fs');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const axePath = (() => { try { return require.resolve('axe-core/axe.min.js'); } catch (e) { return process.env.AXE_PATH; } })();

(async () => {
  const b = await chromium.launch();
  const page = async (time, bridge) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran', bypassCSP: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    const p = await ctx.newPage(); p.setDefaultTimeout(10000);
    p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.clock.install({ time: new Date(time) });
    await p.addInitScript((bridge) => {
      if (bridge) {
        const calls = window.__calls = [];
        window.AndroidBridge = {
          saveFile() {}, bioStatus: () => 'unavailable', bioEnrolled: () => false,
          scheduleExitReminder: (...a) => calls.push(['schedule', ...a]),
          scheduleExitReminder2: (...a) => calls.push(['schedule2', ...a]),
          cancelExitReminder: () => calls.push(['cancel']),
          notificationPermission: () => 'granted', requestNotificationPermission() {}
        };
      }
      if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1');
      localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه']));
      localStorage.setItem('geomat_sites_v1', JSON.stringify({ 'کرانه': { lat: 35.7, lng: 51.4, radius: 200, acc: 10 } }));
    }, bridge);
    await p.goto(BASE + '/index.html'); await p.waitForTimeout(600);
    await login(p);
    return p;
  };
  const enter = (p, hh, mm) => p.evaluate(([hh, mm]) => {
    // ورودِ ثبت‌شده، بدون رد شدن از موقعیت و پرسش‌ها
    setOpenEntry({ company: 'کرانه', dateISO: toISODate(currentDateObj), inTime: `${hh}:${mm}`, logId: 1, ts: Date.now(), notified: false, by: session.user.id });
  }, [hh, mm]);

  // ---------- ورود ۲۰:۰۰ (یادآوری پیش‌فرض ۱۸:۰۰) ----------
  const p = await page('2026-10-12T20:00:00+03:30', true);
  await enter(p, '20', '00');
  const s2 = await p.evaluate(() => window.__calls.filter(c => c[0] === 'schedule2').pop());
  ok('the app calls scheduleExitReminder2 when the APK has it', !!s2, JSON.stringify(s2));
  ok('an evening entry is reminded the next day at the reminder time', s2 && new Date(Number(s2[3])).toISOString() === '2026-10-13T14:30:00.000Z', s2 && new Date(Number(s2[3])).toISOString());
  ok('the ongoing presence notification names the site and entry time', s2 && s2[5].includes('کرانه') && s2[5].includes('20:00') && !!s2[6], s2 && s2[5]);
  await p.clock.runFor(30 * 60 * 1000);
  ok('30 minutes after an evening entry the banner is not overdue', await p.evaluate(() => !isOpenEntryOverdue(getOpenEntry()) && !document.querySelector('#openEntryBanner.overdue')));
  await p.clock.setFixedTime(new Date('2026-10-13T02:00:00+03:30'));
  ok('at 02:00 the night shift is not overdue yet', await p.evaluate(() => !isOpenEntryOverdue(getOpenEntry())));
  await p.clock.setFixedTime(new Date('2026-10-13T18:01:00+03:30'));
  ok('at 18:01 the next day it is overdue', await p.evaluate(() => isOpenEntryOverdue(getOpenEntry())));
  await p.evaluate(() => setOpenEntry(null));
  ok('closing the entry cancels the reminder and the presence notification', await p.evaluate(() => window.__calls[window.__calls.length - 1][0] === 'cancel'));
  ok('no page errors (evening)', !p.errs.length, p.errs.join(';'));

  // ---------- ورود صبح ----------
  const m = await page('2026-10-12T08:00:00+03:30', true);
  await enter(m, '08', '00');
  const ms = await m.evaluate(() => window.__calls.filter(c => c[0] === 'schedule2').pop());
  ok('a morning entry is reminded the same day at the reminder time', ms && new Date(Number(ms[3])).toISOString() === '2026-10-12T14:30:00.000Z', ms && new Date(Number(ms[3])).toISOString());
  await m.clock.setFixedTime(new Date('2026-10-12T18:00:00+03:30'));
  ok('a morning entry is overdue at the reminder time', await m.evaluate(() => isOpenEntryOverdue(getOpenEntry())));

  // ---------- APK قدیمی (فقط scheduleExitReminder) ----------
  const old = await page('2026-10-12T08:00:00+03:30', true);
  await old.evaluate(() => { delete window.AndroidBridge.scheduleExitReminder2; });
  await enter(old, '08', '00');
  ok('an older APK without scheduleExitReminder2 still gets the reminder', await old.evaluate(() => window.__calls.some(c => c[0] === 'schedule')));

  // ---------- کنتراست دکمه حذف در هر دو تم ----------
  const axe = fs.readFileSync(axePath, 'utf8');
  for (const theme of ['dark', 'light']) {
    const t = await page('2026-10-12T12:00:00+03:30', false);
    await t.evaluate((theme) => { document.documentElement.setAttribute('data-theme', theme); document.getElementById('confirmText').textContent = 'حذف شود؟'; document.getElementById('confirmModal').classList.add('open'); }, theme);
    await t.addScriptTag({ content: axe });
    const v = await t.evaluate(async () => (await window.axe.run('#confirmOkBtn', { runOnly: ['color-contrast'] })).violations.length);
    ok(`the delete button has enough contrast in the ${theme} theme`, v === 0);
  }

  await b.close();
})();
