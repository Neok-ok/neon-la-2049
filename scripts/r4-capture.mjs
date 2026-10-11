// R4 street-language shots. Medium, night rain, desktop and 390×844.
//   npm run dev   then   node scripts/r4-capture.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const OUT = process.env.OUT ?? 'screenshots-r4';
const GPU = process.env.GPU === '1';
mkdirSync(OUT, { recursive: true });

const q = `freeze=1&ui=0&quality=medium&time=22.5&weather=rain${GPU ? '' : '&webgl=1'}`;
const desktop = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

const shots = [
  { name: 'mega-street', at: 'megatower-1', after: () => window.__nla.megaView('street') },
  { name: 'market-street', at: 'noodle-bar', after: () => window.__nla.marketView('street') },
  { name: 'bradbury', at: 'bradbury', after: () => window.__nla.broadwayView('street') },
  { name: 'dancer', at: 'joi-bridge', after: () => window.__nla.broadwayView('bridge') },
  { name: 'hollywood-street', at: 'hollywood-lobby', after: () => window.__nla.hollywoodView('street') },
  {
    name: 'hollywood-lobby',
    at: 'hollywood-lobby',
    after: () => {
      window.__nla.hollywoodView('interior');
      const c = window.__nla.app.camera.position;
      const doorZ = c.z + 4.2;
      const g = c.y - 1.7;
      const x = c.x + 8;
      const z = doorZ + 16;
      const heading = Math.atan2(c.x - x, -(doorZ - z)) * 180 / Math.PI;
      const horiz = Math.hypot(c.x - x, doorZ - z) || 1;
      const pitch = Math.atan2((g + 8) - (g + 1.7), horiz) * 180 / Math.PI;
      window.__nla.setPose(x, g + 1.7, z, heading, pitch);
    },
  },
  { name: 'lax-concourse', at: 'lax-concourse', after: () => window.__nla.laxView('terminal') },
  { name: 'lapd-steps', at: 'lapd-steps', after: () => window.__nla.civicView('steps') },
  { name: 'lapd-lobby', at: 'lapd-steps', after: () => window.__nla.civicView('lobby') },
  { name: 'basin-strip', at: 'basin-strip', after: () => window.__nla.basinView('strip') },
  {
    name: 'broadway-curfew',
    at: 'bradbury',
    after: () => {
      // Million Dollar shutter. West face is b+, street centre is t = -210.
      // Stand in the avenue, square to the plate, so CURFEW is not clipped by the marquee.
      const rad = 38 * Math.PI / 180;
      const AX = Math.sin(rad), AZ = -Math.cos(rad), BX = Math.cos(rad), BZ = Math.sin(rad);
      const world = (s, t) => [AX * s + BX * t, AZ * s + BZ * t];
      const [sx, sz] = world(-387, -204);
      const [lx, lz] = world(-387, -218.6);
      const g = window.__nla.app.query.layout.heightAt(sx, sz);
      const heading = Math.atan2(lx - sx, -(lz - sz)) * 180 / Math.PI;
      const horiz = Math.hypot(lx - sx, lz - sz) || 1;
      const pitch = Math.atan2((g + 2.35) - (g + 1.7), horiz) * 180 / Math.PI;
      window.__nla.setPose(sx, g + 1.7, sz, heading, pitch);
      const w = window.__nla.app.cams.walk;
      const deg = Math.PI / 180;
      w.pos.set(sx, g, sz);
      w.heading = heading * deg;
      w.pitch = pitch * deg;
      const cam = window.__nla.app.camera;
      cam.position.set(sx, g + 1.7, sz);
      cam.rotation.set(pitch * deg, -heading * deg, 0, 'YXZ');
      cam.updateMatrixWorld();
    },
  },
  { name: 'east-la-grid', at: 'east-la-market', after: () => window.__nla.eastLaView('notice') },
];

const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
const shotList = only.length ? shots.filter((s) => only.includes(s.name)) : shots;
const viewNames = new Set((process.env.VIEWS ?? 'desktop,phone').split(','));

const browser = await chromium.launch({
  headless: true,
  args: GPU ? [] : ['--use-gl=angle', '--use-angle=swiftshader'],
});

async function settle(page) {
  await page.waitForFunction(() => {
    const st = window.__nla?.stats?.();
    return st && st.inFlight === 0 && st.readyQueue === 0 && st.fps > 0 && st.drawCalls > 20;
  }, null, { timeout: 90_000, polling: 400 }).catch(() => {});
}

const rows = [];
for (const view of [
  ['desktop', desktop],
  ['phone', phone],
].filter((v) => viewNames.has(v[0]))) {
  const ctx = await browser.newContext(view[1]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const tLoad = Date.now();
  await page.goto(`${BASE}?mode=walk&at=noodle-bar&${q}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__nla?.isIdle?.(), null, { timeout: 180_000, polling: 1000 }).catch(() => {});
  console.log(`loaded ${view[0]} in ${((Date.now() - tLoad) / 1000).toFixed(1)}s`);
  for (const s of shotList) {
    const t0 = Date.now();
    await page.evaluate(s.after);
    await page.waitForTimeout(700);
    await settle(page);
    await page.evaluate(s.after);
    await page.waitForTimeout(900);
    await settle(page);
    const stats = await page.evaluate(() => {
      const st = window.__nla.stats();
      return {
        drawCalls: st.drawCalls,
        triangles: st.triangles,
        holo: st.holo,
        tier: st.tier,
      };
    });
    const file = join(OUT, `${s.name}-${view[0]}.png`);
    await page.screenshot({ path: file, timeout: 180_000 });
    const row = { name: `${s.name}-${view[0]}`, ...stats, sec: ((Date.now() - t0) / 1000).toFixed(1), errors: errors.slice(0, 2) };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  await ctx.close();
}
await browser.close();
console.log('TABLE');
console.log(JSON.stringify(rows, null, 2));
