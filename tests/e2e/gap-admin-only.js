// درخواست مالک: «بین دو حضور» (کجا بودید؟) نباید برای همه تیم دیده شود؛ فقط مدیر، در آرشیو و اکسل.
// کسر کار مثل قبل حساب می‌شود (مسیر بین دو کارگاه کسر نیست، ADR-0001 بند ۱۰).
const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const TECH = { name: 'تکنسین یک', phone: '09120000002', pw: 'tech-pass-22' };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.install({ time: new Date('2026-10-12T20:00:00+03:30') }); // دوشنبه، بعد از همه ترددهای تست
  await p.addInitScript(() => {
    window.__saved = '';
    if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1');
    localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه', 'صدف']));
    localStorage.setItem('geomat_sites_v1', JSON.stringify({ 'کرانه': { lat: 35.7, lng: 51.4, radius: 200, acc: 10 }, 'صدف': { lat: 35.7, lng: 51.4, radius: 200, acc: 10 } }));
  });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(600);
  await login(p);
  await p.evaluate(async (t) => { const team = getTeam(); team.users.push(await makeAccount(t.name, t.phone, 'tech', t.pw, session.raw, sessionWho())); saveTeam(team); }, TECH);
  // اکسل در مرورگر دانلود می‌شود؛ متنش برای بررسی نگه داشته می‌شود
  const excel = () => p.evaluate(() => { let out = ''; const orig = window.downloadFile; window.downloadFile = (n, c) => { out = c; return true; }; try { exportFilteredExcel(); } finally { window.downloadFile = orig; } return out; });
  const record = async (company, action, inT, outT) => {
    await p.click('#tabAttendanceBtn');
    await p.evaluate(([c, a, i, o]) => {
      selectedCompany = c; renderCompanies(); setAttendanceAction(a);
      if (i) { document.getElementById('inHour').value = i.slice(0, 2); document.getElementById('inMin').value = i.slice(3); }
      if (o) { document.getElementById('outHour').value = o.slice(0, 2); document.getElementById('outMin').value = o.slice(3); }
      updatePreview();
    }, [company, action, inT, outT]);
    await p.click('#floatingDock .dock-copy-btn'); await p.waitForTimeout(500);
  };

  // تکنسین: کرانه ۰۹:۰۰ تا ۱۳:۰۰، بعد صدف از ۱۳:۴۰ («در راه»)
  await p.evaluate(() => lockApp(true)); await login(p, TECH);
  await record('کرانه', 'both', '09:00', '13:00');
  await record('صدف', 'both', '13:40', '17:00');
  if (await p.locator('#flowModal.open .flow-chip').count()) { await p.click('#flowModal .flow-chip >> nth=0'); await p.waitForTimeout(600); }
  const gap = await p.evaluate(() => (getLogs().find(l => l.gap) || {}).gap);
  ok('the gap reason is still stored on the record', gap && gap.from === '13:00' && gap.to === '13:40' && gap.reason === 'در راه / ایاب و ذهاب', JSON.stringify(gap));
  ok('the reason is not in the WhatsApp message', !(await p.evaluate(() => navigator.clipboard.readText())).includes('در راه'));

  await p.click('#tabArchiveBtn'); await p.waitForTimeout(200);
  ok('a technician does not see the gap line in the archive', await p.locator('#archiveStream .archive-gap').count() === 0 && !(await p.textContent('#archiveStream')).includes('در راه'));
  const techCsv = await excel();
  ok('a technician\'s Excel has no «بین دو حضور» column or reason', !techCsv.includes('بین دو حضور') && !techCsv.includes('در راه'), techCsv.split('\n')[0]);
  const techDeficit = await p.evaluate(() => { const d = monthlyData(); return d.balance ? d.deficit : null; });

  // مدیر روی همان گوشی
  await p.evaluate(() => lockApp(true)); await login(p);
  await p.click('#tabArchiveBtn'); await p.waitForTimeout(200);
  ok('the admin sees the gap line', await p.locator('#archiveStream .archive-gap', { hasText: 'در راه' }).count() === 1);
  const adminCsv = await excel();
  ok('the admin\'s Excel has the «بین دو حضور» column with the reason', adminCsv.split('\n')[0].includes('بین دو حضور') && adminCsv.includes('13:00-13:40 در راه / ایاب و ذهاب'));

  // کسر مثل قبل: ۹ تا ۱۷ با ۴۰ دقیقه مسیر بین دو کارگاه → کسر صفر
  ok('travel between two sites is still not a deficit', techDeficit !== null && techDeficit === 0, String(techDeficit));

  ok('no page errors', !errs.length, errs.join(';'));
  await b.close();
})();
