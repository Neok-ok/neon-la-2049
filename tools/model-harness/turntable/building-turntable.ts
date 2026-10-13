// Landmark contact sheet, orthographic mask, and scale rig.
// Playwright screenshots #sheet. Film stills load from /harness-refs/ and stay gitignored.
import {
  ACESFilmicToneMapping, Box3, BoxGeometry, Color, DirectionalLight, DoubleSide, PointLight,
  FogExp2, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardNodeMaterial,
  OrthographicCamera, PerspectiveCamera, PlaneGeometry, Scene, SRGBColorSpace, Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import lapdSil from '../silhouettes/lapd.json';
import hallSil from '../silhouettes/hall.json';
import wallaceSil from '../silhouettes/wallace.json';

type Kind = 'lapd' | 'hall' | 'wallace';
type LightName = 'night' | 'rim' | 'studio';

type Bounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
type Silhouette = { kind: string; ppm: number; pad: number; bounds: Bounds; source?: string };

type Frame = { x0: number; x1: number; y0: number; y1: number; w: number; h: number };

type Shot = {
  label: string;
  light: LightName;
  angle: string;
  pose: (camera: PerspectiveCamera) => void;
};

type Panel = {
  id: 'side' | 'front' | 'top';
  x: number;
  y: number;
  w: number;
  h: number;
  note: string;
};

declare global {
  interface Window {
    __harness?: {
      done: boolean;
      error: string | null;
      size: { x: number; y: number; z: number } | null;
      tris: number;
      mode: string;
      tiles: { label: string; light: string; angle: string }[];
      panels: Panel[];
      scale: Record<string, number> | null;
      shot?: number;
      label?: string;
    };
    __harnessShow?: (index: number) => void;
  }
}

const SILS: Record<Kind, Silhouette> = {
  lapd: lapdSil as Silhouette,
  hall: hallSil as Silhouette,
  wallace: wallaceSil as Silhouette,
};

const REFS: Record<Kind, { file: string; caption: string }> = {
  lapd: {
    file: 'lapd-top.jpg',
    caption: '2049 overhead. The tower is the dark block. The bright lamps are a spinner.',
  },
  hall: {
    file: 'hall-night.jpg',
    caption: 'Los Angeles City Hall at night. The shaft is the 1928 tower.',
  },
  wallace: {
    file: 'wallace-bts.jpg',
    caption: 'Weta pyramid miniature. Dark stone and vertical joints.',
  },
};

const PERSON_M = 1.8;
const DOOR_H = 2.2;
const DOOR_W = 1.0;
const STOREY_M = 3.6;
const LANE_M = 3.5;
const RAIL_H = 1.05;

const params = new URLSearchParams(location.search);
const src = params.get('src') ?? 'lapd';
const title = params.get('title') ?? src;
const mode = params.get('mode') ?? 'sheet';
const blind = params.get('blind') === '1';

const TILE = 520;
const TILE_H = 680;
const REF_W = 340;
const CLOSE_W = 1280;
const CLOSE_H = 1024;

function parseSrc(value: string): { kind: Kind; legacy: boolean; url: string | null } {
  const legacy = value.startsWith('legacy:');
  const body = legacy ? value.slice('legacy:'.length) : value;
  const kind: Kind = body.includes('hall') ? 'hall' : body.includes('wallace') ? 'wallace' : 'lapd';
  if (legacy) return { kind, legacy, url: null };
  if (body.endsWith('.glb')) {
    return { kind, legacy, url: body.startsWith('/') ? body : `/${body.replace(/^\.\//, '')}` };
  }
  return { kind, legacy, url: `/models/landmarks/${kind}-high.glb` };
}

const target = parseSrc(src);

function frameOf(x0: number, x1: number, y0: number, y1: number, ppm: number): Frame {
  return {
    x0, x1, y0, y1,
    w: Math.max(1, Math.round((x1 - x0) * ppm)),
    h: Math.max(1, Math.round((y1 - y0) * ppm)),
  };
}

function frames(sil: Silhouette): { side: Frame; front: Frame; top: Frame } {
  const b = sil.bounds;
  const pad = sil.pad ?? 8;
  const ppm = sil.ppm;
  return {
    side: frameOf(-(b.maxZ + pad), -(b.minZ - pad), b.minY - pad, b.maxY + pad, ppm),
    front: frameOf(b.minX - pad, b.maxX + pad, b.minY - pad, b.maxY + pad, ppm),
    top: frameOf(-(b.maxZ + pad), -(b.minZ - pad), -(b.maxX + pad), -(b.minX - pad), ppm),
  };
}

function countTris(model: Group): number {
  let tris = 0;
  model.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    tris += g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
  });
  return Math.round(tris);
}

function paintWhite(model: Group): void {
  model.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const name = (!Array.isArray(mesh.material) ? mesh.material?.name : '')?.toLowerCase() ?? '';
    if (name.includes('light-')) {
      mesh.visible = false;
      return;
    }
    mesh.material = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide });
  });
}

function concrete(color: number, emissive = 0): MeshStandardNodeMaterial {
  return new MeshStandardNodeMaterial({
    color,
    roughness: 0.92,
    metalness: 0.02,
    emissive: emissive ? color : 0x000000,
    emissiveIntensity: emissive,
  });
}

function addBox(
  parent: Group, w: number, h: number, d: number, x: number, y: number, z: number, mat: MeshStandardNodeMaterial,
): void {
  const mesh = new Mesh(new BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y + h * 0.5, z);
  parent.add(mesh);
}

