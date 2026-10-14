const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const OUT = process.env.TEST_OUT || require('path').join(__dirname, '..', 'output');
require('fs').mkdirSync(OUT, { recursive: true });
const fs = require('fs');
const { login: appLogin, unlockTech } = require('../helpers/session');
const TECH = { name: 'رضا', phone: '09120000002', pw: 'tech-pass-1' };
const R=[]; const ok=(n,c,x='')=>{const l=(c?'PASS ':'FAIL ')+n+' '+x; console.log(l); R.push(l);};
async function mkPage(b, seed) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, timezoneId:'Asia/Tehran', permissions:['clipboard-read','clipboard-write'], acceptDownloads:true });
  const p = await ctx.newPage(); p.setDefaultTimeout(6000);
  p.errs = []; p.on('pageerror', e=>p.errs.push(e.message)); p.on('dialog', d=>{ p.errs.push('native dialog'); d.dismiss(); });
  await p.addInitScript((seed) => { if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded','1'); localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه'])); localStorage.setItem('geomat_user_name','نام‌تایپی'); for (const k in seed) localStorage.setItem(k, seed[k]); } window.__xss = 0; }, seed || {});
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(600);
  return p;
}
const pw = async (p, a, b) => { await p.fill('#vaultPw1', a); if (b !== undefined) await p.fill('#vaultPw2', b); await p.click('#vaultModalOk'); await p.waitForTimeout(1800); };
const lockLogin = async (p, phone, pass) => { await p.fill('#lockPhone', phone); await p.fill('#lockPw', pass); await p.click('#lockSubmit'); await p.waitForTimeout(1800); };
const openTech = async (p) => { await p.click('#tabSupportBtn'); await p.click('#supportViewRow button:nth-child(2)'); await p.waitForTimeout(200); };
const openAll = (p) => p.evaluate(() => document.querySelectorAll('#invSections details').forEach(d => d.open = true));
const add = async (p, sec, fields, secret) => {
  await p.evaluate((s) => { document.querySelector(`#invSections details[data-section="${s}"]`).open = true; }, sec); await p.click(`[data-add="${sec}"]`);
  for (const [k,v] of Object.entries(fields)) { const el = p.locator(`#invItemForm [name="inv_${k}"]`); if (await el.evaluate(e=>e.tagName)==='SELECT') await el.selectOption({label:v}); else await el.fill(v); }
  if (secret) await p.fill('#invItemForm [name="inv_password"]', secret);
  await p.click('#invItemSaveBtn'); await p.waitForTimeout(500);
};
(async () => {
  const b = await chromium.launch();
  // ---- legacy v1 data (preview build) to migrate
  const legacy = await (async () => { const p = await b.newPage(); await p.goto(BASE + '/index.html'); const r = await p.evaluate(async () => {
      const salt = b64.enc(crypto.getRandomValues(new Uint8Array(16))); const k = await derivePasswordKey('old-master-1', salt, 310000);
      const meta = { v:1, kdf:'PBKDF2-SHA256', iter:310000, salt, check: await encryptWith(k, 'geomat-vault-ok') };
      const inv = { schema:1, items:[{ id:'11111111-1111-4111-8111-111111111111', company:'کرانه', section:'remotes', data:{tool:'AnyDesk', title:'قدیمی', remoteId:'999'}, secrets:{ password: await encryptWith(k, 'legacy-pass') }, createdAt:'2026-10-10T08:00:00Z', updatedAt:'2026-10-10T08:00:00Z', updatedBy:'علی' }] };
      return { 'geomat_vault_meta_v1': JSON.stringify(meta), 'geomat_inventory_v1': JSON.stringify(inv) }; }); await p.close(); return r; })();

  // ===== Admin phone
  const A = await mkPage(b, legacy);
  ok('app locked before login', await A.locator('#appLock.open').count() === 1);
  await A.fill('#lockName', 'مدیر'); await A.fill('#lockPhone', '09120000001'); await A.fill('#lockPw', 'admin-pass-1'); await A.fill('#lockPw2', 'admin-pass-1');
  await A.click('#lockSubmit'); await A.waitForTimeout(1500);
  ok('migration prompt shown', await A.locator('#vaultModal.open').isVisible());
  await pw(A, 'wrong-old'); ok('wrong old master rejected', (await A.locator('#vaultModalError').innerText()).includes('اشتباه'));
  await pw(A, 'old-master-1');
  ok('legacy meta removed', await A.evaluate(() => localStorage.getItem('geomat_vault_meta_v1') === null));
  await openTech(A);
  ok('technical file needs re-auth after app login', !(await A.locator('#invMain').isVisible()) && await A.locator('[data-act="unlock-pw"]').count() === 1);
  await A.click('[data-act="unlock-pw"]'); await pw(A, 'wrong-pass'); ok('wrong re-auth rejected', (await A.locator('#vaultModalError').innerText()).includes('اشتباه'));
  await A.fill('#vaultPw1', 'admin-pass-1'); await A.click('#vaultModalOk'); await A.waitForTimeout(1500);
  ok('technical file opens after re-auth', await A.locator('#invMain').isVisible());
  await A.click('#invCompaniesGrid [data-company="کرانه"]'); await openAll(A);
  await A.click('[data-reveal$="|password"] >> nth=0'); await A.waitForTimeout(400);
  ok('legacy password readable after migration', (await A.locator('[data-secret-view] >> nth=0').innerText()) === 'legacy-pass');
  // admin adds tech
  await A.click('[data-act="users"]'); await A.fill('#newUserName', 'رضا'); await A.fill('#newUserPhone', '+98 912 000 0002'); await A.click('[data-user-add]'); await pw(A, 'tech-pass-1', 'tech-pass-1');
  ok('tech account created with normalized phone', await A.evaluate(() => getTeam().users.some(u => u.name === 'رضا' && u.role === 'tech' && u.phone === '09120000002')));
  await A.click('#invPanelModal .dock-copy-btn');
  await add(A, 'hosts', { name:'ESX01', hypervisor:'ESXi', ip:'10.0.0.10' }, 'esx-root');
  // new company file
  await A.click('text=➕ پرونده فنی جدید'); await A.fill('#invAskText', 'مشتری دور'); await A.click('#invAskOk'); await A.waitForTimeout(300);
  ok('new company file', (await A.locator('#invCompaniesGrid').innerText()).includes('مشتری دور'));
  await add(A, 'network', { kind:'ورک‌گروپ', name:'WORKGROUP' });
  // export team file + backup data
  const [dl] = await Promise.all([A.waitForEvent('download'), A.click('[data-act="export-team"]')]);
  const teamPath = OUT + '/team-file.json'; await dl.saveAs(teamPath);
  const teamFile = fs.readFileSync(teamPath, 'utf8');
  ok('team file has no plaintext', !teamFile.includes('admin-pass') && !teamFile.includes('tech-pass'));
  const store = await A.evaluate(() => { const d={}; for (let i=0;i<localStorage.length;i++){const k=localStorage.key(i); if(k.startsWith('geomat_')) d[k]=localStorage.getItem(k);} return d; });
  ok('no plaintext secrets stored', !JSON.stringify(store).match(/esx-root|legacy-pass|admin-pass|tech-pass/));

  // ===== Technician phone: same data (via backup) + team file
  const T = await mkPage(b, { 'geomat_inventory_v1': store['geomat_inventory_v1'] });
  ok('tech phone: setup screen until team file', (await T.locator('#appLockBody').innerText()).includes('ورود فایل تیم'));
  await T.setInputFiles('#teamFileInput', teamPath); await T.waitForTimeout(400);
  await lockLogin(T, '09120000002', 'bad-pass'); ok('tech wrong pw rejected', (await T.locator('#lockErr').innerText()).includes('اشتباه'));
  await lockLogin(T, '09999999999', 'tech-pass-1'); ok('unknown phone gets the same message', (await T.locator('#lockErr').innerText()).includes('شماره یا رمز اشتباه'));
  await lockLogin(T, '۰۹۱۲۰۰۰۰۰۰۲', 'tech-pass-1');
  ok('tech logged in', await T.locator('#appLock.open').count() === 0 && (await T.locator('#userNameHeader').innerText()) === 'رضا');
  await openTech(T); await unlockTech(T, 'tech-pass-1');
  ok('tech role shown', (await T.locator('#invAuthCard').innerText()).includes('تکنسین'));
  ok('tech has no admin tools', await T.locator('[data-act="users"],[data-act="audit"],[data-act="deleted"]').count() === 0);
  await T.click('#invCompaniesGrid [data-company="کرانه"]'); await openAll(T);
  await T.screenshot({ path: OUT + '/tech-view.png' });
  ok('tech has no delete/history buttons', await T.locator('[data-del],[data-history]').count() === 0);
  await T.click('details[data-section="hosts"] [data-reveal]'); await T.waitForTimeout(300);
  ok('tech can see password', (await T.locator('details[data-section="hosts"] [data-secret-view]').innerText()) === 'esx-root');
  // tech edits: change IP and password, and tries to blank a field
  await T.click('details[data-section="hosts"] [data-edit]');
  await T.fill('#invItemForm [name="inv_ip"]', '10.0.0.99'); await T.fill('#invItemForm [name="inv_password"]', 'tech-changed');
  await T.click('#invItemSaveBtn'); await T.waitForTimeout(400);
  const xssName = '<img src=x onerror="window.__xss=1">';
  await add(T, 'users', { name: xssName, username:'u1' });
  ok('xss not executed', await T.evaluate(() => window.__xss) === 0);
  // tech creates new company file
  await T.click('text=➕ پرونده فنی جدید'); await T.fill('#invAskText', 'شرکت تکنسین'); await T.click('#invAskOk'); await T.waitForTimeout(300);
  ok('tech can create company file', (await T.locator('#invCompaniesGrid').innerText()).includes('شرکت تکنسین'));
  ok('tech cannot delete via code', await T.evaluate(async () => { const id = getInventory().items[0].id; await deleteInvItem(id); return !getInventory().items[0].deleted; }));
  const techStore = await T.evaluate(() => localStorage.getItem('geomat_inventory_v1'));

  // ===== Back on admin phone with tech's data
  await A.evaluate((inv) => { localStorage.setItem('geomat_inventory_v1', inv); renderInventory(); }, techStore);
  ok('attendance/tech changes carry the logged-in name', JSON.parse(techStore).items.some(i => i.history.some(h => h.by && h.by.name === 'رضا' && h.by.id)));
  await A.click('#invCompaniesGrid [data-company="کرانه"]'); await openAll(A);
  await A.click('details[data-section="hosts"] [data-history]'); await A.waitForTimeout(300);
  const hist = await A.locator('#invPanelBody').innerText(); await A.screenshot({ path: OUT + '/history.png' });
  ok('history shows tech name + change', hist.includes('رضا') && hist.includes('10.0.0.10') && hist.includes('10.0.0.99') && hist.includes('عوض شد'), '');
  // reveal old password in history (oldest version index 0)
  await A.click('[data-ver-reveal$="|0"]'); await A.waitForTimeout(300);
  ok('admin sees previous password', (await A.locator('[data-ver-view$="|0"]').innerText()) === 'esx-root');
  // restore the first version
  await A.click('[data-restore$="|0"]'); await A.click('#confirmOkBtn'); await A.waitForTimeout(500);
  const host = await A.evaluate(() => getInventory().items.find(i => i.section === 'hosts'));
  ok('restore creates new version, keeps all', host.data.ip === '10.0.0.10' && host.history.length === 3 && host.history[2].action === 'restore');
  await A.click('#invPanelModal .dock-copy-btn');
  // audit log filter by person
  await A.click('[data-act="audit"]'); await A.click('[data-audit-who="رضا"]'); await A.waitForTimeout(200);
  const audit = await A.locator('#invPanelBody').innerText();
  ok('audit filtered by tech', audit.includes('ویرایش') && audit.includes('رضا') && !audit.includes('ساخت حساب مدیر'));
  await A.click('#invPanelModal .dock-copy-btn');
  // delete + restore from deleted list
  await openAll(A);
  await A.click('details[data-section="hosts"] [data-del]'); await A.click('#confirmOkBtn'); await A.waitForTimeout(300);
  ok('soft delete keeps data+history', await A.evaluate(() => { const h = getInventory().items.find(i => i.section === 'hosts'); return h.deleted && h.data.name === 'ESX01' && h.history.length === 4; }));
  await A.click('[data-act="deleted"]'); await A.click('[data-undelete^="item|"]'); await A.waitForTimeout(300);
  ok('undelete works', await A.evaluate(() => !getInventory().items.find(i => i.section === 'hosts').deleted));
  await A.click('#invPanelModal .dock-copy-btn');
  // deactivate tech -> tech login refused
  await A.click('[data-act="users"]'); await A.click('[data-user-toggle]'); await A.waitForTimeout(200);
  const teamNow = await A.evaluate(() => localStorage.getItem('geomat_team_v1'));
  await T.evaluate((t) => { localStorage.setItem('geomat_team_v1', t); lockApp(true); }, teamNow); await T.waitForTimeout(200);
  await lockLogin(T, '09120000002', 'tech-pass-1');
  ok('disabled tech cannot log in', (await T.locator('#lockErr').innerText()).includes('غیرفعال') && await T.locator('#appLock.open').count() === 1);
  // auto-lock on background
  await A.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });
  ok('technical file locks at once in background', await A.evaluate(() => !techUnlocked() && session !== null) && !(await A.locator('#invMain').isVisible()));
  // بیش از ۵ دقیقه در پس‌زمینه: کل برنامه قفل
  await A.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); hiddenAt = Date.now() - 6 * 60 * 1000; Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  ok('app locks after 5 min in background', await A.evaluate(() => session === null) && await A.locator('#appLock.open').count() === 1);
  // 5 wrong attempts throttle
  for (let i = 0; i < 5; i++) await lockLogin(A, '09120000001', 'nope' + i);
  ok('throttled', (await A.locator('#lockErr').innerText()).includes('۳۰'));
  await lockLogin(A, '09120000001', 'admin-pass-1');
  ok('correct password still blocked during wait', await A.locator('#appLock.open').count() === 1);
  await A.screenshot({ path: OUT + '/team-admin.png', fullPage: true });
  await T.screenshot({ path: OUT + '/team-tech.png', fullPage: true });
  ok('no errors', !A.errs.length && !T.errs.length, [...A.errs, ...T.errs].join(';'));
  console.log('\n' + R.filter(r => r.startsWith('FAIL')).length + ' failures');
  await b.close();
})();
