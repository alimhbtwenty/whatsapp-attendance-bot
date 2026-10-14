// تست خطاهای دسترسی‌پذیری و رابط کاربری (UI QA findings 2026-10-13)
const { chromium } = require('playwright');
const fs = require('fs');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + x : ''));
const axePath = (() => { try { return require.resolve('axe-core/axe.min.js'); } catch (e) { return process.env.AXE_PATH; } })();

(async () => {
  const axe = fs.readFileSync(axePath, 'utf8');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, bypassCSP: true });
  const p = await ctx.newPage();
  p.setDefaultTimeout(8000);
  await p.clock.install({ time: new Date('2026-10-13T12:00:00+03:30') });

  await p.addInitScript(() => {
    localStorage.setItem('geomat_settings_v1', JSON.stringify({ theme: 'light' }));
    localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه', 'هاستیدا']));
  });

  await p.goto(BASE + '/index.html');
  await login(p);
  if (await p.locator('#confirmModal.open').count()) await p.click('#confirmModal [data-click*="false"]');
  await p.waitForTimeout(500);

  const runAxeOnElement = async (selector, customRules = {}) => {
    await p.addScriptTag({ content: axe });
    return await p.evaluate(async ([sel, cRules]) => {
      const el = document.querySelector(sel);
      if (!el) return ['element not found'];
      const r = await window.axe.run(el, {
        resultTypes: ['violations'],
        rules: { region: { enabled: false }, ...cRules }
      });
      return r.violations
        .filter(v => v.impact === 'serious' || v.impact === 'critical')
        .map(v => `${v.id}: ${v.description} (${v.nodes.map(n => n.target.join(' ')).join(' | ')})`);
    }, [selector, customRules]);
  };

  // 1. دیالوگ‌های شیشه‌ای باید نام قابل دسترس داشته باشند (aria-dialog-name)
  const modals = ['#addModal', '#calendarModal', '#outboxModal', '#confirmModal', '#invItemModal', '#invPanelModal', '#vaultModal', '#flowModal'];
  for (const m of modals) {
    await p.evaluate((sel) => document.querySelector(sel).classList.add('open'), m);
    const errs = await runAxeOnElement(m, { 'aria-dialog-name': { enabled: true } });
    ok(`modal ${m} has accessible name`, !errs.some(e => e.includes('aria-dialog-name')), errs.join('; '));
    await p.evaluate((sel) => document.querySelector(sel).classList.remove('open'), m);
  }

  // 2. دکمه تایید حذف باید کنتراست رنگی استاندارد داشته باشد (color-contrast)
  await p.evaluate(() => {
    document.getElementById('confirmText').textContent = 'آیا مطمئن هستید؟';
    document.getElementById('confirmModal').classList.add('open');
  });
  const confirmErrs = await runAxeOnElement('#confirmModal', { 'color-contrast': { enabled: true } });
  ok('confirm delete button meets color contrast requirements', !confirmErrs.some(e => e.includes('color-contrast')), confirmErrs.join('; '));
  await p.evaluate(() => document.getElementById('confirmModal').classList.remove('open'));

  // 3. ورودی‌های رمز در vaultModal باید برچسب دسترس‌پذیر داشته باشند (label)
  await p.evaluate(() => {
    document.getElementById('vaultModalTitle').textContent = 'تغییر رمز';
    document.getElementById('vaultModal').classList.add('open');
  });
  const vaultErrs = await runAxeOnElement('#vaultModal', { label: { enabled: true } });
  ok('vault modal password inputs have accessible labels', !vaultErrs.some(e => e.includes('label')), vaultErrs.join('; '));
  await p.evaluate(() => document.getElementById('vaultModal').classList.remove('open'));

  await ctx.close();
  await b.close();
})();
