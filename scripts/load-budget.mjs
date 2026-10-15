// Cold-load budget until the city is interactive.
// JavaScript in one task stays under 250 ms, and one task links at most four programs
// (a drawable's color pass, a depth pass, and a second material). The production
// bundle's first evaluation measures about 210 ms on this runner, so the ceiling
// sits just above that. A multi-program node build is still a failure.
// Driver link, uniform reflection, and draw time are subtracted via ?loadprobe=1.
// A 4× CPU throttle is not used.
// Requires dist/. Uses Playwright's Chromium unless CHROME is set.
import { spawn } from 'node:child_process';

const runs = [
  { QUALITY: 'medium', MODE: 'cine' },
  { QUALITY: 'high', MODE: 'fly' },
];

function runOne(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/profile-load.mjs'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        THROTTLE: '1',
        BUDGET_MS: '250',
        TIMEOUT_MS: process.env.TIMEOUT_MS ?? '480000',
        ...env,
      },
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`load budget failed for ${env.QUALITY} ${env.MODE} (exit ${code})`));
    });
  });
}

for (const env of runs) {
  console.log(`\nload budget ${env.QUALITY} ${env.MODE}`);
  await runOne(env);
}
console.log('load budget ok');
