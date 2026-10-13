# کار با Antigravity: تست و باگ‌یابی با چند ایجنت

Antigravity کارهای سنگین (تست و باگ‌یابی از چند جهت) را با چند ایجنت هم‌زمان انجام می‌دهد. هر ایجنت روی برنچ خودش کار می‌کند و یک گزارش و چند تست می‌نویسد. بعد نام برنچ‌ها را به Claude Code بدهید تا بررسی، رفع و ادغام کند.

همه قواعد در خود ریپوست:
- `AGENTS.md`: قواعد سخت ایجنت‌ها؛
- `.agent/rules/geo-team.md`: قاعده همیشه‌روشن برای Antigravity؛
- `.agent/workflows/qa-*.md`: کار هر ایجنت.

## ۱. آماده‌سازی (یک بار، روی لپ‌تاپ)
1. **نصب:** Git، Node.js 22 و Python 3. برای ایجنت اندروید، اگر خواستید APK هم بسازد: Android Studio.
2. **ویندوز (پیش از هر چیز):**
   - PowerShell عادی باز کنید، نه Administrator.
   - یک بار اجرای اسکریپت را برای کاربر خودتان آزاد کنید. وگرنه خطای `npm.ps1 cannot be loaded because running scripts is disabled` می‌آید:
     ```
     Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
     ```
     (راه دیگر: به‌جای `npm` و `npx` بنویسید `npm.cmd` و `npx.cmd`.)
   - ریپو را در پوشه خودتان بگیرید (`cd $HOME`، بعد `mkdir Projects` و `cd Projects`)، نه در `C:\Windows\System32`؛ پنجره Administrator به‌طور پیش‌فرض آن‌جا باز می‌شود.
   - **اینترنت:** لپ‌تاپ از PdaNext (آداپتور شبکه USB، گوشی مسیریاب است و VPN گوشی کل لپ‌تاپ را هم می‌پوشاند) وصل می‌شود. **هیچ پروکسی لازم نیست.** اگر قبلاً برای npm پروکسی گذاشته‌اید، پاکش کنید: `npm config delete proxy` و `npm config delete https-proxy`.
3. **گرفتن ریپو در ترمینال:**
   ```bash
   git clone https://github.com/alimhbtwenty/whatsapp-attendance-bot.git
   cd whatsapp-attendance-bot
   git checkout ccr-6b68bcdc-nwkjfb
   npm ci
   npx playwright install chromium
   npm test
   ```
   آخرِ `npm test` باید بنویسد `all N test files passed`. اگر ننوشت، همان خروجی را برای Claude بفرستید.
4. **باز کردن در Antigravity:** File ← Open Folder ← همین پوشه. یک بار هم Settings ← Customizations ← Rules را باز کنید؛ باید `geo-team` آن‌جا باشد.

## ۲. اجرای ایجنت‌ها (Agent Manager)
در Agent Manager برای هر نقش یک ایجنت تازه بسازید (New Agent، روی همین workspace). متن زیر را بفرستید و فقط اسم workflow را عوض کنید. پنج نقش هست؛ می‌توانید همه را با هم اجرا کنید:

| ایجنت | workflow | چه می‌کند |
|---|---|---|
| ۱ | `/qa-flows` | تردد، پاپ‌آپ‌ها، آرشیو، گزارش ماهانه، پیام‌رسان |
| ۲ | `/qa-security` | XSS، نقش‌ها، صفحه قفل، فایل تیم و پشتیبانِ دستکاری‌شده |
| ۳ | `/qa-data-safety` | به‌روزرسانی، بازگردانی، ری‌استارت گوشی، حافظه پر |
| ۴ | `/qa-ui` | ظاهر، راست‌به‌چپ، کنتراست، صفحه کوچک |
| ۵ | `/qa-android` | کد اندروید؛ با Android Studio روی گوشی یا شبیه‌ساز هم تست می‌کند |

**متن آماده برای هر ایجنت** (`/qa-flows` را با workflow همان ردیف عوض کنید):

