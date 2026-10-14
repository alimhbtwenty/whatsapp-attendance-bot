const { chromium } = require('playwright');
const fs = require('fs');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + x : ''));
const axePath = (() => { try { return require.resolve('axe-core/axe.min.js'); } catch (e) { return process.env.AXE_PATH; } })();
const axe = fs.readFileSync(axePath, 'utf8');

const LONG_COMP = 'شرکت مهندسی و بازرگانی توسعه و نوسازی صنایع نفت و گاز خاورمیانه پیشرو';

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, timezoneId: 'Asia/Tehran', bypassCSP: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  await p.clock.install({ time: new Date('2026-10-13T12:00:00+03:30') });

  await p.addInitScript((comp) => {
    localStorage.clear();
    localStorage.setItem('geomat_companies_v2', JSON.stringify([comp, 'کرانه']));
    localStorage.setItem('geomat_settings_v1', JSON.stringify({ theme: 'dark', adminPhone: '09120000001' }));
    localStorage.setItem('geomat_open_entry_v1', JSON.stringify({
      company: comp,
      dateISO: '2026-10-13',
      inTime: '08:30',
      logId: 1,
      ts: Date.now(),
      notified: false
    }));
    localStorage.setItem('geomat_logs_v2', JSON.stringify([
      {
        id: 1,
        type: 'attendance',
        company: comp,
        date: '۱۴۰۵/۰۷/۲۱',
        day: 'سه‌شنبه',
        dateISO: '2026-10-13',
        action: 'both',
        inTime: '08:30',
        outTime: '17:00',
        durationMins: 510,
        durationText: '8:30',
        text: 'متن',
        by: { id: '09120000001', name: 'مدیر' }
      },
      {
        id: 2,
        type: 'support',
        company: comp,
        date: '۱۴۰۵/۰۷/۲۱',
        day: 'سه‌شنبه',
        dateISO: '2026-10-13',
        actions: 'شرح اقدامات ساپورت شبکه',
        pending: 'کارهای باقی‌مانده',
        tech: '192.168.1.1',
        checklist: [],
        durationMins: 0,
        durationText: '-',
        by: { id: '09120000001', name: 'مدیر' }
      }
    ]));
  }, LONG_COMP);

  await p.goto(BASE + '/index.html');
  await login(p);
  if (await p.locator('#confirmModal.open').count()) await p.click('#confirmModal [data-click*="false"]');
  await p.waitForTimeout(500);

  // 1. Touch targets (минимум 40px)
  const discardBox = await p.locator('#openEntryBanner button[data-click*="discardOpenEntry"]').boundingBox();
  ok('open entry discard button meets minimum 40px touch target', discardBox && discardBox.width >= 40 && discardBox.height >= 40, discardBox ? `width=${Math.round(discardBox.width)} height=${Math.round(discardBox.height)}` : 'not found');

  await p.click('#tabArchiveBtn');
  await p.waitForTimeout(300);
  const delBtn = p.locator('#archiveStream button[aria-label="حذف رکورد"]').first();
  const delBox = await delBtn.boundingBox();
  ok('archive delete button meets minimum 40px touch target', delBox && delBox.width >= 40 && delBox.height >= 40, delBox ? `width=${Math.round(delBox.width)} height=${Math.round(delBox.height)}` : 'not found');

  const cardData = await p.evaluate(() => {
    const card = document.querySelector('#archiveStream .record-card-item');
    if (!card) return null;
    return {
      cardScroll: card.scrollWidth,
      cardClient: card.clientWidth,
      overflow: card.scrollWidth > card.clientWidth
    };
  });
  ok('archive card with long company name does not horizontally overflow', cardData && !cardData.overflow, cardData ? `scroll=${cardData.cardScroll} client=${cardData.cardClient}` : 'no card');

  // Archive company filter chips have aria-pressed
  const chipPressed = await p.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('#archiveCompanyFilters .filter-chip'));
    if (!chips.length) return null;
    return chips.map(c => ({
      text: c.textContent.trim(),
      active: c.classList.contains('active'),
      pressed: c.getAttribute('aria-pressed')
    }));
  });
  const allHavePressed = chipPressed && chipPressed.length > 0 && chipPressed.every(c => c.pressed === (c.active ? 'true' : 'false'));
  ok('archive filter chips have aria-pressed attribute matching active state', allHavePressed, chipPressed ? JSON.stringify(chipPressed.slice(0, 3)) : 'no chips');

  // 2. Messenger action sheet accessibility (role="dialog", accessible name, aria-modal)
  await p.click('#tabMessengerBtn');
  await p.waitForTimeout(200);
  await p.evaluate(() => {
    document.getElementById('tgSheetPreview').textContent = 'تست پیام';
    document.getElementById('tgActionSheet').classList.add('open');
  });
  const sheetAttrs = await p.evaluate(() => {
    const s = document.getElementById('tgActionSheet');
    return {
      role: s.getAttribute('role'),
      modal: s.getAttribute('aria-modal'),
      label: s.getAttribute('aria-label') || s.getAttribute('aria-labelledby')
    };
  });
  ok('tgActionSheet has dialog role and modal attribute', sheetAttrs.role === 'dialog' && sheetAttrs.modal === 'true', `role=${sheetAttrs.role} modal=${sheetAttrs.modal}`);
  ok('tgActionSheet has accessible name', Boolean(sheetAttrs.label), `label=${sheetAttrs.label}`);
  await p.evaluate(() => document.getElementById('tgActionSheet').classList.remove('open'));

  // 3. Flow modal prompt labels (missing entry, gap prompt)
  await p.evaluate(() => {
    askMissingEntry('17:00');
  });
  await p.waitForTimeout(100);
  const missingLabel = await p.getAttribute('#flowModal', 'aria-label');
  ok('missing entry flow modal has specific aria-label', missingLabel === 'ورود ثبت نشده', `label=${missingLabel}`);
  await p.evaluate(() => resolveFlowModal(null));

  await p.evaluate(() => {
    askGapReason('12:00', '13:00');
  });
  await p.waitForTimeout(100);
  const gapLabel = await p.getAttribute('#flowModal', 'aria-label');
  ok('gap prompt flow modal has specific aria-label', gapLabel === 'بین دو حضور کجا بودید؟', `label=${gapLabel}`);
  await p.evaluate(() => resolveFlowModal(null));

  await b.close();
})();
