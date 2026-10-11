// Street-level shots with a 1.75 m reference figure. Reads the measurement sample
// points, so run run-measure.mjs first. Requires the dev server.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeReports } from './report.mjs';

const ROOT = process.cwd();
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173/';
const FIG = join(ROOT, 'docs/audit/figures');
const ART = process.env.ARTIFACTS ?? '/opt/cursor/artifacts/scale-audit';
const ONLY = new Set((process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean));
mkdirSync(FIG, { recursive: true });
mkdirSync(ART, { recursive: true });

const doc = JSON.parse(readFileSync(join(ROOT, 'tools/scale-audit/out/measurements.json'), 'utf8'));
const desktop = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };
const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

const shots = doc.districts.filter((d) => d.sample).map((d) => ({
  name: d.id,
  ctx: desktop,
  quality: 'high',
  sample: d.sample,
}));
const market = doc.districts.find((d) => d.id === 'little-tokyo-market');
if (market?.sample) {
  shots.push(
    { name: 'little-tokyo-low', ctx: desktop, quality: 'low', sample: market.sample, compare: 'low' },
    { name: 'little-tokyo-ultra', ctx: desktop, quality: 'ultra', sample: market.sample, compare: 'ultra' },
    { name: 'little-tokyo-phone', ctx: phone, quality: 'high', sample: market.sample, compare: 'phone' },
  );
}

const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args, headless: true });
const checks = {};

