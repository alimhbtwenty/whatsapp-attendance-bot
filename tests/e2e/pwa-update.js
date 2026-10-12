// دور ۱۰: آپدیت وب‌اپ (PWA). کاربری که نسخه منتشرشده (main) را با Service Worker نصب کرده،
// باید بعد از انتشار نسخه جدید، خودِ نسخه جدید را ببیند (نه نسخه کش‌شده قدیمی)، کش قدیمی پاک شود و داده‌اش بماند.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);

(async () => {
  const cacheOf = (src) => (String(src).match(/CACHE_NAME = '([^']+)'/) || [])[1];
  let oldCache;
  try {
    oldCache = cacheOf(execSync('git show origin/main:sw.js', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch (e) {
    console.log('PASS skipped: origin/main is not available in this checkout');
    return;
  }
  const newCache = cacheOf(require('fs').readFileSync(path.join(ROOT, 'sw.js'), 'utf8'));
  if (oldCache === newCache) { console.log('PASS skipped: main already has this version (' + newCache + ')'); return; }
  // سرور خود تست: همان آدرس، اول فایل‌های نسخه قدیمی (main)، بعد فایل‌های همین build
  // (route پلی‌رایت درخواست‌های خود Service Worker را نمی‌بیند)
  let phase = 'old';
  const fs = require('fs');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
  const server = require('http').createServer((req, res) => {
    let file = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    if (file.includes('..')) { res.writeHead(403).end(); return; }
    let body = null;
    // نسخه قدیمی همه فایل‌هایش را از main می‌گیرد (مثلاً logo-geomatco.png که دیگر نیست؛ بدون آن نصب SW قدیمی شکست می‌خورد)
    if (phase === 'old') { try { body = execSync(`git show origin/main:${file}`, { cwd: ROOT, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) {} }
    if (body === null) { try { body = fs.readFileSync(path.join(ROOT, file)); } catch (e) { res.writeHead(404).end(); return; } }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }).end(body);
  });
  await new Promise(r => server.listen(0, 'localhost', r));
  const URL0 = `http://localhost:${server.address().port}`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, serviceWorkers: 'allow' });
  const p = await ctx.newPage(); p.setDefaultTimeout(20000);
  p.on('dialog', d => d.accept().catch(() => {})); // نسخه قدیمی prompt/alert داشت
  const waitCaches = async (pred) => { for (let i = 0; i < 80; i++) { if (pred(await p.evaluate(() => caches.keys()))) return true; await p.waitForTimeout(250); } return false; };
  await p.goto(URL0 + '/index.html');
  await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await waitCaches(k => k.includes(oldCache));
  await p.reload(); await p.waitForTimeout(500);
  await p.evaluate(() => localStorage.setItem('geomat_logs_v2', JSON.stringify([{ id: 1, type: 'attendance', company: 'کرانه', date: '۱۴۰۵/۰۷/۲۰', day: 'x', action: 'in', inTime: '08:00', outTime: null, text: 'ورود', durationMins: 0, durationText: '-' }])));
  const before = await p.evaluate(async () => ({ title: document.title, caches: await caches.keys(), controlled: !!navigator.serviceWorker.controller }));
  ok('the old version is installed and controls the page', before.controlled && before.caches.includes(oldCache), JSON.stringify(before));

  // ۲) نسخه جدید منتشر می‌شود (همان آدرس)
  phase = 'new';
  await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  await waitCaches(k => k.includes(newCache) && !k.includes(oldCache));
  await p.reload(); await p.waitForTimeout(800);
  const after = await p.evaluate(async () => ({ title: document.title, caches: await caches.keys(), lock: !!document.getElementById('appLock'), logs: JSON.parse(localStorage.getItem('geomat_logs_v2') || '[]').length }));
  ok('after the update the page is the new version', after.title === 'Geo Team' && after.lock, after.title);
  ok('the old cache is deleted', !after.caches.includes(oldCache), JSON.stringify(after.caches));
  ok('the new cache name matches sw.js', after.caches.includes(newCache));
  ok('stored data survives the update', after.logs === 1);
  await b.close();
  server.close();
})();
