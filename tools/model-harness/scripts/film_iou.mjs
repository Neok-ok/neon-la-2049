// Film-still silhouette overlap. Uniform scale and translation only.
// The reference mask is a traced still, not the mesh's own boxes.
//
//   node tools/model-harness/scripts/film_iou.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadGlb } from './stray.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const FILM = join(ROOT, 'artifacts', 'g1', 'film');

function readPgm(path) {
  const data = readFileSync(path);
  const text = data.toString('latin1');
  const head = text.match(/^P5\n(\d+) (\d+)\n255\n/);
  if (!head) throw new Error(`not a PGM: ${path}`);
  const w = Number(head[1]);
  const h = Number(head[2]);
  const start = head[0].length;
  const raw = data.subarray(start, start + w * h);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = raw[i] > 127 ? 1 : 0;
  return { w, h, mask };
}

function vert(tri, index) {
  const o = index * 3;
  return [tri.verts[o], tri.verts[o + 1], tri.verts[o + 2]];
}

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(v) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

function camera(eye, target, upHint = [0, 1, 0], perspective = true) {
  const forward = norm(sub(target, eye));
  let right = cross(forward, upHint);
  if (Math.hypot(right[0], right[1], right[2]) < 1e-3) right = cross(forward, [1, 0, 0]);
  right = norm(right);
  const up = norm(cross(right, forward));
  const dist = Math.hypot(target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]) || 1;
  return (p) => {
    const v = sub(p, eye);
    const depth = Math.max(1e-3, dot(v, forward));
    const s = perspective ? dist / depth : 1;
    return [dot(v, right) * s, dot(v, up) * s];
  };
}

function fillTri(mask, w, h, a, b, c) {
  const pts = [a, b, c];
  let minY = Math.min(a[1], b[1], c[1]);
  let maxY = Math.max(a[1], b[1], c[1]);
  minY = Math.max(0, Math.ceil(minY));
  maxY = Math.min(h - 1, Math.floor(maxY));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < 3; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % 3];
      if ((p[1] <= y && q[1] > y) || (q[1] <= y && p[1] > y)) {
        const t = (y - p[1]) / (q[1] - p[1]);
        xs.push(p[0] + (q[0] - p[0]) * t);
      }
    }
    if (xs.length < 2) continue;
    let x0 = Math.ceil(Math.min(xs[0], xs[1]));
    let x1 = Math.floor(Math.max(xs[0], xs[1]));
    if (x0 < 0) x0 = 0;
    if (x1 >= w) x1 = w - 1;
    const row = y * w;
    for (let x = x0; x <= x1; x++) mask[row + x] = 1;
  }
}

function raster(triangles, project, size, keep, limit) {
  const pts = [];
  const accepted = [];
  for (const tri of triangles) {
    if (tri.material.startsWith('light-')) continue;
    if (keep && !keep(tri)) continue;
    const a = project(vert(tri, tri.i0));
    const b = project(vert(tri, tri.i1));
    const c = project(vert(tri, tri.i2));
    if (limit) {
      const cx = (a[0] + b[0] + c[0]) / 3;
      const cy = (a[1] + b[1] + c[1]) / 3;
      if (cx * cx + cy * cy > limit * limit) continue;
    }
    accepted.push(tri);
    pts.push(a, b, c);
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const pad = 8;
  const scale = (size - pad * 2) / span;
  const ox = pad - minX * scale + (size - (maxX - minX) * scale) / 2;
  const oy = pad - minY * scale + (size - (maxY - minY) * scale) / 2;
  // Image y grows downward. World up is +screen y before the flip.
  const mask = new Uint8Array(size * size);
  const map = (p) => [p[0] * scale + ox, size - (p[1] * scale + oy)];
  for (const tri of accepted) {
    fillTri(
      mask, size, size,
      map(project(vert(tri, tri.i0))),
      map(project(vert(tri, tri.i1))),
      map(project(vert(tri, tri.i2))),
    );
  }
  return { w: size, h: size, mask };
}

function downscale(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.w, img.h));
  if (scale === 1) return img;
  const w = Math.max(1, Math.round(img.w * scale));
  const h = Math.max(1, Math.round(img.h * scale));
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.h - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.w - 1, Math.floor(x / scale));
      if (img.mask[sy * img.w + sx]) mask[y * w + x] = 1;
    }
  }
  return { w, h, mask };
}

function foreground(mask, w, h) {
  const pts = [];
  let cx = 0, cy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      pts.push(x, y);
      cx += x;
      cy += y;
    }
  }
  const n = pts.length / 2 || 1;
  return { pts, cx: cx / n, cy: cy / n, count: pts.length / 2 };
}

