// The round-10 spinner shipped with fins, a roof rod, and a rear slab.
// This asserts that mesh fails the stray gate, and that the shipping tiers pass it.
import { check, housedWheels } from './stray.mjs';

const FIXTURE = 'tools/model-harness/fixtures/spinner-round10-high.glb';
const SHIPPING = ['high', 'medium', 'low'].map((lod) => `public/models/spinner/spinner-${lod}.glb`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const old = await check(FIXTURE);
const flagged = [...old.loose, ...old.thin];
const rubber = flagged.some((part) => part.material === 'rubber');
const side = old.views.find((view) => view.id === 'side');
const front = old.views.find((view) => view.id === 'front');
const cabinFin = side.regions.some((region) => region.v >= 0.85 && region.maxProtrusionM >= 0.08);
const roofSpike = front.regions.some((region) => region.v >= 1.2 && region.maxProtrusionM >= 0.08);
if (old.pass || !rubber || !cabinFin || !roofSpike) {
  fail(`round 10 fixture must fail the stray gate (pass=${old.pass} rubber=${rubber} fin=${cabinFin} spike=${roofSpike})`);
}
console.log(
  `round 10 fixture fails: protrusion ${old.maxProtrusionM} m, ${old.strayRegions} regions, ${old.loose.length} loose, ${old.thin.length} thin`,
);

for (const file of SHIPPING) {
  const report = await check(file);
  if (!report.pass) {
    const sample = [...report.loose, ...report.thin].slice(0, 4);
    fail(`${file} failed stray gate: protrusion ${report.maxProtrusionM} m, ${report.strayRegions} regions, loose ${report.loose.length}, thin ${report.thin.length} ${JSON.stringify(sample)}`);
  }
  const sideView = report.views.find((view) => view.id === 'side');
  const frontView = report.views.find((view) => view.id === 'front');
  const topView = report.views.find((view) => view.id === 'top');
  if (sideView.iou < 0.85 || frontView.iou < 0.8 || topView.iou < 0.8) {
    fail(`${file} silhouette IoU side ${sideView.iou} front ${frontView.iou} top ${topView.iou}`);
  }
  const pods = await housedWheels(file);
  if (!pods.pass) {
    fail(`${file} wheels are not housed in the pods: ${pods.failures.join('; ')}`);
  }
  const drum = pods.wheels.map((wheel) => `${wheel.place} axial ${wheel.axial}`).join(', ');
  console.log(`${file} pass · side ${sideView.iou} front ${frontView.iou} top ${topView.iou} · ${drum}`);
}

const TRAFFIC = ['car', 'hauler'].flatMap((kind) =>
  ['high', 'medium', 'low'].map((lod) => ({ kind, file: `public/models/traffic/${kind}-${lod}.glb` })),
);
for (const { kind, file } of TRAFFIC) {
  const report = await check(file, undefined, { kind });
  if (!report.pass) {
    const sample = [...report.loose, ...report.thin].slice(0, 3);
    const regions = report.views
      .filter((view) => view.strayRegions)
      .slice(0, 3)
      .map((view) => `${view.id}:${view.maxProtrusionM}`);
    fail(`${file} failed stray gate: protrusion ${report.maxProtrusionM} m, ${report.strayRegions} regions (${regions.join(', ')}), loose ${report.loose.length}, thin ${report.thin.length} ${JSON.stringify(sample)}`);
  }
  console.log(`${file} pass · protrusion ${report.maxProtrusionM} m`);
}
