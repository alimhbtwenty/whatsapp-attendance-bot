  // ==================== ژئوفنس: موقعیت ثبت‌شده هر محل ====================
  // هر محل یک بار (در حالت «مدیریت») موقعیتش ثبت می‌شود؛ موقع ورودِ همین لحظه نزدیک‌ترین محل
  // داخل شعاع خودکار انتخاب می‌شود و بیرون از محدوده فقط هشدار داده می‌شود (ارسال آزاد است)
  const SITES_KEY = 'geomat_sites_v1';
  const SITE_DEFAULT_RADIUS = 200;

  function getSites() {
    try {
      const o = JSON.parse(localStorage.getItem(SITES_KEY) || '{}');
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch(e) {
      return {};
    }
  }
  function saveSites(sites) {
    try { localStorage.setItem(SITES_KEY, JSON.stringify(sites)); } catch(e) { showToast('ذخیره موقعیت ممکن نشد ⚠️'); }
  }
  function distanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }

  // وضعیت محل انتخاب‌شده نسبت به لوکیشن ورود؛ null یعنی محل موقعیت ثبت‌شده ندارد
  function fenceStatus() {
    if (entryGeo.status !== 'ok') return null;
    const site = getSites()[selectedCompany];
    if (!site) return null;
    const distance = distanceMeters(entryGeo.lat, entryGeo.lng, site.lat, site.lng);
    return { distance, inside: distance <= site.radius };
  }

  // نزدیک‌ترین محل داخل شعاع را انتخاب کن؛ به‌روزرسانی بی‌صدای لوکیشن (هر چند دقیقه)
  // انتخاب دستی کاربر را عوض نمی‌کند، فقط «⏱ الان» ورود یا دکمه به‌روزرسانی لوکیشن
  let companyPickedManually = false;
  let geofenceForceNext = false;
  let freshFixAfterPending = false;
  function applyGeofence() {
    const force = geofenceForceNext;
    geofenceForceNext = false;
    if (!needsEntryGeo() || entryGeo.status !== 'ok') return;
    if (companyPickedManually && !force) return;
    companyPickedManually = false;
    const sites = getSites();
    const comps = getCompanies();
    let best = null;
    for (const name of comps) {
      const site = sites[name];
      if (!site) continue;
      const d = distanceMeters(entryGeo.lat, entryGeo.lng, site.lat, site.lng);
      if (d <= site.radius && (!best || d < best.d)) best = { name, d };
    }
    if (best && best.name !== selectedCompany) {
      selectedCompany = best.name;
      renderCompanies();
      updateSupportPreview();
      showToast(`📍 محل «${best.name}» خودکار انتخاب شد`);
    }
  }

  // موقعیت هر محل یک بار ثبت می‌شود و ثابت است؛ اینجا فقط وضعیتش نمایش داده می‌شود
  function renderSitePanel() {
    const panel = document.getElementById('sitePanel');
    if (!panel) return;
    panel.classList.toggle('show', isEditMode);
    if (!isEditMode) return;
    const text = document.getElementById('sitePanelText');
    if (!selectedCompany) {
      text.textContent = '📍 اول یک محل اضافه یا انتخاب کنید';
      return;
    }
    const site = getSites()[selectedCompany];
    text.textContent = site
      ? `📍 موقعیت «${selectedCompany}» ثبت شده و ثابت است (شعاع ${toPersianDigits(site.radius)} متر). برای تغییر، محل را حذف و داخل خودش دوباره اضافه کنید.`
      : `📍 موقعیت «${selectedCompany}» هنوز ثبت نشده؛ اولین «ورود همین لحظه» داخل همین محل آن را ثبت می‌کند.`;
  }


  // موقعیت تازه (نه کش‌شده) با پیام خطای فارسی
  function getFreshPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('این دستگاه از لوکیشن پشتیبانی نمی‌کند'));
        return;
      }
      navigator.geolocation.getCurrentPosition((pos) => {
        geoPermissionGranted = true;
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy || 0) });
      }, (err) => {
        reject(new Error(err && err.code === 1 ? 'اجازه دسترسی به لوکیشن داده نشد' : 'لوکیشن در دسترس نیست (GPS روشن است؟)'));
      }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
  }

  // فقط برای محلی که هنوز موقعیت ندارد؛ موقعیت ثبت‌شده عوض نمی‌شود
  function saveSitePosition(name, pos) {
    const sites = getSites();
    if (sites[name]) return sites[name];
    sites[name] = { lat: pos.lat, lng: pos.lng, radius: SITE_DEFAULT_RADIUS, acc: pos.acc };
    saveSites(sites);
    renderCompanies();
    updatePreview();
    return sites[name];
  }


  // ورودِ همین لحظه برای محلی که موقعیتش ثبت نشده (مثلاً محل‌های نسخه قبل): اول موقعیتش ثبت شود
  async function ensureSiteForLiveEntry() {
    if (!isLiveEntry() || getSites()[selectedCompany]) return true;
    const name = selectedCompany;
    if (!await appConfirm(`موقعیت «${name}» هنوز ثبت نشده. اگر الان داخل همین محل هستید، موقعیتش ثبت شود و بعد ورود ارسال شود.`, '📍 ثبت موقعیت')) {
      showToast('بدون ثبت موقعیت محل، ورود همین لحظه ارسال نمی‌شود');
      return false;
    }
    try {
      const pos = entryGeo.status === 'ok' && hasFreshGeo()
        ? { lat: entryGeo.lat, lng: entryGeo.lng, acc: entryGeo.acc }
        : await getFreshPosition();
      saveSitePosition(name, pos);
      showToast(`📍 موقعیت «${name}» ثبت شد`);
      return true;
    } catch(err) {
      showToast(`⚠️ ${err.message}`);
      return false;
    }
  }




  function initGeo() {
    try { localStorage.removeItem('geomat_geo_enabled'); } catch(e) {}
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((p) => {
        geoPermissionGranted = p.state === 'granted';
        p.onchange = () => {
          geoPermissionGranted = p.state === 'granted';
          updatePreview();
        };
        updatePreview();
      }).catch(() => {});
    }
  }

  // پشتیبانی فنی
  function appendSupportTag(text) {
    playTactileFeedback();
    const box = document.getElementById('supportActionsText');
    if (box.value.trim().length > 0) {
      box.value += `\n${text}`;
    } else {
      box.value = text;
    }
    updateSupportPreview();
  }

  function generateSupportText() {
    const { dateStr, dayName } = getPersianDateParts(supportDateObj);
    const tag = `#${selectedCompany.replace(/\s+/g, '_')}`;
    const actions = document.getElementById('supportActionsText').value.trim();
    const pending = document.getElementById('supportPendingText').value.trim();
    const techInfo = document.getElementById('supportTechInfo').value.trim();

    let lines = [];
    lines.push(dateStr);
    lines.push(dayName);
    if (selectedCompany) lines.push(tag);

    if (techInfo) lines.push(techInfo);
    if (actions) lines.push(actions);
    const checks = checklistState(selectedCompany);
    if (checks.some(c => c.done)) {
      lines.push(`\nچک‌لیست:\n${checks.map(c => `${c.done ? '✅' : '⬜'} ${c.item}`).join('\n')}`);
    }
    if (pending) {
      lines.push(`\nکار های باقی مانده:\n${pending}`);
    }
    return lines.join('\n');
  }

  function updateSupportPreview() {
    renderChecklist();
    document.getElementById('supportPreview').textContent = generateSupportText();
  }

  // ارسال نهایی به واتساپ
  // یک گزارش که یک بار کپی و بعد ارسال می‌شود (یا دو بار پشت‌سرهم) یک گزارش است:
  // متن همان می‌ماند و دوباره ثبت نمی‌شود. امضا از ورودی‌های فرم ساخته می‌شود، نه از متن،
  // چون بعد از ثبت، ورود باز بسته و تیک‌های چک‌لیست پاک می‌شوند و متن عوض می‌شود
  const REPEAT_WINDOW_MS = 10 * 60 * 1000;
  let lastCommit = null;

  function reportSignature(type) {
    if (type === 'attendance') {
      return [type, selectedCompany, toISODate(currentDateObj), selectedDay, attendanceAction, timeInputValue('in'), timeInputValue('out'),
        ...['includeDateCheck', 'hashtagCheck', 'includeDurationCheck'].map(id => document.getElementById(id).checked)].join('|');
    }
    return [type, selectedCompany, toISODate(supportDateObj),
      ...['supportActionsText', 'supportPendingText', 'supportTechInfo'].map(id => document.getElementById(id).value.trim())].join('|');
  }

  function repeatedReport(type) {
    const sig = reportSignature(type);
    return lastCommit && lastCommit.sig === sig && Date.now() - lastCommit.ts < REPEAT_WINDOW_MS ? lastCommit : null;
  }

  // متن گزارش فعلی؛ null یعنی گزارش ناقص است (پیام خطا نشان داده شده)
  async function prepareReport(type) {
    const repeat = repeatedReport(type);
    if (repeat) return { text: repeat.text, repeat: true };
    if (!selectedCompany) {
      showToast('⚠️ اول محل را انتخاب کنید (یا «افزودن محل جدید» را بزنید)');
      return null;
    }
    if (type === 'support') {
      const actions = document.getElementById('supportActionsText').value.trim();
      if (!actions && !checklistState(selectedCompany).some(c => c.done)) {
        showToast('⚠️ لطفاً شرح اقدامات را بنویسید یا چک‌لیست را تیک بزنید');
        document.getElementById('supportActionsText').focus();
        return null;
      }
      return { text: generateSupportText(), repeat: false };
    }
    if (!await attendancePromptsBeforeSend()) return null; // خروج بی‌ورود، فاصله بین دو حضور
    await ensureEntryGeoBeforeSend();
    if (!session || !await ensureSiteForLiveEntry()) return null;
    // اگر برنامه وسط این پرسش‌ها قفل شد، هیچ چیزی ثبت یا ارسال نمی‌شود
    if (!session) return null;
    return { text: generateAttendanceText(), repeat: false };
  }

  // ارسال نهایی به واتساپ
  // یک گزارش در هر لحظه: لمس دوباره «ارسال» یا «کپی» وقتی برنامه منتظر لوکیشن یا پاسخ پاپ‌آپ است،
  // همان ورود را دو بار ثبت می‌کرد (بازبینی نهایی دور ۱۳)
  let reportInFlight = false;
  function reportBusy() {
    if (!reportInFlight) return false;
    showToast('⏳ گزارش قبلی هنوز در حال آماده شدن است');
    return true;
  }

  async function executeSendWhatsApp() {
    if (reportBusy()) return;
    reportInFlight = true;
    try {
      await sendWhatsAppNow();
    } finally {
      reportInFlight = false;
    }
  }
  async function sendWhatsAppNow() {
    playTactileFeedback();
    const type = systemMode === 'attendance' ? 'attendance' : 'support';
    const report = await prepareReport(type);
    if (!report) return;
    const text = report.text;
    if (!report.repeat) commitReport(type, text);

    // بدون اینترنت: گزارش در آرشیو ثبت شد و برای ارسال بعدی در صف می‌ماند
    if (!navigator.onLine) {
      if (!getOutbox().some(x => x.text === text)) queueOutbox(type, text);
      else showToast('📴 این گزارش از قبل در صف ارسال است');
      return;
    }

    // همین گزارش اگر قبلاً آفلاین در صف رفته بود، الان فرستاده می‌شود؛ از صف برش دار تا دوباره ارسال نشود
    const queued = getOutbox();
    if (queued.some(x => x.text === text)) {
      saveOutbox(queued.filter(x => x.text !== text));
      renderOutbox();
    }

    if (navigator.share) {
      navigator.share({ text: text }).catch(() => openWhatsAppDirect(text));
    } else {
      openWhatsAppDirect(text);
    }
  }

  function openWhatsAppDirect(text) {
    const encoded = encodeURIComponent(text);
    const start = Date.now();
    window.location.href = `whatsapp://send?text=${encoded}`;
    setTimeout(() => {
      // اگر برنامه واتساپ باز شده باشد، تب اضافی وب باز نمی‌شود
      if (document.hidden || (Date.now() - start > 1200)) return;
      window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    }, 800);
  }

  async function executeCopyText() {
    if (reportBusy()) return;
    reportInFlight = true;
    try {
      await copyTextNow();
    } finally {
      reportInFlight = false;
    }
  }
  async function copyTextNow() {
    playTactileFeedback();
    const type = systemMode === 'attendance' ? 'attendance' : 'support';
    const report = await prepareReport(type);
    if (!report) return;
    const text = report.text;
    let ok = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {}
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (err) {
        ok = false;
      }
    }
    if (!ok) { showToast('خطا در کپی متن'); return; }
    showToast('پیام کپی شد! ✅');
    if (!report.repeat) commitReport(type, text);
  }

  // ثبت در آرشیو (هر رکورد حدود نیم کیلوبایت؛ ۵۰۰۰ رکورد چند سال کار و زیر سقف حافظه مرورگر است)
  const LOGS_MAX = 5000;

  function writeLogs(logs) {
    if (logs.length > LOGS_MAX) logs.length = LOGS_MAX;
    for (;;) {
      try {
        storeItem('geomat_logs_v2', JSON.stringify(logs));
        return true;
      } catch(e) {
        if (logs.length <= 50) {
          logsCache = { raw: null, list: [] }; // رکوردهای cache در حافظه تغییر کرده بودند
          showToast('⚠️ حافظه پر است؛ رکورد ذخیره نشد');
          return false;
        }
        logs.length = Math.floor(logs.length * 0.9);
        showToast('⚠️ حافظه پر است؛ قدیمی‌ترین رکوردها حذف شدند (فایل پشتیبان بگیرید)');
      }
    }
  }

  // خروجِ جفت‌شده در همان رکورد ورود ثبت می‌شود تا هر حضور در آرشیو، اکسل و گزارش ماهانه یک ردیف باشد
  function mergeExitIntoEntry(logs, pair, text) {
    const rec = pair && pair.logId ? logs.find(l => l.id === pair.logId) : null;
    if (!rec || rec.outTime) return null;
    const outTime = timeInputValue('out');
    let mins = parseHM(outTime) - parseHM(rec.inTime);
    if (mins < 0) mins += 1440;
    rec.action = 'both';
    rec.outTime = outTime;
    rec.durationMins = mins;
    rec.durationText = `${Math.floor(mins / 60)}:${pad2(mins % 60)}`;
    rec.outText = text;
    rec.closedAt = Date.now();
    rec.closedBy = sessionWho();
    return rec.id;
  }

  // برمی‌گرداند: id رکوردی که ساخته یا تکمیل شد
  function saveToSystemLog(type, text, pair) {
    let logs = getLogs();
    // «دوره کامل» فقط وقتی همان ورود را می‌بندد که ساعت ورود فرم دست نخورده باشد
    const completesEntry = attendanceAction === 'out' || closesRecordedEntry();
    if (type === 'attendance' && completesEntry) {
      const mergedId = mergeExitIntoEntry(logs, pair, text);
      if (mergedId !== null) {
        writeLogs(logs);
        return mergedId;
      }
    }
    const isSupport = type === 'support';
    const { dateStr, dayName } = getPersianDateParts(isSupport ? supportDateObj : currentDateObj);
    const dur = calculateDuration();
    const geo = !isSupport && entryGeoLine()
      ? { lat: entryGeo.lat, lng: entryGeo.lng, acc: entryGeo.acc }
      : null;

    const dateObj = isSupport ? supportDateObj : currentDateObj;
    const j = dateToJalali(dateObj);
    const hasIn = !isSupport && (attendanceAction !== 'out' || !!pair);
    const hasOut = !isSupport && attendanceAction !== 'in';
    const counted = hasIn && hasOut;

    const id = Math.max(Date.now(), ...logs.slice(0, 20).map(l => (Number(l.id) || 0) + 1));
    logs.unshift({
      id: id,
      by: sessionWho(), // چه کسی ثبت کرد (بعد از ورود با شماره)
      type: type, // 'attendance' or 'support'
      company: selectedCompany,
      date: dateStr,
      day: isSupport ? dayName : selectedDay,
      dateISO: toISODate(dateObj),
      jy: j.jy, jm: j.jm, jd: j.jd,
      action: isSupport ? null : attendanceAction,
      inTime: hasIn ? (attendanceAction === 'out' ? pair.inTime : timeInputValue('in')) : null,
      outTime: hasOut ? timeInputValue('out') : null,
      geo: geo,
      durationMins: counted ? dur.totalMins : 0,
      durationText: counted ? `${dur.h}:${String(dur.m).padStart(2,'0')}` : '-',
      text: text,
      // فیلدهای فرم ساپورت فقط در گزارش ساپورت (قبلاً متن فرم ساپورت در رکورد تردد هم می‌رفت و در اکسل می‌آمد)
      actions: isSupport ? document.getElementById('supportActionsText').value : '',
      pending: isSupport ? document.getElementById('supportPendingText').value : '',
      tech: isSupport ? document.getElementById('supportTechInfo').value : '',
      checklist: isSupport && checklistState(selectedCompany).some(c => c.done) ? checklistState(selectedCompany) : null,
      // «بین دو حضور کجا بودید؟» (فقط آرشیو و گزارش‌ها)
      gap: !isSupport && pendingGap ? { ...pendingGap } : undefined
    });
    pendingGap = null;
    // سقف قبلی ۱۵۰ رکورد بود و قدیمی‌ها بی‌صدا حذف می‌شدند (گزارش ماهانه ناقص می‌شد)
    writeLogs(logs);
    return id;
  }

  // آرشیو و فیلتر هر شرکت
  let archiveVisible = 30;
  let archivePersonFilter = 'all';
  // رکوردهای یک نفر (فیلتر «👤») یا همه؛ آرشیو، اکسل و گزارش ماهانه همه از همین می‌خوانند
  function personScopedLogs(logs) {
    return archivePersonFilter === 'all' ? logs : logs.filter(l => l.by && l.by.id === archivePersonFilter);
  }
  function archiveScopedLogs() {
    return personScopedLogs(getLogs()).filter(l => archiveCompanyFilter === 'all' || l.company === archiveCompanyFilter);
  }
  function renderArchive() {
    const logs = getLogs();
    const comps = getCompanies();

    // فیلتر بار
    const filterBar = document.getElementById('archiveCompanyFilters');
    filterBar.innerHTML = '';
    
    const allChip = document.createElement('div');
    allChip.className = `filter-chip ${archiveCompanyFilter === 'all' ? 'active' : ''}`;
    allChip.setAttribute('role', 'button'); allChip.tabIndex = 0;
    allChip.textContent = 'همه شرکت‌ها';
    allChip.onclick = () => { archiveCompanyFilter = 'all'; archiveVisible = 30; renderArchive(); };
    filterBar.appendChild(allChip);

    comps.forEach(c => {
      const chip = document.createElement('div');
      chip.className = `filter-chip ${archiveCompanyFilter === c ? 'active' : ''}`;
      chip.setAttribute('role', 'button'); chip.tabIndex = 0;
      chip.textContent = c;
      chip.onclick = () => { archiveCompanyFilter = c; archiveVisible = 30; renderArchive(); };
      filterBar.appendChild(chip);
    });

    // مدیر وقتی رکورد چند نفر در این گوشی هست، می‌تواند بر اساس شخص هم فیلتر کند
    const people = [...new Map(logs.filter(l => l.by && l.by.id).map(l => [l.by.id, l.by.name])).entries()];
    if (isAdmin() && people.length > 1) {
      [['all', 'همه افراد'], ...people].forEach(([id, name]) => {
        const chip = document.createElement('div');
        chip.className = `filter-chip ${archivePersonFilter === id ? 'active' : ''}`;
        chip.setAttribute('role', 'button'); chip.tabIndex = 0;
        chip.textContent = id === 'all' ? name : `👤 ${name}`;
        chip.onclick = () => { archivePersonFilter = id; archiveVisible = 30; renderArchive(); };
        filterBar.appendChild(chip);
      });
    } else {
      archivePersonFilter = 'all';
    }
    const filtered = archiveScopedLogs();

    // آمار (ورود و خروج جدا هم جفت و حساب می‌شوند)
    const totalMins = computeSessions(filtered).reduce((sum, x) => sum + x.mins, 0);
    document.getElementById('archiveTotalHours').textContent = formatHM(totalMins);
    document.getElementById('archiveTotalCount').textContent = `${toPersianDigits(filtered.length)} گزارش`;
    renderMonthlyReport();
    renderStorageUsage();

    // لیست لاگ‌ها
    const stream = document.getElementById('archiveStream');
    if (filtered.length === 0) {
      stream.innerHTML = '<div style="color:var(--text-dim); font-size:12px; text-align:center; padding:18px;">هیچ رکوردی برای این شرکت ثبت نشده است.</div>';
      return;
    }

    stream.innerHTML = filtered.slice(0, archiveVisible).map(item => `
      <div class="record-card-item">
        <div style="flex:1;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-weight:800; color:var(--accent-fg); font-size:13px;">${escapeHtml(item.company)}</span>
            <span style="font-size:10px; background:color-mix(in srgb, var(--fg-mix) 6%, transparent); padding:2px 6px; border-radius:6px; color:var(--text-muted);">${item.type === 'attendance' ? '🕒 تردد' : '🛠 فنی'}</span>
            ${item.geo ? '<span style="font-size:10px;" title="لوکیشن ورود ثبت شده">📍</span>' : ''}
          </div>
          <div style="font-size:11.5px; color:var(--text-muted); margin-top:3px;">
            ${item.type === 'attendance' ? escapeHtml(attendanceSummary(item)) : (item.actions ? escapeHtml(String(item.actions).length > 30 ? String(item.actions).slice(0, 30) + '…' : String(item.actions)) : 'گزارش ساپورت')}
            ${Array.isArray(item.checklist) ? ` • ✅ ${toPersianDigits(item.checklist.filter(c => c.done).length)}/${toPersianDigits(item.checklist.length)}` : ''}
          </div>
          ${item.gap && item.gap.reason ? `<div class="archive-gap">🕓 ${escapeHtml(toPersianDigits(String(item.gap.from || '')))} تا ${escapeHtml(toPersianDigits(String(item.gap.to || '')))}: ${escapeHtml(String(item.gap.reason))}</div>` : ''}
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="font-size:11px; color:var(--text-dim); text-align:left;">${escapeHtml(item.date)}</div>
          <button style="background:none; border:none; color:var(--text-dim); font-size:13px; cursor:pointer; padding:4px;" ${uiAttr('click', 'deleteLogItem', Number(item.id) || 0)} title="حذف رکورد" aria-label="حذف رکورد">🗑</button>
        </div>
      </div>
    `).join('') + (filtered.length > archiveVisible
      ? `<button class="add-comp-pill" ${uiAttr('click', 'showMoreArchive')}>نمایش بیشتر (${toPersianDigits(filtered.length - archiveVisible)} رکورد دیگر)</button>`
      : '');
  }

  function attendanceSummary(item) {
    const t = x => toPersianDigits(String(x));
    if (item.inTime && item.outTime) return `ورود ${t(item.inTime)} تا خروج ${t(item.outTime)} • مدت ${t(item.durationText || '-')}`;
    if (item.inTime) return `ورود ${t(item.inTime)} • خروج هنوز ثبت نشده`;
    if (item.outTime) return `خروج ${t(item.outTime)} (ورودش ثبت نشده)`;
    return 'مدت: ' + (item.durationText || '-');
  }

  async function deleteLogItem(id) {
    playTactileFeedback();
    const item = getLogs().find(l => l.id === id);
    if (!item || !await appConfirm(`رکورد «${item.company}» (${item.date || ''}) از آرشیو حذف شود؟`)) return;
    if (!writeLogs(getLogs().filter(l => l.id !== id))) return;
    // ورود بازِ همین رکورد هم بسته شود (وگرنه بنر و یادآوری به رکوردی اشاره می‌کردند که دیگر نیست)
    const open = readOpenEntry(); // ورود بازِ این رکورد، مال هر حسابی که باشد
    if (open && open.logId === id) {
      setOpenEntry(null);
      lastPrefillKey = '';
      renderOpenEntryBanner();
      updatePreview();
    }
    lastCommit = null;
    renderArchive();
    showToast('رکورد حذف شد');
  }

  // دانلود فایل اکسل شسته‌رفته برای شرکت فیلترشده
  function exportFilteredExcel() {
    playTactileFeedback();
    const targetComp = archiveCompanyFilter;
    const filtered = archiveScopedLogs();

    if (filtered.length === 0) {
      showToast('گزارشی برای این شرکت موجود نیست');
      return;
    }

    let csv = "\uFEFFردیف,تاریخ,روز,نام شرکت,نوع گزارش,ساعت ورود,ساعت خروج,مدت کارکرد,شرح اقدامات,کارهای باقی‌مانده,مشخصات فنی/IP,لوکیشن ورود,چک‌لیست,ثبت‌کننده,بین دو حضور\n";
    filtered.forEach((r, idx) => {
      const typeStr = r.type === 'attendance' ? 'حضور و غیاب' : 'پشتیبانی فنی';
      const geoLink = r.geo ? `https://maps.google.com/?q=${r.geo.lat},${r.geo.lng}` : '';
      const checks = Array.isArray(r.checklist) ? r.checklist.map(c => `${c.done ? '✅' : '⬜'} ${c.item}`).join(' | ') : '';
      const sup = r.type === 'support'; // رکوردهای تردد قدیمی گاهی متن فرم ساپورت را هم داشتند
      csv += [idx + 1, r.date, r.day, r.company, typeStr, r.inTime || '', r.outTime || '', r.durationText || '-', sup ? r.actions : '', sup ? r.pending : '', sup ? r.tech : '', geoLink, checks, r.by && r.by.name ? r.by.name : '', r.gap && r.gap.reason ? `${r.gap.from || ''}-${r.gap.to || ''} ${r.gap.reason}` : ''].map(csvCell).join(',') + '\n';
    });

    // نام فایل لاتین: نام فارسی در کروم به «download» بدون پسوند تبدیل می‌شد
    const who = archivePersonFilter === 'all' ? '' : '-person';
    const filename = targetComp === 'all' ? `geoteam-archive-all${who}.csv` : `geoteam-archive-company-${getCompanies().indexOf(targetComp) + 1}${who}.csv`;
    if (downloadFile(filename, csv, 'text/csv')) {
      showToast(`فایل اکسل ${targetComp === 'all' ? 'جامع' : targetComp} دانلود شد 📊`);
    }
  }

