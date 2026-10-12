  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => console.log(err));
    });
  }

  // صداسازی مکانیکی ظریف بدون مصرف حافظه مکرر (Singleton AudioContext)
  let sharedAudioCtx = null;
  // مرورگر لرزش و صدا را قبل از اولین لمس کاربر مسدود می‌کند (و در کنسول خطا می‌دهد)
  let userHasInteracted = false;
  ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => { userHasInteracted = true; }, { capture: true, once: true }));
  function playTactileFeedback() {
    if (!userHasInteracted) return;
    if (navigator.vibrate) { try { navigator.vibrate(10); } catch(e){} }
    try {
      if (!sharedAudioCtx) {
        sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume();
      }
      const osc = sharedAudioCtx.createOscillator();
      const gain = sharedAudioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(850, sharedAudioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, sharedAudioCtx.currentTime + 0.035);
      gain.gain.setValueAtTime(0.04, sharedAudioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, sharedAudioCtx.currentTime + 0.035);
      osc.connect(gain);
      gain.connect(sharedAudioCtx.destination);
      osc.start();
      osc.stop(sharedAudioCtx.currentTime + 0.035);
    } catch(e) {}
  }

  // شرکت پیش‌فرضی وجود ندارد: هر کاربر محل‌هایش را خودش، داخل همان محل و با موقعیتش، اضافه می‌کند
  const WEEK_DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

  let systemMode = 'attendance'; // 'attendance', 'support', 'archive'
  let attendanceAction = 'both';
  let selectedCompany = '';
  let selectedDay = "";
  let currentDateObj = new Date();
  let isEditMode = false;
  let archiveCompanyFilter = 'all';

  function getCompanies() {
    try {
      const saved = JSON.parse(localStorage.getItem('geomat_companies_v2') || 'null');
      if (Array.isArray(saved)) {
        const list = saved.filter(c => typeof c === 'string' && c.trim());
        return list;
      }
    } catch(e) {}
    return [];
  }

  // آرشیو خراب (مثلاً از یک فایل پشتیبان ناقص) نباید کل برنامه را از کار بیندازد
  // پیش‌نمایش با هر تغییر فرم آرشیو را می‌خواند؛ تا متن ذخیره‌شده عوض نشده، دوباره parse نمی‌شود
  let logsCache = { raw: null, list: [] };
  function getLogs() {
    try {
      const raw = localStorage.getItem('geomat_logs_v2') || '[]';
      if (raw !== logsCache.raw) {
        const logs = JSON.parse(raw);
        logsCache = { raw, list: Array.isArray(logs) ? logs.filter(l => l && typeof l === 'object') : [] };
      }
      return logsCache.list.slice();
    } catch(e) {
      logsCache = { raw: null, list: [] };
      return [];
    }
  }
  function saveCompanies(list) {
    try {
      storeItem('geomat_companies_v2', JSON.stringify(list));
      return true;
    } catch(e) {
      showToast('⚠️ حافظه پر است؛ فهرست محل‌ها ذخیره نشد');
      return false;
    }
  }

  // نام کاربرِ واردشده؛ بیرون از حساب (مثلاً روی صفحه ورود) نام قبلی دستگاه
  function getUserName() {
    if (typeof session !== 'undefined' && session) return session.user.name;
    return localStorage.getItem('geomat_user_name') || '';
  }

  function getPersianDateParts(date) {
    try {
      const formatterDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const formatterDay = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
        weekday: 'long'
      });
      const parts = formatterDate.formatToParts(date);
      let year = '', month = '', day = '';
      parts.forEach(p => {
        if (p.type === 'year') year = p.value;
        if (p.type === 'month') month = p.value;
        if (p.type === 'day') day = p.value;
      });
      const dayName = formatterDay.format(date);
      if (year && month && day) {
        return { dateStr: `${year}/${month}/${day}`, dayName };
      }
    } catch(e) {}
    return { dateStr: "۱۴۰۵/۰۷/۱۸", dayName: "شنبه" };
  }

