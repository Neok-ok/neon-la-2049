/**
 * One small trim sheet for door leaves and stair nosings.
 *
 * Modular kits often share a trim atlas so a repeated door or tread does not
 * need its own texture. This sheet is painted here, in metres of UV, and is
 * not a downloaded asset. Low detail skips the leaf; the opening metres live
 * on the wall either way.
 */
import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshStandardNodeMaterial,
  SRGBColorSpace,
  BoxGeometry,
  Group,
} from 'three/webgpu';
import { DOUBLE_DOOR_W, DOOR_H, type ArchDetail } from './scale';

let material: MeshStandardNodeMaterial | null = null;

function paint(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('arch trim canvas');
  g.fillStyle = '#3a2c22';
  g.fillRect(0, 0, 128, 128);
  // Door panel in the left half, stair nosing stripe across the bottom.
  g.strokeStyle = '#6a5344';
  g.lineWidth = 6;
  g.strokeRect(10, 8, 48, 112);
  g.strokeRect(18, 16, 32, 46);
  g.strokeRect(18, 68, 32, 44);
  g.fillStyle = '#c4b4a4';
  g.fillRect(0, 112, 128, 16);
  g.fillStyle = '#2a241e';
  g.fillRect(64, 0, 64, 112);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function getArchTrimMaterial(): MeshStandardNodeMaterial {
  if (material) return material;
  const map = paint();
  material = new MeshStandardNodeMaterial({
    map,
    roughness: 0.72,
    metalness: 0.04,
  });
  material.name = 'ArchTrim';
  return material;
}

/**
 * A leaf parked open against the strike side so the centre of the opening
 * stays clear for a 0.32 m walker radius. Full detail only.
 */
export function openDoorLeaf(
  detail: ArchDetail,
  width = DOUBLE_DOOR_W,
  height = DOOR_H,
): Mesh | null {
  if (detail !== 'full') return null;
  const leafW = Math.min(0.9, width * 0.48);
  const geo = new BoxGeometry(leafW, height - 0.08, 0.045);
  geo.translate(leafW / 2, (height - 0.08) / 2, 0);
  const mesh = new Mesh(geo, getArchTrimMaterial());
  mesh.name = 'arch-door-leaf';
  // Swung toward the jamb, about 70°, clear of the walking line.
  mesh.rotation.y = 1.15;
  return mesh;
}

/** Nosing strip. Medium and full. The tread box underneath is the metre. */
export function nosingStrip(detail: ArchDetail, tread: number, width: number): Mesh | null {
  if (detail === 'low') return null;
  const geo = new BoxGeometry(width, 0.025, Math.min(0.04, tread * 0.15));
  const mesh = new Mesh(geo, getArchTrimMaterial());
  mesh.name = 'arch-nosing';
  return mesh;
}

/** Group helper so a caller can drop a null leaf without a branch. */
export function archGroup(name: string, parts: Array<Mesh | null>): Group | null {
  const live = parts.filter((p): p is Mesh => !!p);
  if (!live.length) return null;
  const g = new Group();
  g.name = name;
  g.add(...live);
  return g;
}
