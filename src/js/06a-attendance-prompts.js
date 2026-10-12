  // ==================== پرسش‌های پیش از ارسال تردد (درخواست مالک) ====================
  // ۱) «فقط خروج» بدون ورودِ ثبت‌شده: ساعت ورود پرسیده می‌شود تا پیام یک دوره کامل شود (یا «بدون ورود ارسال کن»)
  // ۲) ورودِ تازه بعد از خروجِ همان روز: «بین این دو حضور کجا بودید؟»؛ فقط در آرشیو و گزارش‌ها می‌آید، نه در پیام
  const GAP_REASONS = ['در راه / ایاب و ذهاب', 'در انتظار خبر / هماهنگی', 'خرید قطعه / کار اداری بیرون'];
  let flowResolver = null;
  let pendingGap = null; // { from, to, reason } برای رکورد تازه‌ای که همین الان ساخته می‌شود

  function openFlowModal(html, focusSel) {
    if (flowResolver) resolveFlowModal(null);
    document.getElementById('flowModalBox').innerHTML = html;
    document.getElementById('flowModal').classList.add('open');
    setTimeout(() => { const el = focusSel && document.querySelector(focusSel); if (el) el.focus(); }, 80);
    return new Promise(resolve => { flowResolver = resolve; });
  }
  function resolveFlowModal(value) {
    document.getElementById('flowModal').classList.remove('open');
    document.getElementById('flowModalBox').innerHTML = '';
    const r = flowResolver;
    flowResolver = null;
    if (r) r(value);
  }
  function flowError(msg) {
    const el = document.getElementById('flowErr');
    if (el) el.textContent = msg;
  }

  // ---------- ۱) خروج بدون ورود ----------
  function askMissingEntry(outTime) {
    const start = /^\d{2}:\d{2}$/.test(getSettings().workStart) ? getSettings().workStart : '09:00';
    return openFlowModal(`
      <div class="flow-title">⚠️ ورود ثبت نشده</div>
      <div class="flow-hint">برای «${escapeHtml(selectedCompany)}» امروز ورودی ثبت نشده است. ساعت ورود را بزنید تا پیام یک دوره کامل باشد (ورود تا خروج ${escapeHtml(toPersianDigits(outTime))}).</div>
      <label class="flow-time"><span>🟢 ساعت ورود</span><input type="time" id="flowInTime" dir="ltr" value="${escapeHtml(start)}"></label>
      <div class="flow-err" id="flowErr" role="alert"></div>
      <button class="install-btn flow-main" ${uiAttr('click', 'submitMissingEntry')}>ثبت دوره کامل</button>
      <button class="dock-copy-btn flow-alt" ${uiAttr('click', 'resolveFlowModal', 'skip')}>بدون ورود ارسال کن</button>
      <button class="lock-link" ${uiAttr('click', 'resolveFlowModal', null)}>انصراف</button>`, '#flowInTime');
  }
  function submitMissingEntry() {
    const v = (document.getElementById('flowInTime').value || '').trim();
    if (!/^\d{2}:\d{2}$/.test(v)) { flowError('ساعت ورود را بزنید'); return; }
    if (parseHM(v) >= parseHM(timeInputValue('out'))) { flowError(`ساعت ورود باید پیش از خروج (${toPersianDigits(timeInputValue('out'))}) باشد`); return; }
    resolveFlowModal({ inTime: v });
  }

  // ---------- ۲) فاصله بین دو حضورِ یک روز ----------
  // آخرین خروجِ همان روز (همان حساب) که پیش از این ورود است
  function previousExitToday(inTime) {
    const iso = toISODate(currentDateObj);
    const inMins = parseHM(inTime);
    let best = null;
    for (const l of getLogs()) {
      if (!l || l.type !== 'attendance' || l.dateISO !== iso || !l.outTime) continue;
      if (l.by && otherPersons(l.by.id)) continue;
      const out = parseHM(l.outTime);
      if (out === null || out >= inMins) continue;
      if (l.inTime && parseHM(l.inTime) > out) continue; // شیفت شب: خروجش مال فرداست
      if (!best || out > parseHM(best.outTime)) best = l;
    }
    return best;
  }
  function askGapReason(from, to) {
    const t = (x) => escapeHtml(toPersianDigits(x));
    return openFlowModal(`
      <div class="flow-title">🕓 بین دو حضور کجا بودید؟</div>
      <div class="flow-hint">از خروج ${t(from)} تا این ورود ${t(to)}. فقط در آرشیو و گزارش‌ها ثبت می‌شود، نه در پیام واتساپ.</div>
      <div class="flow-chips">${GAP_REASONS.map((r, i) => `<button class="flow-chip" ${uiAttr('click', 'pickGapReason', i)}>${escapeHtml(r)}</button>`).join('')}</div>
      <div class="flow-custom">
        <input type="text" class="cyber-input" id="flowGapText" maxlength="120" placeholder="یا خودتان بنویسید…" aria-label="کجا بودید؟ (متن دلخواه)">
        <button class="dock-copy-btn" ${uiAttr('click', 'submitGapText')}>ثبت</button>
      </div>
      <div class="flow-err" id="flowErr" role="alert"></div>
      <button class="lock-link" ${uiAttr('click', 'resolveFlowModal', 'skip')}>رد شدن</button>`);
  }
  function pickGapReason(i) {
    if (GAP_REASONS[i]) resolveFlowModal({ reason: GAP_REASONS[i] });
  }
  function submitGapText() {
    const v = document.getElementById('flowGapText').value.replace(/\s+/g, ' ').trim();
    if (!v) { flowError('یکی از گزینه‌ها را بزنید یا چیزی بنویسید'); return; }
    resolveFlowModal({ reason: v });
  }

  // در prepareReport، پیش از ساختن متن تردد. null یعنی ارسال لغو شد.
  async function attendancePromptsBeforeSend() {
    pendingGap = null;
    if (attendanceAction === 'out' && !pairedEntry()) {
      const r = await askMissingEntry(timeInputValue('out'));
      if (!r || !session) return false; // انصراف، دکمه برگشت، یا قفل شدن برنامه
      if (r !== 'skip') {
        setAttendanceAction('both');
        const [h, m] = r.inTime.split(':');
        document.getElementById('inHour').value = h;
        document.getElementById('inMin').value = m;
        updatePreview();
      }
    }
    // فقط رکوردِ تازه (ورود یا دوره کامل)، نه خروجی که ورودِ ثبت‌شده را کامل می‌کند
    if (attendanceAction !== 'out' && !closesRecordedEntry()) {
      const inTime = timeInputValue('in');
      const prev = previousExitToday(inTime);
      if (prev) {
        const r = await askGapReason(prev.outTime, inTime);
        // null = برگشت، لمس بیرون پنجره یا قفل شدن برنامه → ارسال لغو؛ «رد شدن» = 'skip'
        if (r === null || !session) return false;
        if (r.reason) pendingGap = { from: prev.outTime, to: inTime, reason: r.reason };
      }
    }
    return true;
  }

  // ---------- آزمایش اعلان (تنظیمات، فقط اپ اندروید) ----------
  function testExitNotification() {
    const br = window.AndroidBridge;
    if (!br || typeof br.testNotification !== 'function') return;
    if (typeof br.notificationPermission === 'function' && br.notificationPermission() !== 'granted') {
      br.requestNotificationPermission();
      showToast('اول اجازه اعلان را بدهید و دوباره «آزمایش» را بزنید');
      return;
    }
    br.testNotification();
    showToast('🔔 تا ۱۰ ثانیه دیگر اعلان می‌آید (برنامه را هم می‌توانید ببندید)');
  }
  function openAppBatterySettings() {
    const br = window.AndroidBridge;
    if (br && typeof br.openBatterySettings === 'function') br.openBatterySettings();
  }
