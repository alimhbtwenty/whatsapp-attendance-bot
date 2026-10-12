  // ==================== پرونده فنی شرکت‌ها ====================
  const ACCESS_METHODS = ['RDP', 'SSH', 'وب (HTTP/HTTPS)', 'VNC', 'SMB / اشتراک فایل', 'Winbox', 'Telnet', 'FTP/SFTP', 'سایر'];
  const INV_SECTIONS = [
    { key: 'network', title: '🌐 شبکه و دامین', titleField: 'name', fields: [
      { k: 'kind', label: 'نوع', type: 'select', options: ['دامین', 'ورک‌گروپ'] },
      { k: 'name', label: 'نام دامین یا ورک‌گروپ', required: true, ltr: true },
      { k: 'range', label: 'رنج IP', ltr: true },
      { k: 'gateway', label: 'گیت‌وی', ltr: true },
      { k: 'dns', label: 'DNS', ltr: true },
      { k: 'note', label: 'توضیح', type: 'textarea' } ] },
    { key: 'access', title: '🔌 سیستم‌های قابل دسترسی', titleField: 'title', fields: [
      { k: 'title', label: 'عنوان', required: true },
      { k: 'method', label: 'نحوه اتصال', type: 'select', options: ACCESS_METHODS },
      { k: 'address', label: 'آدرس / پورت', ltr: true },
      { k: 'username', label: 'یوزرنیم (اختیاری)', ltr: true },
      { k: 'password', label: 'پسورد (اختیاری)', type: 'secret' },
      { k: 'note', label: 'توضیح', type: 'textarea' } ] },
    { key: 'remotes', title: '🖥 ریموت (AnyDesk / RustDesk)', titleField: 'title', fields: [
      { k: 'tool', label: 'برنامه', type: 'select', options: ['AnyDesk', 'RustDesk', 'TeamViewer', 'سایر'] },
      { k: 'title', label: 'دستگاه / عنوان', required: true },
      { k: 'remoteId', label: 'ID', required: true, ltr: true },
      { k: 'password', label: 'پسورد', type: 'secret' },
      { k: 'note', label: 'توضیح', type: 'textarea' } ] },
    { key: 'hosts', title: '🗄 سرورهای فیزیکی / ESXi', titleField: 'name', fields: [
      { k: 'name', label: 'نام', required: true },
      { k: 'hypervisor', label: 'مجازی‌سازی', type: 'select', options: ['ESXi', 'Proxmox', 'Hyper-V', 'بدون مجازی‌سازی'] },
      { k: 'version', label: 'نسخه', ltr: true },
      { k: 'model', label: 'مدل سخت‌افزار', ltr: true },
      { k: 'cpu', label: 'CPU', ltr: true },
      { k: 'ram', label: 'RAM', ltr: true },
      { k: 'disks', label: 'دیسک‌ها', ltr: true },
      { k: 'ip', label: 'IP', ltr: true },
      { k: 'mgmtIp', label: 'IP مدیریت (iLO / iDRAC)', ltr: true },
      { k: 'username', label: 'یوزرنیم', ltr: true },
      { k: 'password', label: 'پسورد', type: 'secret' },
      { k: 'note', label: 'توضیح', type: 'textarea' } ] },
    { key: 'servers', title: '💽 سرورها و ماشین‌های مجازی', titleField: 'name', fields: [
      { k: 'name', label: 'نام', required: true },
      { k: 'role', label: 'نقش (DC، فایل، دیتابیس...)' },
      { k: 'os', label: 'سیستم‌عامل', ltr: true },
      { k: 'host', label: 'میزبان', type: 'ref', ref: ['hosts'], empty: 'فیزیکی مستقل / نامشخص' },
      { k: 'cpu', label: 'CPU', ltr: true },
      { k: 'ram', label: 'RAM', ltr: true },
      { k: 'disk', label: 'دیسک', ltr: true },
      { k: 'ip', label: 'IP', ltr: true },
      { k: 'username', label: 'یوزرنیم', ltr: true },
      { k: 'password', label: 'پسورد', type: 'secret' },
      { k: 'note', label: 'توضیح', type: 'textarea' } ] },
    { key: 'apps', title: '📦 برنامه‌ها', titleField: 'name', fields: [
      { k: 'name', label: 'نام برنامه', required: true },
      { k: 'version', label: 'نسخه', ltr: true },
      { k: 'server', label: 'روی سرور', type: 'ref', ref: ['servers', 'hosts'], empty: 'نامشخص' },
      { k: 'license', label: 'لایسنس', ltr: true },
      { k: 'expiry', label: 'تاریخ انقضا' },
      { k: 'note', label: 'توضیح', type: 'textarea' } ] },
    { key: 'users', title: '👥 کاربرها', titleField: 'name', fields: [
      { k: 'name', label: 'نام', required: true },
      { k: 'username', label: 'یوزرنیم', ltr: true },
      { k: 'dept', label: 'سمت / بخش' },
      { k: 'computer', label: 'سیستم / IP', ltr: true },
      { k: 'email', label: 'ایمیل', ltr: true },
      { k: 'note', label: 'توضیح', type: 'textarea' } ] }
  ];
  const INV_FILTERS = [
    { key: 'all', label: 'همه' },
    { key: 'domain', label: 'دامین' },
    { key: 'workgroup', label: 'ورک‌گروپ' },
    { key: 'esxi', label: 'دارای ESXi' }
  ];
  const ACTION_LABELS = { create: 'افزودن', edit: 'ویرایش', delete: 'حذف', restore: 'برگرداندن' };
  let supportView = 'report';
  let invFilter = 'all';
  let invEditing = null; // { section, id|null }
  const invRevealTimers = {};
  const sectionOf = (key) => INV_SECTIONS.find(s => s.key === key);
  const fieldLabel = (f) => f.label.replace(/ \(.*\)/, '');

  function getInventory() {
    return normalizeInventory(localStorage.getItem(INVENTORY_KEY));
  }
  function normalizeInventory(text) {
    try {
      const o = JSON.parse(text || 'null');
      if (o && (o.schema === 1 || o.schema === 2) && Array.isArray(o.items)) {
        o.items = o.items.filter(i => i && typeof i === 'object' && typeof i.id === 'string' && i.id && typeof i.company === 'string' &&
          INV_SECTIONS.some(sec => sec.key === i.section) && i.data && typeof i.data === 'object');
        // پیش‌نمایش 1.4 تاریخچه نداشت: وضع فعلی اولین نسخه می‌شود
        o.items.forEach(i => {
          if (Array.isArray(i.history)) i.history = i.history.filter(h => h && typeof h === 'object' && h.data && typeof h.data === 'object');
          if (!Array.isArray(i.history) || !i.history.length) {
            const by = i.updatedBy && typeof i.updatedBy === 'object' ? i.updatedBy : { id: null, name: String(i.updatedBy || '') };
            i.history = [{ at: i.updatedAt || i.createdAt || new Date().toISOString(), by, action: i.deleted ? 'delete' : 'create', data: { ...i.data }, secrets: { ...(i.secrets || {}) } }];
          }
          if (i.updatedBy && typeof i.updatedBy !== 'object') i.updatedBy = { id: null, name: String(i.updatedBy) };
        });
        o.companies = Array.isArray(o.companies) ? o.companies.filter(c => c && typeof c.id === 'string' && typeof c.name === 'string') : [];
        o.companies.forEach(c => { c.history = Array.isArray(c.history) ? c.history.filter(h => h && typeof h === 'object') : []; });
        o.schema = 2;
        return o;
      }
    } catch(e) {}
    return { schema: 2, companies: [], items: [] };
  }
  // ادغام دو نسخه پرونده فنی (بازگردانی پشتیبان، و بعداً همگام‌سازی سرور): تاریخچه هر آیتم اجتماع دو طرف است
  // و وضع فعلی همیشه آخرین نسخه آن است؛ پس هیچ نسخه‌ای با ادغام از بین نمی‌رود
  // opts.admin: بازگردانی توسط مدیر. نسخه‌های تازه «حذف/برگرداندن» از فایلِ غیرمدیر پذیرفته نمی‌شوند (حذف فقط کار مدیر است
  // و فایل پشتیبان متن ساده و قابل دستکاری است)؛ نسخه‌ای با تاریخ آینده هم پذیرفته نمی‌شود (وگرنه همیشه «آخرین» می‌ماند).
  function mergeInventoryData(curText, incText, opts = {}) {
    if (!incText) return curText || null;
    // فقط تاریخ ISO دقیق، مقایسه عددی (مقایسه متنی با نویسه کنترلی دور زده می‌شد)
    const ISO_AT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,3})?Z$/;
    const maxMs = Date.now() + 86400000;
    const validAt = (v) => typeof v.at === 'string' && ISO_AT.test(v.at) && Date.parse(v.at) <= maxMs;
    const trusted = (v) => validAt(v) && (opts.admin || (v.action !== 'delete' && v.action !== 'restore'));
    if (!curText) {
      const fresh = normalizeInventory(incText);
      fresh.items.forEach(it => { it.history = it.history.filter(validAt); });
      return JSON.stringify(fresh);
    }
    const a = normalizeInventory(curText), b = normalizeInventory(incText);
    const vkey = (v) => `${v.at}|${v.by && v.by.id}|${v.action}|${JSON.stringify(v.data)}|${JSON.stringify(v.secrets || {})}`;
    const byTime = (x, y) => (Date.parse(x.at) || 0) - (Date.parse(y.at) || 0);
    const items = new Map(a.items.map(i => [i.id, i]));
    for (const it of b.items) {
      const mine = items.get(it.id);
      if (!mine) {
        // آیتمی که فقط در پشتیبان هست هم از همان صافی می‌گذرد (وگرنه نسخه آینده‌دار بعداً «آخرین» می‌شد)
        if (!it.history.length) { items.set(it.id, it); continue; } // آیتم قدیمیِ بی‌تاریخچه همان‌طور می‌آید
        const history = it.history.filter(trusted).sort(byTime);
        if (!history.length) continue;
        const last = history[history.length - 1];
        items.set(it.id, { ...it, history, data: { ...last.data }, secrets: { ...(last.secrets || {}) }, deleted: last.action === 'delete',
          updatedAt: last.at, updatedBy: last.by });
        continue;
      }
      // آیتمی که مدیر حذف کرده با پشتیبانِ غیرمدیر برنمی‌گردد (برگرداندن فقط کار مدیر است)
      if (mine.deleted && !opts.admin) continue;
      const seen = new Set(mine.history.map(vkey));
      const added = it.history.filter(v => !seen.has(vkey(v)) && trusted(v));
      if (!added.length) continue;
      const history = mine.history.concat(added).sort(byTime);
      const last = history[history.length - 1];
      items.set(it.id, { ...mine, history, data: { ...last.data }, secrets: { ...(last.secrets || {}) }, deleted: last.action === 'delete',
        updatedAt: last.at, updatedBy: last.by });
    }
    const companies = new Map(a.companies.map(c => [c.id, c]));
    for (const c of b.companies) {
      const mine = companies.get(c.id);
      if (!mine) { companies.set(c.id, c); continue; }
      const seen = new Set(mine.history.map(v => `${v.at}|${v.action}`));
      mine.history = mine.history.concat(c.history.filter(v => !seen.has(`${v.at}|${v.action}`))).sort(byTime);
    }
    return JSON.stringify({ schema: 2, companies: [...companies.values()], items: [...items.values()] });
  }

  function saveInventory(inv) {
    try {
      storeItem(INVENTORY_KEY, JSON.stringify(inv));
      return true;
    } catch(e) {
      showToast('⚠️ حافظه پر است؛ پرونده ذخیره نشد (فایل پشتیبان بگیرید و رکوردهای قدیمی آرشیو را حذف کنید)');
      return false;
    }
  }
  // نسخه تازه؛ هیچ نسخه قبلی پاک یا بازنویسی نمی‌شود
  function pushVersion(it, action) {
    const now = new Date().toISOString();
    it.history = it.history || [];
    it.history.push({ at: now, by: sessionWho(), action, data: { ...it.data }, secrets: { ...(it.secrets || {}) } });
    it.updatedAt = now;
    it.updatedBy = sessionWho();
  }

  function invCompanyNames(inv) {
    const names = [...getCompanies()];
    inv.companies.filter(c => !c.deleted).forEach(c => { if (!names.includes(c.name)) names.push(c.name); });
    return names;
  }
  function liveItems(inv, company, section) {
    return inv.items.filter(i => !i.deleted && i.company === company && (!section || i.section === section));
  }
  function companyTraits(inv, company) {
    const items = liveItems(inv, company);
    return {
      domain: items.some(i => i.section === 'network' && i.data.kind === 'دامین'),
      workgroup: items.some(i => i.section === 'network' && i.data.kind === 'ورک‌گروپ'),
      esxi: items.some(i => i.section === 'hosts' && i.data.hypervisor === 'ESXi')
    };
  }

  function setSupportView(view) {
    playTactileFeedback();
    supportView = view;
    const btns = document.querySelectorAll('#supportViewRow .pill-opt-btn');
    btns[0].classList.toggle('selected', view === 'report');
    btns[1].classList.toggle('selected', view === 'inventory');
    document.getElementById('supportReportView').style.display = view === 'report' ? '' : 'none';
    document.getElementById('supportInventoryView').style.display = view === 'inventory' ? '' : 'none';
    // دکمه‌های ارسال واتساپ برای پرونده فنی معنی ندارد
    document.getElementById('floatingDock').style.display = view === 'inventory' ? 'none' : 'flex';
    if (view === 'inventory') renderInventory();
  }

  function itemLabel(inv, id) {
    const it = inv.items.find(i => i.id === id && !i.deleted);
    return it ? (it.data[sectionOf(it.section).titleField] || '') : '';
  }
  function whenLabel(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const j = dateToJalali(d);
    return toPersianDigits(`${j.jy}/${pad2(j.jm)}/${pad2(j.jd)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
  }

  function renderAuthCard() {
    const card = document.getElementById('invAuthCard');
    if (!session) { card.innerHTML = ''; return; }
    if (!techUnlocked()) {
      card.innerHTML = `<div class="card-header-bar"><div class="title-tag"><span class="gold-marker"></span> 🔐 پرونده فنی قفل است</div></div>
        <div style="font-size:11.5px; color:var(--text-muted); line-height:1.9;">برای دیدن پسوردها و مشخصات فنی، هویت «${escapeHtml(session.user.name)}» را دوباره تأیید کنید.</div>
        <div class="inv-auth-row">
          <button class="install-btn" style="padding:10px 14px;" data-act="unlock-pw">🔑 با رمز</button>
          <button class="dock-copy-btn" style="padding:10px 14px; display:none;" id="techBioBtn" data-act="unlock-bio">👆 با اثر انگشت</button>
        </div>`;
      Bio.enrolled(session.user.id).then(on => { const b = document.getElementById('techBioBtn'); if (b && on) b.style.display = ''; });
      return;
    }
    card.innerHTML = `<div class="card-header-bar">
        <span class="inv-who">👤 ${escapeHtml(session.user.name)}<span class="inv-role ${isAdmin() ? '' : 'tech'}">${ROLE_LABELS[session.user.role]}</span></span>
        <button class="inv-vault-btn" data-act="lock-tech">🔒 قفل</button>
      </div>
      ${isAdmin() ? `<div class="inv-tools">
        <button class="inv-vault-btn" data-act="users">👥 کاربران</button>
        <button class="inv-vault-btn" data-act="audit">📜 گزارش تغییرات</button>
        <button class="inv-vault-btn" data-act="deleted">🗑 حذف‌شده‌ها</button>
        <button class="inv-vault-btn" data-act="export-team">📤 فایل تیم</button>
      </div>` : ''}`;
  }

  // جستجو: رقم فارسی/لاتین، ی/ي و ک/ك و حروف بزرگ/کوچک یکی حساب می‌شوند (IP با رقم فارسی هم پیدا شود)
  function searchNorm(v) {
    return faToEnDigits(String(v == null ? '' : v)).replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ').toLowerCase();
  }
  function itemMatches(inv, it, q) {
    const sec = sectionOf(it.section);
    return !!sec && sec.fields.some(f => f.type !== 'secret' && searchNorm(f.type === 'ref' ? itemLabel(inv, it.data[f.k]) : it.data[f.k]).includes(q));
  }
  function renderInventory() {
    renderAuthCard();
    const main = document.getElementById('invMain');
    main.style.display = techUnlocked() ? 'flex' : 'none';
    if (!techUnlocked()) {
      document.getElementById('invSections').innerHTML = '';
      return;
    }
    const inv = getInventory();
    const comps = invCompanyNames(inv);

    document.getElementById('invFilterRow').innerHTML = INV_FILTERS.map(f =>
      `<button class="date-q-btn ${invFilter === f.key ? 'selected' : ''}" data-filter="${f.key}">${f.label}</button>`).join('');

    const q = searchNorm(document.getElementById('invSearchInput').value.trim());
    // با جستجو، فقط شرکت‌هایی که نامشان یا یکی از آیتم‌هایشان می‌خورد (جستجو در همه پرونده‌ها، نه فقط شرکت انتخاب‌شده)
    const hits = (c) => searchNorm(c).includes(q) ? -1 : liveItems(inv, c).filter(it => itemMatches(inv, it, q)).length;
    const shown = comps.filter(c => (invFilter === 'all' || companyTraits(inv, c)[invFilter]) && (!q || hits(c) !== 0));
    const grid = document.getElementById('invCompaniesGrid');
    grid.innerHTML = shown.length
      ? shown.map(c => `<div class="comp-chip ${c === selectedCompany ? 'selected' : ''}" role="button" tabindex="0" aria-pressed="${c === selectedCompany}" data-company="${escapeHtml(c)}" title="${escapeHtml(c)}"><span class="chip-label">${escapeHtml(c)}</span>${q && hits(c) > 0 ? `<span class="inv-hit" aria-label="${toPersianDigits(hits(c))} مورد">${toPersianDigits(hits(c))}</span>` : ''}</div>`).join('')
      : `<div class="inv-empty" style="grid-column:1/-1;">${q ? 'در هیچ پرونده‌ای پیدا نشد' : comps.length ? 'شرکتی با این فیلتر نیست' : '«➕ پرونده فنی جدید» را بزنید'}</div>`;

    const box = document.getElementById('invSections');
    if (!selectedCompany || !comps.includes(selectedCompany)) {
      box.innerHTML = comps.length ? '<div class="inv-empty">یک شرکت را انتخاب کنید تا پرونده‌اش باز شود</div>' : '';
      return;
    }
    const openNow = new Set([...box.querySelectorAll('details[open]')].map(d => d.dataset.section));
    box.innerHTML = INV_SECTIONS.map(sec => {
      const all = liveItems(inv, selectedCompany, sec.key);
      const items = q && !searchNorm(selectedCompany).includes(q) ? all.filter(i => itemMatches(inv, i, q)) : all;
      const open = q ? items.length > 0 : openNow.has(sec.key);
      return `<details class="frost-card inv-section" data-section="${sec.key}" ${open ? 'open' : ''}>
        <summary><span>${sec.title}</span><span class="inv-count">${toPersianDigits(items.length)}${q ? ' / ' + toPersianDigits(all.length) : ''}</span></summary>
        <div class="inv-items">
          ${items.map(it => renderInvItem(inv, sec, it)).join('') || `<div class="inv-empty">${q ? 'موردی پیدا نشد' : 'چیزی ثبت نشده'}</div>`}
          <button class="add-comp-pill" data-add="${sec.key}">➕ افزودن</button>
        </div>
      </details>`;
    }).join('');
  }

  function renderInvItem(inv, sec, it) {
    const id = escapeHtml(it.id);
    const rows = sec.fields.filter(f => f.k !== sec.titleField && f.type !== 'secret').map(f => {
      let v = it.data[f.k];
      if (f.type === 'ref') v = itemLabel(inv, v);
      if (!v) return '';
      // فیلدهای فنی (آدرس، یوزر، IP، ID) دکمه کپی دارند (مثل IT Glue)
      const copy = f.ltr && f.type !== 'ref' ? `<button class="inv-copy-btn" data-copy-field="${id}|${escapeHtml(f.k)}" title="کپی" aria-label="کپی ${escapeHtml(fieldLabel(f))}">📋</button>` : '';
      return `<div class="inv-row"><b>${escapeHtml(fieldLabel(f))}:</b> <span class="${f.ltr ? 'inv-ltr' : ''}">${escapeHtml(v)}</span>${copy}</div>`;
    }).join('');
    const secrets = sec.fields.filter(f => f.type === 'secret' && it.secrets && it.secrets[f.k]).map(f =>
      `<div class="inv-secret"><b style="color:var(--text-dim); font-weight:600;">${escapeHtml(fieldLabel(f))}:</b>
        <code data-secret-view="${id}|${f.k}">••••••</code>
        <button data-reveal="${id}|${f.k}">👁 نمایش</button>
        <button data-copy="${id}|${f.k}">📋 کپی</button></div>`).join('');
    const by = it.updatedBy && it.updatedBy.name ? `${escapeHtml(it.updatedBy.name)} · ` : '';
    return `<div class="inv-item">
      <div class="inv-item-head">
        <span class="inv-item-title">${escapeHtml(it.data[sec.titleField] || '—')}</span>
        <span class="inv-item-actions"><button data-edit="${id}" title="ویرایش" aria-label="ویرایش">✏️</button>${isAdmin()
          ? `<button data-history="${id}" title="تاریخچه" aria-label="تاریخچه">🕘</button><button data-del="${id}" title="حذف" aria-label="حذف">🗑</button>` : ''}</span>
      </div>${rows}${secrets}
      ${by || whenLabel(it.updatedAt) ? `<div class="inv-meta">آخرین تغییر: ${by}${whenLabel(it.updatedAt)}</div>` : ''}</div>`;
  }

  // همه کلیک‌های پرونده فنی و پنل‌ها از یک‌جا (بدون onclick داخل متن HTML)
  document.addEventListener('click', (e) => {
    const view = document.getElementById('supportInventoryView');
    const panel = document.getElementById('invPanelModal');
    if (!view || (!view.contains(e.target) && !panel.contains(e.target))) return;
    touchSession();
    const t = e.target.closest('[data-act],[data-filter],[data-company],[data-add],[data-edit],[data-del],[data-history],[data-reveal],[data-copy],[data-restore],[data-undelete],[data-ver-reveal],[data-user-pw],[data-user-toggle],[data-user-add],[data-audit-who],[data-copy-field]');
    if (!t) return;
    const d = t.dataset;
    const acts = {
      'unlock-pw': unlockTechWithPassword, 'unlock-bio': unlockTechWithBiometric, 'lock-tech': () => lockTech(false),
      users: openUsersPanel, audit: () => openAuditPanel(''), deleted: openDeletedPanel, 'export-team': exportTeamFile
    };
    if (d.act) { if (acts[d.act] && (d.act.startsWith('unlock') || techUnlocked())) acts[d.act](); return; }
    if (d.filter) { invFilter = d.filter; renderInventory(); }
    else if (d.company !== undefined) { selectedCompany = d.company; renderCompanies(); updatePreview(); updateSupportPreview(); renderInventory(); }
    else if (!techUnlocked()) return;
    else if (d.add) openInvItemModal(d.add, null);
    else if (d.edit) { const it = getInventory().items.find(i => i.id === d.edit); if (it) openInvItemModal(it.section, it.id); }
    else if (d.del) deleteInvItem(d.del);
    else if (d.history) openHistoryPanel(d.history);
    else if (d.reveal) revealSecret(d.reveal, `[data-secret-view="${CSS.escape(d.reveal)}"]`);
    else if (d.copy) copySecret(d.copy);
    else if (d.restore) restoreVersion(d.restore);
    else if (d.undelete) restoreDeleted(d.undelete);
    else if (d.verReveal) revealSecret(d.verReveal, `[data-ver-view="${CSS.escape(d.verReveal)}"]`);
    else if (d.userPw) resetUserPassword(d.userPw);
    else if (d.userToggle) toggleUserActive(d.userToggle);
    else if (d.userAdd) addTeamUser();
    else if (d.auditWho !== undefined) openAuditPanel(d.auditWho);
    else if (d.copyField) copyField(d.copyField);
  });

  // ref: «id|field» برای پسورد فعلی، یا «id|field|index» برای پسوردِ یک نسخه قدیمی (فقط مدیر)
  async function readSecret(ref) {
    if (!techUnlocked()) return null;
    const [id, field, ver] = ref.split('|');
    const it = getInventory().items.find(i => i.id === id);
    if (!it) return null;
    let src = it.secrets;
    if (ver !== undefined) {
      if (!techAdmin()) return null;
      src = (it.history[Number(ver)] || {}).secrets;
    }
    if (!src || !src[field]) return null;
    try {
      return await decryptWith(session.key, src[field]);
    } catch(e) {
      showToast('⚠️ این پسورد با کلید این تیم باز نمی‌شود');
      return null;
    }
  }
  async function revealSecret(ref, selector) {
    const pw = await readSecret(ref);
    if (pw === null) return;
    const el = document.querySelector(selector);
    if (!el) return;
    el.textContent = pw;
    clearTimeout(invRevealTimers[ref]);
    invRevealTimers[ref] = setTimeout(() => { if (el.isConnected) el.textContent = '••••••'; }, 10000);
  }
  async function copySecret(ref) {
    const pw = await readSecret(ref);
    if (pw === null) return;
    try {
      await navigator.clipboard.writeText(pw);
    } catch(e) {
      showToast('⚠️ کپی ممکن نشد');
      return;
    }
    showToast('📋 پسورد کپی شد (۳۰ ثانیه بعد از کلیپ‌بورد پاک می‌شود)');
    setTimeout(async () => {
      try {
        if (await navigator.clipboard.readText() !== pw) return;
      } catch(e) {}
      navigator.clipboard.writeText('').catch(() => {});
    }, 30000);
  }

  // کپی یک فیلد غیرمحرمانه (کلیپ‌بورد پاک نمی‌شود؛ پسورد نیست)
  async function copyField(ref) {
    if (!techUnlocked()) return;
    const [id, k] = ref.split('|');
    const it = getInventory().items.find(i => i.id === id && !i.deleted);
    const v = it && it.data[k];
    if (!v) return;
    try {
      await navigator.clipboard.writeText(String(v));
      showToast('📋 کپی شد');
    } catch(e) {
      showToast('⚠️ کپی ممکن نشد');
    }
  }
  // پسورد تصادفی قوی (۱۶ نویسه، بدون نویسه‌های شبیه هم مثل 0/O و l/1)، فقط در فرم؛ با «ذخیره» رمزنگاری می‌شود
  const PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%*-_=+';
  function randomPassword(len = 16) {
    const limit = 256 - (256 % PW_ALPHABET.length); // بدون سوگیری
    for (;;) {
      const out = [];
      while (out.length < len) {
        for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
          if (b < limit && out.length < len) out.push(PW_ALPHABET[b % PW_ALPHABET.length]);
        }
      }
      const pw = out.join('');
      // هر چهار نوع نویسه باشد (بعضی سیستم‌ها بدون آن رمز را نمی‌پذیرند)
      if (/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) return pw;
    }
  }
  function invSecretInput(name) {
    const el = document.querySelector(`#invItemForm input[name="${CSS.escape(name)}"]`);
    return el && el.type !== 'checkbox' ? el : null;
  }
  function genInvPassword(name) {
    const el = invSecretInput(name);
    if (!el || !techUnlocked()) return;
    el.value = randomPassword();
    el.type = 'text';
    showToast('🎲 پسورد تصادفی ساخته شد؛ با «ذخیره» رمزنگاری و ذخیره می‌شود');
  }
  function toggleInvSecret(name) {
    const el = invSecretInput(name);
    if (el) el.type = el.type === 'password' ? 'text' : 'password';
  }

  async function createInvCompany() {
    if (!techUnlocked()) return;
    const r = await askText('➕ پرونده فنی جدید', 'نام شرکت یا مشتری');
    if (!r || !techUnlocked()) return;
    const inv = getInventory();
    if (invCompanyNames(inv).includes(r)) { selectedCompany = r; renderInventory(); showToast('این شرکت از قبل هست'); return; }
    const old = inv.companies.find(c => c.name === r && c.deleted);
    const now = new Date().toISOString();
    if (old) {
      old.deleted = false;
      old.history.push({ at: now, by: sessionWho(), action: 'restore', name: r });
    } else {
      inv.companies.push({ id: newId(), name: r, createdAt: now, createdBy: sessionWho(), history: [{ at: now, by: sessionWho(), action: 'create', name: r }] });
    }
    if (!saveInventory(inv)) return;
    selectedCompany = r;
    renderInventory();
    showToast('✅ پرونده فنی ساخته شد');
  }
  // پرسش یک متن کوتاه (prompt در اپ اندروید کار نمی‌کند)
  function askText(title, placeholder) {
    return new Promise(resolve => {
      openInvPanel(title, `<input type="text" class="cyber-input" id="invAskText" maxlength="80" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder)}">
        <button class="install-btn" style="padding:10px;" id="invAskOk">تأیید</button>`);
      const input = document.getElementById('invAskText');
      setTimeout(() => input.focus(), 100);
      const done = (v) => { panelOnClose = null; closeInvPanel(); resolve(v); };
      panelOnClose = () => resolve(null);
      document.getElementById('invAskOk').onclick = () => {
        const v = input.value.replace(/\s+/g, ' ').trim();
        if (v) done(v);
      };
      input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('invAskOk').click(); } };
    });
  }

  function openInvItemModal(sectionKey, id) {
    if (!techUnlocked()) return;
    if (!selectedCompany) { showToast('اول شرکت را انتخاب کنید'); return; }
    const sec = sectionOf(sectionKey);
    const inv = getInventory();
    const it = id ? inv.items.find(i => i.id === id) : null;
    invEditing = { section: sectionKey, id };
    document.getElementById('invItemTitle').textContent = `${it ? '✏️ ویرایش' : '➕ افزودن'} — ${sec.title.replace(/^\S+\s/, '')} (${it ? it.company : selectedCompany})`;
    const form = document.getElementById('invItemForm');
    form.innerHTML = sec.fields.map(f => {
      const v = it ? (it.data[f.k] || '') : '';
      const name = `inv_${f.k}`;
      if (f.type === 'select') {
        // مقدار ذخیره‌شده‌ای که در گزینه‌ها نیست (داده قدیمی یا پشتیبان) با ویرایش بی‌صدا عوض نشود
        const options = v && !f.options.includes(v) ? [v, ...f.options] : f.options;
        return `<label>${escapeHtml(f.label)}<select class="cyber-input" name="${name}">${options.map(o =>
          `<option ${o === v ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select></label>`;
      }
      if (f.type === 'ref') {
        const opts = inv.items.filter(i => !i.deleted && i.company === (it ? it.company : selectedCompany) && f.ref.includes(i.section) && i.id !== id);
        // ارجاع به آیتمی که حذف (نرم) شده با ویرایشِ فیلدهای دیگر بی‌صدا پاک نشود
        let goneOpt = '';
        if (v && !opts.some(o => o.id === v)) {
          const gone = inv.items.find(i => i.id === v);
          const title = gone ? (gone.data[sectionOf(gone.section) ? sectionOf(gone.section).titleField : ''] || '—') : '';
          const label = !gone ? '(آیتم پیدا نشد)' : gone.deleted ? `${title} (حذف‌شده)` : title;
          goneOpt = `<option value="${escapeHtml(v)}" selected>${escapeHtml(label)}</option>`;
        }
        return `<label>${escapeHtml(f.label)}<select class="cyber-input" name="${name}"><option value="">${escapeHtml(f.empty)}</option>${goneOpt}${opts.map(o =>
          `<option value="${escapeHtml(o.id)}" ${o.id === v ? 'selected' : ''}>${escapeHtml(itemLabel(inv, o.id))}</option>`).join('')}</select></label>`;
      }
      if (f.type === 'textarea') {
        return `<label>${escapeHtml(f.label)}<textarea class="cyber-input" name="${name}" maxlength="1000" style="min-height:60px; resize:vertical;">${escapeHtml(v)}</textarea></label>`;
      }
      if (f.type === 'secret') {
        const has = it && it.secrets && it.secrets[f.k];
        return `<label>${escapeHtml(f.label)} 🔐<input type="password" class="cyber-input" name="${name}" dir="ltr" maxlength="128" autocomplete="new-password" placeholder="${has ? 'بدون تغییر (ذخیره شده)' : ''}"></label>
          <div class="inv-pw-tools"><button type="button" ${uiAttr('click', 'genInvPassword', name)}>🎲 پسورد تصادفی</button><button type="button" ${uiAttr('click', 'toggleInvSecret', name)} aria-label="نمایش یا پنهان کردن پسورد">👁</button></div>` +
          (has ? `<label class="inv-check"><input type="checkbox" name="${name}_clear"> پاک کردن پسورد (نسخه قبلی در تاریخچه می‌ماند)</label>` : '');
      }
      return `<label>${escapeHtml(f.label)}${f.required ? ' *' : ''}<input type="text" class="cyber-input" name="${name}" maxlength="200" ${f.ltr ? 'dir="ltr"' : ''} value="${escapeHtml(v)}"></label>`;
    }).join('');
    document.getElementById('invItemModal').classList.add('open');
  }
  function closeInvItemModal() {
    document.getElementById('invItemModal').classList.remove('open');
    document.getElementById('invItemForm').innerHTML = ''; // پسورد تایپ‌شده در DOM نماند
    invEditing = null;
  }

  let invSaving = false;
  async function saveInvItem() {
    if (!invEditing || invSaving || !techUnlocked()) return;
    const sec = sectionOf(invEditing.section);
    const form = document.getElementById('invItemForm');
    const val = (k) => { const el = form.querySelector(`[name="inv_${k}"]`); return el ? el.value : ''; };
    const data = {};
    const newSecrets = {};
    const clearSecrets = [];
    for (const f of sec.fields) {
      if (f.type === 'secret') {
        const pw = val(f.k);
        if (pw) newSecrets[f.k] = pw;
        const clr = form.querySelector(`[name="inv_${f.k}_clear"]`);
        if (clr && clr.checked) clearSecrets.push(f.k);
        continue;
      }
      const v = val(f.k).replace(f.type === 'textarea' ? /[^\S\n]+/g : /\s+/g, ' ').trim();
      if (f.required && !v) { showToast(`«${f.label}» را بنویسید`); return; }
      if (v) data[f.k] = v;
    }
    invSaving = true;
    try {
      const encrypted = {};
      for (const k of Object.keys(newSecrets)) encrypted[k] = await encryptWith(session.key, newSecrets[k]);
      const inv = getInventory();
      let it = invEditing.id ? inv.items.find(i => i.id === invEditing.id) : null;
      const isNew = !it;
      if (isNew) {
        it = { id: newId(), company: selectedCompany, section: sec.key, data: {}, secrets: {}, createdAt: new Date().toISOString(), history: [] };
        inv.items.push(it);
      }
      const secrets = { ...(it.secrets || {}) };
      clearSecrets.forEach(k => delete secrets[k]);
      Object.assign(secrets, encrypted);
      if (!isNew && JSON.stringify(it.data) === JSON.stringify(data) && !Object.keys(encrypted).length && !clearSecrets.length) {
        closeInvItemModal();
        return;
      }
      it.data = data;
      it.secrets = secrets;
      pushVersion(it, isNew ? 'create' : 'edit');
      if (!saveInventory(inv)) return;
      closeInvItemModal();
      renderInventory();
      const det = document.querySelector(`#invSections details[data-section="${sec.key}"]`);
      if (det) det.open = true;
      showToast('✅ ذخیره شد');
    } finally {
      invSaving = false;
    }
  }

  // فقط مدیر؛ حذف نرم: داده و تاریخچه می‌ماند و از «حذف‌شده‌ها» برمی‌گردد
  async function deleteInvItem(id) {
    if (!techAdmin()) return;
    const inv = getInventory();
    const it = inv.items.find(i => i.id === id);
    if (!it) return;
    if (!await appConfirm(`«${it.data[sectionOf(it.section).titleField] || ''}» از پرونده ${it.company} حذف شود؟ (در «حذف‌شده‌ها» قابل برگشت است)`)) return;
    it.deleted = true;
    pushVersion(it, 'delete');
    if (saveInventory(inv)) renderInventory();
  }

  // ---------- پنل‌ها (مدیر) ----------
  let panelOnClose = null;
  function openInvPanel(title, html) {
    document.getElementById('invPanelTitle').textContent = title;
    document.getElementById('invPanelBody').innerHTML = html;
    document.getElementById('invPanelModal').classList.add('open');
  }
  function closeInvPanel() {
    document.getElementById('invPanelModal').classList.remove('open');
    document.getElementById('invPanelBody').innerHTML = '';
    const cb = panelOnClose;
    panelOnClose = null;
    if (cb) cb();
  }

  // فیلدهای عوض‌شده بین دو نسخه، به‌صورت «قبلی ← جدید»
  function versionDiff(inv, sec, prev, cur, id, index) {
    const out = [];
    sec.fields.forEach(f => {
      if (f.type === 'secret') {
        const a = prev && prev.secrets && prev.secrets[f.k];
        const b = cur.secrets && cur.secrets[f.k];
        if (JSON.stringify(a || null) === JSON.stringify(b || null)) return;
        const what = !a ? 'ثبت شد' : !b ? 'پاک شد' : 'عوض شد';
        out.push(`<div><b>${escapeHtml(fieldLabel(f))}:</b> ${what}${b ? ` <code data-ver-view="${escapeHtml(id)}|${f.k}|${index}">••••••</code> <button data-ver-reveal="${escapeHtml(id)}|${f.k}|${index}">👁</button>` : ''}</div>`);
        return;
      }
      const show = (v) => f.type === 'ref' ? (itemLabel(inv, v) || (v ? '(حذف‌شده)' : '')) : (v || '');
      const a = prev ? (prev.data || {})[f.k] : undefined;
      const b = (cur.data || {})[f.k];
      if ((a || '') === (b || '')) return;
      out.push(`<div><b>${escapeHtml(fieldLabel(f))}:</b> ${a ? `<del>${escapeHtml(show(a))}</del> ← ` : ''}${b ? `<ins>${escapeHtml(show(b))}</ins>` : '<del>(خالی شد)</del>'}</div>`);
    });
    return out.join('') || '<div>بدون تغییر در فیلدها</div>';
  }

  function openHistoryPanel(id) {
    if (!techAdmin()) return;
    const inv = getInventory();
    const it = inv.items.find(i => i.id === id);
    if (!it) return;
    const sec = sectionOf(it.section);
    const last = it.history.length - 1;
    const html = it.history.map((v, i) => ({ v, i })).reverse().map(({ v, i }) => `<div class="inv-ver">
        <div class="inv-ver-head"><span>${escapeHtml(ACTION_LABELS[v.action] || v.action)} — ${escapeHtml((v.by && v.by.name) || 'نامشخص')}</span><span class="inv-meta">${whenLabel(v.at)}</span></div>
        <div class="inv-diff">${versionDiff(inv, sec, i > 0 ? it.history[i - 1] : null, v, it.id, i)}</div>
        ${i < last && v.action !== 'delete' ? `<button data-restore="${escapeHtml(it.id)}|${i}">↩️ برگرداندن این نسخه</button>` : ''}
      </div>`).join('');
    openInvPanel(`🕘 تاریخچه «${it.data[sec.titleField] || ''}» (${it.company})`, html);
  }

  async function restoreVersion(ref) {
    if (!techAdmin()) return;
    const [id, idx] = ref.split('|');
    const inv = getInventory();
    const it = inv.items.find(i => i.id === id);
    const v = it && it.history[Number(idx)];
    if (!v || !await appConfirm(`نسخه ${whenLabel(v.at)} برگردانده شود؟ (نسخه فعلی در تاریخچه می‌ماند)`, 'برگرداندن')) return;
    it.data = { ...v.data };
    it.secrets = { ...(v.secrets || {}) };
    it.deleted = false;
    pushVersion(it, 'restore');
    if (!saveInventory(inv)) return;
    showToast('↩️ برگردانده شد');
    renderInventory();
    openHistoryPanel(id);
  }

  function openDeletedPanel() {
    if (!techAdmin()) return;
    const inv = getInventory();
    const items = inv.items.filter(i => i.deleted).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const comps = inv.companies.filter(c => c.deleted);
    const html = [
      ...comps.map(c => `<div class="inv-ver"><div class="inv-ver-head"><span>🏢 پرونده «${escapeHtml(c.name)}»</span></div><button data-undelete="company|${escapeHtml(c.id)}">↩️ برگرداندن</button></div>`),
      ...items.map(it => {
        const sec = sectionOf(it.section);
        return `<div class="inv-ver"><div class="inv-ver-head"><span>${sec.title.split(' ')[0]} ${escapeHtml(it.data[sec.titleField] || '')} — ${escapeHtml(it.company)}</span>
          <span class="inv-meta">${escapeHtml((it.updatedBy && it.updatedBy.name) || '')} · ${whenLabel(it.updatedAt)}</span></div>
          <div class="inv-tools"><button data-undelete="item|${escapeHtml(it.id)}">↩️ برگرداندن</button><button data-history="${escapeHtml(it.id)}">🕘 تاریخچه</button></div></div>`;
      })
    ].join('') || '<div class="inv-empty">چیزی حذف نشده</div>';
    openInvPanel('🗑 حذف‌شده‌ها', html);
  }
  function restoreDeleted(ref) {
    if (!techAdmin()) return;
    const [kind, id] = ref.split('|');
    const inv = getInventory();
    if (kind === 'company') {
      const c = inv.companies.find(x => x.id === id);
      if (!c) return;
      c.deleted = false;
      c.history.push({ at: new Date().toISOString(), by: sessionWho(), action: 'restore', name: c.name });
    } else {
      const it = inv.items.find(x => x.id === id);
      if (!it) return;
      it.deleted = false;
      pushVersion(it, 'restore');
    }
    if (saveInventory(inv)) { showToast('↩️ برگردانده شد'); renderInventory(); openDeletedPanel(); }
  }

  // همه تغییرات همه شرکت‌ها و حساب‌ها، جدیدترین اول؛ با فیلتر شخص
  function openAuditPanel(who) {
    if (!techAdmin()) return;
    const inv = getInventory();
    const team = getTeam();
    const events = [];
    inv.items.forEach(it => {
      const sec = sectionOf(it.section);
      it.history.forEach((v, i) => events.push({ at: v.at, by: v.by, text: `${ACTION_LABELS[v.action] || v.action} ${sec.title.split(' ')[0]} «${(v.data && v.data[sec.titleField]) || it.data[sec.titleField] || ''}» — ${it.company}`, id: it.id }));
    });
    inv.companies.forEach(c => (c.history || []).forEach(v => events.push({ at: v.at, by: v.by, text: `${ACTION_LABELS[v.action] || v.action} پرونده فنی «${c.name}»` })));
    (team ? team.log : []).forEach(v => events.push({ at: v.at, by: v.by, text: `👥 ${v.detail}` }));
    const people = [...new Set(events.map(e => (e.by && e.by.name) || 'نامشخص'))];
    const shown = events.filter(e => !who || ((e.by && e.by.name) || 'نامشخص') === who).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 300);
    openInvPanel('📜 گزارش تغییرات', `
      <div class="inv-tools"><button class="inv-small-btn" data-audit-who="" style="${!who ? 'color:var(--accent-fg);' : ''}">همه</button>${people.map(p =>
        `<button class="inv-small-btn" data-audit-who="${escapeHtml(p)}" style="${p === who ? 'color:var(--accent-fg);' : ''}">${escapeHtml(p)}</button>`).join('')}</div>
      ${shown.map(e => `<div class="inv-ver"><div class="inv-ver-head"><span>${escapeHtml((e.by && e.by.name) || 'نامشخص')}</span><span class="inv-meta">${whenLabel(e.at)}</span></div>
        <div>${escapeHtml(e.text)}</div>${e.id ? `<button data-history="${escapeHtml(e.id)}">🕘 جزئیات</button>` : ''}</div>`).join('') || '<div class="inv-empty">تغییری ثبت نشده</div>'}`);
  }


