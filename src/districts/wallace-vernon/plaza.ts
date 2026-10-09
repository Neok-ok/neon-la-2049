// North forecourt: stone court, a stair onto the Stage 3 plinth, a walled causeway,
// and a human door in front of the sealed portal. The Stage 3 pylons and glow stay.
import { Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3 } from 'three/webgpu';
import { GeoWriter, type FaceStyle } from '../../world/landmarks/GeoWriter';
import { getCityMaterial } from '../../world/materials/cityMaterial';
import { getPoolMaterial } from '../_shared/kit/materials';
import { Style } from '../../world/fabric/types';
import type { LandmarkCollider } from '../../world/landmarks/registry';
import { attachHaulers } from './haulers';
import {
  COURT, entranceMetrics, localToWorld, stairNorthZ,
} from './spec';

export interface PlazaFrame {
  x: number;
  z: number;
  y: number;
  yaw: number;
}

const STONE: FaceStyle = { style: Style.Monolith, lit: 0.09, tint: 0.74, seed: 0.17 };
const ROAD: FaceStyle = { style: Style.Solid, lit: 0, tint: 0.32, seed: 0.08 };
const WALL: FaceStyle = { style: Style.Monolith, lit: 0.04, tint: 0.55, seed: 0.29 };
const BRONZE: FaceStyle = { style: Style.Glow, lit: 0.42, tint: 1.08, seed: 0.51 };
const DARK: FaceStyle = { style: Style.Solid, lit: 0, tint: 0.28, seed: 0.12 };

function put(w: GeoWriter, f: PlazaFrame, lx: number, lz: number, y0: number, bw: number, bd: number, h: number, st: FaceStyle): void {
  const [x, z] = localToWorld(f.x, f.z, f.yaw, lx, lz);
  w.box(x, z, f.y + y0, bw, bd, h, f.yaw, st);
}

function col(f: PlazaFrame, lx: number, lz: number, hw: number, hd: number, y0: number, top: number): LandmarkCollider {
  const [x, z] = localToWorld(f.x, f.z, f.yaw, lx, lz);
  return { x, z, hw, hd, yaw: f.yaw, y0: f.y + y0, top: f.y + top };
}

function puddles(f: PlazaFrame, parent: Group): void {
  const spots: Array<[number, number, number, number]> = [
    [-40, -2048, 14, 7],
    [10, -2036, 22, 10],
    [-28, -2016, 16, 8],
    [55, -2064, 9, 11],
    [-90, -2010, 8, 5],
    [18, -1992, 16, 6],
    [120, -2055, 7, 8],
    [-150, -2028, 11, 6],
    [70, -2088, 6, 9],
  ];
  const geo = new PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const attr = new Float32Array(spots.length * 4);
  const mesh = new InstancedMesh(geo, getPoolMaterial(), spots.length);
  const m = new Matrix4();
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), f.yaw);
  const p = new Vector3();
  const s = new Vector3();
  for (let i = 0; i < spots.length; i++) {
    const [lx, lz, bw, bd] = spots[i]!;
    const [x, z] = localToWorld(f.x, f.z, f.yaw, lx, lz);
    mesh.setMatrixAt(i, m.compose(p.set(x, f.y + 0.16, z), q, s.set(bw, 1, bd)));
    attr.set([0.85, 0.48, 0.16, 1.4], i * 4);
  }
  geo.setAttribute('iLight', new InstancedBufferAttribute(attr, 4));
  mesh.name = 'wallace-puddles';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  parent.add(mesh);
}

