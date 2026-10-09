export { registerInterior, allInteriors } from './api';
export { interiorDetail } from './detail';
export { buildCorridorRoom } from './template';
export type { CorridorRoomOpts, CorridorRoomPlan, CorridorRoomSize } from './template';
export { InteriorSystem } from './system';
export type { ExteriorHosts, InteriorStats } from './system';
export { placeBox, placeCollider, placeInterior, placeLight, placePortal, placeVolume, xformXZ } from './xform';
export type {
  DoorVolume, InteriorBox, InteriorBuild, InteriorCollider, InteriorDetail, InteriorLight, InteriorPortal,
  InteriorSpec, OpenSky, OrientedBox, PlaceFrame, RGB,
} from './types';
