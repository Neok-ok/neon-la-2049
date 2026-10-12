// Doorway scale shot: a person, the lit Bradbury opening, and a ground car.
import { chromium } from 'playwright';

const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const OUT = '/workspace/docs/humans/after';
const base = (5 / 8) * Math.PI * 2;

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);

async function shoot(quality) {
  await page.goto(
    `http://127.0.0.1:5173/?mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&quality=${quality}&webgl=1`,
    { waitUntil: 'domcontentloaded', timeout: 90000 },
  );
  await page.waitForFunction(() => window.__nla && window.__nla.stats, { timeout: 90000 });
  const found = await page.evaluate(async (base) => {
    document.getElementById('loading')?.remove();
    const a = window.__nla.app;
    await window.__nla.broadwayView('bradbury');
    const w = a.cams.walk;
    a.camera.position.set(w.pos.x, w.pos.y + 1.7, w.pos.z);
    a.camera.rotation.set(w.pitch, -w.heading, 0, 'YXZ');
    const rain = a.atmosphere?.weather?.params?.rain ?? 0.8;
    for (let i = 0; i < 14; i++) {
      a.crowd.update(0.2, w.pos.x, w.pos.z, a.query, a.quality, rain, a.elapsed, w.heading);
      a.ground.update(0.2, a.camera, a.quality.groundTraffic, a.quality.freewayTraffic, a.quality.tier, a.elapsed);
    }
    a.crowd.update = () => {};
    w.update = () => {};
    a.ground.update = () => {};
    const origin = w.pos;
    let door = null;
    a.scene.traverse((o) => {
      if (door || o.name !== 'arch-door-leaf') return;
      o.updateWorldMatrix(true, false);
      const e = o.matrixWorld.elements;
      if (Math.hypot(e[12] - origin.x, e[14] - origin.z) > 70) return;
      door = { x: e[12], y: e[13], z: e[14] };
    });
    if (!door) return { ok: false, reason: 'no-door' };
    const cam = a.camera;
    function ndc(x, y, z) {
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      const e = cam.matrixWorldInverse.elements;
      const p = cam.projectionMatrix.elements;
      const vx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const vy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const vz = e[2] * x + e[6] * y + e[10] * z + e[14];
      const vw = e[3] * x + e[7] * y + e[11] * z + e[15];
      const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12] * vw;
      const cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13] * vw;
      const cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15] * vw;
      if (!cw || vz > 0) return null;
      return { x: cx / cw, y: cy / cw };
    }
    function people() {
      const mesh = a.crowd.mesh;
      const arr = mesh.instanceMatrix.array;
      const out = [];
      for (let i = 0; i < mesh.count; i++) {
        const x = arr[i * 16 + 12];
        const y = arr[i * 16 + 13];
        const z = arr[i * 16 + 14];
        const s = Math.hypot(arr[i * 16], arr[i * 16 + 1], arr[i * 16 + 2]);
        if (s < 0.3 || x > 1e5) continue;
        out.push({ x, y, z, s });
      }
      return out;
    }
    const folks = people();
    let nearCars = 0;
    a.scene.traverse((o) => {
      if (!o.isInstancedMesh) return;
      if (o.name !== 'ground-car' && o.name !== 'ground-van' && o.name !== 'ground-box') return;
      const m = o.instanceMatrix.array;
      for (let i = 0; i < Math.min(o.count, 160); i++) {
        const x = m[i * 16 + 12];
        const z = m[i * 16 + 14];
        if (x > 1e5) continue;
        if (Math.hypot(x - door.x, z - door.z) < 28) nearCars++;
      }
    });
    const cars = [];
    a.scene.traverse((o) => {
      if (!o.isInstancedMesh) return;
      if (o.name !== 'ground-car' && o.name !== 'ground-van') return;
      const m = o.instanceMatrix.array;
      for (let i = 0; i < Math.min(o.count, 160); i++) {
        const b = i * 16;
        const x = m[b + 12];
        const y = m[b + 13];
        const z = m[b + 14];
        if (x > 1e5) continue;
        const d = Math.hypot(x - door.x, z - door.z);
        if (d < 4 || d > 22) continue;
        const rx = m[b + 8];
        const rz = m[b + 10];
        const al = Math.hypot(rx, rz) || 1;
        cars.push({
          name: o.name, x, y, z, d,
          lx: rx / al, lz: rz / al, len: al,
        });
      }
    });
    let sawDoor = 0;
    let sawCar = 0;
    const rej = { solid: 0, ends: 0, sep: 0, door: 0, person: 0, depth: 0 };
    let sepSeen = null;
    const picks = [];
    const nearPeople = folks.filter((p) => Math.hypot(p.x - door.x, p.z - door.z) < 9);
    for (const person of nearPeople) {
      for (const car of cars) {
        const gap = Math.hypot(car.x - person.x, car.z - person.z);
        if (gap < 2.2 || gap > 12) continue;
        const sx = -car.lz;
        const sz = car.lx;
        const midX = person.x;
        const midZ = person.z;
        for (const side of [1, -1]) {
          for (const dist of [7, 9, 11]) {
            for (const along of [-3, 0, 3.5]) {
            const px = midX + sx * side * dist + car.lx * along;
            const pz = midZ + sz * side * dist + car.lz * along;
            const gy = a.query.groundHeight(px, pz);
            if (a.query.insideSolid(px, gy + 1.4, pz, 0.28, true)) { rej.solid++; continue; }
            const eye = 1.62;
            const eyeY = gy + eye;
            const lookY = person.y + 1.05 * person.s;
            const yaw = Math.atan2(midX - px, -(midZ - pz));
            const horiz = Math.hypot(midX - px, midZ - pz) || 1;
            const pitch = Math.atan2(lookY - eyeY, horiz);
            cam.position.set(px, eyeY, pz);
            cam.rotation.set(pitch, -yaw, 0, 'YXZ');
            cam.updateMatrixWorld();
            const half = car.len * 2.44;
            const endA = ndc(car.x - car.lx * half, car.y + 0.75, car.z - car.lz * half);
            const endB = ndc(car.x + car.lx * half, car.y + 0.75, car.z + car.lz * half);
            const mid = ndc(car.x, car.y + 0.9, car.z);
            if (!endA || !endB || !mid) { rej.ends++; continue; }
            const sep = Math.hypot(endA.x - endB.x, endA.y - endB.y);
            if (!sepSeen || (sep < 5 && sep > sepSeen)) sepSeen = Math.round(sep * 100) / 100;
            if (sep < 0.16 || sep > 1.05) { rej.sep++; continue; }
            if ([endA, endB, mid].some((n) => Math.abs(n.x) > 0.9 || n.y < -0.72 || n.y > 0.7)) { rej.sep++; continue; }
            const head = ndc(person.x, person.y + 1.72 * person.s, person.z);
            const feet = ndc(person.x, person.y + 0.04, person.z);
            if (!head || !feet) { rej.person++; continue; }
            const span = Math.abs(head.y - feet.y);
            const hx = (head.x + feet.x) * 0.5;
            if (span < 0.22 || span > 0.9 || Math.abs(hx) > 0.7 || feet.y < -0.92 || head.y > 0.95) { rej.person++; continue; }
            const waistY = (head.y + feet.y) * 0.5;
            if (Math.abs(mid.y - waistY) > 0.55) { rej.depth++; continue; }
            sawCar++;
            const doorN = ndc(door.x, door.y + 1.15, door.z);
            if (!doorN || Math.abs(doorN.x) > 0.72 || Math.abs(doorN.y) > 0.62) { rej.door++; continue; }
            // The car has to sit on the lit opening, or a night-black body disappears into the street.
            if (Math.hypot(mid.x - doorN.x, mid.y - doorN.y) > 0.42) { rej.door++; continue; }
            sawDoor++;
            const score = Math.abs(sep - 0.36) * 2 + Math.abs(span - 0.4) + Math.hypot(mid.x - doorN.x, mid.y - doorN.y) * 3;
            picks.push({
              score, dist, lat: along, doorN, px, pz, gy, yaw, pitch, eye,
              person: { d: Math.round(Math.hypot(person.x - door.x, person.z - door.z) * 10) / 10, x: Math.round(hx * 100) / 100, span: Math.round(span * 100) / 100 },
              car: { name: car.name, d: Math.round(car.d * 10) / 10, sep: Math.round(sep * 100) / 100, x: Math.round(mid.x * 100) / 100 },
            });
            }
          }
        }
      }
    }
    picks.sort((a, b) => a.score - b.score);
    const top = picks.slice(0, 3);
    window.__doorPicks = top;
    if (top[0]) {
      const pick = top[0];
      cam.position.set(pick.px, pick.gy + (pick.eye || 1.65), pick.pz);
      cam.rotation.set(pick.pitch, -pick.yaw, 0, 'YXZ');
      cam.updateMatrixWorld();
    }
    return {
      ok: top.length > 0,
      sawDoor, sawCar, nearCars, people: folks.length, nCars: cars.length,
      rej, sepSeen,
      carLens: cars.slice(0, 4).map((c) => ({ name: c.name, d: Math.round(c.d), len: Math.round(c.len * 10) / 10 })),
      picks: top.map((p) => ({ dist: p.dist, lat: p.lat, score: Math.round(p.score * 100) / 100, car: p.car, person: p.person })),
    };
  }, base);
  console.log(quality, JSON.stringify(found));
  if (!found?.ok) return false;
  const { mkdirSync } = await import('node:fs');
  mkdirSync('/tmp/door-tries', { recursive: true });
  for (let i = 0; i < found.picks.length; i++) {
    await page.evaluate((i) => {
      const p = window.__doorPicks[i];
      const cam = window.__nla.app.camera;
      cam.position.set(p.px, p.gy + (p.eye || 1.65), p.pz);
      cam.rotation.set(p.pitch, -p.yaw, 0, 'YXZ');
      cam.updateMatrixWorld();
    }, i);
    await page.waitForTimeout(200);
    const path = i === 0 ? `${OUT}/scale-door-car-${quality}.png` : `/tmp/door-tries/${quality}-${i}.png`;
    await page.screenshot({ path, timeout: 180000, animations: 'disabled' });
    console.log('wrote', path);
  }
  return true;
}

try {
  const which = process.env.QUALITY || 'both';
  if (which !== 'ultra') await shoot('medium');
  if (which !== 'medium') await shoot('ultra');
} finally {
  await browser.close();
}