function legacyBuilding(kind: Kind): Group {
  const root = new Group();
  root.name = `legacy-${kind}`;
  const stone = concrete(0x6a6e74);
  const dark = concrete(0x2a2e34);
  const cold = concrete(0x8aa4b8, 1.4);
  const warm = concrete(0xc4843a, 2.2);
  if (kind === 'lapd') {
    addBox(root, 86, 18, 118, 0, 0, 0, stone);
    addBox(root, 72, 136, 100, 0, 18, 0, stone);
    addBox(root, 73.2, 4.2, 101.2, 0, 58, 0, dark);
    addBox(root, 73.6, 4.6, 101.6, 0, 108, 0, dark);
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      addBox(root, 72 + (132 - 72) * t, 7.6, 100 + (165 - 100) * t, 0, 154 + i * 7.6, 0, i % 2 ? dark : stone);
    }
    addBox(root, 1.4, 7.3, 1.4, 0, 215.6, 0, dark);
    for (const [x, z] of [[-28, -38], [28, -38], [-28, 38], [28, 38]] as const) {
      addBox(root, 22, 0.95, 22, x, 216, z, dark);
      addBox(root, 18, 0.2, 0.4, x, 216.95, z - 10, warm);
    }
    addBox(root, 30, 5.1, 9.2, 0, 0.18, -63.6, dark);
    addBox(root, 42, 1.6, 0.35, 0, 8.4, -59.2, cold);
    return root;
  }
  if (kind === 'hall') {
    addBox(root, 92, 28, 62, 0, 0, 0, dark);
    addBox(root, 34, 72, 34, 0, 28, 0, stone);
    addBox(root, 26, 14, 26, 0, 100, 0, stone);
    const y0 = 114;
    const y1 = 132;
    const w0 = 24;
    const w1 = 4.2;
    for (let i = 0; i < 5; i++) {
      const ya = y0 + (y1 - y0) * (i / 5);
      const w = w0 + (w1 - w0) * (i / 5);
      addBox(root, w, (y1 - y0) / 5, w, 0, ya, 0, stone);
    }
    addBox(root, 3.2, 6, 3.2, 0, 132, 0, warm);
    addBox(root, 22, 3.5, 6, 0, 0.16, 39.3, dark);
    return root;
  }
  const base = 3200;
  const top = 420;
  const steps = 21;
  const stepH = (3500 - 210) / steps;
  for (let i = 0; i < steps; i++) {
    const w = base + (top - base) * (i / steps);
    addBox(root, w, stepH * 0.96, w, 0, i * stepH, 0, i % 3 === 0 ? dark : stone);
  }
  addBox(root, 210, 80, 210, 0, 3290, 0, warm);
  addBox(root, 12, 110, 12, 0, 3500, 0, dark);
  addBox(root, 260, 180, 18, 0, 8, -1602, warm);
  addBox(root, 634, 3, 320, 0, 0, -1800, dark);
  return root;
}

async function loadGlb(url: string): Promise<Group> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  await MeshoptDecoder.ready;
  const gltf = await loader.loadAsync(url);
  gltf.scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) {
      const name = (mat.name || '').toLowerCase();
      const std = mat as MeshStandardNodeMaterial;
      if (target.kind === 'lapd' || target.kind === 'wallace') std.side = DoubleSide;
      if (mesh.geometry.getAttribute('color')) std.vertexColors = true;
      if (name.includes('deck-stone')) {
        std.color = new Color(0.68, 0.72, 0.78);
        std.map = null;
        std.normalMap = null;
        std.roughnessMap = null;
        std.roughness = 0.36;
        std.metalness = 0.48;
        std.vertexColors = false;
      }
      if (name.includes('light-') && std.emissive) {
        const cap = name.includes('white') ? 0.55 : 0.75;
        std.emissiveIntensity = Math.min(std.emissiveIntensity ?? cap, cap);
        const e = std.emissive;
        e.r = Math.min(e.r, 1);
        e.g = Math.min(e.g, 1);
        e.b = Math.min(e.b, 1);
      }
      if (name.includes('portal-glow') && std.emissive) {
        // Warm throat inside the stone mouth. Full white reads as a blank panel.
        std.color = new Color(0.08, 0.028, 0.01);
        std.emissive = new Color(0.72, 0.3, 0.08);
        std.emissiveIntensity = 1.35;
        std.roughness = 1;
        std.metalness = 0;
      }
      if (name.includes('mouth-stone')) {
        std.color = new Color(0.14, 0.16, 0.2);
        std.emissive = new Color(0.2, 0.24, 0.3);
        std.emissiveIntensity = 0.9;
        std.roughness = 0.9;
        std.metalness = 0;
      }
      if (name.includes('metal')) {
        std.metalness = 0.56;
        std.roughness = 0.48;
        std.color = new Color(0.22, 0.24, 0.26);
      }
      if (name.includes('glass-warm')) {
        std.transparent = false;
        std.opacity = 1;
        std.color = new Color(0.07, 0.045, 0.025);
        std.emissive = new Color(0.62, 0.36, 0.12);
        std.emissiveIntensity = 0.42;
        std.roughness = 0.45;
        std.metalness = 0.02;
      } else if (name.includes('glass')) {
        std.transparent = false;
        std.opacity = 1;
        std.color = new Color(0.02, 0.02, 0.022);
        std.emissive = new Color(0.03, 0.025, 0.02);
        std.emissiveIntensity = 0.04;
        std.roughness = 0.5;
        std.metalness = 0.06;
      }
    }
  });
  return gltf.scene;
}

