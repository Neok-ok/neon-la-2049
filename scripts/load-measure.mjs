// Cold-load samples for the budget gate and for the CI spread report.
// Each sample is one run of scripts/profile-load.mjs. That script still owns the
// 520 ms JavaScript ceiling and the four-program batch limit (a task with more
// than four links fails when it is longer than 320 ms). This file only collects
// those results. It does not raise either limit.
// Requires dist/. Uses Playwright's Chromium unless CHROME is set.
import { execFile, execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createConnection } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BUDGET_MS = 520;

export function isDirectRun(metaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  return metaUrl === pathToFileURL(resolve(entry)).href;
}

export function formatMs(value) {
  if (value == null || !Number.isFinite(value)) return 'na';
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

// Same rule as scripts/profile-load.mjs: more than four program links in a task
// longer than min(budget, 320) ms. Used only when the profile's own batched list
// is missing. The stdout list from profile-load is the one the gate trusts.
export function batchCountFromClassified(classified, budgetMs) {
  const jsLimit = budgetMs || 200;
  const batchLimit = Math.min(jsLimit, 320);
  return (classified ?? []).filter((task) => task.links > 4 && task.duration > batchLimit).length;
}

export function parseLoadTasks(stdout) {
  if (!stdout) return null;
  const lines = stdout.split('\n');
  const marker = 'load tasks ';
  for (let i = lines.length - 1; i >= 0; i--) {
    const at = lines[i].indexOf(marker);
    if (at === -1) continue;
    try {
      return JSON.parse(lines[i].slice(at + marker.length));
    } catch {
      return null;
    }
  }
  return null;
}

export function sampleFromOutputs({ report, stdout, exitCode, budgetMs = BUDGET_MS }) {
  const tasks = parseLoadTasks(stdout);
  const fromTasks = tasks?.jsWorst;
  const fromReport = report?.jsWorst;
  const js = Number.isFinite(fromTasks) ? fromTasks : (Number.isFinite(fromReport) ? fromReport : null);
  let batch = null;
  if (Array.isArray(tasks?.batched)) batch = tasks.batched.length;
  else if (report) batch = batchCountFromClassified(report.loadClassified, budgetMs);
  const interactive = report?.interactive === true;
  const measured = interactive && Number.isFinite(js) && batch != null;
  return {
    js,
    interactive,
    batch,
    measured,
    crashed: report == null,
    exitCode: exitCode ?? null,
    wallMs: Number.isFinite(report?.wallMs) ? report.wallMs : null,
  };
}

function rankKey(sample) {
  if (!sample.measured || !Number.isFinite(sample.js)) return Number.POSITIVE_INFINITY;
  return sample.js;
}

// JavaScript uses the middle sample after sorting by time. Unmeasured runs sort
// last, so they are the median only when at least half the runs did not finish.
// Even counts use the upper middle. The gate always passes three runs.
// The four-program batch limit is unchanged on each run. One run can trip it
// without failing the build. A majority of the runs must trip it before the
// gate fails, which is the median of that boolean.
export function judgeGate(samples, budgetMs = BUDGET_MS) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('load budget needs at least one sample');
  }
  const decorated = samples.map((sample, index) => ({
    ...sample,
    index: sample.index ?? index + 1,
    measured: sample.measured === true && Number.isFinite(sample.js) && sample.batch != null,
  }));
  const ranked = [...decorated].sort((a, b) => rankKey(a) - rankKey(b) || a.index - b.index);
  const chosen = ranked[Math.floor(ranked.length / 2)];
  const validJs = decorated.filter((sample) => sample.measured).map((sample) => sample.js);
  const batchFails = decorated.filter((sample) => sample.measured && sample.batch > 0).length;
  const batchMajority = batchFails * 2 > decorated.length;
  const pass = chosen.measured && chosen.js <= budgetMs && !batchMajority;
  return {
    pass,
    chosen,
    min: validJs.length ? Math.min(...validJs) : null,
    max: validJs.length ? Math.max(...validJs) : null,
    median: chosen.measured ? chosen.js : null,
    budgetMs,
    batchFails,
  };
}

export function medianOf(values) {
  const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return nums[mid];
  return (nums[mid - 1] + nums[mid]) / 2;
}

export function summarizeSamples(samples) {
  const validJs = samples.filter((sample) => sample.measured && Number.isFinite(sample.js)).map((sample) => sample.js);
  return {
    n: samples.length,
    valid: validJs.length,
    min: validJs.length ? Math.min(...validJs) : null,
    median: medianOf(validJs),
    max: validJs.length ? Math.max(...validJs) : null,
    values: samples.map((sample) => (sample.measured && Number.isFinite(sample.js) ? sample.js : null)),
  };
}

export function formatSampleLine(scenario, sample) {
  const label = `${scenario.quality} ${scenario.mode}`;
  return `LOAD_SAMPLE scenario="${label}" index=${sample.index} js=${formatMs(sample.js)} interactive=${sample.interactive ? 1 : 0} batch=${sample.batch == null ? 'na' : sample.batch} measured=${sample.measured ? 1 : 0} exit=${sample.exitCode ?? 'na'}`;
}

