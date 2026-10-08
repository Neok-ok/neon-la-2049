// Pure module (worker-safe). Converts between WGS84 lat/lon and local world meters.
import layoutJson from '../data/city-layout.json';

const LAT0 = layoutJson.meta.origin.lat;
const LON0 = layoutJson.meta.origin.lon;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);

/** Returns [x, z] in meters (+X east, +Z south). */
export function geoToLocal(lat: number, lon: number): [number, number] {
  return [(lon - LON0) * M_PER_DEG_LON, (LAT0 - lat) * M_PER_DEG_LAT];
}

export function localToGeo(x: number, z: number): [number, number] {
  return [LAT0 - z / M_PER_DEG_LAT, LON0 + x / M_PER_DEG_LON];
}

/** Compass bearing (0 = north, 90 = east) -> unit vector in local XZ. */
export function bearingToDir(bearingDeg: number): [number, number] {
  const b = (bearingDeg * Math.PI) / 180;
  return [Math.sin(b), -Math.cos(b)];
}

/** Rotation about +Y (three.js convention) that maps local +Z-forward boxes to a compass bearing grid. */
export function bearingToYaw(bearingDeg: number): number {
  return (-bearingDeg * Math.PI) / 180;
}
