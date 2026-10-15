// Night-rain after frames for every district that has people.
// One page. Medium first, then ultra. Strips step the real crowd update.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const OUT = '/workspace/docs/humans/after';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
mkdirSync(OUT, { recursive: true });

const DISTRICTS = [
  ['little-tokyo-market', 'marketView', 'street', ['crowd']],
  ['historic-core', 'broadwayView', 'street', ['bridge']],
  ['dtla', 'dtlaView', 'street', ['walkway', 'plaza']],
  ['financial-megatowers', 'megaView', 'street', ['lanes']],
  ['k-megablock', 'kView', 'street', ['market']],
  ['hollywood', 'hollywoodView', 'street', ['holo']],
  ['civic-center', 'civicView', 'steps', ['plaza', 'approach']],
  ['south-la-megablocks', 'southLaView', 'street', ['market', 'courtyard']],
  ['east-la', 'eastLaView', 'street', ['market']],
  ['long-beach', 'longBeachView', 'canyon', ['lanes', 'lakewood']],
  ['westside', 'westsideView', 'street', ['strip', 'hub']],
  ['lakewood-megablocks', 'lakewoodView', 'street', ['market', 'courtyard']],
  ['basin-sprawl', 'basinView', 'street', ['strip']],
  ['arts-district', 'artsView', 'street', ['foundry']],
  ['southeast-industrial', 'southeastView', 'street', ['pipes']],
  ['south-bay-refineries', 'southBayView', 'street', ['flare']],
  ['harbor', 'harborView', 'street', ['stacks', 'ship']],
];

const log = [];
function note(msg, extra) {
  const line = extra ? `${msg} ${JSON.stringify(extra)}` : msg;
  console.log(line);
  log.push({ t: Date.now(), line });
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 400)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300));
});

async function boot(quality) {
  const url = `http://127.0.0.1:5173/?mode=walk&at=noodle-bar&time=22.5&weather=rain&freeze=1&ui=0&quality=${quality}&webgl=1`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__nla && window.__nla.stats, { timeout: 90000 });
  await page.evaluate(() => document.getElementById('loading')?.remove());
}

async function go(fn, kind) {
  return page.evaluate(async ({ fn, kind }) => {
    const app = window.__nla.app;
    const beforeX = app.cams.walk.pos.x;
    const beforeZ = app.cams.walk.pos.z;
    const r = window.__nla[fn](kind);
    if (r && typeof r.then === 'function') await r;
    const w = app.cams.walk;
    app.camera.position.set(w.pos.x, w.pos.y + 1.7, w.pos.z);
    app.camera.rotation.set(w.pitch, -w.heading, 0, 'YXZ');
    app.camera.updateMatrixWorld();
    document.getElementById('loading')?.remove();
    return {
      x: Math.round(w.pos.x),
      z: Math.round(w.pos.z),
      moved: Math.round(Math.hypot(w.pos.x - beforeX, w.pos.z - beforeZ)),
    };
  }, { fn, kind });
}

async function waitNear(ms = 18000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < ms) {
    last = await page.evaluate(() => {
      const app = window.__nla.app;
      const w = app.cams.walk;
      const st = window.__nla.stats();
      const arr = app.crowd.mesh.instanceMatrix.array;
      const fx = Math.sin(w.heading);
      const fz = -Math.cos(w.heading);
      let near = 0;
      let ahead = 0;
      for (let i = 0; i < app.crowd.mesh.count; i++) {
        const x = arr[i * 16 + 12];
        const z = arr[i * 16 + 14];
        if (x > 1e5) continue;
        const dx = x - w.pos.x;
        const dz = z - w.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 28) near++;
        if (d > 2 && d < 22 && (dx * fx + dz * fz) / d > 0.2) ahead++;
      }
      return {
        near, ahead, crowd: st.crowd, rigged: st.crowdRigged,
        body: st.humanMemory?.crowdTriangles, tier: st.tier,
        x: Math.round(w.pos.x), z: Math.round(w.pos.z),
      };
    });
    if (last.rigged && last.ahead > 0) return last;
    await page.waitForTimeout(500);
  }
  return last;
}

