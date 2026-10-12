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
  const SESSION_IDLE_MS = 5 * 60 * 1000;
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
  function validTeam(t) {
    return t && t.schema === 1 && Array.isArray(t.users) && t.users.every(u =>
      u && typeof u.id === 'string' && typeof u.name === 'string' && (u.role === 'admin' || u.role === 'tech') &&
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
      localStorage.setItem(TEAM_KEY, JSON.stringify(t));
      return true;
    } catch(e) {
      showToast('⚠️ حافظه پر است؛ ذخیره نشد');
      return false;
    }
  }
  async function makeAccount(name, role, password, rawKey, by) {
    const salt = b64.enc(crypto.getRandomValues(new Uint8Array(16)));
    const pk = await derivePasswordKey(password, salt, KDF_ITERATIONS);
    return { id: newId(), name, role, active: true, salt, iter: KDF_ITERATIONS, wrapped: await encryptBytes(pk, rawKey), createdAt: new Date().toISOString(), createdBy: by };
  }
  function teamLog(team, action, detail) {
    team.log.push({ at: new Date().toISOString(), by: sessionWho(), action, detail });
  }

  // ---------- نشست (فقط در حافظه) ----------
  let session = null; // { user, key, raw }
  let sessionIdleTimer = null;
  const isAdmin = () => !!session && session.user.role === 'admin';
  const sessionWho = () => session ? { id: session.user.id, name: session.user.name } : { id: null, name: getUserName() };

  function endSession(silent) {
    if (session && session.raw) session.raw.fill(0);
    session = null;
    clearTimeout(sessionIdleTimer);
    closeInvItemModal();
    closeInvPanel();
    if (systemMode === 'support' && supportView === 'inventory') renderInventory();
    if (!silent) showToast('🔒 از پرونده فنی خارج شدید');
  }
  function touchSession() {
    if (!session) return;
    clearTimeout(sessionIdleTimer);
    sessionIdleTimer = setTimeout(() => endSession(false), SESSION_IDLE_MS);
  }
  // برنامه به پس‌زمینه رفت: خروج
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && session) endSession(true);
  });

  function getFails() {
    try { return JSON.parse(localStorage.getItem(VAULT_FAIL_KEY) || 'null') || { n: 0, until: 0 }; } catch(e) { return { n: 0, until: 0 }; }
  }
  function setFails(f) {
    try { localStorage.setItem(VAULT_FAIL_KEY, JSON.stringify(f)); } catch(e) {}
  }

  async function loginInventory() {
    const team = getTeam();
    const uid = document.getElementById('invLoginUser').value;
    const pw = document.getElementById('invLoginPw').value;
    const err = document.getElementById('invLoginErr');
    const user = team && team.users.find(u => u.id === uid);
    if (!user || !pw) { err.textContent = 'نام و رمز را وارد کنید'; return; }
    if (!user.active) { err.textContent = 'این حساب غیرفعال شده است'; return; }
    const fails = getFails();
    if (fails.until > Date.now()) {
      err.textContent = `چند بار اشتباه وارد شد؛ ${toPersianDigits(Math.ceil((fails.until - Date.now()) / 1000))} ثانیه صبر کنید`;
      return;
    }
    const btn = document.getElementById('invLoginBtn');
    btn.disabled = true;
    try {
      const pk = await derivePasswordKey(pw, user.salt, user.iter);
      const raw = await decryptBytes(pk, user.wrapped);
      setFails({ n: 0, until: 0 });
      session = { user: { id: user.id, name: user.name, role: user.role }, key: await importTeamKey(raw), raw };
      touchSession();
      await migrateLegacyVault();
      renderInventory();
    } catch(e) {
      const n = fails.n + 1;
      setFails({ n: n >= 5 ? 0 : n, until: n >= 5 ? Date.now() + 30000 : 0 });
      err.textContent = n >= 5 ? 'رمز اشتباه است؛ ۳۰ ثانیه صبر کنید' : 'رمز اشتباه است';
    } finally {
      btn.disabled = false;
      const pwInput = document.getElementById('invLoginPw'); // بعد از ورود موفق، کارت دوباره ساخته شده است
      if (pwInput) pwInput.value = '';
    }
  }

  // اولین بار: حساب مدیر و کلید تیم ساخته می‌شود
  async function setupAdmin() {
    if (!cryptoSupported()) { showToast('⚠️ این دستگاه از رمزنگاری امن پشتیبانی نمی‌کند'); return; }
    const name = document.getElementById('invSetupName').value.replace(/\s+/g, ' ').trim();
    const err = document.getElementById('invLoginErr');
    if (!name) { err.textContent = 'نام مدیر را بنویسید'; return; }
    const r = await askVaultPassword({
      title: '🛡 رمز مدیر',
      hint: 'رمز ورود مدیر به پرونده فنی. اگر فراموش شود و حساب مدیر دیگری نباشد، پسوردهای ذخیره‌شده قابل بازیابی نیستند؛ جایی امن یادداشتش کنید.',
      confirm: true,
      okLabel: 'ساخت'
    });
    if (!r) return;
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const admin = await makeAccount(name, 'admin', r.pw, raw, null);
    const team = { schema: 1, users: [admin], log: [] };
    session = { user: { id: admin.id, name: admin.name, role: 'admin' }, key: await importTeamKey(raw), raw };
    teamLog(team, 'team-create', `ساخت حساب مدیر «${name}»`);
    if (!saveTeam(team)) { endSession(true); return; }
    touchSession();
    await migrateLegacyVault();
    showToast('🛡 حساب مدیر ساخته شد');
    renderInventory();
  }

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

  async function changeMyPassword() {
    if (!session) return;
    const r = await askVaultPassword({ title: '🔑 رمز جدید شما', hint: `رمز ورود «${session.user.name}» به پرونده فنی.`, confirm: true, okLabel: 'تغییر' });
    if (!r || !session) return;
    const team = getTeam();
    const u = team.users.find(x => x.id === session.user.id);
    if (!u) return;
    const fresh = await makeAccount(u.name, u.role, r.pw, session.raw, null);
    Object.assign(u, { salt: fresh.salt, iter: fresh.iter, wrapped: fresh.wrapped });
    teamLog(team, 'password', `تغییر رمز «${u.name}» توسط خودش`);
    if (saveTeam(team)) showToast('🔑 رمز شما عوض شد');
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
    else if (document.activeElement && document.activeElement.id === 'invLoginPw') { e.preventDefault(); loginInventory(); }
  });

  // ---------- مدیریت کاربران (مدیر) ----------
  function openUsersPanel() {
    if (!isAdmin()) return;
    const team = getTeam();
    openInvPanel('👥 کاربران پرونده فنی', `
      ${team.users.map(u => `<div class="inv-ver">
        <div class="inv-ver-head"><span>${escapeHtml(u.name)} <span class="inv-role ${u.role === 'tech' ? 'tech' : ''}">${ROLE_LABELS[u.role]}</span></span>
          <span class="inv-meta">${u.active ? '✅ فعال' : '⛔ غیرفعال'}</span></div>
        <div class="inv-tools">
          <button data-user-pw="${escapeHtml(u.id)}">🔑 رمز جدید</button>
          ${u.id === session.user.id ? '' : `<button data-user-toggle="${escapeHtml(u.id)}">${u.active ? '⛔ غیرفعال کن' : '✅ فعال کن'}</button>`}
        </div></div>`).join('')}
      <div class="inv-ver">
        <div class="inv-ver-head"><span>➕ حساب جدید</span></div>
        <input type="text" class="cyber-input" id="newUserName" maxlength="60" placeholder="نام">
        <select class="cyber-input" id="newUserRole"><option value="tech">تکنسین (دیدن، افزودن، ویرایش)</option><option value="admin">مدیر (کنترل کامل)</option></select>
        <button class="inv-small-btn" data-user-add="1">ساخت حساب و تعیین رمز</button>
      </div>
      <div class="inv-meta">برای گوشی تکنسین‌ها «📤 فایل تیم» بگیرید و در گوشی آن‌ها «📥 ورود فایل تیم» را بزنید. فایل تیم بدون رمزها قابل استفاده نیست.</div>`);
  }
  async function addTeamUser() {
    const name = document.getElementById('newUserName').value.replace(/\s+/g, ' ').trim();
    const role = document.getElementById('newUserRole').value === 'admin' ? 'admin' : 'tech';
    if (!name) { showToast('نام را بنویسید'); return; }
    if (getTeam().users.some(u => u.name === name)) { showToast('این نام از قبل هست'); return; }
    const r = await askVaultPassword({ title: `🔑 رمز «${name}»`, hint: 'این رمز را خودتان به او بدهید؛ بعداً خودش می‌تواند عوضش کند.', confirm: true, okLabel: 'ساخت' });
    if (!r || !isAdmin()) return;
    const team = getTeam();
    team.users.push(await makeAccount(name, role, r.pw, session.raw, sessionWho()));
    teamLog(team, 'user-add', `ساخت حساب ${ROLE_LABELS[role]} «${name}»`);
    if (saveTeam(team)) { showToast('✅ حساب ساخته شد'); openUsersPanel(); }
  }
  async function resetUserPassword(id) {
    const team = getTeam();
    const u = team.users.find(x => x.id === id);
    if (!u) return;
    const r = await askVaultPassword({ title: `🔑 رمز جدید «${u.name}»`, confirm: true, okLabel: 'تعیین' });
    if (!r || !isAdmin()) return;
    const t2 = getTeam();
    const u2 = t2.users.find(x => x.id === id);
    const fresh = await makeAccount(u2.name, u2.role, r.pw, session.raw, null);
    Object.assign(u2, { salt: fresh.salt, iter: fresh.iter, wrapped: fresh.wrapped });
    teamLog(t2, 'password', `تعیین رمز جدید برای «${u2.name}»`);
    if (saveTeam(t2)) { showToast('🔑 رمز تعیین شد'); openUsersPanel(); }
  }
  function toggleUserActive(id) {
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
    if (!isAdmin()) return;
    const team = getTeam();
    const payload = { app: BACKUP_APP_ID, kind: 'team', format: 1, exportedAt: new Date().toISOString(), team: { schema: 1, users: team.users, log: [] } };
    if (downloadFile('geomat-team.json', JSON.stringify(payload), 'application/json')) showToast('📤 فایل تیم آماده شد');
  }
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
      if (getTeam() && !await appConfirm('حساب‌های فعلی این گوشی با فایل تیم جایگزین شود؟ پسوردهایی که با تیم دیگری ذخیره شده‌اند دیگر باز نمی‌شوند.', 'جایگزینی')) return;
      if (saveTeam({ schema: 1, users: obj.team.users, log: [{ at: new Date().toISOString(), by: { id: null, name: getUserName() }, action: 'team-import', detail: 'ورود فایل تیم' }] })) {
        showToast('📥 فایل تیم وارد شد؛ با نام و رمز خودتان وارد شوید');
        renderInventory();
      }
    };
    reader.readAsText(file);
  }

