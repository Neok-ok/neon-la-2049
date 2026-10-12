// Join shard reports from the visual workflow into one table.
//   node tests/visual/merge-reports.mjs <shards-dir> <output-dir>
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EXPECT_SIM_TIME,
  MAX_DIFF_RATIO,
  PIXEL_THRESHOLD,
  QUALITIES,
  SEED,
  VIEWS,
  shots,
} from './shots.mjs';

const shardsDir = process.argv[2];
const outDir = process.argv[3];
if (!shardsDir || !outDir) {
  console.error('usage: node tests/visual/merge-reports.mjs <shards-dir> <output-dir>');
  process.exit(2);
}

function walk(dir, hit) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, hit);
    else if (name === 'report.json') hit.push(path);
  }
  return hit;
}

function pct(ratio) {
  return `${(ratio * 100).toFixed(3)}%`;
}

const reports = walk(shardsDir, []);
const rows = [];
const seen = new Set();
let slowest = 0;
for (const path of reports) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const mdPath = join(path, '..', 'report.md');
  try {
    const md = readFileSync(mdPath, 'utf8');
    const match = /Captured in (\d+)s/.exec(md);
    if (match) slowest = Math.max(slowest, Number(match[1]));
  } catch { /* report.md is optional */ }
  for (const row of data.rows ?? []) {
    const key = `${row.id}|${row.view}|${row.quality}`;
    if (seen.has(key)) throw new Error(`duplicate row ${key}`);
    seen.add(key);
    rows.push(row);
  }
  const diffDir = join(path, '..', 'diff');
  try {
    if (statSync(diffDir).isDirectory()) {
      const dest = join(outDir, 'diff');
      mkdirSync(dest, { recursive: true });
      for (const name of readdirSync(diffDir)) {
        if (name.endsWith('.png')) copyFileSync(join(diffDir, name), join(dest, name));
      }
    }
  } catch { /* no diffs */ }
}

const viewOrder = { desktop: 0, phone: 1 };
const qualityOrder = Object.fromEntries(QUALITIES.map((q, i) => [q, i]));
const shotOrder = Object.fromEntries(shots.map((s, i) => [s.id, i]));
rows.sort((a, b) =>
  (shotOrder[a.id] ?? 99) - (shotOrder[b.id] ?? 99)
  || (viewOrder[a.view] ?? 9) - (viewOrder[b.view] ?? 9)
  || (qualityOrder[a.quality] ?? 9) - (qualityOrder[b.quality] ?? 9));

const expected = shots.length * Object.keys(VIEWS).length * QUALITIES.length;
const failed = rows.filter((r) => !r.ok);
const missing = expected - rows.length;
const lines = [
  '<!-- visual-regression -->',
  '## Visual regression',
  '',
  `Night rain, seed ${SEED}, sim clock ${EXPECT_SIM_TIME}s, SwiftShader WebGL2. Tolerance ${pct(MAX_DIFF_RATIO)} of pixels (pixelmatch threshold ${PIXEL_THRESHOLD}, anti-aliasing ignored).`,
  '',
];
if (failed.length || missing > 0) {
  const bits = [];
  if (failed.length) bits.push(`${failed.length} failed`);
  if (missing > 0) bits.push(`${missing} not captured`);
  lines.push(`**${bits.join(', ')} of ${expected} images.**`);
} else {
  lines.push(`**${rows.length} images matched.**`);
}
lines.push(
  '',
  '| Shot | View | Quality | Result | Mismatch | Frame ms | Draws | Triangles | LOD0 |',
  '|---|---|---|---|---:|---:|---:|---:|---:|',
);
for (const r of rows) {
  const result = r.ok ? (r.updated ? 'updated' : 'pass') : r.reason;
  lines.push(`| ${r.id} | ${r.view} | ${r.quality} | ${result} | ${r.ratio == null ? '' : pct(r.ratio)} | ${r.frameMs ?? ''} | ${r.draws ?? ''} | ${r.tris ?? ''} | ${r.lod0 ?? ''} |`);
}
lines.push('', 'Measurements are reported only. There is no frame-time gate.', '');
if (slowest) lines.push(`Slowest shard captured in ${slowest}s.`);
if (failed.length || missing > 0) {
  lines.push('', 'Diff images are in the `visual-diff-report` artifact under `diff/`.');
}
lines.push('');

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'report.md'), lines.join('\n'));
writeFileSync(join(outDir, 'report.json'), JSON.stringify({
  seed: SEED,
  simTime: EXPECT_SIM_TIME,
  maxRatio: MAX_DIFF_RATIO,
  pixelThreshold: PIXEL_THRESHOLD,
  shards: reports.length,
  rows,
}, null, 2));
console.log(lines.join('\n'));
if (failed.length || missing > 0 || reports.length === 0) process.exit(1);
