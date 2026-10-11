// Turns measurements.json into the markdown and HTML the owner can open.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = process.cwd();
const JSON_PATH = join(ROOT, 'tools/scale-audit/out/measurements.json');
const FIG_CHECK = join(ROOT, 'tools/scale-audit/out/figure-check.json');
const FIG_DIR = join(ROOT, 'docs/audit/figures');
const MD = join(ROOT, 'docs/audit/scale-2026-10-11.md');
const HTML = join(ROOT, 'docs/audit/scale-2026-10-11.html');

const GROUP_TITLE = {
  vehicles: 'Vehicles',
  doors: 'Doors',
  stairs: 'Stairs',
  rails: 'Rails',
  storeys: 'Storeys',
  lanes: 'Lanes and sidewalks',
  signs: 'Signs',
  people: 'People',
  landmarks: 'Landmarks',
  lamps: 'Lamps',
};

const PASS_BLURB = {
  vehicles: 'Raise the shared car (and the truck classes) so a 1.75 m person reads next to them. The bible’s 0.9 m compact height is the number to change with the mesh.',
  doors: 'Human openings should land between 2.0 and 2.4 m. Monumental portals can stay huge if a human door sits in front of them.',
  stairs: 'Real risers are 0.15–0.18 m and treads about 0.28 m. Flights the bible already calls out (0.35 m, 0.375 m, apron ~0.39 m) need a lore decision before the mesh changes.',
  rails: 'Handrails want about 0.9–1.1 m. Anything under the 0.45 m step-up can be walked over.',
  storeys: 'Façade CELL_H is the floor the player counts. Keep 3–4 m for housing and shops. Office bands the bible already allows at 4.0–5.5 m should be labeled as that, not left looking like a mistake. Slit and monolith panels are not floors.',
  lanes: 'Keep freeway spacing at 3.5–3.7 m. Say out loud that a driving line is a centreline offset. Wide avenues with one tracked lane should not be read as 8 m sidewalks.',
  signs: 'Street panels stay in a human range. Billboards are boards.',
  people: 'The shared body is already 1.80 m. Districts with no crowd registration read as empty.',
  landmarks: 'Published height and the mesh tip should be the same number, or the bible should say the mast is extra in the same sentence as the height.',
  lamps: 'Poles that are centered on the ground sink. A 7.5 m shared lamp is a fair arterial pole where it is allowed to draw.',
};

const COMPARE = [
  ['little-tokyo-low', 'Little Tokyo at low'],
  ['little-tokyo-ultra', 'Little Tokyo at ultra'],
  ['little-tokyo-phone', 'Little Tokyo on a phone-sized viewport'],
];

function figureScaleNote() {
  if (!existsSync(FIG_CHECK)) return '';
  const f = JSON.parse(readFileSync(FIG_CHECK, 'utf8'));
  const bits = [];
  if (f.low?.frac != null && f.ultra?.frac != null) {
    const ratio = f.low.frac / f.ultra.frac;
    const close = ratio > 0.85 && ratio < 1.15;
    bits.push(`On the same Little Tokyo camera, the 1.75 m figure was ${Number(f.low.frac).toFixed(3)} of the frame height at low and ${Number(f.ultra.frac).toFixed(3)} at ultra (${f.low.px}px / ${f.low.h}px and ${f.ultra.px}px / ${f.ultra.h}px).`);
    if (f.phone?.frac != null) bits.push(`The phone viewport put the same figure at ${Number(f.phone.frac).toFixed(3)} of its frame height (${f.phone.px}px / ${f.phone.h}px).`);
    bits.push(close
      ? 'Those fractions stay together because quality settings do not rescale metres.'
      : 'The fractions differ, so the camera distance or framing changed between tiers. Quality settings themselves do not multiply world metres.');
  }
  return bits.join(' ');
}

function compareMarkdown() {
  const lines = [];
  for (const [id, label] of COMPARE) {
    if (existsSync(join(FIG_DIR, `${id}.jpg`))) lines.push('', `![${label}](figures/${id}.jpg)`);
  }
  return lines;
}

function compareHtml() {
  return COMPARE.filter(([id]) => existsSync(join(FIG_DIR, `${id}.jpg`)))
    .map(([id, label]) => `<figure><img src="figures/${id}.jpg" alt="${esc(label)}"><figcaption>${esc(label)}. Same street, same 1.75 m figure.</figcaption></figure>`)
    .join('');
}

