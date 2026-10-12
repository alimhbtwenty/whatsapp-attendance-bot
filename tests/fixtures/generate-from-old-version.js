const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const V = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, timezoneId:'Asia/Tehran', geolocation:{latitude:35.7,longitude:51.4}, permissions:['geolocation','clipboard-read','clipboard-write'] });
  const p = await ctx.newPage(); p.setDefaultTimeout(5000);
  const log = []; p.on('pageerror', e => log.push('ERR ' + e.message));
  await p.clock.install({ time: new Date('2026-10-10T08:30:00+03:30') });
  await p.addInitScript(() => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded','1');
    localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه','هاستیدا']));
    localStorage.setItem('geomat_sites_v1', JSON.stringify({'کرانه':{lat:35.7,lng:51.4,radius:200,acc:10},'هاستیدا':{lat:35.75,lng:51.5,radius:200,acc:10}}));
    localStorage.setItem('geomat_user_name','تکنسین تست'); });
  await p.goto('http://localhost:8790/v' + V + '.html'); await p.waitForTimeout(1500);
  const copy = async () => { await p.evaluate(() => executeCopyText()); await p.waitForTimeout(2500); };
  const step = async (company, action, setup) => {
    await p.evaluate(([c, a, s]) => { selectedCompany = c; if (typeof companyPickedManually !== 'undefined') companyPickedManually = true; renderCompanies(); setAttendanceAction(a);
      if (s) { for (const [k, v] of Object.entries(s)) document.getElementById(k).value = v; }
      updatePreview(); }, [company, action, setup || null]);
    await copy();
  };
  await step('کرانه', 'in', { inHour: '08', inMin: '30' });
  await p.clock.fastForward(3.5 * 3600e3); // 12:00
  await step('کرانه', 'out', { outHour: '12', outMin: '00' });
  await p.clock.fastForward(3600e3); // 13:00
  await ctx.setGeolocation({ latitude: 35.75, longitude: 51.5 });
  await step('هاستیدا', 'in', { inHour: '13', inMin: '00' });
  await p.clock.fastForward(4.5 * 3600e3); // 17:30
  await step('هاستیدا', 'out', { outHour: '17', outMin: '30' });
  // next day: full period 09:00-16:00 (forgotten, entered later)
  await p.clock.fastForward(16 * 3600e3); // Sun 09:30
  await p.reload(); await p.waitForTimeout(1200);
  await step('کرانه', 'both', { inHour: '09', inMin: '00', outHour: '16', outMin: '00' });
  // support report
  await p.evaluate(() => { switchSystemMode('support'); selectedCompany = 'هاستیدا'; renderCompanies(); document.getElementById('supportActionsText').value = 'کانفیگ سوییچ و بکاپ'; updateSupportPreview(); });
  await copy();
  // chat
  await p.evaluate(() => { switchSystemMode('messenger'); document.getElementById('tgMessageInput').value = 'سلام تیم، تست به‌روزرسانی'; sendChatMessage(); });
  await p.waitForTimeout(500);
  // settings
  await p.evaluate(() => { if (typeof saveSettingField === 'function') saveSettingField('reminderTime', '18:30'); });
  // an open entry left without exit (today)
  await p.evaluate(() => switchSystemMode('attendance'));
  await step('هاستیدا', 'in', { inHour: '09', inMin: '30' });
  const dump = await p.evaluate(() => { const d = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('geomat_')) d[k] = localStorage.getItem(k); } return d; });
  const logs = JSON.parse(dump.geomat_logs_v2 || '[]');
  console.log(V, 'keys', Object.keys(dump).join(','), '| logs', logs.length, logs.map(l => `${l.type[0]}:${l.company}:${l.action}:${l.inTime}-${l.outTime}`).join(' '), log.join(' '));
  fs.writeFileSync(`${__dirname}/storage-v${V}.json`, JSON.stringify(dump, null, 1));
  await b.close();
})();
