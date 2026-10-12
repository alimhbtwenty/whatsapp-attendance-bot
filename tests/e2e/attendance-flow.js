const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const OUT = process.env.TEST_OUT || require('path').join(__dirname, '..', 'output');
require('fs').mkdirSync(OUT, { recursive: true });
const A = { latitude: 35.7000, longitude: 51.4000 }, B = { latitude: 35.7500, longitude: 51.5000 };
const results = []; const ok = (name, cond, extra='') => { console.log((cond?'PASS ':'FAIL ')+name+' '+extra); results.push(`${cond?'PASS':'FAIL'} ${name} ${extra}`); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:2,
    timezoneId:'Asia/Tehran', locale:'fa-IR', geolocation:A, permissions:['geolocation','clipboard-read','clipboard-write'] });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
  await page.clock.install({ time: new Date('2026-10-12T08:30:00+03:30') });
  await page.goto(BASE + '/index.html'); await page.waitForTimeout(1500); await login(page);
  await page.screenshot({ path: `${OUT}/01-start.png`, fullPage:false });
  if (await page.locator('#userModal.open').count()) { await page.fill('#userNameInput','تست'); await page.locator('#userModal button').first().click(); }
  const addSite = async (name, geo) => {
    await ctx.setGeolocation(geo);
    await page.evaluate(() => openAddModal()); await page.fill('#modalProjectInput', name);
    await page.click('#addProjectBtn'); await page.waitForTimeout(1500);
  };
  // پاپ‌آپ «بین دو حضور کجا بودید؟» (ورود تازه بعد از خروج همان روز) → اولین گزینه
  let gapAsked = 0;
  const copy = async () => {
    await page.click('#floatingDock .dock-copy-btn');
    const chip = await page.waitForSelector('#flowModal.open .flow-chip', { timeout: 1500 }).catch(() => null);
    if (chip) { gapAsked++; await page.click('#flowModal .flow-chip >> nth=0'); }
    await page.waitForTimeout(2000); return page.evaluate(() => navigator.clipboard.readText());
  };
  const logs = () => page.evaluate(() => JSON.parse(localStorage.getItem('geomat_logs_v2')||'[]'));

  await addSite('کارگاه الف', A);
  ok('site A added', (await page.evaluate(() => Object.keys(getSites()))).includes('کارگاه الف'));
  // entry now at A
  await page.evaluate(() => setAttendanceAction('in'));
  await page.click('#inTimeRow .time-now-pill'); await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/02-entry.png` });
  let t = await copy(); console.log('--- msg1\n'+t);
  ok('first msg greeting', t.startsWith('سلام، صبح بخیر')); ok('first msg has weekday', /دوشنبه/.test(t));
  ok('no maps link', !/maps|http/.test(t)); ok('entry time', /ورود 08:30/.test(t));
  ok('1 record', (await logs()).length === 1);

  // exit at 12:45
  await page.clock.fastForward(4*3600e3 + 15*60e3);
  await page.evaluate(() => setAttendanceAction('out'));
  await page.click('#outTimeRow .time-now-pill'); await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/03-exit.png` });
  t = await copy(); console.log('--- msg2\n'+t);
  ok('exit no greeting', !/سلام/.test(t) && !/دوشنبه/.test(t)); ok('exit no duration', !/مدت/.test(t)); ok('exit time', /خروج 12:45/.test(t));
  let L = await logs(); ok('still 1 record after exit (merged)', L.length === 1, JSON.stringify(L.map(l=>l.text)));

  // second site B, entry 13:00, then exit 17:10
  await page.clock.fastForward(15*60e3);
  await addSite('کارگاه ب', B);
  await page.evaluate(() => setAttendanceAction('in'));
  await page.click('#inTimeRow .time-now-pill'); await page.waitForTimeout(1500);
  t = await copy(); console.log('--- msg3\n'+t);
  ok('second site entry no greeting', !/سلام/.test(t) && /#کارگاه_ب/.test(t));
  ok('second entry of the day asked where you were between the two', gapAsked === 1);
  await page.clock.fastForward(4*3600e3 + 10*60e3);
  await page.evaluate(() => setAttendanceAction('out'));
  await page.click('#outTimeRow .time-now-pill'); await page.waitForTimeout(800);
  t = await copy(); console.log('--- msg4\n'+t);
  L = await logs(); ok('2 records for 2 stays', L.length === 2, L.map(l=>l.text.replace(/\n/g,' | ')).join(' || '));

  // night shift next day: entry 22:00 day1? -> do: entry 22:00 today at A, exit 06:00 tomorrow
  await page.clock.fastForward(4*3600e3 + 50*60e3); // 22:00
  await ctx.setGeolocation(A);
  await page.evaluate(() => setAttendanceAction('in'));
  await page.click('#inTimeRow .time-now-pill'); await page.waitForTimeout(1500);
  t = await copy(); console.log('--- msg5\n'+t);
  ok('night entry auto-picks A', /#کارگاه_الف/.test(t));
  await page.clock.fastForward(8*3600e3); // 06:00 next day
  await page.evaluate(() => { setDateOffset(0); setAttendanceAction('out'); });
  await page.click('#outTimeRow .time-now-pill'); await page.waitForTimeout(800);
  t = await copy(); console.log('--- msg6\n'+t);
  ok('next-day first msg greeting', t.startsWith('سلام، صبح بخیر'));
  L = await logs(); ok('night shift merged (3 records)', L.length === 3, L.map(l=>l.text.replace(/\n/g,' | ')).join(' || '));

  // tabs smoke
  for (const [btn, shot] of [['#tabArchiveBtn','04-archive'],['#tabSupportBtn','05-support'],['#tabMessengerBtn','06-messenger']]) {
    await page.click(btn); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/${shot}.png` });
  }
  const chat = await page.locator('#tgChatStream').innerText();
  ok('reports posted in messenger', (chat.match(/ورود|خروج/g)||[]).length >= 6);
  // keyboard: shrink viewport
  await page.click('#tgMessageInput'); await page.setViewportSize({width:390,height:430}); await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/07-keyboard.png` });
  const box = await page.locator('#tgMessageInput').boundingBox();
  ok('input visible with keyboard', box && box.y + box.height <= 430, JSON.stringify(box));
  ok('no console errors', errors.length === 0, errors.join(' ; '));
  console.log(results.join('\n'));
  await browser.close();
})();
