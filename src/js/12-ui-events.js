  // ==================== رویدادهای رابط (بدون onclick داخل HTML) ====================
  // همه رویدادها از یک‌جا و فقط به تابع‌های این فهرست می‌رسند؛ با این کار CSP می‌تواند هر اسکریپت تزریق‌شده را ببندد
  // قالب: data-click='["نام‌تابع", آرگومان‌ها...]'؛ "$this" = خود عنصر، "$event" = رویداد، "$value" = مقدار عنصر
  const UI_ACTION_NAMES = ["addChecklistItem", "addHoliday", "appendSupportTag", "attachCurrentReportToChat", "changeDateByDays", "chatActionCopy", "chatActionDelete", "chatActionWhatsApp", "checklistKeydown", "clearChatHistory", "closeAddModal", "closeCalendar", "closeChatActions", "closeInvItemModal", "closeInvPanel", "closeOutbox", "closeUserModal", "createInvCompany", "deleteLogItem", "discardOpenEntry", "executeCopyText", "executeSendWhatsApp", "exportBackup", "exportFilteredExcel", "exportMonthlyCsv", "filterChatRoom", "handleDigitInput", "handleDigitKeydown", "handleDigitPaste", "importTeamFile", "openAddModal", "openAttendanceCalendar", "openOutbox", "openRestorePicker", "openSupportCalendar", "openUserModal", "padZeroOnBlur", "pickCalendarDate", "pickCalendarToday", "removeHoliday", "renderInventory", "requestEntryLocation", "resolveConfirm", "resolveVaultModal", "restorePreUpdateBackup", "restoreBackupFromInput", "saveInvItem", "saveNewProjectFromModal", "saveSettingField", "saveUserName", "scrollChatToBottom", "sendChatMessage", "setAttendanceAction", "setDateOffset", "setSpecificNow", "setSupportDateOffset", "setSupportView", "shiftCalendarMonth", "shiftReportMonth", "showMoreArchive", "startExitForOpenEntry", "submitVaultModal", "switchSystemMode", "toggleEditLocations", "updatePreview", "updateSupportPreview"];
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
