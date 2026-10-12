// ورود با اثر انگشت در وب‌اپ: WebAuthn + PRF روی یک احراز هویت مجازی Chromium
const { chromium } = require('playwright');
const { login, ADMIN } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true } });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(800);
  ok('biometric available in this browser', await p.evaluate(() => Bio.available()));
  await login(p);
  // بعد از اولین ورود با رمز پیشنهاد می‌شود
  await p.waitForSelector('#confirmModal.open', { timeout: 5000 });
  await p.click('#confirmOkBtn'); await p.waitForTimeout(1500);
  const store = await p.evaluate(() => localStorage.getItem('geomat_bio_v1'));
  ok('biometric enrolled', await p.evaluate(() => Bio.enrolled(session.user.id)));
  ok('stored key is encrypted', !!store && !store.includes(ADMIN.pw) && /"wrapped":\{"v":1,"iv"/.test(store));
  await p.evaluate(() => lockApp(true)); await p.waitForTimeout(300);
  ok('lock screen offers biometric', await p.locator('#lockBioBtn').isVisible());
  await p.click('#lockBioBtn'); await p.waitForTimeout(1500);
  ok('biometric login works', await p.locator('#appLock.open').count() === 0 && await p.evaluate(() => !!session && session.user.phone === '09120000001'));
  await p.click('#tabSupportBtn'); await p.click('#supportViewRow button:nth-child(2)'); await p.waitForTimeout(300);
  await p.click('#techBioBtn'); await p.waitForTimeout(1500);
  ok('technical file unlocks with biometric', await p.evaluate(() => techUnlocked()));
  // حسگر کاربر را تأیید نکند: ورود نباید انجام شود
  await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
  await p.evaluate(() => lockApp(true)); await p.waitForTimeout(300);
  await p.click('#lockBioBtn'); await p.waitForTimeout(1500);
  ok('failed biometric does not log in', await p.locator('#appLock.open').count() === 1 && (await p.locator('#lockErr').innerText()).length > 0);
  await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: true });
  // غیرفعال کردن
  await login(p);
  await p.evaluate(() => openAccountPanel()); await p.waitForTimeout(300);
  await p.click('[data-click*="disableBiometric"]'); await p.waitForTimeout(300);
  ok('biometric can be turned off', !(await p.evaluate(() => Bio.enrolled(session.user.id))));
  ok('no errors', !errs.length, errs.join(';'));
  await b.close();
})();
