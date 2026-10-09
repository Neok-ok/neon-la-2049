// Interior plans are plain data. District code builds them; InteriorSystem turns them into meshes.
// Nothing here imports three.js, so a template can be placed and extended without a scene.

export type RGB = [number, number, number];

/** 0 low, 1 medium, 2 high, 3 ultra. */
export type InteriorDetail = 0 | 1 | 2 | 3;

/**
 * Oriented box. Yaw matches a building: local +X is (cos yaw, −sin yaw) on the ground,
 * local +Z is (sin yaw, cos yaw). Same frame as GeoWriter and CityQuery colliders.
 */
export interface OrientedBox {
  x: number;
  z: number;
  y0: number;
  y1: number;
  hw: number;
  hd: number;
  yaw: number;
}

export interface InteriorBox {
  /** Centre XZ, bottom Y. */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw?: number;
  color: RGB;
  emissive?: RGB;
  /** −1 stays steady. ≥ 0 flickers; the value is the phase. */
  flick?: number;
  /** Omitted when the live tier is coarser. Default 0 (always). */
  detail?: number;
}

export interface InteriorLight {
  x: number;
  y: number;
  z: number;
  color: RGB;
  /** Bake multiplier. These are not scene lights, so they never enter the city shader. */
  intensity: number;
  range: number;
}

export interface InteriorPortal {
  /** Centre of the quad. */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  /** Quad faces local +Z before this yaw. */
  yaw?: number;
}

export interface InteriorCollider {
  x: number;
  z: number;
  hw: number;
  hd: number;
  y0: number;
  top: number;
  yaw?: number;
}

export interface OpenSky {
  x: number;
  z: number;
  yaw: number;
  hw: number;
  hd: number;
  y0: number;
  y1: number;
}

export interface DoorVolume {
  id: string;
  box: OrientedBox;
  /**
   * Opens onto the city. While a walker is inside an exterior door the city stays
   * drawn, so the threshold does not swap to the portal card mid-step.
   * A door without this flag connects two interiors.
   */
  exterior?: boolean;
}

export interface InteriorBuild {
  boxes: InteriorBox[];
  lights: InteriorLight[];
  ambient: RGB;
  portals: InteriorPortal[];
  /** Local rain while the city is hidden. Omitted on the low tier. */
  openSky?: OpenSky;
}

/**
 * Stand in `door` and the walker is moved to `to` / `toDoor`.
 * A fade, not a moving mesh: the car at each stop is its own interior.
 * Nested rooms are still not a portal chain.
 */
export interface InteriorRide {
  door: string;
  to: string;
  toDoor: string;
  /** Seconds in the door before the fade. Default 0.8. */
  dwell?: number;
}

export interface InteriorSpec {
  id: string;
  volume: OrientedBox;
  doors: DoorVolume[];
  /** Call panels. The system fades, then the app moves the walker. */
  rides?: InteriorRide[];
  /**
   * 0..1 quiet sine under the muffled bed while this interior is occluded.
   * One oscillator for the whole city. Default 0.
   */
  hum?: number;
  /** Other interiors that stay in the frame while this one is active. */
  links?: string[];
  /** Landmark group names kept when the rest of the city is hidden. */
  keepLandmarks?: string[];
  /** Draw it from the street when the player is near. Default true. */
  showFromOutside?: boolean;
  /** Mount distance in metres. Default 72. Unmount is a little farther. */
  streamRadius?: number;
  /** 0..1 muffled rain and city bed once the walker is fully inside. Default 0.85. */
  muffle?: number;
  colliders?: InteriorCollider[];
  build: (detail: InteriorDetail) => InteriorBuild;
  /** True while this interior's mesh is in the frame. Hide a duplicate shell here. */
  onShown?: (shown: boolean) => void;
}

export interface PlaceFrame {
  x: number;
  y: number;
  z: number;
  yaw: number;
}
