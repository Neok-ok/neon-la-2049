// Render the A1 living-sound clips through OfflineAudioContext.
// Usage: BASE_URL=http://127.0.0.1:5173/ OUT=docs/audio/clips node scripts/audio-a1.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const OUT = process.env.OUT ?? 'docs/audio/clips';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(`${BASE}src/audio/a1-render.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__a1, null, { timeout: 120_000 });
const result = await page.evaluate(() => window.__a1);
const summary = [];
for (const file of result.files ?? []) {
  const bytes = Buffer.from(file.wav, 'base64');
  const name = `${file.id}.wav`;
  writeFileSync(join(OUT, name), bytes);
  const row = { ...file };
  delete row.wav;
  row.bytes = bytes.length;
  summary.push(row);
  console.log('WAV', name, file.peakDb, file.rmsDb, file.clips, bytes.length);
}
writeFileSync(join(OUT, 'summary.json'), JSON.stringify({
  errors: errors.slice(0, 12),
  check: result.check,
  memory: result.memory,
  runtimeBytes: result.runtimeBytes,
  planBytes: result.planBytes,
  files: summary,
}, null, 2));
console.log('CHECK', JSON.stringify(result.check));
console.log('MEMORY', result.runtimeBytes, result.planBytes);
const fatal = errors.filter((e) => !/404/.test(e));
if (fatal.length) console.log('ERRORS', JSON.stringify(fatal.slice(0, 8)));
await browser.close();
if ((result.check ?? []).length || fatal.length) process.exitCode = 1;
