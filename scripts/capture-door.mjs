// Close street-level scale shot: a person, the lit Bradbury opening, and a car
// whose lamps and length are both in frame. Camera stays on the sidewalk.
import { chromium } from 'playwright';
import { mkdirSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const OUT = '/workspace/docs/humans/after';
const TRIES = '/tmp/door-tries';
mkdirSync(TRIES, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);

function lampScore(path, box) {
  const py = spawnSync('python3', ['-c', `
import json, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
x0, y0, x1, y1 = [float(v) for v in sys.argv[2:6]]
x0 = max(0, int(x0 * w)); x1 = min(w, int(x1 * w))
y0 = max(0, int(y0 * h)); y1 = min(h, int(y1 * h))
if x1 <= x0 or y1 <= y0:
    print(json.dumps({"lamps": 0, "white": 0, "red": 0}))
    raise SystemExit
px = im.crop((x0, y0, x1, y1)).getdata()
white = red = amber = 0
for r, g, b in px:
    if r > 200 and g > 165 and b > 100 and r + g + b > 500:
        white += 1
    elif r > 155 and g < 95 and b < 90 and r > g + 55:
        red += 1
    elif r > 140 and g > 70 and b < 130 and r > b + 35:
        amber += 1
print(json.dumps({"lamps": white + red, "white": white, "red": red, "amber": amber}))
`, path, String(box.x0), String(box.y0), String(box.x1), String(box.y1)], { encoding: 'utf8' });
  if (py.status !== 0) return { lamps: 0, white: 0, red: 0, err: py.stderr?.slice(0, 180) };
  return JSON.parse(py.stdout);
}

async function shoot(quality) {
  await page.goto(
    `http://127.0.0.1:5173/?mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&quality=${quality}&webgl=1`,
    { waitUntil: 'domcontentloaded', timeout: 90000 },
  );
  await page.waitForFunction(() => window.__nla && window.__nla.stats, { timeout: 90000 });
  const found = await page.evaluate(async () => {
    document.getElementById('loading')?.remove();
    const a = window.__nla.app;
    await window.__nla.broadwayView('bradbury');
    const w = a.cams.walk;
    a.camera.position.set(w.pos.x, w.pos.y + 1.7, w.pos.z);
    a.camera.rotation.set(w.pitch, -w.heading, 0, 'YXZ');
    const rain = a.atmosphere?.weather?.params?.rain ?? 0.8;
    for (let i = 0; i < 10; i++) {
      a.crowd.update(0.2, w.pos.x, w.pos.z, a.query, a.quality, rain, a.elapsed, w.heading);
      a.ground.update(0.2, a.camera, a.quality.groundTraffic, a.quality.freewayTraffic, a.quality.tier, a.elapsed);
    }
    let doorPump = null;
    a.scene.traverse((o) => {
      if (doorPump || o.name !== 'arch-door-leaf') return;
      o.updateWorldMatrix(true, false);
      const e = o.matrixWorld.elements;
      if (Math.hypot(e[12] - w.pos.x, e[14] - w.pos.z) > 80) return;
      doorPump = { x: e[12], z: e[14] };
    });
    if (doorPump) {
      const gx = doorPump.x - w.pos.x;
      const gz = doorPump.z - w.pos.z;
      const gl = Math.hypot(gx, gz) || 1;
      w.pos.x = doorPump.x - (gx / gl) * 8;
      w.pos.z = doorPump.z - (gz / gl) * 8;
      const gy = a.query.groundHeight(w.pos.x, w.pos.z);
      w.pos.y = gy;
      a.camera.position.set(w.pos.x, gy + 1.6, w.pos.z);
    }
    for (let i = 0; i < 18; i++) {
      a.crowd.update(0.25, w.pos.x, w.pos.z, a.query, a.quality, rain, a.elapsed, w.heading);
      a.ground.update(0.2, a.camera, a.quality.groundTraffic, a.quality.freewayTraffic, a.quality.tier, a.elapsed);
    }
    const crowdStep = a.crowd.update.bind(a.crowd);
    const groundStep = a.ground.update.bind(a.ground);
    a.crowd.update = () => {};
    w.update = () => {};
    a.ground.update = () => {};
    const rainNow = a.atmosphere?.weather?.params?.rain ?? 0.8;
    function walkPeople(n) {
      for (let i = 0; i < n; i++) {
        crowdStep(0.42, w.pos.x, w.pos.z, a.query, a.quality, rainNow, a.elapsed, w.heading);
        groundStep(0.2, a.camera, a.quality.groundTraffic, a.quality.freewayTraffic, a.quality.tier, a.elapsed);
      }
    }
    a.camera.updateMatrixWorld();
    const basisE = a.camera.matrixWorld.elements;
    const basisL = Math.hypot(basisE[8], basisE[10]) || 1;
    const inward = { x: -basisE[8] / basisL, z: -basisE[10] / basisL };
    const slide = { x: -inward.z, z: inward.x };
    const stand = { x: w.pos.x, z: w.pos.z };
    const q = a.query;
    const cam = a.camera;

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
    let door = null;
    a.scene.traverse((o) => {
      if (door || o.name !== 'arch-door-leaf') return;
      o.updateWorldMatrix(true, false);
      const e = o.matrixWorld.elements;
      if (Math.hypot(e[12] - w.pos.x, e[14] - w.pos.z) > 70) return;
      door = { x: e[12], y: e[13], z: e[14] };
    });
    if (!door) return { ok: false, reason: 'no-door' };
    const gy0 = q.groundHeight(door.x, door.z);
    const dot = (x, z, dir) => x * dir.x + z * dir.z;
    const nearRaw = [];
    a.scene.traverse((o) => {
      if (!o.isInstancedMesh || (o.name !== 'ground-car' && o.name !== 'ground-van')) return;
      const m = o.instanceMatrix.array;
      for (let i = 0; i < Math.min(o.count, 180); i++) {
        const b = i * 16;
        const x = m[b + 12];
        const z = m[b + 14];
        if (x > 1e5) continue;
        const d = Math.hypot(x - door.x, z - door.z);
        if (d > 3 && d < 22) nearRaw.push({ x, z, d });
      }
    });
    nearRaw.sort((a, b) => a.d - b.d);
    let sx = 0;
    let sz = 0;
    for (const c of nearRaw.slice(0, 4)) {
      sx += (c.x - door.x) / c.d;
      sz += (c.z - door.z) / c.d;
    }
    const sl = Math.hypot(sx, sz) || 1;
    const seed = { x: sx / sl, z: sz / sl };
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
      const align = dx * seed.x + dz * seed.z;
      const score = wall * 4 + clear + Math.max(0, align) * 3;
      if (wall < 1 || clear < 2) continue;
      if (!street || score > street.score) street = { clear, wall, dx, dz, score, align: Math.round(align * 100) / 100 };
    }
    if (!street) return { ok: false, reason: 'no-street', rawCars: nearRaw.length };
    const outward = { x: street.dx, z: street.dz };
    const along = { x: -outward.z, z: outward.x };
    let opening = { x: door.x, z: door.z };
    for (const s of [1, -1]) {
      const x = door.x + along.x * s * 1.1;
      const z = door.z + along.z * s * 1.1;
      const open = !q.insideSolid(x + outward.x * 0.6, gy0 + 1.15, z + outward.z * 0.6, 0.18, true);
      if (open) { opening = { x, z }; break; }
    }

    const allNear = people().filter((p) => Math.hypot(p.x - door.x, p.z - door.z) < 10);
    let folks = allNear.filter((p) => {
      const out = dot(p.x - door.x, p.z - door.z, outward);
      return out > -0.4 && out < 5.2;
    });
    if (!folks.length) folks = allNear.slice(0, 8);
    const cars = [];
    a.scene.traverse((o) => {
      if (!o.isInstancedMesh || (o.name !== 'ground-car' && o.name !== 'ground-van')) return;
      const m = o.instanceMatrix.array;
      for (let i = 0; i < Math.min(o.count, 180); i++) {
        const b = i * 16;
        const x = m[b + 12];
        const y = m[b + 13];
        const z = m[b + 14];
        if (x > 1e5) continue;
        const c1x = m[b + 4], c1y = m[b + 5], c1z = m[b + 6];
        const c2x = m[b + 8], c2y = m[b + 9], c2z = m[b + 10];
        const scale = Math.hypot(c2x, c2z) || 1;
        const out = dot(x - door.x, z - door.z, outward);
        const dist = Math.hypot(x - door.x, z - door.z);
        if (dist < 3.5 || dist > 18 || out < 1.5) continue;
        const half = 2.44;
        cars.push({
          name: o.name, x, y, z, scale, out,
          fx: -c2x / scale, fz: -c2z / scale,
          front: {
            x: x + c1x * 0.45 + c2x * -half,
            y: y + c1y * 0.45 + c2y * -half,
            z: z + c1z * 0.45 + c2z * -half,
          },
          rear: {
            x: x + c1x * 0.42 + c2x * half,
            y: y + c1y * 0.42 + c2y * half,
            z: z + c1z * 0.42 + c2z * half,
          },
        });
      }
    });

    const rej = { solid: 0, face: 0, person: 0, door: 0, car: 0, lamp: 0, off: 0, sep: 0, edge: 0, depth: 0 };
    const samples = [];
    const picks = [];
    function clearCam(px, pz, gy) {
      if (q.insideSolid(px, gy + 1.2, pz, 0.28, true)) return false;
      let walls = 0;
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        if (q.insideSolid(px + Math.sin(ang) * 1.6, gy + 1.2, pz + Math.cos(ang) * 1.6, 0.16, true)) walls++;
      }
      return walls <= 4;
    }
    function ndcBox(xs, ys, pad) {
      return {
        x0: Math.min(...xs) * 0.5 + 0.5 - pad,
        x1: Math.max(...xs) * 0.5 + 0.5 + pad,
        y0: 1 - (Math.max(...ys) * 0.5 + 0.5) - pad,
        y1: 1 - (Math.min(...ys) * 0.5 + 0.5) + pad,
      };
    }
    for (const person of folks) {
      const pOut = dot(person.x - door.x, person.z - door.z, outward);
      if (Math.hypot(person.x - opening.x, person.z - opening.z) > 14) continue;
      for (const car of cars) {
        const gap = Math.hypot(car.x - person.x, car.z - person.z);
        if (gap < 2.2 || gap > 11) continue;
        if (car.out < pOut + 1.2) continue;
        const sx = -car.fz;
        const sz = car.fx;
        const doorSide = (opening.x - car.x) * sx + (opening.z - car.z) * sz;
        const streetSign = doorSide < 0 ? 1 : -1;
        for (const sideDist of [4.5, 6.2, 8]) {
          for (const ahead of [-2.2, 0.8, 3.2]) {
              const px = car.x + sx * streetSign * sideDist + car.fx * ahead;
              const pz = car.z + sz * streetSign * sideDist + car.fz * ahead;
              const gy = q.groundHeight(px, pz);
              if (Math.abs(gy - gy0) > 1.4) { rej.solid++; continue; }
              if (cars.some((c) => Math.hypot(c.x - px, c.z - pz) < 3.2)) { rej.solid++; continue; }
              if (!clearCam(px, pz, gy)) { rej.solid++; continue; }
              const toX = opening.x - px;
              const toZ = opening.z - pz;
              const toL = Math.hypot(toX, toZ) || 1;
              if ((toX * outward.x + toZ * outward.z) / toL > -0.2) { rej.face++; continue; }
              const eye = 1.32;
              const eyeY = gy + eye;
              const lookX = opening.x * 0.5 + car.x * 0.28 + person.x * 0.22;
              const lookZ = opening.z * 0.5 + car.z * 0.28 + person.z * 0.22;
              const lookY = gy0 + 1.2;
              const yaw = Math.atan2(lookX - px, -(lookZ - pz));
              const horiz = Math.hypot(lookX - px, lookZ - pz) || 1;
              const pitch = Math.atan2(lookY - eyeY, horiz);
              cam.position.set(px, eyeY, pz);
              cam.rotation.set(pitch, -yaw, 0, 'YXZ');
              cam.updateMatrixWorld();
              const head = ndc(person.x, person.y + 1.72 * person.s, person.z);
              const feet = ndc(person.x, person.y + 0.05, person.z);
              if (!head || !feet) { rej.person++; continue; }
              const span = Math.abs(head.y - feet.y);
              const hx = (head.x + feet.x) * 0.5;
              if (span < 0.32 || span > 0.85 || Math.abs(hx) > 0.62 || feet.y < -0.88 || head.y > 0.92) { rej.person++; continue; }
              const doorN = ndc(opening.x, gy0 + 1.15, opening.z);
              const doorTop = ndc(opening.x, gy0 + 2.2, opening.z);
              const doorBot = ndc(opening.x, gy0 + 0.15, opening.z);
              if (!doorN || !doorTop || !doorBot) { rej.door++; continue; }
              if (Math.abs(doorN.x) > 0.42 || Math.abs(doorN.y) > 0.45) { rej.door++; continue; }
              const doorSpan = Math.abs(doorTop.y - doorBot.y);
              if (doorSpan < 0.28) { rej.door++; continue; }
              if (Math.abs(hx - doorN.x) > 0.48) { rej.person++; continue; }
              const front = ndc(car.front.x, car.front.y, car.front.z);
              const rear = ndc(car.rear.x, car.rear.y, car.rear.z);
              const mid = ndc(car.x, car.y + 0.75, car.z);
              if (!front || !rear || !mid) {
                rej.off++;
                if (samples.length < 6) samples.push({ why: 'off', front: !!front, rear: !!rear, mid: !!mid });
                continue;
              }
              const sep = Math.hypot(front.x - rear.x, front.y - rear.y);
              const roof = ndc(car.x, car.y + 1.35, car.z);
              const belly = ndc(car.x, car.y + 0.28, car.z);
              const vspan = roof && belly ? Math.abs(roof.y - belly.y) : 0;
              if (sep < 0.22 || sep > 0.95 || vspan < 0.06 || sep < vspan * 1.05) {
                rej.sep++;
                if (samples.filter((s) => s.why === 'sep').length < 4) samples.push({ why: 'sep', sep: Math.round(sep * 100) / 100, vspan: Math.round(vspan * 100) / 100, fx: Math.round(front.x * 100) / 100, rx: Math.round(rear.x * 100) / 100 });
                continue;
              }
              if ([front, rear, mid].some((n) => Math.abs(n.x) > 0.92 || n.y < -0.88 || n.y > 0.72)) {
                rej.edge++;
                if (samples.length < 6) samples.push({ why: 'edge', sep: Math.round(sep * 100) / 100, fx: Math.round(front.x * 100) / 100, rx: Math.round(rear.x * 100) / 100, my: Math.round(mid.y * 100) / 100 });
                continue;
              }
              const camDistC = Math.hypot(px - car.x, pz - car.z);
              const camDistD = Math.hypot(px - opening.x, pz - opening.z);
              if (camDistC + 1.4 < camDistD) {
                rej.depth++;
                if (samples.length < 6) samples.push({ why: 'depth', car: Math.round(camDistC * 10) / 10, door: Math.round(camDistD * 10) / 10 });
                continue;
              }
              const toF = Math.hypot(px - car.front.x, pz - car.front.z) || 1;
              const toR = Math.hypot(px - car.rear.x, pz - car.rear.z) || 1;
              const frontFace = ((px - car.front.x) * car.fx + (pz - car.front.z) * car.fz) / toF;
              const rearFace = ((px - car.rear.x) * -car.fx + (pz - car.rear.z) * -car.fz) / toR;
              const beside = Math.abs(mid.x - doorN.x);
              if (beside < 0.12 || beside > 0.72) { rej.edge++; continue; }
              const frontOk = frontFace > 0.05 && Math.abs(front.x) < 0.9;
              const rearOk = rearFace > 0.05 && Math.abs(rear.x) < 0.9;
              if (!frontOk && !rearOk) { rej.lamp++; continue; }
              const box = ndcBox(
                [front.x, rear.x, mid.x],
                [front.y, rear.y, mid.y, roof ? roof.y : mid.y, belly ? belly.y : mid.y],
                0.02,
              );
              const doorBox = ndcBox([doorN.x, doorN.x], [doorTop.y, doorBot.y], 0.03);
              const score = Math.abs(span - 0.48) + Math.abs(doorN.x) * 0.8 + Math.abs(hx - doorN.x) + Math.abs(sep - 0.4);
              picks.push({
                score, px, pz, gy, yaw, pitch, eye, box, doorBox,
                person: { span: Math.round(span * 100) / 100, x: Math.round(hx * 100) / 100 },
                car: { name: car.name, sep: Math.round(sep * 100) / 100, face: Math.round(Math.max(frontFace, rearFace) * 100) / 100, lamp: frontOk ? 'front' : 'rear' },
                door: { x: Math.round(doorN.x * 100) / 100, span: Math.round(doorSpan * 100) / 100 },
              });
            }
          }
        }
      }
    const near = [];
    for (const slideM of [-8, -5, -2, 0, 2, 5, 8]) {
      for (const closer of [2, 3.5, 5, 6.5, 8]) {
        const px = stand.x + slide.x * slideM + inward.x * closer;
        const pz = stand.z + slide.z * slideM + inward.z * closer;
        const gy = q.groundHeight(px, pz);
        if (q.insideSolid(px, gy + 1.3, pz, 0.3, true)) continue;
        const eye = 1.35;
        const eyeY = gy + eye;
        const lookX = opening.x;
        const lookZ = opening.z;
        const lookY = gy0 + 1.15;
        const yaw = Math.atan2(lookX - px, -(lookZ - pz));
        const horiz = Math.hypot(lookX - px, lookZ - pz) || 1;
        const pitch = Math.atan2(lookY - eyeY, horiz);
        cam.position.set(px, eyeY, pz);
        cam.rotation.set(pitch, -yaw, 0, 'YXZ');
        cam.updateMatrixWorld();
        const doorN = ndc(opening.x, gy0 + 1.15, opening.z);
        const doorTop = ndc(opening.x, gy0 + 2.2, opening.z);
        const doorBot = ndc(opening.x, gy0 + 0.1, opening.z);
        if (!doorN || !doorTop || !doorBot || Math.abs(doorN.x) > 0.55) continue;
        const doorSpan = Math.abs(doorTop.y - doorBot.y);
        if (doorSpan < 0.2) continue;
        let bestP = null;
        for (const p of folks.length ? folks : people()) {
          const head = ndc(p.x, p.y + 1.72 * p.s, p.z);
          const feet = ndc(p.x, p.y + 0.05, p.z);
          if (!head || !feet) continue;
          const span = Math.abs(head.y - feet.y);
          const hx = (head.x + feet.x) * 0.5;
          if (span < 0.16 || Math.abs(hx) > 0.85) continue;
          if (!bestP || span > bestP.span) bestP = { span, hx, p };
        }
        let bestC = null;
        for (const car of cars) {
          const front = ndc(car.front.x, car.front.y, car.front.z);
          const rear = ndc(car.rear.x, car.rear.y, car.rear.z);
          const mid = ndc(car.x, car.y + 0.7, car.z);
          if (!front || !rear || !mid) continue;
          const sep = Math.hypot(front.x - rear.x, front.y - rear.y);
          const roof = ndc(car.x, car.y + 1.3, car.z);
          const belly = ndc(car.x, car.y + 0.25, car.z);
          const vspan = roof && belly ? Math.abs(roof.y - belly.y) : 0.1;
          if (sep < 0.12 || Math.abs(mid.x) > 0.92) continue;
          const ratio = sep / Math.max(vspan, 0.05);
          if (!bestC || ratio > bestC.ratio) bestC = { sep, ratio, front, rear, mid, roof, belly, car };
        }
        if (!bestC) continue;
        const box = ndcBox(
          [bestC.front.x, bestC.rear.x, bestC.mid.x],
          [bestC.front.y, bestC.rear.y, bestC.mid.y, bestC.roof ? bestC.roof.y : bestC.mid.y, bestC.belly ? bestC.belly.y : bestC.mid.y],
          0.03,
        );
        const doorBox = ndcBox([doorN.x], [doorTop.y, doorBot.y], 0.04);
        if (near.length < 8) near.push({
          span: bestP ? Math.round(bestP.span * 100) / 100 : 0,
          hx: bestP ? Math.round(bestP.hx * 100) / 100 : 9,
          ratio: Math.round(bestC.ratio * 100) / 100,
          sep: Math.round(bestC.sep * 100) / 100,
          doorSpan: Math.round(doorSpan * 100) / 100,
          doorX: Math.round(doorN.x * 100) / 100,
        });
        if (bestC.ratio < 0.9 || bestC.sep > 2.4) continue;
        if (!bestP || bestP.span < 0.18 || bestP.span > 0.9 || Math.abs(bestP.hx) > 0.55) continue;
        if (doorSpan < 0.22 || doorSpan > 1.15) continue;
        const score = Math.abs(bestP.span - 0.45) * 3 + Math.abs(bestP.hx) + Math.abs(doorN.x) * 0.5 + Math.abs(bestP.hx - doorN.x);
        picks.push({
          score, px, pz, gy, yaw, pitch, eye, box, doorBox,
          slide: slideM, closer,
          person: { span: bestP ? Math.round(bestP.span * 100) / 100 : 0, x: bestP ? Math.round(bestP.hx * 100) / 100 : 9 },
          car: { name: bestC.car.name, sep: Math.round(bestC.sep * 100) / 100, face: Math.round(bestC.ratio * 100) / 100, lamp: 'slide' },
          door: { x: Math.round(doorN.x * 100) / 100, span: Math.round(doorSpan * 100) / 100 },
        });
      }
    }
    picks.length = 0;
    {
      w.pos.set(opening.x + outward.x * 5.5, gy0, opening.z + outward.z * 5.5);
      a.camera.position.set(w.pos.x, gy0 + 1.5, w.pos.z);
      walkPeople(14);
      const who = people()
        .map((p) => ({ ...p, d: Math.hypot(p.x - opening.x, p.z - opening.z) }))
        .filter((p) => p.d < 16)
        .sort((a, b) => a.d - b.d)[0];
      if (who) {
        for (let k = 0; k < 16; k++) {
          const ang = (k / 16) * Math.PI * 2;
          for (const dist of [2.6, 3.3, 4.2]) {
            const px = who.x + Math.sin(ang) * dist;
            const pz = who.z + Math.cos(ang) * dist;
            const gy = q.groundHeight(px, pz);
            if (Math.abs(gy - gy0) > 1.6) continue;
            if (q.insideSolid(px, gy + 1.3, pz, 0.25, true)) continue;
            const eye = 1.35;
            const lookX = opening.x * 0.55 + who.x * 0.45;
            const lookZ = opening.z * 0.55 + who.z * 0.45;
            const lookY = gy0 + 1.15;
            const lookDx = lookX - px;
            const lookDz = lookZ - pz;
            const lookLen = Math.hypot(lookDx, lookDz) || 1;
            if ((lookDx * outward.x + lookDz * outward.z) / lookLen > -0.45) continue;
            const yaw = Math.atan2(lookX - px, -(lookZ - pz));
            const horiz = lookLen;
            const pitch = Math.atan2(lookY - (gy + eye), horiz);
            cam.position.set(px, gy + eye, pz);
            cam.rotation.set(pitch, -yaw, 0, 'YXZ');
            cam.updateMatrixWorld();
            const head = ndc(who.x, who.y + 1.72 * who.s, who.z);
            const feet = ndc(who.x, who.y + 0.05, who.z);
            if (!head || !feet) continue;
            const span = Math.abs(head.y - feet.y);
            const hx = (head.x + feet.x) * 0.5;
            if (span < 0.34 || span > 0.9 || Math.abs(hx) > 0.48) continue;
            const doorN = ndc(opening.x, gy0 + 1.15, opening.z);
            const doorTop = ndc(opening.x, gy0 + 2.2, opening.z);
            const doorBot = ndc(opening.x, gy0 + 0.1, opening.z);
            if (!doorN || !doorTop || !doorBot || Math.abs(doorN.x) > 0.62) continue;
            const doorSpan = Math.abs(doorTop.y - doorBot.y);
            if (doorSpan < 0.18) continue;
            let bestC = null;
            for (const car of cars) {
              const front = ndc(car.front.x, car.front.y, car.front.z);
              const rear = ndc(car.rear.x, car.rear.y, car.rear.z);
              const mid = ndc(car.x, car.y + 0.7, car.z);
              if (!front || !rear || !mid) continue;
              const sep = Math.hypot(front.x - rear.x, front.y - rear.y);
              const roof = ndc(car.x, car.y + 1.3, car.z);
              const belly = ndc(car.x, car.y + 0.25, car.z);
              const vspan = roof && belly ? Math.abs(roof.y - belly.y) : 0.08;
              const ratio = sep / Math.max(vspan, 0.05);
              if (sep < 0.16 || Math.abs(mid.x) > 0.95) continue;
              if (!bestC || ratio > bestC.ratio) bestC = { sep, ratio, front, rear, mid, roof, belly, car };
            }
            if (!bestC || bestC.ratio < 0.85) continue;
            const box = ndcBox([bestC.front.x, bestC.rear.x, bestC.mid.x], [bestC.front.y, bestC.rear.y, bestC.mid.y], 0.03);
            const doorBox = ndcBox([doorN.x], [doorTop.y, doorBot.y], 0.04);
            picks.push({
              score: Math.abs(span - 0.48) + Math.abs(doorN.x) + Math.abs(hx),
              px, pz, gy, yaw, pitch, eye, box, doorBox,
              person: { span: Math.round(span * 100) / 100, x: Math.round(hx * 100) / 100 },
              car: { name: bestC.car.name, sep: Math.round(bestC.sep * 100) / 100, face: Math.round(bestC.ratio * 100) / 100, lamp: 'ring' },
              door: { x: Math.round(doorN.x * 100) / 100, span: Math.round(doorSpan * 100) / 100 },
            });
          }
        }
      }
    }
    picks.length = 0;
    picks.sort((a, b) => a.score - b.score);
    const top = [];
    for (const p of picks) {
      if (top.some((t) => Math.hypot(t.px - p.px, t.pz - p.pz) < 0.8 && Math.abs(t.yaw - p.yaw) < 0.15)) continue;
      top.push(p);
      if (top.length === 5) break;
    }
    window.__doorPicks = top;
    if (!top.length) {
      const grid = [];
      for (const out of [4.6, 6.4]) {
        for (const slide of [-3.2, -0.8, 1.6, 4]) {
          const px = opening.x + outward.x * out + along.x * slide;
          const pz = opening.z + outward.z * out + along.z * slide;
          const gy = q.groundHeight(px, pz);
          const eye = 1.32;
          const yaw = Math.atan2(opening.x - px, -(opening.z - pz));
          const dist = Math.hypot(opening.x - px, opening.z - pz) || 1;
          const pitch = Math.atan2((gy0 + 1.2) - (gy + eye), dist);
          grid.push({ px, pz, gy, yaw, pitch, eye });
        }
      }
      const g0 = grid[0];
      cam.position.set(g0.px, g0.gy + g0.eye, g0.pz);
      cam.rotation.set(g0.pitch, -g0.yaw, 0, 'YXZ');
      cam.updateMatrixWorld();
      window.__doorGrid = grid;
    }
    if (top[0]) {
      const p = top[0];
      cam.position.set(p.px, p.gy + p.eye, p.pz);
      cam.rotation.set(p.pitch, -p.yaw, 0, 'YXZ');
      cam.updateMatrixWorld();
    }
    return {
      ok: top.length > 0,
      people: folks.length,
      nCars: cars.length,
      rawPeople: people().filter((p) => Math.hypot(p.x - door.x, p.z - door.z) < 12).length,
      street: { clear: street.clear, wall: street.wall },
      rej,
      samples,
      near,
      picks: top.map((p) => ({ score: Math.round(p.score * 100) / 100, person: p.person, car: p.car, door: p.door, box: p.box, doorBox: p.doorBox })),
    };
  });
  console.log(quality, JSON.stringify(found));
    if (!found?.ok) {
      const n = await page.evaluate(() => (window.__doorGrid || []).length);
      mkdirSync('/tmp/door-grid', { recursive: true });
      for (let i = 0; i < n; i++) {
        await page.evaluate((i) => {
          const p = window.__doorGrid[i];
          const cam = window.__nla.app.camera;
          cam.position.set(p.px, p.gy + p.eye, p.pz);
          cam.rotation.set(p.pitch, -p.yaw, 0, 'YXZ');
          cam.updateMatrixWorld();
        }, i);
        const path = `/tmp/door-grid/${i}.png`;
        await page.screenshot({ path, timeout: 180000, animations: 'disabled' });
        console.log('grid', i);
      }
      return false;
    }
  let best = null;
  for (let i = 0; i < found.picks.length; i++) {
    await page.evaluate((i) => {
      const p = window.__doorPicks[i];
      const cam = window.__nla.app.camera;
      cam.position.set(p.px, p.gy + p.eye, p.pz);
      cam.rotation.set(p.pitch, -p.yaw, 0, 'YXZ');
      cam.updateMatrixWorld();
    }, i);
    await page.waitForTimeout(250);
    const path = `${TRIES}/${quality}-cand-${i}.png`;
    await page.screenshot({ path, timeout: 180000, animations: 'disabled' });
    const lamps = lampScore(path, found.picks[i].box);
    const warm = lampScore(path, found.picks[i].doorBox);
    console.log('cand', quality, i, JSON.stringify({ ...found.picks[i], lamps, warm }));
    const person = found.picks[i].person;
    const box = found.picks[i].box;
    const boxW = box.x1 - box.x0;
    if (boxW < 0.08 || boxW > 0.85) continue;
    if (!person || person.span < 0.32 || person.span > 0.85 || Math.abs(person.x) > 0.42) continue;
    if ((found.picks[i].door?.span || 0) > 1.15) continue;
    if ((lamps.lamps || 0) < 8 && (warm.amber || 0) < 20) continue;
    const rank = Math.min(lamps.lamps || 0, 220) + Math.min(warm.amber || 0, 300) + person.span * 120 - Math.abs(person.x) * 90 - found.picks[i].score * 20;
    if (!best || rank > best.rank) best = { i, path, lamps, rank, pick: found.picks[i] };
  }
  if (!best) return false;
  copyFileSync(best.path, `${OUT}/scale-door-car-${quality}.png`);
  console.log('picked', quality, best.i, JSON.stringify(best.lamps), '->', `${OUT}/scale-door-car-${quality}.png`);
  return (best.lamps.lamps || 0) >= 12;
}

try {
  const which = process.env.QUALITY || 'both';
  let ok = true;
  if (which !== 'ultra') ok = await shoot('medium') && ok;
  if (which !== 'medium') ok = await shoot('ultra') && ok;
  if (!ok) process.exitCode = 2;
} finally {
  await browser.close();
}
