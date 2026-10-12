// بازبینی نهایی دور ۳: روی گوشی مشترک، خروجِ یک نفر نباید ورودِ نفر دیگر را ببندد
// (نه رکورد آرشیو او را، نه ورود باز و یادآوری او را)
const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const T1 = { name: 'تکنسین یک', phone: '09120000002', pw: 'tech-pass-22' };
const T2 = { name: 'تکنسین دو', phone: '09120000003', pw: 'tech-pass-33' };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه'])); } });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(600);
  await login(p);
  await p.evaluate(async ([a, c]) => { const team = getTeam(); for (const t of [a, c]) team.users.push(await makeAccount(t.name, t.phone, 'tech', t.pw, session.raw, sessionWho())); saveTeam(team); }, [T1, T2]);
  const record = async (action, h, m) => {
    await p.click('#tabAttendanceBtn');
    await p.evaluate(([a, hh, mm]) => {
      selectedCompany = 'کرانه'; renderCompanies(); setAttendanceAction(a);
      const id = a === 'in' ? 'in' : 'out';
      document.getElementById(id + 'Hour').value = hh; document.getElementById(id + 'Min').value = mm; updatePreview();
    }, [action, h, m]);
    await p.click('#floatingDock .dock-copy-btn'); await p.waitForTimeout(500);
  };

  await p.evaluate(() => lockApp(true)); await login(p, T1);
  await record('in', '08', '00');
  ok('technician 1 has an open entry', await p.evaluate(() => !!getOpenEntry()));

  await p.evaluate(() => lockApp(true)); await login(p, T2);
  ok('technician 2 does not see technician 1\'s open entry', await p.evaluate(() => getOpenEntry() === null && !document.getElementById('openEntryBanner').classList.contains('show')));
  await record('out', '23', '59');
  const logs = await p.evaluate(() => getLogs().map(l => ({ by: l.by && l.by.name, closedBy: l.closedBy && l.closedBy.name, inTime: l.inTime, outTime: l.outTime })));
  const t1rec = logs.find(l => l.by === 'تکنسین یک');
  ok('technician 2\'s exit does not close technician 1\'s record', t1rec && !t1rec.outTime && !t1rec.closedBy, JSON.stringify(logs));
  ok('technician 2 gets a record of their own', logs.some(l => l.by === 'تکنسین دو' && l.outTime === '23:59'));
  ok('technician 1\'s open entry is still there', await p.evaluate(() => { const o = JSON.parse(localStorage.getItem('geomat_open_entry_v1') || 'null'); return !!o && o.inTime === '08:00'; }));
  await p.evaluate(() => window.handleNotificationAction('exit')); await p.waitForTimeout(200);
  ok('the reminder button tells technician 2 it belongs to someone else', (await p.textContent('#toast')).includes('حساب دیگری'));

  await p.evaluate(() => lockApp(true)); await login(p, T1);
  await record('out', '16', '00');
  const mine = await p.evaluate(() => getLogs().find(l => l.by && l.by.name === 'تکنسین یک'));
  ok('technician 1\'s own exit still completes their record', mine.inTime === '08:00' && mine.outTime === '16:00' && mine.durationMins === 480);
  ok('...and closes their open entry', await p.evaluate(() => getOpenEntry() === null));

  ok('no page errors', !errs.length, errs.join(';'));
  await b.close();
})();