function aim(
  camera: PerspectiveCamera, dir: Vector3, look: Vector3, radius: number, fov: number, up?: Vector3,
): void {
  camera.fov = fov;
  camera.up.copy(up ?? new Vector3(0, 1, 0));
  const dist = radius / Math.sin((fov * Math.PI) / 360);
  camera.position.copy(look).addScaledVector(dir.clone().normalize(), dist);
  camera.near = Math.max(0.05, dist / 400);
  camera.far = dist + radius * 12;
  camera.lookAt(look);
  camera.updateProjectionMatrix();
}

function entranceSign(kind: Kind): number {
  return kind === 'hall' ? 1 : -1;
}

function shotsFor(kind: Kind, box: Box3): Shot[] {
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const radius = size.length() * 0.55;
  const sign = entranceSign(kind);
  const front = new Vector3(0.15, 0.22, sign);
  const quarter = kind === 'lapd'
    ? new Vector3(0.72, 0.26, 0.55)
    : new Vector3(0.85, 0.32, sign * 0.7);
  const side = new Vector3(1, 0.16, 0.04);
  const above = new Vector3(0.04, 1, sign * 0.08);
  const upTop = new Vector3(0, 0, sign);
  const doorY = kind === 'lapd' ? 36 : kind === 'hall' ? 16 : 120;
  const doorZ = kind === 'lapd' ? -78 : kind === 'hall' ? 42 : -1860;
  const door = new Vector3(0, doorY, doorZ);
  const doorRadius = kind === 'wallace' ? 780 : kind === 'lapd' ? 92 : 42;
  const crownY = kind === 'wallace' ? 3360 : kind === 'hall' ? 118 : 186;
  const crown = new Vector3(0, crownY, 0);
  const crownRadius = kind === 'wallace' ? 380 : kind === 'hall' ? 32 : 62;
  const wall = kind === 'lapd'
    ? new Vector3(-18, 78, -51)
    : kind === 'hall'
      ? new Vector3(6, 62, 18)
      : new Vector3(780, 640, -1420);
  const wallRadius = kind === 'wallace' ? 70 : 14;
  const plan = Math.max(size.x, size.z) * 0.62;
  const whole = (dir: Vector3, fov = 28, up?: Vector3, span = radius) => (camera: PerspectiveCamera) => {
    aim(camera, dir, center, span, fov, up);
  };
  return [
    { label: 'night · three-quarter', light: 'night', angle: '34', pose: whole(quarter) },
    { label: 'night · entrance', light: 'night', angle: 'entrance', pose: (c) => aim(c, kind === 'wallace' ? new Vector3(0.22, 0.05, sign * 0.97) : front, kind === 'wallace' ? new Vector3(0, 46, -1564) : door, kind === 'wallace' ? 248 : doorRadius, kind === 'wallace' ? 36 : 34) },
    { label: 'night · side', light: 'night', angle: 'side', pose: whole(side) },
    { label: 'night · top', light: 'night', angle: 'top', pose: whole(above, 26, upTop, plan) },
    { label: 'rim · three-quarter', light: 'rim', angle: '34', pose: whole(quarter) },
    { label: 'rim · entrance', light: 'rim', angle: 'entrance', pose: (c) => aim(c, kind === 'wallace' ? new Vector3(0.22, 0.05, sign * 0.97) : front, kind === 'wallace' ? new Vector3(0, 46, -1564) : door, kind === 'wallace' ? 248 : doorRadius, kind === 'wallace' ? 36 : 34) },
    { label: 'rim · crown', light: 'rim', angle: 'crown', pose: (c) => aim(c, new Vector3(0.72, -0.28, sign * 0.82), crown, crownRadius, 30) },
    { label: 'rim · top', light: 'rim', angle: 'top', pose: whole(above, 26, upTop, plan) },
    { label: 'studio · facade', light: 'studio', angle: 'facade', pose: (c) => aim(c, new Vector3(0.2, 0.05, sign), wall, wallRadius, 28) },
  ];
}

function dir(parent: Group, color: number, intensity: number, from: Vector3, to: Vector3): void {
  const light = new DirectionalLight(color, intensity);
  light.position.copy(from);
  light.target.position.copy(to);
  parent.add(light, light.target);
}

