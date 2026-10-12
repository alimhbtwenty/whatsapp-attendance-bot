// بازبینی نهایی دور ۲: فایل پشتیبان و فایل تیم متن ساده‌اند و تکنسین می‌تواند دستکاری‌شان کند.
// - بازگردانی پشتیبان توسط تکنسین آیتمی را حذف نمی‌کند (حذف فقط کار مدیر است)؛ نسخه با تاریخ آینده پذیرفته نمی‌شود
// - فایل تیمِ تکنسین: غیرفعال شدن تکنسین دیگر می‌رسد، ولی شماره/نام دیگران را نمی‌گیرد و حساب بی‌شماره نمی‌سازد
// - فایل تیم با شناسه یا شماره تکراری رد می‌شود
const { chromium } = require('playwright');
const { login, unlockTech, ADMIN } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const T1 = { name: 'تکنسین یک', phone: '09120000002', pw: 'tech-pass-22' };
const T2 = { name: 'تکنسین دو', phone: '09120000003', pw: 'tech-pass-33' };
const now = new Date().toISOString();

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran' });
  const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه'])); } });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(600);
  await login(p);
  await p.evaluate(async ([t1, t2, at]) => {
    const team = getTeam();
    for (const t of [t1, t2]) team.users.push(await makeAccount(t.name, t.phone, 'tech', t.pw, session.raw, sessionWho()));
    saveTeam(team);
    const d = { title: 'فایروال' };
    saveInventory({ schema: 2, companies: [], items: [{ id: 'i1', company: 'کرانه', section: 'access', data: d, secrets: {}, createdAt: at, updatedAt: at, history: [{ at, by: sessionWho(), action: 'create', data: d, secrets: {} }] }] });
  }, [T1, T2, now]);
  const adminWho = await p.evaluate(() => sessionWho());
  await p.evaluate(() => lockApp(true));
  await login(p, T1);

  // ---------- پشتیبان دستکاری‌شده ----------
  const forgedBackup = (versions) => p.evaluate(([vs]) => {
    const inv = getInventory();
    inv.items[0].history.push(...vs);
    const data = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('geomat_')) data[k] = localStorage.getItem(k); }
    data.geomat_inventory_v1 = JSON.stringify(inv);
    return replaceAppData(data);
  }, [versions]);
  await forgedBackup([{ at: new Date(Date.now() + 60000).toISOString(), by: adminWho, action: 'delete', data: { title: 'xx' }, secrets: {} }]);
  ok('a technician\'s restored backup cannot delete an item (even credited to the admin)', await p.evaluate(() => !getInventory().items[0].deleted && getInventory().items[0].data.title === 'فایروال'));
  await forgedBackup([{ at: '9999-01-01T00:00:00.000Z', by: adminWho, action: 'edit', data: { title: 'آینده' }, secrets: {} }]);
  ok('a version dated in the future is not accepted', await p.evaluate(() => getInventory().items[0].data.title === 'فایروال' && !getInventory().items[0].history.some(v => v.at.startsWith('9999'))));
  await forgedBackup([{ at: new Date(Date.now() + 1000).toISOString(), by: { id: 'x', name: 'x' }, action: 'edit', data: { title: 'ویرایش تکنسین' }, secrets: {} }]);
  ok('a normal edit version from a backup is still merged', await p.evaluate(() => getInventory().items[0].data.title === 'ویرایش تکنسین'));

  await forgedBackup([{ at: '\u00019999-01-01T00:00:00.000Z', by: adminWho, action: 'edit', data: { title: 'FORGED' }, secrets: {} }]);
  ok('a date with a hidden control character is not accepted either', await p.evaluate(() => getInventory().items[0].data.title !== 'FORGED'));

  // مدیر حذف می‌کند؛ پشتیبانِ تکنسین با یک ویرایشِ تازه‌تر نباید آن را برگرداند
  await p.evaluate(() => { const inv = getInventory(); const it = inv.items[0]; it.deleted = true; it.history.push({ at: new Date().toISOString(), by: { id: 'adm', name: 'مدیر' }, action: 'delete', data: it.data, secrets: {} }); saveInventory(inv); });
  await forgedBackup([{ at: new Date(Date.now() + 5000).toISOString(), by: { id: 'x', name: 'x' }, action: 'edit', data: { title: 'برگشته' }, secrets: {} }]);
  ok('a technician\'s backup cannot bring back an item the admin deleted', await p.evaluate(() => getInventory().items[0].deleted === true));

  // ---------- فایل تیمِ تکنسین ----------
  const importAs = async (users) => {
    const json = JSON.stringify({ app: 'geomat-attendance', kind: 'team', format: 1, team: { schema: 1, users, log: [] } });
    await p.evaluate(() => importTeamFileFromSession());
    await p.setInputFiles('#teamFileInput', { name: 'team.json', mimeType: 'application/json', buffer: Buffer.from(json) });
    await p.waitForTimeout(400);
    if (await p.locator('#vaultModal.open').count()) { await p.fill('#vaultPw1', T1.pw); await p.click('#vaultModalOk'); await p.waitForTimeout(1500); }
    if (await p.locator('#vaultModal.open').count()) await p.evaluate(() => resolveVaultModal(null));
  };
  const users = await p.evaluate(() => JSON.parse(JSON.stringify(getTeam().users)));
  const t2 = users.find(u => u.phone === T2.phone), me = users.find(u => u.phone === T1.phone), adm = users.find(u => u.role === 'admin');
  const extra = await p.evaluate(async () => [await makeAccount('بی‌شماره', undefined, 'tech', 'x-pass-123', session.raw, null), await makeAccount('مدیر تست', '09130000055', 'tech', 'x-pass-123', session.raw, null)]);
  delete extra[0].phone;
  await importAs([{ ...adm, active: false }, { ...t2, active: false }, me]);
  // فایل دوم: شماره و نامِ دیگران برای خودم، و حساب‌های تازه بی‌شماره یا با نام تکراری
  await importAs([adm, { ...me, phone: T2.phone, name: ADMIN.name }, ...extra]);
  const st = await p.evaluate(() => getTeam().users.map(u => ({ name: u.name, phone: u.phone, active: u.active, role: u.role })));
  ok('the admin\'s deactivation of a departed technician reaches this phone', st.find(u => u.phone === T2.phone).active === false, JSON.stringify(st));
  ok('a technician\'s file cannot deactivate the admin', st.find(u => u.role === 'admin').active === true);
  ok('a technician cannot take another user\'s phone number', st.filter(u => u.phone === T2.phone).length === 1 && st.some(u => u.phone === T1.phone));
  ok('a technician cannot take another user\'s name', st.filter(u => u.name === ADMIN.name).length === 1);
  ok('accounts without a phone are not added', !st.some(u => u.name === 'بی‌شماره'));

  // ---------- فایل خراب ----------
  const before = await p.evaluate(() => localStorage.getItem('geomat_team_v1'));
  await importAs([adm, me, { ...me }]);
  ok('a team file with a duplicate account is refused', await p.evaluate(() => localStorage.getItem('geomat_team_v1')) === before);

  ok('no page errors', !errs.length, errs.join(';'));
  await b.close();
})();
