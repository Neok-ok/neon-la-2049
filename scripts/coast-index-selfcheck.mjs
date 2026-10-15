// Sea-wall index matches a linear scan. Vite loads the layout JSON.
import { createServer } from 'vite';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

const profile = await server.ssrLoadModule('/src/districts/coastal-strip/profile.ts');
const layoutMod = await server.ssrLoadModule('/src/world/layout.ts');
const streets = await server.ssrLoadModule('/src/vehicles/streetGraph.ts');
const layout = layoutMod.getLayout();
const pieces = profile.wallPieces(layout);
assert(pieces.length > 10, `expected sea-wall pieces, got ${pieces.length}`);

function linearHit(x, z) {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < pieces.length; i++) {
    const p = profile.projectPiece(pieces[i], x, z);
    if (p.dist < bestDist || (p.dist === bestDist && i < bestIdx)) {
      bestIdx = i;
      bestDist = p.dist;
    }
  }
  const piece = pieces[bestIdx];
  const p = profile.projectPiece(piece, x, z);
  return { piece, dist: p.dist, across: p.across };
}

function pastLinear(x, z) {
  const hit = linearHit(x, z);
  const face = -hit.piece.profile.crest / 2 - 6;
  if (hit.across <= face) return false;
  if (hit.dist > 1400) return false;
  return true;
}

function seawardLinear(x, z) {
  const hit = linearHit(x, z);
  if (hit.dist > 1400) return false;
  return hit.across > hit.piece.profile.crest / 2 + 2;
}

const points = [];
let minX = Infinity;
let maxX = -Infinity;
let minZ = Infinity;
let maxZ = -Infinity;
for (const piece of pieces) {
  minX = Math.min(minX, piece.ax, piece.bx);
  maxX = Math.max(maxX, piece.ax, piece.bx);
  minZ = Math.min(minZ, piece.az, piece.bz);
  maxZ = Math.max(maxZ, piece.az, piece.bz);
  points.push([(piece.ax + piece.bx) / 2, (piece.az + piece.bz) / 2]);
  points.push([piece.frame.x + piece.frame.nx * 40, piece.frame.z + piece.frame.nz * 40]);
  points.push([piece.frame.x - piece.frame.nx * 80, piece.frame.z - piece.frame.nz * 80]);
  points.push([piece.ax, piece.az]);
}
for (let x = minX - 2000; x <= maxX + 2000; x += 900) {
  for (let z = minZ - 2000; z <= maxZ + 2000; z += 900) points.push([x, z]);
}
points.push([0, 0], [12000, -4000], [-8000, 9000]);

let mismatches = 0;
for (const [x, z] of points) {
  const indexed = profile.nearestWall(layout, x, z);
  const linear = linearHit(x, z);
  const samePiece = indexed.piece.key === linear.piece.key;
  const sameDist = Math.abs(indexed.dist - linear.dist) < 1e-4;
  const sameAcross = Math.abs(indexed.across - linear.across) < 1e-4;
  const samePast = profile.pastSeaWall(layout, x, z) === pastLinear(x, z);
  const sameSea = profile.seawardOfWall(layout, x, z) === seawardLinear(x, z);
  if (!samePiece || !sameDist || !sameAcross || !samePast || !sameSea) {
    mismatches++;
    if (mismatches <= 8) {
      console.error(JSON.stringify({
        x, z, indexed: indexed.piece.key, linear: linear.piece.key,
        dI: indexed.dist, dL: linear.dist, aI: indexed.across, aL: linear.across,
        samePast, sameSea,
      }));
    }
  }
}
assert(mismatches === 0, `${mismatches} sea-wall mismatches out of ${points.length}`);

const t0 = performance.now();
streets.streetGraph(layout);
const graphMs = performance.now() - t0;
const again = performance.now();
streets.streetGraph(layout);
const cachedMs = performance.now() - again;
console.log(JSON.stringify({
  pieces: pieces.length,
  points: points.length,
  graphMs: Math.round(graphMs),
  cachedMs: Math.round(cachedMs * 100) / 100,
}));
assert(graphMs < 1500, `sync street graph ${graphMs.toFixed(0)} ms is still a long boot task`);
await server.close();
console.log('coast index selfcheck ok');
