  // ==================== گزارش ماهانه ====================
  // هر رکورد تردد به «جلسه کاری» (ورود تا خروج) تبدیل می‌شود: رکورد کامل مستقیم، و ورود/خروجِ جدا
  // (حتی از نسخه‌های قبل که فقط متن پیام را داشتند) با هم جفت می‌شوند؛ رکوردهای تکراری
  // (مثلاً یک بار کپی و یک بار ارسال همان پیام) فقط یک بار شمرده می‌شوند
  function faToEnDigits(str) {
    return String(str == null ? '' : str)
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  }
  function logJalali(l) {
    if (l.jy && l.jm && l.jd) return { jy: l.jy, jm: l.jm, jd: l.jd };
    const m = /(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(faToEnDigits(l.date));
    return m ? { jy: +m[1], jm: +m[2], jd: +m[3] } : null;
  }
  function parseHM(str) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(faToEnDigits(str || '').trim());
    return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
  }
  function logTimes(l) {
    const text = faToEnDigits(l.text);
    const fromText = (word) => {
      const m = new RegExp(word + '\\s+(\\d{1,2}):(\\d{2})').exec(text);
      return m ? parseHM(`${m[1]}:${m[2]}`) : null;
    };
    const inM = l.inTime !== undefined ? parseHM(l.inTime) : fromText('ورود');
    const outM = l.outTime !== undefined ? parseHM(l.outTime) : fromText('خروج');
    return { inM, outM };
  }
  function dayIndex(j) { return j2d(j.jy, j.jm, j.jd); }

  function computeSessions(logs) {
    const items = [];
    const seen = new Set();
    logs.forEach(l => {
      if (!l || l.type !== 'attendance') return;
      const j = logJalali(l);
      if (!j) return;
      const { inM, outM } = logTimes(l);
      if (inM === null && outM === null) return;
      const key = `${l.company}|${dayIndex(j)}|${inM}|${outM}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ id: Number(l.id) || 0, company: l.company, j, day: dayIndex(j), inM, outM });
    });
    items.sort((a, b) => a.day - b.day || a.id - b.id);

    const sessions = [];
    const pending = {}; // آخرین ورودِ بی‌خروج هر شرکت
    const add = (company, j, inM, outM) => {
      let mins = outM - inM;
      if (mins < 0) mins += 1440;
      sessions.push({ company, jy: j.jy, jm: j.jm, jd: j.jd, day: dayIndex(j), inM, outM, mins });
    };
    items.forEach(it => {
      if (it.inM !== null && it.outM !== null) {
        add(it.company, it.j, it.inM, it.outM);
        if (pending[it.company] && pending[it.company].day === it.day && pending[it.company].inM === it.inM) delete pending[it.company];
      } else if (it.inM !== null) {
        pending[it.company] = it;
      } else {
        const p = pending[it.company];
        if (p && (it.day === p.day || (it.day === p.day + 1 && it.outM < p.inM))) {
          add(it.company, p.j, p.inM, it.outM);
          delete pending[it.company];
        }
      }
    });
    return sessions;
  }

  function formatHM(mins) {
    return toPersianDigits(`${Math.floor(mins / 60)}:${pad2(mins % 60)}`);
  }

  let reportJY = null, reportJM = null;
  function shiftReportMonth(delta) {
    playTactileFeedback();
    reportJM += delta;
    if (reportJM < 1) { reportJM = 12; reportJY--; }
    if (reportJM > 12) { reportJM = 1; reportJY++; }
    renderMonthlyReport();
  }

  // ساعت اداری آن روز به دقیقه؛ null یعنی جمعه یا تعطیل رسمی (همه کارش اضافه‌کار، بدون کسر)
  function workWindow(date, st) {
    if (date.getDay() === 5 || st.holidays.includes(toISODate(date))) return null;
    const end = date.getDay() === 4 ? st.thuEnd : st.workEnd;
    return [parseHM(st.workStart), parseHM(end)];
  }

  // اضافه‌کار و کسر کار هر روز. بازه حضور از اولین ورود تا آخرین خروج است:
  // فاصله بین دو کارگاه (مسیر) کسر نیست. اضافه‌کار = حضور بیرون از ساعت اداری؛
  // کسر = دیرآمد + زودرفت، و روز کاریِ بدون تردد کلاً کسر است
  function dailyBalance(sessions, fromDay, toDay, st) {
    const byDay = {};
    sessions.forEach(x => {
      const d = byDay[x.day] || (byDay[x.day] = { start: Infinity, end: -Infinity });
      d.start = Math.min(d.start, x.inM);
      d.end = Math.max(d.end, x.inM + x.mins);
    });
    const days = {};
    for (let day = fromDay; day <= toDay; day++) {
      const j = d2j(day);
      const win = workWindow(jalaliToDate(j.jy, j.jm, j.jd), st);
      const span = byDay[day];
      const winLen = win ? win[1] - win[0] : 0;
      if (!span) {
        if (winLen) days[day] = { j, overtime: 0, deficit: winLen, absent: true };
        continue;
      }
      const inside = win ? Math.max(0, Math.min(span.end, win[1]) - Math.max(span.start, win[0])) : 0;
      days[day] = { j, overtime: span.end - span.start - inside, deficit: winLen - inside, absent: false };
    }
    return days;
  }

  function monthlyData() {
    if (reportJY === null) {
      const t = dateToJalali(new Date());
      reportJY = t.jy;
      reportJM = t.jm;
    }
    const logs = getLogs();
    const scoped = archiveCompanyFilter === 'all' ? logs : logs.filter(l => l.company === archiveCompanyFilter);
    const allSessions = computeSessions(logs);
    const sessions = computeSessions(scoped).filter(x => x.jy === reportJY && x.jm === reportJM);
    const perCompany = {};
    sessions.forEach(x => {
      const c = perCompany[x.company] || (perCompany[x.company] = { mins: 0, days: new Set() });
      c.mins += x.mins;
      c.days.add(x.day);
    });
    // اضافه‌کار و کسر مال کل روزِ شخص است، نه یک شرکت؛ با فیلتر شرکت نشان داده نمی‌شود.
    // روزها از اولین تردد ثبت‌شده تا امروز شمرده می‌شوند (نه آینده، نه قبل از شروع استفاده)
    let balance = null;
    if (archiveCompanyFilter === 'all' && allSessions.length) {
      const first = Math.min(...allSessions.map(x => x.day));
      const today = dayIndex(dateToJalali(new Date()));
      const from = Math.max(j2d(reportJY, reportJM, 1), first);
      const to = Math.min(j2d(reportJY, reportJM, jalaliMonthLength(reportJY, reportJM)), today);
      balance = dailyBalance(allSessions.filter(x => x.day >= from && x.day <= to), from, to, getSettings());
    }
    const sum = (k) => balance ? Object.values(balance).reduce((a, d) => a + d[k], 0) : 0;
    return {
      sessions,
      total: sessions.reduce((a, x) => a + x.mins, 0),
      balance,
      overtime: sum('overtime'),
      deficit: sum('deficit'),
      absentDays: balance ? Object.values(balance).filter(d => d.absent).length : 0,
      perCompany,
      days: new Set(sessions.map(x => x.day)).size
    };
  }

  function renderMonthlyReport() {
    const title = document.getElementById('reportMonthTitle');
    if (!title) return;
    const d = monthlyData();
    title.textContent = `${JALALI_MONTHS[reportJM - 1]} ${toPersianDigits(reportJY)}`;
    document.getElementById('reportTotal').textContent = formatHM(d.total);
    const st = getSettings();
    document.getElementById('reportOvertimeCaption').textContent = `اضافه‌کار (قبل از ${toPersianDigits(st.workStart)}، بعد از ${toPersianDigits(st.workEnd)}، جمعه و تعطیل):`;
    document.getElementById('reportOvertime').textContent = d.balance ? formatHM(d.overtime) : '—';
    document.getElementById('reportDeficit').textContent = d.balance ? formatHM(d.deficit) : '—';
    document.getElementById('reportAbsent').textContent = d.balance ? toPersianDigits(d.absentDays) : '—';
    const wrap = document.getElementById('reportTableWrap');
    const names = Object.keys(d.perCompany).sort((a, b) => d.perCompany[b].mins - d.perCompany[a].mins);
    if (!names.length) {
      wrap.innerHTML = '<div style="color:var(--text-dim); font-size:12px; text-align:center; padding:8px;">در این ماه ترددی ثبت نشده است.</div>';
      return;
    }
    wrap.innerHTML = `<table class="report-table">
      <tr><th>شرکت</th><th class="num">روز</th><th class="num">ساعت</th></tr>
      ${names.map(n => `<tr><td>${escapeHtml(n)}</td><td class="num">${toPersianDigits(d.perCompany[n].days.size)}</td><td class="num">${formatHM(d.perCompany[n].mins)}</td></tr>`).join('')}
      <tr><td style="font-weight:800;">جمع (${toPersianDigits(d.days)} روز)</td><td class="num"></td><td class="num" style="font-weight:800; color:var(--gold);">${formatHM(d.total)}</td></tr>
    </table>`;
  }

  // هر خانه CSV: نقل‌قول امن، و خنثی‌سازی فرمول (= + - @) تا اکسل متن کاربر را اجرا نکند
  function csvCell(v) {
    let str = String(v == null ? '' : v).replace(/[\n\r]+/g, ' - ');
    if (/^[=+@\t]/.test(str) || (/^-./.test(str) && !/^-\d+(\.\d+)?$/.test(str))) str = "'" + str;
    return `"${str.replace(/"/g, '""')}"`;
  }

  function exportMonthlyCsv() {
    playTactileFeedback();
    const d = monthlyData();
    if (!d.sessions.length && !(d.balance && Object.keys(d.balance).length)) {
      showToast('در این ماه ترددی ثبت نشده است');
      return;
    }
    const hm = (m) => `${Math.floor(m / 60)}:${pad2(m % 60)}`;
    const clock = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
    const rows = [['ردیف', 'تاریخ', 'روز', 'شرکت', 'ورود', 'خروج', 'مدت', 'اضافه‌کار آن روز', 'کسر آن روز']];
    const dateCells = (j) => [`${j.jy}/${pad2(j.jm)}/${pad2(j.jd)}`, WEEK_DAYS[(jalaliToDate(j.jy, j.jm, j.jd).getDay() + 1) % 7]];
    // ردیف‌ها به ترتیب روز؛ اضافه‌کار و کسرِ هر روز فقط روی اولین ردیف همان روز، روز کاریِ بی‌تردد یک ردیف «غیبت»
    const entries = d.sessions.map(x => ({ day: x.day, x }));
    if (d.balance) Object.keys(d.balance).forEach(k => { if (d.balance[k].absent) entries.push({ day: Number(k), absent: d.balance[k] }); });
    entries.sort((a, b) => a.day - b.day);
    const shownDay = new Set();
    entries.forEach((e, i) => {
      const bal = d.balance && d.balance[e.day];
      const first = !shownDay.has(e.day);
      shownDay.add(e.day);
      const ot = bal && first ? hm(bal.overtime) : '';
      const def = bal && first ? hm(bal.deficit) : '';
      if (e.absent) rows.push([i + 1, ...dateCells(e.absent.j), 'غیبت (بدون تردد)', '', '', '', ot, def]);
      else rows.push([i + 1, ...dateCells(e.x), e.x.company, clock(e.x.inM), clock(e.x.outM % 1440), hm(e.x.mins), ot, def]);
    });
    rows.push([]);
    rows.push(['', 'شرکت', 'تعداد روز', 'مجموع ساعت']);
    Object.keys(d.perCompany).forEach(n => rows.push(['', n, d.perCompany[n].days.size, hm(d.perCompany[n].mins)]));
    rows.push(['', 'جمع کل', d.days, hm(d.total)]);
    if (d.balance) {
      rows.push(['', 'اضافه‌کار', '', hm(d.overtime)]);
      rows.push(['', 'کسر کار', '', hm(d.deficit)]);
      rows.push(['', 'روز کاریِ بدون تردد', d.absentDays, '']);
    }
    const csv = '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
    const scope = archiveCompanyFilter === 'all' ? 'all' : `company-${getCompanies().indexOf(archiveCompanyFilter) + 1}`;
    const name = `geoteam-monthly-${reportJY}-${pad2(reportJM)}-${scope}.csv`;
    if (downloadFile(name, csv, 'text/csv')) showToast(`📥 گزارش ${JALALI_MONTHS[reportJM - 1]} دانلود شد`);
  }

