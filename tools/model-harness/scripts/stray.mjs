// Stray-part gate. Orthographic silhouettes miss a thin fin when the score is only IoU,
// so this reports the furthest a connected region sticks out past the reference, and
// it also flags floating islands and thin plates.
//
//   node tools/model-harness/scripts/stray.mjs public/models/spinner/spinner-high.glb
//
// Exit 0 when the mesh passes. Exit 1 when it does not.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS = dirname(HERE);
const TRACE_PATH = join(HARNESS, 'silhouettes', 'k-spinner.json');
const FRUSTUM_PATH = join(HARNESS, 'silhouettes', 'frustum.json');

const OBLIQUE_PPM = 80;
const OBLIQUE_HALF = 3.8;
const VOXEL = 0.02;

export async function check(glbPath, whitelistPath = join(HARNESS, 'stray-whitelist.json'), options = {}) {
  await MeshoptDecoder.ready;
  const spec = JSON.parse(readFileSync(whitelistPath, 'utf8'));
  // Spinner boxes describe K's drums and skirt. They must not excuse a traffic car.
  if (options.kind) {
    const traffic = JSON.parse(readFileSync(join(HARNESS, 'stray-traffic.json'), 'utf8'));
    spec.justified = options.justified ?? traffic[options.kind] ?? [];
  }
  for (const rule of spec.rules) {
    if (!rule.reason || !String(rule.reason).trim()) {
      throw new Error('a stray whitelist rule is missing its reason');
    }
  }
  for (const item of spec.justified || []) {
    if (!item.reason || !String(item.reason).trim()) {
      throw new Error('a justified protrusion is missing its reason');
    }
  }
  const { triangles, lengthM } = loadGlb(glbPath);
  let frustum;
  let refs;
  let length = lengthM;
  if (options.kind) {
    const built = buildTrafficReference(options.kind);
    frustum = built.frustum;
    refs = built.refs;
    if (!length) length = built.lengthM;
  } else {
    const trace = JSON.parse(readFileSync(TRACE_PATH, 'utf8'));
    frustum = JSON.parse(readFileSync(FRUSTUM_PATH, 'utf8'));
    refs = buildReference(trace, frustum);
    if (!length) length = trace.views.side.lengthM;
  }
  const limitM = Math.min(spec.protrusionM, spec.lengthFraction * length);
  const bodyTris = triangles.filter((tri) => !tri.material.startsWith('light-'));
  const views = silhouetteViews(frustum).map((view) => scoreView(view, bodyTris, refs, limitM, spec, frustum));
  const parts = classifyParts(triangles, spec);
  const strayRegions = views.reduce((sum, view) => sum + view.strayRegions, 0);
  const maxProtrusionM = views.reduce((max, view) => Math.max(max, view.maxProtrusionM), 0);
  const pass = strayRegions === 0 && parts.loose.length === 0 && parts.thin.length === 0;
  return {
    pass,
    file: glbPath,
    lengthM: round(length),
    limitM: round(limitM),
    maxProtrusionM: round(maxProtrusionM),
    strayRegions,
    views: views.map((view) => ({
      id: view.id,
      iou: round(view.iou),
      maxProtrusionM: round(view.maxProtrusionM),
      strayRegions: view.strayRegions,
      limitM: round(view.limitM),
      worst: view.worst,
      regions: view.regions,
      justifiedRegions: view.justifiedRegions || 0,
    })),
    loose: parts.loose,
    thin: parts.thin,
    excused: parts.excused,
    components: parts.components,
  };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function loadGlb(path) {
  const data = readFileSync(path);
  const jsonLen = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + jsonLen).toString('utf8'));
  let bin = null;
  let offset = 20 + jsonLen;
  while (offset + 8 <= data.length) {
    const len = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    const chunk = data.subarray(offset + 8, offset + 8 + len);
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + len;
  }
  if (!bin) throw new Error(`no BIN chunk in ${path}`);
  const decoded = new Map();
  function viewBytes(index) {
    if (decoded.has(index)) return decoded.get(index);
    const bv = json.bufferViews[index];
    const ext = bv.extensions && bv.extensions.EXT_meshopt_compression;
    let bytes;
    if (!ext) {
      const start = bv.byteOffset || 0;
      bytes = bin.subarray(start, start + bv.byteLength);
    } else {
      const start = ext.byteOffset || 0;
      const source = bin.subarray(start, start + ext.byteLength);
      bytes = new Uint8Array(ext.count * ext.byteStride);
      MeshoptDecoder.decodeGltfBuffer(bytes, ext.count, ext.byteStride, source, ext.mode, ext.filter || 'NONE');
    }
    decoded.set(index, bytes);
    return bytes;
  }
  const meshName = new Map();
  json.nodes.forEach((node, index) => {
    if (node.mesh !== undefined && node.name) meshName.set(node.mesh, node.name);
    for (const child of node.children || []) {
      const kid = json.nodes[child];
      if (kid && kid.mesh !== undefined && node.name) meshName.set(kid.mesh, node.name);
    }
    void index;
  });
  const triangles = [];
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  json.meshes.forEach((mesh, meshIndex) => {
    const materialFallback = meshName.get(meshIndex) || mesh.name || `mesh-${meshIndex}`;
    const node = json.nodes.find((item) => item.mesh === meshIndex) || {};
    for (const prim of mesh.primitives) {
      const material = json.materials[prim.material]?.name || materialFallback;
      const pos = readAccessor(json, viewBytes, prim.attributes.POSITION);
      const idx = readAccessor(json, viewBytes, prim.indices);
      const scale = node.scale || [1, 1, 1];
      const translation = node.translation || [0, 0, 0];
      const verts = new Float32Array(pos.length);
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i] * scale[0] + translation[0];
        const y = pos[i + 1] * scale[1] + translation[1];
        const z = pos[i + 2] * scale[2] + translation[2];
        verts[i] = x;
        verts[i + 1] = y;
        verts[i + 2] = z;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      for (let i = 0; i < idx.length; i += 3) {
        triangles.push({
          material,
          verts,
          i0: idx[i],
          i1: idx[i + 1],
          i2: idx[i + 2],
        });
      }
    }
  });
  // glTF nose is -Z, height is Y. Length is the nose-to-tail span.
  const lengthM = Math.max(maxY - minY, maxZ - minZ);
  return { triangles, lengthM };
}