function buildLights(camera: PerspectiveCamera, kind: Kind): Record<LightName, Group> {
  const night = new Group();
  const rim = new Group();
  const studio = new Group();
  camera.add(night, rim, studio);
  // Each still has its own light. Hall is floodlit limestone, Wallace is a cool
  // miniature, LAPD is the dark overhead block. One warm key made all three khaki.
  const key = kind === 'hall' ? 0.1 : kind === 'wallace' ? 7.2 : 3.1;
  const fill = kind === 'hall' ? 0.02 : kind === 'wallace' ? 0.22 : 0.85;
  const up = kind === 'hall' ? 0.42 : kind === 'wallace' ? 0.5 : 0.62;
  const nightKey = kind === 'hall' ? 0xe4f0e8 : kind === 'wallace' ? 0xc5d0dc : 0xb0aca3;
  const nightFill = kind === 'hall' ? 0xc5d4cc : kind === 'wallace' ? 0x8ea0b4 : 0x8e8a82;
  dir(night, nightKey, key, new Vector3(-1.5, 2.6, -1.4), new Vector3(0, 0.3, -8));
  dir(night, nightFill, fill, new Vector3(2.1, 1.2, -2.2), new Vector3(0, 0.4, -8));
  dir(night, kind === 'hall' ? 0xd5e4dc : 0x8fa4b8, fill * 0.45, new Vector3(-0.3, 0.35, 2.4), new Vector3(0, 0.6, -8));
  dir(night, kind === 'hall' ? 0xe7f2ea : 0xc5d4e6, up, new Vector3(0.15, -1.1, -1.6), new Vector3(0, 1.4, -8));
  dir(night, 0xc8c4bc, kind === 'lapd' ? 0.16 : 0.18, new Vector3(0.08, 0.35, -6.5), new Vector3(0, 0.2, -8));
  // Straight out of the lens, so the three-quarter corner is not the unlit face.
  dir(night, kind === 'lapd' ? 0x9a968c : 0xc5d0dc, kind === 'lapd' ? 0.35 : 0, new Vector3(0, 0.4, 2.4), new Vector3(0, 0.15, -8));
  dir(rim, kind === 'hall' ? 0xf4f7f4 : 0xe7f0ff, kind === 'wallace' ? 6.4 : kind === 'lapd' ? 1.7 : 3.2, new Vector3(1.5, 1.8, -10), new Vector3(0, 0.5, -4));
  dir(rim, kind === 'hall' ? 0xd5e0dc : 0xc5d4f2, kind === 'wallace' ? 2.8 : kind === 'lapd' ? 0.8 : 1.5, new Vector3(-1.7, 0.45, -9), new Vector3(0, 0.4, -4));
  dir(rim, kind === 'hall' ? 0xe7f0ea : 0xd5e0f0, kind === 'hall' ? 1.2 : kind === 'lapd' ? 0.9 : 1.6, new Vector3(0.15, -0.2, -2), new Vector3(0, 0.8, -8));
  // Head-on fill so a dark crown soffit is not a black wedge in the rim pass.
  dir(rim, 0xd5e2f0, kind === 'lapd' ? 1.5 : 0.35, new Vector3(0.05, 0.2, -7), new Vector3(0, 0.15, -8));
  dir(studio, kind === 'hall' ? 0xf6f7f5 : 0xffffff, kind === 'hall' ? 1.35 : kind === 'wallace' ? 1.7 : 3.2, new Vector3(-1.8, 2.4, -2), new Vector3(0, 0, -8));
  dir(studio, kind === 'hall' ? 0xe6e8ea : 0xd5d8de, kind === 'hall' ? 0.7 : 0.85, new Vector3(1.6, 0.5, -3), new Vector3(0, 0, -8));
  return { night, rim, studio };
}

function applyLight(
  scene: Scene, rigs: Record<LightName, Group>, hemi: HemisphereLight,
  ground: { night: Mesh; rim: Mesh; studio: Mesh }, light: LightName, height: number, kind: Kind,
): void {
  rigs.night.visible = light === 'night' && kind !== 'hall';
  rigs.rim.visible = light === 'rim';
  rigs.studio.visible = light === 'studio';
  ground.night.visible = light === 'night';
  ground.rim.visible = light === 'rim';
  ground.studio.visible = light === 'studio';
  const nightHemi = kind === 'hall' ? 0.045 : kind === 'wallace' ? 0.24 : kind === 'lapd' ? 0.2 : 0.9;
  hemi.intensity = light === 'night' ? nightHemi : light === 'rim' ? (kind === 'lapd' ? 0.48 : 0.28) : kind === 'hall' ? 0.55 : 0.7;
  const nightHemiColor = kind === 'hall' ? 0xd5e6de : kind === 'wallace' ? 0x9eb4cc : 0x5c6b78;
  hemi.color.set(light === 'studio' ? 0xc8c8c8 : light === 'rim' ? 0x243656 : nightHemiColor);
  hemi.groundColor.set(light === 'studio' ? 0x9a9a9a : 0x121018);
  const nightEnv = kind === 'hall' ? 0.06 : kind === 'wallace' ? 0.18 : kind === 'lapd' ? 0.12 : 0.32;
  const rimEnv = kind === 'lapd' ? 0.72 : 0.5;
  scene.environmentIntensity = light === 'night' ? nightEnv : light === 'rim' ? rimEnv : 0.22;
  scene.fog = light === 'night' ? new FogExp2(0x100e16, 0.04 / Math.max(40, height)) : null;
  scene.background = new Color(light === 'night' ? 0x09080d : light === 'rim' ? 0x04060c : 0xb9bbbe);
}

function layoutSheet(cols: number[], rows: number, cellH: number): { w: number; h: number } {
  const w = cols.reduce((sum, col) => sum + col, 0);
  const h = rows * cellH;
  const sheet = document.getElementById('sheet')!;
  const frame = document.getElementById('frame')!;
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const labels = document.getElementById('labels')!;
  sheet.style.width = `${w}px`;
  frame.style.width = `${w}px`;
  frame.style.height = `${h}px`;
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  labels.style.display = 'grid';
  labels.style.gridTemplateColumns = cols.map((col) => `${col}px`).join(' ');
  labels.style.gridTemplateRows = `repeat(${rows}, ${cellH}px)`;
  labels.replaceChildren();
  return { w, h };
}

function sheetColumns(): number[] {
  return blind ? [TILE, TILE, TILE, TILE] : [TILE, TILE, TILE, TILE + REF_W];
}

