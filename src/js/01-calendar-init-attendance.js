  // ==================== تقویم شمسی داخلی ====================
  // تبدیل جلالی/میلادی (الگوریتم jalaali-js) تا تقویم بدون اینترنت و کتابخانه کار کند
  const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
  function jDiv(a, b) { return ~~(a / b); }
  function jMod(a, b) { return a - ~~(a / b) * b; }
  function jalCal(jy) {
    const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
    const gy = jy + 621;
    let leapJ = -14, jp = breaks[0], jump = 0;
    for (let i = 1; i < breaks.length; i++) {
      const jm = breaks[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ += jDiv(jump, 33) * 8 + jDiv(jMod(jump, 33), 4);
      jp = jm;
    }
    let n = jy - jp;
    leapJ += jDiv(n, 33) * 8 + jDiv(jMod(n, 33) + 3, 4);
    if (jMod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    const leapG = jDiv(gy, 4) - jDiv((jDiv(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + jDiv(jump + 4, 33) * 33;
    let leap = jMod(jMod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap, gy, march };
  }
  function g2d(gy, gm, gd) {
    let d = jDiv((gy + jDiv(gm - 8, 6) + 100100) * 1461, 4) + jDiv(153 * jMod(gm + 9, 12) + 2, 5) + gd - 34840408;
    return d - jDiv(jDiv(gy + 100100 + jDiv(gm - 8, 6), 100) * 3, 4) + 752;
  }
  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j = j + jDiv(jDiv(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = jDiv(jMod(j, 1461), 4) * 5 + 308;
    const gd = jDiv(jMod(i, 153), 5) + 1;
    const gm = jMod(jDiv(i, 153), 12) + 1;
    const gy = jDiv(j, 1461) - 100100 + jDiv(8 - gm, 6);
    return { gy, gm, gd };
  }
  function j2d(jy, jm, jd) {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - jDiv(jm, 7) * (jm - 7) + jd - 1;
  }
  function d2j(jdn) {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    let k = jdn - g2d(gy, 3, r.march);
    if (k >= 0) {
      if (k <= 185) return { jy, jm: 1 + jDiv(k, 31), jd: jMod(k, 31) + 1 };
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }
    return { jy, jm: 7 + jDiv(k, 30), jd: jMod(k, 30) + 1 };
  }
  function dateToJalali(date) {
    return d2j(g2d(date.getFullYear(), date.getMonth() + 1, date.getDate()));
  }
  function jalaliToDate(jy, jm, jd) {
    const g = d2g(j2d(jy, jm, jd));
    return new Date(g.gy, g.gm - 1, g.gd, 12, 0, 0);
  }
  function jalaliMonthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return jalCal(jy).leap === 0 ? 30 : 29;
  }

  let calState = null; // { jy, jm, selected: {jy,jm,jd}, onPick }

  function openCalendar(date, onPick) {
    playTactileFeedback();
    const sel = dateToJalali(date);
    calState = { jy: sel.jy, jm: sel.jm, selected: sel, onPick };
    renderCalendar();
    document.getElementById('calendarModal').classList.add('open');
  }
  function closeCalendar() {
    calState = null;
    document.getElementById('calendarModal').classList.remove('open');
  }
  function shiftCalendarMonth(delta) {
    if (!calState) return;
    playTactileFeedback();
    let m = calState.jm + delta, y = calState.jy;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    calState.jm = m;
    calState.jy = y;
    renderCalendar();
  }
  function pickCalendarDate(jy, jm, jd) {
    if (!calState) return;
    const cb = calState.onPick;
    closeCalendar();
    playTactileFeedback();
    cb(jalaliToDate(jy, jm, jd));
  }
  function pickCalendarToday() {
    const t = dateToJalali(new Date());
    pickCalendarDate(t.jy, t.jm, t.jd);
  }
  function renderCalendar() {
    const { jy, jm, selected } = calState;
    document.getElementById('jcalTitle').textContent = `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
    const today = dateToJalali(new Date());
    // ستون اول شنبه است: getDay() شنبه=۶ ← ستون ۰
    const lead = (jalaliToDate(jy, jm, 1).getDay() + 1) % 7;
    const len = jalaliMonthLength(jy, jm);
    let html = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map(w => `<div class="jcal-wd">${w}</div>`).join('');
    for (let i = 0; i < lead; i++) html += '<div></div>';
    for (let d = 1; d <= len; d++) {
      const cls = ['jcal-day'];
      if ((lead + d - 1) % 7 === 6) cls.push('friday');
      if (today.jy === jy && today.jm === jm && today.jd === d) cls.push('today');
      if (selected.jy === jy && selected.jm === jm && selected.jd === d) cls.push('selected');
      html += `<button class="${cls.join(' ')}" ${uiAttr('click', 'pickCalendarDate', jy, jm, d)}>${toPersianDigits(d)}</button>`;
    }
    document.getElementById('jcalGrid').innerHTML = html;
  }

  // تاریخ نمایشی داخل تب‌ها فقط روز و ماه است (مثلاً «۱۸ مهر»)؛ پیام و آرشیو همچنان سال را دارند
  function shortDateLabel(date) {
    const j = dateToJalali(date);
    return `${toPersianDigits(j.jd)} ${JALALI_MONTHS[j.jm - 1]}`;
  }

  function openAttendanceCalendar() {
    openCalendar(currentDateObj, (date) => {
      currentDateObj = date;
      updateDateDisplay();
    });
  }

  // تاریخ گزارش ساپورت مستقل از تب تردد است و ساعت ندارد
  let supportDateObj = new Date();

  function openSupportCalendar() {
    openCalendar(supportDateObj, (date) => {
      supportDateObj = date;
      updateSupportDateDisplay();
    });
  }
  function setSupportDateOffset(offset) {
    playTactileFeedback();
    supportDateObj = new Date();
    supportDateObj.setDate(supportDateObj.getDate() + offset);
    updateSupportDateDisplay();
  }
  function dayOffsetFromToday(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / (1000 * 60 * 60 * 24));
  }
  function updateSupportDateDisplay() {
    const { dayName } = getPersianDateParts(supportDateObj);
    document.getElementById('supportDateDisplay').textContent = shortDateLabel(supportDateObj);
    document.getElementById('supportDayName').textContent = dayName;
    const diffDays = dayOffsetFromToday(supportDateObj);
    document.getElementById('supChipToday').classList.toggle('selected', diffDays === 0);
    document.getElementById('supChipYesterday').classList.toggle('selected', diffDays === -1);
    document.getElementById('supChipDayBefore').classList.toggle('selected', diffDays === -2);
    updateSupportPreview();
  }

  // نسخه 1.2 خروج را رکورد جدا (با ساعت ورود) ثبت می‌کرد و ورود «بی‌خروج» می‌ماند؛
  // این‌جا هر خروجِ قدیمی در رکورد ورودش ادغام می‌شود تا هر حضور یک رکورد باشد (اجرای دوباره بی‌اثر است)
  function mergeLegacySplitStays() {
    const logs = getLogs();
    const isAtt = l => l && l.type === 'attendance' && l.inTime && l.dateISO;
    // ورودهای بی‌خروج بر اساس شرکت و ساعت ورود
    const open = new Map();
    for (const l of logs) {
      if (!isAtt(l) || l.outTime) continue;
      const k = `${l.company}|${l.inTime}`;
      if (!open.has(k)) open.set(k, []);
      open.get(k).push(l);
    }
    if (!open.size) return;
    const drop = new Set();
    for (const out of logs) {
      if (!isAtt(out) || !out.outTime || (out.action !== 'out' && out.action !== 'both')) continue;
      const cands = open.get(`${out.company}|${out.inTime}`);
      if (!cands) continue;
      const night = parseHM(out.outTime) < parseHM(out.inTime);
      const idx = cands.findIndex(l => (Number(l.id) || 0) < (Number(out.id) || 0) &&
        Math.round((isoToDate(out.dateISO) - isoToDate(l.dateISO)) / 86400000) === (night && out.dateISO !== l.dateISO ? 1 : 0));
      if (idx < 0) continue;
      const entry = cands.splice(idx, 1)[0];
      drop.add(out);
      entry.action = 'both';
      entry.outTime = out.outTime;
      entry.durationMins = out.durationMins;
      entry.durationText = out.durationText;
      entry.outText = out.text;
      entry.closedAt = Number(out.id) || Date.now();
      const o = getOpenEntry();
      if (o && o.logId === entry.id) setOpenEntry(null);
    }
    if (!drop.size || !writeLogs(logs.filter(l => !drop.has(l)))) return;
    showToast(`${toPersianDigits(drop.size)} حضور قدیمی در یک رکورد یکی شد`);
  }

  function init() {
    restoreFromMirror(); // اپ اندروید: اگر ری‌استارت نوشته‌های آخر را گم کرده بود، از نسخه دوم برمی‌گردند
    applyTheme(getSettings().theme);
    runMigrations();
    lockAutoBio = true; // با باز شدن برنامه، اگر اثر انگشت روشن است خودش بیاید
    renderLockScreen();
    if (mirrorRestored) showToast('♻️ تغییرهای آخر که با خاموش شدن گوشی گم شده بودند برگردانده شد');
    if (mirrorRestoreFailed) showToast('⚠️ حافظه گوشی پر است؛ چند تغییرِ آخر قبل از خاموش شدن گوشی برنگشت. فایل پشتیبان بگیرید');
    document.getElementById('userNameHeader').textContent = getUserName() || 'ورود';
    if (!getCompanies().includes(selectedCompany)) selectedCompany = getCompanies()[0] || '';
    renderDays();
    renderCompanies();
    initGeo();
    setDateOffset(0);
    updateSupportDateDisplay();
    setCurrentTimeToInputs(false);
    calculateDuration();
    updatePreview();
    updateSupportPreview();
    renderArchive();
    renderChatMessages();
    updateNetworkStatus();
    renderSettings();
    renderOutbox();
    checkExitReminder();
    syncExitReminder();
    setInterval(checkExitReminder, 30000);

    let todayISO = toISODate(new Date());
    const tickClock = () => {
      const d = new Date();
      // اپ بعد از نیمه‌شب باز مانده: تاریخی که روی «امروز» بود به روز جدید برود،
      // و دکمه‌های امروز/دیروز/پریروز برای تاریخ‌های انتخاب‌شده دوباره حساب شوند
      const nowISO = toISODate(d);
      if (nowISO !== todayISO) {
        if (toISODate(currentDateObj) === todayISO) currentDateObj = new Date();
        if (toISODate(supportDateObj) === todayISO) supportDateObj = new Date();
        todayISO = nowISO;
        updateDateDisplay();
        updateSupportDateDisplay();
        renderOpenEntryBanner();
      }
      document.getElementById('liveClock').textContent =
        `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    };
    tickClock();
    setInterval(tickClock, 1000);
  }

  function switchSystemMode(mode) {
    playTactileFeedback();
    systemMode = mode;
    document.getElementById('tabAttendanceBtn').classList.toggle('active', mode === 'attendance');
    document.getElementById('tabSupportBtn').classList.toggle('active', mode === 'support');
    document.getElementById('tabArchiveBtn').classList.toggle('active', mode === 'archive');
    document.getElementById('tabMessengerBtn').classList.toggle('active', mode === 'messenger');

    document.getElementById('secAttendance').classList.toggle('active', mode === 'attendance');
    document.getElementById('secSupport').classList.toggle('active', mode === 'support');
    document.getElementById('secArchive').classList.toggle('active', mode === 'archive');
    document.getElementById('secMessenger').classList.toggle('active', mode === 'messenger');

    document.body.classList.toggle('mode-messenger', mode === 'messenger');
    if (mode === 'attendance') fitDateRow();

    if (mode !== 'messenger') closeChatActions();

    const dock = document.getElementById('floatingDock');
    const sendLabel = document.getElementById('sendBtnLabel');

    if (mode === 'archive' || mode === 'messenger' || (mode === 'support' && supportView === 'inventory')) {
      dock.style.display = 'none';
      if (mode === 'support') renderInventory();
      if (mode === 'archive') renderArchive();
      if (mode === 'messenger') renderChatMessages({ forceBottom: true });
    } else {
      dock.style.display = 'flex';
      sendLabel.textContent = 'ارسال به واتساپ';
    }
  }

  // چسباندن هوشمند ساعت و دقیقه (Smart Paste)
  function handleDigitPaste(event, hourId, minId) {
    event.preventDefault();
    const paste = (event.clipboardData || window.clipboardData).getData('text') || '';
    const digits = paste
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[^0-9]/g, '');

    if (digits.length >= 4) {
      const hh = digits.slice(0, 2);
      const mm = digits.slice(2, 4);
      if (parseInt(hh) <= 23 && parseInt(mm) <= 59) {
        document.getElementById(hourId).value = hh;
        document.getElementById(minId).value = mm;
        calculateDuration();
        updatePreview();
        showToast(`ساعت ${hh}:${mm} درج شد`);
      }
    } else if (digits.length === 2) {
      event.target.value = digits;
      handleDigitInput(event.target, minId);
    }
  }

  // دیجیت پد هوشمند با پشتیبانی کامل از کیبورد فارسی و انگلیسی
  function handleDigitInput(input, nextId) {
    playTactileFeedback();
    input.value = input.value
      .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[^0-9]/g, '');

    if (input.id.includes('Hour') && parseInt(input.value) > 23) input.value = '23';
    if (input.id.includes('Min') && parseInt(input.value) > 59) input.value = '59';

    if (input.value.length >= 2 && nextId) {
      const n = document.getElementById(nextId);
      if (n) { n.focus(); n.select(); }
    }
    calculateDuration();
    updatePreview();
  }

  function handleDigitKeydown(event, prevId) {
    if (event.key === 'Backspace' && event.target.value.length === 0 && prevId) {
      const prev = document.getElementById(prevId);
      if (prev) {
        prev.focus();
        prev.select();
      }
    }
  }

  function padZeroOnBlur(input) {
    let val = input.value.trim();
    if (val.length === 1) input.value = '0' + val;
    else if (val.length === 0) input.value = '00';
    calculateDuration();
    updatePreview();
  }

  function setSpecificNow(type) {
    playTactileFeedback();
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (type === 'in') {
      document.getElementById('inHour').value = hh;
      document.getElementById('inMin').value = mm;
    } else {
      document.getElementById('outHour').value = hh;
      document.getElementById('outMin').value = mm;
    }
    calculateDuration();
    if (type === 'in' && needsEntryGeo()) {
      // «الان» یعنی همین‌جا هستم: موقعیت تازه بگیر (ممکن است چند دقیقه پیش در محل قبلی بوده باشیم).
      // قبل از updatePreview، تا درخواست خودکارِ آن (که موقعیت تا ۶۰ ثانیه قدیمی را قبول می‌کند) جایش را نگیرد
      geofenceForceNext = true;
      if (entryGeo.status === 'pending') freshFixAfterPending = true;
      else requestEntryLocation(false, true);
    }
    updatePreview();
    showToast(`ساعت ${hh}:${mm} تنظیم شد`);
  }

  function toPersianDigits(n) {
    const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(n).replace(/[0-9]/g, (w) => farsiDigits[+w]);
  }

  function setCurrentTimeToInputs(notify = true) {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (d.getHours() < 13) {
      document.getElementById('inHour').value = hh;
      document.getElementById('inMin').value = mm;
      document.getElementById('outHour').value = '17';
      document.getElementById('outMin').value = '00';
    } else {
      document.getElementById('inHour').value = '09';
      document.getElementById('inMin').value = '00';
      document.getElementById('outHour').value = hh;
      document.getElementById('outMin').value = mm;
    }
    // ساعت ورودِ پیش‌فرض نباید ساعت ورودِ ثبت‌شده را بپوشاند (بعد از باز شدن دوباره اپ، خروج رکورد دوم می‌ساخت)
    lastPrefillKey = '';
    calculateDuration();
    if (notify) showToast(`ساعت ${hh}:${mm} تنظیم شد`);
  }

  function calculateDuration() {
    const inH = parseInt(document.getElementById('inHour').value) || 0;
    const inM = parseInt(document.getElementById('inMin').value) || 0;
    const outH = parseInt(document.getElementById('outHour').value) || 0;
    const outM = parseInt(document.getElementById('outMin').value) || 0;

    let inTotal = inH * 60 + inM;
    let outTotal = outH * 60 + outM;
    if (outTotal < inTotal) outTotal += 24 * 60;

    const diff = outTotal - inTotal;
    const h = Math.floor(diff / 60);
    const m = diff % 60;

    document.getElementById('durationText').textContent = `${toPersianDigits(h)} ساعت و ${toPersianDigits(m)} دقیقه`;
    return { h, m, totalMins: diff };
  }

  function renderCompanies() {
    const comps = getCompanies();
    const sites = getSites();
    const renderTo = (containerId) => {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.className = `company-chips-grid ${isEditMode ? 'edit-mode' : ''}`;
      el.innerHTML = '';
      if (!comps.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'grid-column:1/-1; color:var(--text-dim); font-size:12px; line-height:1.8; text-align:center; padding:6px;';
        empty.textContent = 'هنوز محلی ثبت نشده. وقتی برای اولین بار به یک محل می‌روید، همان‌جا «افزودن محل جدید» را بزنید تا نام و موقعیتش ثبت شود.';
        el.appendChild(empty);
      }
      comps.forEach(c => {
        const btn = document.createElement('div');
        btn.className = `comp-chip ${selectedCompany === c ? 'selected' : ''}`;
        btn.setAttribute('role', 'button');
        btn.tabIndex = 0;
        btn.setAttribute('aria-pressed', String(selectedCompany === c));
        const label = document.createElement('span');
        label.className = 'chip-label';
        label.textContent = c;
        btn.title = c;
        btn.appendChild(label);
        if (containerId === 'attendanceProjectsGrid' && sites[c]) {
          const pin = document.createElement('span');
          pin.className = 'site-badge';
          pin.textContent = '📍';
          btn.appendChild(pin);
        }
        btn.onclick = () => {
          playTactileFeedback();
          companyPickedManually = true;
          selectedCompany = c;
          renderCompanies();
          updatePreview();
          updateSupportPreview();
        };
        if (isEditMode) {
          const del = document.createElement('span');
          del.className = 'del-badge';
          del.textContent = '✕';
          del.onclick = (e) => {
            e.stopPropagation();
            deleteCompany(c);
          };
          btn.appendChild(del);
        }
        el.appendChild(btn);
      });
    };
    renderTo('attendanceProjectsGrid');
    renderTo('supportProjectsGrid');
    renderSitePanel();
  }

  function toggleEditLocations() {
    playTactileFeedback();
    isEditMode = !isEditMode;
    renderCompanies();
    showToast(isEditMode ? 'حالت ویرایش فعال شد (✕ برای حذف)' : 'حالت ویرایش غیرفعال شد');
  }

  async function deleteCompany(name) {
    if (!await appConfirm(`آیا از حذف «${name}» اطمینان دارید؟`)) return;
    let list = getCompanies().filter(c => c !== name);
    if (!saveCompanies(list)) return;
    const sites = getSites();
    if (sites[name]) {
      delete sites[name];
      saveSites(sites);
    }
    if (selectedCompany === name) selectedCompany = list[0] || '';
    renderCompanies();
    updatePreview();
    updateSupportPreview();
    showToast(`محل «${name}» حذف شد`);
  }

  function openAddModal() {
    playTactileFeedback();
    document.getElementById('modalProjectInput').value = '';
    document.getElementById('addModal').classList.add('open');
    setTimeout(() => document.getElementById('modalProjectInput').focus(), 100);
  }
  function closeAddModal() {
    document.getElementById('addModal').classList.remove('open');
  }
  // محل جدید فقط با موقعیتش اضافه می‌شود (کاربر همان لحظه داخل محل است)
  let addingProject = false;
  async function saveNewProjectFromModal() {
    if (addingProject) return;
    const val = document.getElementById('modalProjectInput').value.replace(/\s+/g, ' ').trim();
    if (!val) {
      showToast('نام محل را بنویسید');
      return;
    }
    if (getCompanies().includes(val)) {
      showToast(`«${val}» در لیست موجود است`);
      return;
    }
    const btn = document.getElementById('addProjectBtn');
    addingProject = true;
    btn.disabled = true;
    btn.textContent = '📍 در حال دریافت موقعیت...';
    try {
      const pos = await getFreshPosition();
      const list = getCompanies();
      if (!list.includes(val)) list.push(val);
      if (!saveCompanies(list)) return;
      const sites = getSites();
      sites[val] = { lat: pos.lat, lng: pos.lng, radius: SITE_DEFAULT_RADIUS, acc: pos.acc };
      saveSites(sites);
      selectedCompany = val;
      companyPickedManually = true;
      closeAddModal();
      renderCompanies();
      updatePreview();
      updateSupportPreview();
      showToast(`«${val}» با موقعیتش ثبت شد (دقت ±${toPersianDigits(pos.acc)} متر)`);
    } catch(err) {
      showToast(`⚠️ ${err.message} — محل اضافه نشد`);
    } finally {
      addingProject = false;
      btn.disabled = false;
      btn.textContent = '📍 ثبت محل و موقعیت';
    }
  }

  function renderDays() {
    const container = document.getElementById('attendanceDaysRow');
    container.innerHTML = '';
    const { dayName } = getPersianDateParts(currentDateObj);
    if (!selectedDay) selectedDay = dayName;

    WEEK_DAYS.forEach(d => {
      const pill = document.createElement('div');
      pill.className = `day-item-pill ${selectedDay === d ? 'selected' : ''}`;
      pill.setAttribute('role', 'button'); pill.tabIndex = 0;
      pill.textContent = d;
      pill.onclick = () => {
        playTactileFeedback();
        selectedDay = d;
        renderDays();
        updatePreview();
        updateSupportPreview();
      };
      container.appendChild(pill);
    });
  }

  function setDateOffset(offset) {
    playTactileFeedback();
    currentDateObj = new Date();
    currentDateObj.setDate(currentDateObj.getDate() + offset);
    updateDateDisplay();
  }

  function changeDateByDays(delta) {
    playTactileFeedback();
    currentDateObj.setDate(currentDateObj.getDate() + delta);
    updateDateDisplay();
  }

  // اگر ردیف تاریخ (مثلاً «۳۱ اردیبهشت») روی گوشی جا نشد، متن ردیف را کمی کوچک کن تا در یک خط بماند
  function fitDateRow() {
    const row = document.querySelector('#secAttendance .compact-date-row');
    if (!row || !row.offsetWidth || window.innerWidth < 360) {
      if (row) row.style.setProperty('--fit', 1);
      return;
    }
    let fit = 1;
    row.style.setProperty('--fit', fit);
    while (row.scrollWidth > row.clientWidth && fit > 0.8) {
      fit = Math.round((fit - 0.04) * 100) / 100;
      row.style.setProperty('--fit', fit);
    }
  }
  window.addEventListener('resize', fitDateRow);
  window.addEventListener('resize', () => updateChatKeyboardState()); // WebViewهای قدیمی visualViewport ندارند

  function updateDateDisplay() {
    const { dayName } = getPersianDateParts(currentDateObj);
    document.getElementById('dateDisplay').textContent = shortDateLabel(currentDateObj);
    fitDateRow();
    selectedDay = dayName;

    // همگام‌سازی خودکار دکمه‌های امروز / دیروز / پریروز
    const diffDays = dayOffsetFromToday(currentDateObj);

    document.getElementById('chipToday').classList.toggle('selected', diffDays === 0);
    document.getElementById('chipYesterday').classList.toggle('selected', diffDays === -1);
    document.getElementById('chipDayBefore').classList.toggle('selected', diffDays === -2);

    renderDays();
    updatePreview();
    updateSupportPreview();
  }

  function setAttendanceAction(type) {
    playTactileFeedback();
    // «فقط خروج» برای امروز با ساعت همین لحظه شروع شود، نه ۱۷:۰۰ پیش‌فرض
    if (type === 'out' && attendanceAction !== 'out' && dayOffsetFromToday(currentDateObj) === 0) {
      const now = new Date();
      document.getElementById('outHour').value = pad2(now.getHours());
      document.getElementById('outMin').value = pad2(now.getMinutes());
    }
    attendanceAction = type;
    const buttons = document.querySelectorAll('#secAttendance .segmented-pill-row .pill-opt-btn');
    buttons[0].classList.toggle('selected', type === 'both');
    buttons[1].classList.toggle('selected', type === 'in');
    buttons[2].classList.toggle('selected', type === 'out');

    document.getElementById('inTimeRow').style.display = type === 'out' ? 'none' : 'flex';
    document.getElementById('outTimeRow').style.display = type === 'in' ? 'none' : 'flex';
    updatePreview();
  }

  // تولید پیام تردد
  function generateAttendanceText() {
    const { dateStr } = getPersianDateParts(currentDateObj);
    const inH = (document.getElementById('inHour').value || '09').padStart(2, '0');
    const inM = (document.getElementById('inMin').value || '00').padStart(2, '0');
    const outH = (document.getElementById('outHour').value || '17').padStart(2, '0');
    const outM = (document.getElementById('outMin').value || '00').padStart(2, '0');

    const includeDate = document.getElementById('includeDateCheck').checked;
    const useHashtag = document.getElementById('hashtagCheck').checked;
    const includeDuration = document.getElementById('includeDurationCheck').checked;

    let tag = selectedCompany;
    if (useHashtag) tag = `#${selectedCompany.replace(/\s+/g, '_')}`;

    // اولین پیام تردد هر روز: سلام و احوال‌پرسی متناسب با ساعت، تاریخ و روز؛ پیام‌های بعدی همان روز فقط خودِ تردد.
    // لوکیشن دیگر در پیام واتساپ نمی‌رود (فقط برای انتخاب خودکار محل و آرشیو گرفته می‌شود)
    // خروجِ یک ورودِ قبلاً فرستاده‌شده: ساعت ورود دوباره در پیام نمی‌آید
    const exitOnly = closesRecordedEntry();
    const eventMins = exitOnly
      ? Number(outH) * 60 + Number(outM)
      : Number(inH) * 60 + Number(inM);
    let lines = [];
    if (includeDate && isFirstAttendanceOfDay(currentDateObj)) {
      lines.push(`سلام، ${greetingFor(eventMins)}`);
      lines.push(dateStr);
      lines.push(selectedDay);
    }
    if (selectedCompany) lines.push(tag);

    if (attendanceAction === 'both' && !exitOnly) {
      lines.push(`ورود ${inH}:${inM}`);
      lines.push(`خروج ${outH}:${outM}`);
      if (includeDuration) {
        const dur = calculateDuration();
        lines.push(`مدت کارکرد: ${dur.h}:${String(dur.m).padStart(2,'0')}`);
      }
    } else if (attendanceAction === 'in') {
      lines.push(`ورود ${inH}:${inM}`);
    } else {
      lines.push(`خروج ${outH}:${outM}`);
      if (includeDuration && (exitOnly || pairedEntry())) {
        const dur = calculateDuration();
        lines.push(`مدت کارکرد: ${dur.h}:${String(dur.m).padStart(2,'0')}`);
      }
    }

    return lines.join('\n');
  }

  // این ثبت ورودی را که قبلاً ثبت و فرستاده شده می‌بندد؟ (پیام و ادغام رکورد هر دو از همین تصمیم پیروی می‌کنند)
  function closesRecordedEntry() {
    if (attendanceAction === 'in') return false;
    const pair = pairedEntry();
    if (attendanceAction === 'out') return !!pair;
    return !!pair && timeInputValue('in') === pair.inTime;
  }

  function greetingFor(mins) {
    if (mins >= 4 * 60 && mins < 12 * 60) return 'صبح بخیر';
    if (mins >= 12 * 60 && mins < 16 * 60) return 'ظهر بخیر';
    if (mins >= 16 * 60 && mins < 20 * 60) return 'عصر بخیر';
    return 'شب بخیر';
  }

  // تا الان هیچ تردی برای این روز ثبت نشده؟ (رکوردهای قدیمی بدون dateISO با تاریخ شمسی مقایسه می‌شوند)
  function isFirstAttendanceOfDay(dateObj) {
    const iso = toISODate(dateObj);
    const day = dayIndex(dateToJalali(dateObj));
    return !getLogs().some(l => {
      if (!l || l.type !== 'attendance') return false;
      if (l.dateISO) return l.dateISO === iso;
      const j = logJalali(l);
      return !!j && dayIndex(j) === day;
    });
  }

  function updatePreview() {
    syncOpenEntryPrefill();
    const paired = attendanceAction === 'out' && !!pairedEntry();
    document.getElementById('durationBar').style.display =
      attendanceAction === 'both' || paired ? 'flex' : 'none';
    document.getElementById('unpairedExitHint').classList.toggle('show',
      attendanceAction === 'out' && !!selectedCompany && !paired);
    maybeAutoRequestGeo();
    renderGeoRow();
    document.getElementById('attendancePreview').textContent = generateAttendanceText();
  }

