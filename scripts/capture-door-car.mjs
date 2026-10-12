// Ultra scale shot. Wait until a car is in the near lane by the Bradbury
// opening, then stand just behind that car so the person, the lit door, and
// the car's length are all in frame. Writes only /tmp/door-car/.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const OUT = '/tmp/door-car';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);

await page.goto(
  'http://127.0.0.1:5173/?mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&quality=ultra&webgl=1',
  { waitUntil: 'domcontentloaded', timeout: 90000 },
);
await page.waitForFunction(() => window.__nla && window.__nla.stats, { timeout: 90000 });

const found = await page.evaluate(async () => {
  document.getElementById('loading')?.remove();
  const a = window.__nla.app;
  await window.__nla.broadwayView('bradbury');
  const w = a.cams.walk;
  const cam = a.camera;
  const q = a.query;
  const rain = a.atmosphere?.weather?.params?.rain ?? 0.8;
  cam.position.set(w.pos.x, w.pos.y + 1.7, w.pos.z);
  cam.rotation.set(w.pitch, -w.heading, 0, 'YXZ');
  for (let i = 0; i < 8; i++) {
    a.crowd.update(0.2, w.pos.x, w.pos.z, q, a.quality, rain, a.elapsed, w.heading);
    a.ground.update(0.05, cam, a.quality.groundTraffic, a.quality.freewayTraffic, a.quality.tier, a.elapsed);
  }
  let door = null;
  a.scene.traverse((o) => {
    if (door || o.name !== 'arch-door-leaf') return;
    o.updateWorldMatrix(true, false);
    const e = o.matrixWorld.elements;
    if (Math.hypot(e[12] - w.pos.x, e[14] - w.pos.z) > 80) return;
    door = { x: e[12], y: e[13], z: e[14] };
  });
  if (!door) return { ok: false, reason: 'no-door' };
  const gy0 = q.groundHeight(door.x, door.z);

  function carList() {
    const out = [];
    a.scene.traverse((o) => {
      if (!o.isInstancedMesh || (o.name !== 'ground-car' && o.name !== 'ground-van')) return;
      const m = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) {
        const b = i * 16;
        const x = m[b + 12];
        const y = m[b + 13];
        const z = m[b + 14];
        if (x > 1e5) continue;
        const c2x = m[b + 8], c2y = m[b + 9], c2z = m[b + 10];
        const c1x = m[b + 4], c1y = m[b + 5], c1z = m[b + 6];
        const scale = Math.hypot(c2x, c2z) || 1;
        const half = 2.44;
        out.push({
          name: o.name, x, y, z, scale,
          fx: -c2x / scale, fz: -c2z / scale,
          front: { x: x + c1x * 0.46 + c2x * -half, y: y + c1y * 0.46 + c2y * -half, z: z + c1z * 0.46 + c2z * -half },
          rear: { x: x + c1x * 0.42 + c2x * half, y: y + c1y * 0.42 + c2y * half, z: z + c1z * 0.42 + c2z * half },
        });
      }
    });
    return out;
  }

  // Street direction: the clear side of the door.
  let street = null;
  for (let k = 0; k < 36; k++) {
    const ang = (k / 36) * Math.PI * 2;
    const dx = Math.sin(ang);
    const dz = Math.cos(ang);
    let clear = 0;
    for (const d of [2.4, 5, 8, 12]) {
      if (!q.insideSolid(door.x + dx * d, gy0 + 1.25, door.z + dz * d, 0.2, true)) clear++;
    }
    let wall = 0;
    for (const d of [0.55, 1.1, 1.9]) {
      if (q.insideSolid(door.x - dx * d, gy0 + 1.25, door.z - dz * d, 0.18, true)) wall++;
    }
    const score = wall * 4 + clear;
    if (wall < 1 || clear < 2) continue;
    if (!street || score > street.score) street = { dx, dz, score, clear, wall };
  }
  if (!street) return { ok: false, reason: 'no-street' };
  const outward = { x: street.dx, z: street.dz };
  const along = { x: -outward.z, z: outward.x };
  let opening = { x: door.x, z: door.z };
  for (const s of [1, -1]) {
    const x = door.x + along.x * s * 1.1;
    const z = door.z + along.z * s * 1.1;
    if (!q.insideSolid(x + outward.x * 0.6, gy0 + 1.15, z + outward.z * 0.6, 0.18, true)) {
      opening = { x, z };
      break;
    }
  }

  // Look down the street so traffic anchors on this block. Step until a car
  // sits in the near lane, a few metres out from the opening.
  const standX = opening.x + outward.x * 3.2;
  const standZ = opening.z + outward.z * 3.2;
  const standY = q.groundHeight(standX, standZ);
  w.pos.set(standX, standY, standZ);
  const lookX = standX + along.x * 20;
  const lookZ = standZ + along.z * 20;
  const yaw0 = Math.atan2(lookX - standX, -(lookZ - standZ));
  cam.position.set(standX, standY + 1.5, standZ);
  cam.rotation.set(0, -yaw0, 0, 'YXZ');
  cam.updateMatrixWorld();
  let bestApproach = 99;
  let held = null;
  const trace = [];
  for (let i = 0; i < 360; i++) {
    const elapsed = a.elapsed + i * 0.05;
    a.crowd.update(0.05, standX, standZ, q, a.quality, rain, elapsed, yaw0);
    a.ground.update(0.05, cam, a.quality.groundTraffic, a.quality.freewayTraffic, a.quality.tier, elapsed);
    if (i % 4 !== 3) continue;
    let near = null;
    for (const c of carList()) {
      const ox = (c.x - opening.x) * outward.x + (c.z - opening.z) * outward.z;
      const ax = (c.x - opening.x) * along.x + (c.z - opening.z) * along.z;
      const dist = Math.hypot(c.x - opening.x, c.z - opening.z);
      if (dist < bestApproach) bestApproach = dist;
      if (ox > 3.2 && ox < 9.5 && Math.abs(ax) < 7 && dist < (near ? near.dist : 99)) near = { ...c, ox, ax, dist };
    }
    if (i % 40 === 39) trace.push(Math.round(bestApproach * 10) / 10);
    if (near) { held = near; break; }
  }
  if (!held) return { ok: false, reason: 'no-near-car', bestApproach: Math.round(bestApproach * 10) / 10, trace };

  const crowdStep = a.crowd.update.bind(a.crowd);
  const groundStep = a.ground.update.bind(a.ground);
  a.crowd.update = () => {};
  w.update = () => {};
  a.ground.update = () => {};
  // The car is frozen. Keep walking until someone is on the sidewalk by the opening.
  let nearest = 999;
  let nearestAt = null;
  const pinX = opening.x + outward.x * 2.4;
  const pinZ = opening.z + outward.z * 2.4;
  for (let i = 0; i < 180; i++) {
    crowdStep(0.42, pinX, pinZ, q, a.quality, rain, a.elapsed + i * 0.42, yaw0);
    for (const p of people()) {
      const d = Math.hypot(p.x - opening.x, p.z - opening.z);
      if (d < nearest) {
        nearest = d;
        nearestAt = {
          d: Math.round(d * 10) / 10,
          out: Math.round(((p.x - opening.x) * outward.x + (p.z - opening.z) * outward.z) * 10) / 10,
          along: Math.round(((p.x - opening.x) * along.x + (p.z - opening.z) * along.z) * 10) / 10,
        };
      }
    }
    if (nearest < 4.8) break;
  }

  function ndc(x, y, z) {
    cam.updateMatrixWorld();
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
  const folks = people()
    .map((p) => ({ ...p, d: Math.hypot(p.x - opening.x, p.z - opening.z) }))
    .filter((p) => p.d < 12)
    .sort((a, b) => a.d - b.d);
  const picks = [];
  const who = folks[0];
  if (!who) return { ok: false, reason: 'no-person', nearest, trace };
  // Close cameras around the walker. Traffic keeps moving until a car sits in the foreground.
  const poses = [];
  let closestCar = 999;
  for (const back of [4.8, 6.2, 7.6, 9.0]) {
    for (const slide of [-2.4, -0.8, 0.8, 2.2]) {
      for (const eye of [1.15, 1.4]) {
        const px = who.x + outward.x * back + along.x * slide;
        const pz = who.z + outward.z * back + along.z * slide;
        const gy = q.groundHeight(px, pz);
        if (Math.abs(gy - gy0) > 2 || q.insideSolid(px, gy + 1.15, pz, 0.22, true)) continue;
        poses.push({ px, pz, gy, eye, back, slide });
      }
    }
  }
  let steps = 0;
  for (let step = 0; step < 180; step++) {
    steps = step + 1;
    groundStep(0.05, cam, a.quality.groundTraffic, a.quality.freewayTraffic, a.quality.tier, a.elapsed + step * 0.05);
    const carsNow = carList().filter((c) => Math.hypot(c.x - opening.x, c.z - opening.z) < 16);
    if (!carsNow.length) continue;
    for (const pose of poses) {
      const aim = { x: opening.x * 0.55 + who.x * 0.45, z: opening.z * 0.55 + who.z * 0.45 };
      const yaw = Math.atan2(aim.x - pose.px, -(aim.z - pose.pz));
      const dist = Math.hypot(aim.x - pose.px, aim.z - pose.pz) || 1;
      const pitch = Math.atan2((gy0 + 1.15) - (pose.gy + pose.eye), dist);
      cam.position.set(pose.px, pose.gy + pose.eye, pose.pz);
      cam.rotation.set(pitch, -yaw, 0, 'YXZ');
      cam.updateMatrixWorld();
      const head = ndc(who.x, who.y + 1.72 * who.s, who.z);
      const feet = ndc(who.x, who.y + 0.05, who.z);
      if (!head || !feet) continue;
      const span = Math.abs(head.y - feet.y);
      const hx = (head.x + feet.x) * 0.5;
      if (span < 0.26 || Math.abs(hx) > 0.5) continue;
      const doorN = ndc(opening.x, gy0 + 1.15, opening.z);
      const doorTop = ndc(opening.x, gy0 + 2.2, opening.z);
      const doorBot = ndc(opening.x, gy0 + 0.1, opening.z);
      if (!doorN || !doorTop || !doorBot) continue;
      const doorSpan = Math.abs(doorTop.y - doorBot.y);
      if (doorSpan < 0.24 || Math.abs(doorN.x) > 0.4) continue;
      let bestC = null;
      for (const car of carsNow) {
        const front = ndc(car.front.x, car.front.y, car.front.z);
        const rear = ndc(car.rear.x, car.rear.y, car.rear.z);
        const mid = ndc(car.x, car.y + 0.7, car.z);
        const roof = ndc(car.x, car.y + 1.35, car.z);
        if (!front || !rear || !mid || !roof) continue;
        const sep = Math.hypot(front.x - rear.x, front.y - rear.y);
        const camDist = Math.hypot(pose.px - car.x, pose.pz - car.z);
        if (camDist < closestCar) closestCar = camDist;
        if (camDist < 3.4 || camDist > 7.2) continue;
        if (sep < 0.28 || sep > 1.1) continue;
        if (mid.y > 0.05 || Math.abs(mid.x) > 0.9) continue;
        if (!bestC || camDist < bestC.camDist) bestC = { sep, midY: mid.y, name: car.name, camDist };
      }
      if (!bestC) continue;
      const score = Math.abs(span - 0.42) * 2 + Math.abs(hx) + Math.abs(doorN.x) + Math.abs(bestC.sep - 0.45);
      picks.push({
        score, px: pose.px, pz: pose.pz, gy: pose.gy, yaw, pitch, eye: pose.eye, back: pose.back, slide: pose.slide,
        person: { span: Math.round(span * 100) / 100, x: Math.round(hx * 100) / 100 },
        car: { sep: Math.round(bestC.sep * 100) / 100, midY: Math.round(bestC.midY * 100) / 100, name: bestC.name },
        door: { x: Math.round(doorN.x * 100) / 100, span: Math.round(doorSpan * 100) / 100 },
      });
    }
    if (picks.length >= 4) break;
  }
  picks.sort((a, b) => a.score - b.score);
  const top = [];
  for (const p of picks) {
    if (top.some((t) => Math.hypot(t.px - p.px, t.pz - p.pz) < 0.6)) continue;
    top.push(p);
    if (top.length === 6) break;
  }
  window.__doorCar = top;
  return {
    ok: top.length > 0,
    steps,
    closestCar: Math.round(closestCar * 10) / 10,
    poses: poses.length,
    folks: folks.length,
    nearest,
    trace,
    picks: top.map((p) => ({ score: Math.round(p.score * 100) / 100, person: p.person, car: p.car, door: p.door, back: p.back, slide: p.slide, eye: p.eye })),
  };
});
console.log(JSON.stringify(found));
if (!found?.ok) {
  await browser.close();
  process.exit(2);
}
const n = await page.evaluate(() => window.__doorCar.length);
for (let i = 0; i < n; i++) {
  await page.evaluate((i) => {
    const p = window.__doorCar[i];
    const cam = window.__nla.app.camera;
    cam.position.set(p.px, p.gy + p.eye, p.pz);
    cam.rotation.set(p.pitch, -p.yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
  }, i);
  await page.screenshot({ path: `${OUT}/${i}.png`, timeout: 180000, animations: 'disabled' });
  console.log('shot', i);
}
await browser.close();
console.log('DOOR_CAR_DONE');