async function framePeople() {
  return page.evaluate(() => {
    const app = window.__nla.app;
    const w = app.cams.walk;
    const mesh = app.crowd.mesh;
    const arr = mesh.instanceMatrix.array;
    const fx = Math.sin(w.heading);
    const fz = -Math.cos(w.heading);
    let best = null;
    for (let i = 0; i < mesh.count; i++) {
      const x = arr[i * 16 + 12];
      const y = arr[i * 16 + 13];
      const z = arr[i * 16 + 14];
      if (x > 1e5) continue;
      const s = Math.hypot(arr[i * 16], arr[i * 16 + 1], arr[i * 16 + 2]);
      if (s < 0.3) continue;
      const dx = x - w.pos.x;
      const dz = z - w.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.2 || d > 32) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot < 0.2) continue;
      if (!best || d < best.d) best = { i, x, y, z, d, s, dot };
    }
    if (!best) return { ok: false, count: mesh.count, at: [Math.round(w.pos.x), Math.round(w.pos.z)] };
    const eyeY = w.pos.y + 1.7;
    const lookY = best.y + 0.95 * best.s;
    const horiz = Math.hypot(best.x - w.pos.x, best.z - w.pos.z) || 1;
    const pitch = Math.atan2(lookY - eyeY, horiz);
    w.pitch = pitch;
    w.heading = Math.atan2(best.x - w.pos.x, -(best.z - w.pos.z));
    app.camera.position.set(w.pos.x, eyeY, w.pos.z);
    app.camera.rotation.set(pitch, -w.heading, 0, 'YXZ');
    app.camera.updateMatrixWorld();
    return { ok: true, kept: true, person: best, pitch };
  });
}

async function stepCrowd(steps) {
  await page.evaluate((steps) => {
    const app = window.__nla.app;
    const cam = app.camera.position;
    const rain = app.atmosphere.weather.params.rain;
    for (let i = 0; i < steps; i++) {
      app.crowd.update(0.1, cam.x, cam.z, app.query, app.quality, rain, app.elapsed, app.cams.walk.heading);
    }
  }, steps);
}

async function shot(path) {
  await page.evaluate(() => document.getElementById('loading')?.remove());
  const t0 = Date.now();
  await page.screenshot({ path, timeout: 180000, animations: 'allow' });
  return Date.now() - t0;
}

async function clearLens() {
  // Step backward along the street view. Stepping away from the nearest
  // person walks the lens into a facade.
  return page.evaluate(() => {
    const app = window.__nla.app;
    const w = app.cams.walk;
    const q = app.query;
    const fx = Math.sin(w.heading);
    const fz = -Math.cos(w.heading);
    const nearestOf = () => {
      const arr = app.crowd.mesh.instanceMatrix.array;
      let nearest = 99;
      let target = null;
      for (let i = 0; i < app.crowd.mesh.count; i++) {
        const x = arr[i * 16 + 12];
        const y = arr[i * 16 + 13];
        const z = arr[i * 16 + 14];
        if (x > 1e5) continue;
        const s = Math.hypot(arr[i * 16], arr[i * 16 + 1], arr[i * 16 + 2]);
        if (s < 0.3) continue;
        const dx = x - w.pos.x;
        const dz = z - w.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < nearest) nearest = d;
        const dot = (dx * fx + dz * fz) / (d || 1);
        if (dot > 0.25 && d > 3 && d < 20 && (!target || d < target.d)) target = { x, y, z, d, s };
      }
      return { nearest, target };
    };
    let hops = 0;
    let info = nearestOf();
    while (info.nearest < 4.4 && hops < 3) {
      const px = w.pos.x - fx * 2.6;
      const pz = w.pos.z - fz * 2.6;
      const gy = q.groundHeight(px, pz);
      if (q.insideSolid(px, gy + 1.1, pz, 0.4, true)) break;
      w.pos.set(px, gy, pz);
      hops++;
      info = nearestOf();
    }
    if (info.target) {
      const eyeY = w.pos.y + 1.7;
      const horiz = Math.hypot(info.target.x - w.pos.x, info.target.z - w.pos.z) || 1;
      w.pitch = Math.atan2((info.target.y + 0.95 * info.target.s) - eyeY, horiz);
      w.heading = Math.atan2(info.target.x - w.pos.x, -(info.target.z - w.pos.z));
    }
    app.camera.position.set(w.pos.x, w.pos.y + 1.7, w.pos.z);
    app.camera.rotation.set(w.pitch, -w.heading, 0, 'YXZ');
    app.camera.updateMatrixWorld();
    return { hops, nearest: Math.round(info.nearest * 10) / 10, ahead: info.target ? Math.round(info.target.d * 10) / 10 : null };
  });
}

