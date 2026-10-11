// Bake the window-room and sign atlases to UASTC KTX2.
// Window bytes are deterministic. Sign pixels are painted with the same canvas
// routine the runtime uses, in headless Chrome, so the Latin font matches.
// Sign files are Y-flipped to match CanvasTexture's default flipY. Window files
// are not: the data texture keeps row 0 at v = 0.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
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
    uastcLDRQualityLevel: 3,
    imageDecoder: async () => ({ width, height, data: bytes }),
    ...options,
  });
}

async function windowBytes() {
  const out = '/tmp/nla-window-atlas.mjs';
  await run(rolldown, ['src/world/windows/atlasImage.ts', '-o', out, '-f', 'esm', '-p', 'node']);
  const mod = await import(`${out}?t=${Date.now()}`);
  const data = mod.windowAtlasBytes();
  return { data, width: mod.ATLAS_W, height: mod.ATLAS_H };
}

async function signPixels() {
  const out = '/tmp/nla-sign-paint.js';
  await run(rolldown, ['src/world/materials/signPaint.ts', '-o', out, '-f', 'iife', '-n', 'SignPaint', '-p', 'browser']);
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(out, 'utf8');
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>sign</title>');
    await page.addScriptTag({ content: src });
    const b64 = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      globalThis.SignPaint.paintSignAtlas(canvas);
      const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const bytes = new Uint8Array(image.data.buffer);
      const blob = new Blob([bytes]);
      const dataUrl = await new Promise((resolveUrl, rejectUrl) => {
        const reader = new FileReader();
        reader.onload = () => resolveUrl(reader.result);
        reader.onerror = () => rejectUrl(reader.error);
        reader.readAsDataURL(blob);
      });
      return { dataUrl, width: canvas.width, height: canvas.height };
    });
    const comma = b64.dataUrl.indexOf(',');
    const raw = Buffer.from(b64.dataUrl.slice(comma + 1), 'base64');
    return { data: new Uint8Array(raw), width: b64.width, height: b64.height };
  } finally {
    await browser.close();
  }
}

const outDir = resolve(root, 'src/assets');
await mkdir(outDir, { recursive: true });

const win = await windowBytes();
const winKtx = await encodeRaw(win.data, win.width, win.height, {
  isPerceptual: false,
  isSetKTX2SRGBTransferFunc: false,
  isYFlip: false,
});
await writeFile(resolve(outDir, 'window-rooms.ktx2'), winKtx);
console.log(`window-rooms.ktx2 ${win.width}x${win.height} ${winKtx.byteLength} bytes`);

const sign = await signPixels();
if (sign.data.byteLength !== sign.width * sign.height * 4) {
  throw new Error(`sign rgba ${sign.data.byteLength} != ${sign.width}x${sign.height}`);
}
const signKtx = await encodeRaw(sign.data, sign.width, sign.height, {
  isPerceptual: true,
  isSetKTX2SRGBTransferFunc: true,
  isYFlip: true,
});
await writeFile(resolve(outDir, 'sign-atlas.ktx2'), signKtx);
console.log(`sign-atlas.ktx2 ${sign.width}x${sign.height} ${signKtx.byteLength} bytes`);
