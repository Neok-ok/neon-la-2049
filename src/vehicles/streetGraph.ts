// Pure module. Lane graph for the shared downtown grid (DTLA, the Financial District, Civic Center)
// plus the historic-core lattice (110 × 70 m, 18 m streets). The two lattices share one graph and
// do not share nodes, so a vehicle cannot turn from a 7.2 m avenue onto a 3.15 m canyon lane.
// Nodes sit on intersections. An edge is kept when its midpoint is in that lattice's district set,
// on land, and clear of a landmark reserve or a freeway / river corridor.
// Low spinners and ground cars both drive this. Sky lanes at 175–260 m are a separate polyline set.
import type { CityLayout } from '../world/layout';
import { DOWNTOWN_BLOCK_A, DOWNTOWN_BLOCK_B, gridAxes } from '../districts/_shared/megablock/grid';
import { BLOCK_A, BLOCK_B, LANE } from '../districts/historic-core/spec';

const DISTRICTS = new Set(['dtla', 'financial-megatowers', 'civic-center']);
const CANYON = new Set(['historic-core']);

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
  /** 0 = along A (constant j). 1 = along B (constant i). */
  axis: 0 | 1;
  length: number;
  /** Unit vector from node a to node b. */
  fx: number;
  fz: number;
  /** Metres from the centreline to the driving line. Avenues 7.2; the historic canyon 3.15. */
  lane: number;
}

export interface GraphLink {
  edge: number;
  /** +1 leaves the node toward b, −1 leaves toward a. */
  dir: 1 | -1;
}

export interface StreetGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Links out of each node index. */
  links: GraphLink[][];
}

export interface GraphPose {
  x: number;
  z: number;
  fx: number;
  fz: number;
}

let cache: { layout: CityLayout; graph: StreetGraph } | null = null;

function addLattice(
  layout: CityLayout,
  nodes: GraphNode[],
  idOf: Map<string, number>,
  edges: GraphEdge[],
  ax: number, az: number, bx: number, bz: number,
  blockA: number, blockB: number,
  prefix: string,
  i0: number, i1: number, j0: number, j1: number,
  lane: number,
  districts: Set<string>,
): void {
  const at = (i: number, j: number) => {
    const s = i * blockA;
    const t = j * blockB;
    return { x: ax * s + bx * t, z: az * s + bz * t };
  };
  const nodeAt = (i: number, j: number): number => {
    const key = `${prefix}${i},${j}`;
    const hit = idOf.get(key);
    if (hit !== undefined) return hit;
    const p = at(i, j);
    const id = nodes.length;
    nodes.push({ i, j, x: p.x, z: p.z });
    idOf.set(key, id);
    return id;
  };
  const keep = (x: number, z: number) => {
    if (layout.isOcean(x, z) || layout.isReserved(x, z, 4)) return false;
    return districts.has(layout.districtAt(x, z).id);
  };
  const push = (ia: number, ib: number, a: { x: number; z: number }, b: { x: number; z: number }, axis: 0 | 1) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    edges.push({
      index: edges.length, a: ia, b: ib, axis, length: len,
      fx: (b.x - a.x) / len, fz: (b.z - a.z) / len, lane,
    });
  };
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i < i1; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      if (!keep((a.x + b.x) / 2, (a.z + b.z) / 2)) continue;
      push(nodeAt(i, j), nodeAt(i + 1, j), a, b, 0);
    }
  }
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j < j1; j++) {
      const a = at(i, j);
      const b = at(i, j + 1);
      if (!keep((a.x + b.x) / 2, (a.z + b.z) / 2)) continue;
      push(nodeAt(i, j), nodeAt(i, j + 1), a, b, 1);
    }
  }
}

/** The downtown street graph, plus the historic canyon lattice. Cached on the layout instance. */
export function downtownGraph(layout: CityLayout): StreetGraph {
  if (cache?.layout === layout) return cache.graph;
  const { ax, az, bx, bz } = gridAxes();
  const nodes: GraphNode[] = [];
  const idOf = new Map<string, number>();
  const edges: GraphEdge[] = [];
  addLattice(layout, nodes, idOf, edges, ax, az, bx, bz, DOWNTOWN_BLOCK_A, DOWNTOWN_BLOCK_B, 'd', -42, 42, -42, 42, 7.2, DISTRICTS);
  addLattice(layout, nodes, idOf, edges, ax, az, bx, bz, BLOCK_A, BLOCK_B, 'h', -28, 8, -12, 6, LANE, CANYON);
  const links: GraphLink[][] = nodes.map(() => []);
  for (const e of edges) {
    links[e.a]!.push({ edge: e.index, dir: 1 });
    links[e.b]!.push({ edge: e.index, dir: -1 });
  }
  const graph = { nodes, edges, links };
  cache = { layout, graph };
  return graph;
}

/** Closest point on an edge, if it falls inside `maxDist`. */
export function edgeNear(g: StreetGraph, x: number, z: number, maxDist: number): { edge: number; t: number; dist: number } | null {
  let best: { edge: number; t: number; dist: number } | null = null;
  const max2 = maxDist * maxDist;
  for (const e of g.edges) {
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
  return best;
}

/** A random edge whose midpoint is inside `radius`, else the nearest. */
export function edgeAround(
  g: StreetGraph, x: number, z: number, radius: number, rng: { next(): number },
): { edge: number; t: number } | null {
  const n = g.edges.length;
  if (!n) return null;
  let best = -1;
  let bd = radius;
  for (let k = 0; k < 18; k++) {
    const i = Math.floor(rng.next() * n) % n;
    const e = g.edges[i]!;
    const a = g.nodes[e.a]!, b = g.nodes[e.b]!;
    const d = Math.hypot((a.x + b.x) / 2 - x, (a.z + b.z) / 2 - z);
    if (d < bd) { bd = d; best = i; }
  }
  if (best >= 0) return { edge: best, t: 0.12 + rng.next() * 0.76 };
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
