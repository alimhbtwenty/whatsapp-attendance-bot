# Jules (ایجنت ابری گوگل) برای تست و باگ‌یابی Geo Team

Jules در ماشین ابری گوگل روی خود ریپوی GitHub کار می‌کند؛ روی لپ‌تاپ چیزی اجرا نمی‌شود. هر کار (task) یک برنچ جدا می‌سازد و Claude Code بعداً برنچ‌ها را بررسی می‌کند.

## ۱. راه‌اندازی (یک بار)
1. jules.google را باز کنید و با حساب گوگل وارد شوید.
2. **Connect to GitHub** ← اپ Jules را فقط روی ریپوی `alimhbtwenty/whatsapp-attendance-bot` نصب کنید (Only select repositories).
3. ریپو را انتخاب کنید ← **Configuration / Environment** ← در «Setup script» این را بگذارید و Run and snapshot بزنید:
   ```
   npm ci
   npx playwright install --with-deps chromium
   npm test
   ```
   آخر خروجی باید `all N test files passed` باشد.

## ۲. ساختن هر کار
1. بالای صفحه ریپو `alimhbtwenty/whatsapp-attendance-bot` و برنچ **`ccr-6b68bcdc-nwkjfb`** را انتخاب کنید (نه main).
2. متن پرامپت را بچسبانید و Give me a plan / Start بزنید.
3. Jules اول یک «طرح» نشان می‌دهد ← **Approve plan**.
4. آخر کار ← **Publish branch** (نه Create PR). اسم برنچ را برای Claude بفرستید.

نسخه رایگان در روز تعداد کار و کار هم‌زمان محدود دارد؛ اگر نشد، کارها را چند تا چند تا بفرستید.
