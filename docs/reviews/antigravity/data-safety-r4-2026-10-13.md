# بازبینی دور ۴: ایمنی داده (data-safety)
تاریخ: ۱۴۰۵/۰۷/۲۲ (2026-10-14)
برنچ: `antigravity/data-safety-r4-2026-10-13`

## جدول یافته‌ها

| # | Severity (high/medium/low) | Where (file:line) | Steps → wrong result | Test (file + FAIL line) | Fixed? (commit) |
|---|---|---|---|---|---|
| ۱ | high | `src/js/06-geofence-archive.js:529,548` | کاربر در تب آرشیو تردد دکمه حذف رکورد «کرانه» (بدون `by.id`) را می‌زند؛ به دلیل وجود یک رکورد ساپورت همکار با همان `id` و بررسی شرط `!byId`، رکورد ساپورت همکار تطبیق داده شده و حذف می‌شود و رکورد تردد دست‌نخورده می‌ماند. | `tests/e2e/data-safety-r4-audit.js`<br>`FAIL delete prompt for attendance with duplicate id names correct company رکورد «صدف» (۱۴۰۵/۰۷/۲۱) از آرشیو حذف شود؟`<br>`FAIL attendance record deleted with duplicate id attRemains: true, supSurvives: false` | بله (تطبیق دقیق `type` و تفکیک `byId` خالی از مقدار تعریف‌نشده) |
| ۲ | high | `src/js/06-geofence-archive.js:557-563` | کاربر دارای یک ورود باز فعال تردد با `logId: X` است؛ در آرشیو ساپورت یک رکورد ساپورت واردشده از همکار با همان `id: X` را حذف می‌کند؛ تابع `deleteLogItem` بدون بررسی نوع رکورد (`item.type === 'attendance'`)، ورود باز فعال کاربر را بی‌صدا می‌بندد و بنر و یادآوری خروج را پاک می‌کند. | `tests/e2e/data-safety-r4-audit.js`<br>`FAIL deleting support record does not close attendance open entry with same id {"open":null,"banner":false}` | بله (محدود کردن بستن ورود باز فقط به رکوردهای از نوع `attendance`) |
| ۳ | medium | `src/js/05-open-entry-reminder.js:90-93`, `src/js/06-geofence-archive.js:557` | پس از ارتقا از نسخه ۱.۱ (که ورود باز فیلد `ts` دارد نه `logId`)، کاربر رکورد تردد مربوطه را حذف می‌کند؛ به دلیل عدم تطبیق `open.logId === id`، ورود باز پاک نمی‌شود و بنر ورود باز برای رکوردی که حذف شده باز می‌ماند. | `tests/e2e/data-safety-r4-audit.js`<br>`FAIL deleting legacy attendance record clears open entry with ts field {"open":{"company":"هاستیدا","dateISO":"2026-10-11","inTime":"09:30","ts":1791698418581,"notified":false},"banner":true}` | بله (نرمال‌سازی خودکار `ts` به `logId` در `readOpenEntry`) |
| ۴ | high | `src/js/08-backup.js:84-90` | هنگام بازگردانی فایل پشتیبان، اگر حافظه پر باشد و عملیات پس از نوشتن چند کلید متوقف شود، رول‌بک تک‌مرحله‌ای قدیمی نمی‌تواند کلیدهای پاک‌شده قبلی را بنویسد چون کلیدهای بزرگ‌شده جدید فضا را پر نگه داشته‌اند؛ در نتیجه کلیدهای قبلی (مانند `geomat_sites_v1`) برای همیشه پاک شده و داده کاربر از بین می‌رود. | `tests/e2e/data-safety-r4-audit.js`<br>`FAIL failed backup restore keeps pre-existing sites key (no silent drop) sitesAfter: null`<br>`FAIL failed backup restore restores original chat key instead of partial incoming chatAfter: چچچچ...` | بله (پیاده‌سازی رول‌بک ۲مرحله‌ای مانند نسخه دوم روی دیسک) |

## بررسی‌شده و بدون مشکل (Checked and found fine)

۱. **ارتقا از تمام نسخه‌های قدیمی (`tests/fixtures/storage-v1.1.json` تا `v1.4p`):**
   - مهاجرت ادغام شیفت‌های دونیم‌شده (`mergeLegacySplitStays`) رکوردهای تردد را بدون تغییر دقایق حفظ می‌کند (۴۴ تست پاس در `upgrade-from-old-versions.js`).
   - پشتیبان پیش از به‌روزرسانی (`geomat_backup_pre_1_4`) به درستی ذخیره شده و رول‌بک آن بدون مشکل کار می‌کند.

۲. **دوام داده و ری‌استارت با وارد کردن فایل‌ها (Durable Mirror):**
   - وارد کردن گزارش‌های ساپورت تیم (`addTeamArchiveRecords`) به درستی در نسخه دوم روی دیسک ثبت شده و پس از قطع برق/ری‌استارت گوشی به طور کامل بازیابی می‌شود (تست ۵ در `data-safety-r4-audit.js`).
   - نسخه ناقص دیسک هرگز داده‌های محلی را رول‌بک یا رونویسی نمی‌کند و در اجرای بعدی بازسازی می‌شود.

۳. **پر بودن فضای ذخیره‌سازی (~۵٫۲ مگابایت):**
   - پر بودن حافظه هنگام ورود آرشیو تیم از طریق `storeItem` کپی پیش از به‌روزرسانی را در صورت نیاز آزاد می‌کند.
   - ورود فایل‌های بزرگتر از ظرفیت سقف (`LOGS_MAX = 5000`) به درستی با پیام خطا رد می‌شود و رکوردهای قدیمی‌تر را کوتاه نمی‌کند.
