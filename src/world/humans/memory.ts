// Resident bytes for the human kit. One instanced crowd mesh, one bone palette,
// one atlas. The dancer hero is a second mesh only while medium+ keeps it.
// Palette files stay raw: they are uint16 pairs, and a compressor would move the bones.
import { crowdTextureMemory } from './crowdRig';
import { dancerTextureMemory } from './dancerHero';

export interface HumanMemory {
  tier: string;
  crowdGeomBytes: number;
  crowdTriangles: number;
  dancerGeomBytes: number;
  dancerTriangles: number;
  crowdPaletteBytes: number;
  dancerPaletteBytes: number;
  atlasBytes: number;
  atlasKind: 'ktx2' | 'png' | 'none';
  maskBytes: number;
  maskKind: 'ktx2' | 'png' | 'none';
  instanceBytes: number;
  totalBytes: number;
}

export function humanMemory(input: {
  tier: string;
  crowdGeomBytes: number;
  crowdTriangles: number;
  dancerGeomBytes: number;
  dancerTriangles: number;
  instanceBytes: number;
}): HumanMemory {
  const crowd = crowdTextureMemory();
  const dancer = dancerTextureMemory();
  const totalBytes = input.crowdGeomBytes
    + input.dancerGeomBytes
    + crowd.paletteBytes
    + dancer.paletteBytes
    + crowd.atlasBytes
    + dancer.maskBytes
    + input.instanceBytes;
  return {
    tier: input.tier,
    crowdGeomBytes: input.crowdGeomBytes,
    crowdTriangles: input.crowdTriangles,
    dancerGeomBytes: input.dancerGeomBytes,
    dancerTriangles: input.dancerTriangles,
    crowdPaletteBytes: crowd.paletteBytes,
    dancerPaletteBytes: dancer.paletteBytes,
    atlasBytes: crowd.atlasBytes,
    atlasKind: crowd.atlasKind,
    maskBytes: dancer.maskBytes,
    maskKind: dancer.maskKind,
    instanceBytes: input.instanceBytes,
    totalBytes,
  };
}
