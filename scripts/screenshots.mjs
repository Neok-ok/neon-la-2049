// Headless screenshots of the running app (dev server or `vite preview`).
//   npm run dev  (in another terminal)   then   npm run screenshots
// Env: BASE_URL (default http://localhost:5173/), OUT (default ./screenshots-tmp), CHROME (executable path),
//      GPU=1 to try the real GPU / WebGPU instead of the SwiftShader WebGL2 fallback, ONLY=<shot name>.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const OUT = process.env.OUT ?? 'screenshots-tmp';
const GPU = process.env.GPU === '1';
mkdirSync(OUT, { recursive: true });

const common = 'freeze=1&ui=0&quality=high' + (GPU ? '' : '&webgl=1');
const desktop = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const iphone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

const shots = [
  // above Little Tokyo / Bunker Hill looking south-east over downtown toward the Wallace pyramid
  { name: 'fly-downtown', ctx: desktop, q: `mode=fly&x=-900&y=330&z=-900&yaw=140&pitch=-9&time=21.5&weather=rain&${common}` },
  // street level in the Little Tokyo night market
  { name: 'walk-street', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22&weather=rain&${common}`, after: () => window.__nla.streetView('noodle-bar', 0, -20) },
  // cinematic camera (random shot; letterboxed)
  { name: 'cinematic', ctx: desktop, q: `mode=cine&time=20&weather=drizzle&freeze=1&quality=high${GPU ? '' : '&webgl=1'}`, cine: true },
  // phone-sized viewport with touch controls, flying past LAPD HQ
  { name: 'iphone-fly', ctx: iphone, q: `mode=fly&at=lapd-hq&time=21&weather=rain&freeze=1&quality=medium&touch=1${GPU ? '' : '&webgl=1'}` },
  // daytime smog toward the pyramid
  { name: 'day-smog-pyramid', ctx: desktop, q: `mode=fly&at=wallace-pyramid&time=15&weather=smog&${common}` },
];

const args = GPU
  ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args, headless: true });

for (const s of shots) {
  if (process.env.ONLY && process.env.ONLY !== s.name) continue;
  const ctx = await browser.newContext(s.ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const url = `${BASE}?${s.q}`;
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => window.__nla?.isIdle?.(), null, { timeout: 240_000, polling: 1000 }).catch(() => console.warn(`${s.name}: streaming not idle, shooting anyway`));
  if (s.after) {
    await page.evaluate(s.after);
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => window.__nla.isIdle(), null, { timeout: 120_000, polling: 1000 }).catch(() => {});
  }
  if (s.cine) {
    // let the director settle into a shot whose area has streamed in
    await page.evaluate(() => window.__nla.cut());
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => window.__nla.isIdle(), null, { timeout: 120_000, polling: 1000 }).catch(() => {});
  }
  await page.waitForTimeout(2500);
  const stats = await page.evaluate(() => window.__nla?.stats());
  const file = join(OUT, `${s.name}.png`);
  await page.screenshot({ path: file, timeout: 180_000 });
  console.log(`${s.name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`, JSON.stringify(stats), errors.length ? `\n  errors: ${errors.slice(0, 5).join('\n  ')}` : '');
  await ctx.close();
}
await browser.close();