function readAccessor(json, viewBytes, index) {
  const acc = json.accessors[index];
  const bv = json.bufferViews[acc.bufferView];
  const bytes = viewBytes(acc.bufferView);
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const stride = bv.byteStride || comps * componentBytes(acc.componentType);
  const start = acc.byteOffset || 0;
  const out = new Float64Array(acc.count * comps);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < comps; c++) {
      const at = start + i * stride + c * componentBytes(acc.componentType);
      out[i * comps + c] = readComponent(view, at, acc.componentType, acc.normalized);
    }
  }
  return out;
}

function componentBytes(type) {
  if (type === 5120 || type === 5121) return 1;
  if (type === 5122 || type === 5123) return 2;
  return 4;
}

function readComponent(view, offset, type, normalized) {
  switch (type) {
    case 5120: return view.getInt8(offset);
    case 5121: return view.getUint8(offset);
    case 5122: return view.getInt16(offset, true);
    case 5123: return view.getUint16(offset, true);
    case 5125: return view.getUint32(offset, true);
    case 5126: return view.getFloat32(offset, true);
    default: throw new Error(`unknown component type ${type}`);
  }
}

function buildReference(trace, frustum) {
  const ppm = frustum.ppm;
  const side = rasterPolygon(trace.views.side.points, frustum.side, ppm, 'xz');
  const front = rasterPolygon(trace.views.front.points, frustum.front, ppm, 'xz');
  const top = rasterPolygon(trace.views.top.points, frustum.top, ppm, 'top');
  return { side, front, top, ppm };
}

// Same envelopes as build_traffic.py car_reference / hauler_reference.
// Side and front points are (horizontal, up). Top points there are (x, y);
// this gate's top axis is (nose, -x), so they are converted below.
const TRAFFIC = {
  car: {
    length: 4.85, width: 1.78, height: 1.48, wheelR: 0.33, wheelW: 0.21, wheelX: 0.74,
    wheels: [1.36, -1.36],
  },
  hauler: {
    length: 16.2, width: 2.28, height: 3.9, wheelR: 0.52, wheelW: 0.30, wheelX: 0.78,
    wheels: [7.15, 5.85, 5.15, -5.15, -6.15],
  },
};

function trafficPolygons(kind) {
  const { length, width, height } = TRAFFIC[kind];
  const half = length / 2;
  if (kind === 'car') {
    const side = [
      [half, 0.22 * height],
      [half * 0.82, 0.52 * height],
      [half * 0.42, 0.60 * height],
      [half * 0.18, 0.78 * height],
      [-half * 0.05, 0.98 * height],
      [-half * 0.42, 0.99 * height],
      [-half * 0.62, 0.78 * height],
      [-half * 0.82, 0.58 * height],
      [-half, 0.36 * height],
      [-half, 0.16 * height],
      [-half * 0.55, 0.14 * height],
      [half * 0.15, 0.13 * height],
      [half * 0.55, 0.14 * height],
      [half, 0.18 * height],
    ];
    const top = [
      [half * 0.15, half],
      [width * 0.28, half * 0.72],
      [width * 0.50, half * 0.15],
      [width * 0.48, -half * 0.35],
      [width * 0.36, -half * 0.82],
      [width * 0.18, -half],
      [-width * 0.18, -half],
      [-width * 0.36, -half * 0.82],
      [-width * 0.48, -half * 0.35],
      [-width * 0.50, half * 0.15],
      [-width * 0.28, half * 0.72],
      [-half * 0.15, half],
    ].map(([x, y]) => [y, -x]);
    const front = [
      [-width * 0.5, 0.16 * height],
      [-width * 0.5, 0.62 * height],
      [-width * 0.36, 0.78 * height],
      [-width * 0.28, 0.98 * height],
      [width * 0.28, 0.98 * height],
      [width * 0.36, 0.78 * height],
      [width * 0.5, 0.62 * height],
      [width * 0.5, 0.16 * height],
    ];
    return { side, top, front };
  }
  const cabBack = half - 2.55;
  const trailerFront = half - 3.05;
  const side = [
    [half, 0.18 * height],
    [half, 0.28 * height],
    [half - 0.4, 0.42 * height],
    [cabBack + 0.3, 0.55 * height],
    [cabBack, 0.82 * height],
    [cabBack, 0.32 * height],
    [trailerFront, 0.32 * height],
    [trailerFront, 0.99 * height],
    [-half, 0.99 * height],
    [-half, 0.30 * height],
    [-half + 0.4, 0.28 * height],
    [cabBack, 0.28 * height],
    [half - 0.5, 0.16 * height],
  ];
  const top = [
    [width * 0.42, half],
    [width * 0.50, cabBack],
    [width * 0.50, -half],
    [-width * 0.50, -half],
    [-width * 0.50, cabBack],
    [-width * 0.42, half],
  ].map(([x, y]) => [y, -x]);
  const front = [
    [-width * 0.50, 0.30 * height],
    [-width * 0.50, 0.99 * height],
    [width * 0.50, 0.99 * height],
    [width * 0.50, 0.30 * height],
    [width * 0.42, 0.30 * height],
    [width * 0.42, 0.06 * height],
    [-width * 0.42, 0.06 * height],
    [-width * 0.42, 0.30 * height],
  ];
  return { side, top, front };
}

function paintRect(frame, u0, v0, u1, v1) {
  const { mask, w, h, ppm, x0, y1 } = frame;
  const xLo = Math.max(0, Math.floor((Math.min(u0, u1) - x0) * ppm));
  const xHi = Math.min(w - 1, Math.ceil((Math.max(u0, u1) - x0) * ppm));
  const yLo = Math.max(0, Math.floor((y1 - Math.max(v0, v1)) * ppm));
  const yHi = Math.min(h - 1, Math.ceil((y1 - Math.min(v0, v1)) * ppm));
  for (let y = yLo; y <= yHi; y++) {
    const row = y * w;
    for (let x = xLo; x <= xHi; x++) mask[row + x] = 255;
  }
}

