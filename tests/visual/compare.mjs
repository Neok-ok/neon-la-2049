// Pixel diff against a committed baseline. AA pixels are ignored; everything else counts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

/**
 * @param {string} actualPath
 * @param {string} baselinePath
 * @param {string} diffPath
 * @param {{ threshold: number, maxRatio: number }} opts
 */
export function comparePng(actualPath, baselinePath, diffPath, opts) {
  const actual = PNG.sync.read(readFileSync(actualPath));
  const baseline = PNG.sync.read(readFileSync(baselinePath));
  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    return {
      ok: false,
      reason: 'size',
      mismatch: actual.width * actual.height,
      ratio: 1,
      width: actual.width,
      height: actual.height,
      baselineWidth: baseline.width,
      baselineHeight: baseline.height,
    };
  }
  const diff = new PNG({ width: actual.width, height: actual.height });
  const mismatch = pixelmatch(actual.data, baseline.data, diff.data, actual.width, actual.height, {
    threshold: opts.threshold,
    includeAA: false,
    alpha: 0.3,
    checkerboard: false,
    diffColor: [255, 40, 120],
  });
  mkdirSync(dirname(diffPath), { recursive: true });
  writeFileSync(diffPath, PNG.sync.write(diff));
  const ratio = mismatch / (actual.width * actual.height);
  return {
    ok: ratio <= opts.maxRatio,
    reason: ratio <= opts.maxRatio ? 'match' : 'diff',
    mismatch,
    ratio,
    width: actual.width,
    height: actual.height,
  };
}
