// درخواست مالک: در بخش ساپورت آرشیو، لمس یک گزارش آن را کامل در پاپ‌آپ نشان می‌دهد
const fs = require('fs');
const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const axePath = (() => { try { return require.resolve('axe-core/axe.min.js'); } catch (e) { return process.env.AXE_PATH; } })();

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran', bypassCSP: true });
  const p = await ctx.newPage(); p.setDefaultTimeout(10000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-10-12T12:00:00+03:30') });
  const LONG = 'پچ پنل ۱ رک ۴۲ نودهای ۱ تا ۱۶ تست شد و کابل‌های طبقه دوم برچسب خوردند؛ ' + 'جزئیات بیشتر. '.repeat(30);
  await p.addInitScript((LONG) => {
    window.__xss = undefined;
    if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1');
    localStorage.setItem('geomat_companies_v2', JSON.stringify(['میکرولب', 'گئومات']));
    const base = { date: '۱۴۰۵/۰۷/۲۰', day: 'دوشنبه', dateISO: '2026-10-12', jy: 1405, jm: 7, jd: 20, action: null, inTime: null, outTime: null, geo: null, durationMins: 0, durationText: '-', text: 'متن واتساپ' };
    localStorage.setItem('geomat_logs_v2', JSON.stringify([
      { ...base, id: 3, type: 'support', company: 'میکرولب', actions: LONG, pending: 'تعویض سوییچ هفته بعد', tech: '10.0.0.9', checklist: [{ item: 'بکاپ', done: true }, { item: 'آپدیت', done: false }], by: { id: 'x', name: 'علی' } },
      { ...base, id: 2, type: 'support', company: 'گئومات', actions: '<img src=x onerror="window.__xss=1">', pending: '', tech: '', checklist: null },
      { ...base, id: 1, type: 'attendance', company: 'گئومات', action: 'both', inTime: '09:00', outTime: '12:00', durationMins: 180, durationText: '3:00' }
    ]));
  }, LONG);
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(600);
  await login(p);
  await p.click('#tabArchiveBtn'); await p.waitForTimeout(200);
  ok('attendance cards are not pop-up buttons', await p.locator('#archiveStream .record-open-btn').count() === 0);
  await p.click('#archiveSecSup'); await p.waitForTimeout(200);
  ok('each support card opens a pop-up', await p.locator('#archiveStream .record-open-btn').count() === 2);

  await p.locator('#archiveStream .record-open-btn').first().click(); await p.waitForTimeout(300);
  const box = await p.textContent('#flowModalBox');
  ok('the pop-up opens with the full report, not the 30-character summary', await p.locator('#flowModal.open').count() === 1 && box.includes(LONG.trim()), String(box.length));
  ok('it shows company, person, pending work, technical info and the checklist', ['میکرولب', 'علی', 'تعویض سوییچ هفته بعد', '10.0.0.9', '✅ بکاپ', '⬜ آپدیت'].every(t => box.includes(t)));
  ok('technical info (IP) is shown left-to-right so it is not reversed', await p.locator('#flowModalBox .sup-rec-value[dir="ltr"]', { hasText: '10.0.0.9' }).count() === 1);
  ok('the pop-up is named for screen readers', await p.getAttribute('#flowModal', 'aria-label') === 'گزارش ساپورت');
  await p.addScriptTag({ content: fs.readFileSync(axePath, 'utf8') });
  const v = await p.evaluate(async () => (await window.axe.run('#flowModal', { resultTypes: ['violations'] })).violations.filter(x => ['serious', 'critical'].includes(x.impact)).map(x => x.id));
  ok('no serious accessibility problems in the pop-up', v.length === 0, v.join(','));
  await p.click('#flowModal .flow-main'); await p.waitForTimeout(200);
  ok('«بستن» closes it', await p.locator('#flowModal.open').count() === 0);

  await p.locator('#archiveStream .record-open-btn').nth(1).click(); await p.waitForTimeout(300);
  ok('HTML in a report is shown as text', await p.evaluate(() => window.__xss === undefined && !document.querySelector('#flowModalBox img')) && (await p.textContent('#flowModalBox')).includes('<img'));
  ok('the Android back button closes it', await p.evaluate(() => handleBack()) && await p.locator('#flowModal.open').count() === 0);

  // دکمه حذف کنار کارت هنوز فقط حذف می‌کند (پاپ‌آپ باز نمی‌شود)
  await p.locator('#archiveStream button[aria-label="حذف رکورد"]').first().click(); await p.waitForTimeout(200);
  ok('the delete button asks to delete and does not open the pop-up', await p.locator('#confirmModal.open').count() === 1 && await p.locator('#flowModal.open').count() === 0);
  await p.click('#confirmModal [data-click*="false"]');

  // قفل شدن برنامه پاپ‌آپ را می‌بندد
  await p.locator('#archiveStream .record-open-btn').first().click(); await p.waitForTimeout(200);
  await p.evaluate(() => lockApp(true)); await p.waitForTimeout(200);
  ok('locking the app closes the pop-up', await p.locator('#flowModal.open').count() === 0 && (await p.textContent('#flowModalBox')) === '');

  ok('no page errors', !errs.length, errs.join(';'));
  await b.close();
})();