function load() {
  return JSON.parse(readFileSync(JSON_PATH, 'utf8'));
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function counts(rows) {
  const c = { pass: 0, watch: 0, fail: 0 };
  for (const r of rows) c[r.verdict] = (c[r.verdict] ?? 0) + 1;
  return c;
}

function figureFor(id) {
  const rel = `figures/${id}.jpg`;
  return existsSync(join(FIG_DIR, `${id}.jpg`)) ? rel : null;
}

function mdTable(rows) {
  const lines = [
    '| Item | Measured | Expected | Verdict | Severity | Source |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of rows) {
    const note = r.note ? `<br>${r.note.replace(/\|/g, '/')}` : '';
    lines.push(`| ${r.item.replace(/\|/g, '/')} | ${r.measured.replace(/\|/g, '/')} | ${r.expected.replace(/\|/g, '/')}${note} | ${r.verdict} | ${r.severity} | \`${r.source.replace(/\|/g, '/')}\` |`);
  }
  return lines.join('\n');
}

function htmlTable(rows) {
  const head = '<table><thead><tr><th>Item</th><th>Measured</th><th>Expected</th><th>Verdict</th><th>Severity</th><th>Source</th></tr></thead><tbody>';
  const body = rows.map((r) => {
    const note = r.note ? `<div class="note">${esc(r.note)}</div>` : '';
    return `<tr class="v-${r.verdict}"><td>${esc(r.item)}</td><td>${esc(r.measured)}</td><td>${esc(r.expected)}${note}</td><td>${esc(r.verdict)}</td><td>${esc(r.severity)}</td><td><code>${esc(r.source)}</code></td></tr>`;
  }).join('');
  return `${head}${body}</tbody></table>`;
}

function markdown(doc) {
  const all = doc.districts.flatMap((d) => d.rows);
  const c = counts(all);
  const lines = [];
  lines.push('# Scale audit — 11 October 2026');
  lines.push('');
  lines.push(`Twenty polygon districts plus the hills overlay: **${doc.places} places**. Rows: ${c.pass} pass, ${c.watch} watch, ${c.fail} fail.`);
  lines.push('');
  lines.push('## How this was measured');
  lines.push('');
  for (const m of doc.method) lines.push(`- ${m}`);
  lines.push('');
  lines.push('## Graphics tiers');
  lines.push('');
  lines.push(doc.quality.text);
  lines.push('');
  lines.push('| Tier | detailScale | farRadius | groundTraffic | crowd | crowd radius | landmarkLod |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const t of doc.quality.tiers) {
    lines.push(`| ${t.tier} | ${t.detailScale} | ${t.farRadius} m | ${t.groundTraffic} | ${t.crowd} | ${t.crowdRadius} m | ${t.landmarkLod} |`);
  }
  lines.push('');
  lines.push('Low hides ground cars and pulls the far city in. It does not shrink a door, a car, or the 1.75 m reference figure. The phone screenshots in this folder are the same street at a narrow viewport.');
  const figNote = figureScaleNote();
  if (figNote) lines.push('', figNote);
  lines.push(...compareMarkdown());
  lines.push('');
  lines.push('## Ranked fixes');
  lines.push('');
  lines.push('Grouped so a later pass can take one subject. High severity first. The same mesh is listed once, with every district that shows it.');
  lines.push('');
  let last = '';
  for (const f of doc.fixes) {
    if (f.group !== last) {
      last = f.group;
      lines.push(`### ${GROUP_TITLE[f.group] ?? f.group}`);
      lines.push('');
      if (PASS_BLURB[f.group]) lines.push(PASS_BLURB[f.group]);
      lines.push('');
    }
    lines.push(`- **${f.severity} ${f.verdict} — ${f.item}.** Measured ${f.measured}. Expected ${f.expected}. \`${f.source}\`. Districts: ${f.districts.join(', ')}.${f.note ? ` ${f.note}` : ''}`);
  }
  lines.push('');
  lines.push('## Districts');
  lines.push('');
  for (const d of doc.districts) {
    const dc = counts(d.rows);
    lines.push(`### ${d.stage}. ${d.name}`);
    lines.push('');
    lines.push(`\`${d.id}\` · archetype \`${d.archetype}\` · ${dc.pass} pass, ${dc.watch} watch, ${dc.fail} fail.`);
    if (d.sample) {
      lines.push(`Sample around (${d.sample.x.toFixed(0)}, ${d.sample.z.toFixed(0)}), ground ${d.sample.ground.toFixed(1)} m, ${d.sample.blocks} blocks, ${d.sample.boxes} boxes, ${d.sample.signs} signs.`);
    } else {
      lines.push('No fabric sample.');
    }
    const fig = figureFor(d.id);
    if (fig) lines.push('', `![${d.name} with a 1.75 m figure](${fig})`);
    lines.push('');
    lines.push(mdTable(d.rows));
    lines.push('');
  }
  return lines.join('\n');
}

function html(doc) {
  const all = doc.districts.flatMap((d) => d.rows);
  const c = counts(all);
  const nav = doc.districts.map((d) => `<a href="#d-${esc(d.id)}">${esc(d.name)}</a>`).join('');
  let last = '';
  const fixes = doc.fixes.map((f) => {
    let head = '';
    if (f.group !== last) {
      last = f.group;
      head = `<h3>${esc(GROUP_TITLE[f.group] ?? f.group)}</h3>${PASS_BLURB[f.group] ? `<p>${esc(PASS_BLURB[f.group])}</p>` : ''}`;
    }
    return `${head}<li class="sev-${esc(f.severity)}"><strong>${esc(f.severity)} ${esc(f.verdict)} — ${esc(f.item)}.</strong> Measured ${esc(f.measured)}. Expected ${esc(f.expected)}. <code>${esc(f.source)}</code>. Districts: ${esc(f.districts.join(', '))}.${f.note ? ` ${esc(f.note)}` : ''}</li>`;
  }).join('');
  const sections = doc.districts.map((d) => {
    const dc = counts(d.rows);
    const fig = figureFor(d.id);
    const img = fig ? `<figure><img src="${esc(fig)}" alt="${esc(d.name)} with a 1.75 m reference figure"><figcaption>1.75 m reference figure. Sample (${d.sample ? `${d.sample.x.toFixed(0)}, ${d.sample.z.toFixed(0)}` : '—'}).</figcaption></figure>` : '';
    const sample = d.sample
      ? `Sample around (${d.sample.x.toFixed(0)}, ${d.sample.z.toFixed(0)}), ground ${d.sample.ground.toFixed(1)} m, ${d.sample.blocks} blocks, ${d.sample.boxes} boxes, ${d.sample.signs} signs.`
      : 'No fabric sample.';
    return `<section id="d-${esc(d.id)}"><h2>${d.stage}. ${esc(d.name)}</h2><p class="meta"><code>${esc(d.id)}</code> · <code>${esc(d.archetype)}</code> · ${dc.pass} pass, ${dc.watch} watch, ${dc.fail} fail. ${esc(sample)}</p>${img}${htmlTable(d.rows)}</section>`;
  }).join('');
  const tiers = doc.quality.tiers.map((t) => `<tr><td>${esc(t.tier)}</td><td>${t.detailScale}</td><td>${t.farRadius} m</td><td>${t.groundTraffic}</td><td>${t.crowd}</td><td>${t.crowdRadius} m</td><td>${t.landmarkLod}</td></tr>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scale audit — 11 October 2026</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font: 16px/1.45 "Iowan Old Style", Palatino, Georgia, serif; color: #1c1915; background: #f6f3ec; }
  header, main { max-width: 1100px; margin: 0 auto; padding: 24px 20px 48px; }
  h1 { font-size: 2rem; margin: 0 0 8px; }
  h2 { font-size: 1.45rem; margin: 2rem 0 0.4rem; }
  h3 { font-size: 1.1rem; margin: 1.4rem 0 0.3rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.82em; }
  .lead { font-size: 1.05rem; }
  nav { display: flex; flex-wrap: wrap; gap: 8px 12px; margin: 16px 0 8px; }
  nav a { color: #134e4a; }
  table { width: 100%; border-collapse: collapse; background: #fff; margin: 12px 0 28px; font-size: 0.92rem; }
  th, td { border-bottom: 1px solid #e4dfd4; text-align: left; vertical-align: top; padding: 8px 10px; }
  th { background: #efeae0; font-weight: 650; }
  .note { color: #5c564c; margin-top: 4px; font-size: 0.88em; }
  tr.v-fail td:nth-child(4) { color: #9f1239; font-weight: 700; }
  tr.v-watch td:nth-child(4) { color: #9a3412; font-weight: 700; }
  tr.v-pass td:nth-child(4) { color: #166534; }
  li.sev-high { color: #9f1239; }
  li { margin: 0.45rem 0; }
  figure { margin: 12px 0; }
  img { width: 100%; max-width: 960px; height: auto; background: #111; }
  figcaption, .meta { color: #5c564c; }
  .method li { margin: 0.3rem 0; }
</style>
</head>
<body>
<header>
  <h1>Scale audit — 11 October 2026</h1>
  <p class="lead">Twenty polygon districts plus the hills overlay: <strong>${doc.places} places</strong>. Rows: ${c.pass} pass, ${c.watch} watch, ${c.fail} fail. Metres are engine units. This page is the audit; the markdown twin is <code>docs/audit/scale-2026-10-11.md</code>.</p>
  <nav>${nav}</nav>
</header>
<main>
  <h2>How this was measured</h2>
  <ul class="method">${doc.method.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
  <h2>Graphics tiers</h2>
  <p>${esc(doc.quality.text)}</p>
  <table><thead><tr><th>Tier</th><th>detailScale</th><th>farRadius</th><th>groundTraffic</th><th>crowd</th><th>crowd radius</th><th>landmarkLod</th></tr></thead><tbody>${tiers}</tbody></table>
  <p>Low hides ground cars and pulls the far city in. It does not shrink a door, a car, or the 1.75 m reference figure. The phone screenshot is the same street at a narrow viewport.</p>
  ${figureScaleNote() ? `<p>${esc(figureScaleNote())}</p>` : ''}
  ${compareHtml()}
  <h2 id="fixes">Ranked fixes</h2>
  <p>Grouped so a later pass can take one subject. High severity first. The same mesh is listed once, with every district that shows it.</p>
  <ol>${fixes}</ol>
  ${sections}
</main>
</body>
</html>`;
}

export function writeReports() {
  const doc = load();
  mkdirSync(dirname(MD), { recursive: true });
  writeFileSync(MD, markdown(doc));
  writeFileSync(HTML, html(doc));
  console.log(`wrote ${MD}`);
  console.log(`wrote ${HTML}`);
}

if (import.meta.url === `file://${process.argv[1]}`) writeReports();
