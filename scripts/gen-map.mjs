// Renders docs/map.svg from src/data/city-layout.json (the single source of truth for the city plan).
//   npm run map
import { readFileSync, writeFileSync } from 'node:fs';

const L = JSON.parse(readFileSync(new URL('../src/data/city-layout.json', import.meta.url), 'utf8'));
const { lat: LAT0, lon: LON0 } = L.meta.origin;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KZ = 110574;
const toLocal = ([lat, lon]) => [(lon - LON0) * KX, (LAT0 - lat) * KZ];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;');

function render({ bounds: b, mPerPx: M_PER_PX, file, title, gridKm }) {
const [minX, minZ] = toLocal([b.north, b.west]);
const [maxX, maxZ] = toLocal([b.south, b.east]);
const PAD = 60;
const W = Math.ceil((maxX - minX) / M_PER_PX) + PAD * 2;
const H = Math.ceil((maxZ - minZ) / M_PER_PX) + PAD * 2 + 40;
const px = ([x, z]) => [((x - minX) / M_PER_PX + PAD).toFixed(1), ((z - minZ) / M_PER_PX + PAD + 40).toFixed(1)];
const pt = (ll) => px(toLocal(ll));
const path = (pts, close = false) => 'M' + pts.map((p) => pt(p).join(',')).join(' L') + (close ? ' Z' : '');
const COLORS = {
  'megablock-downtown': '#4a5a78', 'megatower-core': '#6a7fb0', civic: '#8c8c9c', 'street-market': '#d0457a',
  'neon-canyon': '#b04ad0', 'industrial-dense': '#7a5a3a', industrial: '#6a4a2a', 'megablock-residential': '#4f6a5a',
  'megablock-market': '#c06a3a', 'sprawl-dense': '#4a4a4a', entertainment: '#a03a8a', 'coastal-grey': '#6e7a80',
  spaceport: '#3a6a8a', port: '#3a5a6a', 'basin-sprawl': '#2c2c2c',
};

const out = [];
const G = gridKm * 1000;
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">`);
out.push(`<rect width="${W}" height="${H}" fill="#141416"/>`);
out.push(`<text x="${PAD}" y="34" fill="#eee" font-size="20" font-weight="bold">${esc(title)}</text>`);
out.push(`<text x="${PAD}" y="54" fill="#999" font-size="11">1 px = ${M_PER_PX} m · grid = ${gridKm} km in engine metres (origin ${LAT0}, ${LON0}; +X east, +Z south) · unlabelled dark land = basin sprawl</text>`);

// grid
for (let x = Math.ceil(minX / G) * G; x <= maxX; x += G) {
  const [sx] = px([x, 0]);
  out.push(`<line x1="${sx}" y1="${PAD + 40}" x2="${sx}" y2="${H - PAD}" stroke="#222" stroke-width="1"/>`);
  out.push(`<text x="${sx}" y="${H - PAD + 14}" fill="#666" font-size="10" text-anchor="middle">${x / 1000} km</text>`);
}
for (let z = Math.ceil(minZ / G) * G; z <= maxZ; z += G) {
  const [, sz] = px([0, z]);
  out.push(`<line x1="${PAD}" y1="${sz}" x2="${W - PAD}" y2="${sz}" stroke="#222" stroke-width="1"/>`);
  out.push(`<text x="${PAD - 6}" y="${sz}" fill="#666" font-size="10" text-anchor="end">${z / 1000}</text>`);
}

// hills
for (const h of L.hills) {
  const [cx, cz] = pt([h.lat, h.lon]);
  out.push(`<ellipse cx="${cx}" cy="${cz}" rx="${h.rx / M_PER_PX}" ry="${h.rz / M_PER_PX}" transform="rotate(${-h.rotDeg} ${cx} ${cz})" fill="#2a2a1e" stroke="#3a3a28"/>`);
}
// districts (low priority first so higher ones draw on top)
for (const d of [...L.districts].sort((a, b2) => a.priority - b2.priority)) {
  out.push(`<path d="${path(d.polygon, true)}" fill="${COLORS[d.archetype] ?? '#555'}" fill-opacity="0.55" stroke="${COLORS[d.archetype] ?? '#888'}" stroke-width="1.5"/>`);
}
// ocean
out.push(`<path d="${path([...L.coastline, ...L.oceanClosure], true)}" fill="#0c1a26" stroke="#2a4a66" stroke-width="1"/>`);
// river + freeways
for (const r of L.rivers) out.push(`<path d="${path(r.points)}" fill="none" stroke="#3a6a8a" stroke-width="${Math.max(2, r.width / M_PER_PX)}" stroke-linejoin="round"/>`);
for (const f of L.freeways) {
  out.push(`<path d="${path(f.points)}" fill="none" stroke="#e0a040" stroke-opacity="0.75" stroke-width="${Math.max(1.5, f.width / M_PER_PX)}" stroke-linejoin="round"/>`);
  const [lx, lz] = pt(f.points[Math.floor(f.points.length / 2)]);
  out.push(`<text x="${lx}" y="${lz}" fill="#e0a040" font-size="10" dx="4">${esc(f.id)}</text>`);
}
// sea walls
for (const w of L.seaWalls) {
  out.push(`<path d="${path(w.points)}" fill="none" stroke="#c8d0d8" stroke-width="${Math.max(3, w.baseWidth / M_PER_PX + 1)}" stroke-linejoin="round"/>`);
  const [lx, lz] = pt(w.points[Math.floor(w.points.length / 2)]);
  out.push(`<text x="${lx}" y="${lz}" fill="#c8d0d8" font-size="11" dx="-8" text-anchor="end">${esc(w.name)} (${w.crestHeight} m)</text>`);
}
// district labels
for (const d of L.districts) {
  const n = d.polygon.length;
  const c = d.polygon.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n], [0, 0]);
  const [lx, lz] = pt(c);
  out.push(`<text x="${lx}" y="${lz}" fill="#fff" fill-opacity="0.85" font-size="10" text-anchor="middle">${esc(d.name)} · S${d.stage}</text>`);
}
// landmarks (footprint to scale + label)
for (const l of L.landmarks) {
  const [cx, cz] = pt([l.lat, l.lon]);
  const w = l.baseWidth / M_PER_PX, dd = (l.baseDepth ?? l.baseWidth) / M_PER_PX;
  out.push(`<rect x="${cx - w / 2}" y="${cz - dd / 2}" width="${w}" height="${dd}" transform="rotate(${l.bearingDeg} ${cx} ${cz})" fill="none" stroke="#ff9a2e" stroke-width="1.2"/>`);
  out.push(`<circle cx="${cx}" cy="${cz}" r="2.5" fill="#ff9a2e"/>`);
  const zoomed = M_PER_PX < 20;
  if (zoomed || !l.id.startsWith('megatower-') || l.id === 'megatower-1') {
    const label = !zoomed && l.id === 'megatower-1' ? 'Financial District megatowers (520–1,020 m)' : `${l.name} (${l.height} m)`;
    out.push(`<text x="${cx}" y="${cz}" dx="6" dy="-4" fill="#ffcf8a" font-size="11">${esc(label)}</text>`);
  }
}
// POIs
for (const p of L.pois) {
  const [cx, cz] = pt([p.lat, p.lon]);
  out.push(`<circle cx="${cx}" cy="${cz}" r="2" fill="#29d8ff"/>`);
  if (M_PER_PX < 20) out.push(`<text x="${cx}" y="${cz}" dx="5" dy="12" fill="#8fe8ff" font-size="10">${esc(p.name)}</text>`);
}
// legend
const lg = [['#ff9a2e', 'landmark footprint (to scale)'], ['#29d8ff', 'point of interest (interiors / set pieces)'], ['#e0a040', 'freeway trench (open corridor)'], ['#c8d0d8', 'sea wall'], ['#3a6a8a', 'LA River channel'], ['#2a2a1e', 'hills (gaussian height bumps)']];
lg.forEach(([c, t], i) => {
  const y = H - PAD - 16 - (lg.length - i) * 16;
  out.push(`<rect x="${W - PAD - 250}" y="${y - 9}" width="12" height="12" fill="${c}"/><text x="${W - PAD - 232}" y="${y + 1}" fill="#ccc" font-size="11">${esc(t)}</text>`);
});
// scale bar
const bar = gridKm * 2000;
out.push(`<line x1="${PAD}" y1="${H - 24}" x2="${PAD + bar / M_PER_PX}" y2="${H - 24}" stroke="#ccc" stroke-width="3"/><text x="${PAD}" y="${H - 8}" fill="#ccc" font-size="11">${bar / 1000} km</text>`);
out.push(`<text x="${W - PAD}" y="${PAD + 30}" fill="#ccc" font-size="14" text-anchor="end">N ↑</text>`);
out.push('</svg>');

writeFileSync(new URL(`../docs/${file}`, import.meta.url), out.join('\n'));
console.log(`docs/${file} written (${W}x${H})`);
}

render({ bounds: L.meta.worldBounds, mPerPx: 50, file: 'map.svg', title: 'Neon LA 2049 — city plan (generated from src/data/city-layout.json)', gridKm: 5 });
render({
  bounds: { north: 34.068, south: 34.036, west: -118.272, east: -118.226 },
  mPerPx: 5,
  file: 'map-downtown.svg',
  title: 'Neon LA 2049 — downtown core inset',
  gridKm: 0.5,
});