function paintCircle(frame, cx, cy, radius) {
  const { mask, w, h, ppm, x0, y1 } = frame;
  const rpx = radius * ppm;
  const pcx = (cx - x0) * ppm;
  const pcy = (y1 - cy) * ppm;
  const xLo = Math.max(0, Math.floor(pcx - rpx));
  const xHi = Math.min(w - 1, Math.ceil(pcx + rpx));
  const yLo = Math.max(0, Math.floor(pcy - rpx));
  const yHi = Math.min(h - 1, Math.ceil(pcy + rpx));
  const r2 = rpx * rpx;
  for (let y = yLo; y <= yHi; y++) {
    const dy = y + 0.5 - pcy;
    const row = y * w;
    for (let x = xLo; x <= xHi; x++) {
      const dx = x + 0.5 - pcx;
      if (dx * dx + dy * dy <= r2) mask[row + x] = 255;
    }
  }
}

function buildTrafficReference(kind) {
  const spec = TRAFFIC[kind];
  if (!spec) throw new Error(`unknown traffic kind ${kind}`);
  const pad = 0.55;
  const ppm = 100;
  const frustum = {
    ppm,
    side: { x0: -spec.length / 2 - pad, x1: spec.length / 2 + pad, z0: -pad, z1: spec.height + pad },
    front: { x0: -spec.width / 2 - pad, x1: spec.width / 2 + pad, z0: -pad, z1: spec.height + pad },
    top: { x0: -spec.length / 2 - pad, x1: spec.length / 2 + pad, y0: -spec.width / 2 - pad, y1: spec.width / 2 + pad },
  };
  const polys = trafficPolygons(kind);
  const refs = buildReference({
    views: {
      side: { points: polys.side },
      front: { points: polys.front },
      top: { points: polys.top },
    },
  }, frustum);
  for (const y of spec.wheels) paintCircle(refs.side, y, spec.wheelR, spec.wheelR);
  // Front view of a tyre is the tread circle seen edge-on: a short rectangle.
  // The side scorer already includes these circles. The front polygon does not.
  for (const x of [spec.wheelX, -spec.wheelX]) {
    paintRect(refs.front, x - spec.wheelW / 2, 0, x + spec.wheelW / 2, spec.wheelR * 2);
  }
  refs.oblique = {
    ppm: kind === 'hauler' ? 28 : 56,
    half: spec.length * 0.58 + 1.1,
    target: [0, spec.height * 0.45, 0],
    voxel: kind === 'hauler' ? 0.05 : 0.03,
    hull: {
      x0: -spec.width / 2 - 0.45,
      x1: spec.width / 2 + 0.45,
      y0: -0.2,
      y1: spec.height + 0.45,
      z0: -spec.length / 2 - 0.45,
      z1: spec.length / 2 + 0.45,
    },
  };
  return { frustum, refs, lengthM: spec.length };
}

function rasterPolygon(points, bounds, ppm, mode) {
  const spanX = (mode === 'top' ? bounds.x1 - bounds.x0 : bounds.x1 - bounds.x0);
  const spanY = mode === 'top' ? bounds.y1 - bounds.y0 : bounds.z1 - bounds.z0;
  const w = Math.round(spanX * ppm);
  const h = Math.round(spanY * ppm);
  const x0 = bounds.x0;
  const y1 = mode === 'top' ? bounds.y1 : bounds.z1;
  const pix = points.map(([x, y]) => [(x - x0) * ppm, (y1 - y) * ppm]);
  const mask = new Uint8Array(w * h);
  fillPolygon(mask, w, h, pix);
  return { mask, w, h, ppm, x0, y1, bounds, mode };
}

function fillPolygon(mask, w, h, pts) {
  if (pts.length < 3) return;
  let minY = h - 1;
  let maxY = 0;
  for (const p of pts) {
    minY = Math.min(minY, Math.floor(p[1]));
    maxY = Math.max(maxY, Math.ceil(p[1]));
  }
  minY = Math.max(0, minY);
  maxY = Math.min(h - 1, maxY);
  for (let y = minY; y <= maxY; y++) {
    const scan = y + 0.5;
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= scan && y1 > scan) || (y1 <= scan && y0 > scan)) {
        const t = (scan - y0) / (y1 - y0);
        xs.push(x0 + t * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a = Math.max(0, Math.ceil(xs[i] - 1e-6));
      const b = Math.min(w - 1, Math.floor(xs[i + 1] + 1e-6));
      const row = y * w;
      for (let x = a; x <= b; x++) mask[row + x] = 255;
    }
  }
}

function silhouetteViews(frustum) {
  return [
    { id: 'side', kind: 'side' },
    { id: 'front', kind: 'front' },
    { id: 'rear', kind: 'rear' },
    { id: 'top', kind: 'top' },
    { id: 'three-quarter-45', kind: 'oblique', yaw: 45 },
    { id: 'three-quarter-135', kind: 'oblique', yaw: 135 },
    { id: 'three-quarter-225', kind: 'oblique', yaw: 225 },
    { id: 'three-quarter-315', kind: 'oblique', yaw: 315 },
  ];
}

function scoreView(view, triangles, refs, limitM, spec, frustum) {
  if (view.kind === 'oblique') return scoreOblique(view, triangles, refs, limitM, spec);
  const frame = view.kind === 'rear' ? rearFrame(refs, frustum) : refs[view.kind];
  const model = rasterModel(triangles, frame, view.kind);
  const refMask = view.kind === 'rear' ? frame.mask : refs[view.kind].mask;
  if (process.env.STRAY_OVERLAY) {
    writeOverlay(process.env.STRAY_OVERLAY, view.id, refMask, model, frame.w, frame.h);
  }
  const iou = maskIou(refMask, model);
  const distances = edt(refMask, frame.w, frame.h);
  const justified = (spec.justified || []).filter((item) => item.view === view.id);
  const caps = justified.filter((item) => item.maxM !== undefined && item.u0 === undefined);
  const viewLimit = caps.length ? Math.max(limitM, ...caps.map((item) => item.maxM)) : limitM;
  const regions = strayRegions(model, distances, frame.w, frame.h, viewLimit * frame.ppm, spec.minRegionPx || 3, (region) => {
    const u = frame.x0 + region.x / frame.ppm;
    const v = frame.y1 - region.y / frame.ppm;
    return justified.some((box) => box.u0 !== undefined && u >= box.u0 && u <= box.u1 && v >= box.v0 && v <= box.v1);
  });
  const where = regions.worstI < 0 ? null : locate(frame, regions.worstI);
  return {
    id: view.id,
    iou,
    maxProtrusionM: regions.maxPx / frame.ppm,
    strayRegions: regions.count,
    limitM: viewLimit,
    worst: where,
    regions: (regions.regions || []).slice(0, 12).map((region) => ({
      maxProtrusionM: round(region.maxPx / frame.ppm),
      pixels: region.pixels,
      u: round(frame.x0 + region.x / frame.ppm),
      v: round(frame.y1 - region.y / frame.ppm),
    })),
    justifiedRegions: regions.justifiedRegions || 0,
  };
}

