// اسکرین‌شات همه صفحه‌ها برای دورهای بازبینی گرافیکی: node tools/screens.mjs <outdir> [base]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const { login, unlockTech } = createRequire(import.meta.url)('../tests/helpers/session.js');
const out = process.argv[2] || 'tests/output/screens';
const base = process.argv[3] || 'http://localhost:8765';
import { mkdirSync } from 'node:fs';
mkdirSync(out, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const seed = {
  geomat_companies_v2: JSON.stringify(['کرانه', 'هاستیدا', 'گئومات', 'صدف', 'شرکت با نام خیلی طولانی مهندسی']),
  geomat_sites_v1: JSON.stringify({ 'کرانه': { lat: 35.7, lng: 51.4, radius: 200, acc: 10 } }),
  geomat_open_entry_v1: JSON.stringify({ company: 'کرانه', dateISO: today, inTime: '08:30', logId: 1, ts: Date.now(), notified: false }),
  geomat_logs_v2: JSON.stringify([
    { id: 3, type: 'support', company: 'هاستیدا', date: '۱۴۰۵/۰۷/۲۰', day: 'دوشنبه', dateISO: today, jy: 1405, jm: 7, jd: 20, text: 'کانفیگ سوییچ', actions: 'کانفیگ سوییچ و بکاپ', pending: '', tech: '', durationMins: 0, durationText: '-' },
    { id: 2, type: 'attendance', company: 'هاستیدا', date: '۱۴۰۵/۰۷/۲۰', day: 'دوشنبه', dateISO: today, jy: 1405, jm: 7, jd: 20, action: 'both', inTime: '13:00', outTime: '17:30', durationMins: 270, durationText: '4:30', text: '#هاستیدا\nورود 13:00' },
    { id: 1, type: 'attendance', company: 'کرانه', date: '۱۴۰۵/۰۷/۲۰', day: 'دوشنبه', dateISO: today, jy: 1405, jm: 7, jd: 20, action: 'in', inTime: '08:30', outTime: null, durationMins: 0, durationText: '-', text: '#کرانه\nورود 08:30', geo: { lat: 35.7, lng: 51.4, acc: 9 } }])
};
const shots = [];
const browser = await chromium.launch();
for (const theme of ['dark', 'light']) for (const width of [360, 412]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, deviceScaleFactor: 1, timezoneId: 'Asia/Tehran' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(([s, t]) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); for (const k in s) localStorage.setItem(k, s[k]); localStorage.setItem('geomat_settings_v1', JSON.stringify({ theme: t })); }, [seed, theme]);
  await p.goto(base + '/index.html'); await p.waitForTimeout(600);
  const shot = async (name, full = true) => { const f = `${out}/${theme}-${width}-${name}.png`; await p.screenshot({ path: f, fullPage: full }); shots.push(f); };
  await shot('00-setup', false);
  await login(p);
  if (await p.locator('#confirmModal.open').count()) await p.click('#confirmModal [data-click*="false"]');
  for (const [tab, name] of [['#tabAttendanceBtn', '01-attendance'], ['#tabArchiveBtn', '03-archive'], ['#tabMessengerBtn', '04-messenger']]) {
    await p.click(tab); await p.waitForTimeout(300); await shot(name, name !== '04-messenger');
  }
  await p.click('#tabSupportBtn'); await p.waitForTimeout(300); await shot('02-support');
  await p.click('#supportViewRow button:nth-child(2)'); await p.waitForTimeout(300); await shot('05-techfile-locked', false);
  await unlockTech(p);
  await p.evaluate(() => { document.querySelectorAll('#invSections details').forEach(d => d.open = true); });
  await shot('06-techfile');
  await p.evaluate(() => openAccountPanel()); await p.waitForTimeout(300); await shot('07-account', false);
  await p.evaluate(() => { closeInvPanel(); lockApp(true); }); await p.waitForTimeout(200); await shot('08-login', false);
  console.log(theme, width, errs.length ? 'ERRORS ' + errs.join(';') : 'ok');
  await ctx.close();
}
await browser.close();
