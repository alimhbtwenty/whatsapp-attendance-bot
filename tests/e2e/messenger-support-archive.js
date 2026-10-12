// دور ۶ (کاربردی): پیام‌رسان، ساپورت و آرشیو
// - رکورد تردد متن فرم ساپورت را نمی‌گیرد؛ اکسل فقط برای ساپورت آن ستون‌ها را دارد و «ثبت‌کننده» دارد
// - فیلتر «👤» شخص روی اکسل و گزارش ماهانه هم اعمال می‌شود؛ اضافه‌کارِ چند نفر با هم جمع نمی‌شود
// - روی گوشی مشترک، پیامِ هر حساب فقط برای خودش «من» است
const { chromium } = require('playwright');
const { login, ADMIN } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const TECH = { name: 'تکنسین', phone: '09120000002', pw: 'tech-pass-22' };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran', acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const p = await ctx.newPage(); p.setDefaultTimeout(10000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه', 'دور'])); });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(600);
  await login(p);
  await p.evaluate(async (t) => { const team = getTeam(); team.users.push(await makeAccount(t.name, t.phone, 'tech', t.pw, session.raw, sessionWho())); saveTeam(team); }, TECH);

  // متن نیمه‌کاره در فرم ساپورت، بعد ثبت تردد
  await p.evaluate(() => {
    document.getElementById('supportActionsText').value = 'متن ساپورت نیمه‌کاره';
    document.getElementById('supportTechInfo').value = '10.0.0.1';
    selectedCompany = 'کرانه'; renderCompanies(); setAttendanceAction('both');
    document.getElementById('inHour').value = '09'; document.getElementById('inMin').value = '00';
    document.getElementById('outHour').value = '17'; document.getElementById('outMin').value = '00';
    updatePreview();
  });
  await p.click('#floatingDock .dock-copy-btn'); await p.waitForTimeout(500);
  const att = await p.evaluate(() => getLogs()[0]);
  ok('an attendance record does not take the support form text', att.type === 'attendance' && !att.actions && !att.tech);

  // گزارش ساپورت
  await p.click('#tabSupportBtn'); await p.waitForTimeout(200);
  await p.click('#floatingDock .dock-copy-btn'); await p.waitForTimeout(500);
  const sup = await p.evaluate(() => getLogs()[0]);
  ok('a support record keeps its own fields', sup.type === 'support' && sup.actions === 'متن ساپورت نیمه‌کاره' && sup.tech === '10.0.0.1');
  ok('support reports are not posted to the messenger (ADR-0001 item 7)', await p.evaluate(() => getChatMessages().filter(m => m.channel === 'attendance').length === 1 && !getChatMessages().some(m => m.text.includes('متن ساپورت'))));

  // رکورد قدیمی تردد که متن ساپورت داشت + رکوردهای تکنسین روی همین گوشی
  await p.evaluate(() => {
    const logs = getLogs();
    const j = dateToJalali(new Date()); const iso = toISODate(new Date());
    logs.push({ id: 5, type: 'attendance', company: 'دور', date: 'x', day: 'x', dateISO: iso, jy: j.jy, jm: j.jm, jd: j.jd, action: 'both', inTime: '08:00', outTime: '20:00', durationMins: 720, durationText: '12:00', text: 't', actions: 'نشت قدیمی', tech: 'نشت', pending: '', by: { id: 'tech-x', name: 'تکنسین' } });
    writeLogs(logs);
    archivePersonFilter = 'all'; archiveCompanyFilter = 'all';
  });
  await p.click('#tabArchiveBtn'); await p.waitForTimeout(300);
  ok('the admin sees a person filter', await p.locator('#archiveCompanyFilters .filter-chip', { hasText: '👤' }).count() === 2);
  ok('overtime is not mixed across people', await p.evaluate(() => monthlyData().balance === null && document.getElementById('reportOvertime').textContent === '—'));

  const dl = async (fn) => { const [d] = await Promise.all([p.waitForEvent('download'), p.evaluate(fn)]); return require('fs').readFileSync(await d.path(), 'utf8'); };
  const all = await dl(() => exportFilteredExcel());
  ok('the Excel export has a «ثبت‌کننده» column', all.split('\n')[0].includes('ثبت‌کننده') && all.includes('"تکنسین"'));
  ok('old attendance rows do not leak support text into Excel', !all.includes('نشت قدیمی'));

  await p.locator('#archiveCompanyFilters .filter-chip', { hasText: '👤 تکنسین' }).click(); await p.waitForTimeout(200);
  const one = await dl(() => exportFilteredExcel());
  ok('the person filter applies to the Excel export', one.trim().split('\n').length === 2 && one.includes('"دور"'));
  ok('the person filter applies to the monthly report', await p.evaluate(() => { const d = monthlyData(); return d.total === 720 && d.balance !== null; }));

  // پیام‌رسان روی گوشی مشترک
  await p.click('#tabMessengerBtn'); await p.waitForTimeout(200);
  await p.fill('#tgMessageInput', 'سلام از مدیر'); await p.click('#tgSendBtn'); await p.waitForTimeout(200);
  ok('the admin\'s message is «mine» for the admin', await p.locator('.tg-bubble-row.mine', { hasText: 'سلام از مدیر' }).count() === 1);
  await p.evaluate(() => lockApp(true));
  await login(p, TECH);
  await p.click('#tabMessengerBtn'); await p.waitForTimeout(200);
  ok('on a shared phone the admin\'s message is not «mine» for the technician', await p.locator('.tg-bubble-row.other', { hasText: 'سلام از مدیر' }).count() === 1);
  ok('the welcome text matches what the messenger does', await p.evaluate(() => !buildDefaultChatMessages()[0].text.includes('ساپورت')));

  ok('no page errors', !errs.length, errs.join(';'));
  await b.close();
})();
