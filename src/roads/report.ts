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
