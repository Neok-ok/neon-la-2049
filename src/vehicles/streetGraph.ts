// One ground graph for the whole basin. Street lattices and freeway trenches are both edges.
// Nodes are not shared across lattices or routes, so a car cannot turn from a 7.2 m avenue
// onto a canyon lane or into a trench. Low spinners drive the street edges only.
// Registrations live in traffic-index.ts. Call registerStreetLattice instead of adding a graph.
import type { CityLayout } from '../world/layout';
import { bearingToDir } from '../world/geo';
import {
  NO_STREET_GRAPH, freewayRoutes, streetLattices, trafficRevision, type StreetLatticeSpec,
} from './trafficRegistry';
import './traffic-index';

export type TrafficKind = 'street' | 'canyon' | 'freeway';

export interface GraphNode {
  i: number;
  j: number;
  x: number;
  z: number;
}

export interface GraphEdge {
  index: number;
  a: number;
  b: number;
  /** 0 = along A (constant j). 1 = along B (constant i). Freeway edges use 0. */
  axis: 0 | 1;
  length: number;
  /** Unit vector from node a to node b. */
  fx: number;
  fz: number;
  /** Street: metres from the centreline to the driving line. Freeway: inner lane offset. */
  lane: number;
  kind: TrafficKind;
  /** District at the midpoint. Empty if the sample fell outside every polygon. */
  district: string;
  /** Added to terrain height. Negative on a sunken deck. */
  deck: number;
  /** Spawn weight. */
  density: number;
  route: string;
  /** Freeway lanes each way. Streets are 1. */
  laneCount: number;
  /** Extra metres between freeway lanes. */
  laneGap: number;
}

export interface GraphLink {
  edge: number;
  /** +1 leaves the node toward b, −1 leaves toward a. */
  dir: 1 | -1;
}

/** Metres per spatial bin. Queries visit the bins that touch the search square. */
export const GRAPH_BIN = 500;

export interface StreetGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Links out of each node index. */
  links: GraphLink[][];
  /** 1 when the node has both street axes and should show a signal. */
  signal: Uint8Array;
  /** Edge indices keyed by the midpoint bin. A basin lattice must not scan every edge each frame. */
  bins: Map<string, number[]>;
  /** Signal node indices, same key as `bins`. */
  signalBins: Map<string, number[]>;
}

export function graphBinKey(x: number, z: number): string {
  return `${Math.floor(x / GRAPH_BIN)},${Math.floor(z / GRAPH_BIN)}`;
}

export function visitBins(x: number, z: number, radius: number, fn: (key: string) => void): void {
  const i0 = Math.floor((x - radius) / GRAPH_BIN);
  const i1 = Math.floor((x + radius) / GRAPH_BIN);
  const j0 = Math.floor((z - radius) / GRAPH_BIN);
  const j1 = Math.floor((z + radius) / GRAPH_BIN);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) fn(`${i},${j}`);
  }
}

export interface GraphPose {
  x: number;
  z: number;
  fx: number;
  fz: number;
}

let cache: { layout: CityLayout; rev: number; graph: StreetGraph } | null = null;

function addLattice(
  layout: CityLayout,
  spec: StreetLatticeSpec,
  nodes: GraphNode[],
  idOf: Map<string, number>,
  edges: GraphEdge[],
): void {
  const [ax, az] = bearingToDir(spec.bearingDeg);
  const [bx, bz] = bearingToDir(spec.bearingDeg + 90);
  const districts = new Set(spec.districts);
  const at = (i: number, j: number) => {
    const s = i * spec.blockA;
    const t = j * spec.blockB;
    return { x: ax * s + bx * t, z: az * s + bz * t };
  };
  const nodeAt = (i: number, j: number): number => {
    const key = `${spec.prefix}${i},${j}`;
    const hit = idOf.get(key);
    if (hit !== undefined) return hit;
    const p = at(i, j);
    const id = nodes.length;
    nodes.push({ i, j, x: p.x, z: p.z });
    idOf.set(key, id);
    return id;
  };
  const keep = (x: number, z: number): string | null => {
    if (layout.isOcean(x, z) || layout.isReserved(x, z, 4)) return null;
    const d = layout.districtAt(x, z);
    if (!districts.has(d.id) || NO_STREET_GRAPH.has(d.id) || d.traffic <= 0) return null;
    return d.id;
  };
  const push = (
    ia: number, ib: number, a: { x: number; z: number }, b: { x: number; z: number },
    axis: 0 | 1, district: string,
  ) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    edges.push({
      index: edges.length, a: ia, b: ib, axis, length: len,
      fx: (b.x - a.x) / len, fz: (b.z - a.z) / len, lane: spec.lane,
      kind: spec.kind, district, deck: 0, density: layout.districtAt((a.x + b.x) / 2, (a.z + b.z) / 2).traffic,
      route: spec.id, laneCount: 1, laneGap: 0,
    });
  };
  for (let j = spec.j0; j <= spec.j1; j++) {
    for (let i = spec.i0; i < spec.i1; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const district = keep((a.x + b.x) / 2, (a.z + b.z) / 2);
      if (!district) continue;
      push(nodeAt(i, j), nodeAt(i + 1, j), a, b, 0, district);
    }
  }
  for (let i = spec.i0; i <= spec.i1; i++) {
    for (let j = spec.j0; j < spec.j1; j++) {
      const a = at(i, j);
      const b = at(i, j + 1);
      const district = keep((a.x + b.x) / 2, (a.z + b.z) / 2);
      if (!district) continue;
      push(nodeAt(i, j), nodeAt(i, j + 1), a, b, 1, district);
    }
  }
}