function locate(frame, index) {
  const x = index % frame.w;
  const y = Math.floor(index / frame.w);
  return {
    u: round(frame.x0 + (x + 0.5) / frame.ppm),
    v: round(frame.y1 - (y + 0.5) / frame.ppm),
  };
}

function rearFrame(refs, frustum) {
  // Rear outline is the visual hull of the three traces, looked at from the tail.
  // A rear pixel is inside when the front trace allows that width and height and
  // some station along the car is inside both the side trace and the top trace.
  const { side, front, top } = refs;
  const w = front.w;
  const h = front.h;
  const mask = new Uint8Array(w * h);
  const sideRow = new Array(side.h);
  for (let y = 0; y < side.h; y++) sideRow[y] = side.mask.subarray(y * side.w, (y + 1) * side.w);
  const topRow = new Array(top.h);
  for (let y = 0; y < top.h; y++) topRow[y] = top.mask.subarray(y * top.w, (y + 1) * top.w);
  const overlap = new Uint8Array(top.h * side.h);
  const cols = Math.min(side.w, top.w);
  for (let ty = 0; ty < top.h; ty++) {
    for (let sy = 0; sy < side.h; sy++) {
      const a = topRow[ty];
      const b = sideRow[sy];
      for (let x = 0; x < cols; x++) {
        if (a[x] && b[x]) {
          overlap[ty * side.h + sy] = 1;
          break;
        }
      }
    }
  }
  const z0 = frustum.front.z0;
  const z1 = frustum.front.z1;
  const x0 = frustum.front.x0;
  const x1 = frustum.front.x1;
  for (let py = 0; py < h; py++) {
    const up = z1 - (py + 0.5) / h * (z1 - z0);
    const sy = Math.floor((side.y1 - up) * side.ppm);
    if (sy < 0 || sy >= side.h) continue;
    for (let px = 0; px < w; px++) {
      // Image right is -X, matching a camera behind the car.
      const horiz = x0 + (px + 0.5) / w * (x1 - x0);
      const gltfX = -horiz;
      const fx = Math.floor((gltfX - front.x0) * front.ppm);
      const fy = Math.floor((front.y1 - up) * front.ppm);
      if (fx < 0 || fy < 0 || fx >= front.w || fy >= front.h) continue;
      if (!front.mask[fy * front.w + fx]) continue;
      const width = horiz;
      const ty = Math.floor((top.y1 - width) * top.ppm);
      if (ty < 0 || ty >= top.h) continue;
      if (overlap[ty * side.h + sy]) mask[py * w + px] = 255;
    }
  }
  return { mask, w, h, ppm: front.ppm, x0, y1: z1, bounds: frustum.front, mode: 'xz' };
}

function scoreOblique(view, triangles, refs, limitM, spec) {
  const cfg = refs.oblique || {};
  const projector = obliqueProjector(view.yaw, 18, cfg.target);
  const ppm = cfg.ppm || OBLIQUE_PPM;
  const half = cfg.half || OBLIQUE_HALF;
  const voxel = cfg.voxel || VOXEL;
  const w = Math.round(half * 2 * ppm);
  const h = w;
  const frame = {
    w, h, ppm,
    project: projector,
    toPix(u, v) {
      return [(u + half) * ppm, (half - v) * ppm];
    },
  };
  const model = rasterProjected(triangles, frame);
  const ref = rasterHull(refs, frame);
  const iou = maskIou(ref, model);
  const distances = edt(ref, w, h);
  // The hull is voxelised. A voxel can fatten the outline by one step.
  // A maxM entry raises this view only. Boxes are not used here: the axes are
  // the view plane, and a box would also hide a fin. Orthographic views keep 3 cm.
  const justified = (spec.justified || []).filter((item) => item.view === view.id || item.view === 'oblique');
  const caps = justified.filter((item) => item.maxM !== undefined && item.u0 === undefined);
  const viewLimit = Math.max(limitM + voxel, ...(caps.length ? caps.map((item) => item.maxM) : [0]));
  const regions = strayRegions(model, distances, w, h, viewLimit * ppm, spec.minRegionPx || 3);
  return {
    id: view.id,
    iou,
    maxProtrusionM: regions.maxPx / ppm,
    strayRegions: regions.count,
    limitM: viewLimit,
    worst: regions.worstI < 0 ? null : {
      u: round((regions.worstI % w) / ppm - half),
      v: round(half - Math.floor(regions.worstI / w) / ppm),
    },
    regions: (regions.regions || []).slice(0, 8).map((region) => ({
      maxProtrusionM: round(region.maxPx / ppm),
      pixels: region.pixels,
      u: round(region.x / ppm - half),
      v: round(half - region.y / ppm),
    })),
  };
}

function obliqueProjector(yawDeg, elevDeg, target = [0, 0.62, 0]) {
  const yaw = yawDeg * Math.PI / 180;
  const elev = elevDeg * Math.PI / 180;
  const eye = [
    Math.sin(yaw) * Math.cos(elev),
    Math.sin(elev),
    -Math.cos(yaw) * Math.cos(elev),
  ];
  const forward = [-eye[0], -eye[1], -eye[2]];
  const up = [0, 1, 0];
  const right = normalize(cross(up, forward));
  const trueUp = normalize(cross(forward, right));
  return (p) => {
    const d0 = p[0] - target[0];
    const d1 = p[1] - target[1];
    const d2 = p[2] - target[2];
    return [
      d0 * right[0] + d1 * right[1] + d2 * right[2],
      d0 * trueUp[0] + d1 * trueUp[1] + d2 * trueUp[2],
    ];
  };
}

