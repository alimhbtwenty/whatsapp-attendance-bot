// آرشیو ساپورت تیم (درخواست مالک، ADR-0004): گزارش ساپورتِ هر نفر با «فایل آرشیو تیم» به گوشی بقیه می‌رسد.
// - خروجی فقط گزارش‌های ساپورتِ خود کاربر است؛ پرونده فنی و تردد هرگز در آن نیست
// - ورود فقط اضافه می‌کند؛ دوباره وارد کردن همان فایل چیزی اضافه نمی‌کند؛ فایل دستکاری‌شده پاک یا رد می‌شود
// - گزارش وارد‌شده در اضافه‌کار، جفت شدن ورود و خروج و سلام اول روز نقشی ندارد
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-archive-'));

(async () => {
  const b = await chromium.launch();
  const page = async (who) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran', acceptDownloads: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    const p = await ctx.newPage(); p.setDefaultTimeout(10000);
    p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.clock.install({ time: new Date('2026-10-12T12:00:00+03:30') });
    await p.addInitScript(() => {
      if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1');
      localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه', 'صدف']));
      localStorage.setItem('geomat_inventory_v1', JSON.stringify({ schema: 1, items: [], marker: 'INV-SECRET-MARKER' }));
    });
    await p.goto(BASE + '/index.html'); await p.waitForTimeout(600);
    await login(p, who);
    return p;
  };
  const support = async (p, company, actions) => {
    await p.click('#tabSupportBtn'); await p.waitForTimeout(150);
    await p.evaluate(([c, a]) => { selectedCompany = c; renderCompanies(); document.getElementById('supportActionsText').value = a; document.getElementById('supportTechInfo').value = '10.0.0.9'; updateSupportPreview(); }, [company, actions]);
    await p.click('#floatingDock .dock-copy-btn'); await p.waitForTimeout(500);
  };
  const exportFile = async (p, name) => {
    const [d] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportTeamArchive())]);
    const file = path.join(TMP, name);
    await d.saveAs(file);
    return { file, text: fs.readFileSync(file, 'utf8'), suggested: d.suggestedFilename() };
  };
  const importFile = async (p, file) => {
    await p.click('#tabArchiveBtn'); await p.waitForTimeout(150);
    await p.setInputFiles('#teamArchiveInput', file); await p.waitForTimeout(600);
    return p.evaluate(() => document.getElementById('toast') ? document.getElementById('toast').textContent : '');
  };
  const writeJson = (name, obj) => { const f = path.join(TMP, name); fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f; };

  // ---------- گوشی تکنسین A ----------
  const A = await page({ name: 'علی تکنسین', phone: '09120000002', pw: 'tech-pass-22' });
  await support(A, 'کرانه', 'تعویض سوییچ طبقه دوم');
  await A.click('#tabAttendanceBtn');
  await A.evaluate(() => { selectedCompany = 'کرانه'; renderCompanies(); setAttendanceAction('both');
    document.getElementById('inHour').value = '08'; document.getElementById('inMin').value = '00';
    document.getElementById('outHour').value = '10'; document.getElementById('outMin').value = '00'; updatePreview(); });
  await A.click('#floatingDock .dock-copy-btn'); await A.waitForTimeout(500);
  const ex = await exportFile(A, 'a.json');
  const exObj = JSON.parse(ex.text);
  ok('the export holds the user\'s support report', exObj.kind === 'team-archive' && exObj.records.length === 1 && exObj.records[0].actions === 'تعویض سوییچ طبقه دوم', ex.suggested);
  ok('the export never holds attendance records', exObj.records.every(r => r.type === 'support'));
  ok('the export never holds the technical file', !ex.text.includes('INV-SECRET-MARKER') && !ex.text.includes('geomat_inventory'));

  // ---------- گوشی مدیر B ----------
  const B = await page();
  await support(B, 'صدف', 'گزارش خود مدیر');
  await B.click('#tabAttendanceBtn');
  await B.evaluate(() => { selectedCompany = 'صدف'; renderCompanies(); setAttendanceAction('both');
    document.getElementById('inHour').value = '08'; document.getElementById('inMin').value = '00';
    document.getElementById('outHour').value = '11'; document.getElementById('outMin').value = '00'; updatePreview(); });
  await B.click('#floatingDock .dock-copy-btn'); await B.waitForTimeout(500);
  const before = await B.evaluate(() => getLogs().length);
  const toast1 = await importFile(B, ex.file);
  const after = await B.evaluate(() => getLogs());
  const imp = after.find(l => l.imported);
  ok('importing adds the other technician\'s support report', after.length === before + 1 && imp && imp.by.name === 'علی تکنسین' && imp.imported.from.name === 'علی تکنسین', toast1);
  ok('the attendance section is the default and hides support reports', await B.evaluate(() => archiveScopedLogs().length === 1 && archiveScopedLogs()[0].type === 'attendance'));
  ok('the team archive file buttons are not in the attendance section', await B.locator('#teamArchiveRow').isHidden());
  await B.click('#archiveSecSup'); await B.waitForTimeout(150);
  ok('the support section shows only support reports', await B.evaluate(() => archiveScopedLogs().length === 2 && archiveScopedLogs().every(l => l.type === 'support')));
  ok('the support section shows the team archive file buttons', await B.locator('#teamArchiveRow').isVisible());
  await B.locator('#archiveCompanyFilters .filter-chip', { hasText: 'کرانه' }).click(); await B.waitForTimeout(150);
  ok('the support section has its own company filter', await B.evaluate(() => archiveScopedLogs().length === 1 && archiveScopedLogs()[0].company === 'کرانه' && archiveCompanyFilter === 'all'));
  await B.click('#archiveSecAtt'); await B.waitForTimeout(150);
  ok('switching back keeps the attendance company filter', await B.evaluate(() => archiveScopedLogs().length === 1 && archiveScopedLogs()[0].type === 'attendance'));
  await B.click('#archiveSecSup'); await B.waitForTimeout(150);
  await B.locator('#archiveCompanyFilters .filter-chip', { hasText: 'همه شرکت‌ها' }).click(); await B.waitForTimeout(150);
  ok('an imported support report does not stop the admin\'s own overtime figures', await B.evaluate(() => monthlyData().balance !== null));

  const toast2 = await importFile(B, ex.file);
  ok('the archive card names who wrote it', await B.locator('#archiveStream .archive-who', { hasText: 'علی تکنسین' }).count() === 1);
  ok('importing the same file again adds nothing', await B.evaluate(() => getLogs().length) === before + 1, toast2);

  // ---------- فایل دستکاری‌شده ----------
  const base = exObj.records[0];
  const evil = writeJson('evil.json', { ...exObj, records: [
    { ...base, id: 900001, company: '<img src=x onerror="window.__xss=1">', actions: '<script>window.__xss=2</script>' },
    { ...base, id: 900002, type: 'attendance', inTime: '08:00', outTime: '09:00' },
    { ...base, id: 900003, dateISO: '2026-13-45' },
    { ...base, id: 900004, checklist: Array.from({ length: 101 }, () => ({ item: 'x', done: true })) },
    { ...base, id: 900005, by: { id: 'x'.repeat(65), name: 'n' } },
    { ...base, id: 900006, extra: 'dropped', geo: { lat: 1, lng: 2 }, durationMins: 999 }
  ] });
  const n0 = await B.evaluate(() => getLogs().length);
  const toast3 = await importFile(B, evil);
  const got = await B.evaluate(() => getLogs().filter(l => l.id >= 900000 && l.id < 1000000));
  ok('only clean support records are added from a tampered file', got.length === 2 && got.every(l => l.type === 'support'), toast3);
  ok('unknown fields and attendance-only fields are dropped', got.every(l => !('extra' in l) && l.geo === null && l.durationMins === 0));
  await B.waitForTimeout(300);
  ok('HTML in an imported record is shown as text', await B.evaluate(() => window.__xss === undefined && !document.querySelector('#archiveStream img, #archiveStream script')));
  ok('the archive grew by exactly those records', await B.evaluate(() => getLogs().length) === n0 + 2);

  const n1 = await B.evaluate(() => getLogs().length);
  await importFile(B, writeJson('kind.json', { ...exObj, kind: 'team' }));
  await importFile(B, writeJson('many.json', { ...exObj, records: Array.from({ length: 2001 }, (_, i) => ({ ...base, id: 800000 + i })) }));
  await importFile(B, writeJson('notjson.json', '{ broken'));
  await importFile(B, writeJson('big.json', JSON.stringify({ ...exObj, pad: 'x'.repeat(2 * 1024 * 1024) })));
  ok('wrong kind, too many records, broken JSON and oversize files are rejected', await B.evaluate(() => getLogs().length) === n1);

  // ---------- id تکراری بین دو گوشی ----------
  const twin = await B.evaluate(() => { const l = getLogs().find(x => x.imported && x.by.name === 'علی تکنسین'); return l.id; });
  await B.evaluate((id) => { const logs = getLogs(); const j = dateToJalali(new Date());
    logs.unshift({ id, by: sessionWho(), type: 'support', company: 'صدف', date: 'x', day: 'x', dateISO: toISODate(new Date()), jy: j.jy, jm: j.jm, jd: j.jd, action: null, inTime: null, outTime: null, geo: null, durationMins: 0, durationText: '-', text: 't', actions: 'هم‌شناسه', pending: '', tech: '', checklist: null });
    writeLogs(logs); renderArchive(); }, twin);
  // بدون await: deleteLogItem منتظر پنجره تأیید می‌ماند
  await B.evaluate(([id, by]) => { deleteLogItem(id, by); }, [twin, await B.evaluate(() => session.user.id)]);
  await B.waitForSelector('#confirmModal.open'); await B.click('#confirmOkBtn'); await B.waitForTimeout(300);
  ok('deleting a record removes only that one, not an imported record with the same id', await B.evaluate((id) => getLogs().filter(l => l.id === id).length === 1 && getLogs().find(l => l.id === id).imported, twin));

  ok('no page errors', !A.errs.length && !B.errs.length, [...A.errs, ...B.errs].join(';'));
  await b.close();
  fs.rmSync(TMP, { recursive: true, force: true });
})();
