const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + x : ''));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    timezoneId: 'Asia/Tehran',
    permissions: ['clipboard-read', 'clipboard-write']
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(10000);
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));

  await p.clock.install({ time: new Date('2026-10-12T08:30:00+03:30') });
  await p.addInitScript(() => {
    localStorage.setItem('seeded', '1');
    localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه', 'صدف']));
    localStorage.setItem('geomat_sites_v1', JSON.stringify({
      'کرانه': { lat: 35.7, lng: 51.4, radius: 200, acc: 10 }
    }));
  });

  await p.goto(BASE + '/index.html');
  await p.waitForTimeout(600);
  await login(p);

  // 1) Exit before entry on same day must not pair into a 23-hour stay
  await p.evaluate(() => {
    selectedCompany = 'کرانه';
    renderCompanies();
    setAttendanceAction('in');
    document.getElementById('inHour').value = '09';
    document.getElementById('inMin').value = '00';
    updatePreview();
  });
  await p.click('#floatingDock .dock-copy-btn');
  await p.waitForTimeout(400);

  // Switch to exit at 08:00 (before entry on same day)
  await p.evaluate(() => {
    setAttendanceAction('out');
    document.getElementById('outHour').value = '08';
    document.getElementById('outMin').value = '00';
    updatePreview();
  });
  const pairBefore = await p.evaluate(() => pairedEntry());
  const hintShown = await p.locator('#unpairedExitHint.show').count();
  ok('exit before entry on same day is not paired', pairBefore === null && hintShown === 1, JSON.stringify(pairBefore));

  // Trying to copy should trigger the missing entry modal instead of merging
  await p.click('#floatingDock .dock-copy-btn');
  await p.waitForTimeout(400);
  const modalOpen = await p.locator('#flowModal.open #flowInTime').count();
  ok('exit before entry prompts missing entry modal', modalOpen === 1);
  if (modalOpen) {
    await p.click('#flowModal .lock-link'); // cancel
    await p.waitForTimeout(300);
  }

  // 2) Deleting an archive record must allow re-committing the same report
  await p.evaluate(() => {
    writeLogs([]);
    setOpenEntry(null);
    lastCommit = null;
    setAttendanceAction('in');
    document.getElementById('inHour').value = '08';
    document.getElementById('inMin').value = '30';
    updatePreview();
  });
  await p.click('#floatingDock .dock-copy-btn');
  await p.waitForTimeout(400);
  const initialLogs = await p.evaluate(() => getLogs());
  const logId = initialLogs[0].id;

  // Delete the record from archive
  await p.evaluate((id) => { deleteLogItem(id); }, logId);
  await p.waitForTimeout(300);
  await p.click('#confirmOkBtn');
  await p.waitForTimeout(400);
  const afterDeleteLogs = await p.evaluate(() => getLogs());

  // Re-copy the same report on attendance tab
  await p.click('#tabAttendanceBtn');
  await p.waitForTimeout(300);
  await p.click('#floatingDock .dock-copy-btn');
  await p.waitForTimeout(400);
  const reCommittedLogs = await p.evaluate(() => getLogs());
  ok('deleted report can be re-committed within 10 minutes', afterDeleteLogs.length === 0 && reCommittedLogs.length === 1, `afterDelete=${afterDeleteLogs.length} reCommitted=${reCommittedLogs.length}`);

  // 3) Night shift next day exit greets once; subsequent attendance on that day must not greet again
  await p.evaluate(() => {
    writeLogs([]);
    setOpenEntry(null);
    lastCommit = null;
  });
  await p.clock.setFixedTime(new Date('2026-10-12T22:00:00+03:30'));
  await p.evaluate(() => {
    setDateOffset(0);
    selectedCompany = 'کرانه';
    renderCompanies();
    setAttendanceAction('in');
    document.getElementById('inHour').value = '22';
    document.getElementById('inMin').value = '00';
    updatePreview();
  });
  await p.click('#floatingDock .dock-copy-btn');
  await p.waitForTimeout(400);

  // Next morning at 06:00
  await p.clock.setFixedTime(new Date('2026-10-13T06:00:00+03:30'));
  await p.evaluate(() => {
    setDateOffset(0);
    setAttendanceAction('out');
    document.getElementById('outHour').value = '06';
    document.getElementById('outMin').value = '00';
    updatePreview();
  });
  await p.click('#floatingDock .dock-copy-btn');
  await p.waitForTimeout(400);
  const exitMsg = await p.evaluate(() => navigator.clipboard.readText());
  ok('night shift exit next morning greets as first msg', exitMsg.startsWith('سلام، صبح بخیر'));

  // Next afternoon at 14:00 on same day (Tuesday 2026-10-13)
  await p.clock.setFixedTime(new Date('2026-10-13T14:00:00+03:30'));
  await p.evaluate(() => {
    setDateOffset(0);
    setAttendanceAction('in');
    document.getElementById('inHour').value = '14';
    document.getElementById('inMin').value = '00';
    updatePreview();
  });
  await p.click('#floatingDock .dock-copy-btn');
  await p.waitForTimeout(400);
  const nextMsg = await p.evaluate(() => navigator.clipboard.readText());
  ok('subsequent attendance on same day after night shift exit has no greeting', !/سلام/.test(nextMsg) && !/سه‌شنبه/.test(nextMsg), nextMsg.replace(/\n/g, ' | '));

  ok('no page errors', !errs.length, errs.join(';'));
  await b.close();
})();