async function renderSheet(
  renderer: WebGPURenderer, scene: Scene, model: Group, box: Box3, tris: number,
): Promise<void> {
  const kind = target.kind;
  const shots = shotsFor(kind, box).slice(0, 8);
  const cols = sheetColumns();
  const rows = 2;
  const { w, h } = layoutSheet(cols, rows, TILE_H);
  renderer.setSize(w, h, false);
  const camera = new PerspectiveCamera(28, TILE / TILE_H, 0.05, 20000);
  scene.add(camera);
  const hemi = new HemisphereLight(0x6e7c90, 0x1a120e, 0.55);
  scene.add(hemi);
  const rigs = buildLights(camera, kind);
  const hallKey = new DirectionalLight(0xf4f7f4, 0);
  hallKey.position.set(210, 48, 36);
  hallKey.target.position.set(0, 64, 0);
  scene.add(hallKey, hallKey.target);
  const hallRim = new DirectionalLight(0xe7f2ea, 0);
  hallRim.position.set(-190, 46, -30);
  hallRim.target.position.set(0, 96, 0);
  scene.add(hallRim, hallRim.target);
  // World key, so the three-quarter is not the unlit corner and the side is not a flat fill.
  const lapdKey = new DirectionalLight(0xc4c0b6, 0);
  lapdKey.position.set(160, 260, -140);
  lapdKey.target.position.set(0, 180, 0);
  scene.add(lapdKey, lapdKey.target);
  const lapdUp = new DirectionalLight(0xa39e94, 0);
  lapdUp.position.set(40, -30, -180);
  lapdUp.target.position.set(0, 190, 0);
  scene.add(lapdUp, lapdUp.target);
  const wallaceMouth = new PointLight(0xff7722, 0, 480, 2);
  // Inside the mouth, so the recess and the jambs take the warm light.
  wallaceMouth.position.set(0, 32, -1566);
  scene.add(wallaceMouth);
  const span = Math.max(box.getSize(new Vector3()).x, box.getSize(new Vector3()).z) * 3;
  const groundMat = (color: number) => new MeshStandardNodeMaterial({ color, roughness: 1, metalness: 0 });
  const grounds = {
    night: new Mesh(new PlaneGeometry(span, span), groundMat(0x07080c)),
    rim: new Mesh(new PlaneGeometry(span, span), groundMat(0x05060a)),
    studio: new Mesh(new PlaneGeometry(span, span), groundMat(0xb4b6b8)),
  };
  for (const mesh of Object.values(grounds)) {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = box.min.y - 0.05;
    scene.add(mesh);
  }
  const size = box.getSize(new Vector3());
  document.getElementById('dims')!.textContent =
    `${kind} · W ${size.x.toFixed(1)} × D ${size.z.toFixed(1)} × H ${size.y.toFixed(1)} m · ${tris} tris · night / rim`;
  const labels = document.getElementById('labels')!;
  const ref = REFS[kind];
  shots.forEach((shot, i) => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const span = document.createElement('span');
    span.textContent = shot.label;
    cell.appendChild(span);
    if (!blind && i % 4 === 3) {
      const img = document.createElement('img');
      img.src = `/harness-refs/${ref.file}`;
      img.alt = ref.caption;
      img.style.width = `${REF_W}px`;
      cell.appendChild(img);
      const cap = document.createElement('em');
      cap.textContent = ref.caption;
      cell.appendChild(cap);
    }
    labels.appendChild(cell);
  });
  renderer.setScissorTest(true);
  const prefixes = [0, cols[0]!, cols[0]! + cols[1]!, cols[0]! + cols[1]! + cols[2]!];
  shots.forEach((shot, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = prefixes[col]!;
    const y = row * TILE_H;
    const viewW = col === 3 ? TILE : cols[col]!;
    applyLight(scene, rigs, hemi, grounds, shot.light, size.y, kind);
    hallKey.intensity = kind === 'hall' && shot.light === 'night' ? 6.5 : 0;
    hallRim.intensity = kind === 'hall' && shot.light === 'night' ? 1.4 : 0;
    lapdKey.intensity = kind === 'lapd' && shot.light === 'night' ? 2.4 : kind === 'lapd' && shot.light === 'rim' ? 2.6 : 0;
    lapdUp.intensity = kind === 'lapd' && shot.light === 'night' ? 0.45 : kind === 'lapd' && shot.light === 'rim' ? 0.3 : 0;
    wallaceMouth.intensity = kind === 'wallace' && shot.light === 'night' ? 22000 : 0;
    renderer.setViewport(x, y, viewW, TILE_H);
    renderer.setScissor(x, y, viewW, TILE_H);
    renderer.setClearColor(scene.background as Color, 1);
    shot.pose(camera);
    camera.aspect = viewW / TILE_H;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    if (!blind && col === 3) {
      renderer.setViewport(x + TILE, y, REF_W, TILE_H);
      renderer.setScissor(x + TILE, y, REF_W, TILE_H);
      renderer.setClearColor(0x07080c, 1);
      renderer.clear();
    }
  });
  window.__harness = {
    done: true,
    error: null,
    size: { x: size.x, y: size.y, z: size.z },
    tris,
    mode,
    tiles: shots.map((shot) => ({ label: shot.label, light: shot.light, angle: shot.angle })),
    panels: [],
    scale: null,
  };
}

