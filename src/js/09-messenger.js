  // ==================== پیام‌رسان اختصاصی تیم (BETA) ====================
  // این پیام‌رسان فعلاً سرور ندارد؛ پیام‌ها فقط در localStorage همین دستگاه ذخیره می‌شوند.
  const CHAT_STORAGE_KEY = 'geomat_chat_messages_v1';
  const CHAT_MAX_MESSAGES = 100;
  const CHAT_GROUP_WINDOW_MS = 5 * 60 * 1000;
  const CHAT_CHANNELS = {
    attendance: { icon: '🕒', label: 'ترددها' },
    support: { icon: '🛠', label: 'ساپورت فنی' },
    general: { icon: '📢', label: 'عمومی' }
  };

  // نصب تازه: فقط یک پیام راهنما (پیام‌های نمونه با نام آدم‌های ساختگی حذف شد)
  function buildDefaultChatMessages() {
    return [{
      id: 'welcome-1',
      sender: 'Geo Team',
      isMine: false,
      channel: 'general',
      ts: Date.now(),
      text: 'به پیام‌رسان تیم خوش آمدید. هر تردد و گزارش ساپورتی که ثبت کنید، خودکار در کانال خودش این‌جا هم ثبت می‌شود.'
    }];
  }

  // ابزار ضد نفوذ و فرار کاراکترهای خطرناک (XSS Hardening)
  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // هشتگ‌ها روی متن خام پیدا می‌شوند و هر تکه جداگانه escape می‌شود
  // (اجرای regex روی متن escape‌شده، موجودیت‌هایی مثل &#039; را می‌شکست)
  function formatChatMessage(text) {
    if (!text) return '';
    return String(text)
      .split(/(#[\p{L}\p{M}\p{N}_‌]+)/u)
      .map((part, i) => i % 2 ? `<span class="tg-hashtag">${escapeHtml(part)}</span>` : escapeHtml(part))
      .join('');
  }

  // رنگ‌های تلگرامی داینامیک بر اساس نام فرستنده در گروه
  function getAuthorColor(name) {
    const colors = ['var(--info)', '#34d399', 'var(--accent-2)', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee'];
    if (!name) return 'var(--info)';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  let chatChannelFilter = 'all';
  let chatActiveMessageId = null;

  // یکدست‌سازی پیام‌های ذخیره‌شده (شامل پیام‌های نسخه‌های قبل که فقط رشته ساعت داشتند)
  function normalizeChatMessage(m) {
    if (!m || typeof m.text !== 'string' || !m.text.trim()) return null;
    let ts = Number(m.ts);
    if (!Number.isFinite(ts) || ts <= 0) {
      const idNum = Number(m.id);
      ts = Number.isFinite(idNum) && idNum > 1e12 ? idNum : null;
    }
    return {
      id: m.id != null ? String(m.id) : '',
      sender: typeof m.sender === 'string' && m.sender.trim() ? m.sender : 'همکار',
      isMine: m.isMine === true,
      channel: CHAT_CHANNELS[m.channel] ? m.channel : 'general',
      ts: ts,
      time: typeof m.time === 'string' ? m.time : '',
      text: m.text
    };
  }

  function getChatMessages() {
    let raw = null;
    try { raw = localStorage.getItem(CHAT_STORAGE_KEY); } catch(e) {}
    // فقط در اولین اجرا پیام‌های نمونه نمایش داده می‌شوند؛ تاریخچه پاک‌شده دوباره پر نمی‌شود
    if (raw === null) {
      const seed = buildDefaultChatMessages();
      saveChatMessages(seed);
      return seed;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const seen = new Set();
      return parsed.map(normalizeChatMessage).filter(Boolean).map((m, i) => {
        if (!m.id || seen.has(m.id)) m.id = `legacy-${i}`;
        seen.add(m.id);
        return m;
      });
    } catch(e) {
      return [];
    }
  }

  function saveChatMessages(msgs) {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(msgs.slice(-CHAT_MAX_MESSAGES)));
      return true;
    } catch(e) {
      try {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(msgs.slice(-30)));
        showToast('حافظه پر است؛ فقط ۳۰ پیام آخر نگه داشته شد');
        return true;
      } catch(err) {
        showToast('ذخیره پیام ممکن نشد ⚠️');
        return false;
      }
    }
  }

  const chatDayFormatter = (() => {
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long' });
    } catch(e) {
      return null;
    }
  })();

  function chatDayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  function chatDayLabel(ts) {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const key = chatDayKey(ts);
    if (key === chatDayKey(now.getTime())) return 'امروز';
    if (key === chatDayKey(yesterday.getTime())) return 'دیروز';
    return chatDayFormatter ? chatDayFormatter.format(new Date(ts)) : new Date(ts).toLocaleDateString();
  }

  function chatTimeLabel(m) {
    if (!m.ts) return m.time;
    const d = new Date(m.ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  // آیا پیام b ادامه پیام a از همان فرستنده است؟ (برای گروه‌بندی حباب‌ها)
  function chatContinues(a, b) {
    return !!(a && b && a.sender === b.sender && a.isMine === b.isMine && a.ts && b.ts &&
      b.ts - a.ts < CHAT_GROUP_WINDOW_MS && chatDayKey(a.ts) === chatDayKey(b.ts));
  }

  function filterChatRoom(ch) {
    playTactileFeedback();
    chatChannelFilter = ch;
    document.getElementById('tgFilterAll').classList.toggle('active', ch === 'all');
    document.getElementById('tgFilterAtt').classList.toggle('active', ch === 'attendance');
    document.getElementById('tgFilterSup').classList.toggle('active', ch === 'support');
    document.getElementById('tgFilterGen').classList.toggle('active', ch === 'general');
    renderChatMessages({ forceBottom: true });
  }

  function isChatNearBottom(stream) {
    return stream.scrollHeight - stream.scrollTop - stream.clientHeight < 80;
  }

  function scrollChatToBottom(smooth) {
    const stream = document.getElementById('tgChatStream');
    if (!stream) return;
    stream.scrollTo({ top: stream.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  function updateChatScrollButton() {
    const stream = document.getElementById('tgChatStream');
    const btn = document.getElementById('tgScrollDownBtn');
    if (stream && btn) btn.classList.toggle('show', !isChatNearBottom(stream));
  }

  function currentChatTargetChannel() {
    return chatChannelFilter === 'all' ? 'general' : chatChannelFilter;
  }

  // forceBottom: پرش به آخرین پیام؛ در غیر این صورت اگر کاربر بالاتر را می‌خواند، اسکرول دست نمی‌خورد
  function renderChatMessages(opts) {
    opts = opts || {};
    const stream = document.getElementById('tgChatStream');
    if (!stream) return;
    const wasNearBottom = isChatNearBottom(stream);

    const msgs = getChatMessages();
    const filtered = chatChannelFilter === 'all'
      ? msgs
      : msgs.filter(m => m.channel === chatChannelFilter);

    const countBadge = document.getElementById('tgMsgCount');
    if (countBadge) countBadge.textContent = `${msgs.length} پیام`;

    const input = document.getElementById('tgMessageInput');
    if (input) input.placeholder = `پیام در کانال ${CHAT_CHANNELS[currentChatTargetChannel()].label}...`;

    if (filtered.length === 0) {
      stream.innerHTML = '<div class="tg-empty-state">هیچ پیامی در این کانال وجود ندارد.<br>اولین پیام را بنویسید 💬</div>';
      updateChatScrollButton();
      return;
    }

    const myName = getUserName();
    let lastDay = null;

    stream.innerHTML = filtered.map((m, i) => {
      let sep = '';
      if (m.ts) {
        const day = chatDayKey(m.ts);
        if (day !== lastDay) {
          sep = `<div class="tg-day-sep">${escapeHtml(chatDayLabel(m.ts))}</div>`;
          lastDay = day;
        }
      }
      const isMine = m.isMine || m.sender === myName;
      const cont = !sep && chatContinues(filtered[i - 1], m);
      const hasNext = chatContinues(m, filtered[i + 1]);
      const authorColor = getAuthorColor(m.sender);
      const ch = CHAT_CHANNELS[m.channel];

      return `${sep}
        <div class="tg-bubble-row ${isMine ? 'mine' : 'other'}${cont ? ' cont' : ''}${hasNext ? ' has-next' : ''}">
          <div class="tg-msg-bubble" data-msg-id="${escapeHtml(m.id)}">
            ${!isMine && !cont ? `
              <div class="tg-msg-author" style="color: ${authorColor};">
                <span class="tg-author-avatar-dot" style="background:${authorColor};"></span>
                <span>${escapeHtml(m.sender)}</span>
              </div>
            ` : ''}
            <div class="tg-msg-text-content">${formatChatMessage(m.text)}</div>
            <div class="tg-bubble-meta">
              ${chatChannelFilter === 'all' ? `<span class="tg-chan-tag">${ch.icon} ${ch.label}</span>` : ''}
              <span>${escapeHtml(chatTimeLabel(m))}</span>
              ${isMine ? '<span style="color:#38bdf8; font-weight:800;" title="ذخیره شد">✓</span>' : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (opts.forceBottom || wasNearBottom) {
      scrollChatToBottom(!!opts.smooth);
    }
    updateChatScrollButton();
  }

  // لمس حباب ← منوی عملیات (به‌جای onclick درون‌خطی که با متن پیام ساخته می‌شد و قابل تزریق بود)
  function onChatStreamClick(e) {
    const bubble = e.target.closest('.tg-msg-bubble');
    if (!bubble) return;
    const sel = window.getSelection ? String(window.getSelection()) : '';
    if (sel.length > 0) return; // کاربر در حال انتخاب بخشی از متن است
    openChatActions(bubble.dataset.msgId);
  }

  function findChatMessage(id) {
    return getChatMessages().find(m => m.id === id) || null;
  }

  function openChatActions(id) {
    const msg = findChatMessage(id);
    if (!msg) return;
    playTactileFeedback();
    chatActiveMessageId = id;
    document.getElementById('tgSheetPreview').textContent = msg.text;
    document.getElementById('tgActionSheet').classList.add('open');
  }

  function closeChatActions() {
    chatActiveMessageId = null;
    const sheet = document.getElementById('tgActionSheet');
    if (sheet) sheet.classList.remove('open');
  }

  function chatActionCopy() {
    const msg = findChatMessage(chatActiveMessageId);
    closeChatActions();
    if (msg) copyChatMessageText(msg.text);
  }

  function chatActionWhatsApp() {
    const msg = findChatMessage(chatActiveMessageId);
    closeChatActions();
    if (msg) openWhatsAppDirect(msg.text);
  }

  async function chatActionDelete() {
    const id = chatActiveMessageId;
    closeChatActions();
    if (!id || !await appConfirm('این پیام از روی این دستگاه حذف شود؟')) return;
    playTactileFeedback();
    saveChatMessages(getChatMessages().filter(m => m.id !== id));
    renderChatMessages();
    showToast('پیام حذف شد');
  }

  // کپی سریع متن پیام به سبک تلگرام
  function copyChatMessageText(text) {
    if (!text) return;
    playTactileFeedback();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('متن پیام کپی شد 📋');
      }).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('متن پیام کپی شد 📋');
  }

  // روی دستگاه‌های دارای کیبورد فیزیکی Enter ارسال می‌کند و Shift+Enter خط جدید؛
  // روی موبایل Enter خط جدید است و ارسال با دکمه انجام می‌شود (مثل تلگرام)
  const chatEnterSends = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);

  function onChatInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && chatEnterSends) {
      e.preventDefault();
      sendChatMessage();
    }
  }

  // کادر نوشتن: یک خط (۴۰px)، با متن بلندتر تا حداکثر ۵ خط بزرگ می‌شود و هیچ‌وقت بیشتر از ۲۸٪ ارتفاع
  // صفحه نمی‌شود (با کیبورد باز جای پیام‌ها را نمی‌گیرد)؛ بقیه متن داخل کادر اسکرول می‌شود
  const CHAT_INPUT_MIN_PX = 40;
  const CHAT_INPUT_MAX_LINES = 5;
  function syncChatComposer() {
    const input = document.getElementById('tgMessageInput');
    const btn = document.getElementById('tgSendBtn');
    if (!input) return;
    const lineH = parseFloat(getComputedStyle(input).lineHeight) || 20;
    const chrome = CHAT_INPUT_MIN_PX - lineH; // padding + border
    const max = Math.max(CHAT_INPUT_MIN_PX,
      Math.min(chrome + lineH * CHAT_INPUT_MAX_LINES, Math.round(window.innerHeight * 0.28)));
    input.style.height = CHAT_INPUT_MIN_PX + 'px';
    const needed = input.scrollHeight + (input.offsetHeight - input.clientHeight);
    input.style.height = Math.min(Math.max(needed, CHAT_INPUT_MIN_PX), max) + 'px';
    input.style.overflowY = needed > max ? 'auto' : 'hidden';
    if (btn) btn.disabled = !input.value.trim();
  }

  // کیبورد مجازی باز است؟ (ارتفاع صفحه موقع تایپ در پیام‌رسان به‌وضوح از ارتفاع عادی کمتر شده)
  let chatBaseHeight = window.innerHeight;
  function updateChatKeyboardState() {
    const input = document.getElementById('tgMessageInput');
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const typing = systemMode === 'messenger' && document.activeElement === input;
    if (!typing) chatBaseHeight = vh;
    const open = typing && vh < chatBaseHeight * 0.8;
    if (document.body.classList.contains('kb-open') !== open) {
      document.body.classList.toggle('kb-open', open);
      setTimeout(() => scrollChatToBottom(false), 30);
    }
    syncChatComposer();
  }

  function sendChatMessage() {
    const input = document.getElementById('tgMessageInput');
    const text = input.value.trim();
    if (!text) return;
    playTactileFeedback();

    const now = Date.now();
    const msgs = getChatMessages();
    msgs.push({
      id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
      sender: getUserName(),
      isMine: true,
      channel: currentChatTargetChannel(),
      ts: now,
      text: text
    });

    if (!saveChatMessages(msgs)) return;
    input.value = '';
    syncChatComposer();
    renderChatMessages({ forceBottom: true, smooth: true });

    if (chatEnterSends) {
      input.focus();
    }
  }

  // هر تردد ثبت‌شده (ارسال یا کپی) خودکار در کانال «ترددها»ی پیام‌رسان داخلی هم ثبت می‌شود
  function postReportToChat(text) {
    const now = Date.now();
    const msgs = getChatMessages();
    msgs.push({
      id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
      sender: getUserName(),
      isMine: true,
      channel: 'attendance',
      ts: now,
      text: text
    });
    if (saveChatMessages(msgs) && systemMode === 'messenger') renderChatMessages();
  }

  function attachCurrentReportToChat(type) {
    playTactileFeedback();
    const text = type === 'attendance' ? generateAttendanceText() : generateSupportText();
    const input = document.getElementById('tgMessageInput');
    input.value = text;
    syncChatComposer();
    input.focus();
    showToast(type === 'attendance' ? '⚡ تردد جاری الصاق شد' : '🛠 گزارش ساپورت الصاق شد');
  }

  async function clearChatHistory() {
    const scoped = chatChannelFilter !== 'all';
    const label = scoped ? `کانال «${CHAT_CHANNELS[chatChannelFilter].label}»` : 'همه کانال‌ها';
    if (!await appConfirm(`پیام‌های ${label} از روی این دستگاه پاک شوند؟`, 'پاکسازی')) return;
    playTactileFeedback();
    const remaining = scoped ? getChatMessages().filter(m => m.channel !== chatChannelFilter) : [];
    saveChatMessages(remaining);
    renderChatMessages();
    showToast(scoped ? `پیام‌های ${label} پاک شد` : 'تاریخچه چت پاکسازی شد');
  }

  // نشانگر وضعیت اتصال اینترنت / آفلاین (Network Status Hardening)
  function updateNetworkStatus() {
    const el = document.getElementById('tgNetStatus');
    if (!el) return;
    if (navigator.onLine) {
      el.innerHTML = '<span style="color:#22c55e;">●</span> آنلاین • ذخیره فقط روی همین دستگاه';
    } else {
      el.innerHTML = '<span style="color:#f59e0b;">●</span> آفلاین • ذخیره فقط روی همین دستگاه';
    }
  }
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  window.addEventListener('online', onConnectivityChange);
  window.addEventListener('offline', onConnectivityChange);

  // همگام‌سازی بلادرنگ بین تب‌های باز (Cross-Tab Realtime Hardening)
  window.addEventListener('storage', (e) => {
    if (e.key === 'geomat_chat_messages_v1') {
      if (systemMode === 'messenger') renderChatMessages();
    } else if (e.key === 'geomat_logs_v2') {
      if (systemMode === 'archive') renderArchive();
    } else if (e.key === OUTBOX_KEY) {
      renderOutbox();
    } else if (e.key === CHECKLISTS_KEY) {
      updateSupportPreview();
    } else if (e.key === OPEN_ENTRY_KEY || e.key === SETTINGS_KEY) {
      renderSettings();
      lastPrefillKey = '';
      renderOpenEntryBanner();
      updatePreview();
    } else if (e.key === 'geomat_companies_v2' || e.key === SITES_KEY) {
      renderCompanies();
    } else if (e.key === 'geomat_user_name') {
      document.getElementById('userNameHeader').textContent = getUserName();
    }
  });

  // مدیریت واکنش به باز شدن کیبورد مجازی در موبایل
  window.addEventListener('resize', () => {
    const dock = document.getElementById('floatingDock');
    if (!dock || systemMode === 'archive' || systemMode === 'messenger' || (systemMode === 'support' && supportView === 'inventory')) return;
    if (window.innerHeight < 520) {
      dock.style.transform = 'translateX(-50%) translateY(120px)';
      dock.style.opacity = '0';
      dock.style.pointerEvents = 'none';
    } else {
      dock.style.transform = 'translateX(-50%) translateY(0)';
      dock.style.opacity = '1';
      dock.style.pointerEvents = 'auto';
    }
  });

  // مدیریت پیشرفته کیبورد مجازی در موبایل (Interactive Keyboard & Viewport Sync)
  // با باز شدن کیبورد، فقط وقتی کاربر در حال تایپ است به آخرین پیام برو
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      updateChatKeyboardState();
      if (systemMode === 'messenger' && document.activeElement === document.getElementById('tgMessageInput')) {
        setTimeout(() => scrollChatToBottom(true), 80);
      }
    });
  }

  // اتصال رویدادهای پیام‌رسان
  window.addEventListener('load', () => {
    const chatInp = document.getElementById('tgMessageInput');
    if (chatInp) {
      chatInp.addEventListener('keydown', onChatInputKeydown);
      chatInp.addEventListener('input', syncChatComposer);
      chatInp.addEventListener('focus', () => {
        updateChatKeyboardState();
        setTimeout(() => scrollChatToBottom(true), 280);
      });
      chatInp.addEventListener('blur', () => setTimeout(updateChatKeyboardState, 50));
    }
    const stream = document.getElementById('tgChatStream');
    if (stream) {
      stream.addEventListener('click', onChatStreamClick);
      stream.addEventListener('scroll', updateChatScrollButton, { passive: true });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeChatActions();
        resolveConfirm(false);
        closeCalendar();
        closeOutbox();
      }
    });
  });

  // دکمه برگشت گوشی (اپ اندروید): اول پنجره باز را ببند، بعد به تب تردد برگرد؛
  // false یعنی چیزی برای بستن نبود و اپ بسته شود
  function handleBack() {
    if (document.getElementById('confirmModal').classList.contains('open')) { resolveConfirm(false); return true; }
    const modals = [['calendarModal', closeCalendar], ['outboxModal', closeOutbox], ['addModal', closeAddModal], ['userModal', closeUserModal]];
    for (const [id, close] of modals) {
      if (document.getElementById(id).classList.contains('open')) { close(); return true; }
    }
    if (document.getElementById('tgActionSheet').classList.contains('open')) { closeChatActions(); return true; }
    if (isEditMode) { toggleEditLocations(); return true; }
    if (systemMode !== 'attendance') { switchSystemMode('attendance'); return true; }
    return false;
  }
  window.handleBack = handleBack;

