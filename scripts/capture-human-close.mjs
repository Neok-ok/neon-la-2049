// Close night-rain frames. One page. The crowd pose is held during the shot
// and stepped between frames, so a strip is one gait and not a walk offstage.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = '/workspace/docs/humans/after';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const PROBE = process.env.PROBE || '';
mkdirSync(OUT, { recursive: true });

const DISTRICTS = [
  ['little-tokyo-market', 'marketView', ['street', 'crowd']],
  ['historic-core', 'broadwayView', ['street']],
  ['dtla', 'dtlaView', ['street', 'walkway']],
  ['financial-megatowers', 'megaView', ['street']],
  ['k-megablock', 'kView', ['street', 'market']],
  ['hollywood', 'hollywoodView', ['street']],
  ['civic-center', 'civicView', ['steps', 'plaza']],
  ['south-la-megablocks', 'southLaView', ['street', 'market']],
  ['east-la', 'eastLaView', ['street', 'market']],
  ['long-beach', 'longBeachView', ['canyon', 'lanes']],
  ['westside', 'westsideView', ['street', 'strip']],
  ['lakewood-megablocks', 'lakewoodView', ['street', 'market']],
  ['basin-sprawl', 'basinView', ['street', 'strip']],
  ['arts-district', 'artsView', ['street', 'foundry']],
  ['southeast-industrial', 'southeastView', ['street', 'tanks', 'pipes']],
  ['south-bay-refineries', 'southBayView', ['street']],
  ['harbor', 'harborView', ['stacks', 'street']],
];

const SCALE_PLACES = [
  ['dtlaView', 'street'],
  ['dtlaView', 'walkway'],
  ['kView', 'street'],
  ['marketView', 'street'],
  ['marketView', 'crowd'],
  ['broadwayView', 'street'],
  ['hollywoodView', 'street'],
  ['westsideView', 'street'],
  ['southLaView', 'street'],
  ['civicView', 'steps'],
];

function note(msg, extra) {
  console.log(extra ? `${msg} ${JSON.stringify(extra)}` : msg);
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => note('pageerror', String(e).slice(0, 240)));

async function boot(quality) {
  const url = `http://127.0.0.1:5173/?mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&quality=${quality}&webgl=1`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__nla && window.__nla.stats, { timeout: 90000 });
  await page.evaluate(() => document.getElementById('loading')?.remove());
  await install();
}

