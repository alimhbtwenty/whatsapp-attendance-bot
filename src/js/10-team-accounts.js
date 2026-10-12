  // ==================== پرونده فنی: حساب‌ها، کلید تیم و تاریخچه ====================
  // هر نفر نام و رمز خودش را دارد. یک «کلید تیم» تصادفی (AES-GCM-256) همه پسوردها را رمز می‌کند و
  // برای هر حساب با کلیدی که از رمز همان نفر ساخته می‌شود (PBKDF2) قفل و ذخیره می‌شود.
  // هیچ رمزی و هیچ کلیدی ساده ذخیره نمی‌شود؛ کلید تیم فقط بعد از ورود در حافظه است.
  // هیچ تغییری پاک نمی‌شود: هر افزودن/ویرایش/حذف یک نسخه کامل به تاریخچه اضافه می‌کند و مدیر همه را می‌بیند.
  const TEAM_KEY = 'geomat_team_v1';
  const INVENTORY_KEY = 'geomat_inventory_v1';
  const LEGACY_VAULT_KEY = 'geomat_vault_meta_v1'; // پیش‌نمایش 1.4: یک رمز اصلی برای همه
  const VAULT_FAIL_KEY = 'geomat_vault_fail_v1';
  const KDF_ITERATIONS = 310000;
  const SESSION_IDLE_MS = 5 * 60 * 1000;     // پرونده فنی بعد از این بی‌کاری قفل می‌شود
  const PASSWORD_MIN_LEN = 8;
  const ROLE_LABELS = { admin: 'مدیر', tech: 'تکنسین' };

  const b64 = {
    enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
    dec: (str) => Uint8Array.from(atob(str), c => c.charCodeAt(0))
  };
  function cryptoSupported() {
    return !!(window.crypto && crypto.subtle && window.isSecureContext !== false);
  }
  async function derivePasswordKey(password, saltB64, iterations) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: b64.dec(saltB64), iterations },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptBytes(key, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
    return { v: 1, iv: b64.enc(iv), ct: b64.enc(ct) };
  }
  async function decryptBytes(key, blob) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.dec(blob.iv) }, key, b64.dec(blob.ct)));
  }
  const encryptWith = async (key, text) => encryptBytes(key, new TextEncoder().encode(text));
  const decryptWith = async (key, blob) => new TextDecoder().decode(await decryptBytes(key, blob));
  const importTeamKey = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

  function newId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // ---------- حساب‌ها ----------
  // شماره موبایل شناسه ورود است (بعداً همین در دیتابیس سرور می‌رود و پنل مدیریت عوضش می‌کند)
  function normalizePhone(input) {
    let s = faToEnDigits(String(input || '')).replace(/[\s\-()]/g, '');
    if (s.startsWith('+98')) s = '0' + s.slice(3);
    else if (s.startsWith('0098')) s = '0' + s.slice(4);
    else if (/^98\d{10}$/.test(s)) s = '0' + s.slice(2);
    else if (/^9\d{9}$/.test(s)) s = '0' + s;
    return /^09\d{9}$/.test(s) ? s : '';
  }
  function validTeam(t) {
    return t && t.schema === 1 && Array.isArray(t.users) && t.users.length > 0 && t.users.every(u =>
      u && typeof u.id === 'string' && typeof u.name === 'string' && (u.role === 'admin' || u.role === 'tech') &&
      (u.phone === undefined || typeof u.phone === 'string') &&
      typeof u.salt === 'string' && Number.isInteger(u.iter) && u.iter >= 100000 && u.iter <= 5000000 && u.wrapped && typeof u.wrapped.iv === 'string' && typeof u.wrapped.ct === 'string');
  }
  function getTeam() {
    try {
      const t = JSON.parse(localStorage.getItem(TEAM_KEY) || 'null');
      if (validTeam(t)) {
        if (!Array.isArray(t.log)) t.log = [];
        return t;
      }
    } catch(e) {}
    return null;
  }
  function saveTeam(t) {
    try {
      storeItem(TEAM_KEY, JSON.stringify(t));
      return true;
    } catch(e) {
      showToast('⚠️ حافظه پر است؛ ذخیره نشد');
      return false;
    }
  }
  async function makeAccount(name, phone, role, password, rawKey, by) {
    const salt = b64.enc(crypto.getRandomValues(new Uint8Array(16)));
    const pk = await derivePasswordKey(password, salt, KDF_ITERATIONS);
    return { id: newId(), name, phone, role, active: true, salt, iter: KDF_ITERATIONS, wrapped: await encryptBytes(pk, rawKey), createdAt: new Date().toISOString(), createdBy: by };
  }
  async function rewrapAccount(u, password, rawKey) {
    const salt = b64.enc(crypto.getRandomValues(new Uint8Array(16)));
    const pk = await derivePasswordKey(password, salt, KDF_ITERATIONS);
    Object.assign(u, { salt, iter: KDF_ITERATIONS, wrapped: await encryptBytes(pk, rawKey) });
  }
  // رمز این حساب درست است؟ کلید تیم یا null
  async function unwrapWithPassword(u, password) {
    try {
      const pk = await derivePasswordKey(password, u.salt, u.iter);
      return await decryptBytes(pk, u.wrapped);
    } catch(e) {
      return null;
    }
  }
  function teamLog(team, action, detail) {
    team.log.push({ at: new Date().toISOString(), by: sessionWho(), action, detail });
  }

  // ---------- نشست برنامه (فقط در حافظه) ----------
  // ورود به کل برنامه با شماره و رمز (یا بیومتریک). پرونده فنی جدا دوباره هویت می‌خواهد.
  const APP_LOCK_AFTER_MS = 5 * 60 * 1000;   // بیش از این در پس‌زمینه = ورود دوباره
  const LAST_PHONE_KEY = 'geomat_last_phone';
  let session = null; // { user, key, raw }
  let techUnlockedUntil = 0;
  let sessionIdleTimer = null;
  let hiddenAt = 0;
  const isAdmin = () => !!session && session.user.role === 'admin';
  const sessionWho = () => session ? { id: session.user.id, name: session.user.name } : { id: null, name: getUserName() };
  const techUnlocked = () => !!session && techUnlockedUntil > Date.now();
  const techAdmin = () => isAdmin() && techUnlocked();

  async function startSession(user, raw) {
    session = { user: { id: user.id, name: user.name, phone: user.phone || '', role: user.role }, key: await importTeamKey(raw), raw };
    techUnlockedUntil = 0;
    try {
      if (user.phone) localStorage.setItem(LAST_PHONE_KEY, user.phone);
      localStorage.setItem('geomat_user_name', user.name);
    } catch(e) {}
    setFails({ n: 0, until: 0 });
    document.getElementById('appLock').classList.remove('open');
    setAppInert(false);
    document.getElementById('userNameHeader').textContent = user.name;
    updatePreview();
    updateSupportPreview();
    if (systemMode === 'messenger') renderChatMessages();
    if (!user.phone) await askOwnPhone();
    await migrateLegacyVault();
    runPendingNotificationAction();
    offerBiometric();
  }
  function lockApp(silent) {
    if (session && session.raw) session.raw.fill(0);
    session = null;
    techUnlockedUntil = 0;
    clearTimeout(sessionIdleTimer);
    closeInvItemModal();
    closeInvPanel();
    if (vaultModalResolver) resolveVaultModal(null);
    renderLockScreen();
    if (systemMode === 'support' && supportView === 'inventory') renderInventory();
    if (!silent) showToast('🔒 از حساب خارج شدید');
  }
  // قفل پرونده فنی (برنامه باز می‌ماند)
  function lockTech(silent) {
    if (!techUnlockedUntil) return;
    techUnlockedUntil = 0;
    clearTimeout(sessionIdleTimer);
    closeInvItemModal();
    closeInvPanel();
    if (systemMode === 'support' && supportView === 'inventory') renderInventory();
    if (!silent) showToast('🔒 پرونده فنی قفل شد');
  }
  function touchSession() {
    if (!techUnlocked()) return;
    techUnlockedUntil = Date.now() + SESSION_IDLE_MS;
    clearTimeout(sessionIdleTimer);
    sessionIdleTimer = setTimeout(() => lockTech(false), SESSION_IDLE_MS);
  }
  // پس‌زمینه: پرونده فنی همان لحظه قفل می‌شود؛ برنامه اگر بیش از ۵ دقیقه بیرون بود
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      lockTech(true);
    } else if (session && hiddenAt && Date.now() - hiddenAt > APP_LOCK_AFTER_MS) {
      lockApp(true);
    }
  });

  function getFails() {
    try { return JSON.parse(localStorage.getItem(VAULT_FAIL_KEY) || 'null') || { n: 0, until: 0 }; } catch(e) { return { n: 0, until: 0 }; }
  }
  function setFails(f) {
    try { localStorage.setItem(VAULT_FAIL_KEY, JSON.stringify(f)); } catch(e) {}
  }
  function failWait() {
    const f = getFails();
    return f.until > Date.now() ? `چند بار اشتباه وارد شد؛ ${toPersianDigits(Math.ceil((f.until - Date.now()) / 1000))} ثانیه صبر کنید` : '';
  }
  function recordFail() {
    const n = getFails().n + 1;
    setFails({ n: n >= 5 ? 0 : n, until: n >= 5 ? Date.now() + 30000 : 0 });
    return n >= 5 ? 'رمز اشتباه است؛ ۳۰ ثانیه صبر کنید' : 'شماره یا رمز اشتباه است';
  }

  // ---------- صفحه ورود ----------
  let lockLegacyMode = false;
  // صفحه پشت قفل با کیبورد و صفحه‌خوان هم در دسترس نیست
  function setAppInert(on) {
    document.querySelectorAll('body > :not(#appLock):not(#confirmModal):not(#vaultModal):not(#toast):not(script)').forEach(el => { el.inert = on; });
  }
  function renderLockScreen() {
    const box = document.getElementById('appLockBody');
    document.getElementById('appLock').classList.add('open');
    setAppInert(true);
    if (!cryptoSupported()) {
      box.innerHTML = '<div class="lock-hint">این مرورگر از رمزنگاری امن پشتیبانی نمی‌کند. برنامه را از نسخه اندروید یا یک مرورگر به‌روز (با https) باز کنید.</div>';
      return;
    }
    const team = getTeam();
    const importLink = `<button class="lock-link" data-click='["openTeamFilePicker"]'>📥 ورود فایل تیم (گوشی تکنسین)</button>`;
    if (!team) {
      box.innerHTML = `<div class="lock-title">راه‌اندازی Geo Team</div>
        <div class="lock-hint">اولین بار: حساب مدیر را بسازید. بعد از بخش «پرونده فنی ← کاربران» برای هر تکنسین حساب جدا بسازید و «فایل تیم» را به گوشی‌اش بدهید.</div>
        <input type="text" class="cyber-input" id="lockName" maxlength="60" placeholder="نام و نام خانوادگی" aria-label="نام و نام خانوادگی" autocomplete="name" value="${escapeHtml(localStorage.getItem('geomat_user_name') || '')}">
        <input type="tel" class="cyber-input" id="lockPhone" dir="ltr" maxlength="16" placeholder="شماره موبایل، مثل ۰۹۱۲۱۲۳۴۵۶۷" aria-label="شماره موبایل، مثل ۰۹۱۲۱۲۳۴۵۶۷" autocomplete="tel" inputmode="tel">
        <input type="password" class="cyber-input" id="lockPw" dir="ltr" maxlength="128" placeholder="رمز (حداقل ۸ کاراکتر)" aria-label="رمز (حداقل ۸ کاراکتر)" autocomplete="new-password">
        <input type="password" class="cyber-input" id="lockPw2" dir="ltr" maxlength="128" placeholder="تکرار رمز" aria-label="تکرار رمز" autocomplete="new-password">
        <button class="install-btn lock-main-btn" id="lockSubmit" data-click='["setupAdmin"]'>ساخت حساب مدیر</button>
        <div class="lock-err" id="lockErr" role="alert"></div>
        ${importLink}`;
      return;
    }
    const legacy = team.users.filter(u => u.active && !u.phone);
    const lastPhone = localStorage.getItem(LAST_PHONE_KEY) || '';
    const who = lockLegacyMode
      ? `<select class="cyber-input" id="lockLegacyUser">${legacy.map(u => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`).join('')}</select>`
      : `<input type="tel" class="cyber-input" id="lockPhone" dir="ltr" maxlength="16" placeholder="شماره موبایل، مثل ۰۹۱۲۱۲۳۴۵۶۷" aria-label="شماره موبایل، مثل ۰۹۱۲۱۲۳۴۵۶۷" autocomplete="tel" inputmode="tel" value="${escapeHtml(lastPhone)}">`;
    box.innerHTML = `<div class="lock-title">ورود</div>
      ${who}
      <input type="password" class="cyber-input" id="lockPw" dir="ltr" maxlength="128" placeholder="رمز" aria-label="رمز" autocomplete="current-password">
      <button class="install-btn lock-main-btn" id="lockSubmit" data-click='["loginApp"]'>ورود</button>
      <button class="dock-copy-btn lock-bio-btn" id="lockBioBtn" style="display:none;" data-click='["loginWithBiometric"]'>👆 ورود با اثر انگشت / چهره</button>
      <div class="lock-err" id="lockErr" role="alert"></div>
      ${legacy.length ? `<button class="lock-link" data-click='["toggleLegacyLogin"]'>${lockLegacyMode ? 'ورود با شماره موبایل' : 'حساب قدیمی بدون شماره؟ ورود با نام'}</button>` : ''}`;
    refreshLockBio();
    const phone = document.getElementById('lockPhone');
    if (phone) phone.addEventListener('input', refreshLockBio);
  }
  function toggleLegacyLogin() {
    lockLegacyMode = !lockLegacyMode;
    renderLockScreen();
  }
  function lockUser() {
    const team = getTeam();
    if (!team) return null;
    if (lockLegacyMode) {
      const id = (document.getElementById('lockLegacyUser') || {}).value;
      return team.users.find(u => u.id === id) || null;
    }
    const phone = normalizePhone((document.getElementById('lockPhone') || {}).value);
    return phone ? team.users.find(u => u.phone === phone) || null : null;
  }
  async function refreshLockBio() {
    const btn = document.getElementById('lockBioBtn');
    if (!btn) return;
    const u = lockUser();
    btn.style.display = u && u.active && await Bio.enrolled(u.id) ? '' : 'none';
  }

  async function loginApp() {
    const err = document.getElementById('lockErr');
    const wait = failWait();
    if (wait) { err.textContent = wait; return; }
    const pwInput = document.getElementById('lockPw');
    const pw = pwInput.value;
    const u = lockUser();
    if (!lockLegacyMode && !normalizePhone(document.getElementById('lockPhone').value)) { err.textContent = 'شماره موبایل درست نیست (مثل 09121234567)'; return; }
    if (!pw) { err.textContent = 'رمز را بنویسید'; return; }
    const btn = document.getElementById('lockSubmit');
    btn.disabled = true;
    // حساب ناموجود هم همان زمان و همان پیام را می‌گیرد تا وجود شماره لو نرود
    const raw = u ? await unwrapWithPassword(u, pw) : (await unwrapWithPassword({ salt: b64.enc(new Uint8Array(16)), iter: KDF_ITERATIONS, wrapped: { iv: b64.enc(new Uint8Array(12)), ct: b64.enc(new Uint8Array(48)) } }, pw), null);
    btn.disabled = false;
    pwInput.value = '';
    if (!raw) { err.textContent = recordFail(); return; }
    if (!u.active) { err.textContent = 'این حساب غیرفعال شده است؛ با مدیر تماس بگیرید'; return; }
    lockLegacyMode = false;
    await startSession(u, raw);
  }
  async function loginWithBiometric() {
    const err = document.getElementById('lockErr');
    const u = lockUser();
    if (!u || !u.active) { err.textContent = 'این حساب فعال نیست'; return; }
    try {
      const raw = await Bio.unlock(u.id);
      // کلید تیم درست است؟ (اگر حساب عوض شده باشد، رمز لازم است)
      await importTeamKey(raw);
      await startSession(u, raw);
    } catch(e) {
      err.textContent = e && e.message ? e.message : 'ورود با اثر انگشت انجام نشد؛ با رمز وارد شوید';
    }
  }

  // اولین بار: حساب مدیر و کلید تیم ساخته می‌شود
  async function setupAdmin() {
    const err = document.getElementById('lockErr');
    const name = document.getElementById('lockName').value.replace(/\s+/g, ' ').trim();
    const phone = normalizePhone(document.getElementById('lockPhone').value);
    const pw = document.getElementById('lockPw').value;
    if (!name) { err.textContent = 'نام را بنویسید'; return; }
    if (!phone) { err.textContent = 'شماره موبایل درست نیست (مثل 09121234567)'; return; }
    if (pw.length < PASSWORD_MIN_LEN) { err.textContent = `رمز حداقل ${toPersianDigits(PASSWORD_MIN_LEN)} کاراکتر باشد`; return; }
    if (pw !== document.getElementById('lockPw2').value) { err.textContent = 'تکرار رمز یکی نیست'; return; }
    document.getElementById('lockSubmit').disabled = true;
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const admin = await makeAccount(name, phone, 'admin', pw, raw, null);
    const team = { schema: 1, users: [admin], log: [] };
    team.log.push({ at: new Date().toISOString(), by: { id: admin.id, name }, action: 'team-create', detail: `ساخت حساب مدیر «${name}»` });
    if (!saveTeam(team)) { document.getElementById('lockSubmit').disabled = false; return; }
    showToast('🛡 حساب مدیر ساخته شد');
    await startSession(admin, raw);
  }

  // حساب‌های پیش‌نمایش که شماره نداشتند، در اولین ورود شماره می‌گیرند
  async function askOwnPhone() {
    for (;;) {
      const v = await askText('📱 شماره موبایل شما', 'برای ورودهای بعدی، مثل 09121234567');
      if (!session) return;
      const phone = normalizePhone(v);
      if (!phone) { showToast('شماره موبایل درست نیست'); continue; }
      const team = getTeam();
      if (team.users.some(u => u.phone === phone && u.id !== session.user.id)) { showToast('این شماره برای حساب دیگری است'); continue; }
      const u = team.users.find(x => x.id === session.user.id);
      u.phone = phone;
      session.user.phone = phone;
      teamLog(team, 'phone', `ثبت شماره برای «${u.name}»`);
      if (saveTeam(team)) { localStorage.setItem(LAST_PHONE_KEY, phone); showToast('📱 شماره ثبت شد'); return; }
    }
  }

  // ---------- پرونده فنی: تأیید دوباره هویت ----------
  async function unlockTechWithPassword() {
    if (!session) return;
    const team = getTeam();
    const u = team && team.users.find(x => x.id === session.user.id);
    if (!u || !u.active) { lockApp(false); return; }
    const r = await askVaultPassword({
      title: '🔐 پرونده فنی', hint: `برای دیدن پرونده فنی، رمز «${u.name}» را دوباره وارد کنید.`, okLabel: 'باز کن',
      check: async (pw) => { const w = failWait(); if (w) return w; return await unwrapWithPassword(u, pw) ? '' : recordFail(); }
    });
    if (!r || !session) return;
    setFails({ n: 0, until: 0 });
    techUnlockedUntil = Date.now() + SESSION_IDLE_MS;
    touchSession();
    renderInventory();
  }
  async function unlockTechWithBiometric() {
    if (!session) return;
    try {
      await Bio.unlock(session.user.id);
      techUnlockedUntil = Date.now() + SESSION_IDLE_MS;
      touchSession();
      renderInventory();
    } catch(e) {
      showToast(e && e.message ? e.message : 'تأیید انجام نشد؛ با رمز باز کنید');
    }
  }

  // ---------- حساب من ----------
  async function openAccountPanel() {
    if (!session) return;
    const bioOn = await Bio.enrolled(session.user.id);
    const bioOk = await Bio.available();
    openInvPanel('👤 حساب من', `
      <div class="inv-ver">
        <div class="inv-ver-head"><span>${escapeHtml(session.user.name)} <span class="inv-role ${isAdmin() ? '' : 'tech'}">${ROLE_LABELS[session.user.role]}</span></span></div>
        <div class="inv-meta inv-ltr">${escapeHtml(session.user.phone || '—')}</div>
      </div>
      <button class="inv-small-btn" data-click='["changeMyPassword"]'>🔑 تغییر رمز</button>
      ${bioOk ? `<button class="inv-small-btn" data-click='["${bioOn ? 'disableBiometric' : 'enableBiometric'}"]'>${bioOn ? '👆 خاموش کردن ورود با اثر انگشت' : '👆 روشن کردن ورود با اثر انگشت / چهره'}</button>` : '<div class="inv-meta">ورود با اثر انگشت روی این دستگاه یا مرورگر در دسترس نیست.</div>'}
      <button class="inv-small-btn" data-click='["importTeamFileFromSession"]'>📥 به‌روزرسانی فایل تیم</button>
      <button class="inv-small-btn" data-click='["logoutApp"]'>🚪 خروج از حساب</button>`);
  }
  function logoutApp() {
    closeInvPanel();
    lockApp(false);
  }

  async function changeMyPassword() {
    if (!session) return;
    const r = await askVaultPassword({ title: '🔑 رمز جدید شما', hint: `رمز ورود «${session.user.name}» به Geo Team.`, confirm: true, okLabel: 'تغییر' });
    if (!r || !session) return;
    const team = getTeam();
    const u = team.users.find(x => x.id === session.user.id);
    if (!u) return;
    await rewrapAccount(u, r.pw, session.raw);
    teamLog(team, 'password', `تغییر رمز «${u.name}» توسط خودش`);
    if (saveTeam(team)) showToast('🔑 رمز شما عوض شد');
  }

  // ---------- بیومتریک ----------
  const BIO_OFFER_KEY = 'geomat_bio_offered_v1';
  async function enableBiometric() {
    if (!session) return;
    try {
      await Bio.enroll(session.user.id, session.raw, session.user.name, session.user.phone);
      const team = getTeam();
      teamLog(team, 'biometric', `روشن کردن اثر انگشت برای «${session.user.name}» روی این دستگاه`);
      saveTeam(team);
      showToast('👆 ورود با اثر انگشت روشن شد');
    } catch(e) {
      showToast(e && e.message ? e.message : 'روشن کردن اثر انگشت انجام نشد');
    }
    if (document.getElementById('invPanelModal').classList.contains('open')) openAccountPanel();
  }
  async function disableBiometric() {
    if (!session) return;
    await Bio.remove(session.user.id);
    showToast('ورود با اثر انگشت خاموش شد');
    openAccountPanel();
  }
  // یک بار بعد از ورود با رمز پیشنهاد می‌شود
  async function offerBiometric() {
    if (!session || !await Bio.available() || await Bio.enrolled(session.user.id)) return;
    let offered = {};
    try { offered = JSON.parse(localStorage.getItem(BIO_OFFER_KEY) || '{}') || {}; } catch(e) {}
    if (offered[session.user.id]) return;
    offered[session.user.id] = true;
    try { localStorage.setItem(BIO_OFFER_KEY, JSON.stringify(offered)); } catch(e) {}
    if (await appConfirm('ورودهای بعدی با اثر انگشت یا چهره گوشی انجام شود؟ (از «حساب من» هم می‌شود عوضش کرد)', 'روشن کن')) enableBiometric();
  }

  // دو پیاده‌سازی: پل بومی اندروید (Keystore + BiometricPrompt) یا WebAuthn با افزونه PRF در مرورگر.
  // در هر دو، کلید تیمِ آن کاربر با کلیدی رمز می‌شود که فقط بعد از تأیید بیومتریک در دسترس است.
  const BIO_WEB_KEY = 'geomat_bio_v1';
  const bioCallbacks = {};
  window.__geoBioDone = (id, ok, payload) => {
    const cb = bioCallbacks[id];
    delete bioCallbacks[id];
    if (cb) ok ? cb.resolve(payload) : cb.reject(new Error(payload || 'انجام نشد'));
  };
  function nativeBio(method, ...args) {
    return new Promise((resolve, reject) => {
      const id = newId();
      bioCallbacks[id] = { resolve, reject };
      try { window.AndroidBridge[method](...args, id); } catch(e) { delete bioCallbacks[id]; reject(e); }
    });
  }
  const hasNativeBio = () => !!(window.AndroidBridge && typeof window.AndroidBridge.bioStatus === 'function');
  function webBioStore() {
    try { const o = JSON.parse(localStorage.getItem(BIO_WEB_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch(e) { return {}; }
  }
  async function prfKey(first) {
    return crypto.subtle.importKey('raw', first, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  const Bio = {
    async available() {
      if (hasNativeBio()) return window.AndroidBridge.bioStatus() === 'available';
      try {
        if (!window.PublicKeyCredential || !window.isSecureContext || !PublicKeyCredential.getClientCapabilities) return false;
        const caps = await PublicKeyCredential.getClientCapabilities();
        return !!(caps['extension:prf'] && caps.userVerifyingPlatformAuthenticator);
      } catch(e) { return false; }
    },
    async enrolled(userId) {
      if (hasNativeBio()) return window.AndroidBridge.bioEnrolled(userId) === true;
      return !!webBioStore()[userId];
    },
    async enroll(userId, raw, name, phone) {
      if (hasNativeBio()) { await nativeBio('bioEnroll', userId, b64.enc(raw)); return; }
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const cred = await navigator.credentials.create({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Geo Team' },
        user: { id: new TextEncoder().encode(userId), name: phone || name, displayName: name },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        extensions: { prf: { eval: { first: salt } } }, timeout: 60000
      } });
      const ext = cred.getClientExtensionResults().prf;
      if (!ext || !ext.enabled) throw new Error('این مرورگر کلید امن بیومتریک (PRF) را پشتیبانی نمی‌کند');
      let first = ext.results && ext.results.first;
      if (!first) first = await Bio._prf(cred.rawId, salt);
      const store = webBioStore();
      store[userId] = { credId: b64.enc(cred.rawId), salt: b64.enc(salt), wrapped: await encryptBytes(await prfKey(first), raw) };
      localStorage.setItem(BIO_WEB_KEY, JSON.stringify(store));
    },
    async _prf(rawId, salt) {
      const a = await navigator.credentials.get({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: rawId }],
        userVerification: 'required', timeout: 60000,
        extensions: { prf: { eval: { first: salt } } }
      } });
      const r = a.getClientExtensionResults().prf;
      if (!r || !r.results || !r.results.first) throw new Error('تأیید بیومتریک کلید برنگرداند');
      return r.results.first;
    },
    async unlock(userId) {
      if (hasNativeBio()) return b64.dec(await nativeBio('bioUnlock', userId));
      const e = webBioStore()[userId];
      if (!e) throw new Error('ورود با اثر انگشت برای این حساب روشن نیست');
      const first = await Bio._prf(b64.dec(e.credId), b64.dec(e.salt));
      try {
        return await decryptBytes(await prfKey(first), e.wrapped);
      } catch(err) {
        throw new Error('کلید بیومتریک معتبر نیست؛ با رمز وارد شوید و دوباره روشنش کنید');
      }
    },
    async remove(userId) {
      if (hasNativeBio()) { window.AndroidBridge.bioRemove(userId); return; }
      const store = webBioStore();
      delete store[userId];
      localStorage.setItem(BIO_WEB_KEY, JSON.stringify(store));
    }
  };

  // پسوردهای پیش‌نمایش 1.4 (یک رمز اصلی) با کلید تیم دوباره رمز می‌شوند؛ فقط مدیر و فقط یک بار
  async function migrateLegacyVault() {
    let meta = null;
    try { meta = JSON.parse(localStorage.getItem(LEGACY_VAULT_KEY) || 'null'); } catch(e) {}
    if (!meta || meta.v !== 1 || !isAdmin()) return;
    const inv = getInventory();
    const blobs = [];
    const collect = (secrets) => Object.keys(secrets || {}).forEach(k => blobs.push([secrets, k]));
    inv.items.forEach(it => { collect(it.secrets); (it.history || []).forEach(h => collect(h.secrets)); });
    if (!blobs.length) { localStorage.removeItem(LEGACY_VAULT_KEY); return; }
    const r = await askVaultPassword({
      title: '🔁 انتقال پسوردهای قبلی',
      hint: 'پسوردهایی که با «رمز اصلی گاوصندوق» نسخه قبلی ذخیره شده‌اند به حساب‌های جدید منتقل می‌شوند. همان رمز اصلی قبلی را وارد کنید.',
      okLabel: 'انتقال',
      check: async (pw) => {
        try {
          const old = await derivePasswordKey(pw, meta.salt, meta.iter);
          if (await decryptWith(old, meta.check) !== 'geomat-vault-ok') return 'رمز اشتباه است';
          for (const [obj, k] of blobs) obj[k] = await encryptWith(session.key, await decryptWith(old, obj[k]));
          return '';
        } catch(e) {
          return 'رمز اشتباه است';
        }
      }
    });
    if (!r) { showToast('پسوردهای قبلی منتقل نشدند؛ دفعه بعد دوباره پرسیده می‌شود'); return; }
    if (saveInventory(inv)) {
      localStorage.removeItem(LEGACY_VAULT_KEY);
      showToast('🔁 پسوردهای قبلی منتقل شدند');
    }
  }

  // ---------- پنجره رمز ----------
  let vaultModalResolver = null;
  let vaultModalOpts = null;
  function askVaultPassword(opts) {
    if (vaultModalResolver) resolveVaultModal(null);
    vaultModalOpts = opts;
    document.getElementById('vaultModalTitle').textContent = opts.title;
    document.getElementById('vaultModalHint').textContent = opts.hint || '';
    const pw1 = document.getElementById('vaultPw1');
    const pw2 = document.getElementById('vaultPw2');
    pw1.value = '';
    pw2.value = '';
    pw1.placeholder = 'رمز';
    pw2.placeholder = 'تکرار رمز';
    pw2.style.display = opts.confirm ? '' : 'none';
    document.getElementById('vaultModalError').textContent = '';
    document.getElementById('vaultModalOk').textContent = opts.okLabel || 'تأیید';
    document.getElementById('vaultModal').classList.add('open');
    setTimeout(() => pw1.focus(), 100);
    return new Promise(resolve => { vaultModalResolver = resolve; });
  }
  function resolveVaultModal(value) {
    document.getElementById('vaultModal').classList.remove('open');
    document.getElementById('vaultPw1').value = '';
    document.getElementById('vaultPw2').value = '';
    const r = vaultModalResolver;
    vaultModalResolver = null;
    if (r) r(value);
  }
  async function submitVaultModal() {
    const pw = document.getElementById('vaultPw1').value;
    const err = document.getElementById('vaultModalError');
    if (vaultModalOpts.confirm) {
      if (pw.length < PASSWORD_MIN_LEN) { err.textContent = `رمز حداقل ${toPersianDigits(PASSWORD_MIN_LEN)} کاراکتر باشد`; return; }
      if (pw !== document.getElementById('vaultPw2').value) { err.textContent = 'تکرار رمز یکی نیست'; return; }
    } else if (!pw) {
      err.textContent = 'رمز را بنویسید';
      return;
    }
    if (vaultModalOpts.check) {
      const okBtn = document.getElementById('vaultModalOk');
      okBtn.disabled = true;
      const msg = await vaultModalOpts.check(pw);
      okBtn.disabled = false;
      if (msg) { err.textContent = msg; return; }
    }
    resolveVaultModal({ pw });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (document.getElementById('vaultModal').classList.contains('open')) { e.preventDefault(); submitVaultModal(); }
    else if (document.activeElement && document.activeElement.id === 'lockPw') { e.preventDefault(); document.getElementById('lockSubmit').click(); }
  });

  // ---------- مدیریت کاربران (مدیر) ----------
  function openUsersPanel() {
    if (!techAdmin()) return;
    const team = getTeam();
    openInvPanel('👥 کاربران پرونده فنی', `
      ${team.users.map(u => `<div class="inv-ver">
        <div class="inv-ver-head"><span>${escapeHtml(u.name)} <span class="inv-role ${u.role === 'tech' ? 'tech' : ''}">${ROLE_LABELS[u.role]}</span></span>
          <span class="inv-meta">${u.active ? '✅ فعال' : '⛔ غیرفعال'}</span></div>
        <div class="inv-meta inv-ltr">${escapeHtml(u.phone || 'بدون شماره')}</div>
        <div class="inv-tools">
          <button data-user-pw="${escapeHtml(u.id)}">🔑 رمز جدید</button>
          ${u.id === session.user.id ? '' : `<button data-user-toggle="${escapeHtml(u.id)}">${u.active ? '⛔ غیرفعال کن' : '✅ فعال کن'}</button>`}
        </div></div>`).join('')}
      <div class="inv-ver">
        <div class="inv-ver-head"><span>➕ حساب جدید</span></div>
        <input type="text" class="cyber-input" id="newUserName" maxlength="60" placeholder="نام" aria-label="نام">
        <input type="tel" class="cyber-input" id="newUserPhone" dir="ltr" maxlength="16" placeholder="شماره موبایل، مثل ۰۹۱۲۱۲۳۴۵۶۷" aria-label="شماره موبایل، مثل ۰۹۱۲۱۲۳۴۵۶۷" inputmode="tel">
        <select class="cyber-input" id="newUserRole"><option value="tech">تکنسین (دیدن، افزودن، ویرایش)</option><option value="admin">مدیر (کنترل کامل)</option></select>
        <button class="inv-small-btn" data-user-add="1">ساخت حساب و تعیین رمز</button>
      </div>
      <div class="inv-meta">برای گوشی تکنسین‌ها «📤 فایل تیم» بگیرید. گوشی تازه: در صفحه ورود «📥 ورود فایل تیم». گوشی‌ای که قبلاً فایل تیم گرفته: بعد از ورود، «حساب من ← 📥 به‌روزرسانی فایل تیم». فایل تیم بدون رمزها قابل استفاده نیست.</div>`);
  }
  async function addTeamUser() {
    if (!techAdmin()) return;
    const name = document.getElementById('newUserName').value.replace(/\s+/g, ' ').trim();
    const phone = normalizePhone(document.getElementById('newUserPhone').value);
    const role = document.getElementById('newUserRole').value === 'admin' ? 'admin' : 'tech';
    if (!name) { showToast('نام را بنویسید'); return; }
    if (!phone) { showToast('شماره موبایل درست نیست (مثل 09121234567)'); return; }
    if (getTeam().users.some(u => u.phone === phone)) { showToast('این شماره برای حساب دیگری است'); return; }
    const r = await askVaultPassword({ title: `🔑 رمز «${name}»`, hint: 'این رمز را خودتان به او بدهید؛ بعداً خودش می‌تواند عوضش کند.', confirm: true, okLabel: 'ساخت' });
    if (!r || !techAdmin()) return;
    const team = getTeam();
    team.users.push(await makeAccount(name, phone, role, r.pw, session.raw, sessionWho()));
    teamLog(team, 'user-add', `ساخت حساب ${ROLE_LABELS[role]} «${name}»`);
    if (saveTeam(team)) { showToast('✅ حساب ساخته شد'); openUsersPanel(); }
  }
  async function resetUserPassword(id) {
    if (!techAdmin()) return;
    const team = getTeam();
    const u = team.users.find(x => x.id === id);
    if (!u) return;
    const r = await askVaultPassword({ title: `🔑 رمز جدید «${u.name}»`, confirm: true, okLabel: 'تعیین' });
    if (!r || !techAdmin()) return;
    const t2 = getTeam();
    const u2 = t2.users.find(x => x.id === id);
    await rewrapAccount(u2, r.pw, session.raw);
    teamLog(t2, 'password', `تعیین رمز جدید برای «${u2.name}»`);
    if (saveTeam(t2)) { showToast('🔑 رمز تعیین شد'); openUsersPanel(); }
  }
  function toggleUserActive(id) {
    if (!techAdmin()) return;
    const team = getTeam();
    const u = team.users.find(x => x.id === id);
    if (!u || u.id === session.user.id) return;
    if (u.active && u.role === 'admin' && team.users.filter(x => x.role === 'admin' && x.active).length <= 1) { showToast('حداقل یک مدیر فعال لازم است'); return; }
    u.active = !u.active;
    teamLog(team, u.active ? 'user-enable' : 'user-disable', `${u.active ? 'فعال' : 'غیرفعال'} کردن «${u.name}»`);
    if (saveTeam(team)) openUsersPanel();
  }

  // فایل تیم: حساب‌ها و کلیدهای قفل‌شده (بدون هیچ رمزی) برای گوشی تکنسین‌ها
  function exportTeamFile() {
    if (!techAdmin()) return;
    const team = getTeam();
    const payload = { app: BACKUP_APP_ID, kind: 'team', format: 1, exportedAt: new Date().toISOString(), team: { schema: 1, users: team.users, log: [] } };
    if (downloadFile('geoteam-team.json', JSON.stringify(payload), 'application/json')) showToast('📤 فایل تیم آماده شد');
  }
  // فایل تیم:
  // - گوشی تازه (هنوز تیمی ندارد): از صفحه ورود
  // - گوشی‌ای که تیم دارد: فقط بعد از ورود، و فقط فایلِ همان تیم؛ کاربر رمز خودش را در فایل تازه وارد می‌کند و
  //   کلید تیمی که باز می‌شود باید همان کلید فعلی باشد. وگرنه هر کسی با گوشی قفل و یک فایل تیم ساختگی
  //   (که خودش در آن مدیر است) وارد برنامه می‌شد و کلیدهای قفل‌شده تیم اصلی برای همیشه از بین می‌رفت.
  function openTeamFilePicker() {
    if (getTeam()) return;
    document.getElementById('teamFileInput').click();
  }
  function importTeamFileFromSession() {
    if (!session) return;
    closeInvPanel();
    document.getElementById('teamFileInput').click();
  }
  const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  function importTeamFile(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file || file.size > 512 * 1024) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let obj = null;
      try { obj = JSON.parse(String(reader.result || '')); } catch(e) {}
      if (!obj || obj.app !== BACKUP_APP_ID || obj.kind !== 'team' || !validTeam(obj.team) || !obj.team.users.some(u => u.role === 'admin')) {
        showToast('⚠️ این فایل تیم این برنامه نیست');
        return;
      }
      if (!obj.team.users.every(u => u.phone === undefined || normalizePhone(u.phone) === u.phone)) { showToast('⚠️ فایل تیم خراب است'); return; }
      const users = obj.team.users;
      const current = getTeam();
      if (!current) {
        if (saveTeam({ schema: 1, users, log: [{ at: new Date().toISOString(), by: { id: null, name: getUserName() }, action: 'team-import', detail: 'ورود فایل تیم' }] })) {
          showToast('📥 فایل تیم وارد شد؛ با شماره و رمز خودتان وارد شوید');
          renderLockScreen();
        }
        return;
      }
      if (!session) { showToast('⚠️ اول وارد شوید؛ بعد از «حساب من» فایل تیم را به‌روز کنید'); return; }
      const me = users.find(u => u.id === session.user.id);
      if (!me || !me.active) { showToast('⚠️ حساب شما در این فایل تیم نیست؛ فایل تازه را از مدیر بگیرید'); return; }
      const r = await askVaultPassword({
        title: '📥 به‌روزرسانی فایل تیم', hint: `رمز «${me.name}» را وارد کنید (همان رمزی که در این فایل تیم دارید).`, okLabel: 'به‌روزرسانی',
        check: async (pw) => {
          const w = failWait(); if (w) return w;
          const raw = await unwrapWithPassword(me, pw);
          if (!raw) return recordFail();
          if (!session || !sameBytes(raw, session.raw)) return 'این فایل تیم مال تیم دیگری است؛ فایل تیم را از مدیر خودتان بگیرید';
          return '';
        }
      });
      if (!r || !session) return;
      setFails({ n: 0, until: 0 });
      const team = getTeam();
      const admin = isAdmin();
      if (admin) {
        team.users = users;
      } else {
        // تکنسین کلید تیم را دارد و می‌تواند فایل تیم را دستکاری کند؛ پس از فایلِ او فقط این‌ها پذیرفته می‌شود:
        // رمز تازه حساب خودش و حساب‌های تازه (فقط با نقش تکنسین). نقش، فعال بودن و رمز بقیه همان قبلی می‌ماند.
        const byId = new Map(team.users.map(u => [u.id, u]));
        team.users = team.users.map(u => {
          if (u.id !== session.user.id) return u;
          const f = users.find(x => x.id === u.id);
          return f ? { ...u, salt: f.salt, iter: f.iter, wrapped: f.wrapped, name: f.name, phone: f.phone || u.phone } : u;
        });
        users.filter(u => !byId.has(u.id) && !team.users.some(x => x.phone && x.phone === u.phone)).forEach(u => team.users.push({ ...u, role: 'tech' }));
      }
      teamLog(team, 'team-import', 'به‌روزرسانی حساب‌ها از فایل تیم');
      if (saveTeam(team)) {
        const mine = team.users.find(u => u.id === session.user.id);
        session.user.role = mine.role;
        session.user.name = mine.name;
        session.user.phone = mine.phone || session.user.phone;
        lockTech(true);
        showToast('📥 حساب‌های تیم به‌روز شد');
      }
    };
    reader.readAsText(file);
  }
