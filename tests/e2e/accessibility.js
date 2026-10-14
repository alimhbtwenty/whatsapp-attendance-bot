// دسترس‌پذیری (دور ۴ بازبینی): axe-core روی همه صفحه‌های اصلی در تم تیره و روشن؛ هر خطای serious/critical یعنی شکست.
const { chromium } = require('playwright');
const fs = require('fs');
const { login, unlockTech } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);
const axePath = (() => { try { return require.resolve('axe-core/axe.min.js'); } catch (e) { return process.env.AXE_PATH; } })();
(async () => {
  const axe = fs.readFileSync(axePath, 'utf8');
  const b = await chromium.launch();
  for (const theme of ['dark', 'light']) {
    // bypassCSP فقط برای تزریق axe در تست؛ CSP برنامه جای دیگری تست می‌شود
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, bypassCSP: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(8000);
    await p.addInitScript((t) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1');
      localStorage.setItem('geomat_settings_v1', JSON.stringify({ theme: t }));
      localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه', 'هاستیدا'])); }, theme);
    await p.goto(BASE + '/index.html'); await p.waitForTimeout(600);
    const audit = async (name) => {
      await p.addScriptTag({ content: axe });
      const res = await p.evaluate(async () => {
        const r = await window.axe.run(document, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
        return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
          .map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
      });
      ok(`${theme} ${name}: no serious/critical accessibility issues`, res.length === 0, res.join(' ;; '));
    };
    await audit('setup screen');
    await login(p);
    if (await p.locator('#confirmModal.open').count()) await p.click('#confirmModal [data-click*="false"]');
    await p.waitForTimeout(3000); // پیام‌های کوتاه (toast) محو شوند
    for (const [tab, name] of [['#tabAttendanceBtn', 'attendance'], ['#tabSupportBtn', 'support'], ['#tabArchiveBtn', 'archive'], ['#tabMessengerBtn', 'messenger']]) {
      await p.click(tab); await p.waitForTimeout(300); await audit(name);
    }
    await p.click('#tabSupportBtn'); await p.click('#supportViewRow button:nth-child(2)');
    await unlockTech(p); await p.waitForTimeout(3000);
    await audit('technical file');
    await ctx.close();
  }
  await b.close();
})();
