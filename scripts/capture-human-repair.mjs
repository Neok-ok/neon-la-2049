// Second pass for districts whose street camera looked away from the crowd,
// plus one close frame with a person, a doorway, and a car.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = '/workspace/docs/humans/after';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
mkdirSync(OUT, { recursive: true });

const MISSING = [
  ['financial-megatowers', 'megaView', 'street'],
  ['southeast-industrial', 'southeastView', 'street'],
  ['harbor', 'harborView', 'stacks'],
];

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);

async function boot(quality) {
  const url = `http://127.0.0.1:5173/?mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&quality=${quality}&webgl=1`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__nla && window.__nla.stats, { timeout: 90000 });
  await page.evaluate(() => document.getElementById('loading')?.remove());
}

async function go(fn, kind) {
  await page.evaluate(async ({ fn, kind }) => {
    const r = window.__nla[fn](kind);
    if (r && typeof r.then === 'function') await r;
    const w = window.__nla.app.cams.walk;
    window.__nla.app.camera.position.set(w.pos.x, w.pos.y + 1.7, w.pos.z);
    window.__nla.app.camera.rotation.set(w.pitch, -w.heading, 0, 'YXZ');
    window.__nla.app.camera.updateMatrixWorld();
    document.getElementById('loading')?.remove();
  }, { fn, kind });
}

async function waitCrowd(ms = 14000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const n = await page.evaluate(() => window.__nla.stats().crowd);
    if (n > 0) return n;
    await page.waitForTimeout(400);
  }
  return 0;
}

async function aimNearest() {
  return page.evaluate(() => {
    const app = window.__nla.app;
    const q = app.query;
    const arr = app.crowd.mesh.instanceMatrix.array;
    const cam = app.cams.walk.pos;
    let best = null;
    for (let i = 0; i < app.crowd.mesh.count; i++) {
      const x = arr[i * 16 + 12];
      const y = arr[i * 16 + 13];
      const z = arr[i * 16 + 14];
      if (x > 1e5) continue;
      const s = Math.hypot(arr[i * 16], arr[i * 16 + 1], arr[i * 16 + 2]);
      if (s < 0.3) continue;
      const d = Math.hypot(x - cam.x, z - cam.z);
      if (d > 180) continue;
      if (!best || d < best.d) best = { x, y, z, d, s };
    }
    if (!best) return { ok: false, count: app.crowd.mesh.count };
    const dx = best.x - cam.x;
    const dz = best.z - cam.z;
    const len = Math.hypot(dx, dz) || 1;
    let px = best.x - (dx / len) * 7.4;
    let pz = best.z - (dz / len) * 7.4;
    const gy = q.groundHeight(px, pz);
    if (q.insideSolid(px, gy + 1.1, pz, 0.45, true)) {
      px = best.x + (-dz / len) * 6.2;
      pz = best.z + (dx / len) * 6.2;
    }
    const feetY = q.groundHeight(px, pz);
    const yaw = Math.atan2(best.x - px, -(best.z - pz));
    const eyeY = feetY + 1.7;
    const horiz = Math.hypot(best.x - px, best.z - pz) || 1;
    const pitch = Math.atan2((best.y + 0.95 * best.s) - eyeY, horiz);
    app.cams.walk.pos.set(px, feetY, pz);
    app.cams.walk.heading = yaw;
    app.cams.walk.pitch = pitch;
    app.camera.position.set(px, eyeY, pz);
    app.camera.rotation.set(pitch, -yaw, 0, 'YXZ');
    app.camera.updateMatrixWorld();
    return { ok: true, d: Math.round(best.d * 10) / 10, at: [Math.round(px), Math.round(pz)] };
  });
}

async function shot(path) {
  await page.evaluate(() => document.getElementById('loading')?.remove());
  await page.screenshot({ path, timeout: 180000 });
}

async function strip(prefix) {
  for (let f = 0; f < 4; f++) {
    if (f > 0) {
      await page.evaluate(() => {
        const app = window.__nla.app;
        const cam = app.camera.position;
        const rain = app.atmosphere.weather.params.rain;
        for (let i = 0; i < 3; i++) {
          app.crowd.update(0.1, cam.x, cam.z, app.query, app.quality, rain, app.elapsed, app.cams.walk.heading);
        }
      });
    }
    await shot(`${prefix}-f${f}.png`);
  }
}

