// بررسی ایستای کد: همه فایل‌های src/js یک اسکریپت مشترک‌اند، پس روی همان ترکیب lint می‌شود.
// no-undef جلوی صدا زدن تابعی را می‌گیرد که دیگر وجود ندارد (مثل closeUserModal در دکمه برگشت، دور ۳ بازبینی).
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { ESLint } = createRequire(import.meta.url)('eslint');
const files = readdirSync(join(root, 'src/js')).filter(f => f.endsWith('.js')).sort();
const parts = files.map(f => ({ f, text: readFileSync(join(root, 'src/js', f), 'utf8') }));
const code = parts.map(p => p.text).join('');
const eslint = new ESLint({ cwd: root, overrideConfigFile: join(root, 'tools/eslint.config.mjs') });
const [res] = await eslint.lintText(code, { filePath: join(root, 'src/js/bundle.js') });
// شماره خط ترکیب را به فایل اصلی برگردان
const where = (line) => { let n = line; for (const p of parts) { const c = p.text.split('\n').length - 1; if (n <= c) return `${p.f}:${n}`; n -= c; } return `?:${line}`; };
const errors = res.messages.filter(m => m.severity === 2);
errors.forEach(m => console.error(`${where(m.line)}  ${m.message}  (${m.ruleId})`));
console.log(errors.length ? `lint: ${errors.length} error(s)` : 'lint: ok');
process.exit(errors.length ? 1 : 0);
