// In-game stills for M2. Does not touch scripts/screenshots.mjs.
// Pyramid chase, street rain, low fly-by, plus a parked scale check.
//   BASE_URL=http://127.0.0.1:5173/ OUT=/opt/cursor/artifacts/m2/ingame node scripts/m2-capture.mjs
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const OUT = process.env.OUT ?? '/opt/cursor/artifacts/m2/ingame';
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

async function openPage(view, quality) {
  const ctx = await browser.newContext(view === 'iphone' ? iphone : desktop);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
  const url = `${BASE}?mode=fly&quality=${quality}&freeze=1&ui=0&hud=0&time=22.5&weather=rain&refl=0&webgl=1`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await ready(page);
  return { ctx, page };
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
  const { ctx, page } = await openPage(spec.view, spec.quality);
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

async function scaleShot(view, quality, id, pose) {
  const { ctx, page } = await openPage(view, quality);
  await page.evaluate(pose);
  await page.waitForTimeout(800);
  await page.waitForFunction(() => (window.__nla.app.crowd.count ?? 0) >= 0, null, { timeout: 30_000 });
  await page.waitForTimeout(500);
  const table = await page.evaluate(() => {
    const n = window.__nla;
    const app = n.app;
    const spinner = app.cams.fly.spinner;
    const b = (() => {
      let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
      spinner.updateWorldMatrix(true, true);
      spinner.traverse((obj) => {
        if (!obj.isMesh) return;
        const pos = obj.geometry.getAttribute('position');
        if (!pos) return;
        const e = obj.matrixWorld.elements;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
          const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
          const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
          const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
          if (wx < minX) minX = wx;
          if (wy < minY) minY = wy;
          if (wz < minZ) minZ = wz;
          if (wx > maxX) maxX = wx;
          if (wy > maxY) maxY = wy;
          if (wz > maxZ) maxZ = wz;
        }
      });
      return { length: maxZ - minZ, width: maxX - minX, height: maxY - minY };
    })();
    const sp = spinner.position;
    const mesh = app.crowd.mesh;
    const arr = mesh.instanceMatrix.array;
    let nearest = null;
    for (let i = 0; i < mesh.count; i++) {
      const x = arr[i * 16 + 12];
      const y = arr[i * 16 + 13];
      const z = arr[i * 16 + 14];
      const sx = Math.hypot(arr[i * 16], arr[i * 16 + 1], arr[i * 16 + 2]) || 1;
      const d = Math.hypot(x - sp.x, z - sp.z);
      if (d > 80) continue;
      if (!nearest || d < nearest.distance) nearest = { distance: d, x, y, z, scale: sx, headM: 1.8 * sx };
    }
    const blocks = app.query.fabricAt(sp.x, sp.z).blocks;
    let block = null;
    let bd = Infinity;
    for (const item of blocks) {
      const d = Math.hypot(item.cx - sp.x, item.cz - sp.z);
      if (d < bd) { bd = d; block = item; }
    }
    const district = app.query.layout.districtAt(sp.x, sp.z);
    return {
      spinner: b,
      person: nearest,
      crowd: app.crowd.count,
      streetM: block ? block.street : null,
      blockDistance: block ? bd : null,
      district: district?.id ?? null,
      ground: app.query.groundHeight(sp.x, sp.z),
      spinnerY: sp.y,
    };
  });
  writeFileSync(join(OUT, `${view}-${quality}-${id}-measure.json`), JSON.stringify(table, null, 2));
  console.log('MEASURE', id, JSON.stringify(table));
  await shoot(page, `${view}-${quality}-${id}`);
  await ctx.close();
}

const park = () => {
  const n = window.__nla;
  const ok = n.streetView('bradbury-building');
  const fly = n.app.cams.fly;
  const sp = fly.spinner.position;
  const ground = n.app.query.groundHeight(sp.x, sp.z);
  sp.y = ground;
  fly.pos.y = ground;
  const walk = n.app.cams.walk;
  const h = fly.heading;
  const fx = Math.sin(h);
  const fz = -Math.cos(h);
  const rx = Math.cos(h);
  const rz = Math.sin(h);
  walk.pos.x = sp.x - fx * 8 - rx * 3.5;
  walk.pos.y = ground + 1.65;
  walk.pos.z = sp.z - fz * 8 - rz * 3.5;
  walk.heading = Math.atan2(sp.x - walk.pos.x, -(sp.z - walk.pos.z));
  walk.pitch = -0.04;
  return ok;
};

const lane = () => {
  const n = window.__nla;
  n.streetView('bradbury-building');
  const fly = n.app.cams.fly;
  const sp = fly.spinner.position;
  const ground = n.app.query.groundHeight(sp.x, sp.z);
  sp.y = ground;
  const walk = n.app.cams.walk;
  const h = fly.heading;
  const fx = Math.sin(h);
  const fz = -Math.cos(h);
  walk.pos.x = sp.x + fx * 14;
  walk.pos.y = ground + 2.2;
  walk.pos.z = sp.z + fz * 14;
  walk.heading = Math.atan2(sp.x - walk.pos.x, -(sp.z - walk.pos.z));
  walk.pitch = -0.12;
  return true;
};

await scaleShot('desktop', 'ultra', 'scale-people', park);
await scaleShot('desktop', 'ultra', 'scale-lane', lane);
await scaleShot('desktop', 'medium', 'scale-people', park);
await scaleShot('iphone', 'ultra', 'scale-people', park);

await browser.close();
