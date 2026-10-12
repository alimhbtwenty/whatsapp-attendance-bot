// درخواست‌های مالک:
// - «فقط خروج» بدون ورود: پاپ‌آپ ساعت ورود؛ با واردکردنش پیام یک دوره کامل می‌شود؛ «بدون ورود ارسال کن» هم هست
// - ورودِ تازه بعد از خروجِ همان روز: پاپ‌آپ «بین دو حضور کجا بودید؟» با گزینه‌های آماده؛ فقط در آرشیو و اکسل، نه در پیام
// - دکمه «آزمایش اعلان» در تنظیمات (فقط اپ اندروید)
const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran', acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-10-12T18:30:00+03:30') });
  await p.addInitScript(() => {
    window.__bridge = [];
    window.AndroidBridge = { saveFile(n, m, c) { window.__saved = c; }, bioStatus: () => 'unavailable', bioEnrolled: () => false, scheduleExitReminder() {}, cancelExitReminder() {},
      notificationPermission: () => 'granted', requestNotificationPermission() {}, testNotification: () => window.__bridge.push('test'), openBatterySettings: () => window.__bridge.push('battery') };
    if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه'])); }
  });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(700);
  await login(p);
  const form = (a, inT, outT) => p.evaluate(([a, inT, outT]) => {
    selectedCompany = 'کرانه'; renderCompanies(); setAttendanceAction(a);
    if (inT) { document.getElementById('inHour').value = inT.slice(0, 2); document.getElementById('inMin').value = inT.slice(3); }
    if (outT) { document.getElementById('outHour').value = outT.slice(0, 2); document.getElementById('outMin').value = outT.slice(3); }
    updatePreview();
  }, [a, inT, outT]);
  const copy = async () => { await p.click('#tabAttendanceBtn'); await p.click('#floatingDock .dock-copy-btn'); await p.waitForTimeout(400); };
  const clip = () => p.evaluate(() => navigator.clipboard.readText());
  const logs = () => p.evaluate(() => getLogs());

  // ---------- خروج بدون ورود → لغو ----------
  await form('out', null, '17:00'); await copy();
  ok('exit without an entry opens the missing-entry pop-up', await p.locator('#flowModal.open #flowInTime').count() === 1);
  await p.click('#flowModal .lock-link'); await p.waitForTimeout(300);
  ok('cancel sends nothing', (await logs()).length === 0);

  // ---------- خروج بدون ورود → ساعت ورود بعد از خروج = خطا، بعد ۰۸:۳۰ ----------
  await form('out', null, '17:00'); await copy();
  await p.fill('#flowInTime', '18:00'); await p.click('#flowModal .flow-main'); await p.waitForTimeout(200);
  ok('an entry time after the exit is refused', (await p.textContent('#flowErr')).length > 0 && await p.locator('#flowModal.open').count() === 1);
  await p.fill('#flowInTime', '08:30'); await p.click('#flowModal .flow-main'); await p.waitForTimeout(700);
  let L = await logs();
  ok('with the entry time the record becomes a full period', L.length === 1 && L[0].action === 'both' && L[0].inTime === '08:30' && L[0].outTime === '17:00', JSON.stringify(L.map(l => [l.action, l.inTime, l.outTime])));
  const msg1 = await clip();
  ok('...and the message is a full-period message', msg1.includes('08:30') && msg1.includes('17:00'), msg1);

  // ---------- خروج بدون ورود → «بدون ورود ارسال کن» ----------
  await p.evaluate(() => { writeLogs([]); lastCommit = null; });
  await form('out', null, '16:00'); await copy();
  await p.click('#flowModal .flow-alt'); await p.waitForTimeout(700);
  L = await logs();
  ok('«send without entry» keeps it an exit-only record', L.length === 1 && L[0].action === 'out' && !L[0].inTime && L[0].outTime === '16:00');

  // ---------- خروجی که ورودش ثبت است → بدون پاپ‌آپ ----------
  await p.evaluate(() => { writeLogs([]); lastCommit = null; setOpenEntry(null); });
  await form('in', '08:00', null); await copy();
  await form('out', null, '12:00'); await copy();
  L = await logs();
  ok('an exit for a recorded entry asks nothing and completes it', await p.locator('#flowModal.open').count() === 0 && L.length === 1 && L[0].inTime === '08:00' && L[0].outTime === '12:00');

  // ---------- ورود تازه بعد از خروج همان روز → «کجا بودید؟» ----------
  await form('in', '13:15', null); await copy();
  ok('a new entry after an exit the same day asks where you were', await p.locator('#flowModal.open .flow-chip').count() === 3 && (await p.textContent('#flowModalBox')).includes('۱۲:۰۰'));
  await p.click('#flowModal .flow-chip >> nth=0'); await p.waitForTimeout(700);
  L = await logs();
  const g = L[0].gap;
  ok('the reason is stored on the new record', L.length === 2 && L[0].inTime === '13:15' && g && g.from === '12:00' && g.to === '13:15' && g.reason === 'در راه / ایاب و ذهاب', JSON.stringify(g));
  ok('the reason is not in the WhatsApp message', !(await clip()).includes('در راه'));
  await p.click('#tabArchiveBtn'); await p.waitForTimeout(200);
  ok('the archive shows the reason', (await p.textContent('#archiveStream')).includes('در راه / ایاب و ذهاب'));
  const csv = await p.evaluate(() => { exportFilteredExcel(); return window.__saved || ''; });
  ok('the Excel export has the reason', csv.split('\n')[0].includes('بین دو حضور') && csv.includes('12:00-13:15 در راه / ایاب و ذهاب'));

  // متن دلخواه
  await form('out', null, '15:00'); await copy();
  await form('in', '15:40', null); await copy();
  await p.fill('#flowGapText', 'جلسه با مشتری'); await p.click('#flowModal .flow-custom button'); await p.waitForTimeout(700);
  ok('a typed reason is stored', (await logs())[0].gap && (await logs())[0].gap.reason === 'جلسه با مشتری');

  // رد شدن
  await form('out', null, '16:30'); await copy();
  await form('in', '17:00', null); await copy();
  await p.click('#flowModal .lock-link'); await p.waitForTimeout(700);
  ok('skipping still records the entry without a reason', (await logs())[0].inTime === '17:00' && !(await logs())[0].gap);

  // ---------- آزمایش اعلان ----------
  await p.click('#tabArchiveBtn'); await p.waitForTimeout(200);
  ok('the notification test row shows in the Android app', await p.locator('#notifTestRow').isVisible());
  await p.click('#notifTestRow button >> nth=0'); await p.click('#notifTestRow button >> nth=1');
  ok('the test and battery buttons call the bridge', JSON.stringify(await p.evaluate(() => window.__bridge)) === '["test","battery"]');

  ok('no page errors', !errs.length, errs.join(';'));
  await b.close();
})();
