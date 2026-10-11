// Print sidewalk, clearance and per-tier chunk memory. Bundles the pure road modules.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rolldown = resolve(root, 'node_modules/.bin/rolldown');
const out = '/tmp/nla-road-report.mjs';

await new Promise((resolveRun, reject) => {
  const child = spawn(rolldown, ['src/roads/report.ts', '-o', out, '-f', 'esm', '-p', 'node'], { cwd: root, stdio: 'inherit' });
  child.on('exit', (code) => (code === 0 ? resolveRun() : reject(new Error(`rolldown exited ${code}`))));
});

const mod = await import(`${out}?t=${Date.now()}`);
console.log(mod.roadReportText());
