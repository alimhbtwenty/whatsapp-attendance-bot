  // ==================== لوکیشن ورود (GPS) ====================
  // فقط وقتی ورودِ همین لحظه ثبت می‌شود (تاریخ امروز و ساعت ورود نزدیک ساعت فعلی) لوکیشن گرفته می‌شود؛
  // ثبت تردد فراموش‌شده (روزهای قبل یا ساعت دور از الان) بدون لوکیشن ارسال می‌شود
  const GEO_LIVE_WINDOW_MIN = 30;
  const GEO_MAX_AGE_MS = 3 * 60 * 1000;
  const GEO_SEND_WAIT_MS = 4500;
  let entryGeo = { status: 'idle' }; // idle | pending | ok | error
  let geoWaiters = [];
  let geoPermissionGranted = false;

  // لوکیشن ورودِ همین لحظه همیشه روشن است (تیک خاموش‌کردنش به خواست مالک حذف شد)
  function isGeoEnabled() {
    return true;
  }
  function isLiveEntry() {
    if (attendanceAction === 'out') return false;
    if (dayOffsetFromToday(currentDateObj) !== 0) return false;
    const inH = parseInt(document.getElementById('inHour').value) || 0;
    const inM = parseInt(document.getElementById('inMin').value) || 0;
    const now = new Date();
    return Math.abs(inH * 60 + inM - (now.getHours() * 60 + now.getMinutes())) <= GEO_LIVE_WINDOW_MIN;
  }
  function needsEntryGeo() {
    return isGeoEnabled() && isLiveEntry();
  }
  function hasFreshGeo() {
    return entryGeo.status === 'ok' && Date.now() - entryGeo.ts < GEO_MAX_AGE_MS;
  }
  function entryGeoLine() {
    if (!needsEntryGeo() || entryGeo.status !== 'ok') return '';
    return `📍 https://maps.google.com/?q=${entryGeo.lat.toFixed(6)},${entryGeo.lng.toFixed(6)}`;
  }

  // userAction: دکمه به‌روزرسانی (پیام و لرزش)؛ fresh: حتماً موقعیت تازه، نه کش‌شده
  function requestEntryLocation(userAction, fresh) {
    if (userAction) {
      playTactileFeedback();
      geofenceForceNext = true;
    }
    if (!navigator.geolocation) {
      entryGeo = { status: 'error', err: 'این دستگاه از لوکیشن پشتیبانی نمی‌کند' };
      updatePreview();
      return Promise.resolve(false);
    }
    const waiter = new Promise(resolve => geoWaiters.push(resolve));
    if (entryGeo.status === 'pending') return waiter;

    const finish = (ok) => {
      if (freshFixAfterPending) {
        // یک درخواست قدیمی‌تر در جریان بود؛ حالا موقعیت تازه بگیر و منتظرها با همان جواب بگیرند
        freshFixAfterPending = false;
        entryGeo = { status: 'idle' };
        requestEntryLocation(false, true);
        return;
      }
      const waiting = geoWaiters;
      geoWaiters = [];
      waiting.forEach(f => f(ok));
      updatePreview();
      if (userAction) showToast(ok ? '📍 لوکیشن ورود ثبت شد' : `⚠️ ${entryGeo.err}`);
    };
    entryGeo = { status: 'pending' };
    renderGeoRow();
    navigator.geolocation.getCurrentPosition((pos) => {
      geoPermissionGranted = true;
      entryGeo = {
        status: 'ok',
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: Math.round(pos.coords.accuracy || 0),
        ts: Date.now()
      };
      if (!freshFixAfterPending) applyGeofence();
      finish(true);
    }, (err) => {
      const msg = err && err.code === 1 ? 'اجازه دسترسی به لوکیشن داده نشد'
        : err && err.code === 3 ? 'دریافت لوکیشن طول کشید'
        : 'لوکیشن در دسترس نیست (GPS روشن است؟)';
      entryGeo = { status: 'error', err: msg };
      finish(false);
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: userAction || fresh ? 0 : 60000 });
    return waiter;
  }

  // اگر اجازه لوکیشن از قبل داده شده، بی‌صدا لوکیشن ورود را آماده نگه دار
  function maybeAutoRequestGeo() {
    if (!geoPermissionGranted || !needsEntryGeo()) return;
    if (entryGeo.status === 'idle' || (entryGeo.status === 'ok' && !hasFreshGeo())) {
      requestEntryLocation(false);
    }
  }

  // پیش از ارسال/کپی ورودِ همین لحظه، حداکثر چند ثانیه برای لوکیشن صبر کن (اجباری نیست)
  async function ensureEntryGeoBeforeSend() {
    if (!needsEntryGeo() || hasFreshGeo()) return;
    showToast('📍 در حال دریافت لوکیشن ورود...');
    const ok = await Promise.race([
      requestEntryLocation(false),
      new Promise(resolve => setTimeout(() => resolve(false), GEO_SEND_WAIT_MS))
    ]);
    if (!ok) showToast('⚠️ لوکیشن دریافت نشد');
  }

  function renderGeoRow() {
    const row = document.getElementById('geoRow');
    if (!row) return;
    const show = isGeoEnabled() && attendanceAction !== 'out';
    row.style.display = show ? 'flex' : 'none';
    if (!show) return;
    const text = document.getElementById('geoStatusText');
    const btn = document.getElementById('geoRetryBtn');
    row.classList.remove('ok', 'error');
    btn.style.display = 'inline-block';
    if (!isLiveEntry()) {
      text.textContent = '📍 لوکیشن فقط برای ورودِ همین لحظه ثبت می‌شود';
      btn.style.display = 'none';
    } else if (entryGeo.status === 'pending') {
      text.textContent = '📍 در حال دریافت لوکیشن...';
      btn.style.display = 'none';
    } else if (entryGeo.status === 'ok') {
      const fence = fenceStatus();
      if (fence && !fence.inside) {
        row.classList.add('warn');
        text.textContent = `⚠️ ${toPersianDigits(fence.distance)} متر بیرون از محدوده «${selectedCompany}»`;
      } else {
        row.classList.add('ok');
        text.textContent = fence
          ? `📍 داخل محدوده «${selectedCompany}» (دقت ±${toPersianDigits(entryGeo.acc)} متر)`
          : `📍 لوکیشن ورود ثبت شد (دقت ±${toPersianDigits(entryGeo.acc)} متر)`;
      }
      btn.textContent = '🔄 به‌روزرسانی';
    } else if (entryGeo.status === 'error') {
      row.classList.add('error');
      text.textContent = `⚠️ ${entryGeo.err}`;
      btn.textContent = 'تلاش دوباره';
    } else {
      text.textContent = '📍 لوکیشن هنگام ارسال ورود گرفته می‌شود';
      btn.textContent = '📍 دریافت';
    }
  }

