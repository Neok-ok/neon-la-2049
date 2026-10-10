// Standing spots a district already builds: a counter queue or a place under an awning.
// Pure data. The crowd mesh reads it. No new props.

export interface CrowdLifeSpot {
  x: number;
  z: number;
  /** Yaw for a mesh whose local +Z is its forward. */
  yaw: number;
  kind: 'queue' | 'awning';
  /** People in the group, clamped to 2–5 when the field places them. */
  n: number;
  /** Unit along the counter or the awning, used to space the group. */
  lx: number;
  lz: number;
}

/** `yawOut` is the direction from the counter into the street (local +Z of an awning). */
export function lifeSpot(
  x: number, z: number, yawOut: number, kind: 'queue' | 'awning', n: number,
): CrowdLifeSpot {
  const ox = Math.sin(yawOut);
  const oz = Math.cos(yawOut);
  return {
    x, z,
    yaw: kind === 'queue' ? Math.atan2(-ox, -oz) : yawOut,
    kind,
    n,
    lx: -oz,
    lz: ox,
  };
}
