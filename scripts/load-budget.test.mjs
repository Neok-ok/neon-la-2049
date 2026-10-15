import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { GATE_SAMPLES, BUDGET_MS } from './load-budget.mjs';
import { isDocsOnly, pathsFromDiff } from './docs-only-diff.mjs';
import {
  batchCountFromClassified,
  formatGateLine,
  judgeGate,
  medianOf,
  parseLoadTasks,
  sampleFromOutputs,
  summarizeSamples,
} from './load-measure.mjs';

test('the gate stays at three samples and 520 ms', () => {
  assert.equal(GATE_SAMPLES, 3);
  assert.equal(BUDGET_MS, 520);
});

test('median of three uses the middle JavaScript time', () => {
  const samples = [
    { index: 1, js: 545, interactive: true, batch: 0, measured: true },
    { index: 2, js: 400, interactive: true, batch: 0, measured: true },
    { index: 3, js: 510, interactive: true, batch: 0, measured: true },
  ];
  const verdict = judgeGate(samples, 520);
  assert.equal(verdict.pass, true);
  assert.equal(verdict.median, 510);
  assert.equal(verdict.chosen.index, 3);
  assert.equal(verdict.min, 400);
  assert.equal(verdict.max, 545);
});

test('median above 520 fails without moving the ceiling', () => {
  const samples = [545, 530, 525].map((js, index) => ({
    index: index + 1,
    js,
    interactive: true,
    batch: 0,
    measured: true,
  }));
  const verdict = judgeGate(samples, 520);
  assert.equal(verdict.pass, false);
  assert.equal(verdict.median, 530);
  assert.equal(verdict.budgetMs, 520);
});

test('520 ms on the median still passes', () => {
  const samples = [521, 520, 519].map((js, index) => ({
    index: index + 1,
    js,
    interactive: true,
    batch: 0,
    measured: true,
  }));
  const verdict = judgeGate(samples, 520);
  assert.equal(verdict.pass, true);
  assert.equal(verdict.median, 520);
});

test('a four-program batch on an outlier does not fail the median run', () => {
  const verdict = judgeGate([
    { index: 1, js: 100, interactive: true, batch: 1, measured: true },
    { index: 2, js: 200, interactive: true, batch: 0, measured: true },
    { index: 3, js: 300, interactive: true, batch: 0, measured: true },
  ], 520);
  assert.equal(verdict.pass, true);
  assert.equal(verdict.median, 200);
});

test('a four-program batch on the median run still fails', () => {
  const verdict = judgeGate([
    { index: 1, js: 100, interactive: true, batch: 0, measured: true },
    { index: 2, js: 200, interactive: true, batch: 1, measured: true },
    { index: 3, js: 300, interactive: true, batch: 0, measured: true },
  ], 520);
  assert.equal(verdict.pass, false);
  assert.equal(verdict.median, 200);
  assert.equal(verdict.chosen.batch, 1);
});

test('an unmeasured outlier sorts above finished runs', () => {
  const verdict = judgeGate([
    { index: 1, js: null, interactive: false, batch: null, measured: false },
    { index: 2, js: 400, interactive: true, batch: 0, measured: true },
    { index: 3, js: 450, interactive: true, batch: 0, measured: true },
  ], 520);
  assert.equal(verdict.pass, true);
  assert.equal(verdict.median, 450);
});

test('two unmeasured runs fail the median', () => {
  const verdict = judgeGate([
    { index: 1, js: 100, interactive: true, batch: 0, measured: true },
    { index: 2, js: null, interactive: false, batch: null, measured: false },
    { index: 3, js: null, interactive: false, batch: null, measured: false },
  ], 520);
  assert.equal(verdict.pass, false);
  assert.equal(verdict.median, null);
});

test('empty samples are rejected', () => {
  assert.throws(() => judgeGate([], 520), /at least one sample/);
});