async function scaleFrame(name) {
  const places = [
    ['dtlaView', 'street'],
    ['dtlaView', 'walkway'],
    ['kView', 'street'],
    ['civicView', 'plaza'],
    ['marketView', 'street'],
  ];
  for (const [fn, kind] of places) {
    await go(fn, kind);
    await waitCrowd(10000);
    await page.waitForTimeout(1200);
    const found = await page.evaluate(() => {
      const app = window.__nla.app;
      const people = [];
      const arr = app.crowd.mesh.instanceMatrix.array;
      const origin = app.cams.walk.pos;
      for (let i = 0; i < app.crowd.mesh.count; i++) {
        const x = arr[i * 16 + 12], y = arr[i * 16 + 13], z = arr[i * 16 + 14];
        const s = Math.hypot(arr[i * 16], arr[i * 16 + 1], arr[i * 16 + 2]);
        if (s < 0.3 || x > 1e5) continue;
        if (Math.hypot(x - origin.x, z - origin.z) < 40) people.push({ x, y, z, s });
      }
      const cars = [];
      app.scene.traverse((o) => {
        if (!o.isInstancedMesh || !String(o.name).startsWith('ground-')) return;
        if (o.name.includes('pole') || o.name.includes('head')) return;
        const a = o.instanceMatrix.array;
        for (let i = 0; i < Math.min(o.count, 40); i++) {
          const x = a[i * 16 + 12], y = a[i * 16 + 13], z = a[i * 16 + 14];
          if (Math.hypot(x - origin.x, z - origin.z) < 50) {
            cars.push({ name: o.name, x, y, z, car: o.name === 'ground-car' ? 1 : 0 });
          }
        }
      });
      let best = null;
      for (const p of people) {
        for (const c of cars) {
          const dc = Math.hypot(p.x - c.x, p.z - c.z);
          if (dc < 3.2 || dc > 11) continue;
          const score = Math.abs(dc - 6) + (c.car ? 0 : 2);
          if (!best || score < best.score) best = { p, c, dc, score };
        }
      }
      if (!best) return { ok: false, people: people.length, cars: cars.length };
      const dx = best.c.x - best.p.x;
      const dz = best.c.z - best.p.z;
      const len = Math.hypot(dx, dz) || 1;
      // Stand off the person-car line so both sit in the frame, building behind.
      let px = best.p.x + (-dz / len) * 5.6 + (-dx / len) * 1.2;
      let pz = best.p.z + (dx / len) * 5.6 + (-dz / len) * 1.2;
      const q = app.query;
      const gy = q.groundHeight(px, pz);
      if (q.insideSolid(px, gy + 1.1, pz, 0.4, true)) {
        px = best.p.x - (-dz / len) * 5.6;
        pz = best.p.z - (dx / len) * 5.6;
      }
      const feetY = q.groundHeight(px, pz);
      const lookX = (best.p.x + best.c.x) * 0.5;
      const lookZ = (best.p.z + best.c.z) * 0.5;
      const yaw = Math.atan2(lookX - px, -(lookZ - pz));
      const eyeY = feetY + 1.5;
      const pitch = Math.atan2((best.p.y + 0.9) - eyeY, Math.hypot(lookX - px, lookZ - pz) || 1);
      app.cams.walk.pos.set(px, feetY, pz);
      app.cams.walk.heading = yaw;
      app.cams.walk.pitch = pitch;
      app.camera.position.set(px, eyeY, pz);
      app.camera.rotation.set(pitch, -yaw, 0, 'YXZ');
      app.camera.updateMatrixWorld();
      return { ok: true, car: best.c.name, dc: Math.round(best.dc * 10) / 10 };
    });
    console.log('scale', fn, kind, JSON.stringify(found));
    if (found?.ok) {
      await shot(`${OUT}/${name}.png`);
      return found;
    }
  }
  return { ok: false };
}

await boot('medium');
for (const [id, fn, kind] of MISSING) {
  await go(fn, kind);
  const n = await waitCrowd(18000);
  const aim = await aimNearest();
  console.log('aim', id, 'medium', n, JSON.stringify(aim));
  if (!aim?.ok) continue;
  await strip(`${OUT}/${id}-medium`);
  console.log('shot', id, 'medium');
}
await scaleFrame('scale-door-car-medium');

await page.evaluate(() => window.__nla.app.setQuality('ultra'));
await page.waitForTimeout(800);
for (const [id, fn, kind] of MISSING) {
  await go(fn, kind);
  const n = await waitCrowd(18000);
  const aim = await aimNearest();
  console.log('aim', id, 'ultra', n, JSON.stringify(aim));
  if (!aim?.ok) continue;
  await strip(`${OUT}/${id}-ultra`);
  console.log('shot', id, 'ultra');
}
await scaleFrame('scale-door-car-ultra');
await browser.close();
console.log('repair done');
