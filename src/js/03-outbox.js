  // ==================== صف ارسال آفلاین ====================
  const OUTBOX_KEY = 'geomat_outbox_v1';
  const OUTBOX_MAX = 50;

  function getOutbox() {
    try {
      const list = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
      return Array.isArray(list) ? list.filter(x => x && typeof x.text === 'string' && x.id) : [];
    } catch(e) {
      return [];
    }
  }
  function saveOutbox(list) {
    try {
      if (list.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-OUTBOX_MAX)));
      else localStorage.removeItem(OUTBOX_KEY);
      return true;
    } catch(e) {
      showToast('⚠️ حافظه پر است؛ گزارش در صف ذخیره نشد');
      return false;
    }
  }

  function queueOutbox(type, text) {
    const list = getOutbox();
    list.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type, company: selectedCompany, text, ts: Date.now() });
    if (saveOutbox(list)) showToast(`📴 اینترنت نیست؛ گزارش ثبت و در صف ارسال گذاشته شد (${toPersianDigits(Math.min(list.length, OUTBOX_MAX))})`);
    renderOutbox();
  }

  function renderOutbox() {
    const banner = document.getElementById('outboxBanner');
    if (!banner) return;
    const list = getOutbox();
    banner.classList.toggle('show', list.length > 0);
    banner.classList.toggle('offline', !navigator.onLine);
    document.getElementById('outboxText').textContent = navigator.onLine
      ? `📤 ${toPersianDigits(list.length)} گزارش در صف ارسال`
      : `📴 آفلاین • ${toPersianDigits(list.length)} گزارش در صف`;
    if (document.getElementById('outboxModal').classList.contains('open')) renderOutboxList();
  }

  function renderOutboxList() {
    const list = getOutbox();
    const box = document.getElementById('outboxList');
    document.getElementById('outboxHint').textContent = navigator.onLine
      ? 'هر گزارش را جدا به واتساپ بفرستید؛ بعد از ارسال از صف برداشته می‌شود.'
      : 'هنوز آفلاین هستید؛ وقتی اینترنت وصل شد ارسال کنید.';
    box.innerHTML = '';
    if (!list.length) {
      box.innerHTML = '<div style="color:var(--text-dim); font-size:12px; text-align:center; padding:12px;">صف خالی است ✅</div>';
      return;
    }
    list.forEach(item => {
      const el = document.createElement('div');
      el.className = 'outbox-item';
      const head = document.createElement('div');
      head.style.cssText = 'display:flex; justify-content:space-between; font-size:12px; font-weight:800;';
      const title = document.createElement('span');
      title.textContent = `${item.type === 'attendance' ? '🕒 تردد' : '🛠 ساپورت'} • ${item.company || ''}`;
      const when = document.createElement('span');
      when.style.color = 'var(--text-dim)';
      const d = new Date(item.ts);
      when.textContent = `${shortDateLabel(d)} ${toPersianDigits(pad2(d.getHours()) + ':' + pad2(d.getMinutes()))}`;
      head.append(title, when);
      const pre = document.createElement('pre');
      pre.textContent = item.text;
      const actions = document.createElement('div');
      actions.className = 'banner-actions';
      const send = document.createElement('button');
      send.textContent = '🟢 ارسال به واتساپ';
      send.onclick = () => sendOutboxItem(item.id);
      const del = document.createElement('button');
      del.textContent = '🗑';
      del.title = 'حذف از صف';
      del.onclick = () => removeOutboxItem(item.id, true);
      actions.append(send, del);
      el.append(head, pre, actions);
      box.appendChild(el);
    });
  }

  function openOutbox() {
    playTactileFeedback();
    renderOutboxList();
    document.getElementById('outboxModal').classList.add('open');
  }
  function closeOutbox() {
    document.getElementById('outboxModal').classList.remove('open');
  }

  function sendOutboxItem(id) {
    const item = getOutbox().find(x => x.id === id);
    if (!item) return;
    if (!navigator.onLine) {
      showToast('📴 هنوز آفلاین هستید');
      return;
    }
    playTactileFeedback();
    saveOutbox(getOutbox().filter(x => x.id !== id));
    renderOutbox();
    if (navigator.share) {
      navigator.share({ text: item.text }).catch(() => openWhatsAppDirect(item.text));
    } else {
      openWhatsAppDirect(item.text);
    }
  }

  async function removeOutboxItem(id, ask) {
    if (ask && !await appConfirm('این گزارش از صف ارسال حذف شود؟ (در آرشیو می‌ماند)')) return;
    saveOutbox(getOutbox().filter(x => x.id !== id));
    renderOutbox();
  }

  function onConnectivityChange() {
    renderOutbox();
    if (navigator.onLine && getOutbox().length) showToast(`📶 اینترنت وصل شد؛ ${toPersianDigits(getOutbox().length)} گزارش در صف ارسال است`);
  }