function rasterHull(refs, frame) {
  const mask = new Uint8Array(frame.w * frame.h);
  const { side, front, top } = refs;
  const hull = refs.oblique?.hull || { x0: -1.55, x1: 1.55, y0: -0.05, y1: 1.7, z0: -3.15, z1: 3.15 };
  const step = refs.oblique?.voxel || VOXEL;
  const radius = Math.max(1, step * frame.ppm * 0.6);
  const { x0, x1, y0, y1, z0, z1 } = hull;
  for (let x = x0; x <= x1; x += step) {
    for (let y = y0; y <= y1; y += step) {
      const fx = Math.floor((x - front.x0) * front.ppm);
      const fy = Math.floor((front.y1 - y) * front.ppm);
      if (fx < 0 || fy < 0 || fx >= front.w || fy >= front.h) continue;
      if (!front.mask[fy * front.w + fx]) continue;
      for (let z = z0; z <= z1; z += step) {
        const length = -z;
        const sx = Math.floor((length - side.x0) * side.ppm);
        const sy = Math.floor((side.y1 - y) * side.ppm);
        if (sx < 0 || sy < 0 || sx >= side.w || sy >= side.h) continue;
        if (!side.mask[sy * side.w + sx]) continue;
        const width = -x;
        const tx = Math.floor((length - top.x0) * top.ppm);
        const ty = Math.floor((top.y1 - width) * top.ppm);
        if (tx < 0 || ty < 0 || tx >= top.w || ty >= top.h) continue;
        if (!top.mask[ty * top.w + tx]) continue;
        const [u, v] = frame.project([x, y, z]);
        const [px, py] = frame.toPix(u, v);
        stamp(mask, frame.w, frame.h, px, py, radius);
      }
    }
  }
  return mask;
}

function stamp(mask, w, h, px, py, radius) {
  const x0 = Math.max(0, Math.floor(px - radius));
  const x1 = Math.min(w - 1, Math.ceil(px + radius));
  const y0 = Math.max(0, Math.floor(py - radius));
  const y1 = Math.min(h - 1, Math.ceil(py + radius));
  for (let y = y0; y <= y1; y++) {
    const row = y * w;
    for (let x = x0; x <= x1; x++) mask[row + x] = 255;
  }
}

function rasterModel(triangles, frame, kind) {
  const mask = new Uint8Array(frame.w * frame.h);
  const project = (p) => {
    if (kind === 'side') return [-p[2], p[1]];
    if (kind === 'front') return [p[0], p[1]];
    if (kind === 'rear') return [-p[0], p[1]];
    return [-p[2], -p[0]];
  };
  paintTriangles(mask, frame, triangles, (p) => {
    const [u, v] = project(p);
    return [(u - frame.x0) * frame.ppm, (frame.y1 - v) * frame.ppm];
  });
  return mask;
}

function rasterProjected(triangles, frame) {
  const mask = new Uint8Array(frame.w * frame.h);
  paintTriangles(mask, frame, triangles, (p) => {
    const [u, v] = frame.project(p);
    return frame.toPix(u, v);
  });
  return mask;
}

function paintTriangles(mask, frame, triangles, toPix) {
  for (const tri of triangles) {
    const a = vert(tri, tri.i0);
    const b = vert(tri, tri.i1);
    const c = vert(tri, tri.i2);
    fillTri(mask, frame.w, frame.h, toPix(a), toPix(b), toPix(c));
  }
}

function vert(tri, index) {
  const o = index * 3;
  return [tri.verts[o], tri.verts[o + 1], tri.verts[o + 2]];
}

function fillTri(mask, w, h, a, b, c) {
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  if (maxX < minX || maxY < minY) return;
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (area === 0) return;
  for (let y = minY; y <= maxY; y++) {
    const row = y * w;
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const w0 = (b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py);
      const w1 = (c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py);
      const w2 = (a[0] - px) * (b[1] - py) - (b[0] - px) * (a[1] - py);
      if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) mask[row + x] = 255;
    }
  }
}

function maskIou(ref, model) {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < ref.length; i++) {
    const a = ref[i] > 0;
    const b = model[i] > 0;
    if (a || b) union++;
    if (a && b) inter++;
  }
  return union ? inter / union : 0;
}

function edt(mask, w, h) {
  const inf = 1e8;
  const col = new Float64Array(h);
  const tmp = new Float64Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y] = mask[y * w + x] ? 0 : inf;
    const dist = edt1(col);
    for (let y = 0; y < h; y++) tmp[y * w + x] = dist[y];
  }
  const row = new Float64Array(w);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) row[x] = tmp[y * w + x];
    const dist = edt1(row);
    for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(dist[x]);
  }
  return out;
}

function edt1(f) {
  const n = f.length;
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = parabola(f, q, v[k]);
    while (s <= z[k]) {
      k -= 1;
      s = parabola(f, q, v[k]);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k += 1;
    const dx = q - v[k];
    d[q] = dx * dx + f[v[k]];
  }
  return d;
}

function parabola(f, q, vk) {
  return ((f[q] + q * q) - (f[vk] + vk * vk)) / (2 * q - 2 * vk);
}

