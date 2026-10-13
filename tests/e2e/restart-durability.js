// گزارش مالک (APK): رکوردی که حذف شد بعد از ری‌استارت گوشی برگشت؛ ورود تازه هم گم شد و خروج با ساعت رکورد حذف‌شده جفت شد.
// علت: WebView نوشته‌های localStorage را با تأخیر روی دیسک می‌برد و با ری‌استارت، تغییرهای آخر گم می‌شوند.
// این تست با یک پل اندروید ساختگی (که مثل فایل‌های برنامه بین بارگذاری‌ها می‌ماند) همان ری‌استارت را شبیه‌سازی می‌کند:
// localStorage به وضع پیش از حذف برمی‌گردد و صفحه دوباره بار می‌شود.
const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: 'Asia/Tehran' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  // ساعت ثابت (ظهر): نزدیک ۰۸:۰۰ یا ۰۹:۳۰، ورود «همین لحظه» حساب می‌شد و پنجره «ثبت موقعیت» جلوی کلیک را می‌گرفت
  await p.clock.install({ time: new Date('2026-10-12T12:00:00+03:30') });
  await p.addInitScript(() => {
    // «فایل‌های برنامه» در sessionStorage همین تب: با بارگذاری دوباره می‌مانند، مثل دیسک گوشی
    const NS = 'fake_native_store';
    // مثل MainActivity: seq، نشانه «کامل»، نشانه حذف هر کلید؛ هر نوشتنِ ناموفق «کامل» را پاک می‌کند.
    // sessionStorage['fail_key'] = نوشتنِ همین کلید شکست بخورد (دیسک پر)
    const load = () => JSON.parse(sessionStorage.getItem(NS) || '{"seq":0,"complete":false,"data":{},"removed":{}}');
    const save = (s) => Storage.prototype.setItem.call(sessionStorage, NS, JSON.stringify(s));
    window.__nativeCalls = [];
    window.AndroidBridge = {
      saveFile() {}, bioStatus: () => 'unavailable', bioEnrolled: () => false,
      scheduleExitReminder() {}, cancelExitReminder() {}, notificationPermission: () => 'granted', requestNotificationPermission() {},
      storeSet(k, v) {
        window.__nativeCalls.push(k); const s = load();
        if (sessionStorage.getItem('fail_key') === k) { s.complete = false; save(s); return '0'; }
        s.data[k] = v; delete s.removed[k]; s.seq++; save(s); return String(s.seq);
      },
      storeRemove(k) { window.__nativeCalls.push('-' + k); const s = load(); delete s.data[k]; s.removed[k] = 1; s.seq++; save(s); return String(s.seq); },
      storeMarkComplete() { const s = load(); s.complete = true; save(s); return true; },
      storeSnapshot() { const s = load(); return JSON.stringify({ seq: s.seq, complete: s.complete, data: s.data, removed: Object.keys(s.removed) }); }
    };
    if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه'])); }
  });
  await p.goto(BASE + '/index.html'); await p.waitForTimeout(700);
  await login(p);
  const rec = async (a, id, h, m) => {
    await p.click('#tabAttendanceBtn');
    await p.evaluate(([a, id, h, m]) => { selectedCompany = 'کرانه'; renderCompanies(); setAttendanceAction(a); document.getElementById(id + 'Hour').value = h; document.getElementById(id + 'Min').value = m; updatePreview(); }, [a, id, h, m]);
    await p.click('#floatingDock .dock-copy-btn'); await p.waitForTimeout(600);
  };
  // نوشتن مستقیم در localStorage بدون رد شدن از نسخه دوم (همان «دیسکِ WebView»)
  const rawSet = () => p.evaluate(() => { window.__rawSet = typeof nativeSetItem !== 'undefined' ? nativeSetItem : Storage.prototype.setItem; window.__rawRemove = typeof nativeRemoveItem !== 'undefined' ? nativeRemoveItem : Storage.prototype.removeItem; });

  await rec('in', 'in', '08', '00');
  ok('entry 08:00 recorded with an open entry', await p.evaluate(() => getLogs().length === 1 && !!getOpenEntry()));
  const diskBefore = await p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });

  await p.click('#tabArchiveBtn'); await p.waitForTimeout(200);
  await p.click('#archiveStream button[aria-label="حذف رکورد"]'); await p.click('#confirmOkBtn'); await p.waitForTimeout(300);
  ok('the record is deleted', await p.evaluate(() => getLogs().length === 0 && !getOpenEntry()));

  // ---------- ری‌استارت گوشی: WebView آخرین نوشته‌ها را گم کرده است ----------
  await rawSet();
  await p.evaluate((before) => {
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (!(k in before)) window.__rawRemove.call(localStorage, k); }
    for (const k in before) window.__rawSet.call(localStorage, k, before[k]);
  }, diskBefore);
  await p.reload(); await p.waitForTimeout(800);
  await login(p);
  const after = await p.evaluate(() => ({ logs: getLogs().length, open: !!getOpenEntry(), banner: document.getElementById('openEntryBanner').classList.contains('show') }));
  ok('after a restart the deleted record does not come back', after.logs === 0, JSON.stringify(after));
  ok('after a restart the deleted open entry does not come back', !after.open && !after.banner);

  // ورود تازه با ساعت دیگر → انتظار خروج فعال، و خروج با همین ساعت جفت می‌شود
  await rec('in', 'in', '09', '30');
  ok('the new entry shows the waiting-for-exit banner', await p.evaluate(() => document.getElementById('openEntryBanner').classList.contains('show') && getOpenEntry().inTime === '09:30'));
  await p.click('#tabAttendanceBtn'); await p.evaluate(() => setAttendanceAction('out')); await p.waitForTimeout(200);
  ok('the exit form uses the new entry time, not the deleted one', await p.evaluate(() => `${document.getElementById('inHour').value}:${document.getElementById('inMin').value}`) === '09:30');

  // ری‌استارت دوباره بعد از ورود تازه: ورود و بنرش می‌مانند
  const disk2 = await p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
  await rawSet();
  await p.evaluate((before) => { // WebView فقط تا پیش از ورود تازه را نوشته بود
    const logs = JSON.parse(before.geomat_logs_v2 || '[]'); logs.shift();
    window.__rawSet.call(localStorage, 'geomat_logs_v2', JSON.stringify(logs));
    window.__rawRemove.call(localStorage, 'geomat_open_entry_v1');
    window.__rawSet.call(localStorage, 'geomat_mirror_seq', '1');
  }, disk2);
  await p.reload(); await p.waitForTimeout(800); await login(p);
  ok('after another restart the new entry and its banner are still there', await p.evaluate(() => getLogs().length === 1 && getOpenEntry() && getOpenEntry().inTime === '09:30' && document.getElementById('openEntryBanner').classList.contains('show')));

  // فقط کلیدهای geomat_* به نسخه دوم می‌روند
  await p.evaluate(() => { window.__nativeCalls.length = 0; localStorage.setItem('other_key', 'x'); localStorage.setItem('geomat_user_name', 'نام'); });
  ok('only geomat_* keys are mirrored', await p.evaluate(() => JSON.stringify(window.__nativeCalls)) === JSON.stringify(['geomat_user_name']));
  ok('the backup file does not carry the mirror counter', await p.evaluate(() => { let data = null; const orig = window.downloadFile; window.downloadFile = (n, c) => { data = JSON.parse(c).data; return true; }; exportBackup(); window.downloadFile = orig; return data && !('geomat_mirror_seq' in data) && 'geomat_logs_v2' in data; }));

  // ---------- بازبینی دور ۷: نسخه دوم ناقص هرگز داده را پاک نمی‌کند ----------
  // نوشتنِ آرشیو در نسخه دوم شکست می‌خورد (دیسک پر) → «کامل» نیست؛ بعد یک نوشته دیگر گم می‌شود و برنامه دوباره باز می‌شود
  await p.evaluate(() => Storage.prototype.setItem.call(sessionStorage, 'fail_key', 'geomat_logs_v2'));
  await rec('out', 'out', '17', '00');
  const logsNow = await p.evaluate(() => getLogs().length);
  await rawSet();
  await p.evaluate(() => { const s = Number(localStorage.getItem('geomat_mirror_seq')); window.__rawSet.call(localStorage, 'geomat_mirror_seq', String(s - 1)); });
  await p.evaluate(() => Storage.prototype.setItem.call(sessionStorage, 'fail_key', ''));
  await p.reload(); await p.waitForTimeout(800); await login(p);
  ok('an incomplete mirror never removes or rolls back data', await p.evaluate(() => getLogs().length) === logsNow && await p.evaluate(() => !mirrorRestored && !!localStorage.getItem('geomat_team_v1')));
  ok('an incomplete mirror is rebuilt from current data on the next start', await p.evaluate(() => JSON.parse(AndroidBridge.storeSnapshot()).complete === true && JSON.parse(AndroidBridge.storeSnapshot()).data.geomat_logs_v2 === localStorage.getItem('geomat_logs_v2')));

  // بازگردانی فایل پشتیبان → شروع بعدی پیام «تغییرها برگردانده شد» نمی‌دهد (شمارنده جابه‌جا نمی‌شود)
  await p.evaluate(() => { const d = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('geomat_')) d[k] = localStorage.getItem(k); } replaceAppData(d); });
  await p.reload(); await p.waitForTimeout(800);
  ok('restoring a backup does not trigger a false recovery on the next start', await p.evaluate(() => mirrorRestored === false));
  ok('the counter is not in snapshots or restores', await p.evaluate(() => !('geomat_mirror_seq' in snapshotAppData())));

  // ---------- بازبینی دور ۸: بازگردانی با «حافظه پر» ----------
  // نوشته آخر آرشیو گم شده و بازگردانی‌اش با حافظه پر شکست می‌خورد → داده تازه‌ترِ نسخه دوم نباید رونویسی شود
  await rawSet();
  await p.evaluate(() => {
    const s = Number(localStorage.getItem('geomat_mirror_seq'));
    window.__rawSet.call(localStorage, 'geomat_logs_v2', '[]');                 // WebView نوشته آخر را گم کرده
    window.__rawSet.call(localStorage, 'geomat_mirror_seq', String(s - 1));
    window.__rawRemove.call(localStorage, 'geomat_backup_pre_1_4');            // چیزی برای آزاد کردن نیست
    Storage.prototype.setItem.call(sessionStorage, 'quota_key', 'geomat_logs_v2');
  });
  await p.addInitScript(() => {
    if (sessionStorage.getItem('quota_key') !== 'geomat_logs_v2') return;
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) { if (this === localStorage && k === 'geomat_logs_v2' && sessionStorage.getItem('quota_key') === 'geomat_logs_v2') throw new DOMException('full', 'QuotaExceededError'); return orig.call(this, k, v); };
  });
  await p.reload(); await p.waitForTimeout(800);
  ok('a restore that hits full storage tells the user', await p.evaluate(() => mirrorRestoreFailed === true && document.getElementById('toast').textContent.includes('حافظه')));
  ok('...and leaves the data exactly as the user sees it (no half-restore)', await p.evaluate(() => localStorage.getItem('geomat_logs_v2')) === '[]');
  ok('...and rebuilds the mirror from that view', await p.evaluate(() => { const s = JSON.parse(AndroidBridge.storeSnapshot()); return s.complete === true && s.data.geomat_logs_v2 === '[]'; }));
  // بازبینی دور ۹: کاری که بعد از آن انجام می‌شود، در شروع بعدی پاک نمی‌شود
  await p.evaluate(() => Storage.prototype.setItem.call(sessionStorage, 'quota_key', ''));
  await login(p);
  await rec('in', 'in', '10', '00');
  const work = await p.evaluate(() => localStorage.getItem('geomat_logs_v2'));
  await p.reload(); await p.waitForTimeout(800);
  ok('work done after a failed restore survives the next start', await p.evaluate(() => localStorage.getItem('geomat_logs_v2')) === work && await p.evaluate(() => !mirrorRestored));

  // بازبینی دور ۱۰: برگرداندن با حافظه پر باید «همه یا هیچ» بماند، حتی وقتی نسخه دوم کلیدی را حذف کرده بود
  await p.evaluate(() => {
    const NS = 'fake_native_store'; const st = JSON.parse(sessionStorage.getItem(NS));
    nativeSetItem.call(localStorage, 'geomat_open_entry_v1', 'o'.repeat(100));
    nativeSetItem.call(localStorage, 'geomat_zz_a', 'a'.repeat(10));
    nativeSetItem.call(localStorage, 'geomat_zz_b', 'b'.repeat(10));
    delete st.data.geomat_open_entry_v1; st.removed.geomat_open_entry_v1 = 1;
    st.data.geomat_zz_a = 'A'.repeat(110); st.data.geomat_zz_b = 'B'.repeat(500); st.complete = true;
    st.seq = Number(localStorage.getItem('geomat_mirror_seq')) + 10;
    Storage.prototype.setItem.call(sessionStorage, NS, JSON.stringify(st));
    Storage.prototype.setItem.call(sessionStorage, 'size_quota', '1');
  });
  await p.addInitScript(() => {
    if (sessionStorage.getItem('size_quota') !== '1') return;
    // سقف: همان مقدار فعلیِ داده + ۲۰ نویسه
    const used = () => { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + localStorage.getItem(k).length; } return n; };
    const limit = used() + 20;
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) {
      if (this === localStorage && sessionStorage.getItem('size_quota') === '1') {
        const cur = localStorage.getItem(k);
        if (used() - (cur === null ? 0 : k.length + cur.length) + k.length + String(v).length > limit) throw new DOMException('full', 'QuotaExceededError');
      }
      return orig.call(this, k, v);
    };
  });
  await p.reload(); await p.waitForTimeout(800);
  const rb = await p.evaluate(() => ({ failed: mirrorRestoreFailed, open: (localStorage.getItem('geomat_open_entry_v1') || '').length, a: localStorage.getItem('geomat_zz_a').length, b: localStorage.getItem('geomat_zz_b').length }));
  ok('a failed restore rolls back every key, including ones the mirror had deleted', rb.failed && rb.open === 100 && rb.a === 10 && rb.b === 10, JSON.stringify(rb));
  await p.evaluate(() => { Storage.prototype.setItem.call(sessionStorage, 'size_quota', '0'); nativeRemoveItem.call(localStorage, 'geomat_zz_a'); nativeRemoveItem.call(localStorage, 'geomat_zz_b'); nativeRemoveItem.call(localStorage, 'geomat_open_entry_v1'); });

  // حذفی که وسطش برنامه کشته شد: هم داده و هم نشانه حذف → حذف برنده است
  await p.evaluate(() => {
    const NS = 'fake_native_store'; const st = JSON.parse(sessionStorage.getItem(NS));
    st.data.geomat_open_entry_v1 = JSON.stringify({ company: 'کرانه', dateISO: '2026-01-01', inTime: '07:00' }); st.removed.geomat_open_entry_v1 = 1; st.seq += 5;
    Storage.prototype.setItem.call(sessionStorage, NS, JSON.stringify(st));
  });
  await p.reload(); await p.waitForTimeout(800);
  ok('a half-finished delete stays deleted on restore', await p.evaluate(() => localStorage.getItem('geomat_open_entry_v1') === null));

  ok('no page errors', !errs.length, errs.join(';'));
  await b.close();
})();