function freewayOk(layout: CityLayout, x: number, z: number): boolean {
  if (!layout.inBounds(x, z) || layout.isOcean(x, z)) return false;
  if (NO_STREET_GRAPH.has(layout.districtAt(x, z).id)) return false;
  if (layout.inLandmark(x, z, 2)) return false;
  return true;
}

function addFreeways(layout: CityLayout, nodes: GraphNode[], edges: GraphEdge[]): void {
  for (const spec of freewayRoutes()) {
    if (!spec.vehicles) continue;
    const line = layout.freeways.find((f) => f.id === spec.id);
    if (!line || line.pts.length < 2) continue;
    const step = 72;
    let prev = -1;
    const consider = (x: number, z: number) => {
      if (!freewayOk(layout, x, z)) { prev = -1; return; }
      const id = nodes.length;
      nodes.push({ i: id, j: 0, x, z });
      if (prev >= 0) {
        const a = nodes[prev]!;
        const mx = (a.x + x) / 2;
        const mz = (a.z + z) / 2;
        const len = Math.hypot(x - a.x, z - a.z);
        if (len > 8 && freewayOk(layout, mx, mz)) {
          const d = layout.districtAt(mx, mz);
          edges.push({
            index: edges.length, a: prev, b: id, axis: 0, length: len,
            fx: (x - a.x) / len, fz: (z - a.z) / len,
            lane: spec.inset, kind: 'freeway', district: d.id, deck: -spec.depth,
            density: spec.density, route: spec.id, laneCount: spec.lanes, laneGap: spec.spacing,
          });
        }
      }
      prev = id;
    };
    for (let i = 0; i < line.pts.length - 1; i++) {
      const ax = line.pts[i]![0], az = line.pts[i]![1];
      const bx = line.pts[i + 1]![0], bz = line.pts[i + 1]![1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1) continue;
      const n = Math.max(1, Math.ceil(len / step));
      for (let s = 0; s < n; s++) {
        const t = s / n;
        consider(ax + (bx - ax) * t, az + (bz - az) * t);
      }
    }
    const end = line.pts[line.pts.length - 1]!;
    consider(end[0], end[1]);
  }
}

/** Shared street and freeway graph. Cached on the layout and the registration revision. */
export function streetGraph(layout: CityLayout): StreetGraph {
  const rev = trafficRevision();
  if (cache?.layout === layout && cache.rev === rev) return cache.graph;
  const nodes: GraphNode[] = [];
  const idOf = new Map<string, number>();
  const edges: GraphEdge[] = [];
  for (const spec of streetLattices()) addLattice(layout, spec, nodes, idOf, edges);
  addFreeways(layout, nodes, edges);
  const links: GraphLink[][] = nodes.map(() => []);
  for (const e of edges) {
    links[e.a]!.push({ edge: e.index, dir: 1 });
    links[e.b]!.push({ edge: e.index, dir: -1 });
  }
  const signal = new Uint8Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    let a0 = false;
    let a1 = false;
    for (const link of links[i]!) {
      const e = edges[link.edge]!;
      if (e.kind === 'freeway') continue;
      if (e.axis === 0) a0 = true;
      else a1 = true;
    }
    if (a0 && a1) signal[i] = 1;
  }
  const bins = new Map<string, number[]>();
  for (let n = 0; n < edges.length; n++) {
    const e = edges[n]!;
    const a = nodes[e.a]!, b = nodes[e.b]!;
    const key = graphBinKey((a.x + b.x) / 2, (a.z + b.z) / 2);
    const list = bins.get(key);
    if (list) list.push(n);
    else bins.set(key, [n]);
  }
  const signalBins = new Map<string, number[]>();
  for (let n = 0; n < nodes.length; n++) {
    if (!signal[n]) continue;
    const node = nodes[n]!;
    const key = graphBinKey(node.x, node.z);
    const list = signalBins.get(key);
    if (list) list.push(n);
    else signalBins.set(key, [n]);
  }
  const graph = { nodes, edges, links, signal, bins, signalBins };
  cache = { layout, rev, graph };
  return graph;
}

/** Previous name. Spinners and older calls use this. It is the same graph. */
export const downtownGraph = streetGraph;

/** Longest street spacing is 205 m. A segment hit can sit this far from the midpoint bin. */
const EDGE_PAD = 130;

function kindOk(e: GraphEdge, kind?: 'street' | 'freeway'): boolean {
  if (kind === 'freeway') return e.kind === 'freeway';
  if (kind === 'street') return e.kind !== 'freeway';
  return true;
}