function strayRegions(model, distances, w, h, limitPx, minRegionPx, excused) {
  const labels = new Int32Array(w * h);
  const parent = [0];
  let next = 1;
  const find = (a) => {
    let root = a;
    while (parent[root] !== root) root = parent[root];
    while (parent[a] !== a) {
      const n = parent[a];
      parent[a] = root;
      a = n;
    }
    return root;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // One pixel of raster slop. A flush edge is not a fin.
      if (!model[i] || distances[i] - 1 <= limitPx) continue;
      let left = x > 0 ? labels[i - 1] : 0;
      let up = y > 0 ? labels[i - w] : 0;
      if (left) left = find(left);
      if (up) up = find(up);
      if (!left && !up) {
        parent[next] = next;
        labels[i] = next;
        next += 1;
      } else {
        const keep = left || up;
        labels[i] = keep;
        if (left && up && left !== up) parent[up] = left;
      }
    }
  }
  const countPx = new Map();
  const maxPx = new Map();
  const sumX = new Map();
  const sumY = new Map();
  const worstAt = new Map();
  for (let i = 0; i < labels.length; i++) {
    if (!labels[i]) continue;
    const root = find(labels[i]);
    const px = distances[i] - 1;
    const prev = maxPx.get(root) || 0;
    if (px >= prev) worstAt.set(root, i);
    countPx.set(root, (countPx.get(root) || 0) + 1);
    maxPx.set(root, Math.max(prev, px));
    sumX.set(root, (sumX.get(root) || 0) + (i % w));
    sumY.set(root, (sumY.get(root) || 0) + Math.floor(i / w));
  }
  const regions = [];
  let justifiedRegions = 0;
  for (const [root, pixels] of countPx) {
    if (pixels < minRegionPx || maxPx.get(root) <= limitPx) continue;
    const region = {
      pixels,
      maxPx: maxPx.get(root),
      x: sumX.get(root) / pixels,
      y: sumY.get(root) / pixels,
      worstI: worstAt.get(root),
    };
    if (excused && excused(region)) {
      justifiedRegions += 1;
      continue;
    }
    regions.push(region);
  }
  regions.sort((a, b) => b.maxPx - a.maxPx);
  const maxFail = regions.reduce((max, region) => Math.max(max, region.maxPx), 0);
  return {
    count: regions.length,
    maxPx: maxFail,
    worstI: regions.length ? regions[0].worstI : -1,
    regions,
    justifiedRegions,
  };
}

function classifyParts(triangles, spec) {
  const groups = new Map();
  for (const tri of triangles) {
    if (!groups.has(tri.verts)) groups.set(tri.verts, []);
    groups.get(tri.verts).push(tri);
  }
  const components = [];
  for (const tris of groups.values()) {
    components.push(...splitComponents(tris));
  }
  if (!components.length) {
    return { loose: [], thin: [], excused: 0, components: 0 };
  }
  components.sort((a, b) => b.area - a.area);
  const main = components[0];
  const soup = createSurface(0.1);
  addComponent(soup, main);
  const attached = new Set([main]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const part of components) {
      if (attached.has(part)) continue;
      const gap = surfaceGap(part, soup, spec.touchM);
      if (gap <= spec.touchM) {
        part.gapToAssembly = gap;
        addComponent(soup, part);
        attached.add(part);
        grew = true;
      }
    }
  }
  const mainSurface = createSurface(0.1);
  addComponent(mainSurface, main);
  const loose = [];
  const thin = [];
  let excused = 0;
  for (const part of components) {
    if (part === main) continue;
    const gapToMain = surfaceGap(part, mainSurface, 0.25);
    part.gapToMain = gapToMain;
    const isThin = part.thickness < spec.thinM || part.aspect > spec.aspect;
    const isLoose = !attached.has(part);
    if (!isThin && !isLoose) continue;
    const rule = matchingRule(part, spec, isLoose);
    if (rule) {
      excused += 1;
      continue;
    }
    const row = {
      material: part.material,
      thicknessM: round(part.thickness),
      aspect: round(part.aspect),
      extentM: round(part.extent),
      gapM: gapToMain > 0.25 ? null : round(gapToMain),
      at: centroid(part.points),
      triangles: part.triangles,
    };
    if (isLoose) loose.push(row);
    if (isThin) thin.push(row);
  }
  loose.sort((a, b) => (b.gapM || 1) - (a.gapM || 1));
  thin.sort((a, b) => b.aspect - a.aspect);
  if (process.env.STRAY_DEBUG) debugGaps(components, attached);
  return { loose, thin, excused, components: components.length };
}

