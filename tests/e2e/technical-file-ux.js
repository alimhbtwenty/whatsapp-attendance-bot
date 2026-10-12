// دور ۷ (پرونده فنی): جستجو در همه پرونده‌ها، رقم فارسی و ی/ک عربی در جستجو، راهنمای خالی،
// و اینکه ویرایش مقدار قدیمیِ بیرون از گزینه‌ها یا ارجاع به آیتم حذف‌شده را بی‌صدا عوض نکند
const { chromium } = require('playwright');
const { login, unlockTech } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const now = new Date().toISOString();
const item = (id, company, section, data, extra = {}) => ({ id, company, section, data, secrets: {}, createdAt: now, updatedAt: now, history: [{ at: now, by: { id: 'x', name: 'x' }, action: 'create', data, secrets: {} }], ...extra });

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, timezoneId: 'Asia/Tehran' });
  const p = await ctx.newPage(); p.setDefaultTimeout(10000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((inv) => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه', 'دور', 'آلفا']));
    localStorage.setItem('geomat_inventory_v1', JSON.stringify(inv));
  }, { schema: 2, companies: [], items: [
    item('h1', 'دور', 'hosts', { name: 'ESX-01', hypervisor: 'ESXi', ip: '192.168.10.5' }, { deleted: true }),
    item('s1', 'دور', 'servers', { name: 'سرور فايل', host: 'h1', os: 'Windows 2019' }),
    item('n1', 'کرانه', 'network', { kind: 'دامین', name: 'karaneh.local', range: '10.0.0.0/24' }),
    item('a1', 'آلفا', 'access', { title: 'فایروال', method: 'روش قدیمی', address: '10.0.0.1' })
  ] });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(600);
  await login(p);
  await p.click('#tabSupportBtn'); await p.click('#supportViewRow button:nth-child(2)');
  await unlockTech(p);
  await p.evaluate(() => { selectedCompany = ''; renderInventory(); });
  ok('with no company selected there is a hint, not a blank area', (await p.textContent('#invSections')).includes('یک شرکت را انتخاب کنید'));

  const chips = async () => p.$$eval('#invCompaniesGrid .comp-chip', els => els.map(e => e.dataset.company));
  await p.fill('#invSearchInput', '۱۰.۰.۰'); await p.waitForTimeout(150);
  const c1 = await chips();
  ok('search covers every company and accepts Persian digits', c1.length === 2 && c1.includes('کرانه') && c1.includes('آلفا'), JSON.stringify(c1));
  ok('a matching company shows how many items match', (await p.textContent('#invCompaniesGrid')).includes('۱'));
  await p.fill('#invSearchInput', 'سرور فایل'); await p.waitForTimeout(150);
  ok('Arabic ي in stored text matches Persian ی in the search', JSON.stringify(await chips()) === JSON.stringify(['دور']));
  await p.fill('#invSearchInput', 'هیچ‌چیز-نیست'); await p.waitForTimeout(150);
  ok('no match anywhere says so', (await p.textContent('#invCompaniesGrid')).includes('در هیچ پرونده‌ای پیدا نشد'));
  await p.fill('#invSearchInput', 'کرانه'); await p.waitForTimeout(150);
  await p.click('#invCompaniesGrid [data-company="کرانه"]'); await p.waitForTimeout(150);
  ok('searching a company name opens all its items', await p.locator('#invSections .inv-item').count() === 1);
  await p.fill('#invSearchInput', ''); await p.waitForTimeout(100);

  // ویرایش بدون دست زدن به فیلدها: مقدار قدیمی و ارجاع به میزبانِ حذف‌شده می‌ماند
  await p.evaluate(() => { selectedCompany = 'آلفا'; renderInventory(); openInvItemModal('access', 'a1'); });
  await p.evaluate(() => saveInvItem()); await p.waitForTimeout(400);
  ok('editing keeps a stored option that is not in the list', await p.evaluate(() => getInventory().items.find(i => i.id === 'a1').data.method) === 'روش قدیمی');
  await p.evaluate(() => { selectedCompany = 'دور'; renderInventory(); openInvItemModal('servers', 's1'); });
  ok('the deleted host is shown as (deleted) in the editor', (await p.textContent('#invItemForm')).includes('ESX-01 (حذف‌شده)'));
  await p.evaluate(() => saveInvItem()); await p.waitForTimeout(400);
  ok('editing keeps the link to a deleted host', await p.evaluate(() => getInventory().items.find(i => i.id === 's1').data.host) === 'h1');

  // ارجاع به آیتمی که اصلاً نیست (مثلاً بعد از بازگردانی ناقص) هم با ویرایش بی‌صدا پاک نشود
  await p.evaluate(() => { const inv = getInventory(); inv.items.find(i => i.id === 's1').data.host = 'missing-id'; saveInventory(inv); openInvItemModal('servers', 's1'); });
  ok('a link to a missing item is shown, not dropped', (await p.textContent('#invItemForm')).includes('(آیتم پیدا نشد)'));
  await p.evaluate(() => saveInvItem()); await p.waitForTimeout(400);
  ok('editing keeps a link to a missing item', await p.evaluate(() => getInventory().items.find(i => i.id === 's1').data.host) === 'missing-id');

  ok('no page errors', !errs.length, errs.join(';'));
  await b.close();
})();
