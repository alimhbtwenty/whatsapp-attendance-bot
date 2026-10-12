// حالت‌های مرزی تردد (دور ۲ بازبینی): خروج تنها با ساعت همین لحظه، حذف رکورد ورود باز، صف آفلاین، شیفت شب بعد از نیمه‌شب
const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran', geolocation: { latitude: 35.7, longitude: 51.4 }, permissions: ['geolocation', 'clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-10-12T08:30:00+03:30') });
  await p.addInitScript(() => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1');
    localStorage.setItem('geomat_companies_v2', JSON.stringify(['الف', 'ب']));
    localStorage.setItem('geomat_sites_v1', JSON.stringify({ 'الف': { lat: 35.7, lng: 51.4, radius: 200, acc: 10 } })); });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(800); await login(p);
  if (await p.locator('#confirmModal.open').count()) await p.click('#confirmModal [data-click*="false"]');
  const logs = () => p.evaluate(() => JSON.parse(localStorage.getItem('geomat_logs_v2') || '[]'));
  // آفلاین: ورود ثبت و در صف
  await ctx.setOffline(true);
  await p.evaluate(() => { selectedCompany = 'الف'; companyPickedManually = true; renderCompanies(); setAttendanceAction('in'); });
  await p.click('#inTimeRow .time-now-pill'); await p.waitForTimeout(1500);
  await p.evaluate(() => { executeSendWhatsApp(); }); await p.waitForTimeout(1500);
  await p.evaluate(() => { executeSendWhatsApp(); }); await p.waitForTimeout(800);
  ok('offline entry recorded once and queued once', (await logs()).length === 1 && await p.evaluate(() => getOutbox().length) === 1);
  await ctx.setOffline(false);
  // خروج تنها: ساعت همین لحظه، نه ۱۷:۰۰
  await p.evaluate(() => { selectedCompany = 'ب'; renderCompanies(); setAttendanceAction('out'); updatePreview(); });
  ok('exit-only starts at the current time', (await p.locator('#attendancePreview').innerText()).includes('خروج 08:30'));
  // حذف رکوردِ ورود باز → بنر و ورود باز هم بسته
  const openId = await p.evaluate(() => getOpenEntry().logId);
  await p.evaluate((id) => { deleteLogItem(id); }, openId); await p.waitForTimeout(300); await p.click('#confirmOkBtn'); await p.waitForTimeout(400);
  ok('deleting the open entry record clears the open entry', await p.evaluate(() => getOpenEntry() === null) && await p.locator('#openEntryBanner.show').count() === 0);
  // شیفت شب: ورود ۲۳:۰۰، خروج از بنر ۰۰:۳۰ فردا
  await p.clock.fastForward(14.5 * 3600e3);
  await p.evaluate(() => { setDateOffset(0); selectedCompany = 'الف'; renderCompanies(); setAttendanceAction('in'); });
  await p.click('#inTimeRow .time-now-pill'); await p.waitForTimeout(1500);
  await p.evaluate(() => { executeCopyText(); }); await p.waitForTimeout(1500);
  await p.clock.fastForward(1.5 * 3600e3); await p.waitForTimeout(1500);
  await p.click('#openEntryBanner button:first-child'); await p.waitForTimeout(500);
  await p.evaluate(() => { executeCopyText(); }); await p.waitForTimeout(1500);
  const L = await logs();
  ok('night shift closes the entry from the day before', L.some(l => l.company === 'الف' && l.inTime === '23:00' && l.outTime === '00:30' && l.durationMins === 90), JSON.stringify(L.map(l => [l.inTime, l.outTime])));
  ok('message on the new day greets and has no entry time', /^سلام، شب بخیر/.test(await p.evaluate(() => navigator.clipboard.readText())) && !(await p.evaluate(() => navigator.clipboard.readText())).includes('ورود'));
  ok('no errors', !errs.length, errs.join(';'));
  await b.close();
})();
