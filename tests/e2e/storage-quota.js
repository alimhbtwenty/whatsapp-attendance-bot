// دور ۸ (فضای ذخیره‌سازی): localStorage حدود ۵ میلیون نویسه جا دارد.
// - وقتی پر است، اول کپی پیش از به‌روزرسانی پاک می‌شود و رکورد تازه ذخیره می‌شود (هیچ رکورد آرشیو حذف نمی‌شود)
// - کپی پیش از به‌روزرسانی بعد از ۳۰ روز خودکار پاک می‌شود
// - تنظیمات درصد فضای استفاده‌شده را نشان می‌دهد و از ۸۰٪ هشدار می‌دهد
const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const DAY = 86400000;

(async () => {
  const b = await chromium.launch();
  const page = async (seed) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran' });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    const p = await ctx.newPage(); p.setDefaultTimeout(15000);
    p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.addInitScript((s) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); for (const k in s) localStorage.setItem(k, s[k]); }, seed);
    await p.goto(BASE + '/index.html'); await p.waitForTimeout(600);
    return p;
  };
  const backup = (ageDays, chars) => JSON.stringify({ at: new Date(Date.now() - ageDays * DAY).toISOString(), from: 13, data: { geomat_logs_v2: 'x'.repeat(chars) } });
  const iso = new Date().toISOString().slice(0, 10);
  const logs = JSON.stringify([1, 2, 3].map(i => ({ id: i, type: 'attendance', company: 'کرانه', date: 'x', day: 'x', dateISO: iso, jy: 1405, jm: 7, jd: 20, action: 'both', inTime: '08:00', outTime: '12:00', durationMins: 240, durationText: '4:00', text: 't' })));

  // ---------- حافظه پر ----------
  const p = await page({ geomat_schema_version: '14', geomat_companies_v2: JSON.stringify(['کرانه']), geomat_logs_v2: logs, geomat_backup_pre_1_4: backup(2, 1500000), geomat_chat_messages_v1: JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ id: 'm' + i, sender: 'x', isMine: false, channel: 'general', ts: Date.now() - 1e6 + i, text: 'پیام ' + i }))) });
  await login(p);
  await p.click('#tabArchiveBtn'); await p.waitForTimeout(200);
  const pct = await p.evaluate(() => (document.getElementById('storageUsage') || {}).textContent || '');
  ok('settings show how much storage is used', /٪/.test(pct), pct);
  // بقیه فضا با کلیدی بیرون از برنامه پر می‌شود
  await p.evaluate(() => { for (const size of [100000, 10000, 1000, 50]) { let i = 0; try { for (;;) localStorage.setItem('zz_fill_' + size + '_' + (i++), 'f'.repeat(size)); } catch (e) {} } });
  await p.click('#tabAttendanceBtn');
  await p.evaluate(() => { selectedCompany = 'کرانه'; renderCompanies(); setAttendanceAction('both'); updatePreview(); });
  await p.click('#floatingDock .dock-copy-btn'); await p.waitForTimeout(600);
  const after = await p.evaluate(() => ({ n: getLogs().length, backup: !!localStorage.getItem('geomat_backup_pre_1_4'), chat: getChatMessages().length }));
  ok('with storage full, a new record is still saved', after.n === 4, JSON.stringify(after));
  ok('no archive record is dropped to make room', after.n >= 4);
  ok('the pre-update copy is what gets freed', after.backup === false);
  await p.evaluate(() => { Object.keys(localStorage).filter(k => k.startsWith('zz_fill_')).forEach(k => localStorage.removeItem(k)); });
  await p.click('#tabArchiveBtn'); await p.waitForTimeout(200);
  ok('the restore-before-update button is gone with the copy', await p.locator('#preUpdateRestoreBtn').isHidden());
  ok('no page errors (full storage)', !p.errs.length, p.errs.join(';'));

  // ---------- پیام‌رسان با حافظه پر ----------
  const c = await page({ geomat_schema_version: '14', geomat_logs_v2: logs, geomat_backup_pre_1_4: backup(2, 1500000), geomat_chat_messages_v1: JSON.stringify(Array.from({ length: 60 }, (_, i) => ({ id: 'm' + i, sender: 'x', isMine: false, channel: 'general', ts: Date.now() - 1e6 + i, text: 'پیام ' + i }))) });
  await login(c);
  await c.evaluate(() => { for (const size of [100000, 10000, 1000, 50]) { let i = 0; try { for (;;) localStorage.setItem('zz_fill_' + size + '_' + (i++), 'f'.repeat(size)); } catch (e) {} } });
  await c.click('#tabMessengerBtn'); await c.fill('#tgMessageInput', 'پیام تازه'); await c.click('#tgSendBtn'); await c.waitForTimeout(300);
  ok('with storage full the chat keeps its history (not cut to 30)', await c.evaluate(() => getChatMessages().length) === 61);

  // ---------- هشدار ۸۰٪ ----------
  const w = await page({ geomat_schema_version: '14', geomat_logs_v2: logs, geomat_backup_pre_1_4: backup(1, 4400000) });
  await login(w);
  await w.click('#tabArchiveBtn'); await w.waitForTimeout(200);
  ok('above 80% the usage line warns', await w.evaluate(() => !!document.querySelector('#storageUsage.storage-warn')));

  // ---------- عمر ۳۰ روزه ----------
  const old = await page({ geomat_schema_version: '14', geomat_logs_v2: logs, geomat_backup_pre_1_4: backup(31, 1000) });
  ok('a pre-update copy older than 30 days is removed', await old.evaluate(() => !localStorage.getItem('geomat_backup_pre_1_4')));
  const fresh = await page({ geomat_schema_version: '14', geomat_logs_v2: logs, geomat_backup_pre_1_4: backup(5, 1000) });
  ok('a recent pre-update copy is kept', await fresh.evaluate(() => !!localStorage.getItem('geomat_backup_pre_1_4')));

  await b.close();
})();
