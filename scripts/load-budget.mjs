// Cold-load budget until the city is interactive.
// JavaScript in one task stays under 520 ms, and one task links at most four programs
// (a drawable's color pass, a depth pass, and a second material). The gate runs each
// scenario three times and judges the median run, the one whose JavaScript time sits
// in the middle. One noisy sample does not fail the build. The 520 ms ceiling and the
// four-program batch limit are unchanged: the median run still fails when its
// JavaScript exceeds 520 ms, or when it links more than four programs in a task
// longer than 320 ms.
// Driver link, uniform reflection, and draw time are subtracted via ?loadprobe=1.
// A 4× CPU throttle is not used.
// Requires dist/. Uses Playwright's Chromium unless CHROME is set.
import { BUDGET_MS, formatGateLine, isDirectRun, judgeGate, measureScenario } from './load-measure.mjs';

export { BUDGET_MS };
export const GATE_SAMPLES = 3;

const scenarios = [
  { quality: 'medium', mode: 'cine' },
  { quality: 'high', mode: 'fly' },
];

async function main() {
  let failed = false;
  for (const scenario of scenarios) {
    const samples = await measureScenario({
      ...scenario,
      samples: GATE_SAMPLES,
      budgetMs: BUDGET_MS,
    });
    const verdict = judgeGate(samples, BUDGET_MS);
    console.log(formatGateLine(scenario, samples, verdict));
    if (!verdict.pass) failed = true;
  }
  if (failed) {
    console.error('load budget failed');
    process.exit(1);
  }
  console.log('load budget ok');
}

if (isDirectRun(import.meta.url)) {
  await main();
}