```
/qa-flows
You are a QA agent on this repo. Read AGENTS.md first and follow it exactly.
Create your branch: git checkout ccr-6b68bcdc-nwkjfb && git pull && git checkout -b antigravity/flows-<today's date YYYY-MM-DD>
Run npm ci, npx playwright install chromium, npm test — it must pass before you start.
Then do the workflow. Every finding needs a test in tests/e2e/ that fails on the current code.
Finish with: npm test (paste the last lines), commit tests + report, git push -u origin <your branch>.
Reply with the branch name and the findings table.
```

**نکته‌ها:**
- ایجنت‌ها هم‌زمان روی یک پوشه کار می‌کنند. اگر Antigravity برای هر ایجنت workspace یا worktree جدا پیشنهاد کرد، قبول کنید. وگرنه بهتر است برای هر ایجنت یک clone جدا از ریپو بگیرید (مرحله ۱، در پوشه‌ای دیگر)، تا برنچ‌هایشان قاطی نشوند.
- اگر ایجنتی خواست چیزی را `main` یا `ccr-6b68bcdc-nwkjfb` push کند، رد کنید.
- «Review policy» را روی «Request review» بگذارید تا قبل از هر push بپرسد.

## اجرای ایجنت‌ها بدون Antigravity IDE
همان پرامپت‌ها در این دو راه هم کار می‌کنند. فقط به‌جای `/qa-flows` بنویسید `follow .agent/workflows/qa-flows.md`. هر ایجنت باید در `git worktree` خودش کار کند.

- **Gemini CLI** (ایجنت ترمینالی گوگل، رایگان با حساب گوگل، روی لپ‌تاپ):
  1. `npm.cmd install -g @google/gemini-cli`
  2. در پوشه ریپو `gemini` را بزنید و با حساب گوگل وارد شوید. فایل `GEMINI.md` ریپو را خودش می‌خواند (به `AGENTS.md` و اسکیل درس‌ها اشاره می‌کند).
  3. برای هر ایجنت یک پنجره PowerShell جدا باز کنید، با `cd` به همان worktree بروید، `gemini` را بزنید و پرامپت را بدهید.
  4. Strix هم از همین‌جا اجرا می‌شود، چون روی لپ‌تاپ است (Docker و کلید لازم است).
- **Jules** (jules.google، ایجنت ابری گوگل):
  - مستقیم روی ریپوی GitHub کار می‌کند و روی لپ‌تاپ چیزی اجرا نمی‌شود. هر کار یک برنچ جدا می‌سازد.
  - ریپو را وصل کنید، برنچ `ccr-6b68bcdc-nwkjfb` را انتخاب کنید و همان پرامپت را بدهید (خط‌های `git worktree` لازم نیست).
  - Strix را نمی‌تواند اجرا کند (Docker و کلید ندارد)، ولی `npm test` و تست‌های Playwright را اجرا می‌کند.

## ۳. تحویل به Claude Code
در یک پیام برای Claude بنویسید:
```
این برنچ‌های Antigravity را بررسی کن:
antigravity/flows-...
antigravity/security-...
(...)
```
Claude هر یافته را با تست خودش دوباره بازتولید می‌کند. یافته‌های واقعی را رفع می‌کند و به برنچ اصلی می‌آورد. یافته‌های اشتباه را با دلیل رد می‌کند.

## ۴. سؤال‌های رایج
- **«npm test» روی ویندوز خطا می‌دهد:** اول بند «ویندوز» در بخش ۱ را ببینید. ابزار اسکرین‌شات (`tools/screens.mjs`) سرور `python -m http.server 8765` می‌خواهد؛ روی ویندوز به‌جای `python3` بنویسید `python` یا `py`.
- **ایجنت چیزی پیدا نکرد:** در گزارشش می‌نویسد `no findings` و فهرست چیزهایی که بررسی کرده. این هم مفید است.
- **ایجنت تست را عوض کرد تا سبز شود:** طبق `AGENTS.md` ممنوع است. Claude در بررسی آن را رد می‌کند.
