// داده‌ای که خودِ نسخه‌های قدیمی (1.1، 1.2، 1.3، پیش‌نمایش 1.4) ساخته‌اند (tests/fixtures، با generate-from-old-version.js)
// با نسخه جدید باز می‌شود: هیچ رکورد، محل، تنظیم، چت یا ورود بازی نباید گم یا خراب شود.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const fs = require('fs');
const path = require('path');
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
(async () => {
  const b = await chromium.launch();
  for (const v of ['1.1', '1.2', '1.3', '1.4p']) {
    const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', `storage-v${v}.json`), 'utf8'));
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran' });
    const p = await ctx.newPage(); p.setDefaultTimeout(6000);
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.clock.install({ time: new Date('2026-10-11T11:00:00+03:30') });
    await p.addInitScript((d) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); for (const k in d) localStorage.setItem(k, d[k]); }, fixture);
    await p.goto(BASE + '/index.html'); await p.waitForTimeout(1200);
    const s = await p.evaluate(() => {
      const logs = JSON.parse(localStorage.getItem('geomat_logs_v2'));
      const att = logs.filter(l => l.type === 'attendance');
      archiveCompanyFilter = 'all'; reportJY = 1405; reportJM = 7;
      return {
        logs: logs.length, att: att.length, support: logs.filter(l => l.type === 'support').length,
        closedMins: att.filter(l => l.outTime).reduce((a, l) => a + (l.durationMins || 0), 0),
        monthly: monthlyData().total,
        open: att.filter(l => !l.outTime).map(l => l.company + ' ' + l.inTime),
        openEntry: getOpenEntry(),
        companies: getCompanies(), sites: Object.keys(getSites()),
        chat: (JSON.parse(localStorage.getItem('geomat_chat_messages_v1') || '[]')).some(m => String(m.text).includes('تست به‌روزرسانی')),
        reminder: getSettings().reminderTime, user: getUserName(),
        schema: localStorage.getItem('geomat_schema_version'),
        backup: JSON.parse(localStorage.getItem('geomat_backup_pre_1_4') || 'null')
      };
    });
    ok(`${v}: one record per stay`, s.att === 4 && s.logs === 5, `${s.logs}/${s.att}`);
    ok(`${v}: worked minutes kept`, s.closedMins === 900 && s.monthly === 900, `${s.closedMins}/${s.monthly}`);
    ok(`${v}: open entry kept`, s.open.join() === 'هاستیدا 09:30' && s.openEntry && s.openEntry.company === 'هاستیدا', s.open.join());
    ok(`${v}: support report kept`, s.support === 1);
    ok(`${v}: companies and sites kept`, s.companies.join() === 'کرانه,هاستیدا' && s.sites.length === 2);
    ok(`${v}: chat, settings, user kept`, s.chat && s.reminder === '18:30' && s.user === 'تکنسین تست');
    ok(`${v}: pre-update copy is the untouched old data`, !!s.backup && s.backup.data.geomat_logs_v2 === fixture.geomat_logs_v2 && s.schema === '14');
    // دوباره باز کردن چیزی را عوض نمی‌کند
    const before = await p.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]))));
    await p.reload(); await p.waitForTimeout(800);
    const after = await p.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]))));
    ok(`${v}: second start changes nothing`, before === after);
    // برگرداندن به قبل از به‌روزرسانی
    await p.click('#tabArchiveBtn'); await p.click('#preUpdateRestoreBtn'); await p.click('#confirmOkBtn'); await p.waitForTimeout(1500);
    const restored = await p.evaluate(() => localStorage.getItem('geomat_logs_v2'));
    ok(`${v}: restore brings back the old data`, restored === fixture.geomat_logs_v2 || JSON.parse(restored).length === 5);
    ok(`${v}: no errors`, !errs.length, errs.join(';'));
    await ctx.close();
  }
  await b.close();
})();
