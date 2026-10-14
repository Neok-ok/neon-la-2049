// UASTC KTX2 for the shared human atlas and the dancer silhouette mask.
// Atlas rows stay put (runtime flipY false, skin in the top half of the file at v=0).
// The mask is Y-flipped so a compressed upload matches the PNG sampled with flipY true.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeToKTX2 } from 'ktx2-encoder';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'public/models/humans');

function rgba(pngName) {
  const py = spawnSync('python3', ['-c', `
from PIL import Image
import sys
im = Image.open(sys.argv[1]).convert('RGBA')
w, h = im.size
sys.stdout.buffer.write(w.to_bytes(4, 'little'))
sys.stdout.buffer.write(h.to_bytes(4, 'little'))
sys.stdout.buffer.write(im.tobytes())
`, resolve(dir, pngName)], { maxBuffer: 32 * 1024 * 1024 });
  if (py.status !== 0) {
    throw new Error(py.stderr?.toString() || `png ${pngName} failed`);
  }
  const buf = py.stdout;
  const width = buf.readUInt32LE(0);
  const height = buf.readUInt32LE(4);
  const data = new Uint8Array(buf.buffer, buf.byteOffset + 8, buf.byteLength - 8);
  if (data.byteLength !== width * height * 4) {
    throw new Error(`${pngName} rgba ${data.byteLength} != ${width}x${height}`);
  }
  return { data, width, height };
}

async function encode(pngName, ktxName, options) {
  const image = rgba(pngName);
  const ktx = await encodeToKTX2(image.data, {
    isUASTC: true,
    isKTX2File: true,
    generateMipmap: false,
    needSupercompression: true,
    enableRDO: false,
    uastcLDRQualityLevel: 3,
    imageDecoder: async () => image,
    ...options,
  });
  writeFileSync(resolve(dir, ktxName), ktx);
  const gpu = image.width * image.height;
  console.log(`${ktxName} ${image.width}x${image.height} file ${ktx.byteLength} gpu~${gpu} (8 bpp)`);
}

await encode('crowd-atlas.png', 'crowd-atlas.ktx2', {
  isPerceptual: true,
  isSetKTX2SRGBTransferFunc: true,
  isYFlip: false,
});
await encode('dancer-mask.png', 'dancer-mask.ktx2', {
  isPerceptual: false,
  isSetKTX2SRGBTransferFunc: false,
  isYFlip: true,
});
