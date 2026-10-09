// Pure module (worker-safe). Resolves the JSON city plan into local-meter geometry + fast queries.
import layoutJson from '../data/city-layout.json';
import { geoToLocal } from './geo';

export type Vec2 = [number, number];

export interface GridSpec {
  bearingDeg: number;
  block: [number, number];
  street: number;
}

export interface District {
  index: number;
  id: string;
  name: string;
  loreSector: string;
  archetype: string;
  priority: number;
  grid: GridSpec;
  stage: number;
  /** 0..1 street-traffic weight. Ground cars scale the tier budget by this. 0 spawns none. */
  traffic: number;
  polygon: Vec2[];
  bbox: [number, number, number, number]; // minX, minZ, maxX, maxZ
}

export interface Landmark {
  id: string;
  name: string;
  type: string;
  x: number;
  z: number;
  bearingDeg: number;
  height: number;
  baseWidth: number;
  baseDepth?: number;
  topWidth?: number;
  crownWidth?: number;
  crownDepth?: number;
  crownHeight?: number;
  reserveRadius: number;
  confidence?: string;
  /** Skybridges: ids of the two landmarks they join. `height` is the deck height. */
  from?: string;
  to?: string;
}

export interface Polyline {
  id: string;
  name: string;
  width: number;
  pts: Vec2[];
  bbox: [number, number, number, number];
}

export interface SeaWall extends Polyline {
  crestHeight: number;
  baseWidth: number;
  crestWidth: number;
  terraces: number;
}

export interface Hill {
  name: string;
  x: number;
  z: number;
  rx: number;
  rz: number;
  h: number;
  cos: number;
  sin: number;
}

export interface Poi {
  id: string;
  name: string;
  kind: string;
  stage: number;
  x: number;
  z: number;
}

function bboxOf(pts: Vec2[], pad = 0): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, z] of pts) {
    if (x < a) a = x;
    if (z < b) b = z;
    if (x > c) c = x;
    if (z > d) d = z;
  }
  return [a - pad, b - pad, c + pad, d + pad];
}

const toLocal = (p: number[]): Vec2 => geoToLocal(p[0], p[1]);

function pointInPolygon(x: number, z: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  return Math.sqrt(qx * qx + qz * qz);
}

