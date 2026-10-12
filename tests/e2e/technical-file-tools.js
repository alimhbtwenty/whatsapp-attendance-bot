// دور ۹ (پیشنهاد از رقبا): دکمه کپی برای فیلدهای فنی، پسورد تصادفی قوی و نمایش/پنهان پسورد در فرم.
// پسورد تصادفی هم مثل بقیه فقط رمزشده ذخیره می‌شود.
const { chromium } = require('playwright');
const { login, unlockTech } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const now = new Date().toISOString();

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const p = await ctx.newPage(); p.setDefaultTimeout(10000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه']));
  });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(600);
  await login(p);
  await p.evaluate((at) => saveInventory({ schema: 2, companies: [], items: [{ id: 'a1', company: 'کرانه', section: 'access', data: { title: 'فایروال', address: '10.0.0.1:8443', username: 'admin' }, secrets: {}, createdAt: at, updatedAt: at, history: [] }] }), now);
  await p.click('#tabSupportBtn'); await p.click('#supportViewRow button:nth-child(2)');
  await unlockTech(p);
  await p.evaluate(() => { selectedCompany = 'کرانه'; renderInventory(); document.querySelectorAll('#invSections details').forEach(d => d.open = true); });

  await p.click('[data-copy-field="a1|address"]'); await p.waitForTimeout(200);
  ok('the address copy button copies the address', await p.evaluate(() => navigator.clipboard.readText()) === '10.0.0.1:8443');
  ok('only technical (LTR) fields get a copy button', await p.locator('[data-copy-field="a1|title"]').count() === 0 && await p.locator('[data-copy-field="a1|username"]').count() === 1);

  await p.evaluate(() => openInvItemModal('access', 'a1'));
  await p.click('#invItemForm .inv-pw-tools button:first-child');
  const pw = await p.inputValue('#invItemForm input[name="inv_password"]');
  ok('the generator makes a 16-character password', pw.length === 16);
  ok('the generated password mixes cases, digits and symbols', /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw), pw);
  ok('every generated password has all four kinds', await p.evaluate(() => Array.from({ length: 300 }, () => randomPassword()).every(x => /[A-Z]/.test(x) && /[a-z]/.test(x) && /\d/.test(x) && /[^A-Za-z0-9]/.test(x))));
  ok('the generated password has no look-alike characters', !/[0O1lI]/.test(pw));
  const pw2 = await p.evaluate(() => randomPassword());
  ok('two generated passwords differ', pw2 !== pw);
  ok('the generated password is shown so it can be read', await p.getAttribute('#invItemForm input[name="inv_password"]', 'type') === 'text');
  await p.click('#invItemForm .inv-pw-tools button:last-child');
  ok('the eye button hides it again', await p.getAttribute('#invItemForm input[name="inv_password"]', 'type') === 'password');
  await p.evaluate(() => saveInvItem()); await p.waitForTimeout(600);
  const stored = await p.evaluate(() => localStorage.getItem('geomat_inventory_v1'));
  ok('the generated password is stored only encrypted', !stored.includes(pw) && await p.evaluate(async () => decryptWith(session.key, getInventory().items[0].secrets.password)) === pw);
  ok('the form is cleared after saving (no password left in the page)', !(await p.content()).includes(pw));

  ok('no page errors', !errs.length, errs.join(';'));
  await b.close();
})();
