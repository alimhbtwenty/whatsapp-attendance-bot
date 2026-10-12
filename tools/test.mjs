// همه تست‌های مرورگری (tests/e2e/*.js) را روی خروجی build اجرا می‌کند؛ هر «FAIL» یا خروج غیرصفر یعنی شکست.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (path.startsWith('..')) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(join(root, path || 'index.html'));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const only = process.argv.slice(2);
const files = (await readdir(join(root, 'tests/e2e'))).filter(f => f.endsWith('.js') && (!only.length || only.some(o => f.includes(o)))).sort();
const run = (file) => new Promise((resolve) => {
  const child = spawn(process.execPath, [join(root, 'tests/e2e', file)], { env: { ...process.env, BASE_URL: base } });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 240000);
  child.on('close', (code) => { clearTimeout(timer); resolve({ file, code, out }); });
});
// موازی ولی محدود، تا ماشین CI زیر بار نرود
const results = [];
const queue = [...files];
await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) results.push(await run(queue.shift())); }));
server.close();
let failed = 0;
for (const r of results.sort((a, b) => a.file.localeCompare(b.file))) {
  const fails = r.out.split('\n').filter(l => l.startsWith('FAIL '));
  const passes = r.out.split('\n').filter(l => l.startsWith('PASS ')).length;
  const bad = r.code !== 0 || fails.length > 0;
  if (bad) failed++;
  console.log(`${bad ? '✗' : '✓'} ${r.file}  (${passes} passed${fails.length ? `, ${fails.length} failed` : ''}${r.code ? `, exit ${r.code}` : ''})`);
  if (bad) console.log(r.out.split('\n').filter(l => !l.startsWith('PASS ')).map(l => '    ' + l).join('\n'));
}
console.log(failed ? `\n${failed} test file(s) failed` : `\nall ${results.length} test files passed`);
process.exit(failed ? 1 : 0);