async function renderCloseups(
  renderer: WebGPURenderer, scene: Scene, model: Group, box: Box3, tris: number,
): Promise<void> {
  const kind = target.kind;
  const shots = shotsFor(kind, box);
  layoutSheet([CLOSE_W], 1, CLOSE_H);
  const labels = document.getElementById('labels')!;
  labels.style.display = 'block';
  labels.replaceChildren();
  const cell = document.createElement('div');
  cell.className = 'cell';
  const span = document.createElement('span');
  cell.appendChild(span);
  labels.appendChild(cell);
  renderer.setSize(CLOSE_W, CLOSE_H, false);
  renderer.setScissorTest(false);
  const camera = new PerspectiveCamera(28, CLOSE_W / CLOSE_H, 0.05, 20000);
  scene.add(camera);
  const hemi = new HemisphereLight(0x6e7c90, 0x1a120e, 0.55);
  scene.add(hemi);
  const rigs = buildLights(camera, kind);
  const hallKey = new DirectionalLight(0xf4f7f4, 0);
  hallKey.position.set(210, 48, 36);
  hallKey.target.position.set(0, 64, 0);
  scene.add(hallKey, hallKey.target);
  const hallRim = new DirectionalLight(0xe7f2ea, 0);
  hallRim.position.set(-190, 46, -30);
  hallRim.target.position.set(0, 96, 0);
  scene.add(hallRim, hallRim.target);
  const lapdKey = new DirectionalLight(0xc4c0b6, 0);
  lapdKey.position.set(160, 260, -140);
  lapdKey.target.position.set(0, 180, 0);
  scene.add(lapdKey, lapdKey.target);
  const lapdUp = new DirectionalLight(0xa39e94, 0);
  lapdUp.position.set(40, -30, -180);
  lapdUp.target.position.set(0, 190, 0);
  scene.add(lapdUp, lapdUp.target);
  const wallaceMouth = new PointLight(0xff7722, 0, 480, 2);
  // Inside the mouth, so the recess and the jambs take the warm light.
  wallaceMouth.position.set(0, 32, -1566);
  scene.add(wallaceMouth);
  const groundSpan = Math.max(box.getSize(new Vector3()).x, box.getSize(new Vector3()).z) * 3;
  const grounds = {
    night: new Mesh(new PlaneGeometry(groundSpan, groundSpan), new MeshStandardNodeMaterial({ color: 0x07080c, roughness: 1, metalness: 0 })),
    rim: new Mesh(new PlaneGeometry(groundSpan, groundSpan), new MeshStandardNodeMaterial({ color: 0x05060a, roughness: 1, metalness: 0 })),
    studio: new Mesh(new PlaneGeometry(groundSpan, groundSpan), new MeshStandardNodeMaterial({ color: 0xb4b6b8, roughness: 1, metalness: 0 })),
  };
  for (const mesh of Object.values(grounds)) {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = box.min.y - 0.05;
    scene.add(mesh);
  }
  const size = box.getSize(new Vector3());
  const show = (index: number) => {
    const shot = shots[((index % shots.length) + shots.length) % shots.length]!;
    applyLight(scene, rigs, hemi, grounds, shot.light, size.y, kind);
    hallKey.intensity = kind === 'hall' && shot.light === 'night' ? 6.5 : 0;
    hallRim.intensity = kind === 'hall' && shot.light === 'night' ? 1.4 : 0;
    lapdKey.intensity = kind === 'lapd' && shot.light === 'night' ? 2.4 : kind === 'lapd' && shot.light === 'rim' ? 2.6 : 0;
    lapdUp.intensity = kind === 'lapd' && shot.light === 'night' ? 0.45 : kind === 'lapd' && shot.light === 'rim' ? 0.3 : 0;
    wallaceMouth.intensity = kind === 'wallace' && shot.light === 'night' ? 22000 : 0;
    span.textContent = shot.label;
    document.getElementById('dims')!.textContent =
      `${shot.label} · W ${size.x.toFixed(1)} × D ${size.z.toFixed(1)} × H ${size.y.toFixed(1)} m · ${tris} tris · ${CLOSE_W}×${CLOSE_H}`;
    renderer.setViewport(0, 0, CLOSE_W, CLOSE_H);
    renderer.setClearColor(scene.background as Color, 1);
    shot.pose(camera);
    camera.aspect = CLOSE_W / CLOSE_H;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    if (window.__harness) {
      window.__harness.shot = index;
      window.__harness.label = shot.label;
    }
  };
  window.__harness = {
    done: true,
    error: null,
    size: { x: size.x, y: size.y, z: size.z },
    tris,
    mode,
    tiles: shots.map((shot) => ({ label: shot.label, light: shot.light, angle: shot.angle })),
    panels: [],
    scale: null,
    shot: 0,
    label: shots[0]!.label,
  };
  window.__harnessShow = show;
  show(0);
}

function ortho(frame: Frame, near: number, far: number): OrthographicCamera {
  const w = (frame.x1 - frame.x0) / 2;
  const h = (frame.y1 - frame.y0) / 2;
  return new OrthographicCamera(-w, w, h, -h, near, far);
}

function silhouetteCameras(sil: Silhouette): Record<Panel['id'], OrthographicCamera> {
  const set = frames(sil);
  const b = sil.bounds;
  const margin = Math.max(40, (b.maxY - b.minY) * 0.15);
  const side = ortho(set.side, 0.5, (b.maxX - b.minX) + margin * 4);
  const midY = (set.side.y0 + set.side.y1) / 2;
  const midZ = -(set.side.x0 + set.side.x1) / 2;
  side.position.set(b.maxX + margin, midY, midZ);
  side.up.set(0, 1, 0);
  side.lookAt(b.minX - margin, midY, midZ);
  side.updateProjectionMatrix();

  const front = ortho(set.front, 0.5, (b.maxZ - b.minZ) + margin * 4);
  const midX = (set.front.x0 + set.front.x1) / 2;
  const frontY = (set.front.y0 + set.front.y1) / 2;
  front.position.set(midX, frontY, b.maxZ + margin);
  front.up.set(0, 1, 0);
  front.lookAt(midX, frontY, b.minZ - margin);
  front.updateProjectionMatrix();

  const top = ortho(set.top, 0.5, (b.maxY - b.minY) + margin * 4);
  const topZ = -(set.top.x0 + set.top.x1) / 2;
  const topX = -(set.top.y0 + set.top.y1) / 2;
  top.position.set(topX, b.maxY + margin, topZ);
  top.up.set(-1, 0, 0);
  top.lookAt(topX, b.minY - margin, topZ);
  top.updateProjectionMatrix();
  return { side, front, top };
}

