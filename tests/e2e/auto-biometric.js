// درخواست مالک: «وقتی وارد برنامه میشی خودکار باید بیومتریک بیاد».
// با اثر انگشتِ روشن، باز شدن برنامه و قفل بعد از پس‌زمینه خودشان بیومتریک را می‌آورند؛ فقط یک بار (لغو = صفحه ورود)،
// و بعد از «خروج از حساب» دستی نه. پرونده فنیِ قفل هم با باز شدن، خودش بیومتریک می‌خواهد.
const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran' });
  const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    // کلیدهای بیومتریک در «Keystore» ساختگی که بین بارگذاری‌ها می‌ماند؛ __bioCancel = کاربر «لغو» می‌زند
    const NS = 'fake_bio';
    const load = () => JSON.parse(sessionStorage.getItem(NS) || '{}');
    const save = (s) => Storage.prototype.setItem.call(sessionStorage, NS, JSON.stringify(s));
    window.__bioPrompts = 0;
    window.AndroidBridge = {
      saveFile() {}, scheduleExitReminder() {}, cancelExitReminder() {}, notificationPermission: () => 'granted', requestNotificationPermission() {},
      bioStatus: () => 'available',
      bioEnrolled: (id) => !!load()[id],
      bioEnroll: (id, raw, cb) => { const s = load(); s[id] = raw; save(s); setTimeout(() => window.__geoBioDone(cb, true, ''), 10); },
      bioUnlock: (id, cb) => { window.__bioPrompts++; const cancel = sessionStorage.getItem('cancel') === '1'; setTimeout(() => window.__geoBioDone(cb, !cancel && !!load()[id], cancel ? 'لغو شد' : load()[id]), 10); },
      bioRemove: (id) => { const s = load(); delete s[id]; save(s); }
    };
  });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(700);
  ok('without biometric enrolled the app waits for the password', await p.evaluate(() => window.__bioPrompts === 0 && document.getElementById('appLock').classList.contains('open')));
  await login(p);
  await p.waitForSelector('#confirmModal.open'); await p.click('#confirmOkBtn'); await p.waitForTimeout(400); // «اثر انگشت روشن شود؟» → بله

  // باز شدن دوباره برنامه → بدون هیچ لمسی بیومتریک و ورود
  await p.reload(); await p.waitForTimeout(1200);
  ok('opening the app asks for biometrics by itself', await p.evaluate(() => window.__bioPrompts) === 1);
  ok('...and logs in', await p.evaluate(() => !!session && !document.getElementById('appLock').classList.contains('open')));

  // «لغو» → فقط یک بار؛ صفحه ورود می‌ماند و دکمه اثر انگشت هست
  await p.evaluate(() => Storage.prototype.setItem.call(sessionStorage, 'cancel', '1'));
  await p.reload(); await p.waitForTimeout(1500);
  ok('after cancel it does not ask again', await p.evaluate(() => window.__bioPrompts) === 1);
  ok('after cancel the login screen stays with the biometric button', await p.evaluate(() => document.getElementById('appLock').classList.contains('open') && document.getElementById('lockBioBtn').style.display === ''));
  await p.evaluate(() => Storage.prototype.setItem.call(sessionStorage, 'cancel', '0'));
  await p.click('#lockBioBtn'); await p.waitForTimeout(600);

  // خروج دستی از حساب → خودکار نمی‌پرسد
  await p.evaluate(() => logoutApp()); await p.waitForTimeout(800);
  ok('after a manual log-out it does not ask by itself', await p.evaluate(() => window.__bioPrompts) === 2 && await p.evaluate(() => document.getElementById('appLock').classList.contains('open')));
  await p.click('#lockBioBtn'); await p.waitForTimeout(600);

  // قفل بعد از ۵ دقیقه پس‌زمینه → خودش می‌پرسد
  const before = await p.evaluate(() => window.__bioPrompts);
  await p.evaluate(() => { hiddenAt = Date.now() - 6 * 60 * 1000; document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(800);
  ok('returning after 5+ minutes asks for biometrics by itself', await p.evaluate(() => window.__bioPrompts) === before + 1 && await p.evaluate(() => !!session));

  // پرونده فنیِ قفل → با باز کردن خودش بیومتریک
  const b2 = await p.evaluate(() => window.__bioPrompts);
  await p.click('#tabSupportBtn'); await p.click('#supportViewRow button:nth-child(2)'); await p.waitForTimeout(800);
  ok('opening the locked technical file asks for biometrics by itself', await p.evaluate(() => window.__bioPrompts) === b2 + 1 && await p.evaluate(() => techUnlocked()));
  await p.evaluate(() => lockTech(true)); await p.evaluate(() => renderInventory()); await p.waitForTimeout(600);
  ok('after the technical file locks again it asks once more', await p.evaluate(() => window.__bioPrompts) === b2 + 2);

  ok('no page errors', !errs.length, errs.join(';'));
  await b.close();
})();