async function strip(prefix, frames) {
  const files = [];
  for (let f = 0; f < frames; f++) {
    if (f > 0) await stepCrowd(3);
    const hops = f === 0 ? await clearLens() : 0;
    const path = `${prefix}-f${f}.png`;
    const ms = await shot(path);
    files.push({ path, ms, hops });
  }
  return files;
}

async function meshCheck() {
  return page.evaluate(() => {
    const mesh = window.__nla.app.crowd.mesh;
    const pos = mesh.geometry.getAttribute('position');
    const uv1 = mesh.geometry.getAttribute('uv1');
    const uv = mesh.geometry.getAttribute('uv');
    let minY = 1e9, maxY = -1e9;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const ids = new Set();
    if (uv1) {
      for (let i = 0; i < uv1.count; i += 4) ids.add(`${uv1.getX(i)},${uv1.getY(i)}`);
    }
    const dancer = window.__nla.app.dancer.mesh.geometry.getAttribute('position');
    let dMax = 0;
    if (dancer) {
      for (let i = 0; i < dancer.count; i++) dMax = Math.max(dMax, dancer.getY(i));
    }
    return {
      pos: pos.array.constructor.name,
      uv: uv && uv.array.constructor.name,
      uvNorm: uv && uv.normalized,
      uv1: uv1 && uv1.array.constructor.name,
      uv1Norm: uv1 && uv1.normalized,
      minY, maxY,
      ids: [...ids].slice(0, 8),
      dancerY: dMax,
      mem: window.__nla.stats().humanMemory,
    };
  });
}

note('boot medium');
await boot('medium');
await go('marketView', 'crowd');
let ready = await waitNear(25000);
note('ready', ready && { crowd: ready.crowd, body: ready.body, geom: ready.geom, dancerGeom: ready.dancerGeom });
const check = await meshCheck();
note('mesh', check);
writeFileSync(`${OUT}/mesh-check.json`, JSON.stringify({ ready, check, errors }, null, 2));

if (!(check.maxY > 1.5 && check.maxY < 3 && check.uv1 === 'Uint16Array' && check.ids.length > 3)) {
  note('MESH CHECK FAILED');
  await browser.close();
  process.exit(2);
}

async function captureDistrict(id, fn, kinds, tier) {
  let framed = null;
  let used = kinds[0];
  for (const kind of kinds) {
    try {
      const where = await go(fn, kind);
      note('go', { id, kind, where });
    } catch (err) {
      note('go fail', { id, kind, err: String(err).slice(0, 180) });
      continue;
    }
    const s = await waitNear(id === 'harbor' || id === 'south-bay-refineries' || id === 'southeast-industrial' ? 24000 : 16000);
    note('at', s && { id, kind, ahead: s.ahead, near: s.near, crowd: s.crowd, x: s.x, z: s.z, tier: s.tier });
    if (!s?.ahead) continue;
    framed = await framePeople();
    if (framed?.ok) { used = kind; break; }
  }
  if (!framed?.ok) {
    note('NO PERSON', { id, tier });
    return { id, tier, ok: false };
  }
  const prefix = `${OUT}/${id}-${tier}`;
  const files = await strip(prefix, tier === 'ultra' ? 4 : 4);
  note('shot', { id, tier, used, ms: files.map((f) => f.ms), person: framed.person });
  return { id, tier, ok: true, used, files, person: framed.person };
}

