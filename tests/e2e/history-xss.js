const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const OUT = process.env.TEST_OUT || require('path').join(__dirname, '..', 'output');
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage(); p.setDefaultTimeout(6000);
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.addInitScript(() => { window.__xss = 0; if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded','1');
    localStorage.setItem('geomat_companies_v2', JSON.stringify(['X']));
    localStorage.setItem('geomat_inventory_v1', JSON.stringify({ schema:2, companies:[], items:[{ id:'a', company:'X', section:'users', data:{name:'n'}, secrets:{},
      history:[ null, 5, { at:'2026-10-12T00:00:00Z', by:{name:'<img src=x onerror=window.__xss=1>'}, action:'<img src=x onerror=window.__xss=2>', data:{name:'n'} } ] }] })); });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(500);
  await p.evaluate(async () => { switchSystemMode('support'); setSupportView('inventory'); document.getElementById('invSetupName').value='m'; setupAdmin(); });
  await p.fill('#vaultPw1','admin-pass-1'); await p.fill('#vaultPw2','admin-pass-1'); await p.click('#vaultModalOk'); await p.waitForTimeout(1500);
  await p.evaluate(() => { selectedCompany='X'; renderInventory(); openHistoryPanel('a'); openAuditPanel(''); });
  await p.waitForTimeout(300);
  const x = await p.evaluate(() => window.__xss); console.log((x === 0 && !errs.length ? 'PASS' : 'FAIL') + ' tampered history renders without script', x, errs.join(';'));
  await b.close();
})();
