  // ==================== ورود باز و یادآوری خروج ====================
  // «فقط ورود» یک ورود باز می‌سازد؛ خروجِ همان شرکت (همان روز، یا روز بعد برای شیفت شب)
  // ساعت ورود را خودش پر می‌کند و مدت درست در آرشیو ثبت می‌شود
  const OPEN_ENTRY_KEY = 'geomat_open_entry_v1';
  const SETTINGS_KEY = 'geomat_settings_v1';
  const DEFAULT_SETTINGS = { reminderTime: '18:00', workStart: '09:00', workEnd: '17:00', thuEnd: '14:00', holidays: [], theme: 'dark' };
  const TIME_SETTINGS = ['reminderTime', 'workStart', 'workEnd', 'thuEnd'];

  function pad2(n) { return String(n).padStart(2, '0'); }
  function toISODate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function isoToDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : null;
  }
  function timeInputValue(kind) {
    return `${pad2(parseInt(document.getElementById(kind + 'Hour').value, 10) || 0)}:${pad2(parseInt(document.getElementById(kind + 'Min').value, 10) || 0)}`;
  }

  function getSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch(e) {}
    const out = Object.assign({}, DEFAULT_SETTINGS, saved);
    TIME_SETTINGS.forEach(k => { if (!/^\d{2}:\d{2}$/.test(out[k])) out[k] = DEFAULT_SETTINGS[k]; });
    if (parseHM(out.workEnd) <= parseHM(out.workStart)) { out.workStart = DEFAULT_SETTINGS.workStart; out.workEnd = DEFAULT_SETTINGS.workEnd; }
    if (parseHM(out.thuEnd) <= parseHM(out.workStart)) out.thuEnd = DEFAULT_SETTINGS.thuEnd;
    out.holidays = Array.isArray(out.holidays) ? out.holidays.filter(h => isoToDate(h)).sort() : [];
    if (!['system', 'dark', 'light'].includes(out.theme)) out.theme = DEFAULT_SETTINGS.theme;
    delete out.overtimeHours; // تنظیم قدیمی «اضافه‌کار بعد از n ساعت»
    return out;
  }
  function saveSettingField(field, value) {
    const st = getSettings();
    if (TIME_SETTINGS.includes(field) && !/^\d{2}:\d{2}$/.test(value)) value = st[field];
    st[field] = value;
    if (field === 'reminderTime') setTimeout(syncExitReminder, 0);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(st)); } catch(e) {}
    renderSettings();
    renderOpenEntryBanner();
    if (typeof renderMonthlyReport === 'function') renderMonthlyReport();
    showToast('تنظیمات ذخیره شد');
  }
  // مقدار فضای مصرف‌شده؛ نزدیک پر شدن، هشدار
  function renderStorageUsage() {
    const use = document.getElementById('storageUsage');
    if (!use) return;
    const exact = storageUsedChars() / STORAGE_QUOTA_CHARS * 100;
    const pct = Math.min(100, Math.round(exact));
    use.textContent = `فضای استفاده‌شده روی این گوشی: ${exact < 1 ? 'کمتر از ۱' : toPersianDigits(pct)}٪${pct >= 80 ? ' — نزدیک پر شدن است؛ فایل پشتیبان بگیرید و رکوردهای قدیمی آرشیو را حذف کنید' : ''}`;
    use.classList.toggle('storage-warn', pct >= 80);
  }
  function renderSettings() {
    const st = getSettings();
    applyTheme(st.theme);
    const themeSel = document.getElementById('themeInput');
    if (themeSel) themeSel.value = st.theme;
    [['reminderTimeInput', 'reminderTime'], ['workStartInput', 'workStart'], ['workEndInput', 'workEnd'], ['thuEndInput', 'thuEnd']].forEach(([id, k]) => {
      const el = document.getElementById(id);
      if (el) el.value = st[k];
    });
    const pre = document.getElementById('preUpdateRestoreBtn');
    if (pre) pre.style.display = localStorage.getItem(PRE_UPDATE_BACKUP_KEY) ? '' : 'none';
    renderStorageUsage();
    const nt = document.getElementById('notifTestRow');
    if (nt) nt.style.display = window.AndroidBridge && typeof window.AndroidBridge.testNotification === 'function' ? '' : 'none';
    const list = document.getElementById('holidayList');
    if (list) {
      list.innerHTML = st.holidays.length
        ? st.holidays.map(h => `<span class="holiday-chip">${escapeHtml(shortDateLabel(isoToDate(h)))} ${toPersianDigits(dateToJalali(isoToDate(h)).jy)}<button ${uiAttr('click', 'removeHoliday', h)} title="حذف" aria-label="حذف">✕</button></span>`).join('')
        : '<span style="color:var(--text-dim); font-size:11px;">ثبت نشده</span>';
    }
  }
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0b1018';
  }
  function addHoliday() {
    openCalendar(new Date(), (date) => {
      const st = getSettings();
      const iso = toISODate(date);
      if (!st.holidays.includes(iso)) saveSettingField('holidays', [...st.holidays, iso]);
    });
  }
  function removeHoliday(iso) {
    saveSettingField('holidays', getSettings().holidays.filter(h => h !== iso));
  }

  function readOpenEntry() {
    try {
      const o = JSON.parse(localStorage.getItem(OPEN_ENTRY_KEY) || 'null');
      if (o && typeof o.company === 'string' && isoToDate(o.dateISO) && /^\d{2}:\d{2}$/.test(o.inTime)) return o;
    } catch(e) {}
    return null;
  }
  // روی گوشی مشترک، ورود بازِ حساب دیگر برای حساب واردشده دیده نمی‌شود (خروجِ یک نفر ورودِ دیگری را نبندد)
  const otherPersons = (by) => !!by && typeof session !== 'undefined' && !!session && by !== session.user.id;
  function getOpenEntry() {
    const o = readOpenEntry();
    return o && otherPersons(o.by) ? null : o;
  }
  function setOpenEntry(o) {
    try {
      if (o) storeItem(OPEN_ENTRY_KEY, JSON.stringify(o));
      else localStorage.removeItem(OPEN_ENTRY_KEY);
    } catch(e) {}
    syncExitReminder();
  }

  // ==================== اعلان بومی «خروج ثبت نشده» (اپ اندروید) ====================
  // متن اعلان دقیقاً همان بنر داخل برنامه است؛ حتی وقتی برنامه بسته است در ساعت یادآوری می‌آید
  const NOTIF_ASKED_KEY = 'geomat_notif_asked_v1';
  function exitReminderTexts(o) {
    const when = o.dateISO === toISODate(new Date()) ? '' : ` (${shortDateLabel(isoToDate(o.dateISO))})`;
    return { title: `⏰ خروج «${o.company}» ثبت نشده`, body: `ورود ${o.inTime}${when} — برای ثبت خروج بزنید` };
  }
  function syncExitReminder() {
    const br = window.AndroidBridge;
    if (!br || typeof br.scheduleExitReminder !== 'function') return;
    const o = readOpenEntry(); // یادآوری مال صاحب ورود است، هر کس که الان وارد شده باشد
    if (!o) { br.cancelExitReminder(); return; }
    const [rh, rm] = getSettings().reminderTime.split(':').map(Number);
    const at = isoToDate(o.dateISO);
    at.setHours(rh, rm, 0, 0);
    const t = exitReminderTexts(o);
    br.scheduleExitReminder(t.title, t.body, String(Math.max(at.getTime(), Date.now() + 60000)), `${o.company}|${o.dateISO}|${o.inTime}`);
    askNotificationPermissionOnce();
  }
  async function askNotificationPermissionOnce() {
    const br = window.AndroidBridge;
    if (!br || typeof br.notificationPermission !== 'function' || br.notificationPermission() === 'granted') return;
    if (localStorage.getItem(NOTIF_ASKED_KEY)) return;
    try { localStorage.setItem(NOTIF_ASKED_KEY, '1'); } catch(e) {}
    if (await appConfirm('اگر تا ساعت یادآوری خروج ثبت نشود، Geo Team حتی با برنامه بسته یک اعلان می‌دهد. اجازه اعلان داده شود؟', 'اجازه بده')) br.requestNotificationPermission();
  }
  // دکمه‌های اعلان: «ثبت خروج»، «✕» یا لمس خود اعلان (بعد از ورود به حساب اجرا می‌شود)
  let pendingNotificationAction = null;
  window.handleNotificationAction = (action) => {
    if (typeof session === 'undefined' || !session) { pendingNotificationAction = action; return; }
    switchSystemMode('attendance');
    const raw = readOpenEntry();
    if (raw && otherPersons(raw.by)) { showToast('این یادآوری مال حساب دیگری است؛ با همان حساب وارد شوید'); return; }
    if (!getOpenEntry()) { showToast('این ورود قبلاً بسته شده است'); return; }
    if (action === 'exit') startExitForOpenEntry();
    else if (action === 'dismiss') discardOpenEntry();
    else renderOpenEntryBanner();
  };
  function runPendingNotificationAction() {
    if (!pendingNotificationAction) return;
    const a = pendingNotificationAction;
    pendingNotificationAction = null;
    window.handleNotificationAction(a);
  }

  // ورود باز با شرکت و تاریخِ فرم فعلی جفت می‌شود؟ (همان روز، یا روز بعد وقتی خروج قبل از ساعت ورود است)
  function openEntryMatch() {
    const o = getOpenEntry();
    if (!o || o.company !== selectedCompany || attendanceAction === 'in') return null;
    const diff = Math.round((isoToDate(toISODate(currentDateObj)) - isoToDate(o.dateISO)) / 86400000);
    if (diff === 0) return o;
    if (diff === 1) {
      const [ih, im] = o.inTime.split(':').map(Number);
      const out = (parseInt(document.getElementById('outHour').value, 10) || 0) * 60 + (parseInt(document.getElementById('outMin').value, 10) || 0);
      if (out < ih * 60 + im) return o;
    }
    return null;
  }

  // ورودِ بی‌خروجِ همین محل که این خروج با آن جفت می‌شود: اول در آرشیو (همان روز، یا روز قبل برای شیفت شب)،
  // بعد ورود باز. قبلاً فقط «ورود باز» نگاه می‌شد که یک خانه بیشتر نداشت؛ با ورودِ محل دیگر جایگزین می‌شد
  // یا با «دوره کامل» پاک می‌شد و ساعت کارکردِ خروج از دست می‌رفت
  // در «دوره کامل» هم ساعت ورودِ همان ورود در فرم پر می‌شود و همان رکورد تکمیل می‌شود
  function pairedEntry() {
    if (attendanceAction === 'in' || !selectedCompany) return null;
    const iso = toISODate(currentDateObj);
    const outMins = (parseInt(document.getElementById('outHour').value, 10) || 0) * 60 + (parseInt(document.getElementById('outMin').value, 10) || 0);
    for (const l of getLogs()) {
      if (!l || l.type !== 'attendance' || l.company !== selectedCompany || !l.inTime || l.outTime || !l.dateISO) continue;
      if (l.by && otherPersons(l.by.id)) continue; // ورودِ حساب دیگر روی همین گوشی
      const inMins = parseHM(l.inTime);
      if (inMins === null) continue;
      const diff = Math.round((isoToDate(iso) - isoToDate(l.dateISO)) / 86400000);
      if ((diff === 0 && inMins <= outMins) || (diff === 1 && outMins < inMins)) {
        return { inTime: l.inTime, dateISO: l.dateISO, logId: l.id };
      }
    }
    const o = openEntryMatch();
    return o ? { inTime: o.inTime, dateISO: o.dateISO, logId: o.logId || null } : null;
  }

  // ساعت ورودِ جفت را فقط وقتی شرکت/تاریخ/نوع تردد عوض شد در فرم بگذار (ویرایش دستی بعدی حفظ می‌شود)
  let lastPrefillKey = '';
  function syncOpenEntryPrefill() {
    const pair = pairedEntry();
    const key = pair ? `${pair.inTime}|${pair.dateISO}|${selectedCompany}|${toISODate(currentDateObj)}|${attendanceAction}` : '';
    if (key === lastPrefillKey) return;
    lastPrefillKey = key;
    if (!pair) return;
    const [h, m] = pair.inTime.split(':');
    document.getElementById('inHour').value = h;
    document.getElementById('inMin').value = m;
    calculateDuration();
  }

  function updateOpenEntryAfterCommit(logId, pair) {
    const open = getOpenEntry();
    if (attendanceAction === 'in') {
      if (open && open.company !== selectedCompany) showToast(`ورود باز «${open.company}» با ورود جدید جایگزین شد`);
      setOpenEntry({
        company: selectedCompany,
        dateISO: toISODate(currentDateObj),
        inTime: timeInputValue('in'),
        logId: logId,
        ts: Date.now(),
        notified: false,
        by: session ? session.user.id : undefined
      });
      requestReminderPermission();
    } else if (open && open.company === selectedCompany &&
      ((pair && pair.dateISO === open.dateISO && pair.inTime === open.inTime) ||
       (attendanceAction === 'both' && open.dateISO === toISODate(currentDateObj)))) {
      setOpenEntry(null);
    }
    lastPrefillKey = '';
    renderOpenEntryBanner();
  }

  function commitReport(type, text) {
    lastCommit = { sig: reportSignature(type), text, ts: Date.now() };
    // جفت قبل از ذخیره پیدا می‌شود؛ بعد از ادغام، آن ورود دیگر «بی‌خروج» نیست
    const pair = type === 'attendance' ? pairedEntry() : null;
    const logId = saveToSystemLog(type, text, pair);
    if (type === 'attendance') {
      updateOpenEntryAfterCommit(logId, pair);
      postReportToChat(text);
      updatePreview(); // پیام بعدیِ همین روز دیگر سلام و تاریخ ندارد
    } else {
      resetChecklistTicks(selectedCompany);
    }
  }

  function isOpenEntryOverdue(o) {
    const now = new Date();
    const today = toISODate(now);
    if (o.dateISO < today) return true;
    if (o.dateISO > today) return false;
    const [rh, rm] = getSettings().reminderTime.split(':').map(Number);
    return now.getHours() * 60 + now.getMinutes() >= rh * 60 + rm;
  }

  function renderOpenEntryBanner() {
    const banner = document.getElementById('openEntryBanner');
    if (!banner) return;
    const o = getOpenEntry();
    banner.classList.toggle('show', !!o);
    if (!o) { document.getElementById('openEntryText').textContent = ''; return; }
    const overdue = isOpenEntryOverdue(o);
    banner.classList.toggle('overdue', overdue);
    const when = o.dateISO === toISODate(new Date()) ? '' : ` (${shortDateLabel(isoToDate(o.dateISO))})`;
    document.getElementById('openEntryText').textContent = overdue
      ? `⏰ خروج «${o.company}» ثبت نشده؛ ورود ${o.inTime}${when}`
      : `🟢 ورود باز «${o.company}» از ساعت ${o.inTime}${when}`;
  }

  function startExitForOpenEntry() {
    const o = getOpenEntry();
    if (!o) return;
    playTactileFeedback();
    if (getCompanies().includes(o.company)) selectedCompany = o.company;
    const openDate = isoToDate(o.dateISO);
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const inMins = Number(o.inTime.slice(0, 2)) * 60 + Number(o.inTime.slice(3));
    const ago = -dayOffsetFromToday(openDate);
    // امروز، یا شیفت شبِ دیروز که هنوز به ساعت ورودش نرسیده‌ایم: خروج همین الان است؛
    // در غیر این صورت خروجِ همان روز ورود فراموش شده و ساعتش را کاربر وارد می‌کند
    const exitNow = ago === 0 || (ago === 1 && nowMins < inMins);
    currentDateObj = exitNow ? now : openDate;
    if (exitNow) {
      document.getElementById('outHour').value = pad2(now.getHours());
      document.getElementById('outMin').value = pad2(now.getMinutes());
    }
    renderCompanies();
    setAttendanceAction('out');
    updateDateDisplay();
    showToast(exitNow ? `ساعت ورود ${o.inTime} از ورود باز پر شد` : `خروجِ روز ${shortDateLabel(openDate)} را وارد کنید`);
  }

  async function discardOpenEntry() {
    const o = getOpenEntry();
    if (!o) return;
    if (!await appConfirm(`ورود باز «${o.company}» بدون ثبت خروج بسته شود؟`, 'بستن')) return;
    setOpenEntry(null);
    lastPrefillKey = '';
    renderOpenEntryBanner();
    updatePreview();
  }

  function requestReminderPermission() {
    try {
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    } catch(e) {}
  }

  // هر دقیقه: اگر از ساعت یادآوری گذشته و خروج ثبت نشده، یک بار اعلان بده (بنر همیشه هست)
  function checkExitReminder() {
    renderOpenEntryBanner();
    const o = getOpenEntry();
    if (!o || o.notified || !isOpenEntryOverdue(o)) return;
    o.notified = true;
    setOpenEntry(o);
    const body = `ورود «${o.company}» ساعت ${o.inTime} ثبت شده ولی خروج هنوز نه.`;
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg) reg.showNotification('⏰ یادآوری ثبت خروج', { body, icon: 'icon-192.png', tag: 'exit-reminder' });
          else new Notification('⏰ یادآوری ثبت خروج', { body, icon: 'icon-192.png' });
        }).catch(() => {});
      } else {
        new Notification('⏰ یادآوری ثبت خروج', { body, icon: 'icon-192.png' });
      }
    } catch(e) {}
  }

