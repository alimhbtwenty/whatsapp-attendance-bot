// ورود به برنامه در تست‌ها: اگر تیمی نیست حساب مدیر ساخته می‌شود، وگرنه با شماره و رمز وارد می‌شود
const ADMIN = { name: 'مدیر تست', phone: '09120000001', pw: 'admin-pass-1' };
async function login(p, who = ADMIN) {
  await p.waitForSelector('#appLock', { state: 'attached' });
  if (!(await p.locator('#appLock.open').count())) return;
  if (await p.locator('#lockName').count()) {
    await p.fill('#lockName', who.name);
    await p.fill('#lockPhone', who.phone);
    await p.fill('#lockPw', who.pw);
    await p.fill('#lockPw2', who.pw);
  } else {
    if (await p.locator('#lockPhone').count()) await p.fill('#lockPhone', who.phone);
    await p.fill('#lockPw', who.pw);
  }
  await p.click('#lockSubmit');
  await p.waitForFunction(() => !document.getElementById('appLock').classList.contains('open'), null, { timeout: 15000 });
}
// باز کردن پرونده فنی با رمز همان کاربر
async function unlockTech(p, pw = ADMIN.pw) {
  await p.click('[data-act="unlock-pw"]');
  await p.fill('#vaultPw1', pw);
  await p.click('#vaultModalOk');
  await p.waitForFunction(() => techUnlocked(), null, { timeout: 15000 });
}
module.exports = { login, unlockTech, ADMIN };
