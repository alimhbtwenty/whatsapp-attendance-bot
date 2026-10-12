  // ==================== رویدادهای رابط (بدون onclick داخل HTML) ====================
  // همه رویدادها از یک‌جا و فقط به تابع‌های این فهرست می‌رسند؛ با این کار CSP می‌تواند هر اسکریپت تزریق‌شده را ببندد
  // قالب: data-click='["نام‌تابع", آرگومان‌ها...]'؛ "$this" = خود عنصر، "$event" = رویداد، "$value" = مقدار عنصر
  const UI_ACTION_NAMES = ["addChecklistItem", "addHoliday", "appendSupportTag", "attachCurrentReportToChat", "changeDateByDays", "changeMyPassword", "chatActionCopy", "chatActionDelete", "chatActionWhatsApp", "checklistKeydown", "clearChatHistory", "closeAddModal", "closeCalendar", "closeChatActions", "closeInvItemModal", "closeInvPanel", "closeOutbox", "createInvCompany", "deleteLogItem", "disableBiometric", "discardOpenEntry", "enableBiometric", "executeCopyText", "executeSendWhatsApp", "exportBackup", "exportFilteredExcel", "exportMonthlyCsv", "filterChatRoom", "handleDigitInput", "handleDigitKeydown", "handleDigitPaste", "importTeamFile", "loginApp", "loginWithBiometric", "logoutApp", "openAccountPanel", "openAddModal", "openAttendanceCalendar", "openOutbox", "openRestorePicker", "openSupportCalendar", "openTeamFilePicker", "padZeroOnBlur", "pickCalendarDate", "pickCalendarToday", "removeHoliday", "renderInventory", "requestEntryLocation", "resolveConfirm", "resolveVaultModal", "restoreBackupFromInput", "restorePreUpdateBackup", "saveInvItem", "saveNewProjectFromModal", "saveSettingField", "scrollChatToBottom", "sendChatMessage", "setAttendanceAction", "setDateOffset", "setSpecificNow", "setSupportDateOffset", "setSupportView", "setupAdmin", "shiftCalendarMonth", "shiftReportMonth", "showMoreArchive", "startExitForOpenEntry", "submitVaultModal", "switchSystemMode", "toggleEditLocations", "toggleLegacyLogin", "updatePreview", "updateSupportPreview"];
  const UI_EVENT_ATTRS = { click: 'click', input: 'input', change: 'change', keydown: 'keydown', paste: 'paste', focusout: 'blur' };
  Object.keys(UI_EVENT_ATTRS).forEach(type => document.addEventListener(type, (e) => {
    const attr = 'data-' + UI_EVENT_ATTRS[type];
    const el = e.target && e.target.closest ? e.target.closest(`[${attr}]`) : null;
    if (!el) return;
    if (type === 'click' && el.hasAttribute('data-self-only') && e.target !== el) return;
    let spec;
    try { spec = JSON.parse(el.getAttribute(attr)); } catch(err) { return; }
    if (!Array.isArray(spec) || !UI_ACTION_NAMES.includes(spec[0]) || typeof window[spec[0]] !== 'function') return;
    window[spec[0]](...spec.slice(1).map(a => a === '$this' ? el : a === '$event' ? e : a === '$value' ? el.value : a));
  }));
  function uiAttr(type, fn, ...args) {
    return `data-${type}="${escapeHtml(JSON.stringify([fn, ...args]))}"`;
  }
  function showMoreArchive() {
    archiveVisible += 30;
    renderArchive();
  }
  function checklistKeydown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addChecklistItem();
  }
  function openRestorePicker() {
    document.getElementById('restoreInput').click();
  }

  window.onload = init;
