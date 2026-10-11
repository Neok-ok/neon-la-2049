// Fails if a memory-owned file constructs a GPU resource without the resource manager.
// The runtime hook is the real guard (`?memguard=1`). This scan keeps the owned
// files honest in CI, where the full city is not booted.
import { readFileSync } from 'node:fs';

const FILES = [
  'src/world/streaming/ChunkStreamer.ts',
  'src/world/streaming/hlod.ts',
  'src/world/landmarks/GeoWriter.ts',
  'src/world/interiors/geom.ts',
  'src/world/interiors/portal.ts',
  'src/world/interiors/rain.ts',
  'src/world/interiors/material.ts',
  'src/world/windows/atlas.ts',
  'src/world/materials/signAtlas.ts',
  'src/world/materials/cityMaterial.ts',
  'src/world/buildings/kitMesh.ts',
  'src/world/materials/signMaterial.ts',
  'src/roads/detail.ts',
  'src/roads/material.ts',
  'src/roads/textures.ts',
  'src/photo/lensNode.ts',
  'src/photo/pipeline.ts',
  'src/photo/playLens.ts',
  'src/vehicles/vehicleModels.ts',
];

const CONSTRUCT = /new\s+(BufferGeometry|DataTexture|CanvasTexture|CompressedTexture|WebGLRenderTarget|RenderTarget|MeshStandardNodeMaterial|MeshBasicNodeMaterial)\b/;

const bad = [];
for (const file of FILES) {
  const text = readFileSync(file, 'utf8');
  if (!CONSTRUCT.test(text)) continue;
  if (!text.includes('resources.')) bad.push(file);
}

if (bad.length) {
  console.error('GPU resources constructed outside ResourceManager:\n' + bad.join('\n'));
  process.exit(1);
}
console.log(`guard scan ok (${FILES.length} files)`);
