// بازبینی دور ۴: ایمنی داده (data-safety)
// ۱. حذف رکوردهایی با شناسه تکراری (deletes with duplicate ids)
//    - حذف رکورد تردد بدون by.id نباید رکورد ساپورت همکار با همان id را حذف کند
//    - حذف رکورد ساپورت نباید ورود بازِ تردد با همان id را ببندد
// ۲. ارتقا از نسخه‌های قدیمی (upgrade from tests/fixtures)
//    - حذف رکورد تردد قدیمی باید ورود باز قدیمی (که ts دارد نه logId) را پاک کند
// ۳. پر بودن حافظه هنگام بازگردانی پشتیبان (full storage during backup restore)
//    - رول‌بک همه-یا-هیچ در صورت شکست بازگردانی نباید کلیدهای قبلی را بی‌صدا حذف کند
// ۴. دوام وارد کردن داده پس از ری‌استارت (restart durability with imports)
const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const fs = require('fs');
const path = require('path');
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
  p.setDefaultTimeout(12000);
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));

  await p.clock.install({ time: new Date('2026-10-12T12:00:00+03:30') });

  // =========================================================================
  // تست ۱: حذف رکورد تردد در صورت وجود رکورد ساپورت با همان id
  // =========================================================================
  const DUP_ID = 1791698499000;
  await p.addInitScript(([dupId]) => {
    localStorage.setItem('seeded', '1');
    localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه', 'صدف']));
    localStorage.setItem('geomat_sites_v1', JSON.stringify({
      'کرانه': { lat: 35.7, lng: 51.4, radius: 200, acc: 10 }
    }));
    // دو رکورد با شناسه یکسان: اولی ساپورت واردشده از همکار، دومی تردد محلی بدون by.id
    const logs = [
      {
        id: dupId,
        type: 'support',
        company: 'صدف',
        date: '۱۴۰۵/۰۷/۲۱',
        dateISO: '2026-10-12',
        jy: 1405, jm: 7, jd: 21,
        by: { id: 'colleague-99', name: 'رضا کمالی' },
        actions: 'بررسی دوربین‌ها',
        pending: '',
        tech: '',
        text: 'گزارش ساپورت صدف',
        checklist: null
      },
      {
        id: dupId,
        type: 'attendance',
        company: 'کرانه',
        date: '۱۴۰۵/۰۷/۲۱',
        dateISO: '2026-10-12',
        jy: 1405, jm: 7, jd: 21,
        action: 'both',
        inTime: '08:00',
        outTime: '16:00',
        durationMins: 480,
        durationText: '8:00',
        text: 'تردد کرانه',
        geo: null
      }
    ];
    localStorage.setItem('geomat_logs_v2', JSON.stringify(logs));
  }, [DUP_ID]);

  await p.goto(BASE + '/index.html');
  await p.waitForTimeout(600);
  await login(p);

  // کاربر در تب آرشیو تردد است و می‌خواهد رکورد تردد «کرانه» را حذف کند
  await p.click('#tabArchiveBtn');
  await p.waitForTimeout(300);
  await p.click('#archiveSecAtt');
  await p.waitForTimeout(300);

  // دکمه حذف رکورد در تب تردد
  const attCard = p.locator('.record-card-item', { hasText: 'کرانه' });
  await attCard.locator('button[aria-label="حذف رکورد"]').click();
  await p.waitForTimeout(300);

  // پنجره تأیید باید نام «کرانه» را نمایش دهد نه «صدف»
  const confirmText = await p.textContent('#confirmText');
  ok('delete prompt for attendance with duplicate id names correct company', confirmText.includes('کرانه'), confirmText);
  await p.click('#confirmOkBtn');
  await p.waitForTimeout(400);

  // بررسی وضعیت لاگ‌ها: تردد باید حذف شده باشد و ساپورت همکار باید دست‌نخورده باقی بماند
  const logsAfterAttDelete = await p.evaluate(() => getLogs());
  const attRemains = logsAfterAttDelete.some(l => l.id === DUP_ID && l.type === 'attendance');
  const supSurvives = logsAfterAttDelete.some(l => l.id === DUP_ID && l.type === 'support' && l.company === 'صدف');
  ok('attendance record deleted with duplicate id', !attRemains && supSurvives, `attRemains: ${attRemains}, supSurvives: ${supSurvives}`);

  // =========================================================================
  // تست ۲: حذف رکورد ساپورت نباید ورود باز تردد با همان id را پاک کند
  // =========================================================================
  const DUP_ID2 = 1791698499111;
  await p.evaluate(([dupId2]) => {
    // ثبت ورود باز برای کرانه
    setOpenEntry({
      company: 'کرانه',
      dateISO: '2026-10-12',
      inTime: '08:00',
      logId: dupId2,
      ts: dupId2,
      notified: false
    });
    // ثبت دو رکورد: تردد ورود باز و ساپورت واردشده با همان شناسه
    const logs = [
      {
        id: dupId2,
        type: 'support',
        company: 'صدف',
        date: '۱۴۰۵/۰۷/۲۱',
        dateISO: '2026-10-12',
        jy: 1405, jm: 7, jd: 21,
        by: { id: 'colleague-88', name: 'همکار ساپورت' },
        actions: 'تست سوئیچ',
        pending: '',
        tech: '',
        text: 'گزارش ساپورت صدف',
        checklist: null
      },
      {
        id: dupId2,
        type: 'attendance',
        company: 'کرانه',
        date: '۱۴۰۵/۰۷/۲۱',
        dateISO: '2026-10-12',
        jy: 1405, jm: 7, jd: 21,
        action: 'in',
        inTime: '08:00',
        outTime: null,
        durationMins: 0,
        durationText: '-',
        text: 'ورود کرانه',
        geo: null
      }
    ];
    localStorage.setItem('geomat_logs_v2', JSON.stringify(logs));
    renderOpenEntryBanner();
    renderArchive();
  }, [DUP_ID2]);

  // کاربر به بخش ساپورت می‌رود و رکورد ساپورت «صدف» را حذف می‌کند
  await p.click('#archiveSecSup');
  await p.waitForTimeout(300);
  const supCard = p.locator('.record-card-item', { hasText: 'صدف' });
  await supCard.locator('button[aria-label="حذف رکورد"]').click();
  await p.waitForTimeout(300);
  await p.click('#confirmOkBtn');
  await p.waitForTimeout(400);

  // ورود بازِ «کرانه» نباید بسته شود!
  const openEntryState = await p.evaluate(() => ({
    open: getOpenEntry(),
    banner: document.getElementById('openEntryBanner').classList.contains('show')
  }));
  ok('deleting support record does not close attendance open entry with same id',
    !!openEntryState.open && openEntryState.open.company === 'کرانه' && openEntryState.banner,
    JSON.stringify(openEntryState));

  // =========================================================================
  // تست ۳: ارتقا از نسخه ۱.۱ — حذف رکورد باید ورود باز قدیمی (ts به جای logId) را پاک کند
  // =========================================================================
  const v11Fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'storage-v1.1.json'), 'utf8'));
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran' });
  const p2 = await ctx2.newPage();
  await p2.clock.install({ time: new Date('2026-10-11T11:00:00+03:30') });
  await p2.addInitScript((d) => {
    for (const k in d) localStorage.setItem(k, d[k]);
  }, v11Fixture);
  await p2.goto(BASE + '/index.html');
  await p2.waitForTimeout(800);
  await login(p2);

  // در نسخه ۱.۱ رکورد ورود باز «هاستیدا» دارای ts: 1791698418581 بود اما فاقد logId
  const legacyOpenBefore = await p2.evaluate(() => getOpenEntry());
  ok('legacy fixture 1.1 has open entry before deletion', !!legacyOpenBefore && legacyOpenBefore.company === 'هاستیدا');

  // کاربر رکورد ورود «هاستیدا» را از آرشیو حذف می‌کند
  await p2.click('#tabArchiveBtn');
  await p2.waitForTimeout(300);
  const hastidaCard = p2.locator('.record-card-item', { hasText: 'هاستیدا' }).first();
  await hastidaCard.locator('button[aria-label="حذف رکورد"]').click();
  await p2.waitForTimeout(300);
  await p2.click('#confirmOkBtn');
  await p2.waitForTimeout(400);

  // ورود باز باید همراه با رکورد حذف شود
  const legacyOpenAfter = await p2.evaluate(() => ({
    open: getOpenEntry(),
    banner: document.getElementById('openEntryBanner').classList.contains('show')
  }));
  ok('deleting legacy attendance record clears open entry with ts field',
    !legacyOpenAfter.open && !legacyOpenAfter.banner,
    JSON.stringify(legacyOpenAfter));

  await ctx2.close();

  // =========================================================================
  // تست ۴: حافظه پر هنگام بازگردانی پشتیبان — رول‌بک ۲مرحله‌ای و جلوگیری از حذف بی‌صدای کلیدها
  // =========================================================================
  const ctx3 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran' });
  const p3 = await ctx3.newPage();
  await p3.clock.install({ time: new Date('2026-10-12T12:00:00+03:30') });
  await p3.addInitScript(() => {
    localStorage.setItem('seeded', '1');
    localStorage.setItem('geomat_sites_v1', JSON.stringify({ 'سایت اصلی': { lat: 35.7, lng: 51.4 } }));
    localStorage.setItem('geomat_companies_v2', JSON.stringify(['سایت اصلی']));
    localStorage.setItem('geomat_user_name', 'تکنسین آزمایشی');
    localStorage.setItem('geomat_chat_messages_v1', 'پیام قدیمی کوتاه');
  });
  await p3.goto(BASE + '/index.html');
  await p3.waitForTimeout(600);
  await login(p3);

  // تنظیم محدودیت کوتای حافظه شبیه‌سازی‌شده (سقف کلی حافظه):
  // هنگام بازگردانی، کلید چت‌ها بزرگ می‌شود و کلید بعدی از سقف عبور می‌کند.
  // رول‌بک ناقص فعلی نمی‌تواند کلید حذف‌شده sites را برگرداند چون چتِ بزرگ‌شده فضا را اشغال کرده.
  const rollbackResult = await p3.evaluate(() => {
    const beforeSites = localStorage.getItem('geomat_sites_v1');
    const beforeChat = localStorage.getItem('geomat_chat_messages_v1');

    const incomingChat = 'چ'.repeat(50);
    const incomingData = {
      'geomat_chat_messages_v1': incomingChat,
      'geomat_logs_v2': 'ل'.repeat(100) // throws QuotaExceededError
    };

    const origSet = localStorage.setItem;
    let failTriggered = false;
    localStorage.setItem = function(k, v) {
      if (k === 'geomat_logs_v2') {
        failTriggered = true;
        throw new DOMException('full', 'QuotaExceededError');
      }
      // حافظه پر: تا زمانی که کلید بزرگ‌شده (incomingChat) پاک/آزاد نشده، فضا پر است و نوشتن کلیدهای دیگر شکست می‌خورد
      if (failTriggered && localStorage.getItem('geomat_chat_messages_v1') === incomingChat) {
        throw new DOMException('full', 'QuotaExceededError');
      }
      return origSet.call(localStorage, k, v);
    };

    const success = replaceAppData(incomingData);
    localStorage.setItem = origSet;

    return {
      success,
      failTriggered,
      sitesAfter: localStorage.getItem('geomat_sites_v1'),
      chatAfter: localStorage.getItem('geomat_chat_messages_v1'),
      expectedSites: beforeSites,
      expectedChat: beforeChat
    };
  });

  ok('backup restore failed cleanly on quota error', !rollbackResult.success && rollbackResult.failTriggered, JSON.stringify(rollbackResult));
  ok('failed backup restore keeps pre-existing sites key (no silent drop)',
    rollbackResult.sitesAfter === rollbackResult.expectedSites,
    `sitesAfter: ${rollbackResult.sitesAfter}`);
  ok('failed backup restore restores original chat key instead of partial incoming',
    rollbackResult.chatAfter === rollbackResult.expectedChat,
    `chatAfter: ${rollbackResult.chatAfter}`);

  await ctx3.close();

  // =========================================================================
  // تست ۵: دوام وارد کردن گزارش‌های ساپورت تیم پس از ری‌استارت (Durable Mirror)
  // =========================================================================
  const ctx4 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran' });
  const p4 = await ctx4.newPage();
  await p4.clock.install({ time: new Date('2026-10-12T12:00:00+03:30') });
  await p4.addInitScript(() => {
    const NS = 'fake_native_store_r4';
    const load = () => JSON.parse(sessionStorage.getItem(NS) || '{"seq":0,"complete":false,"data":{},"removed":{}}');
    const save = (s) => Storage.prototype.setItem.call(sessionStorage, NS, JSON.stringify(s));
    window.AndroidBridge = {
      saveFile() {}, bioStatus: () => 'unavailable', bioEnrolled: () => false,
      scheduleExitReminder() {}, cancelExitReminder() {}, notificationPermission: () => 'granted', requestNotificationPermission() {},
      storeSet(k, v) {
        const s = load(); s.data[k] = v; delete s.removed[k]; s.seq++; save(s); return String(s.seq);
      },
      storeRemove(k) { const s = load(); delete s.data[k]; s.removed[k] = 1; s.seq++; save(s); return String(s.seq); },
      storeMarkComplete() { const s = load(); s.complete = true; save(s); return true; },
      storeSnapshot() { const s = load(); return JSON.stringify({ seq: s.seq, complete: s.complete, data: s.data, removed: Object.keys(s.removed) }); }
    };
    if (!localStorage.getItem('seeded')) {
      localStorage.setItem('seeded', '1');
      localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه']));
    }
  });

  await p4.goto(BASE + '/index.html');
  await p4.waitForTimeout(600);
  await login(p4);

  // افزودن رکورد ساپورت تیمی از طریق addTeamArchiveRecords
  const importedCount = await p4.evaluate(() => {
    const testRecords = [{
      id: 1791699000123,
      type: 'support',
      company: 'کرانه',
      date: '۱۴۰۵/۰۷/۲۱',
      day: 'دوشنبه',
      dateISO: '2026-10-12',
      jy: 1405, jm: 7, jd: 21,
      by: { id: 'colleague-77', name: 'کامران' },
      text: 'پیکربندی روتر کرانه',
      actions: 'پیکربندی روتر',
      pending: '',
      tech: '',
      checklist: null
    }];
    const res = addTeamArchiveRecords(testRecords, { id: 'colleague-77', name: 'کامران' });
    return res.added;
  });
  ok('team archive record imported', importedCount === 1);

  // شبیه‌سازی ری‌استارت گوشی: WebView نوشته آخر را گم کرده اما نسخه بومی نگه داشته
  await p4.evaluate(() => {
    // بازگردانی دستی localStorage به پیش از وارد کردن بدون اطلاع نسخه دوم
    const rawSet = typeof nativeSetItem !== 'undefined' ? nativeSetItem : Storage.prototype.setItem;
    rawSet.call(localStorage, 'geomat_logs_v2', '[]');
    rawSet.call(localStorage, 'geomat_mirror_seq', '1');
  });

  // بارگذاری مجدد برنامه
  await p4.reload();
  await p4.waitForTimeout(800);
  await login(p4);

  const logsAfterRestart = await p4.evaluate(() => getLogs());
  const importedSurvived = logsAfterRestart.some(l => l.id === 1791699000123 && l.company === 'کرانه');
  ok('imported team archive records survive phone restart via durable mirror', importedSurvived, `count: ${logsAfterRestart.length}`);

  await ctx4.close();

  ok('no page errors', !errs.length, errs.join(';'));
  await b.close();
})();
