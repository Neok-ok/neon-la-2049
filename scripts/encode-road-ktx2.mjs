// Bake the road trim, normal, marking and gantry atlases to UASTC KTX2.
// Row 0 of each buffer is the top of the image, so the files are Y-flipped
// the same way the runtime DataTexture sets flipY.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeToKTX2 } from 'ktx2-encoder';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rolldown = resolve(root, 'node_modules/.bin/rolldown');

function run(cmd, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolveRun() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function encodeRaw(bytes, width, height, options) {
  return encodeToKTX2(bytes, {
    isUASTC: true,
    isKTX2File: true,
    generateMipmap: false,
    needSupercompression: true,
    enableRDO: false,
    uastcLDRQualityLevel: 2,
    imageDecoder: async () => ({ width, height, data: bytes }),
    ...options,
  });
}

const out = '/tmp/nla-road-paint.mjs';
await run(rolldown, ['src/roads/paint.ts', '-o', out, '-f', 'esm', '-p', 'node']);
const mod = await import(`${out}?t=${Date.now()}`);

const jobs = [
  ['road-trim.ktx2', mod.trimBytes(), mod.TRIM, mod.TRIM, true],
  ['road-normal.ktx2', mod.normalBytes(), mod.TRIM, mod.TRIM, false],
  ['road-markings.ktx2', mod.markBytes(), mod.MARK, mod.MARK, true],
  ['road-signs.ktx2', mod.signBytes(), mod.SIGN_W, mod.SIGN_H, true],
];

const outDir = resolve(root, 'src/assets');
await mkdir(outDir, { recursive: true });
for (const [name, data, width, height, perceptual] of jobs) {
  if (data.byteLength !== width * height * 4) {
    throw new Error(`${name} rgba ${data.byteLength} != ${width}x${height}`);
  }
  const ktx = await encodeRaw(data, width, height, {
    isPerceptual: perceptual,
    isSetKTX2SRGBTransferFunc: perceptual,
    isYFlip: true,
  });
  await writeFile(resolve(outDir, name), ktx);
  console.log(`${name} ${width}x${height} ${ktx.byteLength} bytes`);
}
