// Scale and memory numbers for the road layer. No three.js. Run from scripts/road-audit.mjs.
import type { Tier } from '../core/quality';
import { TIERS } from '../core/quality';
import { getLayout } from '../world/layout';
import { freewayRoutes } from '../vehicles/trafficRegistry';
import { streetGraph, type GraphEdge } from '../vehicles/streetGraph';
import { buildRoadChunk } from './buildChunk';
import { memoryRow } from './memory';
import { carClearance, drivingInLane, streetProfile } from './profile';

function streetOf(edge: GraphEdge, layout: ReturnType<typeof getLayout>): number {
  const g = streetGraph(layout);
  const a = g.nodes[edge.a]!;
  const b = g.nodes[edge.b]!;
  return layout.districtAt((a.x + b.x) * 0.5, (a.z + b.z) * 0.5).grid.street;
}

export function roadReportText(): string {
  const layout = getLayout();
  const g = streetGraph(layout);
  const lines: string[] = [];
  const seen = new Set<string>();
  lines.push('district\tstreet\tdriving\tsidewalk\tcarriage\tclearance\tinLane\tlaneW\tkind');
  for (const e of g.edges) {
    if (e.kind === 'freeway' || seen.has(e.district)) continue;
    seen.add(e.district);
    const street = streetOf(e, layout);
    const p = streetProfile(street, e.lane, e.kind === 'canyon' ? 'canyon' : 'street');
    lines.push([
      e.district, street.toFixed(1), e.lane.toFixed(2), p.sidewalk.toFixed(2),
      (p.carriageHalf * 2).toFixed(2), carClearance(p).toFixed(2),
      drivingInLane(p) ? 'yes' : 'NO', p.laneW.toFixed(2), e.kind,
    ].join('\t'));
  }
  const missing = layout.districts.map((d) => d.id).filter((id) => !seen.has(id));
  lines.push(`no-carriageway\t${missing.join(',')}`);
  for (const spec of freewayRoutes()) {
    lines.push(`freeway\t${spec.id}\tspacing\t${spec.spacing}\tlanes\t${spec.lanes}\ttrench\t${spec.trench}`);
  }
  const spots: Array<[string, number, number]> = [];
  const sample = g.edges.find((e) => e.district === 'dtla' && e.kind !== 'freeway') ?? g.edges[0];
  if (sample) {
    const a = g.nodes[sample.a]!;
    spots.push(['dtla', a.x, a.z]);
  }
  const trench = g.edges.find((e) => e.kind === 'freeway');
  if (trench) {
    const a = g.nodes[trench.a]!;
    spots.push(['trench', a.x, a.z]);
  }
  const grade = layout.freeways.find((f) => f.id === 'I-405');
  if (grade && grade.pts.length) spots.push(['grade', grade.pts[Math.floor(grade.pts.length / 2)]![0], grade.pts[Math.floor(grade.pts.length / 2)]![1]]);
  const coast = layout.districts.find((d) => d.id === 'coastal-strip');
  if (coast) spots.push(['coast', (coast.bbox[0] + coast.bbox[2]) / 2, (coast.bbox[1] + coast.bbox[3]) / 2]);
  for (const [name, x, z] of spots) {
    const x0 = Math.floor(x / 500) * 500;
    const z0 = Math.floor(z / 500) * 500;
    for (const tier of TIERS) {
      const chunk = buildRoadChunk(layout, x0, z0, 500, tier as Tier);
      if (!chunk) {
        lines.push(`chunk\t${name}\t${tier}\tempty`);
        continue;
      }
      const row = memoryRow(tier as Tier, chunk, true, 111704);
      lines.push([
        'chunk', name, tier, `draws ${row.drawsPerChunk}`, `tris ${row.trisPerChunk}`,
        `unique ${row.uniqueBytesPerChunk}`, `sharedKTX ${row.sharedTextureBytes}`,
        `loaded ${row.loadedChunks}`, `resident ${row.residentBytes}`,
        `stamps ${chunk.stamps.length}`, `signs ${chunk.signs.length}`, `puddles ${chunk.puddles.length}`,
      ].join('\t'));
    }
  }
  return lines.join('\n');
}