async function install() {
  await page.evaluate(() => {
    const H = {};
    function app() { return window.__nla.app; }
    function rainOf() {
      return app().atmosphere?.weather?.params?.rain ?? 0.8;
    }
    function people() {
      const mesh = app().crowd.mesh;
      const arr = mesh.instanceMatrix.array;
      const out = [];
      for (let i = 0; i < mesh.count; i++) {
        const x = arr[i * 16 + 12];
        const y = arr[i * 16 + 13];
        const z = arr[i * 16 + 14];
        const s = Math.hypot(arr[i * 16], arr[i * 16 + 1], arr[i * 16 + 2]);
        if (s < 0.3 || x > 1e5) continue;
        out.push({ i, x, y, z, s });
      }
      return out;
    }
    function carsNear(x, z, r) {
      const out = [];
      app().scene.traverse((o) => {
        if (!o.isInstancedMesh) return;
        const name = String(o.name);
        if (!name.startsWith('ground-')) return;
        if (name.includes('pole') || name.includes('head') || name.includes('streak')) return;
        const a = o.instanceMatrix.array;
        const n = Math.min(o.count, 160);
        for (let i = 0; i < n; i++) {
          const cx = a[i * 16 + 12];
          const cy = a[i * 16 + 13];
          const cz = a[i * 16 + 14];
          const sc = Math.hypot(a[i * 16], a[i * 16 + 1], a[i * 16 + 2]);
          if (sc < 0.2 || cx > 1e5) continue;
          if (Math.hypot(cx - x, cz - z) > r) continue;
          const fx = -a[i * 16 + 8];
          const fz = -a[i * 16 + 10];
          out.push({ name, x: cx, y: cy, z: cz, s: sc, fx, fz });
        }
      });
      return out;
    }
    function clearSpot(x, z, gy) {
      const q = app().query;
      if (q.insideSolid(x, gy + 0.45, z, 0.32, true)) return false;
      if (q.insideSolid(x, gy + 1.25, z, 0.28, true)) return false;
      if (q.insideSolid(x, gy + 1.7, z, 0.15, true)) return false;
      return true;
    }
    function lineClear(ax, az, bx, bz, gy) {
      const q = app().query;
      for (let t = 0.18; t <= 0.82; t += 0.16) {
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        if (q.insideSolid(x, gy + 1.2, z, 0.12, true)) return false;
      }
      return true;
    }
    function applyPose(px, pz, gy, yaw, pitch) {
      const a = app();
      a.cams.setMode('walk');
      const w = a.cams.walk;
      w.pos.set(px, gy, pz);
      w.heading = yaw;
      w.pitch = pitch;
      w.vy = 0;
      a.camera.position.set(px, gy + 1.7, pz);
      a.camera.rotation.set(pitch, -yaw, 0, 'YXZ');
      a.camera.updateMatrixWorld();
    }
    function ndc(x, y, z) {
      const cam = app().camera;
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
      if (!cw) return null;
      return { x: cx / cw, y: cy / cw };
    }
    H.stepCrowd = (dt) => {
      const a = app();
      const real = a.crowd.__realUpdate || a.crowd.update.bind(a.crowd);
      const cam = a.camera.position;
      real(dt, cam.x, cam.z, a.query, a.quality, rainOf(), a.elapsed, a.cams.walk.heading);
    };
    H.holdCrowd = (hold) => {
      const c = app().crowd;
      if (hold) {
        if (!c.__realUpdate) c.__realUpdate = c.update.bind(c);
        c.update = () => {};
      } else if (c.__realUpdate) {
        c.update = c.__realUpdate;
      }
    };
    H.holdWalk = (hold) => {
      const w = app().cams.walk;
      if (hold) {
        if (!w.__realUpdate) w.__realUpdate = w.update.bind(w);
        w.update = () => {};
      } else if (w.__realUpdate) {
        w.update = w.__realUpdate;
      }
    };
    H.pump = () => {
      const a = app();
      const w = a.cams.walk;
      a.query.fabricAt(w.pos.x, w.pos.z);
      const real = a.crowd.__realUpdate || a.crowd.update.bind(a.crowd);
      real(0.08, w.pos.x, w.pos.z, a.query, a.quality, rainOf(), a.elapsed, w.heading);
      try {
        a.ground.update(0.08, a.camera, a.quality.groundTraffic, a.quality.freewayTraffic, a.quality.tier, a.elapsed);
      } catch { /* traffic keeps its own loop */ }
      const gy = w.pos.y;
      let nearest = 1e9;
      let n = 0;
      for (const p of people()) {
        if (Math.abs(p.y - gy) > 4) continue;
        const d = Math.hypot(p.x - w.pos.x, p.z - w.pos.z);
        if (d < nearest) nearest = d;
        if (d < 80) n++;
      }
      return {
        nearest: nearest > 1e8 ? null : Math.round(nearest * 10) / 10,
        n,
        district: a.query.district(w.pos.x, w.pos.z).id,
        count: a.crowd.mesh.count,
      };
    };
    H.pick = () => {
      const w = app().cams.walk.pos;
      let best = null;
      for (const p of people()) {
        if (Math.abs(p.y - w.y) > 4) continue;
        const d = Math.hypot(p.x - w.x, p.z - w.z);
        if (d > 85) continue;
        if (!best || d < best.d) best = { ...p, d };
      }
      return best;
    };
    H.stand = (p) => {
      if (!p) return { ok: false };
      const q = app().query;
      const dists = [8.0, 6.2, 10.5];
      let best = null;
      for (const dist of dists) {
        for (let k = 0; k < 16; k++) {
          const ang = (k / 16) * Math.PI * 2 + 0.2;
          const px = p.x + Math.sin(ang) * dist;
          const pz = p.z + Math.cos(ang) * dist;
          const gy = q.groundHeight(px, pz);
          if (Math.abs(gy - p.y) > 1.35) continue;
          if (!clearSpot(px, pz, gy)) continue;
          if (!lineClear(px, pz, p.x, p.z, gy)) continue;
          const backX = px + Math.sin(ang) * 1.6;
          const backZ = pz + Math.cos(ang) * 1.6;
          const boxed = q.insideSolid(backX, gy + 1.3, backZ, 0.2, true) ? 4 : 0;
          const score = boxed + Math.abs(dist - 8);
          if (!best || score < best.score) best = { px, pz, gy, dist, score };
        }
        if (best) break;
      }
      if (!best) return { ok: false };
      const eyeY = best.gy + 1.7;
      const aimY = p.y + 1.0 * p.s;
      const yaw = Math.atan2(p.x - best.px, -(p.z - best.pz));
      const horiz = Math.hypot(p.x - best.px, p.z - best.pz) || 1;
      const pitch = Math.atan2(aimY - eyeY, horiz);
      applyPose(best.px, best.pz, best.gy, yaw, pitch);
      return { ok: true, dist: Math.round(best.dist * 10) / 10, pitch: Math.round(pitch * 100) / 100 };
    };
    H.projectPerson = (p) => {
      if (!p) return null;
      const head = ndc(p.x, p.y + 1.75 * p.s, p.z);
      const feet = ndc(p.x, p.y + 0.02, p.z);
      return { head, feet };
    };
    function sightClear(px, py, pz, tx, ty, tz) {
      const q = app().query;
      for (let t = 0.12; t <= 0.7; t += 0.1) {
        const x = px + (tx - px) * t;
        const y = py + (ty - py) * t;
        const z = pz + (tz - pz) * t;
        if (q.insideSolid(x, y, z, 0.3, true)) return false;
      }
      return true;
    }
    H.frameDancer = (id, dist) => {
      const spec = window.__nla.holoSpec(id);
      if (!spec) return { ok: false };
      const a = app();
      const hem = spec.w > 20 ? spec.y - spec.h / 2 : spec.y - spec.h * (0.5 - 0.02);
      const nx = Math.sin(spec.yaw);
      const nz = Math.cos(spec.yaw);
      const lookY = hem + spec.h * 0.42;
      let placed = null;
      for (const side of [0, 0.18, -0.18, 0.32, -0.32]) {
        const px = spec.x + (nx * Math.cos(side) + nz * Math.sin(side)) * dist;
        const pz = spec.z + (nz * Math.cos(side) - nx * Math.sin(side)) * dist;
        const gy = a.query.groundHeight(px, pz);
        if (!clearSpot(px, pz, gy)) continue;
        if (!sightClear(px, gy + 1.7, pz, spec.x, lookY, spec.z)) continue;
        placed = { px, pz, gy, side };
        break;
      }
      if (!placed) return { ok: false, reason: 'blocked', dist };
      const eyeY = placed.gy + 1.7;
      const yaw = Math.atan2(spec.x - placed.px, -(spec.z - placed.pz));
      const horiz = Math.hypot(spec.x - placed.px, spec.z - placed.pz) || 1;
      const pitch = Math.atan2(lookY - eyeY, horiz);
      applyPose(placed.px, placed.pz, placed.gy, yaw, pitch);
      a.dancer.update(a.camera.position);
      H.holdWalk(true);
      const d3 = Math.hypot(spec.x - placed.px, Math.min(Math.max(eyeY, hem), hem + 64.4) - eyeY, spec.z - placed.pz);
      return {
        ok: true,
        d3: Math.round(d3 * 10) / 10,
        side: placed.side,
        shown: a.dancer.shown,
        pitch: Math.round(pitch * 100) / 100,
      };
    };
    function facade(p) {
      const q = app().query;
      let best = null;
      for (let k = 0; k < 36; k++) {
        const ang = (k / 36) * Math.PI * 2;
        const dx = Math.sin(ang);
        const dz = Math.cos(ang);
        const lx = dz;
        const lz = -dx;
        for (let s = 1.3; s <= 7.5; s += 0.45) {
          const x = p.x + dx * s;
          const z = p.z + dz * s;
          // A storey, not a planter: solid at chest and above a door head.
          if (!q.insideSolid(x, p.y + 1.3, z, 0.02, true)) continue;
          if (!q.insideSolid(x, p.y + 2.7, z, 0.02, true)) break;
          for (let u = -2.4; u <= 2.4; u += 0.4) {
            const gx = x + lx * u;
            const gz = z + lz * u;
            const open = !q.insideSolid(gx, p.y + 1.15, gz, 0.02, true);
            const head = q.insideSolid(gx, p.y + 2.35, gz, 0.02, true);
            const jambL = q.insideSolid(gx + lx * 0.85, p.y + 1.15, gz + lz * 0.85, 0.02, true);
            const jambR = q.insideSolid(gx - lx * 0.85, p.y + 1.15, gz - lz * 0.85, 0.02, true);
            if (!(open && head && jambL && jambR)) continue;
            const score = s + Math.abs(u) * 0.15;
            if (!best || score < best.score) best = { x: gx, y: p.y + 1.15, z: gz, s, doorish: true, score };
          }
          break;
        }
      }
      return best;
    }
    H.composeScale = () => {
      const w = app().cams.walk.pos;
      const folks = people().filter((p) => Math.abs(p.y - w.y) < 3 && Math.hypot(p.x - w.x, p.z - w.z) < 28);
      const cars = carsNear(w.x, w.z, 32).filter((c) => Math.abs(c.y - w.y) < 3);
      const ranked = [];
      for (const p of folks) {
        const face = facade(p);
        for (const c of cars) {
          const dc = Math.hypot(p.x - c.x, p.z - c.z);
          if (dc < 3.4 || dc > 12) continue;
          if (c.name !== 'ground-car' && c.name !== 'ground-van') continue;
          if (!face || face.s > 5.2) continue;
          const prefer = c.name === 'ground-car' ? 0 : 0.6;
          const score = Math.abs(dc - 6.5) + prefer + (face.doorish ? 0 : 2.2);
          ranked.push({ p, c, face, dc, score });
        }
      }
      ranked.sort((a, b) => a.score - b.score);
      const q = app().query;
      const inside = (n) => n && Math.abs(n.x) < 0.78 && Math.abs(n.y) < 0.78;
      for (const pair of ranked.slice(0, 8)) {
        const p = pair.p;
        const c = pair.c;
        const face = pair.face;
        const mx = (p.x + c.x) * 0.5;
        const mz = (p.z + c.z) * 0.5;
        const fx = c.fx || 0;
        const fz = c.fz || 1;
        const fl = Math.hypot(fx, fz) || 1;
        for (const spin of [0, 0.45, -0.45, 0.9, -0.9]) {
          const dx = (fx / fl) * Math.cos(spin) - (fz / fl) * Math.sin(spin);
          const dz = (fx / fl) * Math.sin(spin) + (fz / fl) * Math.cos(spin);
          const px = mx + dx * 7.6;
          const pz = mz + dz * 7.6;
          const gy = q.groundHeight(px, pz);
          if (Math.abs(gy - p.y) > 1.6) continue;
          if (!clearSpot(px, pz, gy)) continue;
          if (!lineClear(px, pz, p.x, p.z, gy)) continue;
          if (!lineClear(px, pz, c.x, c.z, gy)) continue;
          const eyeY = gy + 1.55;
          const yaw = Math.atan2(mx - px, -(mz - pz));
          const horiz = Math.hypot(mx - px, mz - pz) || 1;
          const pitch = Math.atan2((p.y + 0.95) - eyeY, horiz);
          applyPose(px, pz, gy, yaw, pitch);
          const personN = ndc(p.x, p.y + 1.0, p.z);
          const carN = ndc(c.x, c.y + 0.75, c.z);
          const faceN = face ? ndc(face.x, face.y, face.z) : null;
          if (!inside(personN) || !inside(carN)) continue;
          H.holdWalk(true);
          return {
            ok: true,
            car: c.name,
            dc: Math.round(pair.dc * 10) / 10,
            doorish: !!face?.doorish,
            people: folks.length,
            cars: cars.length,
            personN, carN, faceN,
          };
        }
      }
      return { ok: false, people: folks.length, cars: cars.length, reason: 'offscreen', tried: ranked.length };
    };
    H.memory = () => window.__nla.stats().humanMemory;
    H.hero = () => window.__nla.stats().dancerHero;
    window.__human = H;
  });
}

