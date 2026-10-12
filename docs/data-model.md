# مدل داده (قرارداد اپ ↔ پنل/سرور آینده)

همه داده‌ها فعلاً در `localStorage` گوشی است (کلیدهای `geomat_*`) و فایل پشتیبان همین کلیدها را به‌صورت JSON دارد. API سرور در آینده باید همین ساختار را بپذیرد/برگرداند.

## آرشیو تردد و ساپورت — `geomat_logs_v2`
آرایه، جدیدترین اول. هر حضور **یک** رکورد است: ورود رکورد می‌سازد، خروج همان را کامل می‌کند (ADR-0001).

| فیلد | توضیح |
|---|---|
| `id` | عدد یکتا (میلی‌ثانیه) |
| `type` | `attendance` یا `support` |
| `company` | نام شرکت/محل |
| `date`, `day` | تاریخ شمسی با رقم فارسی و روز هفته (فقط نمایش) |
| `dateISO`, `jy`, `jm`, `jd` | تاریخ برای مقایسه و گزارش |
| `action` | `in` / `out` / `both` |
| `inTime`, `outTime` | `HH:MM` یا `null` |
| `durationMins`, `durationText` | مدت حضور (فقط وقتی هر دو ساعت هست) |
| `geo` | `{lat,lng,acc}` لوکیشن ورود یا `null` |
| `text`, `outText` | متن پیام ورود و پیام خروج |
| `closedAt` | زمان ثبت خروج |
| `actions`, `pending`, `tech`, `checklist` | فیلدهای گزارش ساپورت |

## پرونده فنی شرکت‌ها — `geomat_inventory_v1`
```json
{ "schema": 2,
  "companies": [ { "id": "uuid", "name": "مشتری دور", "deleted": false, "createdAt": "ISO",
                   "createdBy": { "id": "...", "name": "..." },
                   "history": [ { "at": "ISO", "by": { "id": "...", "name": "..." }, "action": "create|restore", "name": "..." } ] } ],
  "items": [ {
    "id": "uuid-v4",
    "company": "کرانه",
    "section": "network | access | remotes | hosts | servers | apps | users",
    "data": { "...": "متن ساده، فیلدها طبق بخش" },
    "secrets": { "password": { "v": 1, "iv": "base64", "ct": "base64" } },
    "createdAt": "ISO", "updatedAt": "ISO", "updatedBy": { "id": "...", "name": "..." },
    "deleted": false,
    "history": [ { "at": "ISO", "by": { "id": "...", "name": "..." }, "action": "create|edit|delete|restore",
                   "data": { }, "secrets": { } } ]
  } ] }
```
- `companies` فقط پرونده‌هایی است که در خود پرونده فنی ساخته شده‌اند. محل‌های تردد (`geomat_companies_v2`) هم خودکار پرونده دارند.
- فیلدهای هر بخش در `INV_SECTIONS` داخل `index.html` تعریف شده‌اند. فیلدهای `ref` (میزبانِ سرور، سرورِ برنامه) `id` آیتم دیگر را نگه می‌دارند.
- **`history` فقط-افزودنی است:** هر تغییر با `pushVersion()` یک نسخه کامل اضافه می‌کند و آخرین نسخه همان وضع فعلی است. حذف نرم است (`deleted: true` به‌اضافه نسخه «delete»).
- **همگام‌سازی آینده:** ادغام بر اساس `id` آیتم و اجتماع نسخه‌های `history` (کلید: `at` + `by.id`) انجام می‌شود. سرور هیچ نسخه‌ای را پاک نمی‌کند.
- فیلترها از داده ساخته می‌شوند: دامین/ورک‌گروپ از `network.kind`، ESXi از `hosts.hypervisor`.

## حساب‌ها — `geomat_team_v1`
```json
{ "schema": 1,
  "users": [ { "id": "uuid", "name": "رضا", "role": "admin | tech", "active": true,
               "salt": "base64(16B)", "iter": 310000, "wrapped": { "v": 1, "iv": "...", "ct": "..." },
               "createdAt": "ISO", "createdBy": { "id": "...", "name": "..." } } ],
  "log": [ { "at": "ISO", "by": { }, "action": "team-create|user-add|user-enable|user-disable|password|team-import", "detail": "..." } ] }
```
- `wrapped` همان «کلید تیم» (۳۲ بایت تصادفی، AES-GCM-256) است که با کلیدِ ساخته‌شده از رمز همان نفر (PBKDF2-SHA256) رمز شده. همه `secrets` با کلید تیم رمز می‌شوند.
- «فایل تیم» (`{app, kind:"team", team}`) همین `users` است، بدون `log` و بدون هیچ رمزی.
- `geomat_vault_fail_v1`: شمارنده رمز اشتباه (بعد از ۵ بار، ۳۰ ثانیه صبر).
- `geomat_vault_meta_v1`: فقط در پیش‌نمایش اول 1.4 بود (یک رمز اصلی). با اولین ورود مدیر منتقل و پاک می‌شود.

## تنظیمات — `geomat_settings_v1`
`{ reminderTime, workStart: "09:00", workEnd: "17:00", thuEnd: "14:00", holidays: ["YYYY-MM-DD", ...] }`. گزارش ماهانه اضافه‌کار و کسر کار را از همین‌ها حساب می‌کند (ADR-0001 بند ۱۰).