function panelsFor(sil: Silhouette): Panel[] {
  const set = frames(sil);
  const note = sil.source || 'Structural envelope. Film frames sit beside the turntable.';
  const side: Panel = { id: 'side', x: 0, y: 0, w: set.side.w, h: set.side.h, note };
  const front: Panel = { id: 'front', x: 0, y: set.side.h, w: set.front.w, h: set.front.h, note };
  const top: Panel = { id: 'top', x: 0, y: set.side.h + set.front.h, w: set.top.w, h: set.top.h, note };
  return [side, front, top];
}

async function renderSilhouette(
  renderer: WebGPURenderer, scene: Scene, model: Group, box: Box3, tris: number,
): Promise<void> {
  paintWhite(model);
  const sil = SILS[target.kind];
  const list = panelsFor(sil);
  const w = Math.max(...list.map((panel) => panel.x + panel.w));
  const h = Math.max(...list.map((panel) => panel.y + panel.h));
  layoutSheet([w], 1, h);
  const labels = document.getElementById('labels')!;
  labels.style.display = 'block';
  labels.style.position = 'absolute';
  for (const panel of list) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.style.position = 'absolute';
    cell.style.left = `${panel.x}px`;
    cell.style.top = `${panel.y}px`;
    cell.style.width = `${panel.w}px`;
    cell.style.height = `${panel.h}px`;
    const span = document.createElement('span');
    span.textContent = panel.id;
    cell.appendChild(span);
    labels.appendChild(cell);
  }
  renderer.setSize(w, h, false);
  scene.background = new Color(0x000000);
  scene.fog = null;
  const size = box.getSize(new Vector3());
  document.getElementById('dims')!.textContent =
    `${target.kind} · W ${size.x.toFixed(1)} × D ${size.z.toFixed(1)} × H ${size.y.toFixed(1)} m · ortho mask · ${tris} tris`;
  const cams = silhouetteCameras(sil);
  renderer.setScissorTest(true);
  renderer.setClearColor(0x000000, 1);
  for (const panel of list) {
    renderer.setViewport(panel.x, panel.y, panel.w, panel.h);
    renderer.setScissor(panel.x, panel.y, panel.w, panel.h);
    renderer.render(scene, cams[panel.id]);
  }
  window.__harness = {
    done: true,
    error: null,
    size: { x: size.x, y: size.y, z: size.z },
    tris,
    mode,
    tiles: [],
    panels: list,
    scale: null,
  };
}

function addFlight(parent: Group, x: number, y: number, z: number, toward: number): void {
  const rise = 0.17;
  const tread = 0.29;
  const n = 10;
  const stone = concrete(0xd7dadf);
  const rail = concrete(0xb7bcc4);
  for (let i = 0; i < n; i++) {
    const cz = z + toward * (tread * i + tread * 0.5);
    addBox(parent, 1.7, rise, tread + 0.02, x, y + rise * i, cz, stone);
  }
  const run = n * tread;
  addBox(parent, 0.08, n * rise + RAIL_H, run, x + 0.86, y, z + toward * (run * 0.5), rail);
}

function gauge(parent: Group, x: number, y: number, z: number, toward: number, stairX: number, stairZ: number): void {
  const cloth = concrete(0x3c4558);
  const skin = concrete(0xc2a588);
  const paint = concrete(0xf4f6f8);
  const lane = concrete(0x8d8678);
  addBox(parent, 0.34, 0.86, 0.22, x, y, z, cloth);
  addBox(parent, 0.46, 0.58, 0.24, x, y + 0.86, z, cloth);
  // Crown meets the 1.80 m bar. A short head reads as a short person.
  addBox(parent, 0.24, 0.32, 0.24, x, y + 1.48, z, skin);
  const leaf = DOOR_W;
  const doorX = x + 2.05;
  addBox(parent, 0.08, DOOR_H, 0.08, doorX - leaf / 2, y, z, paint);
  addBox(parent, 0.08, DOOR_H, 0.08, doorX + leaf / 2, y, z, paint);
  addBox(parent, leaf + 0.16, 0.08, 0.08, doorX, y + DOOR_H, z, paint);
  addBox(parent, leaf, 0.06, 0.06, doorX, y, z, paint);
  const poleX = x - 1.85;
  addBox(parent, 0.08, STOREY_M, 0.08, poleX, y, z, paint);
  addBox(parent, 0.42, 0.05, 0.08, poleX, y + PERSON_M, z, paint);
  addBox(parent, 0.62, 0.05, 0.08, poleX, y + STOREY_M, z, paint);
  addBox(parent, LANE_M, 0.04, 1.6, x + 4.3, y, z, lane);
  addFlight(parent, stairX, y, stairZ, toward);
}