async function go(fn, kind) {
  return page.evaluate(async ({ fn, kind }) => {
    const a = window.__nla.app;
    const r = window.__nla[fn](kind);
    if (r && typeof r.then === 'function') await r;
    const w = a.cams.walk;
    if (a.cams.mode !== 'walk') return { fly: true, mode: a.cams.mode };
    a.camera.position.set(w.pos.x, w.pos.y + 1.7, w.pos.z);
    a.camera.rotation.set(w.pitch, -w.heading, 0, 'YXZ');
    a.camera.updateMatrixWorld();
    document.getElementById('loading')?.remove();
    return { x: Math.round(w.pos.x), z: Math.round(w.pos.z), y: Math.round(w.pos.y * 10) / 10 };
  }, { fn, kind });
}

async function pump(ms) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < ms) {
    last = await page.evaluate(() => window.__human.pump());
    if (last?.n > 0 && last.nearest != null && last.nearest < 40) return last;
    await page.waitForTimeout(180);
  }
  return last;
}

async function shot(path) {
  await page.evaluate(() => {
    document.getElementById('loading')?.remove();
    window.__human.holdCrowd(true);
    window.__human.holdWalk(true);
  });
  await page.waitForTimeout(80);
  const t0 = Date.now();
  await page.screenshot({ path, timeout: 180000, animations: 'disabled' });
  await page.evaluate(() => {
    window.__human.holdCrowd(false);
    window.__human.holdWalk(false);
  });
  return Date.now() - t0;
}

