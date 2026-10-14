// درخواست مالک: لمس اعلان یادآوری (یا دکمه «ثبت خروج») → تب تردد، خروج با ساعت «الان»، و صفحه روی ساعت خروج
const { chromium } = require('playwright');
const { login } = require('../helpers/session');
const BASE = process.env.BASE_URL || 'http://localhost:8765';
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + ' ' + x);

(async () => {
  const b = await chromium.launch();
  const run = async (action, opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 700 }, isMobile: true, timezoneId: 'Asia/Tehran' });
    const p = await ctx.newPage(); p.setDefaultTimeout(10000);
    p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.clock.install({ time: new Date(opts.now || '2026-10-12T18:07:00+03:30') });
    await p.addInitScript((o) => {
      if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1');
      localStorage.setItem('geomat_companies_v2', JSON.stringify(['کرانه', 'صدف']));
      localStorage.setItem('geomat_sites_v1', JSON.stringify({ 'کرانه': { lat: 35.7, lng: 51.4, radius: 200, acc: 10 } }));
      localStorage.setItem('geomat_open_entry_v1', JSON.stringify({ company: 'کرانه', dateISO: o.entryDate || '2026-10-12', inTime: o.inTime || '08:30', logId: 5, ts: 1, notified: true }));
    }, opts);
    await p.goto(BASE + '/index.html'); await p.waitForTimeout(600);
    if (opts.beforeLogin) await p.evaluate((a) => window.handleNotificationAction(a), action);
    await login(p);
    // از تب دیگری شروع شود، مثل وقتی برنامه روی آرشیو مانده بود؛ و صفحه بالا باشد
    if (!opts.beforeLogin) {
      // ساعت خروج فرم چیز دیگری باشد تا معلوم شود «الان» را خودِ اعلان گذاشته است
      await p.evaluate(() => { document.getElementById('outHour').value = '11'; document.getElementById('outMin').value = '11'; });
      await p.click('#tabArchiveBtn'); await p.evaluate(() => window.scrollTo(0, 0));
      await p.evaluate((a) => window.handleNotificationAction(a), action);
    }
    await p.waitForTimeout(900);
    const st = await p.evaluate(() => {
      const r = document.getElementById('outTimeRow').getBoundingClientRect();
      return {
        mode: systemMode, action: attendanceAction, company: selectedCompany,
        out: `${document.getElementById('outHour').value}:${document.getElementById('outMin').value}`,
        inT: `${document.getElementById('inHour').value}:${document.getElementById('inMin').value}`,
        visible: r.top >= 0 && r.bottom <= window.innerHeight, flash: document.getElementById('outTimeRow').classList.contains('time-row-flash')
      };
    });
    return { p, st };
  };

  for (const action of ['open', 'exit']) {
    const { p, st } = await run(action);
    const name = action === 'open' ? 'tapping the reminder' : 'the «ثبت خروج» button';
    ok(`${name} opens the attendance tab on an exit for the open site`, st.mode === 'attendance' && st.action === 'out' && st.company === 'کرانه', JSON.stringify(st));
    ok(`${name} sets the exit time to now`, st.out === '18:07', st.out);
    ok(`${name} keeps the recorded entry time`, st.inT === '08:30', st.inT);
    ok(`${name} scrolls the exit time into view and highlights it`, st.visible && st.flash);
    ok(`no page errors (${action})`, !p.errs.length, p.errs.join(';'));
  }

  // اعلان قبل از ورود به حساب لمس شد: بعد از ورود همان کار انجام شود
  const pre = await run('open', { beforeLogin: true });
  ok('a tap before login runs after login', pre.st.action === 'out' && pre.st.out === '18:07', JSON.stringify(pre.st));

  // شیفت شب: ورود ۲۰:۰۰ دیروز، یادآوری ۱۸:۰۰ امروز → خروج همین الان
  const night = await run('open', { entryDate: '2026-10-11', inTime: '20:00' });
  ok('a night-shift reminder also sets the exit to now', night.st.out === '18:07' && night.st.action === 'out', JSON.stringify(night.st));

  // ورودِ فراموش‌شده از چند روز پیش: ساعت «الان» نمی‌گذارد (خروجِ همان روز را کاربر می‌زند) ولی صفحه روی ساعت می‌رود
  const old = await run('open', { entryDate: '2026-10-09', inTime: '08:30' });
  ok('an entry from days ago does not get "now" as its exit', old.st.out === '11:11' && old.st.visible, JSON.stringify(old.st));

  await b.close();
})();
