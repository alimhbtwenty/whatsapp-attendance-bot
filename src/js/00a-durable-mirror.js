  // ==================== نسخه دوم روی دیسک (فقط اپ اندروید) ====================
  // WebView نوشته‌های localStorage را با تأخیر روی دیسک می‌برد؛ با خاموش/ری‌استارت شدن گوشی تغییرهای آخر گم می‌شد
  // (گزارش مالک: رکورد حذف‌شده برگشت، ورود تازه گم شد). هر نوشتن در کلیدهای geomat_* همان لحظه و اتمیک در فایل‌های
  // خود برنامه هم نوشته می‌شود و اگر بعد از شروع، localStorage عقب بود، از همان فایل‌ها برگردانده می‌شود.
  // نام کلیدها و ساختار داده عوض نمی‌شود؛ در وب‌اپ (بدون پل) هیچ کاری نمی‌کند.
  const MIRROR_SEQ_KEY = 'geomat_mirror_seq';
  const MIRROR_KEY_RE = /^geomat_[a-z0-9_]+$/;
  const mirrorBridge = () => window.AndroidBridge && typeof window.AndroidBridge.storeSet === 'function' &&
    typeof window.AndroidBridge.storeSnapshot === 'function' ? window.AndroidBridge : null;
  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;
  let mirrorPaused = false;
  let mirrorRestored = false;
  const mirrored = (store, key) => store === localStorage && !mirrorPaused && MIRROR_KEY_RE.test(key) && key !== MIRROR_SEQ_KEY;
  function noteMirrorSeq(seq) {
    const n = Number(seq);
    if (n > 0) { try { nativeSetItem.call(localStorage, MIRROR_SEQ_KEY, String(n)); } catch(e) {} }
  }
  (function installMirror() {
    const br = mirrorBridge();
    if (!br) return;
    // اگر نوشتن در localStorage شکست بخورد (حافظه پر)، به نسخه دوم هم نمی‌رسد؛ دو طرف هم‌خوان می‌مانند
    Storage.prototype.setItem = function(key, value) {
      nativeSetItem.call(this, key, value);
      if (mirrored(this, key)) noteMirrorSeq(br.storeSet(String(key), String(value)));
    };
    Storage.prototype.removeItem = function(key) {
      nativeRemoveItem.call(this, key);
      if (mirrored(this, key)) noteMirrorSeq(br.storeRemove(String(key)));
    };
  })();

  // اول init، پیش از مهاجرت و هر خواندن داده.
  // نسخه دوم فقط وقتی «کامل» است (همه داده یک بار بی‌خطا نوشته شده و از آن به بعد هیچ نوشتنی شکست نخورده) مرجع است؛
  // و بازگردانی فقط کلیدهایی را پاک می‌کند که نسخه دوم صریحاً «حذف‌شده» ثبت کرده، نه هر کلیدی که در آن نیست.
  function restoreFromMirror() {
    const br = mirrorBridge();
    if (!br) return;
    let snap = null;
    try { snap = JSON.parse(br.storeSnapshot() || 'null'); } catch(e) { return; }
    if (!snap || !snap.data || typeof snap.data !== 'object') return;
    const valid = (k) => MIRROR_KEY_RE.test(k) && k !== MIRROR_SEQ_KEY;
    const keys = Object.keys(snap.data).filter(k => valid(k) && typeof snap.data[k] === 'string');
    const removed = Array.isArray(snap.removed) ? snap.removed.filter(k => typeof k === 'string' && valid(k) && !keys.includes(k)) : [];
    const local = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && valid(k)) local.push(k);
    }
    if (snap.complete !== true) {
      // نسخه دوم ناقص یا خالی (اولین اجرا بعد از آپدیت، یا یک نوشتنِ ناموفق): از داده فعلی دوباره ساخته می‌شود؛
      // هیچ چیزی در localStorage عوض نمی‌شود
      let allOk = true;
      for (const k of local) { const v = localStorage.getItem(k); const seq = Number(br.storeSet(k, v)); if (seq > 0) noteMirrorSeq(seq); else allOk = false; }
      for (const k of keys) if (!local.includes(k)) { const seq = Number(br.storeRemove(k)); if (seq > 0) noteMirrorSeq(seq); else allOk = false; }
      if (allOk && typeof br.storeMarkComplete === 'function') br.storeMarkComplete();
      return;
    }
    const localSeq = Number(localStorage.getItem(MIRROR_SEQ_KEY)) || 0;
    if (!(Number(snap.seq) > localSeq)) return;
    // localStorage از نسخه دوم عقب است: نوشته‌های آخر گم شده‌اند؛ همان وضع نسخه دوم برمی‌گردد
    mirrorPaused = true;
    try {
      removed.forEach(k => nativeRemoveItem.call(localStorage, k));
      keys.forEach(k => nativeSetItem.call(localStorage, k, snap.data[k]));
      nativeSetItem.call(localStorage, MIRROR_SEQ_KEY, String(Number(snap.seq)));
      mirrorRestored = true;
    } catch(e) {
      // حافظه پر: هر چه نوشته شد ماند؛ دفعه بعد دوباره تلاش می‌شود (seq محلی بالا نرفته)
    } finally {
      mirrorPaused = false;
    }
  }
