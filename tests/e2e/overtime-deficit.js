const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const OUT = process.env.TEST_OUT || require('path').join(__dirname, '..', 'output');
require('fs').mkdirSync(OUT, { recursive: true });
const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+' '+x);
// مهر ۱۴۰۵: ۱ مهر = 2026-09-23 (چهارشنبه). امروز = ۲۰ مهر (دوشنبه 2026-10-12)
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, timezoneId:'Asia/Tehran' });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.clock.install({ time: new Date('2026-10-12T20:00:00+03:30') });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(800); await login(p);
  const res = await p.evaluate(() => {
    let id = 1;
    const rec = (iso, company, inT, outT) => { const d = isoToDate(iso); const j = dateToJalali(d);
      const mins = (parseHM(outT) - parseHM(inT) + 1440) % 1440;
      return { id: id++, type:'attendance', company, dateISO: iso, jy:j.jy, jm:j.jm, jd:j.jd, date:'', action:'both', inTime:inT, outTime:outT, durationMins: mins, durationText:'', text:'' }; };
    // first record: Sat 1405/07/18 = 2026-10-10
    const logs = [
      rec('2026-10-10','A','08:30','18:00'),   // Sat: OT 1:30 (0:30 before 9 + 1:00 after 17), def 0
      rec('2026-10-11','A','10:00','16:00'),   // Sun: def 2:00
      // Mon 10-12 (today): two sites with travel gap -> def 0
      rec('2026-10-12','A','09:00','12:00'), rec('2026-10-12','B','13:00','17:00'),
    ];
    localStorage.setItem('geomat_logs_v2', JSON.stringify(logs.reverse()));
    archiveCompanyFilter = 'all';
    let d = monthlyData();
    const out1 = { ot: d.overtime, def: d.deficit, absent: d.absentDays, days: Object.fromEntries(Object.values(d.balance).map(x=>[x.j.jd, [x.overtime,x.deficit,x.absent]])) };
    return out1;
  });
  console.log(JSON.stringify(res));
  ok('Sat 18: OT 90, def 0', JSON.stringify(res.days[18])==='[90,0,false]');
  ok('Sun 19: def 120', JSON.stringify(res.days[19])==='[0,120,false]');
  ok('Mon 20: travel gap no deficit', JSON.stringify(res.days[20])==='[0,0,false]');
  ok('no days before first record', !res.days[17]);
  // Thursday / Friday / absent / holiday / night: move clock to Sat 1405/07/25 = 2026-10-17
  await p.clock.setFixedTime(new Date('2026-10-17T20:00:00+03:30'));
  const r2 = await p.evaluate(() => {
    let id = 100;
    const rec = (iso, company, inT, outT) => { const d = isoToDate(iso); const j = dateToJalali(d);
      const mins = (parseHM(outT) - parseHM(inT) + 1440) % 1440;
      return { id: id++, type:'attendance', company, dateISO: iso, jy:j.jy, jm:j.jm, jd:j.jd, date:'', action:'both', inTime:inT, outTime:outT, durationMins: mins, durationText:'', text:'' }; };
    const logs = JSON.parse(localStorage.getItem('geomat_logs_v2'));
    logs.unshift(
      rec('2026-10-13','A','22:00','06:00'),  // Tue night: window 9-17 not covered -> def 480, OT 480
      rec('2026-10-15','A','09:00','15:00'),  // Thu: OT 60, def 0
      rec('2026-10-16','A','10:00','14:00'),  // Fri: OT 240
    );
    // Wed 10-14 absent -> def 480 ; Sat 10-17 holiday absent -> 0
    localStorage.setItem('geomat_logs_v2', JSON.stringify(logs));
    localStorage.setItem('geomat_settings_v1', JSON.stringify({ holidays: ['2026-10-17'] }));
    const d = monthlyData();
    renderMonthlyReport();
    return { days: Object.fromEntries(Object.values(d.balance).map(x=>[x.j.jd, [x.overtime,x.deficit,x.absent]])), ot: d.overtime, def: d.deficit, absent: d.absentDays,
      ui: [document.getElementById('reportOvertime').textContent, document.getElementById('reportDeficit').textContent, document.getElementById('reportAbsent').textContent] };
  });
  console.log(JSON.stringify(r2));
  ok('Tue night shift', JSON.stringify(r2.days[21])==='[480,480,false]');
  ok('Wed absent full deficit', JSON.stringify(r2.days[22])==='[0,480,true]');
  ok('Thu OT 60', JSON.stringify(r2.days[23])==='[60,0,false]');
  ok('Fri all OT', JSON.stringify(r2.days[24])==='[240,0,false]');
  ok('holiday absent not counted', !r2.days[25]);
  ok('totals', r2.ot === 90+480+60+240 && r2.def === 120+480+480 && r2.absent === 1, `${r2.ot} ${r2.def}`);
  // company filter hides balance
  const filt = await p.evaluate(() => { archiveCompanyFilter = 'A'; renderMonthlyReport(); const t = document.getElementById('reportDeficit').textContent; archiveCompanyFilter='all'; return t; });
  ok('filter hides deficit', filt === '—');
  // settings UI
  await p.click('#tabArchiveBtn'); await p.evaluate(() => renderSettings()); await p.waitForTimeout(400);
  ok('holiday chip shown', (await p.locator('#holidayList').innerText()).includes('۲۵'));
  await p.fill('#thuEndInput', '13:00'); await p.locator('#thuEndInput').dispatchEvent('change'); await p.waitForTimeout(200);
  const thu = await p.evaluate(() => monthlyData().balance[j2d(1405,7,23)]); ok('thu end setting applied', thu.overtime === 120, JSON.stringify(thu));
  // CSV content
  const csv = await p.evaluate(() => { let c=''; const orig = downloadFile; downloadFile = (n, content) => { c = content; return true; }; exportMonthlyCsv(); downloadFile = orig; return c; });
  ok('csv has absence + totals', csv.includes('غیبت') && csv.includes('کسر کار'), '');
  await p.screenshot({ path: OUT + '/ot.png', fullPage: true });
  ok('no errors', !errs.length, errs.join(';'));
  await b.close();
})();
