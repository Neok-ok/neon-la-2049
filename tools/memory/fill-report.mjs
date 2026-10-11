// Fill docs/perf/p1-2026-10-11.html from profiler summaries.
//   node tools/memory/fill-report.mjs
// Reads tools/memory/out/before and tools/memory/out/after.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const HTML = join(ROOT, 'docs/perf/p1-2026-10-11.html');
const BEFORE = join(ROOT, 'tools/memory/out/before');
const AFTER = join(ROOT, 'tools/memory/out/after');
const TIERS = ['low', 'medium', 'high', 'ultra'];

function load(dir, tier) {
  const path = join(dir, tier, 'summary.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function series(dir, tier) {
  const path = join(dir, tier, 'series.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8'));
}

function mb(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return (n / (1024 * 1024)).toFixed(1);
}

function cell(s, key) {
  if (!s || s.error) return s?.error ? 'failed' : '—';
  return mb(s[key]);
}

function replaceInner(html, id, inner) {
  const re = new RegExp(`(<div id="${id}">)[\\s\\S]*?(</div>)`);
  if (!re.test(html)) throw new Error(`missing #${id}`);
  return html.replace(re, `$1\n${inner}\n$2`);
}

function tierTable(before, after) {
  const rows = TIERS.map((tier) => {
    const b = before[tier];
    const a = after[tier];
    const crash = (s) => (s?.crashes?.length ? s.crashes.length : s ? 0 : '—');
    const slope = (s) => (s && Number.isFinite(s.slopeMbPerMin) ? s.slopeMbPerMin.toFixed(2) : '—');
    return `<tr><td>${tier}</td><td>${cell(b, 'jsHeapPeak')}</td><td>${cell(a, 'jsHeapPeak')}</td><td>${cell(b, 'jsHeapSteady')}</td><td>${cell(a, 'jsHeapSteady')}</td><td>${cell(b, 'gpuCounterPeak')}</td><td>${cell(a, 'gpuCounterPeak')}</td><td>${slope(b)}</td><td>${slope(a)}</td><td>${crash(b)}</td><td>${crash(a)}</td></tr>`;
  });
  return `<table>
<tr><th>Tier</th><th>Before heap peak</th><th>After heap peak</th><th>Before heap steady</th><th>After heap steady</th><th>Before GPU peak</th><th>After GPU peak</th><th>Before slope</th><th>After slope</th><th>Before crashes</th><th>After crashes</th></tr>
${rows.join('\n')}
</table>
<p>Megabytes. Heap is <code>performance.memory.usedJSHeapSize</code>. GPU is three.js <code>renderer.info.memory.total</code>. Steady is the mean of the last 30% of samples. Slope is MB per minute after the first 45 seconds. The simulated phone heap limit is about 864 MB.</p>`;
}

function consumers(summaries, label) {
  const blocks = [];
  for (const tier of TIERS) {
    const s = summaries[tier];
    if (!s?.topGeometries?.length) continue;
    const rows = s.topGeometries.slice(0, 8).map((g) =>
      `<tr><td>${g.name}</td><td>${mb(g.bytes)}</td><td>${g.count}</td></tr>`).join('\n');
    const dups = (s.duplicates ?? []).slice(0, 4).map((d) =>
      `${d.name} ×${d.count} (${mb(d.bytes)} MB fingerprint)`).join('; ') || 'none over 2 KB';
    blocks.push(`<h3>${label}, ${tier}</h3>
<table><tr><th>Mesh group</th><th>MB</th><th>Count</th></tr>
${rows}
</table>
<p>Duplicate fingerprints: ${dups}. Scene geometries peaked at ${s.geometriesPeak ?? '—'}, materials at ${s.materialsPeak ?? '—'}, programs at ${s.programsPeak ?? '—'}.</p>`);
  }
  return blocks.join('\n') || '<p>No samples yet.</p>';
}

function chart(dir) {
  const colors = { low: '#3d6b4f', medium: '#0b4f6c', high: '#8a5a12', ultra: '#8c2f39' };
  const lines = [];
  let max = 1;
  const seriesByTier = {};
  for (const tier of TIERS) {
    const rows = series(dir, tier).filter((r) => r.ready && r.jsHeap > 0);
    seriesByTier[tier] = rows;
    for (const r of rows) max = Math.max(max, r.jsHeap);
  }
  const w = 640;
  const h = 220;
  const pad = 36;
  for (const tier of TIERS) {
    const rows = seriesByTier[tier];
    if (rows.length < 2) continue;
    const t0 = rows[0].wallMs ?? rows[0].t;
    const t1 = rows[rows.length - 1].wallMs ?? rows[rows.length - 1].t;
    const span = Math.max(1, t1 - t0);
    const pts = rows.map((r) => {
      const x = pad + ((r.wallMs ?? r.t) - t0) / span * (w - pad * 2);
      const y = h - pad - (r.jsHeap / max) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    lines.push(`<polyline fill="none" stroke="${colors[tier]}" stroke-width="2" points="${pts}"/>`);
  }
  const legend = TIERS.map((tier, i) =>
    `<text x="${pad + i * 90}" y="18" fill="${colors[tier]}" font-family="system-ui,sans-serif" font-size="12">${tier}</text>`).join('');
  const capY = h - pad - ((864 * 1024 * 1024) / max) * (h - pad * 2);
  const cap = max > 400 * 1024 * 1024
    ? `<line x1="${pad}" y1="${capY.toFixed(1)}" x2="${w - pad}" y2="${capY.toFixed(1)}" stroke="#bbb" stroke-dasharray="4 3"/>`
    : '';
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="JS heap over the route">
${legend}
${cap}
${lines.join('\n')}
<text x="${pad}" y="${h - 8}" fill="#666" font-family="system-ui,sans-serif" font-size="11">0</text>
<text x="${w - 120}" y="${h - 8}" fill="#666" font-family="system-ui,sans-serif" font-size="11">end of route</text>
<text x="8" y="${pad + 8}" fill="#666" font-family="system-ui,sans-serif" font-size="11">${mb(max)} MB</text>
</svg>`;
}

const before = Object.fromEntries(TIERS.map((t) => [t, load(BEFORE, t)]));
const after = Object.fromEntries(TIERS.map((t) => [t, load(AFTER, t)]));
const haveBefore = TIERS.filter((t) => before[t] && !before[t].error).length;
const haveAfter = TIERS.filter((t) => after[t] && !after[t].error).length;

if (haveBefore === 0) {
  process.stdout.write('no before summaries yet; left the write-up alone\n');
  process.exit(0);
}

let html = readFileSync(HTML, 'utf8');
const status = `<p><strong>10-minute tables.</strong> Before route: ${haveBefore}/4 tiers. After route: ${haveAfter}/4 tiers. Numbers are from headless Chrome with a Pixel-class viewport, an Android user agent, <code>deviceMemory = 4</code>, and a JS heap cap near 864 MB. No Android emulator was available.</p>`;
html = replaceInner(html, 'measure-status', status);
html = replaceInner(html, 'consumer-table', consumers(before, 'Before') + consumers(after, 'After'));
html = replaceInner(html, 'tier-table', tierTable(before, after));
html = html.replace(/<svg[\s\S]*?<\/svg>/, chart(haveAfter ? AFTER : BEFORE));
writeFileSync(HTML, html);
const outDir = existsSync(BEFORE) ? readdirSync(BEFORE) : [];
process.stdout.write(`filled report before=${haveBefore} after=${haveAfter} dirs=${outDir.join(',')}\n`);
