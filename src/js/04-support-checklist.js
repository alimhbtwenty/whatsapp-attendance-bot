  // ==================== چک‌لیست ساپورت ====================
  // آیتم‌های هر مشتری ذخیره می‌شوند؛ تیک‌ها فقط تا ارسال/کپی گزارش در حافظه می‌مانند
  const CHECKLISTS_KEY = 'geomat_checklists_v1';
  const checklistTicks = {}; // company -> Set(item)

  function getChecklists() {
    try {
      const o = JSON.parse(localStorage.getItem(CHECKLISTS_KEY) || '{}');
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch(e) {
      return {};
    }
  }
  function getChecklistItems(company) {
    const list = getChecklists()[company];
    return Array.isArray(list) ? list.filter(x => typeof x === 'string' && x.trim()) : [];
  }
  function saveChecklistItems(company, items) {
    const all = getChecklists();
    if (items.length) all[company] = items;
    else delete all[company];
    try { localStorage.setItem(CHECKLISTS_KEY, JSON.stringify(all)); } catch(e) { showToast('ذخیره چک‌لیست ممکن نشد ⚠️'); }
  }
  function checklistState(company) {
    const ticks = checklistTicks[company] || new Set();
    return getChecklistItems(company).map(item => ({ item, done: ticks.has(item) }));
  }
  function resetChecklistTicks(company) {
    delete checklistTicks[company];
    renderChecklist();
  }

  function renderChecklist() {
    const box = document.getElementById('checklistItems');
    if (!box) return;
    const state = checklistState(selectedCompany);
    document.getElementById('checklistTitle').textContent = selectedCompany ? `چک‌لیست «${selectedCompany}»` : 'چک‌لیست';
    document.getElementById('checklistCount').textContent = state.length
      ? `${toPersianDigits(state.filter(c => c.done).length)}/${toPersianDigits(state.length)}`
      : '';
    box.innerHTML = '';
    if (!state.length) {
      box.innerHTML = '<div style="color:var(--text-dim); font-size:11.5px; padding:2px 4px;">برای این مشتری آیتمی ثبت نشده؛ کارهای ثابت هر بازدید را اضافه کنید.</div>';
      return;
    }
    state.forEach(({ item, done }) => {
      const row = document.createElement('label');
      row.className = `check-item${done ? ' done' : ''}`;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = done;
      cb.onchange = () => toggleChecklistItem(item, cb.checked);
      const span = document.createElement('span');
      span.textContent = item;
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '✕';
      del.title = 'حذف آیتم';
      del.onclick = (e) => { e.preventDefault(); e.stopPropagation(); removeChecklistItem(item); };
      row.append(cb, span, del);
      box.appendChild(row);
    });
  }

  function toggleChecklistItem(item, on) {
    playTactileFeedback();
    const ticks = checklistTicks[selectedCompany] || (checklistTicks[selectedCompany] = new Set());
    if (on) ticks.add(item); else ticks.delete(item);
    renderChecklist();
    updateSupportPreview();
  }

  function addChecklistItem() {
    const input = document.getElementById('checklistNewItem');
    const item = input.value.replace(/\s+/g, ' ').trim();
    if (!item) return;
    if (!selectedCompany) {
      showToast('اول مشتری را انتخاب کنید');
      return;
    }
    playTactileFeedback();
    const items = getChecklistItems(selectedCompany);
    if (items.includes(item)) {
      showToast('این آیتم در چک‌لیست هست');
      return;
    }
    items.push(item);
    saveChecklistItems(selectedCompany, items);
    input.value = '';
    renderChecklist();
    updateSupportPreview();
  }

  async function removeChecklistItem(item) {
    if (!await appConfirm(`«${item}» از چک‌لیست «${selectedCompany}» حذف شود؟`)) return;
    saveChecklistItems(selectedCompany, getChecklistItems(selectedCompany).filter(x => x !== item));
    if (checklistTicks[selectedCompany]) checklistTicks[selectedCompany].delete(item);
    renderChecklist();
    updateSupportPreview();
  }

