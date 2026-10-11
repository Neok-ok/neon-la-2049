// In-game spinner stills for M1. Not scripts/screenshots.mjs.
// Pyramid chase, street rain with the craft parked, low fly-by.
// Ultra and medium, desktop 1280×720 and 390×844.
//   BASE_URL=http://127.0.0.1:5173/ OUT=/opt/cursor/artifacts/m1/ingame node scripts/m1-capture.mjs
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const OUT = process.env.OUT ?? '/opt/cursor/artifacts/m1/ingame';
const CHROME = process.env.CHROME
  || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : '/usr/local/bin/google-chrome');
mkdirSync(OUT, { recursive: true });

const desktop = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const iphone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
};

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function ready(page) {
  await page.waitForFunction(() => window.__nla?.stats, null, { timeout: 300_000 });
  await page.waitForFunction(() => {
    const s = window.__nla.app.cams.fly.spinner.userData;
    return s.ready === true;
  }, null, { timeout: 180_000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 90_000) {
    const idle = await page.evaluate(() => {
      const s = window.__nla?.stats?.();
      return !!(s && s.inFlight === 0 && s.readyQueue === 0 && s.fps > 0);
    });
    if (idle) return;
    await page.waitForTimeout(400);
  }
}

async function shoot(page, name) {
  const frame = await page.evaluate(() => window.__nla.app.frames);
  await page.waitForFunction((n) => window.__nla.app.frames > n + 2, frame, { timeout: 60_000 });
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, type: 'png', timeout: 180_000 });
  const info = await page.evaluate(() => {
    const s = window.__nla.stats();
    const sp = window.__nla.app.cams.fly.spinner;
    const c = window.__nla.app.camera.position;
    return {
      tier: s.tier,
      backend: s.backend,
      canvas: `${s.canvasWidth}x${s.canvasHeight}`,
      lod: sp.userData.lod,
      ready: sp.userData.ready,
      cam: [Math.round(c.x), Math.round(c.y), Math.round(c.z)],
    };
  });
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(info, null, 2));
  console.log('SHOT', name, JSON.stringify(info));
}

const shots = [];
for (const view of ['desktop', 'iphone']) {
  for (const quality of ['ultra', 'medium']) {
    shots.push({ view, quality, id: 'pyramid' });
    shots.push({ view, quality, id: 'street' });
    shots.push({ view, quality, id: 'flyby' });
  }
}

for (const spec of shots) {
  const ctx = await browser.newContext(spec.view === 'iphone' ? iphone : desktop);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', spec.id, String(e)));
  const url = `${BASE}?mode=fly&quality=${spec.quality}&freeze=1&ui=0&hud=0&time=22.5&weather=rain&refl=0&webgl=1`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await ready(page);
  if (spec.id === 'pyramid') {
    await page.evaluate(() => window.__nla.setPose(
      ...(() => {
        const l = window.__nla.app.query.layout.landmarkById('wallace-pyramid');
        const dist = Math.max(l.height * 1.4, 600);
        const x = l.x - dist * 0.7;
        const y = Math.max(150, l.height * 0.45);
        const z = l.z + dist * 0.7;
        const yaw = Math.atan2(l.x - x, -(l.z - z)) * 180 / Math.PI;
        return [x, y, z, yaw, 0];
      })(),
    ));
  } else if (spec.id === 'street') {
    await page.evaluate(() => {
      const n = window.__nla;
      const l = n.app.query.layout.landmarkById('bradbury-building');
      n.setPose(l.x, 40, l.z + 40, 180, 0);
      n.setMode('walk');
      const fly = n.app.cams.fly;
      const walk = n.app.cams.walk;
      const sp = fly.spinner.position;
      const h = fly.heading;
      const forwardX = Math.sin(h);
      const forwardZ = -Math.cos(h);
      const rightX = Math.cos(h);
      const rightZ = Math.sin(h);
      const camX = sp.x - forwardX * 8 - rightX * 3.2;
      const camZ = sp.z - forwardZ * 8 - rightZ * 3.2;
      walk.pos.x = camX;
      walk.pos.z = camZ;
      walk.heading = Math.atan2(sp.x - camX, -(sp.z - camZ));
      walk.pitch = -0.08;
    });
  } else {
    await page.evaluate(() => {
      const n = window.__nla;
      const l = n.app.query.layout.landmarkById('bradbury-building');
      n.setPose(l.x, 28, l.z + 24, 200, -6);
      const fly = n.app.cams.fly;
      fly.cockpit = false;
      fly.pitch = -0.12;
    });
  }
  await page.waitForTimeout(600);
  await shoot(page, `${spec.view}-${spec.quality}-${spec.id}`);
  await ctx.close();
}

await browser.close();
