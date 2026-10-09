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

const only = new Set((process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean));

const shots = [
  // above Little Tokyo / Bunker Hill looking south-east over downtown toward the Wallace pyramid
  { name: 'fly-downtown', ctx: desktop, q: `mode=fly&x=-900&y=330&z=-900&yaw=140&pitch=-9&time=21.5&weather=rain&${common}` },
  // street level in the Little Tokyo night market
  { name: 'walk-street', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22&weather=rain&${common}`, after: () => window.__nla.streetView('noodle-bar', 0, -20) },
  // cinematic camera (random shot; letterboxed)
  { name: 'cinematic', ctx: desktop, q: `mode=cine&time=20&weather=drizzle&freeze=1&ui=0&quality=high${GPU ? '' : '&webgl=1'}`, cine: true },
  // phone-sized viewport with touch controls, flying past LAPD HQ
  { name: 'iphone-fly', ctx: iphone, q: `mode=fly&at=lapd-hq&time=21&weather=rain&freeze=1&quality=medium&touch=1${GPU ? '' : '&webgl=1'}` },
  // daytime smog toward the pyramid
  { name: 'day-smog-pyramid', ctx: desktop, q: `mode=fly&at=wallace-pyramid&time=15&weather=smog&${common}` },
  // Stage 2 — Little Tokyo night market. Cameras come from __nla.marketView.
  { name: 'market-street', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&${common}`, after: () => window.__nla.marketView('street') },
  { name: 'market-roof', ctx: desktop, q: `mode=fly&at=noodle-bar&time=22.5&weather=rain&${common}`, after: () => window.__nla.marketView('roof') },
  { name: 'market-interior', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&${common}`, after: () => window.__nla.marketView('interior') },
  { name: 'market-crowd', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&${common}`, after: () => window.__nla.marketView('crowd') },
  { name: 'market-medium', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.marketView('street') },
  { name: 'market-iphone', ctx: { ...iphone, deviceScaleFactor: 1 }, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&quality=medium&touch=1${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.marketView('street') },
  { name: 'market-low', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&quality=low${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.marketView('street') },
  { name: 'market-ultra', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&quality=ultra${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.marketView('street') },
  // X4 — holograms at night. Cameras come from __nla.holoView.
  { name: 'holo-street', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&${common}`, after: () => window.__nla.holoView('street'), holo: 'street' },
  { name: 'holo-aerial', ctx: desktop, q: `mode=fly&at=megatower-1&time=22&weather=rain&${common}`, after: () => window.__nla.holoView('aerial'), holo: 'aerial' },
  { name: 'holo-cine', ctx: desktop, q: `mode=cine&time=22&weather=rain&freeze=1&ui=0&quality=high${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.holoView('cine'), holo: 'cine' },
  { name: 'holo-medium', ctx: desktop, q: `mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&hud=1&quality=medium${GPU ? '' : '&webgl=1'}`, after: () => window.__nla.holoView('street'), holo: 'street' },
];

const args = GPU
  ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args, headless: true });

for (const s of shots) {
  if (only.size && !only.has(s.name)) continue;
  const ctx = await browser.newContext(s.ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const url = `${BASE}?${s.q}`;
  const t0 = Date.now();
  await page.goto(url);
  const market = s.name.startsWith('market-') || s.holo === 'street';
  if (market) {
    // The whole basin rarely goes idle on SwiftShader. The market shot only needs the
    // blocks around the camera dressed.
    await page.waitForFunction(() => {
      const st = window.__nla?.stats?.();
      return st && st.lod0 >= 6 && st.queryPending === 0 && st.drawCalls > 40 && st.fps > 0;
    }, null, { timeout: 90_000, polling: 500 }).catch(() => console.warn(`${s.name}: market chunks not ready, shooting anyway`));
  } else {
    await page.waitForFunction(() => window.__nla?.isIdle?.(), null, { timeout: 240_000, polling: 1000 }).catch(() => console.warn(`${s.name}: streaming not idle, shooting anyway`));
  }
  if (s.after) {
    await page.evaluate(s.after);
    await page.waitForTimeout(market ? 2500 : 1500);
    if (!market) await page.waitForFunction(() => window.__nla.isIdle(), null, { timeout: 120_000, polling: 1000 }).catch(() => {});
  }
  if (s.cine) {
    // cut until the director lands on a wide establishing shot, then let its area stream in
    for (let k = 0; k < 12; k++) {
      await page.evaluate(() => window.__nla.cut());
      await page.waitForTimeout(800);
      const shot = await page.evaluate(() => window.__nla.stats().shot);
      if (/^(orbit|telephoto|flyover) /.test(shot)) break;
    }
    await page.evaluate(() => window.__nla.holdShot(true));
    await page.waitForFunction(() => window.__nla.isIdle(), null, { timeout: 120_000, polling: 1000 }).catch(() => {});
  }
  await page.waitForTimeout(2500);
  const stats = await page.evaluate(() => {
    const s = window.__nla?.stats?.() ?? null;
    const c = window.__nla?.app?.camera;
    if (s && c) s.cam = [c.position.x, c.position.y, c.position.z].map((n) => Math.round(n * 10) / 10);
    return s;
  });
  const file = join(OUT, `${s.name}.png`);
  await page.screenshot({ path: file, timeout: 180_000 });
  console.log(`${s.name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`, JSON.stringify(stats), errors.length ? `\n  errors: ${errors.slice(0, 5).join('\n  ')}` : '');
  await ctx.close();
}
await browser.close();
