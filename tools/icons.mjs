// آیکون‌های Geo Team از assets/brand/*.svg (اجرا فقط وقتی لوگو عوض شد: node tools/icons.mjs)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = (n) => readFileSync(join(root, 'assets/brand', n), 'utf8');
const jobs = [
  ['app-icon.svg', 192, 'icon-192.png'],
  ['app-icon.svg', 512, 'icon-512.png'],
  ['app-icon-maskable.svg', 512, 'icon-maskable-512.png'],
  ['app-icon.svg', 48, 'android/app/src/main/res/mipmap/ic_launcher.png'],
  ['app-icon.svg', 48, 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png'],
  ['app-icon.svg', 72, 'android/app/src/main/res/mipmap-hdpi/ic_launcher.png'],
  ['app-icon.svg', 96, 'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png'],
  ['app-icon.svg', 144, 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png'],
  ['app-icon.svg', 192, 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'],
  ['mark.svg', 96, 'android/app/src/main/res/drawable/ic_notification_large.png'],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, size, out] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(src).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  mkdirSync(dirname(join(root, out)), { recursive: true });
  await page.screenshot({ path: join(root, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(out, size);
}
await browser.close();
