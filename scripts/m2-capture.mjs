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
if (process.env.SKIP_CINE !== '1') {
for (const view of ['desktop', 'iphone']) {
  for (const quality of ['ultra', 'medium']) {
    shots.push({ view, quality, id: 'pyramid' });
    shots.push({ view, quality, id: 'street' });
    shots.push({ view, quality, id: 'flyby' });
  }
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

// Same park as the street still: fly to the Bradbury pin, step out, drop the car
// onto the ground. streetView() aimed the scale camera into a wall.
function parkOnStreet() {
  const n = window.__nla;
  const app = n.app;
  const l = app.query.layout.landmarkById('bradbury-building');
  n.setPose(l.x, 40, l.z + 40, 180, 0);
  n.setMode('walk');
  const fly = app.cams.fly;
  const sp = fly.spinner.position;
  const ground = app.query.groundHeight(sp.x, sp.z);
  sp.y = ground;
  fly.pos.y = ground;
  return true;
}

function aimScale(kind) {
  const n = window.__nla;
  const app = n.app;
  const sp = app.cams.fly.spinner.position;
  const h = app.cams.fly.heading;
  const ground = app.query.groundHeight(sp.x, sp.z);
  const fx = Math.sin(h);
  const fz = -Math.cos(h);
  const rx = Math.cos(h);
  const rz = Math.sin(h);
  const offsets = {
    'scale-people': { f: -1.2, r: 7.2, pitch: 0.02, lookF: 0, lookR: 0, lookY: 0.85 },
    'scale-lane': { f: -16, r: 2.4, pitch: -0.2, lookF: 6, lookR: 0, lookY: 0.5 },
    'scale-facade': { f: 2.5, r: 8.5, pitch: 0.28, lookF: -4, lookR: -10, lookY: 7 },
  };
  const o = offsets[kind];
  let camX = sp.x + fx * o.f + rx * o.r;
  let camZ = sp.z + fz * o.f + rz * o.r;
  for (let i = 0; i < 6 && app.query.insideSolid(camX, ground + 1.2, camZ, 0.45); i++) {
    camX -= rx * 1.6;
    camZ -= rz * 1.6;
  }
  const walk = app.cams.walk;
  walk.pos.x = camX;
  walk.pos.y = ground;
  walk.pos.z = camZ;
  const tx = sp.x + fx * o.lookF + rx * o.lookR;
  const tz = sp.z + fz * o.lookF + rz * o.lookR;
  walk.heading = Math.atan2(tx - camX, -(tz - camZ));
  walk.pitch = o.pitch;
  return { camX, camZ, inside: app.query.insideSolid(camX, ground + 1.2, camZ, 0.3) };
}

function measureScale() {
  const n = window.__nla;
  const app = n.app;
  const spinner = app.cams.fly.spinner;
  spinner.updateWorldMatrix(true, true);
  const pe = spinner.matrixWorld.elements;
  const ax = [pe[0], pe[1], pe[2]];
  const ay = [pe[4], pe[5], pe[6]];
  const az = [pe[8], pe[9], pe[10]];
  const ox = pe[12], oy = pe[13], oz = pe[14];
  const min = [1e9, 1e9, 1e9];
  const max = [-1e9, -1e9, -1e9];
  let worldMin = [1e9, 1e9, 1e9];
  let worldMax = [-1e9, -1e9, -1e9];
  spinner.traverse((obj) => {
    if (!obj.isMesh) return;
    const pos = obj.geometry.getAttribute('position');
    if (!pos) return;
    obj.updateWorldMatrix(true, false);
    const e = obj.matrixWorld.elements;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (wx < worldMin[0]) worldMin[0] = wx;
      if (wy < worldMin[1]) worldMin[1] = wy;
      if (wz < worldMin[2]) worldMin[2] = wz;
      if (wx > worldMax[0]) worldMax[0] = wx;
      if (wy > worldMax[1]) worldMax[1] = wy;
      if (wz > worldMax[2]) worldMax[2] = wz;
      const dx = wx - ox, dy = wy - oy, dz = wz - oz;
      const lx = dx * ax[0] + dy * ax[1] + dz * ax[2];
      const ly = dx * ay[0] + dy * ay[1] + dz * ay[2];
      const lz = dx * az[0] + dy * az[1] + dz * az[2];
      if (lx < min[0]) min[0] = lx;
      if (ly < min[1]) min[1] = ly;
      if (lz < min[2]) min[2] = lz;
      if (lx > max[0]) max[0] = lx;
      if (ly > max[1]) max[1] = ly;
      if (lz > max[2]) max[2] = lz;
    }
  });
  const sp = spinner.position;
  const mesh = app.crowd.mesh;
  const arr = mesh.instanceMatrix.array;
  let nearest = null;
  const people = [];
  for (let i = 0; i < mesh.count; i++) {
    const x = arr[i * 16 + 12];
    const y = arr[i * 16 + 13];
    const z = arr[i * 16 + 14];
    const sx = Math.hypot(arr[i * 16], arr[i * 16 + 1], arr[i * 16 + 2]) || 1;
    const d = Math.hypot(x - sp.x, z - sp.z);
    if (d > 40) continue;
    const row = { distance: d, x, y, z, scale: sx, headM: 1.8 * sx };
    people.push(row);
    if (!nearest || d < nearest.distance) nearest = row;
  }
  people.sort((a, b) => a.distance - b.distance);
  const fab = app.query.fabricAt(sp.x, sp.z);
  let block = null;
  let bd = Infinity;
  for (const item of fab.blocks) {
    const d = Math.hypot(item.cx - sp.x, item.cz - sp.z);
    if (d < bd) { bd = d; block = item; }
  }
  const boxes = [];
  for (const b of fab.boxes) {
    const d = Math.hypot(b.x - sp.x, b.z - sp.z);
    if (d > 45) continue;
    boxes.push({
      d, h: b.h, y0: b.y0, w: b.w, depth: b.d, style: b.style, x: b.x, z: b.z,
    });
  }
  boxes.sort((a, b) => a.d - b.d);
  const district = app.query.layout.districtAt(sp.x, sp.z);
  const landmark = app.query.layout.landmarkById('bradbury-building');
  return {
    spinner: {
      length: max[2] - min[2],
      width: max[0] - min[0],
      height: max[1] - min[1],
      aabbLength: worldMax[2] - worldMin[2],
      aabbWidth: worldMax[0] - worldMin[0],
      aabbHeight: worldMax[1] - worldMin[1],
    },
    person: nearest,
    peopleNear: people.slice(0, 5),
    crowd: app.crowd.count,
    streetM: block ? block.street : null,
    blockDistance: block ? bd : null,
    district: district?.id ?? null,
    ground: app.query.groundHeight(sp.x, sp.z),
    spinnerY: sp.y,
    spinnerXZ: { x: sp.x, z: sp.z },
    heading: app.cams.fly.heading,
    bradbury: landmark ? { height: landmark.height, x: landmark.x, z: landmark.z } : null,
    boxes: boxes.slice(0, 12),
  };
}

async function scaleShot(view, quality, id) {
  const { ctx, page } = await openPage(view, quality);
  await page.evaluate(parkOnStreet);
  await page.waitForTimeout(400);
  const aim = await page.evaluate(aimScale, id);
  console.log('AIM', id, JSON.stringify(aim));
  await page.waitForTimeout(700);
  const table = await page.evaluate(measureScale);
  table.aim = aim;
  writeFileSync(join(OUT, `${view}-${quality}-${id}-measure.json`), JSON.stringify(table, null, 2));
  console.log('MEASURE', id, JSON.stringify({
    spinner: table.spinner,
    person: table.person,
    crowd: table.crowd,
    streetM: table.streetM,
    district: table.district,
    ground: table.ground,
    spinnerY: table.spinnerY,
    boxes: table.boxes.slice(0, 4),
  }));
  await shoot(page, `${view}-${quality}-${id}`);
  await ctx.close();
}

async function doorShot() {
  const { ctx, page } = await openPage('desktop', 'ultra');
  const info = await page.evaluate(() => {
    const n = window.__nla;
    const app = n.app;
    n.broadwayView('bradbury');
    const walk = app.cams.walk;
    const h = walk.heading;
    const fx = Math.sin(h);
    const fz = -Math.cos(h);
    const sp = app.cams.fly.spinner.position;
    const aheadX = walk.pos.x + fx * 8;
    const aheadZ = walk.pos.z + fz * 8;
    const ground = app.query.groundHeight(aheadX, aheadZ);
    sp.x = aheadX;
    sp.z = aheadZ;
    sp.y = ground;
    app.cams.fly.pos.y = ground;
    app.cams.fly.heading = h;
    app.cams.fly.spinner.rotation.set(0, -h, 0, 'YXZ');
    walk.pos.x -= fx * 4;
    walk.pos.z -= fz * 4;
    walk.pos.y = app.query.groundHeight(walk.pos.x, walk.pos.z);
    walk.pitch = 0.2;
    return {
      spinner: { x: sp.x, y: sp.y, z: sp.z },
      cam: { x: walk.pos.x, y: walk.pos.y, z: walk.pos.z },
      inside: app.query.insideSolid(walk.pos.x, walk.pos.y + 1.2, walk.pos.z, 0.4),
      streetM: 18,
    };
  });
  console.log('DOOR', JSON.stringify(info));
  await page.waitForTimeout(800);
  const table = await page.evaluate(measureScale);
  table.door = { width: 4.8, height: 7.2, note: 'Bradbury street tunnel, not a person door' };
  table.storey = { masonry: 22.4, floors: 5, module: 22.4 / 5, panelCell: 3.9, podium: 3.5 };
  writeFileSync(join(OUT, 'desktop-ultra-scale-door-measure.json'), JSON.stringify(table, null, 2));
  console.log('MEASURE door', JSON.stringify({
    spinner: table.spinner, person: table.person, streetM: table.streetM, district: table.district, spinnerY: table.spinnerY,
  }));
  await shoot(page, 'desktop-ultra-scale-door');
  await ctx.close();
}

if (process.env.DOOR_ONLY === '1') {
  await doorShot();
} else {
  await scaleShot('desktop', 'ultra', 'scale-people');
  await scaleShot('desktop', 'ultra', 'scale-lane');
  await scaleShot('desktop', 'ultra', 'scale-facade');
  await scaleShot('desktop', 'medium', 'scale-people');
}

await browser.close();
