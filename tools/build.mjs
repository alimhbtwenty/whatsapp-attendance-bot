// ساخت index.html یک‌تکه از src/ (WebView با file:// ماژول ES بار نمی‌کند) و کپی به assets اندروید.
// بدون وابستگی. «node tools/build.mjs --check» فقط بررسی می‌کند که خروجی‌های ثبت‌شده با src یکی باشند (برای CI).
import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (...p) => join(root, 'src', ...p);
const read = (p) => readFileSync(p, 'utf8');
const check = process.argv.includes('--check');

const css = readdirSync(src('styles')).filter(f => f.endsWith('.css')).sort().map(f => read(src('styles', f))).join('');
const js = readdirSync(src('js')).filter(f => f.endsWith('.js')).sort().map(f => read(src('js', f))).join('');
const script = '\n' + js;
const hash = createHash('sha256').update(script, 'utf8').digest('base64');
// فقط همین اسکریپت (با hash) اجرا می‌شود؛ هر اسکریپت یا onclick تزریق‌شده بسته است
const csp = [
  "default-src 'none'",
  `script-src 'sha256-${hash}'`,
  "style-src 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'"
].join('; ');
const html = read(src('index.template.html'))
  .replace('<!-- @csp -->', `<meta http-equiv="Content-Security-Policy" content="${csp}">`)
  .replace('<!-- @styles -->\n', css)
  .replace('\n<!-- @script -->\n', script);

const outputs = {
  'index.html': html,
  'android/app/src/main/assets/index.html': html,
};
const copies = ['sw.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'logo-geomatco.png'];

let stale = [];
for (const [rel, content] of Object.entries(outputs)) {
  const p = join(root, rel);
  if (check) { if (!existsSync(p) || read(p) !== content) stale.push(rel); }
  else writeFileSync(p, content);
}
for (const f of copies) {
  const from = join(root, f), to = join(root, 'android/app/src/main/assets', f);
  if (!existsSync(from)) continue;
  if (check) { if (!existsSync(to) || !readFileSync(from).equals(readFileSync(to))) stale.push('android/app/src/main/assets/' + f); }
  else copyFileSync(from, to);
}
if (check && stale.length) {
  console.error('Generated files are out of date; run `node tools/build.mjs`:\n  ' + stale.join('\n  '));
  process.exit(1);
}
console.log(check ? 'build outputs are up to date' : `built index.html (${(html.length / 1024).toFixed(0)} KB, script sha256-${hash})`);
