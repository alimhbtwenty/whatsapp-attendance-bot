const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + x : ''));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    timezoneId: 'Asia/Tehran'
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));

  // Pin the clock to 2026-10-13 10:00:00 Tehran time (Day 2, 1405/07/22, Tuesday)
  await p.clock.install({ time: new Date('2026-10-13T10:00:00+03:30') });
  await p.goto(BASE + '/index.html');
  await p.waitForTimeout(800);
  await login(p);

  // -------------------------------------------------------------
  // Test 1: Friday multi-session overtime calculation
  // -------------------------------------------------------------
  // Friday 2026-10-16 (1405/07/24):
  // Session 1: 09:00 to 10:00 (60 mins)
  // Session 2: 17:00 to 18:00 (60 mins)
  // Total work = 120 mins (2:00).
  // Overtime must be 120 mins (2:00), NOT span of 9 hours (540 mins).
  await p.clock.setFixedTime(new Date('2026-10-17T20:00:00+03:30'));
  const friBalance = await p.evaluate(() => {
    let id = 100;
    const rec = (iso, company, inT, outT) => {
      const d = isoToDate(iso);
      const j = dateToJalali(d);
      const mins = (parseHM(outT) - parseHM(inT) + 1440) % 1440;
      return { id: id++, type: 'attendance', company, dateISO: iso, jy: j.jy, jm: j.jm, jd: j.jd, date: '', action: 'both', inTime: inT, outTime: outT, durationMins: mins, durationText: '', text: '' };
    };
    const logs = [
      rec('2026-10-16', 'صدف', '09:00', '10:00'),
      rec('2026-10-16', 'کرانه', '17:00', '18:00')
    ];
    localStorage.setItem('geomat_logs_v2', JSON.stringify(logs));
    archiveCompanyFilter = 'all';
    const d = monthlyData();
    const dayData = d.balance ? d.balance[j2d(1405, 7, 24)] : null;
    return {
      totalMins: d.total,
      dayOvertime: dayData ? dayData.overtime : null,
      monthlyOvertime: d.overtime
    };
  });

  ok('friday multi-session overtime matches worked time instead of span',
    friBalance.dayOvertime === 120 && friBalance.monthlyOvertime === 120,
    `total=${friBalance.totalMins} ot=${friBalance.dayOvertime} monthlyOt=${friBalance.monthlyOvertime}`);

  // -------------------------------------------------------------
  // Test 2: Workday multi-session overtime outside office hours
  // -------------------------------------------------------------
  // Workday (Monday 2026-10-12):
  // Session 1: 06:00 to 07:00 (60 mins OT before 09:00)
  // Session 2: 08:00 to 09:00 (60 mins OT before 09:00)
  // Gap 07:00 to 08:00 was unworked.
  // Overtime must be 120 mins, NOT span of 180 mins.
  const workdayBalance = await p.evaluate(() => {
    let id = 200;
    const rec = (iso, company, inT, outT) => {
      const d = isoToDate(iso);
      const j = dateToJalali(d);
      const mins = (parseHM(outT) - parseHM(inT) + 1440) % 1440;
      return { id: id++, type: 'attendance', company, dateISO: iso, jy: j.jy, jm: j.jm, jd: j.jd, date: '', action: 'both', inTime: inT, outTime: outT, durationMins: mins, durationText: '', text: '' };
    };
    const logs = [
      rec('2026-10-12', 'صدف', '06:00', '07:00'),
      rec('2026-10-12', 'کرانه', '08:00', '09:00')
    ];
    localStorage.setItem('geomat_logs_v2', JSON.stringify(logs));
    archiveCompanyFilter = 'all';
    const d = monthlyData();
    const dayData = d.balance ? d.balance[j2d(1405, 7, 20)] : null;
    return {
      totalMins: d.total,
      dayOvertime: dayData ? dayData.overtime : null,
      dayDeficit: dayData ? dayData.deficit : null
    };
  });

  ok('workday multi-session overtime outside office hours excludes gap',
    workdayBalance.dayOvertime === 120,
    `total=${workdayBalance.totalMins} ot=${workdayBalance.dayOvertime} def=${workdayBalance.dayDeficit}`);

  // -------------------------------------------------------------
  // Test 3: exportMonthlyCsv includes person in filename when filtered by person
  // -------------------------------------------------------------
  const exportedFilename = await p.evaluate(() => {
    let id = 300;
    const rec = (iso, company, inT, outT) => {
      const d = isoToDate(iso);
      const j = dateToJalali(d);
      const mins = (parseHM(outT) - parseHM(inT) + 1440) % 1440;
      return { id: id++, by: { id: '09120000002', name: 'علی' }, type: 'attendance', company, dateISO: iso, jy: j.jy, jm: j.jm, jd: j.jd, date: '', action: 'both', inTime: inT, outTime: outT, durationMins: mins, durationText: '', text: '' };
    };
    const logs = [rec('2026-10-12', 'صدف', '09:00', '17:00')];
    localStorage.setItem('geomat_logs_v2', JSON.stringify(logs));
    archivePersonFilter = '09120000002';
    archiveCompanyFilter = 'all';
    let downloadedName = '';
    const orig = downloadFile;
    downloadFile = (name, content, mime) => { downloadedName = name; return true; };
    try {
      exportMonthlyCsv();
    } finally {
      downloadFile = orig;
      archivePersonFilter = 'all';
    }
    return downloadedName;
  });

  ok('exportMonthlyCsv filename reflects person filter',
    exportedFilename.includes('-person.csv'),
    `name=${exportedFilename}`);

  // -------------------------------------------------------------
  // Test 4: Presence notification action starts exit flow properly
  // -------------------------------------------------------------
  await p.clock.setFixedTime(new Date('2026-10-13T12:00:00+03:30'));
  const notifResult = await p.evaluate(() => {
    localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه', 'صدف']));
    setOpenEntry({
      company: 'کرانه',
      dateISO: '2026-10-13',
      inTime: '09:00',
      logId: 1791860000000,
      ts: Date.now(),
      notified: false
    });
    window.handleNotificationAction('exit');
    return {
      action: attendanceAction,
      company: selectedCompany,
      outHour: document.getElementById('outHour').value,
      outMin: document.getElementById('outMin').value
    };
  });

  ok('handleNotificationAction sets action out and current time',
    notifResult.action === 'out' && notifResult.company === 'کرانه' && notifResult.outHour === '12' && notifResult.outMin === '00',
    JSON.stringify(notifResult));

  ok('no unexpected page errors', errs.length === 0, errs.join('; '));
  await b.close();
})();