async function frameDancer(id) {
  return page.evaluate((id) => {
    const spec = window.__nla.holoSpec(id);
    if (!spec) return { ok: false };
    const app = window.__nla.app;
    const hem = spec.w > 20 ? spec.y - spec.h / 2 : spec.y - spec.h * (0.5 - 0.02);
    const dist = 42;
    const nx = Math.sin(spec.yaw);
    const nz = Math.cos(spec.yaw);
    const px = spec.x + nx * dist;
    const pz = spec.z + nz * dist;
    const gy = app.query.groundHeight(px, pz);
    const eyeY = gy + 1.7;
    const lookY = hem + spec.h * 0.28;
    const yaw = Math.atan2(spec.x - px, -(spec.z - pz));
    const horiz = Math.hypot(spec.x - px, spec.z - pz) || 1;
    const pitch = Math.atan2(lookY - eyeY, horiz);
    app.cams.setMode('walk');
    app.cams.walk.pos.set(px, gy, pz);
    app.cams.walk.heading = yaw;
    app.cams.walk.pitch = pitch;
    app.camera.position.set(px, eyeY, pz);
    app.camera.rotation.set(pitch, -yaw, 0, 'YXZ');
    app.camera.updateMatrixWorld();
    return { ok: true, spec: { x: spec.x, y: spec.y, z: spec.z, w: spec.w, h: spec.h }, hem, eye: [px, eyeY, pz], pitch };
  }, id);
}

async function dancerStrip(name, id) {
  const framed = await frameDancer(id);
  note('dancer frame', { name, framed });
  if (!framed?.ok) return { ok: false, name };
  // Let the hero mesh attach, then sample the sway period.
  await page.waitForTimeout(800);
  const files = [];
  for (let f = 0; f < 4; f++) {
    if (f > 0) {
      await page.evaluate((f) => {
        const app = window.__nla.app;
        app.elapsed += 0.55;
        app.atmosphere.update(0.05, app.elapsed, app.renderer, {});
      }, f);
    }
    const path = `${OUT}/${name}-f${f}.png`;
    const ms = await shot(path);
    const shown = await page.evaluate(() => window.__nla.stats().dancerHero);
    files.push({ path, ms, shown });
  }
  note('dancer shot', { name, files });
  return { ok: true, name, files };
}