function overlap(ref, model, scale, tx, ty) {
  const { w, h, mask } = ref;
  const placed = new Uint8Array(w * h);
  let count = 0;
  let inter = 0;
  for (let i = 0; i < model.pts.length; i += 2) {
    const x = Math.round(model.pts[i] * scale + tx);
    const y = Math.round(model.pts[i + 1] * scale + ty);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (placed[p]) continue;
    placed[p] = 1;
    count += 1;
    if (mask[p]) inter += 1;
  }
  const union = ref.count + count - inter;
  return union ? inter / union : 0;
}

function align(refImg, modelImg) {
  const ref = { ...refImg, ...foreground(refImg.mask, refImg.w, refImg.h), count: 0 };
  ref.count = ref.pts.length / 2;
  const model = foreground(modelImg.mask, modelImg.w, modelImg.h);
  // Match the long side, then nudge. Same scale on both axes.
  let refMinX = Infinity, refMinY = Infinity, refMaxX = -Infinity, refMaxY = -Infinity;
  for (let i = 0; i < ref.pts.length; i += 2) {
    const x = ref.pts[i], y = ref.pts[i + 1];
    if (x < refMinX) refMinX = x;
    if (y < refMinY) refMinY = y;
    if (x > refMaxX) refMaxX = x;
    if (y > refMaxY) refMaxY = y;
  }
  let modMinX = Infinity, modMinY = Infinity, modMaxX = -Infinity, modMaxY = -Infinity;
  for (let i = 0; i < model.pts.length; i += 2) {
    const x = model.pts[i], y = model.pts[i + 1];
    if (x < modMinX) modMinX = x;
    if (y < modMinY) modMinY = y;
    if (x > modMaxX) modMaxX = x;
    if (y > modMaxY) modMaxY = y;
  }
  const refSpan = Math.max(refMaxX - refMinX, refMaxY - refMinY) || 1;
  const modSpan = Math.max(modMaxX - modMinX, modMaxY - modMinY) || 1;
  const base = refSpan / modSpan;
  let best = { iou: -1, scale: base, tx: 0, ty: 0 };
  const scales = [];
  for (let s = 0.72; s <= 1.28; s += 0.04) scales.push(base * s);
  for (const scale of scales) {
    const tx0 = ref.cx - model.cx * scale;
    const ty0 = ref.cy - model.cy * scale;
    for (let ty = ty0 - 18; ty <= ty0 + 18; ty += 3) {
      for (let tx = tx0 - 18; tx <= tx0 + 18; tx += 3) {
        const iou = overlap(ref, model, scale, tx, ty);
        if (iou > best.iou) best = { iou, scale, tx, ty };
      }
    }
  }
  const fine = { ...best };
  for (let s = -0.03; s <= 0.03; s += 0.01) {
    const scale = best.scale + s * base;
    for (let ty = best.ty - 3; ty <= best.ty + 3; ty += 1) {
      for (let tx = best.tx - 3; tx <= best.tx + 3; tx += 1) {
        const iou = overlap(ref, model, scale, tx, ty);
        if (iou > fine.iou) fine.iou = iou, fine.scale = scale, fine.tx = tx, fine.ty = ty;
      }
    }
  }
  return { ...fine, refCount: ref.count, modelCount: model.count };
}

function overlay(ref, model, fit, path) {
  const { w, h } = ref;
  const rgb = Buffer.alloc(w * h * 3);
  const scale = fit.scale, tx = fit.tx, ty = fit.ty;
  const placed = new Uint8Array(w * h);
  for (let i = 0; i < model.pts.length; i += 2) {
    const x = Math.round(model.pts[i] * scale + tx);
    const y = Math.round(model.pts[i + 1] * scale + ty);
    if (x >= 0 && y >= 0 && x < w && y < h) placed[y * w + x] = 1;
  }
  for (let i = 0; i < w * h; i++) {
    const a = ref.mask[i] === 1;
    const b = placed[i] === 1;
    const o = i * 3;
    if (a && b) { rgb[o] = 236; rgb[o + 1] = 232; rgb[o + 2] = 220; }
    else if (a) { rgb[o] = 196; rgb[o + 1] = 64; rgb[o + 2] = 54; }
    else if (b) { rgb[o] = 64; rgb[o + 1] = 168; rgb[o + 2] = 196; }
    else { rgb[o] = 12; rgb[o + 1] = 12; rgb[o + 2] = 14; }
  }
  const header = Buffer.from(`P6\n${w} ${h}\n255\n`);
  writeFileSync(path, Buffer.concat([header, rgb]));
}

