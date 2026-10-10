// Hollywood Entertainment Strip. The Stage 1 polygon, bearing and block stay.
// The archetype id does not: `entertainment` is the unused Stage 1 body.
import { localToGeo } from '../../world/geo';
import type { FaceDir } from '../../world/fabric/types';

export const BEARING = 0;
export const BLOCK_A = 160;
export const BLOCK_B = 90;
export const STREET = 22;
/**
 * Driving line, metres from the centreline. A 22 m street.
 * Stays above 5 m so the mix is cars, not rickshaws.
 */
export const LANE = 6.4;
/** Office module inside BIBLE §4 (4.0–5.5 m). Roofs are whole floors of this. */
export const FLOOR = 4.4;

export const LATTICE = {
  i0: 19,
  i1: 40,
  j0: -140,
  j1: -27,
  prefix: 'hw',
  id: 'hollywood-streets',
} as const;

/**
 * East-west boulevard, street-line index along A.
 * Block `STRIP_LINE - 1` faces it on `a+`. Block `STRIP_LINE` faces it on `a-`.
 * North of this line the ground rises into the hills.
 */
export const STRIP_LINE = 33;

/** Arcade lobby. South face of this block, centred on the boulevard. */
export const LOBBY_I = 33;
export const LOBBY_J = -100;

/**
 * Hillside wordmark. Block centre on the northwest slope, ground about 86 m.
 * The boulevard is about a kilometre south, down the cross street at this j.
 */
export const SIGN_I = 39;
export const SIGN_J = -129;

/** j values kept free of entertainment towers so the wordmark stays in the street slot. */
export const SIGN_CLEAR_J0 = -132;
export const SIGN_CLEAR_J1 = -124;

export const ARCHETYPE = 'hollywood-strip';

export function stripFace(i: number): FaceDir | null {
  if (i === STRIP_LINE) return 'a-';
  if (i === STRIP_LINE - 1) return 'a+';
  return null;
}

export function streetNode(i: number, j: number): { x: number; z: number } {
  return { x: j * BLOCK_B, z: -i * BLOCK_A };
}

export function blockCenter(i: number, j: number): { x: number; z: number } {
  return { x: (j + 0.5) * BLOCK_B, z: -(i + 0.5) * BLOCK_A };
}

export function indexOf(cx: number, cz: number): { i: number; j: number } {
  return {
    i: Math.round(-cz / BLOCK_A - 0.5),
    j: Math.round(cx / BLOCK_B - 0.5),
  };
}

/** South face of the lobby block, on the boulevard wall. */
export function lobbyDoor(): { x: number; y: number; z: number; lat: number; lon: number } {
  const c = blockCenter(LOBBY_I, LOBBY_J);
  const s = -(BLOCK_A - STREET) / 2;
  const z = c.z - s;
  const [lat, lon] = localToGeo(c.x, z);
  return { x: c.x, y: 0, z, lat, lon };
}

export function signSite(): { x: number; z: number; lat: number; lon: number } {
  const c = blockCenter(SIGN_I, SIGN_J);
  const [lat, lon] = localToGeo(c.x, c.z);
  return { x: c.x, z: c.z, lat, lon };
}

/** Hero hologram anchors. North curb of the boulevard, facing south. */
export const HOLO_J = [-128, -120, -104, -72, -56, -44] as const;

export function holoAnchor(j: number): { x: number; z: number } {
  const n = streetNode(STRIP_LINE, j);
  return { x: n.x, z: n.z - 8.6 };
}