export interface RoadPose {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** Street-level and top-down cameras, one pair per district, plus a freeway and the sea wall. */
export function roadPoses(): RoadPose[] {
  const layout = getLayout();
  const g = streetGraph(layout);
  const out: RoadPose[] = [];
  const deg = 180 / Math.PI;
  const districtById = (id: string) => layout.districts.find((item) => item.id === id)
    ?? (layout.defaultDistrict.id === id ? layout.defaultDistrict : undefined);
  const byDistrict = new Map<string, GraphEdge>();
  for (const e of g.edges) {
    if (e.kind === 'freeway') continue;
    const d = districtById(e.district);
    if (!d) continue;
    const a = g.nodes[e.a]!;
    const b = g.nodes[e.b]!;
    const mx = (a.x + b.x) * 0.5;
    const mz = (a.z + b.z) * 0.5;
    if (layout.inLandmark(mx, mz, 3)) continue;
    const cx = (d.bbox[0] + d.bbox[2]) * 0.5;
    const cz = (d.bbox[1] + d.bbox[3]) * 0.5;
    const dist = Math.hypot(mx - cx, mz - cz);
    const prev = byDistrict.get(e.district);
    if (!prev || dist < prev.length) byDistrict.set(e.district, { ...e, length: dist });
  }
  for (const e of g.edges) {
    if (e.kind === 'freeway' || byDistrict.has(e.district)) continue;
    const d = districtById(e.district);
    if (!d) continue;
    const a = g.nodes[e.a]!;
    const b = g.nodes[e.b]!;
    const mx = (a.x + b.x) * 0.5;
    const mz = (a.z + b.z) * 0.5;
    const cx = (d.bbox[0] + d.bbox[2]) * 0.5;
    const cz = (d.bbox[1] + d.bbox[3]) * 0.5;
    const dist = Math.hypot(mx - cx, mz - cz);
    const prev = byDistrict.get(e.district);
    if (!prev || dist < prev.length) byDistrict.set(e.district, { ...e, length: dist });
  }
  for (const e of byDistrict.values()) {
    const a = g.nodes[e.a]!;
    const b = g.nodes[e.b]!;
    const x = (a.x + b.x) * 0.5 + e.fz * e.lane;
    const z = (a.z + b.z) * 0.5 - e.fx * e.lane;
    const y = layout.heightAt(x, z) + 2.4;
    const yaw = Math.atan2(e.fx, -e.fz) * deg;
    out.push({ id: e.district, x, y, z, yaw, pitch: -3 });
    out.push({ id: `${e.district}-top`, x, y: y + 180, z, yaw, pitch: -89 });
  }
  for (const id of ['little-tokyo-market', 'coastal-strip', 'k-megablock', 'wallace-vernon']) {
    const d = layout.districts.find((item) => item.id === id);
    if (!d) continue;
    const x = (d.bbox[0] + d.bbox[2]) / 2;
    const z = (d.bbox[1] + d.bbox[3]) / 2;
    const y = layout.heightAt(x, z) + 1.7;
    out.push({ id, x, y, z, yaw: 20, pitch: -4 });
    out.push({ id: `${id}-top`, x, y: y + 160, z, yaw: 20, pitch: -80 });
  }
  const trench = g.edges.find((e) => e.route === 'US-101');
  if (trench) {
    const a = g.nodes[trench.a]!;
    const b = g.nodes[trench.b]!;
    const x = (a.x + b.x) * 0.5 + trench.fz * trench.lane;
    const z = (a.z + b.z) * 0.5 - trench.fx * trench.lane;
    const y = layout.heightAt(x, z) + trench.deck + 1.7;
    const yaw = Math.atan2(trench.fx, -trench.fz) * deg;
    out.push({ id: 'us-101', x, y, z, yaw, pitch: -3 });
  }
  const wall = layout.seaWalls[0];
  if (wall && wall.pts.length > 2) {
    const p = wall.pts[Math.floor(wall.pts.length / 3)]!;
    out.push({ id: 'sea-wall', x: p[0], y: layout.heightAt(p[0], p[1]) + 8, z: p[1], yaw: 90, pitch: -12 });
  }
  const coastIds = new Set(['harbor', 'long-beach', 'lax-spaceport', 'south-bay-refineries']);
  const samples: Array<[number, number]> = [];
  for (const w of layout.seaWalls) {
    for (let i = 0; i < w.pts.length; i += 6) samples.push(w.pts[i]!);
  }
  let seaEdge: GraphEdge | null = null;
  let seaD = Infinity;
  let seaPt: [number, number] | null = null;
  for (const e of g.edges) {
    if (e.kind === 'freeway' || !coastIds.has(e.district)) continue;
    const a = g.nodes[e.a]!;
    const b = g.nodes[e.b]!;
    const mx = (a.x + b.x) * 0.5;
    const mz = (a.z + b.z) * 0.5;
    for (const p of samples) {
      const d = Math.hypot(mx - p[0], mz - p[1]);
      if (d < 40 || d > 220 || d >= seaD) continue;
      seaD = d;
      seaEdge = e;
      seaPt = p;
    }
  }
  if (seaEdge && seaPt) {
    const a = g.nodes[seaEdge.a]!;
    const b = g.nodes[seaEdge.b]!;
    const x = (a.x + b.x) * 0.5 + seaEdge.fz * seaEdge.lane;
    const z = (a.z + b.z) * 0.5 - seaEdge.fx * seaEdge.lane;
    const yaw = Math.atan2(seaPt[0] - x, -(seaPt[1] - z)) * deg;
    out.push({ id: 'sea-approach', x, y: layout.heightAt(x, z) + 3.2, z, yaw, pitch: -6 });
  }
  return out;
}
