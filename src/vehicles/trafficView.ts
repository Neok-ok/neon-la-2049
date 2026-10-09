// Screenshot cameras for Stage X2 (`__nla.trafficView`).
import type { CityLayout } from '../world/layout';
import { geoToLocal } from '../world/geo';
import { broadwayCamera } from '../districts/historic-core/view';
import { poseOn, streetGraph, type GraphEdge, type StreetGraph } from './streetGraph';

export type TrafficView = 'intersection' | 'freeway' | 'canyon' | 'aerial-night' | 'rain';

export interface TrafficPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  mode: 'walk' | 'fly';
  cockpit?: boolean;
  feet?: { x: number; y: number; z: number };
}

function headingOf(fx: number, fz: number): number {
  return Math.atan2(fx, -fz);
}

function signalIn(layout: CityLayout, g: StreetGraph, lat: number, lon: number, district: string): number {
  const [tx, tz] = geoToLocal(lat, lon);
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < g.nodes.length; i++) {
    if (!g.signal[i]) continue;
    const n = g.nodes[i]!;
    if (layout.districtAt(n.x, n.z).id !== district) continue;
    const d = Math.hypot(n.x - tx, n.z - tz);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function approach(g: StreetGraph, node: number): { edge: GraphEdge; inbound: 1 | -1 } | null {
  let best: GraphEdge | null = null;
  let inbound: 1 | -1 = 1;
  let len = 0;
  for (const link of g.links[node] ?? []) {
    const e = g.edges[link.edge];
    if (!e || e.kind === 'freeway') continue;
    if (e.length <= len) continue;
    best = e;
    len = e.length;
    inbound = link.dir === 1 ? -1 : 1;
  }
  return best ? { edge: best, inbound } : null;
}

/** Sidewalk on the longest approach into a DTLA signal, looking at the crossing. */
function streetShot(layout: CityLayout, back: number, pitch: number): TrafficPose | null {
  const g = streetGraph(layout);
  const node = signalIn(layout, g, 34.042, -118.252, 'dtla');
  if (node < 0) return null;
  const hit = approach(g, node);
  if (!hit) return null;
  const e = hit.edge;
  const dist = Math.min(back, Math.max(12, e.length * 0.42));
  const t = hit.inbound > 0 ? 1 - dist / e.length : dist / e.length;
  const pose = poseOn(g, e.index, t, hit.inbound, Math.min(4.6, e.lane * 0.7));
  const ground = layout.heightAt(pose.x, pose.z);
  return {
    x: pose.x,
    y: ground,
    z: pose.z,
    heading: headingOf(pose.fx, pose.fz),
    pitch,
    mode: 'walk',
    feet: { x: pose.x, y: ground, z: pose.z },
  };
}

/** Cockpit above the 110 centreline, pitched down into the trench. */
function freewayShot(layout: CityLayout): TrafficPose | null {
  const g = streetGraph(layout);
  const [tx, tz] = geoToLocal(34.032, -118.274);
  let best: GraphEdge | null = null;
  let bd = Infinity;
  for (const e of g.edges) {
    if (e.kind !== 'freeway' || e.route !== 'I-110') continue;
    const a = g.nodes[e.a]!;
    const b = g.nodes[e.b]!;
    const d = Math.hypot((a.x + b.x) / 2 - tx, (a.z + b.z) / 2 - tz);
    if (d < bd) { bd = d; best = e; }
  }
  if (!best) return null;
  const pose = poseOn(g, best.index, 0.45, 1, 0);
  const grade = layout.heightAt(pose.x, pose.z);
  return {
    x: pose.x,
    y: grade + 28 - 1.22,
    z: pose.z,
    heading: headingOf(pose.fx, pose.fz),
    pitch: -0.72,
    mode: 'fly',
    cockpit: true,
  };
}

function aerial(layout: CityLayout): TrafficPose {
  const [x, z] = geoToLocal(34.036, -118.268);
  const [tx, tz] = geoToLocal(34.020, -118.285);
  return {
    x,
    y: 1520 - 1.22,
    z,
    heading: headingOf(tx - x, tz - z),
    pitch: -0.62,
    mode: 'fly',
    cockpit: true,
  };
}

export function trafficCamera(layout: CityLayout, kind: TrafficView): TrafficPose | null {
  if (kind === 'canyon') {
    const p = broadwayCamera(layout, 'street');
    return p ? { ...p } : null;
  }
  if (kind === 'intersection') return streetShot(layout, 26, 0.07);
  if (kind === 'rain') return streetShot(layout, 38, 0.03);
  if (kind === 'freeway') return freewayShot(layout);
  if (kind === 'aerial-night') return aerial(layout);
  return null;
}
