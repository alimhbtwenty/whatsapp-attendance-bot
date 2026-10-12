const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const OUT = process.env.TEST_OUT || require('path').join(__dirname, '..', 'output');
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport:{width:390,height:844}, isMobile:true, timezoneId:'Asia/Tehran' })).newPage(); p.setDefaultTimeout(8000);
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(600); await login(p);
  await p.click('#tabArchiveBtn'); await p.click('#settingsCard button[data-click*=addHoliday]'); await p.click('#jcalGrid .jcal-day >> nth=4'); await p.waitForTimeout(300);
  const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+' '+x);
  ok('holiday added from calendar', (await p.locator('#holidayList').innerText()).includes('۵ مهر'));
  await p.click('#holidayList button'); await p.waitForTimeout(300);
  ok('holiday removed', (await p.locator('#holidayList').innerText()).includes('ثبت نشده'));
  await p.locator('#settingsCard').screenshot({ path: OUT + '/settings.png' });
  await b.close();
})();