test('ten-run median is the average of the two middle values', () => {
  assert.equal(medianOf([10, 1, 3, 2, 9, 8, 7, 4, 6, 5]), 5.5);
  assert.equal(medianOf([545, 400, 510]), 510);
  const summary = summarizeSamples([
    { measured: true, js: 480 },
    { measured: true, js: 560 },
    { measured: false, js: null },
  ]);
  assert.equal(summary.valid, 2);
  assert.equal(summary.min, 480);
  assert.equal(summary.median, 520);
  assert.equal(summary.max, 560);
  assert.deepEqual(summary.values, [480, 560, null]);
});

test('profile stdout is the batch source of truth', () => {
  const stdout = [
    'goto http://127.0.0.1:4173/',
    'load tasks {"loadLongest":3138,"jsWorst":292,"batched":[{"links":5,"duration":3138,"js":178}],"jsOver":[]}',
    '',
  ].join('\n');
  const parsed = parseLoadTasks(stdout);
  assert.equal(parsed.jsWorst, 292);
  assert.equal(parsed.batched.length, 1);
  const sample = sampleFromOutputs({
    report: { interactive: true, jsWorst: 292, wallMs: 1000, loadClassified: [] },
    stdout,
    exitCode: 1,
  });
  assert.equal(sample.js, 292);
  assert.equal(sample.batch, 1);
  assert.equal(sample.measured, true);
  assert.equal(sample.crashed, false);
});

test('classified fallback keeps the four-program limit', () => {
  const count = batchCountFromClassified([
    { links: 5, duration: 400 },
    { links: 4, duration: 5000 },
    { links: 6, duration: 320 },
    { links: 6, duration: 321 },
  ], 520);
  assert.equal(count, 2);
  assert.equal(batchCountFromClassified([{ links: 5, duration: 400 }], 0), 1);
});

test('missing profile is an unmeasured sample', () => {
  const sample = sampleFromOutputs({ report: null, stdout: '', exitCode: 1 });
  assert.equal(sample.measured, false);
  assert.equal(sample.crashed, true);
  assert.equal(sample.js, null);
});

test('gate line names the median and the verdict', () => {
  const samples = [
    { index: 1, js: 498, interactive: true, batch: 0, measured: true },
    { index: 2, js: 531, interactive: true, batch: 0, measured: true },
    { index: 3, js: 505, interactive: true, batch: 0, measured: true },
  ];
  const verdict = judgeGate(samples, 520);
  const line = formatGateLine({ quality: 'high', mode: 'fly' }, samples, verdict);
  assert.equal(
    line,
    'LOAD_GATE scenario="high fly" samples=498,531,505 median=505 min=498 max=531 limit=520 batch=0,0,0 interactive=1,1,1 chosen=3 result=pass',
  );
});

test('docs-only diffs are docs/** or markdown', () => {
  assert.equal(isDocsOnly(['docs/status/note.md']), true);
  assert.equal(isDocsOnly(['docs/perf/MEMORY-RULES.html']), true);
  assert.equal(isDocsOnly(['README.md']), true);
  assert.equal(isDocsOnly(['src/app/readme.md']), true);
  assert.equal(isDocsOnly(['scripts/load-budget.mjs']), false);
  assert.equal(isDocsOnly(['.github/workflows/ci.yml']), false);
  assert.equal(isDocsOnly(['docs/a.md', 'src/app.ts']), false);
  assert.equal(isDocsOnly([]), false);
  assert.deepEqual(pathsFromDiff('docs/a.md\n\nREADME.md\n'), ['docs/a.md', 'README.md']);
});

test('docs-only CLI exits 0 only for a docs diff', () => {
  const onlyDocs = spawnSync(process.execPath, ['scripts/docs-only-diff.mjs'], {
    input: 'docs/status/note.md\nREADME.md\n',
    encoding: 'utf8',
  });
  assert.equal(onlyDocs.status, 0);
  const withScript = spawnSync(process.execPath, ['scripts/docs-only-diff.mjs'], {
    input: 'docs/status/note.md\nscripts/load-budget.mjs\n',
    encoding: 'utf8',
  });
  assert.equal(withScript.status, 1);
  const empty = spawnSync(process.execPath, ['scripts/docs-only-diff.mjs'], {
    input: '\n',
    encoding: 'utf8',
  });
  assert.equal(empty.status, 1);
});