export function formatSummaryLine(scenario, summary) {
  const label = `${scenario.quality} ${scenario.mode}`;
  const values = summary.values.map((value) => formatMs(value)).join(',');
  return `LOAD_SAMPLE_SUMMARY scenario="${label}" n=${summary.n} valid=${summary.valid} min=${formatMs(summary.min)} median=${formatMs(summary.median)} max=${formatMs(summary.max)} values=${values}`;
}

export function formatGateLine(scenario, samples, verdict) {
  const label = `${scenario.quality} ${scenario.mode}`;
  const js = samples.map((sample) => formatMs(sample.measured ? sample.js : null)).join(',');
  const batch = samples.map((sample) => (sample.batch == null ? 'na' : String(sample.batch))).join(',');
  const interactive = samples.map((sample) => (sample.interactive ? '1' : '0')).join(',');
  const chosen = verdict.chosen?.index ?? 'na';
  const batchFails = verdict.batchFails ?? 'na';
  return `LOAD_GATE scenario="${label}" samples=${js} median=${formatMs(verdict.median)} min=${formatMs(verdict.min)} max=${formatMs(verdict.max)} limit=${verdict.budgetMs} batch=${batch} batchFails=${batchFails} interactive=${interactive} chosen=${chosen} result=${verdict.pass ? 'pass' : 'fail'}`;
}

function execQuiet(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, () => resolve());
  });
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    let settled = false;
    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(400);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

async function releasePreview(port = 4173) {
  await execQuiet('fuser', ['-k', `${port}/tcp`]);
  await execQuiet('pkill', ['-f', 'ms-playwright/chromium']);
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (!(await portOpen(port))) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

function runProfile({ quality, mode, budgetMs }) {
  const dir = mkdtempSync(join(tmpdir(), 'load-budget-'));
  const out = join(dir, 'profile.json');
  return new Promise((resolve) => {
    let stdout = '';
    let settled = false;
    const child = spawn(process.execPath, ['scripts/profile-load.mjs'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        THROTTLE: '1',
        BUDGET_MS: String(budgetMs),
        TIMEOUT_MS: process.env.TIMEOUT_MS ?? '480000',
        QUALITY: quality,
        MODE: mode,
        OUT: out,
      },
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
    });
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      let report = null;
      try {
        report = JSON.parse(readFileSync(out, 'utf8'));
      } catch {
        report = null;
      }
      rmSync(dir, { recursive: true, force: true });
      resolve(sampleFromOutputs({ report, stdout, exitCode, budgetMs }));
    };
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code));
  });
}

export async function measureScenario({ quality, mode, samples, budgetMs = BUDGET_MS }) {
  const rows = [];
  for (let index = 1; index <= samples; index++) {
    console.log(`\nload budget ${quality} ${mode} sample ${index}/${samples}`);
    let sample = await runProfile({ quality, mode, budgetMs });
    if (sample.crashed) {
      console.error(`load budget ${quality} ${mode} sample ${index} produced no profile; retrying once`);
      await releasePreview();
      sample = await runProfile({ quality, mode, budgetMs });
    }
    sample.index = index;
    rows.push(sample);
    console.log(formatSampleLine({ quality, mode }, sample));
    await releasePreview();
  }
  return rows;
}

async function main() {
  const samples = Number(process.env.SAMPLES ?? 10);
  if (!Number.isInteger(samples) || samples < 1) {
    throw new Error(`SAMPLES must be a positive integer, got ${process.env.SAMPLES}`);
  }
  const quality = process.env.QUALITY;
  const mode = process.env.MODE;
  if (Boolean(quality) !== Boolean(mode)) {
    throw new Error('Set both QUALITY and MODE, or neither');
  }
  const scenarios = quality
    ? [{ quality, mode }]
    : [{ quality: 'medium', mode: 'cine' }, { quality: 'high', mode: 'fly' }];
  let head = null;
  let mainSha = null;
  try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    mainSha = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
  } catch {
    head = null;
    mainSha = null;
  }
  const reports = [];
  for (const scenario of scenarios) {
    const rows = await measureScenario({ ...scenario, samples, budgetMs: BUDGET_MS });
    const summary = summarizeSamples(rows);
    console.log(formatSummaryLine(scenario, summary));
    reports.push({
      scenario: `${scenario.quality} ${scenario.mode}`,
      head,
      main: mainSha,
      budgetMs: BUDGET_MS,
      ...summary,
      samples: rows,
    });
  }
  const outPath = process.env.SAMPLE_OUT ?? '/tmp/load-sample.json';
  writeFileSync(outPath, JSON.stringify(reports, null, 2));
  console.log(`wrote ${outPath}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = ['### Cold-load sample', ''];
    for (const report of reports) {
      lines.push(`- **${report.scenario}** min ${formatMs(report.min)} / median ${formatMs(report.median)} / max ${formatMs(report.max)} ms (n=${report.valid}/${report.n})`);
      lines.push(`  - values: ${report.values.map((value) => formatMs(value)).join(', ')}`);
    }
    if (mainSha) lines.push('', `Measured profile-load against main \`${mainSha}\`.`);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
  const incomplete = reports.some((report) => report.valid === 0);
  if (incomplete) process.exit(1);
}

if (isDirectRun(import.meta.url)) {
  await main();
}
