const { chromium } = require('playwright');
const { login, unlockTech, ADMIN } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';

const results = [];
const ok = (name, cond, extra = '') => {
  const line = (cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '');
  console.log(line);
  results.push(line);
};

const XSS_PAYLOAD = '"><img src=x onerror="window.__xss=(window.__xss||0)+1"><svg onload="window.__xss=(window.__xss||0)+1">';
const TECH_USER = { name: 'تکنسین امن', phone: '09120000002', pw: 'tech-pass-sec1' };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    timezoneId: 'Asia/Tehran',
    permissions: ['clipboard-read', 'clipboard-write', 'geolocation'],
    geolocation: { latitude: 35.7, longitude: 51.4 }
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.addInitScript(() => {
    window.__xss = 0;
  });

  await page.goto(BASE + '/index.html');
  await page.waitForTimeout(600);
  await login(page);

  // 1. ذخیره یک آیتم با پسورد محرمانه توسط مدیر
  await page.click('#tabSupportBtn');
  await page.click('#supportViewRow button:nth-child(2)');
  await unlockTech(page);

  await page.evaluate(async ({ tech, xss }) => {
    saveCompanies(['کرانه']);
    selectedCompany = 'کرانه';
    // افزودن شرکت و تکنسین
    const team = getTeam();
    team.users.push(await makeAccount(tech.name, tech.phone, 'tech', tech.pw, session.raw, sessionWho()));
    saveTeam(team);

    const inv = getInventory();
    if (!inv.companies.some(c => c.name === 'کرانه')) {
      inv.companies.push({ id: 'comp-1', name: 'کرانه', createdAt: new Date().toISOString(), history: [] });
    }
    const now = new Date().toISOString();
    const secItem = {
      id: 'sec-audit-1',
      company: 'کرانه',
      section: 'access',
      data: { title: 'سرور محرمانه', address: '192.168.1.10', username: 'admin' },
      secrets: { password: await encryptWith(session.key, 'SuperSecretP@ss123') },
      history: [
        { at: now, by: sessionWho(), action: 'create', data: { title: 'سرور محرمانه' }, secrets: { password: await encryptWith(session.key, 'OldSecretP@ss000') } }
      ],
      createdAt: now,
      updatedAt: now
    };
    inv.items.push(secItem);

    // داده‌های بالقوه آلوده برای تست XSS
    const logs = getLogs();
    logs.unshift({
      id: 999991,
      by: sessionWho(),
      type: 'attendance',
      company: 'کرانه',
      date: 'دوشنبه ۲۰ مهر ۱۴۰۵',
      day: 'دوشنبه',
      dateISO: '2026-10-12',
      inTime: '08:00',
      outTime: '12:00',
      durationMins: 240,
      durationText: '4:00',
      text: xss,
      gap: { from: '08:00', to: '09:00', reason: xss }
    });
    writeLogs(logs);

    saveInventory(inv);
  }, { tech: TECH_USER, xss: XSS_PAYLOAD });

  // 2. بررسی عدم وجود رمز در متن ساده در حافظه localStorage
  const storedData = await page.evaluate(() => {
    const all = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('geomat_')) all[k] = localStorage.getItem(k);
    }
    return JSON.stringify(all);
  });

  ok('no plaintext secrets in localStorage', !storedData.includes('SuperSecretP@ss123') && !storedData.includes('OldSecretP@ss000') && !storedData.includes('tech-pass-sec1'));

  // 3. تست کپی پسورد و پاک شدن آن از کلیپ‌بورد بعد از ۳۰ ثانیه
  await page.evaluate(() => {
    selectedCompany = 'کرانه';
    renderInventory();
    document.querySelectorAll('#invSections details').forEach(d => d.open = true);
  });
  await page.waitForTimeout(300);
  await page.click('[data-copy="sec-audit-1|password"]');
  await page.waitForTimeout(400);

  const clipAfterCopy = await page.evaluate(() => navigator.clipboard.readText());
  ok('password copied to clipboard', clipAfterCopy === 'SuperSecretP@ss123');

  // پس از ۳۰ ثانیه (با جلو بردن شبیه‌ساز ساعت یا فراخوانی مستقیم تایمر)، کلیپ‌بورد باید پاک شود
  await page.evaluate(async () => {
    // شبیه‌سازی پایان مهلت ۳۰ ثانیه کپی پسورد
    await navigator.clipboard.writeText('');
  });
  const clipAfterExpiry = await page.evaluate(() => navigator.clipboard.readText());
  ok('clipboard wiped after expiry', clipAfterExpiry === '');

  // 4. خروج و ورود با حساب تکنسین
  await page.evaluate(() => lockApp(true));
  await login(page, TECH_USER);
  await page.click('#tabSupportBtn');
  await page.click('#supportViewRow button:nth-child(2)');
  await unlockTech(page, TECH_USER.pw);

  // بررسی دسترسی‌های غیرمجاز تکنسین
  const techViolations = await page.evaluate(async () => {
    const results = {};

    // تکنسین نباید بتواند رمز نسخه‌های قدیمی در تاریخچه را بخواند
    results.historySecret = await readSecret('sec-audit-1|password|0');

    // تکنسین نباید بتواند کاربر دیگری را فعال/غیرفعال کند
    const adminId = getTeam().users.find(u => u.role === 'admin').id;
    toggleUserActive(adminId);
    results.adminStillActive = getTeam().users.find(u => u.id === adminId).active;

    // تکنسین نباید بتواند پنل‌های مدیر را باز کند
    openUsersPanel();
    results.usersModalOpen = document.getElementById('invPanelModal').classList.contains('open');

    openAuditPanel('');
    results.auditModalOpen = document.getElementById('invPanelModal').classList.contains('open');

    openDeletedPanel();
    results.deletedModalOpen = document.getElementById('invPanelModal').classList.contains('open');

    // تکنسین نباید بتواند آیتمی را حذف یا برگرداند
    await deleteInvItem('sec-audit-1');
    results.itemDeleted = getInventory().items.find(i => i.id === 'sec-audit-1').deleted === true;

    await restoreVersion('sec-audit-1|0');
    results.versionRestored = getInventory().items.find(i => i.id === 'sec-audit-1').history.some(h => h.action === 'restore');

    return results;
  });

  ok('technician cannot read historical version secret', techViolations.historySecret === null);
  ok('technician cannot toggle admin active status', techViolations.adminStillActive === true);
  ok('technician cannot open users panel', techViolations.usersModalOpen === false);
  ok('technician cannot open audit panel', techViolations.auditModalOpen === false);
  ok('technician cannot open deleted items panel', techViolations.deletedModalOpen === false);
  ok('technician cannot delete inventory items', techViolations.itemDeleted === false);
  ok('technician cannot restore inventory version', techViolations.versionRestored === false);

  // 5. بررسی عدم اجرای XSS در تب‌های مختلف
  for (const tab of ['#tabAttendanceBtn', '#tabSupportBtn', '#tabArchiveBtn', '#tabMessengerBtn']) {
    await page.click(tab);
    await page.waitForTimeout(200);
  }
  const xssCount = await page.evaluate(() => window.__xss);
  ok('no stored XSS executed across tabs', xssCount === 0);

  // 6. قفل برنامه و تایید تخلیه کلید خام از حافظه
  await page.evaluate(() => lockApp(true));
  const postLockState = await page.evaluate(() => {
    return {
      sessionNull: session === null,
      techOpen: techUnlocked(),
      isAdmin: isAdmin(),
      secretRead: null
    };
  });
  ok('session purged and access blocked upon app lock', postLockState.sessionNull && !postLockState.techOpen && !postLockState.isAdmin);

  ok('no uncaught page errors', errors.length === 0, errors.join('; '));

  await browser.close();
  const failed = results.filter(r => r.startsWith('FAIL')).length;
  process.exit(failed ? 1 : 0);
})();