async function scaleShot(name) {
  const places = [
    ['marketView', 'crowd'],
    ['marketView', 'street'],
    ['dtlaView', 'street'],
    ['civicView', 'steps'],
    ['kView', 'street'],
  ];
  let found = { ok: false };
  for (const [fn, kind] of places) {
    await go(fn, kind);
    await waitNear(9000);
    found = await page.evaluate(({ fn, kind }) => {
      const app = window.__nla.app;
      const door = { x: app.camera.position.x, z: app.camera.position.z };
      const people = [];
      const arr = app.crowd.mesh.instanceMatrix.array;
      for (let i = 0; i < app.crowd.mesh.count; i++) {
        const x = arr[i * 16 + 12], y = arr[i * 16 + 13], z = arr[i * 16 + 14];
        const s = Math.hypot(arr[i * 16], arr[i * 16 + 1], arr[i * 16 + 2]);
        if (s < 0.3 || x > 1e5) continue;
        const dd = Math.hypot(x - door.x, z - door.z);
        if (dd < 22) people.push({ x, y, z, s, dd });
      }
      const cars = [];
      app.scene.traverse((o) => {
        if (!o.isInstancedMesh || !String(o.name).startsWith('ground-')) return;
        if (o.name.includes('pole') || o.name.includes('head')) return;
        const a = o.instanceMatrix.array;
        for (let i = 0; i < Math.min(o.count, 80); i++) {
          const x = a[i * 16 + 12], y = a[i * 16 + 13], z = a[i * 16 + 14];
          if (Math.hypot(x - door.x, z - door.z) < 40) cars.push({ name: o.name, x, y, z });
        }
      });
      let best = null;
      for (const p of people) {
        for (const c of cars) {
          const dc = Math.hypot(p.x - c.x, p.z - c.z);
          if (dc < 2.4 || dc > 14) continue;
          const score = p.dd + Math.abs(dc - 5);
          if (!best || score < best.score) best = { p, c, door, score, dc };
        }
      }
      if (!best) return { ok: false, fn, kind, people: people.length, cars: cars.length };
      const mx = (best.p.x + best.door.x) * 0.5;
      const mz = (best.p.z + best.door.z) * 0.5;
      const dx = best.p.x - best.door.x;
      const dz = best.p.z - best.door.z;
      const len = Math.hypot(dx, dz) || 1;
      let px = best.p.x + (dx / len) * 5.2 + (-dz / len) * 1.4;
      let pz = best.p.z + (dz / len) * 5.2 + (dx / len) * 1.4;
      const gy = app.query.groundHeight(px, pz);
      const solved = app.query.resolveCircle(px, pz, gy + 0.45, 1.35, 0.35);
      px = solved[0];
      pz = solved[1];
      const feetY = app.query.groundHeight(px, pz);
      const yaw = Math.atan2(mx - px, -(mz - pz));
      const eyeY = feetY + 1.55;
      const pitch = Math.atan2((best.p.y + 1.05) - eyeY, Math.hypot(mx - px, mz - pz) || 1);
      app.cams.walk.pos.set(px, feetY, pz);
      app.cams.walk.heading = yaw;
      app.cams.walk.pitch = pitch;
      app.camera.position.set(px, eyeY, pz);
      app.camera.rotation.set(pitch, -yaw, 0, 'YXZ');
      app.camera.updateMatrixWorld();
      return {
        ok: true, fn, kind, dc: Math.round(best.dc * 10) / 10,
        car: best.c.name, personD: Math.round(best.p.dd * 10) / 10,
      };
    }, { fn, kind });
    note('scale try', found);
    if (found?.ok) break;
  }
  if (!found?.ok) return found;
  const ms = await shot(`${OUT}/${name}.png`);
  note('scale shot', { name, ms });
  return found;
}

const results = [];
try {
  note('scale pass');
  results.push({ scale: await scaleShot('scale-door-car-medium') });
  for (const [id, fn, kind, alts] of DISTRICTS) {
    results.push(await captureDistrict(id, fn, [kind, ...alts], 'medium'));
    writeFileSync(`${OUT}/capture-log.json`, JSON.stringify({ results, errors: errors.slice(0, 30) }, null, 2));
  }
  results.push(await dancerStrip('dancer-broadway-medium', 'joi-bridge-dancer'));
  results.push(await dancerStrip('dancer-hollywood-medium', 'hollywood-dancer'));

  note('switch ultra');
  await page.evaluate(() => window.__nla.app.setQuality('ultra'));
  await page.waitForTimeout(500);
  await go('marketView', 'street');
  const ultraReady = await waitNear(30000);
  note('ultra ready', ultraReady);
  const ultraMesh = await meshCheck();
  note('ultra mesh', { maxY: ultraMesh.maxY, mem: ultraMesh.mem, dancerY: ultraMesh.dancerY });
  writeFileSync(`${OUT}/mesh-ultra.json`, JSON.stringify(ultraMesh, null, 2));

  results.push({ scaleUltra: await scaleShot('scale-door-car-ultra') });
  for (const [id, fn, kind, alts] of DISTRICTS) {
    results.push(await captureDistrict(id, fn, [kind, ...alts], 'ultra'));
    writeFileSync(`${OUT}/capture-log.json`, JSON.stringify({ results, errors: errors.slice(0, 40) }, null, 2));
  }
  results.push(await dancerStrip('dancer-broadway-ultra', 'joi-bridge-dancer'));
  results.push(await dancerStrip('dancer-hollywood-ultra', 'hollywood-dancer'));
} catch (err) {
  note('FATAL', { err: String(err).slice(0, 500) });
}

writeFileSync(`${OUT}/capture-log.json`, JSON.stringify({ results, errors: errors.slice(0, 40), log }, null, 2));
await browser.close();
note('done');