function debugGaps(components, attached) {
  for (const part of components) {
    if (part.material !== 'livery') continue;
    const b = part.bounds;
    console.error(
      'LIVERY attached', attached.has(part),
      'gap', part.gapToMain > 1 ? null : round(part.gapToMain || 0),
      'bounds', [round(b.minX), round(b.minY), round(b.minZ), round(b.maxX), round(b.maxY), round(b.maxZ)],
    );
  }
  const glass = components.find((part) => part.material === 'glass');
  const interesting = components.filter((part) => part !== components[0] && (part.gapToMain > 0.02 || !attached.has(part)));
  const surfaces = new Map();
  const surfaceFor = (part) => {
    if (surfaces.has(part)) return surfaces.get(part);
    const surface = createSurface(0.1);
    addComponent(surface, part);
    surfaces.set(part, surface);
    return surface;
  };
  if (glass) {
    const b = glass.bounds;
    console.error(
      'GLASS attached', attached.has(glass),
      'gapToMain', round(glass.gapToMain),
      'tris', glass.tris.length,
      'bounds', [round(b.minX), round(b.minY), round(b.minZ), round(b.maxX), round(b.maxY), round(b.maxZ)],
    );
  }
  for (const part of interesting.slice(0, 8)) {
    let brute = Infinity;
    if (glass) {
      for (const p of part.points) {
        for (const tri of glass.tris) {
          const a = vert(tri, tri.i0);
          const b = vert(tri, tri.i1);
          const c = vert(tri, tri.i2);
          const d = distPointTri(p[0], p[1], p[2], a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
          if (d < brute) brute = d;
        }
      }
    }
    const hashed = glass ? surfaceGap(part, surfaceFor(glass), 0.5) : null;
    const b = part.bounds;
    console.error(
      'PART', part.material,
      'at', centroid(part.points),
      'bounds', [round(b.minX), round(b.minY), round(b.minZ), round(b.maxX), round(b.maxY), round(b.maxZ)],
      'gapMain', part.gapToMain === Infinity ? null : round(part.gapToMain),
      'attached', attached.has(part),
      'bruteGlass', round(brute),
      'hashGlass', hashed === Infinity || hashed === null ? null : round(hashed),
      'tris', part.triangles,
    );
  }
}

function centroid(points) {
  let x = 0, y = 0, z = 0;
  const n = points.length || 1;
  for (const p of points) {
    x += p[0]; y += p[1]; z += p[2];
  }
  return [round(x / n), round(y / n), round(z / n)];
}

function matchingRule(part, spec, isLoose) {
  // A whitelist excuses a plate that is actually on the car. It does not excuse an island.
  if (isLoose) return null;
  for (const rule of spec.rules) {
    if (rule.material !== part.material) continue;
    const gapLimit = rule.allowGapM ?? spec.touchM;
    if (part.gapToMain > gapLimit) continue;
    if (rule.minThicknessM !== undefined && part.thickness < rule.minThicknessM) continue;
    if (rule.maxExtentM !== undefined && part.extent > rule.maxExtentM) continue;
    return rule;
  }
  return null;
}

function splitComponents(tris) {
  const material = tris[0].material;
  const verts = tris[0].verts;
  const n = verts.length / 3;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a) => {
    let root = a;
    while (parent[root] !== root) root = parent[root];
    while (parent[a] !== a) {
      const next = parent[a];
      parent[a] = root;
      a = next;
    }
    return root;
  };
  const weld = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(verts[i * 3] * 2000)},${Math.round(verts[i * 3 + 1] * 2000)},${Math.round(verts[i * 3 + 2] * 2000)}`;
    const prev = weld.get(key);
    if (prev !== undefined) parent[find(i)] = find(prev);
    else weld.set(key, i);
  }
  for (const tri of tris) {
    const a = find(tri.i0);
    const b = find(tri.i1);
    const c = find(tri.i2);
    parent[b] = a;
    parent[find(c)] = find(a);
  }
  const buckets = new Map();
  for (const tri of tris) {
    const root = find(tri.i0);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(tri);
  }
  const out = [];
  for (const group of buckets.values()) {
    let area = 0;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    const seen = new Set();
    const points = [];
    const samples = [];
    for (const tri of group) {
      const a = vert(tri, tri.i0);
      const b = vert(tri, tri.i1);
      const c = vert(tri, tri.i2);
      area += triangleArea(a, b, c);
      // Corners of a flat face miss a curved surface the face is sitting on.
      // The centroid and the edge midpoints catch that contact.
      samples.push(
        [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
        [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
        [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2, (b[2] + c[2]) / 2],
        [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2, (c[2] + a[2]) / 2],
      );
      for (const index of [tri.i0, tri.i1, tri.i2]) {
        if (seen.has(index)) continue;
        seen.add(index);
        const p = vert(tri, index);
        points.push(p);
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[2] < minZ) minZ = p[2];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
        if (p[2] > maxZ) maxZ = p[2];
      }
    }
    samples.push(...points);
    const dims = [maxX - minX, maxY - minY, maxZ - minZ].sort((a, b) => a - b);
    const thickness = dims[0];
    const extent = dims[2];
    out.push({
      material,
      area,
      points,
      samples,
      tris: group,
      triangles: group.length,
      thickness,
      extent,
      aspect: thickness > 1e-6 ? extent / thickness : 999,
      bounds: { minX, minY, minZ, maxX, maxY, maxZ },
    });
  }
  return out;
}

function triangleArea(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  return 0.5 * Math.hypot(cross[0], cross[1], cross[2]);
}

function createSurface(cell) {
  return {
    cell,
    count: 0,
    coords: new Float32Array(9 * 256),
    cells: new Map(),
    overflow: [],
    pointCount: 0,
    pointCoords: new Float32Array(3 * 256),
    pointCells: new Map(),
    stamp: 1,
    seen: new Uint32Array(256),
  };
}

function addComponent(surface, part) {
  for (const tri of part.tris) addTriangle(surface, vert(tri, tri.i0), vert(tri, tri.i1), vert(tri, tri.i2));
  const samples = part.samples || part.points;
  for (const p of samples) addPoint(surface, p[0], p[1], p[2]);
}

function addTriangle(surface, a, b, c) {
  const id = surface.count;
  const o = id * 9;
  if (o + 9 > surface.coords.length) {
    const next = new Float32Array(Math.max(surface.coords.length * 2, o + 9));
    next.set(surface.coords);
    surface.coords = next;
  }
  const dst = surface.coords;
  dst[o] = a[0]; dst[o + 1] = a[1]; dst[o + 2] = a[2];
  dst[o + 3] = b[0]; dst[o + 4] = b[1]; dst[o + 5] = b[2];
  dst[o + 6] = c[0]; dst[o + 7] = c[1]; dst[o + 8] = c[2];
  surface.count = id + 1;
  if (surface.seen.length < surface.count) {
    const seen = new Uint32Array(surface.count * 2);
    seen.set(surface.seen);
    surface.seen = seen;
  }
  const cell = surface.cell;
  let minX = Math.min(a[0], b[0], c[0]);
  let minY = Math.min(a[1], b[1], c[1]);
  let minZ = Math.min(a[2], b[2], c[2]);
  let maxX = Math.max(a[0], b[0], c[0]);
  let maxY = Math.max(a[1], b[1], c[1]);
  let maxZ = Math.max(a[2], b[2], c[2]);
  const x0 = Math.floor(minX / cell);
  const y0 = Math.floor(minY / cell);
  const z0 = Math.floor(minZ / cell);
  const x1 = Math.floor(maxX / cell);
  const y1 = Math.floor(maxY / cell);
  const z1 = Math.floor(maxZ / cell);
  if (x1 - x0 > 48 || y1 - y0 > 48 || z1 - z0 > 48) {
    surface.overflow.push(id);
    return;
  }
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        const key = `${x},${y},${z}`;
        let list = surface.cells.get(key);
        if (!list) {
          list = [];
          surface.cells.set(key, list);
        }
        list.push(id);
      }
    }
  }
}

function addPoint(surface, x, y, z) {
  const i = surface.pointCount;
  const o = i * 3;
  if (o + 3 > surface.pointCoords.length) {
    const next = new Float32Array(Math.max(surface.pointCoords.length * 2, o + 3));
    next.set(surface.pointCoords);
    surface.pointCoords = next;
  }
  surface.pointCoords[o] = x;
  surface.pointCoords[o + 1] = y;
  surface.pointCoords[o + 2] = z;
  surface.pointCount = i + 1;
  const cell = surface.cell;
  const key = `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  let list = surface.pointCells.get(key);
  if (!list) {
    list = [];
    surface.pointCells.set(key, list);
  }
  list.push(i);
}

function surfaceGap(part, surface, maxGap) {
  const fromPart = pointsToSurface(part.samples || part.points, surface, maxGap);
  if (fromPart <= 1e-4) return fromPart;
  const fromSoup = surfacePointsToPart(surface, part, maxGap);
  return Math.min(fromPart, fromSoup);
}