async function one(s) {
  const ctx = await browser.newContext(s.ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });
  const { x, z, ground } = s.sample;
  const y = ground + 1.7;
  const q = `mode=walk&x=${x}&y=${y}&z=${z}&yaw=20&pitch=2&time=22&weather=clear&freeze=1&ui=0&quality=${s.quality}&webgl=1`;
  const t0 = Date.now();
  await page.goto(`${BASE}?${q}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.__nla?.isIdle || window.__nla?.stats, null, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const st = window.__nla?.stats?.();
    return st && st.drawCalls > 20 && st.fps > 0 && (st.lod0 >= 2 || st.queryPending === 0);
  }, null, { timeout: 90_000, polling: 500 }).catch(() => console.warn(`${s.name}: stream still settling`));
  await page.evaluate(({ x, z }) => {
    const ok = window.__nla.streetView?.(x, z, 0);
    if (!ok) window.__nla.setPose(x, window.__nla.app.query.layout.heightAt(x, z) + 1.7, z, 20, 2);
  }, { x, z });
  await page.waitForTimeout(1800);
  const probe = await page.evaluate(() => {
    const cam = window.__nla.app.camera;
    const layout = window.__nla.app.query.layout;
    const g = layout.heightAt(cam.position.x, cam.position.z);
    const district = layout.districtAt(cam.position.x, cam.position.z).id;
    const Vector3 = cam.position.constructor;
    const fwd = new Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0));
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const feet = cam.position.clone().add(fwd.multiplyScalar(6)).add(right.multiplyScalar(-1.1));
    feet.y = layout.heightAt(feet.x, feet.z);

    let donor = null;
    window.__nla.app.scene.traverse((o) => {
      if (!donor && o.isMesh && o.geometry && o.material) donor = o;
    });
    const Mesh = donor.constructor;
    const Mat = donor.material.constructor;
    const BG = donor.geometry.constructor;
    const BA = donor.geometry.getAttribute('position').constructor;
    const mat = new Mat();
    if (mat.color?.set) mat.color.set(0x3ee0ff);
    mat.fog = false;
    if (mat.emissive?.set) mat.emissive.set(0x3ee0ff);
    const part = (w, h, d, cy) => {
      const x = w / 2, y = h / 2, z = d / 2;
      const y0 = cy - y, y1 = cy + y;
      const c = [[-x, y0, z], [x, y0, z], [x, y1, z], [-x, y1, z], [-x, y0, -z], [x, y0, -z], [x, y1, -z], [-x, y1, -z]];
      const faces = [[0, 1, 2, 3], [1, 5, 6, 2], [5, 4, 7, 6], [4, 0, 3, 7], [3, 2, 6, 7], [4, 5, 1, 0]];
      const pos = [];
      for (const f of faces) for (const t of [0, 1, 2, 0, 2, 3]) pos.push(...c[f[t]]);
      const geo = new BG();
      geo.setAttribute('position', new BA(new Float32Array(pos), 3));
      geo.computeVertexNormals?.();
      const mesh = new Mesh(geo, mat);
      mesh.position.set(feet.x, feet.y, feet.z);
      mesh.name = 'scale-figure';
      window.__nla.app.scene.add(mesh);
    };
    part(0.22, 0.85, 0.16, 0.425);
    part(0.36, 0.58, 0.2, 1.16);
    part(0.2, 0.26, 0.2, 1.62);

    let el = document.getElementById('scale-fig');
    if (!el) {
      el = document.createElement('div');
      el.id = 'scale-fig';
      el.innerHTML = '<div class="body"></div><div class="tag">1.75 m</div>';
      const css = document.createElement('style');
      css.textContent = '#scale-fig{position:fixed;z-index:40;pointer-events:none;width:28px}'
        + '#scale-fig .body{position:absolute;left:6px;top:0;bottom:0;width:16px;background:#3ee0ff;border-radius:8px 8px 3px 3px;box-shadow:0 0 0 2px #08343a}'
        + '#scale-fig .tag{position:absolute;left:30px;top:0;color:#e9fbff;font:700 13px/1.2 sans-serif;text-shadow:0 1px 2px #000}';
      document.body.append(css, el);
    }
    const head = feet.clone();
    head.y += 1.75;
    const project = (p) => {
      const q = p.clone().project(cam);
      return {
        x: (q.x * 0.5 + 0.5) * innerWidth,
        y: (-q.y * 0.5 + 0.5) * innerHeight,
        z: q.z,
      };
    };
    const hp = project(head);
    const fp = project(feet);
    const top = Math.min(hp.y, fp.y);
    const height = Math.abs(fp.y - hp.y);
    el.style.left = `${fp.x - 14}px`;
    el.style.top = `${top}px`;
    el.style.height = `${Math.max(8, height)}px`;
    const visible = hp.z > -1 && hp.z < 1 && fp.z > -1 && fp.z < 1 && height > 24 && fp.x > 40 && fp.x < innerWidth - 40;
    return {
      district,
      ground: g,
      px: Math.round(height),
      h: innerHeight,
      frac: height / innerHeight,
      visible,
      feet: [feet.x, feet.y, feet.z],
    };
  });
  await page.waitForTimeout(400);
  const file = join(FIG, `${s.name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 62, timeout: 120_000 });
  await page.screenshot({ path: join(ART, `${s.name}.jpg`), type: 'jpeg', quality: 62, timeout: 120_000 });
  checks[s.name] = { ...probe, compare: s.compare ?? null, errors: errors.slice(0, 3) };
  console.log(`${s.name}: ${((Date.now() - t0) / 1000).toFixed(1)}s probe=${probe.district} fig=${probe.px}px/${probe.h} visible=${probe.visible}`);
  await ctx.close();
}

for (const s of shots) {
  if (ONLY.size && !ONLY.has(s.name)) continue;
  try {
    await one(s);
  } catch (err) {
    console.error(`${s.name} FAILED`, err);
    checks[s.name] = { error: String(err).slice(0, 400) };
  }
}
await browser.close();

const out = {
  low: checks['little-tokyo-low'],
  ultra: checks['little-tokyo-ultra'],
  phone: checks['little-tokyo-phone'],
  shots: checks,
};
writeFileSync(join(ROOT, 'tools/scale-audit/out/figure-check.json'), JSON.stringify(out, null, 2));
writeReports();
const bad = Object.entries(checks).filter(([, v]) => !v.visible);
console.log(`shots ${Object.keys(checks).length}, not-visible ${bad.map(([k]) => k).join(', ') || 'none'}`);
