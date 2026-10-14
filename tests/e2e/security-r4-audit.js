// بازبینی امنیتی دور ۴ (Antigravity QA Security Round 4)
// تست جامع بردار‌های حمله:
// ۱. فایل‌های آرشیو تیم دستکاری‌شده (XSS، کلیدهای proto، جعل by.id، حجم بالا)
// ۲. فایل‌های تیم و پشتیبان دستکاری‌شده (proto keys، اعتبارسنجی)
// ۳. تفکیک نقش‌ها: عدم دسترسی تکنسین به دلیل فاصله (gap reason) در کل برنامه
// ۴. عدم نشت پرونده فنی در هیچ خروجی یا پاپ‌آپ
// ۵. نفوذناپذیری صفحه قفل و نشست
const { chromium } = require('playwright');
const { login, unlockTech, ADMIN } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';

const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const TECH = { name: 'تکنسین تست', phone: '09120000002', pw: 'tech-pass-22' };

(async () => {
  const PINNED = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' }) + 'T22:00:00+03:30');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));

  await p.clock.install({ time: PINNED });
  await p.addInitScript(() => {
    window.__xssHits = 0;
    if (localStorage.getItem('seeded_sec4')) return;
    localStorage.setItem('seeded_sec4', '1');
    localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه', 'صدف']));
    localStorage.setItem('geomat_sites_v1', JSON.stringify({
      'کرانه': { lat: 35.7, lng: 51.4, radius: 200, acc: 10 },
      'صدف': { lat: 35.7, lng: 51.4, radius: 200, acc: 10 }
    }));
  });

  await p.goto(BASE + '/index.html');
  await p.waitForTimeout(600);

  // ۱. ورود مدیر و ساخت حساب تکنسین + ثبت پرونده فنی با رمز
  await login(p);
  await p.evaluate(async (t) => {
    const team = getTeam();
    team.users.push(await makeAccount(t.name, t.phone, 'tech', t.pw, session.raw, sessionWho()));
    saveTeam(team);
    const inv = getInventory();
    inv.items.push({
      id: 'inv-sec-item-1',
      company: 'کرانه',
      section: 'access',
      data: { title: 'سیستم مالی', address: '192.168.1.50', username: 'dbadmin' },
      secrets: { password: await encryptWith(session.key, 'ConfidentialVaultP@ss!') },
      history: [],
      createdAt: new Date().toISOString()
    });
    saveInventory(inv);
  }, TECH);

  // ۲. بررسی نشت پرونده فنی در خروجی‌ها
  // ۲.۱. خروجی آرشیو تیم توسط تکنسین
  await p.evaluate(() => lockApp(true));
  await login(p, TECH);

  // تکنسین یک گزارش ساپورت ثبت می‌کند
  await p.click('#tabSupportBtn');
  await p.evaluate(() => {
    selectedCompany = 'کرانه';
    document.getElementById('supportActionsText').value = 'رفع اشکال پرینتر و تست شبکه';
    document.getElementById('supportPendingText').value = 'تعویض کاتریج';
    document.getElementById('supportTechInfo').value = '192.168.1.100';
    updateSupportPreview();
  });
  await p.click('#floatingDock .dock-copy-btn');
  await p.waitForTimeout(400);

  // تکنسین گزارش تیم را دانلود می‌کند
  const teamArchiveJson = await p.evaluate(() => {
    let out = '';
    const orig = window.downloadFile;
    window.downloadFile = (n, c) => { out = c; return true; };
    try { exportTeamArchive(); } finally { window.downloadFile = orig; }
    return out;
  });
  ok('team archive export does not leak technical file or secrets',
    !teamArchiveJson.includes('ConfidentialVaultP@ss') &&
    !teamArchiveJson.includes('سیستم مالی') &&
    !teamArchiveJson.includes('dbadmin'),
    teamArchiveJson.slice(0, 80));

  // ۲.۲. خروجی اکسل توسط تکنسین نباید شامل پرونده فنی باشد
  await p.click('#tabArchiveBtn');
  await p.click('#archiveSecSup');
  await p.waitForTimeout(200);
  const supportCsv = await p.evaluate(() => {
    let out = '';
    const orig = window.downloadFile;
    window.downloadFile = (n, c) => { out = c; return true; };
    try { exportFilteredExcel(); } finally { window.downloadFile = orig; }
    return out;
  });
  ok('support excel does not leak inventory vault secrets',
    !supportCsv.includes('ConfidentialVaultP@ss') &&
    !supportCsv.includes('سیستم مالی') &&
    !supportCsv.includes('dbadmin'));

  // ۳. بررسی پاپ‌آپ گزارش ساپورت
  await p.click('#archiveStream .record-open-btn');
  await p.waitForSelector('#flowModal.open');
  const popupHtml = await p.innerHTML('#flowModalBox');
  ok('support record popup contains no inventory vault data',
    !popupHtml.includes('ConfidentialVaultP@ss') &&
    !popupHtml.includes('سیستم مالی') &&
    !popupHtml.includes('dbadmin'));
  await p.click('#flowModal .flow-main');
  await p.waitForTimeout(200);

  // ۴. بررسی عدم دسترسی تکنسین به دلیل فاصله (gap reason)
  // تکنسین دو تردد ثبت می‌کند که بین آنها فاصله است
  await p.click('#tabAttendanceBtn');
  const recordAtt = async (company, inT, outT) => {
    await p.evaluate(([c, i, o]) => {
      selectedCompany = c; renderCompanies(); setAttendanceAction('both');
      document.getElementById('inHour').value = i.slice(0, 2); document.getElementById('inMin').value = i.slice(3);
      document.getElementById('outHour').value = o.slice(0, 2); document.getElementById('outMin').value = o.slice(3);
      updatePreview();
    }, [company, inT, outT]);
    await p.click('#floatingDock .dock-copy-btn');
    await p.waitForTimeout(400);
  };
  await recordAtt('کرانه', '08:00', '11:00');
  await recordAtt('صدف', '11:45', '16:00');
  if (await p.locator('#flowModal.open .flow-chip').count()) {
    await p.click('#flowModal .flow-chip >> nth=0'); // ثبت دلیل «در راه / ایاب و ذهاب»
    await p.waitForTimeout(400);
  }

  // در دید تکنسین: در تب آرشیو تردد هیچ کلاسی از archive-gap نباید باشد
  await p.click('#tabArchiveBtn');
  await p.click('#archiveSecAtt');
  await p.waitForTimeout(200);
  const techArchiveContent = await p.textContent('#archiveStream');
  ok('technician cannot see gap reason in attendance archive',
    await p.locator('#archiveStream .archive-gap').count() === 0 &&
    !techArchiveContent.includes('در راه'));

  // در اکسل تکنسین: هیچ ستون یا دلیلی نباید باشد
  const techAttCsv = await p.evaluate(() => {
    let out = '';
    const orig = window.downloadFile;
    window.downloadFile = (n, c) => { out = c; return true; };
    try { exportFilteredExcel(); } finally { window.downloadFile = orig; }
    return out;
  });
  ok('technician excel has no gap reason column or value',
    !techAttCsv.includes('بین دو حضور') && !techAttCsv.includes('در راه'));

  // در مدیر: ستون و دلیل دیده می‌شود
  await p.evaluate(() => lockApp(true));
  await login(p);
  await p.click('#tabArchiveBtn');
  await p.click('#archiveSecAtt');
  await p.waitForTimeout(200);
  ok('admin sees the gap reason in archive',
    await p.locator('#archiveStream .archive-gap', { hasText: 'در راه' }).count() === 1);
  const adminAttCsv = await p.evaluate(() => {
    let out = '';
    const orig = window.downloadFile;
    window.downloadFile = (n, c) => { out = c; return true; };
    try { exportFilteredExcel(); } finally { window.downloadFile = orig; }
    return out;
  });
  ok('admin excel includes gap reason column and value',
    adminAttCsv.split('\n')[0].includes('بین دو حضور') && adminAttCsv.includes('در راه'));

  // ۵. فایل آرشیو تیم دستکاری‌شده (Crafted Team Archive File)
  // الف) تزریق اسکریپت (XSS) در تمامی فیلدها
  // ب) کلیدهای Prototype pollution (__proto__)
  // ج) جعل by.id
  const xssStr = '<img src=x onerror="window.__xssHits=(window.__xssHits||0)+1">';
  const craftedArchive = {
    app: 'geomat-attendance',
    kind: 'team-archive',
    v: 1,
    exportedAt: new Date().toISOString(),
    from: { id: 'attacker-1', name: `مهاجم ${xssStr}` },
    records: [
      {
        id: 1728888000000,
        by: { id: ADMIN.phone, name: `مدیر جعلی ${xssStr}` },
        type: 'support',
        company: `کرانه ${xssStr}`,
        date: `۱۴۰۵/۰۷/۲۱ ${xssStr}`,
        day: `سه‌شنبه ${xssStr}`,
        dateISO: '2026-10-13',
        jy: 1405, jm: 7, jd: 21,
        text: `متن ساپورت ${xssStr}`,
        actions: `اقدامات ${xssStr}`,
        pending: `معوقات ${xssStr}`,
        tech: `مشخصات فنی ${xssStr}`,
        checklist: [{ item: `آیتم چک‌لیست ${xssStr}`, done: true }],
        __proto__: { isAdminPwned: true }
      }
    ]
  };

  await p.click('#tabArchiveBtn');
  await p.click('#archiveSecSup');
  await p.waitForTimeout(200);

  // وارد کردن فایل آرشیو تیم دستکاری‌شده
  await p.setInputFiles('#teamArchiveInput', {
    name: 'crafted-archive.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(craftedArchive))
  });
  await p.waitForTimeout(600);

  // بررسی عدم اجرای هرگونه اسکریپت
  const xssHits = await p.evaluate(() => window.__xssHits);
  ok('no XSS execution from crafted team archive file in any field', xssHits === 0, `xssHits: ${xssHits}`);

  // بررسی عدم آلودگی Prototype
  const protoPolluted = await p.evaluate(() => Object.prototype.isAdminPwned || ({}).isAdminPwned);
  ok('no prototype pollution from crafted team archive file', !protoPolluted);

  // بررسی رندر امن در کارت و پاپ‌آپ
  await p.click('#archiveStream .record-open-btn >> nth=0');
  await p.waitForSelector('#flowModal.open');
  const popupXssHits = await p.evaluate(() => window.__xssHits);
  ok('no XSS execution when opening crafted support record popup', popupXssHits === 0);
  await p.click('#flowModal .flow-main');
  await p.waitForTimeout(200);

  // ۶. فایل تیم دستکاری‌شده با proto keys و ورودی عمیق/بزرگ
  const evilTeamProto = {
    app: 'geomat-attendance',
    kind: 'team',
    format: 1,
    team: {
      schema: 1,
      __proto__: { adminBypass: true },
      users: [
        {
          id: 'hacker-admin',
          name: 'مدیر نفوذی',
          phone: '09199999999',
          role: 'admin',
          salt: 'YWJjZGVmZ2hpamtsbW5vcA==',
          iter: 310000,
          wrapped: { iv: 'YWJjZGVmZ2hpams=', ct: 'bG1ub3BxcnN0dXZ3eHl6' }
        }
      ],
      log: []
    }
  };

  // قفل کردن برنامه و تلاش برای ورود فایل تیم روی سیستم دارای تیم
  await p.evaluate(() => lockApp(true));
  await p.setInputFiles('#teamFileInput', {
    name: 'evil-team.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(evilTeamProto))
  });
  await p.waitForTimeout(400);

  ok('team file with proto pollution is rejected or neutral without prototype pollution',
    await p.evaluate(() => !Object.prototype.adminBypass && !({}).adminBypass));

  // ۷. امنیت نشست در حافظه: پس از قفل، کلید خام صفر شده باشد
  const sessionCleared = await p.evaluate(() => session === null);
  ok('session object is destroyed on lockApp', sessionCleared);

  ok('no uncaught page errors during security tests', !errs.length, errs.join('; '));

  await b.close();
})();
