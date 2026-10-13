  // ==================== آرشیو ساپورت تیم (فایل) ====================
  // تا وقتی سرور نیست، گزارش‌های ساپورتِ هر نفر با یک فایل به گوشی بقیه (تکنسین‌ها و مدیر) می‌رسد (ADR-0004).
  // - خروجی: فقط گزارش‌های ساپورتِ خودِ کاربر؛ هیچ‌وقت پرونده فنی، رمز یا تردد
  // - ورود: فقط اضافه می‌شود؛ هیچ رکوردی عوض یا حذف نمی‌شود. کلید یکتا by.id|id است،
  //   چون id زمان ثبت است و بین دو گوشی می‌تواند تکراری باشد
  // همین شکل رکورد و کلید، قرارداد همگام‌سازی آینده با سرور است (docs/data-model.md)
  const TEAM_ARCHIVE_KIND = 'team-archive';
  const TEAM_ARCHIVE_MAX_BYTES = 2 * 1024 * 1024;
  const TEAM_ARCHIVE_MAX_RECORDS = 2000;
  const archiveRecordKey = (l) => `${l.by && l.by.id ? l.by.id : ''}|${l.id}`;

  const shortStr = (v, max) => typeof v === 'string' && v.length <= max ? v : null;
  function cleanWho(w) {
    const id = w && shortStr(w.id, 64);
    const name = w && shortStr(w.name, 60);
    return id && name !== null ? { id, name } : null;
  }
  // فقط فیلدهای شناخته‌شده گزارش ساپورت، با نوع و اندازه درست؛ هر چیز دیگری از فایل دور ریخته می‌شود
  function cleanSupportRecord(r) {
    if (!r || typeof r !== 'object' || r.type !== 'support') return null;
    const id = Number(r.id);
    const by = cleanWho(r.by);
    const company = shortStr(r.company, 80);
    const dateISO = shortStr(r.dateISO, 10);
    if (!Number.isSafeInteger(id) || id <= 0 || !by || !company || !dateISO || !isoToDate(dateISO) || toISODate(isoToDate(dateISO)) !== dateISO) return null; // ۲۰۲۶-۱۳-۴۵ هم Date می‌سازد
    const jy = Number(r.jy), jm = Number(r.jm), jd = Number(r.jd);
    if (![jy, jm, jd].every(Number.isInteger) || jy < 1300 || jy > 1600 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
    const text = shortStr(r.text, 20000);
    if (text === null) return null;
    const field = (k) => shortStr(r[k] === undefined ? '' : r[k], 5000);
    const actions = field('actions'), pending = field('pending'), tech = field('tech');
    if (actions === null || pending === null || tech === null) return null;
    let checklist = null;
    if (Array.isArray(r.checklist)) {
      if (r.checklist.length > 100) return null;
      checklist = r.checklist.map(c => c && shortStr(c.item, 200) !== null ? { item: c.item, done: c.done === true } : null);
      if (checklist.some(c => !c)) return null;
    }
    return {
      id, by, type: 'support', company,
      date: shortStr(r.date, 40) || '', day: shortStr(r.day, 40) || '',
      dateISO, jy, jm, jd,
      action: null, inTime: null, outTime: null, geo: null, durationMins: 0, durationText: '-',
      text, actions, pending, tech, checklist
    };
  }

  function exportTeamArchive() {
    playTactileFeedback();
    if (!session) return;
    const mine = getLogs().filter(l => l.type === 'support' && !l.imported && l.by && l.by.id === session.user.id);
    const records = mine.map(cleanSupportRecord).filter(Boolean).slice(0, TEAM_ARCHIVE_MAX_RECORDS);
    if (!records.length) { showToast('هنوز گزارش ساپورتی از شما در آرشیو نیست'); return; }
    const file = { app: BACKUP_APP_ID, kind: TEAM_ARCHIVE_KIND, v: 1, exportedAt: new Date().toISOString(), from: sessionWho(), records };
    if (downloadFile(`geoteam-support-${toISODate(new Date())}.json`, JSON.stringify(file), 'application/json')) {
      showToast(`📤 ${toPersianDigits(records.length)} گزارش ساپورت در فایل آرشیو تیم؛ آن را برای مدیر یا تیم بفرستید`);
    }
  }

  function openTeamArchivePicker() {
    if (!session) return;
    document.getElementById('teamArchiveInput').click();
  }
  function importTeamArchive(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file || !session) return;
    if (file.size > TEAM_ARCHIVE_MAX_BYTES) { showToast('⚠️ فایل آرشیو تیم خیلی بزرگ است'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      let obj = null;
      try { obj = JSON.parse(String(reader.result || '')); } catch(e) {}
      if (!obj || obj.app !== BACKUP_APP_ID || obj.kind !== TEAM_ARCHIVE_KIND || obj.v !== 1 || !Array.isArray(obj.records) || obj.records.length > TEAM_ARCHIVE_MAX_RECORDS) {
        showToast('⚠️ این فایل، آرشیو تیم Geo Team نیست');
        return;
      }
      if (!session) return; // وسط خواندن فایل قفل شد
      const result = addTeamArchiveRecords(obj.records, cleanWho(obj.from));
      if (result.error) { showToast(`⚠️ ${result.error}`); return; }
      renderArchive();
      const extra = [result.skipped ? `${toPersianDigits(result.skipped)} تکراری` : '', result.bad ? `${toPersianDigits(result.bad)} نامعتبر` : ''].filter(Boolean).join('، ');
      showToast(`📥 ${toPersianDigits(result.added)} گزارش ساپورت به آرشیو اضافه شد${extra ? ` (${extra})` : ''}`);
    };
    reader.onerror = () => showToast('⚠️ خواندن فایل ممکن نشد');
    reader.readAsText(file);
  }
  // رکوردهای تازه به ترتیب زمان لای آرشیو می‌روند؛ ترتیب رکوردهای فعلی دست نمی‌خورد
  function addTeamArchiveRecords(records, from) {
    const logs = getLogs();
    const have = new Set(logs.map(archiveRecordKey));
    const at = new Date().toISOString();
    const fresh = [];
    let skipped = 0, bad = 0;
    for (const r of records) {
      const c = cleanSupportRecord(r);
      if (!c) { bad++; continue; }
      const k = archiveRecordKey(c);
      if (have.has(k)) { skipped++; continue; }
      have.add(k);
      c.imported = { at, from };
      fresh.push(c);
    }
    if (!fresh.length) return { added: 0, skipped, bad };
    // writeLogs برای جا باز کردن قدیمی‌ترین رکوردها را کنار می‌گذارد؛ ورود فایل هرگز نباید باعث آن شود
    if (logs.length + fresh.length > LOGS_MAX) return { error: 'آرشیو این گوشی جای این همه گزارش را ندارد' };
    fresh.sort((a, b) => b.id - a.id);
    const out = [];
    let i = 0;
    for (const l of logs) {
      while (i < fresh.length && fresh[i].id > (Number(l.id) || 0)) out.push(fresh[i++]);
      out.push(l);
    }
    while (i < fresh.length) out.push(fresh[i++]);
    try {
      storeItem('geomat_logs_v2', JSON.stringify(out));
    } catch(e) {
      return { error: 'حافظه پر است؛ فایل وارد نشد و آرشیو دست نخورد' };
    }
    return { added: fresh.length, skipped, bad };
  }
