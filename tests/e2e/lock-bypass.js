// دور ۵ (امنیت): صفحه ورود نباید دور زده شود.
// - فایل تیم ساختگی از صفحه ورود نباید حساب‌های گوشی را عوض کند (قبلاً مهاجم با یک فایل تیم که خودش در آن مدیر بود
//   وارد برنامه می‌شد و کلیدهای قفل‌شده تیم اصلی هم برای همیشه از بین می‌رفت)
// - فایل تیمِ همان تیم فقط بعد از ورود و با رمز خود کاربر وارد می‌شود؛ فایل تیم دیگر پذیرفته نمی‌شود
// - با صفحه قفل، صفحه پشت آن با کیبورد (Tab) هم در دسترس نیست
// - کارهای مدیر (فعال/غیرفعال کردن، رمز جدید) با صدا زدن مستقیم از حساب تکنسین انجام نمی‌شود
const { chromium } = require('playwright');
const { login, unlockTech, ADMIN } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const TECH = { name: 'تکنسین', phone: '09120000002', pw: 'tech-pass-22' };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran' });
  const p = await ctx.newPage(); p.setDefaultTimeout(10000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(600);
  await login(p);
  await p.click('#tabSupportBtn'); await p.click('#supportViewRow button:nth-child(2)');
  await unlockTech(p);
  // یک تکنسین و یک پسورد ذخیره‌شده با کلید تیم
  await p.evaluate(async (t) => {
    const team = getTeam();
    team.users.push(await makeAccount(t.name, t.phone, 'tech', t.pw, session.raw, sessionWho()));
    saveTeam(team);
    const inv = getInventory();
    inv.items.push({ id: 'sec1', company: 'کرانه', section: 'access', data: { title: 'سرور' }, secrets: { password: await encryptWith(session.key, 'S3cret!') }, history: [], createdAt: new Date().toISOString() });
    saveInventory(inv);
  }, TECH);
  const teamBefore = await p.evaluate(() => localStorage.getItem('geomat_team_v1'));

  // فایل تیم مهاجم: حساب مدیرِ خودش با کلید تیم تازه
  const evil = await p.evaluate(async () => {
    const acc = await makeAccount('مهاجم', '09130000009', 'admin', 'attacker-pw', crypto.getRandomValues(new Uint8Array(32)), null);
    return JSON.stringify({ app: BACKUP_APP_ID, kind: 'team', format: 1, team: { schema: 1, users: [acc], log: [] } });
  });
  // فایل تیمِ همان تیم (همان چیزی که مدیر برای گوشی تکنسین می‌گیرد)
  const sameTeam = await p.evaluate(() => JSON.stringify({ app: BACKUP_APP_ID, kind: 'team', format: 1, team: { schema: 1, users: getTeam().users, log: [] } }));

  // ---------- صفحه ورود ----------
  await p.evaluate(() => lockApp(true));
  ok('lock screen offers no team-file import once a team exists', await p.locator('#appLock [data-click*="openTeamFilePicker"]').count() === 0);
  await p.setInputFiles('#teamFileInput', { name: 'team.json', mimeType: 'application/json', buffer: Buffer.from(evil) });
  await p.waitForTimeout(400);
  if (await p.locator('#confirmModal.open').count()) await p.click('#confirmOkBtn');
  await p.waitForTimeout(400);
  ok('a team file cannot replace the accounts from the lock screen', await p.evaluate(() => localStorage.getItem('geomat_team_v1')) === teamBefore);
  await p.fill('#lockPhone', '09130000009'); await p.fill('#lockPw', 'attacker-pw'); await p.click('#lockSubmit'); await p.waitForTimeout(1500);
  ok('the attacker cannot log in', await p.evaluate(() => !session && document.getElementById('appLock').classList.contains('open')));

  // صفحه پشت قفل با کیبورد
  await p.evaluate(() => document.getElementById('lockPw').focus());
  let leaked = false;
  for (let i = 0; i < 25; i++) {
    await p.keyboard.press('Tab');
    if (await p.evaluate(() => document.activeElement && document.activeElement !== document.body && !document.getElementById('appLock').contains(document.activeElement))) { leaked = true; break; }
  }
  ok('keyboard focus stays inside the lock screen', !leaked);
  ok('the app behind the lock is inert', await p.evaluate(() => document.querySelector('.container').inert === true && document.getElementById('floatingDock').inert === true));

  // ---------- تکنسین ----------
  await login(p, TECH);
  ok('the app is usable again after login', await p.evaluate(() => document.querySelector('.container').inert === false));
  await p.evaluate(() => { const t = getTeam(); techUnlockedUntil = Date.now() + 60000; toggleUserActive(t.users[0].id); });
  await p.waitForTimeout(200);
  ok('a technician cannot disable the admin by calling the function', await p.evaluate(() => getTeam().users[0].active === true));
  await p.evaluate(() => { resetUserPassword(getTeam().users[0].id); });
  await p.waitForTimeout(200);
  ok('a technician gets no admin password-reset dialog', await p.locator('#vaultModal.open').count() === 0);
  await p.evaluate(() => { techUnlockedUntil = 0; });

  // فایل تیم دیگر، بعد از ورود هم پذیرفته نمی‌شود
  await p.evaluate(() => importTeamFileFromSession());
  await p.setInputFiles('#teamFileInput', { name: 'team.json', mimeType: 'application/json', buffer: Buffer.from(evil) });
  await p.waitForTimeout(400);
  if (await p.locator('#vaultModal.open').count()) { await p.fill('#vaultPw1', TECH.pw); await p.click('#vaultModalOk'); await p.waitForTimeout(1500); }
  if (await p.locator('#vaultModal.open').count()) await p.evaluate(() => resolveVaultModal(null));
  ok('a different team file is refused even when logged in', await p.evaluate(() => localStorage.getItem('geomat_team_v1')) === teamBefore);

  // همان تیم، با رمز درست: حساب‌ها به‌روز می‌شوند و گزارش تیم حفظ می‌شود
  const sameTeamPlus = await p.evaluate(async (s) => {
    const o = JSON.parse(s);
    o.team.users.push(await makeAccount('تکنسین دوم', '09120000003', 'tech', 'tech-pass-33', session.raw, null));
    return JSON.stringify(o);
  }, sameTeam);
  const logLen = await p.evaluate(() => getTeam().log.length);
  await p.evaluate(() => importTeamFileFromSession());
  await p.setInputFiles('#teamFileInput', { name: 'team.json', mimeType: 'application/json', buffer: Buffer.from(sameTeamPlus) });
  await p.waitForSelector('#vaultModal.open');
  await p.fill('#vaultPw1', 'wrong-password'); await p.click('#vaultModalOk'); await p.waitForTimeout(1500);
  ok('the same-team import asks for the user\'s own password', await p.locator('#vaultModal.open').count() === 1 && (await p.textContent('#vaultModalError')).length > 0);
  await p.fill('#vaultPw1', TECH.pw); await p.click('#vaultModalOk');
  await p.waitForFunction(() => getTeam().users.length === 3, null, { timeout: 15000 }).catch(() => {});
  const after = await p.evaluate(() => ({ n: getTeam().users.length, log: getTeam().log, still: !!session }));
  ok('a same-team file updates the accounts', after.n === 3);
  ok('the team log is kept and the import is appended', after.log.length === logLen + 1 && after.log[after.log.length - 1].action === 'team-import');
  ok('the stored password still opens with the team key', await p.evaluate(async () => decryptWith(session.key, getInventory().items.find(i => i.id === 'sec1').secrets.password)) === 'S3cret!');

  // گوشی تازه (بدون تیم) هنوز از صفحه ورود فایل تیم را می‌گیرد
  const p2 = await ctx.newPage();
  await p2.goto(BASE + '/index.html'); await p2.evaluate(() => localStorage.clear()); await p2.reload(); await p2.waitForTimeout(600);
  ok('a new phone still offers team-file import on the lock screen', await p2.locator('#appLock [data-click*="openTeamFilePicker"]').count() === 1);
  await p2.setInputFiles('#teamFileInput', { name: 'team.json', mimeType: 'application/json', buffer: Buffer.from(sameTeam) });
  await p2.waitForTimeout(500);
  await login(p2, TECH);
  ok('a technician logs in on the new phone with the team file', await p2.evaluate(() => session && session.user.phone === '09120000002'));

  ok('no page errors', !errs.length, errs.join(';'));
  await b.close();
})();
