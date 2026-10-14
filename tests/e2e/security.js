// تست‌های امنیتی: CSP، بررسی ایستای کد، XSS در همه متن‌های ذخیره‌شده، نقش‌ها با صدا زدن مستقیم توابع،
// فایل پشتیبان و فایل تیم دستکاری‌شده، و اینکه بازگردانی پشتیبان تاریخچه پرونده فنی را پاک نکند.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { login, unlockTech } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ROOT = path.join(__dirname, '..', '..');
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const X = '"><img src=x onerror="window.__xss=(window.__xss||0)+1"><script>window.__xss=99</script>';

// ---------- بررسی ایستا ----------
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const src = fs.readdirSync(path.join(ROOT, 'src/js')).map(f => fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')).join('\n');
ok('CSP allows only the bundled script', /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-[^']+'; /.test(html));
ok('no inline on* handlers in the page', !/\son(click|input|change|keydown|keyup|paste|blur|load|error|submit|focus|mouse\w*)\s*=/i.test(html.replace(/<script>[\s\S]*<\/script>/, '')));
ok('no eval / new Function / document.write / string timers', !/\beval\(|new Function\(|document\.write\(|set(Timeout|Interval)\(\s*['"`]/.test(src));
ok('no remote scripts or styles', !/<script[^>]+src=|<link[^>]+stylesheet/i.test(html));
ok('no plaintext password fields stored (code)', !/localStorage\.setItem\([^)]*(password|pw)\b/i.test(src));

(async () => {
  const b = await chromium.launch();
  const mk = async (seed) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran', acceptDownloads: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(8000);
    p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('dialog', d => { p.errs.push('native dialog'); d.dismiss(); });
    await p.addInitScript((s) => { window.__xss = 0; if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); for (const k in s) localStorage.setItem(k, s[k]); }, seed || {});
    await p.goto(BASE + '/index.html'); await p.waitForTimeout(700);
    return p;
  };

  // ---------- XSS در همه داده‌های ذخیره‌شده ----------
  const today = new Date().toISOString().slice(0, 10);
  const seed = {
    geomat_companies_v2: JSON.stringify([X, 'کرانه']),
    geomat_user_name: X,
    geomat_sites_v1: JSON.stringify({ [X]: { lat: 35.7, lng: 51.4, radius: 200, acc: 10 } }),
    geomat_logs_v2: JSON.stringify([{ id: 1, type: 'attendance', company: X, date: X, day: X, dateISO: today, jy: 1405, jm: 7, jd: 20, action: 'both', inTime: '08:00', outTime: '12:00', durationMins: 240, durationText: X, text: X, by: { id: X, name: X } },
      { id: 2, type: 'support', company: X, date: X, day: X, dateISO: today, jy: 1405, jm: 7, jd: 20, action: null, inTime: null, outTime: null, durationMins: 0, durationText: '-', text: X, actions: X, pending: X, tech: X, checklist: [{ text: X, done: true }] }]),
    geomat_chat_messages_v1: JSON.stringify([{ id: X, sender: X, text: X, room: 'general', ts: Date.now(), time: X }]),
    geomat_open_entry_v1: JSON.stringify({ company: X, dateISO: today, inTime: '08:00', logId: 1, ts: Date.now(), notified: false }),
    geomat_outbox_v1: JSON.stringify([{ id: X, type: 'attendance', text: X, ts: Date.now() }]),
    geomat_checklists_v1: JSON.stringify({ [X]: [{ text: X, done: false }] }),
    geomat_settings_v1: JSON.stringify({ reminderTime: X, workStart: X, theme: X, holidays: [X, today] }),
    geomat_inventory_v1: JSON.stringify({ schema: 2, companies: [{ id: 'c1', name: X, history: [{ at: X, by: { name: X }, action: X, name: X }] }],
      items: [{ id: 'i1', company: X, section: 'access', data: { title: X, method: X, address: X, username: X, note: X }, secrets: {}, history: [{ at: X, by: { id: X, name: X }, action: X, data: { title: X } }] }] })
  };
  const p = await mk(seed);
  await login(p);
  for (const tab of ['#tabAttendanceBtn', '#tabSupportBtn', '#tabArchiveBtn', '#tabMessengerBtn']) { await p.click(tab); await p.waitForTimeout(250); }
  await p.click('#tabSupportBtn'); await p.click('#supportViewRow button:nth-child(2)');
  await unlockTech(p);
  await p.evaluate((x) => { selectedCompany = x; renderInventory(); document.querySelectorAll('#invSections details').forEach(d => d.open = true); openHistoryPanel('i1'); }, X);
  await p.waitForTimeout(200);
  await p.evaluate(() => { closeInvPanel(); openAuditPanel(''); }); await p.waitForTimeout(200);
  await p.evaluate(() => { closeInvPanel(); openDeletedPanel(); openOutbox(); }); await p.waitForTimeout(200);
  await p.evaluate(() => { closeOutbox(); closeInvPanel(); });
  ok('stored XSS payloads never execute on any screen', await p.evaluate(() => window.__xss) === 0);
  ok('pages still render with hostile data', !p.errs.length, p.errs.join(';'));

  // ---------- نقش‌ها: تکنسین با صدا زدن مستقیم توابع مدیر ----------
  const team = await p.evaluate(async () => {
    const t = getTeam();
    t.users.push(await makeAccount('تکنسین', '09120000009', 'tech', 'tech-pass-1', session.raw, null));
    saveTeam(t);
    return localStorage.getItem('geomat_team_v1');
  });
  await p.evaluate(() => lockApp(true));
  await login(p, { phone: '09120000009', pw: 'tech-pass-1' });
  await p.click('#tabSupportBtn'); await p.click('#supportViewRow button:nth-child(2)');
  await unlockTech(p, 'tech-pass-1');
  const r = await p.evaluate(async () => {
    const before = localStorage.getItem('geomat_inventory_v1');
    const teamBefore = localStorage.getItem('geomat_team_v1');
    await deleteInvItem('i1'); openHistoryPanel('i1'); openAuditPanel(''); openDeletedPanel(); openUsersPanel(); exportTeamFile();
    await restoreVersion('i1|0'); restoreDeleted('item|i1'); toggleUserActive(getTeam().users[0].id);
    return { inv: localStorage.getItem('geomat_inventory_v1') === before, team: localStorage.getItem('geomat_team_v1') === teamBefore, panel: document.getElementById('invPanelModal').classList.contains('open') };
  });
  ok('technician cannot delete, restore, see history/audit or manage users even by calling functions', r.inv && r.team && !r.panel, JSON.stringify(r));

  // ---------- قفل‌ها ----------
  await p.evaluate(() => lockApp(true));
  const locked = await p.evaluate(async () => ({ secret: await readSecret('i1|password'), techOpen: techUnlocked(), admin: isAdmin() }));
  ok('nothing readable while locked', locked.secret === null && !locked.techOpen && !locked.admin);

  // ---------- فایل پشتیبان دستکاری‌شده ----------
  const bad = await p.evaluate(() => [
    parseBackup('{'), parseBackup(JSON.stringify({ app: 'other', data: { geomat_x: '1' } })),
    parseBackup('{"app":"' + BACKUP_APP_ID + '","data":{"__proto__":"x","geomat_x":"1"}}'),
    parseBackup(JSON.stringify({ app: BACKUP_APP_ID, data: { 'evil_key': '1' } })),
    parseBackup(JSON.stringify({ app: BACKUP_APP_ID, data: { geomat_logs_v2: 5 } })),
    parseBackup('x'.repeat(6 * 1024 * 1024))
  ].map(r => !!r.error));
  ok('tampered or oversized backups are rejected', bad.every(Boolean), JSON.stringify(bad));
  const badTeams = await p.evaluate(() => [
    validTeam({ schema: 1, users: [{ id: 'a', name: 'x', role: 'root', salt: 's', iter: 310000, wrapped: { iv: 'a', ct: 'b' } }] }),
    validTeam({ schema: 1, users: [{ id: 'a', name: 'x', role: 'admin', salt: 's', iter: 999999999, wrapped: { iv: 'a', ct: 'b' } }] }),
    validTeam({ schema: 1, users: [] })
  ]);
  ok('invalid team files are rejected (bad role, huge KDF cost, empty)', badTeams.every(v => !v), JSON.stringify(badTeams));

  // ---------- بازگردانی پشتیبان قدیمی تاریخچه را پاک نمی‌کند ----------
  await login(p);
  await p.click('#tabSupportBtn'); await p.click('#supportViewRow button:nth-child(2)');
  await unlockTech(p);
  const merge = await p.evaluate(async () => {
    const old = snapshotAppData();
    const inv = getInventory();
    const it = inv.items.find(i => i.id === 'i1');
    it.data = { ...it.data, title: 'نسخه جدید' }; pushVersion(it, 'edit'); saveInventory(inv);
    const versionsAfterEdit = getInventory().items.find(i => i.id === 'i1').history.length;
    replaceAppData(old); // پشتیبانِ قبل از ویرایش
    const now = getInventory().items.find(i => i.id === 'i1');
    return { versionsAfterEdit, versionsNow: now.history.length, title: now.data.title, teamKept: localStorage.getItem('geomat_team_v1') !== null };
  });
  ok('restoring an older backup keeps every history version', merge.versionsNow === merge.versionsAfterEdit && merge.title === 'نسخه جدید', JSON.stringify(merge));
  ok('restore keeps this phone\'s accounts', merge.teamKept);
  // بازگردانی با حافظه پر: داده قبلی سالم
  const atomic = await p.evaluate(() => {
    const before = JSON.stringify(snapshotAppData());
    const orig = Storage.prototype.setItem;
    // حافظه فقط برای داده جدید جا ندارد (داده قبلی که جا شده بود، برگرداندنش جا دارد)
    Storage.prototype.setItem = function (k, v) { if (k === 'geomat_sites_v1' && v === '{}') throw new Error('QuotaExceededError'); return orig.call(this, k, v); };
    const res = replaceAppData({ geomat_logs_v2: '[]', geomat_companies_v2: '[]', geomat_settings_v1: '{}', geomat_chat_messages_v1: '[]', geomat_sites_v1: '{}' });
    Storage.prototype.setItem = orig;
    return { res, same: JSON.stringify(snapshotAppData()) === before };
  });
  ok('failed restore leaves the old data untouched', atomic.res === false && atomic.same, JSON.stringify(atomic));
  ok('no errors', !p.errs.length, p.errs.join(';'));
  await b.close();
})();