function pointsToSurface(points, surface, maxGap) {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const d = pointToSurface(p[0], p[1], p[2], surface, maxGap);
    if (d < best) best = d;
    if (best <= 1e-4) return best;
  }
  return best;
}

function pointToSurface(x, y, z, surface, maxGap) {
  const cell = surface.cell;
  const reach = Math.floor(maxGap / cell) + 1;
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  const cz = Math.floor(z / cell);
  surface.stamp += 1;
  if (surface.stamp === 0xffffffff) {
    surface.seen.fill(0);
    surface.stamp = 1;
  }
  const stamp = surface.stamp;
  const seen = surface.seen;
  const coords = surface.coords;
  let best = Infinity;
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const list = surface.cells.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (!list) continue;
        for (let n = 0; n < list.length; n++) {
          const id = list[n];
          if (seen[id] === stamp) continue;
          seen[id] = stamp;
          const o = id * 9;
          const d = distPointTri(
            x, y, z,
            coords[o], coords[o + 1], coords[o + 2],
            coords[o + 3], coords[o + 4], coords[o + 5],
            coords[o + 6], coords[o + 7], coords[o + 8],
          );
          if (d < best) best = d;
        }
      }
    }
  }
  const overflow = surface.overflow;
  for (let n = 0; n < overflow.length; n++) {
    const id = overflow[n];
    if (seen[id] === stamp) continue;
    seen[id] = stamp;
    const o = id * 9;
    const d = distPointTri(
      x, y, z,
      coords[o], coords[o + 1], coords[o + 2],
      coords[o + 3], coords[o + 4], coords[o + 5],
      coords[o + 6], coords[o + 7], coords[o + 8],
    );
    if (d < best) best = d;
  }
  return best <= maxGap ? best : Infinity;
}

function surfacePointsToPart(surface, part, maxGap) {
  const { minX, minY, minZ, maxX, maxY, maxZ } = part.bounds;
  const cell = surface.cell;
  const x0 = Math.floor((minX - maxGap) / cell);
  const y0 = Math.floor((minY - maxGap) / cell);
  const z0 = Math.floor((minZ - maxGap) / cell);
  const x1 = Math.floor((maxX + maxGap) / cell);
  const y1 = Math.floor((maxY + maxGap) / cell);
  const z1 = Math.floor((maxZ + maxGap) / cell);
  if (x1 - x0 > 80 || y1 - y0 > 80 || z1 - z0 > 80) return Infinity;
  const target = part.tris.length > 24 ? partSurface(part) : null;
  const coords = surface.pointCoords;
  let best = Infinity;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        const list = surface.pointCells.get(`${x},${y},${z}`);
        if (!list) continue;
        for (let n = 0; n < list.length; n++) {
          const o = list[n] * 3;
          const px = coords[o];
          const py = coords[o + 1];
          const pz = coords[o + 2];
          if (px < minX - maxGap || px > maxX + maxGap || py < minY - maxGap || py > maxY + maxGap || pz < minZ - maxGap || pz > maxZ + maxGap) continue;
          const d = target
            ? pointToSurface(px, py, pz, target, maxGap)
            : pointToPartTris(px, py, pz, part.tris);
          if (d < best) best = d;
          if (best <= 1e-4) return best;
        }
      }
    }
  }
  return best <= maxGap ? best : Infinity;
}

function partSurface(part) {
  if (part.surface) return part.surface;
  const surface = createSurface(0.1);
  for (const tri of part.tris) addTriangle(surface, vert(tri, tri.i0), vert(tri, tri.i1), vert(tri, tri.i2));
  part.surface = surface;
  return surface;
}

function pointToPartTris(x, y, z, tris) {
  let best = Infinity;
  for (let i = 0; i < tris.length; i++) {
    const tri = tris[i];
    const a = vert(tri, tri.i0);
    const b = vert(tri, tri.i1);
    const c = vert(tri, tri.i2);
    const d = distPointTri(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    if (d < best) best = d;
  }
  return best;
}

// Closest distance from a point to a triangle. Ericson, Real-Time Collision Detection.
function distPointTri(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return Math.hypot(apx, apy, apz);

  const bpx = px - bx;
  const bpy = py - by;
  const bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return Math.hypot(bpx, bpy, bpz);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return Math.hypot(ax + abx * v - px, ay + aby * v - py, az + abz * v - pz);
  }

  const cpx = px - cx;
  const cpy = py - cy;
  const cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return Math.hypot(cpx, cpy, cpz);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return Math.hypot(ax + acx * w - px, ay + acy * w - py, az + acz * w - pz);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return Math.hypot(bx + (cx - bx) * w - px, by + (cy - by) * w - py, bz + (cz - bz) * w - pz);
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return Math.hypot(ax + abx * v + acx * w - px, ay + aby * v + acy * w - py, az + abz * v + acz * w - pz);
}

function writeOverlay(dir, id, ref, model, w, h) {
  mkdirSync(dir, { recursive: true });
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < ref.length; i++) {
    const a = ref[i] > 0;
    const b = model[i] > 0;
    const o = i * 3;
    if (a && b) {
      rgb[o] = 236; rgb[o + 1] = 232; rgb[o + 2] = 220;
    } else if (a) {
      rgb[o] = 196; rgb[o + 1] = 64; rgb[o + 2] = 54;
    } else if (b) {
      rgb[o] = 64; rgb[o + 1] = 168; rgb[o + 2] = 196;
    } else {
      rgb[o] = 8; rgb[o + 1] = 8; rgb[o + 2] = 10;
    }
  }
  const header = Buffer.from(`P6\n${w} ${h}\n255\n`);
  writeFileSync(`${dir}/${id}.ppm`, Buffer.concat([header, rgb]));
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith('--'));
  if (!file) {
    console.error('usage: node tools/model-harness/scripts/stray.mjs <model.glb> [--out report.json]');
    process.exit(2);
  }
  const outFlag = args.indexOf('--out');
  const kindFlag = args.indexOf('--kind');
  const kind = kindFlag === -1 ? undefined : args[kindFlag + 1];
  const report = await check(file, undefined, kind ? { kind } : {});
  const text = JSON.stringify(report, null, 2);
  if (outFlag !== -1) writeFileSync(args[outFlag + 1], text);
  console.log(text);
  process.exit(report.pass ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
