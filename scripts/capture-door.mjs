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
    let pick = null;
    let sawDoor = 0;
    let sawCar = 0;
    const picks = [];
    for (const dist of [8, 9, 10]) {
      for (let lat = -8; lat <= -3.5; lat += 0.5) {
        const fx = Math.sin(base);
        const fz = Math.cos(base);
        const rx = Math.cos(base);
        const rz = -Math.sin(base);
        const px = door.x + fx * dist + rx * lat;
        const pz = door.z + fz * dist + rz * lat;
        const gy = a.query.groundHeight(px, pz);
        if (a.query.insideSolid(px, gy + 1.2, pz, 0.2, true)) continue;
        const eyeY = gy + 1.5;
        const yaw = Math.atan2(door.x - px, -(door.z - pz));
        const horiz = Math.hypot(door.x - px, door.z - pz) || 1;
        const pitch = Math.atan2((door.y + 1.2) - eyeY, horiz);
        cam.position.set(px, eyeY, pz);
        cam.rotation.set(pitch, -yaw, 0, 'YXZ');
        cam.updateMatrixWorld();
        const doorN = ndc(door.x, door.y + 1.1, door.z);
        if (!doorN || Math.abs(doorN.x) > 0.5 || Math.abs(doorN.y) > 0.5) continue;
        sawDoor++;
        let car = null;
        a.scene.traverse((o) => {
          if (car || !o.isInstancedMesh) return;
          if (o.name !== 'ground-car' && o.name !== 'ground-van') return;
          const m = o.instanceMatrix.array;
          for (let i = 0; i < Math.min(o.count, 160); i++) {
            const x = m[i * 16 + 12];
            const y = m[i * 16 + 13];
            const z = m[i * 16 + 14];
            if (x > 1e5) continue;
            const d = Math.hypot(x - door.x, z - door.z);
            if (d < 3 || d > 26) continue;
            const n = ndc(x, y + 0.75, z);
            if (!n || Math.abs(n.x) > 0.9 || Math.abs(n.y) > 0.7) continue;
            if (Math.abs(n.x) < 0.12) continue;
            car = { name: o.name, d: Math.round(d * 10) / 10, x: Math.round(n.x * 100) / 100, wx: x, wz: z };
            return;
          }
        });
        if (!car) continue;
        sawCar++;
        let person = null;
        for (const p of folks) {
          const d = Math.hypot(p.x - door.x, p.z - door.z);
          if (d > 7) continue;
          const head = ndc(p.x, p.y + 1.7 * p.s, p.z);
          const feet = ndc(p.x, p.y + 0.05, p.z);
          if (!head || !feet) continue;
          const span = Math.abs(head.y - feet.y);
          const x = (head.x + feet.x) * 0.5;
          if (Math.abs(x) > 0.75 || span < 0.18) continue;
          if (!person || span > person.span) person = { d: Math.round(d * 10) / 10, x: Math.round(x * 100) / 100, span: Math.round(span * 100) / 100 };
        }
        if (!person || Math.abs(car.x) < 0.22 || Math.abs(car.x) > 0.88) continue;
        const camCar = Math.hypot(px - car.wx, pz - car.wz);
        if (camCar < 4.5) continue;
        const score = Math.abs(doorN.x) * 2 + Math.abs(lat + 5.5) * 0.15 + Math.abs(0.4 - person.span);
        picks.push({ score, dist, lat, doorN, car, person, px, pz, gy, yaw, pitch });
      }
    }
    picks.sort((a, b) => a.score - b.score);
    const top = picks.slice(0, 3);
    window.__doorPicks = top;
    if (top[0]) {
      const pick = top[0];
      cam.position.set(pick.px, pick.gy + 1.5, pick.pz);
      cam.rotation.set(pick.pitch, -pick.yaw, 0, 'YXZ');
      cam.updateMatrixWorld();
    }
    return {
      ok: top.length > 0,
      sawDoor, sawCar, nearCars, people: folks.length,
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
      cam.position.set(p.px, p.gy + 1.5, p.pz);
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