async function captureDistrict(id, fn, kinds, tier) {
  let stood = null;
  let used = kinds[0];
  let person = null;
  for (const kind of kinds) {
    let where;
    try {
      where = await go(fn, kind);
    } catch (err) {
      note('go fail', { id, kind, err: String(err).slice(0, 160) });
      continue;
    }
    if (where?.fly) {
      note('skip fly', { id, kind });
      continue;
    }
    const settled = await pump(id === 'harbor' || id === 'southeast-industrial' || id === 'financial-megatowers' ? 8000 : 4500);
    note('settled', { id, kind, tier, where, settled });
    person = await page.evaluate(() => window.__human.pick());
    if (!person) continue;
    stood = await page.evaluate((p) => window.__human.stand(p), person);
    if (stood?.ok) { used = kind; break; }
  }
  if (!stood?.ok) {
    note('NO STAND', { id, tier });
    return { id, tier, ok: false };
  }
  await page.waitForTimeout(200);
  const framed = await page.evaluate((p) => window.__human.projectPerson(p), person);
  note('stand', { id, tier, used, stood, framed });
  const files = [];
  for (let f = 0; f < 4; f++) {
    if (f > 0) await page.evaluate(() => window.__human.stepCrowd(0.22));
    const path = `${OUT}/${id}-${tier}-f${f}.png`;
    const ms = await shot(path);
    files.push(ms);
  }
  note('shot', { id, tier, ms: files });
  return { id, tier, ok: true, used, stood, files };
}

