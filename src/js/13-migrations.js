  // ==================== به‌روزرسانی امن داده ====================
  // نام کلیدهای geomat_* و ساختار رکوردها عوض نمی‌شود؛ هر تغییر ساختار یک گام نسخه‌دار و فقط-افزودنی است.
  // قبل از اولین اجرای 1.4، یک کپی کامل از همه داده گرفته می‌شود تا هر خرابی برگشت‌پذیر باشد.
  const SCHEMA_VERSION_KEY = 'geomat_schema_version';
  const PRE_UPDATE_BACKUP_KEY = 'geomat_backup_pre_1_4';
  const SCHEMA_VERSION = 14;

  function snapshotAppData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('geomat_') && k !== PRE_UPDATE_BACKUP_KEY && k !== MIRROR_SEQ_KEY) data[k] = localStorage.getItem(k);
    }
    return data;
  }

  // فضای localStorage حدود ۵ میلیون نویسه است. کپی پیش از به‌روزرسانی یک نسخه دوم از همه داده است:
  // ۳۰ روز بعد خودکار پاک می‌شود، و اگر زودتر جا تمام شد، پیش از هر رکورد واقعی همین پاک می‌شود.
  const STORAGE_QUOTA_CHARS = 5200000;
  const PRE_UPDATE_KEEP_MS = 30 * 86400000;
  function dropPreUpdateBackup(reason) {
    if (!localStorage.getItem(PRE_UPDATE_BACKUP_KEY)) return false;
    localStorage.removeItem(PRE_UPDATE_BACKUP_KEY);
    if (reason) showToast(reason);
    if (typeof renderSettings === 'function') renderSettings();
    return true;
  }
  // ذخیره با یک تلاش دوباره بعد از آزاد کردن کپی پیش از به‌روزرسانی؛ اگر باز جا نبود خطا می‌دهد
  function storeItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch(e) {
      if (!dropPreUpdateBackup('🧹 حافظه پر بود؛ کپی پیش از به‌روزرسانی پاک شد تا اطلاعات تازه ذخیره شود')) throw e;
      localStorage.setItem(key, value);
    }
  }
  function storageUsedChars() {
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      n += k.length + (localStorage.getItem(k) || '').length;
    }
    return n;
  }
  function expirePreUpdateBackup() {
    try {
      const snap = JSON.parse(localStorage.getItem(PRE_UPDATE_BACKUP_KEY) || 'null');
      if (snap && Date.now() - new Date(snap.at).getTime() > PRE_UPDATE_KEEP_MS) dropPreUpdateBackup('');
    } catch(e) {}
  }

  function runMigrations() {
    let from = 0;
    try { from = parseInt(localStorage.getItem(SCHEMA_VERSION_KEY) || '0', 10) || 0; } catch(e) {}
    if (from < 14) {
      const data = snapshotAppData();
      // نصب تازه (داده‌ای نیست) کپی لازم ندارد
      if (Object.keys(data).length && !localStorage.getItem(PRE_UPDATE_BACKUP_KEY)) {
        try {
          localStorage.setItem(PRE_UPDATE_BACKUP_KEY, JSON.stringify({ at: new Date().toISOString(), from, data }));
        } catch(e) {
          // حافظه برای کپی کافی نیست: مهاجرتی که داده را تغییر می‌دهد انجام نمی‌شود تا چیزی از دست نرود
          showToast('⚠️ حافظه برای پشتیبان پیش از به‌روزرسانی کافی نیست؛ لطفاً از تنظیمات فایل پشتیبان بگیرید');
          return;
        }
      }
    }
    // گام‌های تا 1.4 (هر کدام تکرارپذیر و بی‌اثر در اجرای دوباره)
    mergeLegacySplitStays();
    try { localStorage.setItem(SCHEMA_VERSION_KEY, String(SCHEMA_VERSION)); } catch(e) {}
    expirePreUpdateBackup();
  }

  // برگرداندن کامل داده به لحظه پیش از به‌روزرسانی (از تنظیمات)
  async function restorePreUpdateBackup() {
    let snap = null;
    try { snap = JSON.parse(localStorage.getItem(PRE_UPDATE_BACKUP_KEY) || 'null'); } catch(e) {}
    if (!snap || !snap.data) { showToast('پشتیبان پیش از به‌روزرسانی وجود ندارد'); return; }
    if (!await appConfirm('همه اطلاعات به لحظه پیش از نصب این نسخه برگردد؟ تغییرات بعد از آن از بین می‌رود.', 'برگرداندن')) return;
    if (!replaceAppData({ ...snap.data, [SCHEMA_VERSION_KEY]: String(SCHEMA_VERSION) })) { // دوباره مهاجرت و کپی نشود
      showToast('⚠️ برگرداندن انجام نشد (حافظه پر است)؛ اطلاعات فعلی دست نخورد');
      return;
    }
    showToast('♻️ اطلاعات پیش از به‌روزرسانی برگردانده شد');
    setTimeout(() => location.reload(), 700);
  }