function scaleStand(kind: Kind): { look: Vector3; wide: Vector3; person: Vector3; toward: number; stairX: number; stairZ: number } {
  if (kind === 'lapd') {
    // The figure stands in the lower third. The door and the podium share that frame.
    const person = new Vector3(16, 0, -74);
    return { person, look: new Vector3(2, 3.2, -64), wide: new Vector3(0, 100, -20), toward: 1, stairX: 18, stairZ: -68 };
  }
  if (kind === 'hall') {
    // Close on the porch so the person, the door and the flight are readable.
    const person = new Vector3(-1.6, 0, 48);
    return { person, look: new Vector3(0.4, 3.4, 42), wide: new Vector3(0, 70, 10), toward: -1, stairX: 4.8, stairZ: 53 };
  }
  // Outside the jamb, on the 3.6 m street courses. The figure stands between the camera and the wall.
  const person = new Vector3(196, 0, -1626);
  return { person, look: new Vector3(192, 2.4, -1612), wide: new Vector3(0, 1200, -400), toward: 1, stairX: 184, stairZ: -1634 };
}

async function renderScale(
  renderer: WebGPURenderer, scene: Scene, model: Group, box: Box3, tris: number,
): Promise<void> {
  const kind = target.kind;
  const cellW = 1400;
  const cellH = 900;
  layoutSheet([cellW, cellW], 1, cellH);
  const stand = scaleStand(kind);
  gauge(scene, stand.person.x, stand.person.y, stand.person.z, stand.toward, stand.stairX, stand.stairZ);
  const span = Math.max(box.getSize(new Vector3()).x, box.getSize(new Vector3()).z) * 2.4;
  const ground = new Mesh(
    new PlaneGeometry(span, span),
    new MeshStandardNodeMaterial({ color: 0xb7b9bb, roughness: 0.72 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = box.min.y - 0.02;
  scene.add(ground);
  const hemi = new HemisphereLight(0xd0d4dc, 0x8a8e94, kind === 'wallace' ? 0.5 : 0.85);
  scene.add(hemi);
  const sign = entranceSign(kind);
  const key = new DirectionalLight(0xffffff, kind === 'wallace' ? 1.5 : 3.4);
  key.position.set(30, 80, sign * 120);
  key.target.position.set(0, kind === 'wallace' ? 200 : 20, 0);
  scene.add(key, key.target);
  const fill = new DirectionalLight(0xe4e8ee, 1.6);
  fill.position.set(-40, 30, sign * 40);
  scene.add(fill);
  scene.background = new Color(0xc5c7ca);
  const size = box.getSize(new Vector3());
  document.getElementById('dims')!.textContent =
    `${kind} · person ${PERSON_M} m · door ${DOOR_H}×${DOOR_W} m · storey ${STOREY_M} m · lane ${LANE_M} m`
    + ` · building H ${size.y.toFixed(1)} m · ${tris} tris`;
  const labels = document.getElementById('labels')!;
  for (const name of [
    `person ${PERSON_M} m · door ${DOOR_H}×${DOOR_W} m · storey ${STOREY_M} m · lane ${LANE_M} m · stair rise 0.17 m`,
    'whole building · same figure',
  ]) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const span = document.createElement('span');
    span.textContent = name;
    cell.appendChild(span);
    labels.appendChild(cell);
  }
  const close = new PerspectiveCamera(30, cellW / cellH, 0.05, 8000);
  const closeDir = kind === 'hall'
    ? new Vector3(0.4, 0.16, 0.9)
    : kind === 'lapd'
      ? new Vector3(0.8, 0.04, -0.6)
      : new Vector3(0.12, 0.02, -0.99);
  const closeRadius = kind === 'wallace' ? 8 : kind === 'hall' ? 14 : 12;
  const closeFov = kind === 'wallace' ? 38 : kind === 'hall' ? 44 : 46;
  aim(close, closeDir, stand.look, closeRadius, closeFov);
  const wide = new PerspectiveCamera(28, cellW / cellH, 0.2, 20000);
  aim(wide, new Vector3(0.55, 0.28, entranceSign(kind) * 0.8), stand.wide, kind === 'wallace' ? 2200 : box.getSize(new Vector3()).y * 0.7, 28);
  renderer.setSize(cellW * 2, cellH, false);
  renderer.setScissorTest(true);
  renderer.setClearColor(0xc5c7ca, 1);
  [close, wide].forEach((cam, i) => {
    renderer.setViewport(i * cellW, 0, cellW, cellH);
    renderer.setScissor(i * cellW, 0, cellW, cellH);
    renderer.render(scene, cam);
  });
  window.__harness = {
    done: true,
    error: null,
    size: { x: size.x, y: size.y, z: size.z },
    tris,
    mode,
    tiles: [],
    panels: [],
    scale: {
      person: PERSON_M,
      doorH: DOOR_H,
      doorW: DOOR_W,
      storey: STOREY_M,
      lane: LANE_M,
      height: size.y,
    },
  };
}

async function main(): Promise<void> {
  window.__harness = {
    done: false, error: null, size: null, tris: 0, mode, tiles: [], panels: [], scale: null,
  };
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
  await renderer.init();
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setPixelRatio(1);

  const scene = new Scene();
  const model = target.legacy ? legacyBuilding(target.kind) : await loadGlb(target.url!);
  scene.add(model);
  const box = new Box3().setFromObject(model);
  const tris = countTris(model);
  document.getElementById('title')!.textContent = title;

  if (mode === 'silhouette') {
    await renderSilhouette(renderer, scene, model, box, tris);
    return;
  }
  if (mode === 'scale') {
    await renderScale(renderer, scene, model, box, tris);
    return;
  }
  if (mode === 'closeups') {
    await renderCloseups(renderer, scene, model, box, tris);
    return;
  }
  await renderSheet(renderer, scene, model, box, tris);
}

main().catch((err) => {
  console.error(err);
  window.__harness = {
    done: false, error: String(err), size: null, tris: 0, mode, tiles: [], panels: [], scale: null,
  };
});