async function dancerStrip(name, id, dist) {
  let framed = null;
  for (const d of [dist, dist - 8, dist + 10, 40]) {
    framed = await page.evaluate(({ id, dist }) => window.__human.frameDancer(id, dist), { id, dist: d });
    note('dancer frame', { name, framed });
    if (framed?.ok && framed.shown) break;
    framed = null;
  }
  if (!framed?.ok) return { ok: false, name };
  await page.waitForTimeout(700);
  const files = [];
  for (let f = 0; f < 4; f++) {
    if (f > 0) {
      await page.evaluate(() => {
        const a = window.__nla.app;
        a.elapsed += 0.48;
        a.atmosphere.update(0.05, a.elapsed, a.renderer, {});
      });
      await page.waitForTimeout(200);
    }
    const shown = await page.evaluate(() => window.__human.hero());
    const path = `${OUT}/${name}-f${f}.png`;
    const ms = await shot(path);
    files.push({ ms, shown });
  }
  note('dancer shot', { name, files });
  return { ok: true, name, files };
}

async function scaleShot(name) {
  for (const [fn, kind] of SCALE_PLACES) {
    let where;
    try { where = await go(fn, kind); } catch (err) {
      note('scale go fail', { fn, kind, err: String(err).slice(0, 140) });
      continue;
    }
    if (where?.fly) continue;
    const settled = await pump(3500);
    const found = await page.evaluate(() => window.__human.composeScale());
    note('scale try', { fn, kind, settled, found });
    if (!found?.ok) continue;
    await page.waitForTimeout(250);
    const ms = await shot(`${OUT}/${name}.png`);
    note('scale shot', { name, ms, found });
    return found;
  }
  return { ok: false };
}