const VIEWS = [
  {
    id: 'hall-day',
    glb: 'public/models/landmarks/hall-high.glb',
    ref: 'hall-day-ref.pgm',
    eye: [48, 62, 210],
    target: [0, 72, 0],
    note: 'Three-quarter from the front-right, about the height of the day photo. Uniform scale and translation onto hall-day.jpg.',
  },
  {
    id: 'hall-dusk',
    glb: 'public/models/landmarks/hall-high.glb',
    ref: 'hall-dusk-ref.pgm',
    eye: [22, 42, 168],
    target: [0, 108, 0],
    keep: (tri) => {
      const y = (vert(tri, tri.i0)[1] + vert(tri, tri.i1)[1] + vert(tri, tri.i2)[1]) / 3;
      return y > 30;
    },
    note: 'Shaft and crown. The dusk still hides the wings behind a foreground roof, so stone below 30 m is not in this comparison.',
  },
  {
    id: 'lapd-aerial',
    glb: 'public/models/landmarks/lapd-high.glb',
    ref: 'lapd-aerial-ref.pgm',
    eye: [18, 260, -210],
    target: [0, 150, -10],
    note: 'High front aerial, matching lapd-roof.jpg. The still is oblique. An orthographic plan is a different picture and is not this score.',
  },
  {
    id: 'lapd-plan',
    glb: 'public/models/landmarks/lapd-high.glb',
    ref: 'lapd-plan-ref.pgm',
    eye: [0, 500, 0],
    target: [0, 160, 0],
    up: [0, 0, -1],
    perspective: false,
    note: 'Orthographic roof against the deck traced from the film overhead. The shaft under the deck is not in the mask, and the mask is not the source boxes.',
  },
  {
    id: 'hall-plan',
    glb: 'public/models/landmarks/hall-high.glb',
    ref: 'hall-plan-ref.pgm',
    eye: [0, 400, 0],
    target: [0, 40, 0],
    up: [0, 0, -1],
    perspective: false,
    note: 'Orthographic plan against the surveyed City Hall footprint. Uniform scale and translation after the footprint is rotated onto its long axis.',
  },
  {
    id: 'wallace-plan',
    glb: 'public/models/landmarks/wallace-high.glb',
    ref: 'wallace-plan-ref.pgm',
    eye: [0, 8000, 0],
    target: [0, 1600, 0],
    up: [0, 0, -1],
    perspective: false,
    note: 'Orthographic plan against the square footprint of the Weta pyramid. Not the terrace boxes.',
  },
  {
    id: 'wallace-face',
    glb: 'public/models/landmarks/wallace-high.glb',
    ref: 'wallace-face-ref.pgm',
    eye: [180, 220, -2600],
    target: [0, 1700, -700],
    limit: 1400,
    note: 'Low oblique of the entrance face, cropped the way wallace-bts.jpg crops one pyramid. There is no verified top-down still.',
  },
];

await MeshoptDecoder.ready;
mkdirSync(FILM, { recursive: true });
const notes = JSON.parse(readFileSync(join(FILM, 'ref-notes.json'), 'utf8'));
const report = {
  alignment: 'uniform scale and translation, no non-uniform stretch',
  topIsReconstructed: false,
  views: {},
};

for (const view of VIEWS) {
  const ref = downscale(readPgm(join(FILM, view.ref)), 220);
  const { triangles } = loadGlb(join(ROOT, view.glb));
  const project = camera(view.eye, view.target, view.up, view.perspective !== false);
  const modelImg = raster(triangles, project, 220, view.keep, view.limit);
  const model = foreground(modelImg.mask, modelImg.w, modelImg.h);
  const fit = align(ref, modelImg);
  const ppm = join(FILM, `${view.id}-overlay.ppm`);
  overlay(ref, model, fit, ppm);
  report.views[view.id] = {
    iou: fit.iou,
    scale: fit.scale,
    translation: [fit.tx, fit.ty],
    ref: view.ref,
    still: notes[view.ref.replace('-ref.pgm', '')]?.note || view.ref,
    camera: { eye: view.eye, target: view.target },
    note: view.note,
  };
  console.log(view.id, fit.iou.toFixed(3));
}

writeFileSync(join(FILM, 'film-iou.json'), JSON.stringify(report, null, 2));
console.log('WROTE', join(FILM, 'film-iou.json'));
