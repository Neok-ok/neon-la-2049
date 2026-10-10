// Render the four D2 street scenes through the page's OfflineAudioContext and write WAVs.
// Usage: BASE_URL=http://127.0.0.1:5173/ OUT=/opt/cursor/artifacts/audio node scripts/audio-capture.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const OUT = process.env.OUT ?? '/opt/cursor/artifacts/audio';
const webgl = process.env.GPU === '1' ? '' : '&webgl=1';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(`${BASE}?mode=fly&quality=medium&freeze=1&ui=0&time=22&weather=rain${webgl}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__nlaAudio?.capture, null, { timeout: 120_000 });
const files = await page.evaluate(async () => window.__nlaAudio.capture());
const summary = [];
for (const file of files) {
  const bytes = Buffer.from(file.wav, 'base64');
  const name = `${file.id}.wav`;
  writeFileSync(join(OUT, name), bytes);
  summary.push({ id: file.id, peak: file.peak, rms: file.rms, bytes: bytes.length });
  console.log('WAV', name, file.peak, file.rms, bytes.length);
}
writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ errors: errors.slice(0, 8), files: summary }, null, 2));
if (errors.length) console.log('ERRORS', JSON.stringify(errors.slice(0, 8)));
await browser.close();