const results = [];
try {
  if (PROBE === '1' || PROBE === 'market') {
    note('probe boot medium');
    await boot('medium');
    const mem = await page.evaluate(() => window.__human.memory());
    note('mem medium', mem);
    writeFileSync(`${OUT}/memory-medium.json`, JSON.stringify(mem, null, 2));
    await captureDistrict('little-tokyo-market', 'marketView', ['street', 'crowd'], 'medium');
  }
  if (PROBE === '1' || PROBE === 'dancer' || PROBE === 'scale') {
    if (PROBE !== '1' && PROBE !== 'market') {
      note('probe boot medium for ultra switch');
      await boot('medium');
    }
    if (PROBE === 'dancer' || PROBE === '1') {
      const framed = await page.evaluate(({ id, dist }) => window.__human.frameDancer(id, dist), { id: 'joi-bridge-dancer', dist: 40 });
      note('probe dancer medium', framed);
      await page.waitForTimeout(700);
      await shot(`${OUT}/probe-dancer-medium.png`);
    }
    note('probe ultra');
    await page.evaluate(() => window.__nla.app.setQuality('ultra'));
    await page.waitForTimeout(600);
    await install();
    const memU = await page.evaluate(() => window.__human.memory());
    note('mem ultra', memU);
    writeFileSync(`${OUT}/memory-ultra.json`, JSON.stringify(memU, null, 2));
  }
  if (PROBE === '1' || PROBE === 'dancer') {
    for (const dist of [40]) {
      const framed = await page.evaluate(({ id, dist }) => window.__human.frameDancer(id, dist), { id: 'joi-bridge-dancer', dist });
      note('probe dancer', { dist, framed });
      await page.waitForTimeout(800);
      const shown = await page.evaluate(() => window.__human.hero());
      const ms = await shot(`${OUT}/probe-dancer-${dist}.png`);
      note('probe dancer shot', { dist, shown, ms });
    }
  }
  if (PROBE === '1' || PROBE === 'scale' || PROBE === 'dancer') {
    results.push(await scaleShot('probe-scale-ultra'));
  }
  if (!PROBE) {
    note('boot medium');
    await boot('medium');
    const mem = await page.evaluate(() => window.__human.memory());
    writeFileSync(`${OUT}/memory-medium.json`, JSON.stringify(mem, null, 2));
    note('mem medium', mem);
    results.push(await scaleShot('scale-door-car-medium'));
    for (const [id, fn, kinds] of DISTRICTS) {
      results.push(await captureDistrict(id, fn, kinds, 'medium'));
    }
    results.push(await dancerStrip('dancer-broadway-medium', 'joi-bridge-dancer', 40));
    results.push(await dancerStrip('dancer-hollywood-medium', 'hollywood-dancer', 40));

    note('switch ultra');
    await page.evaluate(() => window.__nla.app.setQuality('ultra'));
    await page.waitForTimeout(800);
    await install();
    const memU = await page.evaluate(() => window.__human.memory());
    writeFileSync(`${OUT}/memory-ultra.json`, JSON.stringify(memU, null, 2));
    note('mem ultra', memU);
    results.push(await scaleShot('scale-door-car-ultra'));
    for (const [id, fn, kinds] of DISTRICTS) {
      results.push(await captureDistrict(id, fn, kinds, 'ultra'));
    }
    results.push(await dancerStrip('dancer-broadway-ultra', 'joi-bridge-dancer', 40));
    results.push(await dancerStrip('dancer-hollywood-ultra', 'hollywood-dancer', 40));
    writeFileSync(`${OUT}/close-log.json`, JSON.stringify(results, null, 2));
  }
} finally {
  await browser.close();
}
note('close capture done', { probe: PROBE || 'full' });