/** Edge indices whose midpoint is inside `radius`. */
export function edgeIdsNear(g: StreetGraph, x: number, z: number, radius: number, kind?: 'street' | 'freeway'): number[] {
  const r2 = radius * radius;
  const out: number[] = [];
  visitBins(x, z, radius, (key) => {
    const list = g.bins.get(key);
    if (!list) return;
    for (const idx of list) {
      const e = g.edges[idx]!;
      if (!kindOk(e, kind)) continue;
      const a = g.nodes[e.a]!, b = g.nodes[e.b]!;
      const dx = (a.x + b.x) / 2 - x;
      const dz = (a.z + b.z) / 2 - z;
      if (dx * dx + dz * dz < r2) out.push(idx);
    }
  });
  return out;
}

/** Closest point on an edge, if it falls inside `maxDist`. `kind` skips the other family. */
export function edgeNear(
  g: StreetGraph, x: number, z: number, maxDist: number, kind?: 'street' | 'freeway',
): { edge: number; t: number; dist: number } | null {
  let best: { edge: number; t: number; dist: number } | null = null;
  const max2 = maxDist * maxDist;
  visitBins(x, z, maxDist + EDGE_PAD, (key) => {
    const list = g.bins.get(key);
    if (!list) return;
    for (const idx of list) {
      const e = g.edges[idx]!;
      if (!kindOk(e, kind)) continue;
      const a = g.nodes[e.a]!, b = g.nodes[e.b]!;
      const dx = b.x - a.x, dz = b.z - a.z;
      const L2 = dx * dx + dz * dz || 1;
      let t = ((x - a.x) * dx + (z - a.z) * dz) / L2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + dx * t, pz = a.z + dz * t;
      const d2 = (px - x) ** 2 + (pz - z) ** 2;
      if (d2 > max2) continue;
      if (!best || d2 < best.dist * best.dist) best = { edge: e.index, t, dist: Math.sqrt(d2) };
    }
  });
  return best;
}

/** A random edge whose midpoint is inside `radius`, else the nearest. */
export function edgeAround(
  g: StreetGraph, x: number, z: number, radius: number, rng: { next(): number },
): { edge: number; t: number } | null {
  const ids = edgeIdsNear(g, x, z, radius);
  if (ids.length) {
    const i = ids[Math.floor(rng.next() * ids.length) % ids.length]!;
    return { edge: i, t: 0.12 + rng.next() * 0.76 };
  }
  const near = edgeNear(g, x, z, radius);
  return near ? { edge: near.edge, t: near.t } : null;
}

/**
 * Point and forward on an edge. `side` is metres to the right of travel
 * (right = (fz, −fx) for forward (fx, fz)).
 */
export function poseOn(g: StreetGraph, edge: number, t: number, dir: 1 | -1, side: number): GraphPose {
  const e = g.edges[edge]!;
  const a = g.nodes[e.a]!, b = g.nodes[e.b]!;
  const x = a.x + (b.x - a.x) * t;
  const z = a.z + (b.z - a.z) * t;
  const fx = e.fx * dir, fz = e.fz * dir;
  const rx = fz, rz = -fx;
  return { x: x + rx * side, z: z + rz * side, fx, fz };
}

function depart(g: StreetGraph, edge: number, dir: 1 | -1, salt: number): { edge: number; dir: 1 | -1 } | null {
  const e = g.edges[edge]!;
  const node = dir > 0 ? e.b : e.a;
  const ifx = e.fx * dir, ifz = e.fz * dir;
  const opts = g.links[node] ?? [];
  const cand: Array<{ edge: number; dir: 1 | -1; dot: number }> = [];
  for (const o of opts) {
    if (o.edge === edge) continue;
    const oe = g.edges[o.edge]!;
    const dot = oe.fx * o.dir * ifx + oe.fz * o.dir * ifz;
    cand.push({ edge: o.edge, dir: o.dir, dot });
  }
  if (!cand.length) return null;
  const straight = cand.filter((c) => c.dot > 0.45);
  const pool = straight.length ? straight : cand;
  return pool[Math.abs(salt + node * 17 + edge * 3) % pool.length]!;
}

/** Drive `dist` metres. Dead ends reverse. `salt` keeps the turn choice stable for one vehicle. */
export function advanceGraph(
  g: StreetGraph, edge: number, t: number, dir: 1 | -1, dist: number, salt: number,
): { edge: number; t: number; dir: 1 | -1 } {
  let remain = Math.max(0, dist);
  let guard = 0;
  while (remain > 0.01 && guard++ < 6) {
    const e = g.edges[edge];
    if (!e || e.length < 1) break;
    const room = (dir > 0 ? 1 - t : t) * e.length;
    if (remain <= room + 1e-3) {
      t += dir * (remain / e.length);
      t = Math.max(0, Math.min(1, t));
      break;
    }
    remain -= room;
    const next = depart(g, edge, dir, salt);
    if (!next) {
      dir = (dir > 0 ? -1 : 1);
      t = dir > 0 ? 0.02 : 0.98;
      continue;
    }
    edge = next.edge;
    dir = next.dir;
    t = dir > 0 ? 0 : 1;
  }
  return { edge, t, dir };
}
