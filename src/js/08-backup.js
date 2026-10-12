  // ==================== پشتیبان‌گیری و بازگردانی ====================
  const APP_VERSION = '1.4.0';
  const BACKUP_APP_ID = 'geomat-attendance';
  const BACKUP_MAX_BYTES = 5 * 1024 * 1024;

  function exportBackup() {
    playTactileFeedback();
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('geomat_') && k !== PRE_UPDATE_BACKUP_KEY) data[k] = localStorage.getItem(k);
    }
    const payload = { app: BACKUP_APP_ID, format: 1, version: APP_VERSION, exportedAt: new Date().toISOString(), data };
    const t = dateToJalali(new Date());
    const name = `geoteam-backup-${t.jy}-${pad2(t.jm)}-${pad2(t.jd)}.json`;
    if (downloadFile(name, JSON.stringify(payload), 'application/json')) {
      showToast(`💾 فایل پشتیبان (${toPersianDigits(Object.keys(data).length)} بخش) آماده شد`);
    }
  }

  // خروجی: { data } معتبر یا { error } به فارسی
  function parseBackup(text) {
    if (typeof text !== 'string' || text.length > BACKUP_MAX_BYTES) return { error: 'فایل خیلی بزرگ یا نامعتبر است' };
    let obj;
    try { obj = JSON.parse(text); } catch(e) { return { error: 'این فایل پشتیبان این برنامه نیست' }; }
    if (!obj || obj.app !== BACKUP_APP_ID || !obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) {
      return { error: 'این فایل پشتیبان این برنامه نیست' };
    }
    const keys = Object.keys(obj.data);
    if (!keys.length) return { error: 'فایل پشتیبان خالی است' };
    for (const k of keys) {
      if (!k.startsWith('geomat_') || typeof obj.data[k] !== 'string') return { error: 'فایل پشتیبان خراب است' };
    }
    return { data: obj.data, exportedAt: obj.exportedAt };
  }

  function restoreBackupFromInput(input) {
    const file = input.files && input.files[0];
    input.value = ''; // انتخاب دوباره همان فایل هم رویداد بدهد
    if (!file) return;
    if (file.size > BACKUP_MAX_BYTES) {
      showToast('⚠️ فایل خیلی بزرگ است');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const parsed = parseBackup(String(reader.result || ''));
      if (parsed.error) {
        showToast(`⚠️ ${parsed.error}`);
        return;
      }
      const when = parsed.exportedAt && !isNaN(new Date(parsed.exportedAt))
        ? `${shortDateLabel(new Date(parsed.exportedAt))} ${toPersianDigits(dateToJalali(new Date(parsed.exportedAt)).jy)}`
        : 'نامشخص';
      if (!await appConfirm(`اطلاعات فعلی این گوشی با پشتیبانِ ${when} جایگزین شود؟ (پرونده فنی ادغام می‌شود و هیچ نسخه‌ای از تاریخچه آن پاک نمی‌شود)`, 'بازگردانی')) return;
      if (!replaceAppData(parsed.data)) {
        showToast('⚠️ بازگردانی انجام نشد (حافظه پر است)؛ اطلاعات قبلی دست نخورد');
        return;
      }
      showToast('♻️ اطلاعات بازگردانی شد');
      setTimeout(() => location.reload(), 700);
    };
    reader.onerror = () => showToast('⚠️ خواندن فایل ممکن نشد');
    reader.readAsText(file);
  }

  // جایگزینی کل داده با پشتیبان، به‌صورت همه یا هیچ (اگر وسط کار حافظه پر شد، داده قبلی برمی‌گردد).
  // پرونده فنی جایگزین نمی‌شود بلکه ادغام می‌شود تا با بازگرداندن یک پشتیبان قدیمی هیچ نسخه‌ای از تاریخچه گم نشود؛
  // حساب‌های تیم و تنظیمات امنیتی خود گوشی (بیومتریک، شمارنده رمز اشتباه) هم دست نمی‌خورند.
  const DEVICE_LOCAL_KEYS = ['geomat_bio_v1', 'geomat_vault_fail_v1', 'geomat_last_phone', 'geomat_bio_offered_v1', 'geomat_notif_asked_v1'];
  function replaceAppData(incoming) {
    const current = snapshotAppData();
    const next = { ...incoming };
    delete next[PRE_UPDATE_BACKUP_KEY];
    if (current[TEAM_KEY]) next[TEAM_KEY] = current[TEAM_KEY];
    DEVICE_LOCAL_KEYS.forEach(k => { if (current[k] !== undefined) next[k] = current[k]; else delete next[k]; });
    const merged = mergeInventoryData(current[INVENTORY_KEY], incoming[INVENTORY_KEY], { admin: isAdmin() });
    if (merged) next[INVENTORY_KEY] = merged;
    const write = (data) => {
      Object.keys(snapshotAppData()).forEach(k => { if (!(k in data)) localStorage.removeItem(k); });
      Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
    };
    try {
      write(next);
      return true;
    } catch(e) {
      try { write(current); } catch(e2) {}
      return false;
    }
  }

  // ذخیره فایل: داخل اپ اندروید از پل جاوا (انتخاب محل ذخیره)، در مرورگر با دانلود معمولی
  function downloadFile(name, content, mime) {
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge.saveFile === 'function') {
        window.AndroidBridge.saveFile(name, mime, content);
        return true;
      }
      const blob = new Blob([content], { type: `${mime};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return true;
    } catch(e) {
      showToast('⚠️ ذخیره فایل ممکن نشد');
      return false;
    }
  }

  // پنجره تأیید داخل خود اپ: confirm() مرورگر داخل WebView اندروید نمایش داده نمی‌شد
  // و همیشه false برمی‌گرداند، برای همین حذف پیام‌ها و شرکت‌ها هیچ‌وقت انجام نمی‌شد
  let confirmResolver = null;
  function appConfirm(message, okLabel) {
    if (confirmResolver) confirmResolver(false);
    document.getElementById('confirmText').textContent = message;
    document.getElementById('confirmOkBtn').textContent = okLabel || 'حذف';
    document.getElementById('confirmModal').classList.add('open');
    return new Promise(resolve => { confirmResolver = resolve; });
  }
  function resolveConfirm(ok) {
    document.getElementById('confirmModal').classList.remove('open');
    const r = confirmResolver;
    confirmResolver = null;
    if (r) r(ok);
  }

  let toastTimer = null;
  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove('show');
    }, 2200);
  }

