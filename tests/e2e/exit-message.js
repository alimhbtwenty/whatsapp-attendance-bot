const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const OUT = process.env.TEST_OUT || require('path').join(__dirname, '..', 'output');
require('fs').mkdirSync(OUT, { recursive: true });
const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+' '+x);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, timezoneId:'Asia/Tehran', geolocation:{latitude:35.7,longitude:51.4}, permissions:['geolocation','clipboard-read','clipboard-write'] });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.clock.install({ time: new Date('2026-10-12T08:30:00+03:30') });
  await p.addInitScript(() => { if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded','1'); localStorage.setItem('geomat_companies_v2', JSON.stringify(['الف','ب'])); localStorage.setItem('geomat_sites_v1', JSON.stringify({'الف':{lat:35.7,lng:51.4,radius:200,acc:10}})); } });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(1200); await login(p);
  const copy = async () => { await p.click('#floatingDock .dock-copy-btn'); await p.waitForTimeout(2000); return p.evaluate(() => navigator.clipboard.readText()); };
  await p.evaluate(() => { selectedCompany='الف'; renderCompanies(); setAttendanceAction('in'); });
  await p.click('#inTimeRow .time-now-pill'); await p.waitForTimeout(1200);
  let t = await copy(); ok('entry msg', /ورود 08:30/.test(t));
  await p.clock.fastForward(8*3600e3); // 16:30
  await p.reload(); await p.waitForTimeout(1200); await login(p);
  // default mode is 'both' (بازه کامل)
  await p.evaluate(() => { selectedCompany='الف'; renderCompanies(); updatePreview(); });
  await p.click('#outTimeRow .time-now-pill'); await p.waitForTimeout(500);
  t = await copy(); console.log('--- exit (both)\n'+t);
  ok('exit msg has no entry time', !/ورود/.test(t) && /خروج 16:30/.test(t));
  let L = await p.evaluate(() => JSON.parse(localStorage.getItem('geomat_logs_v2')));
  ok('one record closed', L.length===1 && L[0].outTime==='16:30', JSON.stringify(L.map(l=>[l.inTime,l.outTime])));
  // full period with no prior entry keeps both lines
  await p.evaluate(() => { selectedCompany='ب'; renderCompanies(); setAttendanceAction('both'); document.getElementById('inHour').value='10'; document.getElementById('inMin').value='00'; document.getElementById('outHour').value='12'; document.getElementById('outMin').value='00'; updatePreview(); });
  t = await p.locator('#attendancePreview').innerText(); ok('full period without entry keeps both', /ورود 10:00/.test(t) && /خروج 12:00/.test(t), t.replace(/\n/g,' | '));
  ok('no errors', !errs.length, errs.join(';'));
  await b.close();
})();