export function distToPolyline(x: number, z: number, pl: Polyline): number {
  let best = Infinity;
  for (let i = 0; i < pl.pts.length - 1; i++) {
    const d = distToSegment(x, z, pl.pts[i][0], pl.pts[i][1], pl.pts[i + 1][0], pl.pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

export class CityLayout {
  readonly districts: District[];
  readonly defaultDistrict: District;
  readonly landmarks: Landmark[];
  readonly pois: Poi[];
  readonly freeways: Polyline[];
  readonly rivers: Polyline[];
  readonly seaWalls: SeaWall[];
  readonly coastline: Vec2[];
  readonly oceanPoly: Vec2[];
  readonly oceanBBox: [number, number, number, number];
  readonly hills: Hill[];
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  private byPriority: District[];
  private corridors: Polyline[];

  constructor(json = layoutJson) {
    const b = json.meta.worldBounds;
    const [minX, minZ] = geoToLocal(b.north, b.west);
    const [maxX, maxZ] = geoToLocal(b.south, b.east);
    this.bounds = { minX, maxX, minZ, maxZ };

    this.districts = json.districts.map((d, i) => {
      const polygon = d.polygon.map(toLocal);
      return {
        index: i + 1,
        id: d.id,
        name: d.name,
        loreSector: d.loreSector,
        archetype: d.archetype,
        priority: d.priority,
        grid: d.grid as GridSpec,
        stage: d.stage,
        traffic: d.traffic,
        polygon,
        bbox: bboxOf(polygon),
      };
    });
    const dd = json.defaultDistrict;
    this.defaultDistrict = {
      index: 0,
      id: dd.id,
      name: dd.name,
      loreSector: dd.loreSector,
      archetype: dd.archetype,
      priority: 0,
      grid: dd.grid as GridSpec,
      stage: dd.stage,
      traffic: dd.traffic,
      polygon: [],
      bbox: [minX, minZ, maxX, maxZ],
    };
    this.byPriority = [...this.districts].sort((a, b2) => b2.priority - a.priority);

    this.landmarks = json.landmarks.map((l) => {
      const [x, z] = geoToLocal(l.lat, l.lon);
      return { ...(l as unknown as Landmark), x, z };
    });
    this.pois = json.pois.map((p) => {
      const [x, z] = geoToLocal(p.lat, p.lon);
      return { id: p.id, name: p.name, kind: p.kind, stage: p.stage, x, z };
    });

    const mkLine = (l: { id: string; name: string; width: number; points: number[][] }): Polyline => {
      const pts = l.points.map(toLocal);
      return { id: l.id, name: l.name, width: l.width, pts, bbox: bboxOf(pts, l.width) };
    };
    this.freeways = json.freeways.map(mkLine);
    this.rivers = json.rivers.map(mkLine);
    this.seaWalls = json.seaWalls.map((w) => {
      const pts = w.points.map(toLocal);
      return {
        id: w.id,
        name: w.name,
        width: w.baseWidth + 40,
        pts,
        bbox: bboxOf(pts, w.baseWidth + 40),
        crestHeight: w.crestHeight,
        baseWidth: w.baseWidth,
        crestWidth: w.crestWidth,
        terraces: w.terraces,
      };
    });
    this.corridors = [...this.freeways, ...this.rivers, ...this.seaWalls];

    this.coastline = json.coastline.map(toLocal);
    this.oceanPoly = [...this.coastline, ...json.oceanClosure.map(toLocal)];
    this.oceanBBox = bboxOf(this.oceanPoly);

    this.hills = json.hills.map((h) => {
      const [x, z] = geoToLocal(h.lat, h.lon);
      const r = (h.rotDeg * Math.PI) / 180;
      return { name: h.name, x, z, rx: h.rx, rz: h.rz, h: h.h, cos: Math.cos(r), sin: Math.sin(r) };
    });
  }

  inBounds(x: number, z: number, pad = 0): boolean {
    const b = this.bounds;
    return x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad;
  }

  districtAt(x: number, z: number): District {
    for (const d of this.byPriority) {
      const bb = d.bbox;
      if (x < bb[0] || z < bb[1] || x > bb[2] || z > bb[3]) continue;
      if (pointInPolygon(x, z, d.polygon)) return d;
    }
    return this.defaultDistrict;
  }

  /** Districts whose bbox overlaps the rectangle, plus the default district. */
  districtsOverlapping(x0: number, z0: number, x1: number, z1: number): District[] {
    const out: District[] = [];
    for (const d of this.districts) {
      const bb = d.bbox;
      if (bb[2] < x0 || bb[0] > x1 || bb[3] < z0 || bb[1] > z1) continue;
      out.push(d);
    }
    out.push(this.defaultDistrict);
    return out;
  }

  isOcean(x: number, z: number): boolean {
    const bb = this.oceanBBox;
    if (x < bb[0] || z < bb[1] || x > bb[2] || z > bb[3]) return false;
    return pointInPolygon(x, z, this.oceanPoly);
  }

  /** Terrain height (m). Basin is flat at 0; hills are smooth gaussian bumps with ridge noise. */
  heightAt(x: number, z: number): number {
    let h = 0;
    for (const hl of this.hills) {
      const dx = x - hl.x, dz = z - hl.z;
      const u = (dx * hl.cos - dz * hl.sin) / hl.rx;
      const v = (dx * hl.sin + dz * hl.cos) / hl.rz;
      const r2 = u * u + v * v;
      if (r2 > 9) continue;
      h += hl.h * Math.exp(-2.2 * r2);
    }
    if (h > 1) {
      const n = Math.sin(x * 0.0021 + Math.sin(z * 0.0013) * 2.0) * Math.cos(z * 0.0017 - x * 0.0007);
      h *= 0.82 + 0.18 * n;
      h = Math.max(0, h - 6);
    }
    return h;
  }

  /** True inside a landmark reserve. Freeway corridors are not landmarks, so trench edges use this instead of `isReserved`. */
  inLandmark(x: number, z: number, margin = 0): boolean {
    for (const l of this.landmarks) {
      if (l.reserveRadius <= 0) continue;
      const dx = x - l.x, dz = z - l.z;
      const r = l.reserveRadius + margin;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  /** True if a footprint of radius `margin` at (x,z) intersects a freeway/river/sea-wall corridor or landmark reserve. */
  isReserved(x: number, z: number, margin = 0): boolean {
    for (const l of this.landmarks) {
      if (l.reserveRadius <= 0) continue;
      const dx = x - l.x, dz = z - l.z;
      const r = l.reserveRadius + margin;
      if (dx * dx + dz * dz < r * r) return true;
    }
    for (const c of this.corridors) {
      const bb = c.bbox;
      if (x < bb[0] - margin || z < bb[1] - margin || x > bb[2] + margin || z > bb[3] + margin) continue;
      if (distToPolyline(x, z, c) < c.width * 0.5 + margin) return true;
    }
    return false;
  }

  landmarkById(id: string): Landmark | undefined {
    return this.landmarks.find((l) => l.id === id);
  }

  poiById(id: string): Poi | undefined {
    return this.pois.find((p) => p.id === id);
  }
}

let _layout: CityLayout | null = null;
export function getLayout(): CityLayout {
  if (!_layout) _layout = new CityLayout();
  return _layout;
}
