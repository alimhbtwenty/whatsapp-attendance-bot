const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const OUT = process.env.TEST_OUT || require('path').join(__dirname, '..', 'output');
require('fs').mkdirSync(OUT, { recursive: true });
// وضع عکس مالک: ورودهای 1.2 + خروج‌های جدا (1.2 خروج را رکورد جدا با inTime ثبت می‌کرد)
const base = { type:'attendance', date:'۱۴۰۵/۰۷/۱۹', day:'یکشنبه', dateISO:'2026-10-11', jy:1405, jm:7, jd:19, durationMins:0, durationText:'-', actions:'', pending:'', tech:'', checklist:null };
const rec = (id, company, action, inTime, outTime, mins, geo) => ({ ...base, id, company, action, inTime, outTime,
  geo: geo ? {lat:35.7,lng:51.4,acc:10} : null, durationMins: mins||0, durationText: mins ? `${Math.floor(mins/60)}:${String(mins%60).padStart(2,'0')}` : '-',
  text: `#${company}\n${outTime && action!=='in' ? 'خروج '+outTime : 'ورود '+inTime}` });
const logs = [
  { ...rec(1760100000200, 'صدف', 'out', '22:00', '06:00', 480), dateISO:'2026-10-11' },
  { ...rec(1760100000100, 'صدف', 'in', '22:00', null, 0, true), dateISO:'2026-10-10' },
  rec(1760200000500, 'گئومات', 'in', '17:41', null, 0, true),
  rec(1760200000400, 'هاستیدا', 'out', '15:49', '17:13', 84),
  rec(1760200000300, 'هاستیدا', 'in', '15:49', null, 0, true),
  rec(1760200000200, 'کرانه', 'out', '09:37', '15:23', 346),
  rec(1760200000100, 'کرانه', 'in', '09:37', null, 0, true),
];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, timezoneId:'Asia/Tehran', geolocation:{latitude:35.7,longitude:51.4}, permissions:['geolocation'] });
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.clock.install({ time: new Date('2026-10-12T10:00:00+03:30') });
  await p.addInitScript(l => { if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded','1'); localStorage.setItem('geomat_logs_v2', JSON.stringify(l)); localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه','هاستیدا','گئومات','صدف'])); } }, logs);
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(1200);
  const get = () => p.evaluate(() => JSON.parse(localStorage.getItem('geomat_logs_v2')));
  let L = await get();
  console.log('records after load:', L.length, L.map(l => `${l.company} ${l.inTime}-${l.outTime||'?'} ${l.durationText}`).join(' | '));
  const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+' '+x);
  ok('split v1.2 stays merged into one record each', L.length === 4);
  const total = L.reduce((s,l)=>s+(l.durationMins||0),0); ok('total minutes unchanged', total === 910, String(total));
  await p.reload(); await p.waitForTimeout(1000); const L2 = await get(); ok('second run changes nothing', JSON.stringify(L2)===JSON.stringify(L));
  await p.click('#tabArchiveBtn'); await p.waitForTimeout(600); await p.screenshot({path: OUT + '/legacy.png', fullPage:true});
  ok('night shift merged', L.filter(l=>l.company==='صدف').length===1 && L.find(l=>l.company==='صدف').outTime==='06:00'); ok('no errors', !errs.length, errs.join(';')); await b.close();
})();
