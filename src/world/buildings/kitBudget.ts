// Byte sizes for the shared B1 kit. No Three.js imports: the chunk worker and the audit both use this.
// One 20-vertex box is cloned per instanced mesh so a chunk can dispose its copy on unload.
// Every tower in that mesh is a 96-byte instance, not its own vertex buffer.

/** x, y0, z, yaw, w, h, d, seed, style, lit, tint */
export const KIT_STRIDE = 11;

/** 20 vertices × (position 3 + normal 3 + facade 2 + face 1) floats, plus 30 uint16 indices. */
export const KIT_TEMPLATE_BYTES = 20 * 9 * 4 + 30 * 2;

/** Instance matrix (64) + bdata vec4 (16) + kit scale vec4 (16). */
export const KIT_INSTANCE_BYTES = 64 + 16 + 16;

/** These towers add no images. Windows and signs stay on the existing city and KTX2 atlases. */
export const KIT_TEXTURE_BYTES = 0;

export function kitMeshBytes(instances: number): number {
  if (instances <= 0) return 0;
  return KIT_TEMPLATE_BYTES + instances * KIT_INSTANCE_BYTES;
}

/** Five quads, matching the chunk mesher's box. */
export function kitTris(instances: number): number {
  return instances * 10;
}

/**
 * Facade coordinate in metres at one corner of the unit box.
 * Face 0..3 walk the walls in the same order as the chunk mesher. Face 4 is the roof.
 * `u` and `v` are 0..1 across that face. Kept in step with the kit branch of the city shader.
 */
export function kitFacadeUV(
  face: number, u: number, v: number, w: number, d: number, h: number, seed: number,
): [number, number] {
  if (face >= 4) return [500 - w / 2 + u * w, 500 - d / 2 + v * d];
  const u0 = 100 + seed * 1000;
  const offset = face === 0 ? 0 : face === 1 ? w : face === 2 ? w + d : 2 * w + d;
  const scale = face === 0 || face === 2 ? w : d;
  return [u0 + offset + u * scale, v * h];
}
