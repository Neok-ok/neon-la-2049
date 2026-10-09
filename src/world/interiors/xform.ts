import type {
  InteriorBox, InteriorBuild, InteriorCollider, InteriorLight, InteriorPortal, OpenSky, OrientedBox, PlaceFrame, RGB,
} from './types';

export function xformXZ(f: PlaceFrame, lx: number, lz: number): [number, number] {
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
}

export function placeBox(f: PlaceFrame, b: InteriorBox): InteriorBox {
  const [x, z] = xformXZ(f, b.x, b.z);
  return { ...b, x, y: f.y + b.y, z, yaw: f.yaw + (b.yaw ?? 0) };
}

export function placeLight(f: PlaceFrame, l: InteriorLight): InteriorLight {
  const [x, z] = xformXZ(f, l.x, l.z);
  return { ...l, x, y: f.y + l.y, z };
}

export function placePortal(f: PlaceFrame, p: InteriorPortal): InteriorPortal {
  const [x, z] = xformXZ(f, p.x, p.z);
  return { ...p, x, y: f.y + p.y, z, yaw: f.yaw + (p.yaw ?? 0) };
}

export function placeCollider(f: PlaceFrame, c: InteriorCollider): InteriorCollider {
  const [x, z] = xformXZ(f, c.x, c.z);
  return { ...c, x, z, y0: f.y + c.y0, top: f.y + c.top, yaw: f.yaw + (c.yaw ?? 0) };
}

export function placeVolume(
  f: PlaceFrame, lx: number, lz: number, hw: number, hd: number, y0: number, y1: number,
): OrientedBox {
  const [x, z] = xformXZ(f, lx, lz);
  return { x, z, hw, hd, y0: f.y + y0, y1: f.y + y1, yaw: f.yaw };
}

export function placeInterior(f: PlaceFrame, src: {
  boxes: InteriorBox[];
  lights: InteriorLight[];
  portals: InteriorPortal[];
  ambient: RGB;
  openSky?: { x: number; z: number; hw: number; hd: number; y0: number; y1: number };
}): InteriorBuild {
  let openSky: OpenSky | undefined;
  if (src.openSky) {
    const [x, z] = xformXZ(f, src.openSky.x, src.openSky.z);
    openSky = {
      x, z, yaw: f.yaw, hw: src.openSky.hw, hd: src.openSky.hd,
      y0: f.y + src.openSky.y0, y1: f.y + src.openSky.y1,
    };
  }
  return {
    boxes: src.boxes.map((b) => placeBox(f, b)),
    lights: src.lights.map((l) => placeLight(f, l)),
    portals: src.portals.map((p) => placePortal(f, p)),
    ambient: src.ambient,
    openSky,
  };
}
