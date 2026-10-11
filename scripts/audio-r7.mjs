// R7 acceptance renders. Writes WAVs and a summary without the base64 blobs.
// Usage: BASE_URL=http://127.0.0.1:5173/ OUT=/opt/cursor/artifacts/audio-r7-before node scripts/audio-r7.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const OUT = process.env.OUT ?? '/opt/cursor/artifacts/audio-r7';
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
await page.goto(`${BASE}?mode=fly&quality=medium&freeze=1&ui=0&time=22&weather=clear${webgl}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__nlaAudio?.measureR7, null, { timeout: 120_000 });
const report = await page.evaluate(async () => window.__nlaAudio.measureR7());
const files = [];
for (const file of report.files) {
  const row = { ...file };
  if (file.wav) {
    const bytes = Buffer.from(file.wav, 'base64');
    const name = `${file.id}.wav`;
    writeFileSync(join(OUT, name), bytes);
    row.wav = name;
    row.bytes = bytes.length;
    console.log('WAV', name, 'rms', file.rmsDb, 'peak', file.peakDb, 'sub', file.bands?.sub, 'low', file.bands?.low, 'clips', file.clips);
  } else {
    delete row.wav;
    console.log('ROW', file.id, 'rms', file.rmsDb, 'peak', file.peakDb, 'sub', file.bands?.sub, 'low', file.bands?.low, 'err', file.error ?? '');
  }
  files.push(row);
}
const summary = { errors: errors.slice(0, 12), checks: report.checks, causeway: report.causeway, files };
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log('CHECKS', JSON.stringify(report.checks));
console.log('CAUSEWAY', JSON.stringify(report.causeway));
if (errors.length) console.log('ERRORS', JSON.stringify(errors.slice(0, 8)));
await browser.close();