/** Adds the plaza to `lod0` (it hides with the far pyramid) and returns walk colliders. */
export function buildPlaza(f: PlazaFrame, lod0: Mesh): { colliders: LandmarkCollider[] } {
  const w = new GeoWriter();
  const cols: LandmarkCollider[] = [];
  const e = entranceMetrics();
  const stairN = stairNorthZ();
  const g = new Group();
  g.name = 'wallace-plaza';

  // Walled causeway, 30 m clear, from the north apron to the court.
  const roadLen = COURT.roadNorth - COURT.roadSouth;
  const roadZ = (COURT.roadNorth + COURT.roadSouth) / 2;
  put(w, f, 0, roadZ, 0, COURT.roadHalf * 2, Math.abs(roadLen), 0.12, ROAD);
  cols.push(col(f, 0, roadZ, COURT.roadHalf, Math.abs(roadLen) / 2, 0, 0.12));
  for (const side of [-1, 1]) {
    const x = side * (COURT.roadHalf + COURT.wallT / 2);
    put(w, f, x, roadZ, 0, COURT.wallT, Math.abs(roadLen), COURT.wallH, WALL);
    cols.push(col(f, x, roadZ, COURT.wallT / 2, Math.abs(roadLen) / 2, 0, COURT.wallH));
    // Slim bronze bars on the wall, every 48 m.
    for (let z = COURT.roadSouth + 24; z > COURT.roadNorth + 10; z -= 48) {
      put(w, f, x - side * 0.85, z, 1.2, 0.28, 0.28, 5.4, BRONZE);
    }
  }
  // Gate at the north mouth. The lintel clears a truck.
  for (const side of [-1, 1]) {
    const x = side * 12;
    put(w, f, x, COURT.roadNorth + 2, 0, 3.2, 3.2, 14, WALL);
    cols.push(col(f, x, COURT.roadNorth + 2, 1.6, 1.6, 0, 14));
    put(w, f, x, COURT.roadNorth + 3.8, 2, 0.35, 0.35, 8, BRONZE);
  }
  put(w, f, 0, COURT.roadNorth + 2, 6.4, 26, 1.4, 1.1, WALL);
  cols.push(col(f, 0, COURT.roadNorth + 2, 13, 0.7, 6.4, 7.5));

  // Open court. Monolith joints come from the city material, so one slab is enough.
  const courtSouth = stairN;
  const courtZ = (COURT.courtNorth + courtSouth) / 2;
  const courtD = Math.abs(COURT.courtNorth - courtSouth);
  put(w, f, 0, courtZ, 0, COURT.courtHalfW * 2, courtD, 0.12, STONE);
  cols.push(col(f, 0, courtZ, COURT.courtHalfW, courtD / 2, 0, 0.12));
  // Dim processional line, not a sign.
  put(w, f, 0, courtZ, 0.12, 1.6, courtD * 0.92, 0.06, BRONZE);

  // Security line with a walk-through gap.
  for (const side of [-1, 1]) {
    const x = side * 88;
    put(w, f, x, -2048, 0.12, 160, 0.7, 1.05, DARK);
    cols.push(col(f, x, -2048, 80, 0.35, 0.12, 1.17));
    put(w, f, side * 6.4, -2048, 0.12, 0.45, 0.45, 2.4, BRONZE);
  }

  // Stair onto the existing plinth. Eight risers of 0.375 m.
  for (let i = 0; i < COURT.stairN; i++) {
    const y0 = i * COURT.stairRise;
    const south = e.plinthNorth - (COURT.stairN - 1 - i) * COURT.stairTread;
    const zc = south - COURT.stairTread / 2;
    put(w, f, 0, zc, y0, COURT.stairHalfW * 2, COURT.stairTread, COURT.stairRise, STONE);
    cols.push(col(f, 0, zc, COURT.stairHalfW, COURT.stairTread / 2, y0, y0 + COURT.stairRise));
  }
  // Flanking pylons at the foot of the stair and where the road opens.
  for (const [x, z, h] of [[62, stairN + 2, 16], [-62, stairN + 2, 16], [22, COURT.roadSouth - 6, 11], [-22, COURT.roadSouth - 6, 11]] as const) {
    put(w, f, x, z, 0, 2.6, 2.6, h, WALL);
    cols.push(col(f, x, z, 1.3, 1.3, 0, h));
    put(w, f, x, z - 1.4, 1.4, 0.22, 0.22, h * 0.55, BRONZE);
  }

  // Bridge at plinth height from the plinth to a human door in front of the portal.
  const bridgeZ = (e.plinthSouth + COURT.doorZ) / 2;
  const bridgeD = Math.abs(COURT.doorZ - e.plinthSouth);
  put(w, f, 0, bridgeZ, COURT.deckY - 0.32, COURT.bridgeHalfW * 2, bridgeD, 0.32, STONE);
  cols.push(col(f, 0, bridgeZ, COURT.bridgeHalfW, bridgeD / 2, COURT.deckY - 0.32, COURT.deckY));
  // Rails, low enough to see over, solid enough to collide.
  for (const side of [-1, 1]) {
    const x = side * (COURT.bridgeHalfW - 0.2);
    put(w, f, x, bridgeZ, COURT.deckY, 0.35, bridgeD, 1.05, WALL);
    cols.push(col(f, x, bridgeZ, 0.18, bridgeD / 2, COURT.deckY, COURT.deckY + 1.05));
  }
  // Door frame. The opening stays empty: the portal behind it stays sealed until the atrium door.
  for (const side of [-1, 1]) {
    const x = side * 1.7;
    put(w, f, x, COURT.doorZ, COURT.deckY, 0.7, 0.9, 3.4, WALL);
    cols.push(col(f, x, COURT.doorZ, 0.35, 0.45, COURT.deckY, COURT.deckY + 3.4));
  }
  put(w, f, 0, COURT.doorZ, COURT.deckY + 3.15, 4.1, 0.9, 0.55, WALL);
  cols.push(col(f, 0, COURT.doorZ, 2.05, 0.45, COURT.deckY + 3.15, COURT.deckY + 3.7));
  put(w, f, 1.05, COURT.doorZ - 0.48, COURT.deckY + 0.35, 0.08, 0.08, 2.15, BRONZE);

  const mesh = new Mesh(w.build(), getCityMaterial());
  mesh.name = 'wallace-plaza-mesh';
  g.add(mesh);
  puddles(f, g);
  lod0.add(g);

  const yRoad = f.y + 0.08;
  const north = localToWorld(f.x, f.z, f.yaw, 0, COURT.roadNorth + 18);
  const south = localToWorld(f.x, f.z, f.yaw, 0, COURT.roadSouth + 16);
  const sideX = Math.cos(f.yaw);
  const sideZ = -Math.sin(f.yaw);
  attachHaulers(g, [
    [north[0], yRoad, north[1]],
    [south[0], yRoad, south[1]],
    [north[0], yRoad, north[1]],
  ], [sideX, sideZ]);

  return { colliders: cols };
}
