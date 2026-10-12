// Landmark contact sheet, orthographic mask, and scale rig.
// Playwright screenshots #sheet. Film stills load from /harness-refs/ and stay gitignored.
import {
  ACESFilmicToneMapping, Box3, BoxGeometry, Color, DirectionalLight, DoubleSide,
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
      if (name.includes('light-') && std.emissive) {
        std.emissiveIntensity = Math.max(std.emissiveIntensity ?? 1, 4);
      }
      if (name.includes('glass')) {
        std.transparent = true;
        std.opacity = 0.74;
        std.emissive = new Color(0.50, 0.68, 0.88);
        std.emissiveIntensity = target.kind === 'lapd' ? 0.22 : Math.max(std.emissiveIntensity ?? 0, 0.9);
        std.roughness = Math.min(std.roughness ?? 0.2, 0.22);
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
  const quarter = new Vector3(0.85, 0.32, sign * 0.7);
  const side = new Vector3(1, 0.16, 0.04);
  const above = new Vector3(0.04, 1, sign * 0.08);
  const upTop = new Vector3(0, 0, sign);
  const doorY = kind === 'lapd' ? 6.6 : kind === 'hall' ? 6.2 : 90;
  const doorZ = kind === 'lapd' ? -61 : kind === 'hall' ? 34 : -1660;
  const door = new Vector3(0, doorY, doorZ);
  const doorRadius = kind === 'wallace' ? 210 : kind === 'lapd' ? 12 : 16;
  const crownY = kind === 'wallace' ? 3360 : kind === 'hall' ? 118 : 186;
  const crown = new Vector3(0, crownY, 0);
  const crownRadius = kind === 'wallace' ? 380 : kind === 'hall' ? 32 : 62;
  const wall = kind === 'lapd'
    ? new Vector3(-18, 78, -51)
    : kind === 'hall'
      ? new Vector3(6, 62, 18)
      : new Vector3(0, 700, -1500);
  const wallRadius = kind === 'wallace' ? 90 : 14;
  const plan = Math.max(size.x, size.z) * 0.62;
  const whole = (dir: Vector3, fov = 28, up?: Vector3, span = radius) => (camera: PerspectiveCamera) => {
    aim(camera, dir, center, span, fov, up);
  };
  return [
    { label: 'night · three-quarter', light: 'night', angle: '34', pose: whole(quarter) },
    { label: 'night · entrance', light: 'night', angle: 'entrance', pose: (c) => aim(c, front, door, doorRadius, 32) },
    { label: 'night · side', light: 'night', angle: 'side', pose: whole(side) },
    { label: 'night · top', light: 'night', angle: 'top', pose: whole(above, 26, upTop, plan) },
    { label: 'rim · three-quarter', light: 'rim', angle: '34', pose: whole(quarter) },
    { label: 'rim · entrance', light: 'rim', angle: 'entrance', pose: (c) => aim(c, front, door, doorRadius, 32) },
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
  const key = kind === 'hall' ? 2.7 : kind === 'wallace' ? 2.15 : 3.05;
  const fill = kind === 'hall' ? 1.25 : kind === 'wallace' ? 1.05 : 1.35;
  const up = kind === 'hall' ? 1.6 : kind === 'wallace' ? 0.45 : 1.15;
  const nightKey = kind === 'hall' ? 0xd7f0e6 : kind === 'wallace' ? 0xc5d7ee : 0x9aabbc;
  const nightFill = kind === 'hall' ? 0xc5ddd2 : kind === 'wallace' ? 0xa8bdd4 : 0x7e8c9c;
  dir(night, nightKey, key, new Vector3(-1.5, 2.6, -1.4), new Vector3(0, 0.3, -8));
  dir(night, nightFill, fill, new Vector3(2.1, 1.2, -2.2), new Vector3(0, 0.4, -8));
  dir(night, 0x8fa4b8, fill * 0.45, new Vector3(-0.3, 0.35, 2.4), new Vector3(0, 0.6, -8));
  dir(night, kind === 'hall' ? 0xe7f6ee : 0xc5d4e6, up, new Vector3(0.15, -1.1, -1.6), new Vector3(0, 1.4, -8));
  dir(night, 0xb9c8d8, kind === 'lapd' ? 1.7 : 0.15, new Vector3(0.08, 0.35, -6.5), new Vector3(0, 0.2, -8));
  dir(rim, 0xe7f0ff, kind === 'wallace' ? 3.6 : kind === 'lapd' ? 9.2 : 6.4, new Vector3(1.5, 1.8, -10), new Vector3(0, 0.5, -4));
  dir(rim, 0xc5d4f2, kind === 'wallace' ? 2.0 : kind === 'lapd' ? 5.2 : 3.2, new Vector3(-1.7, 0.45, -9), new Vector3(0, 0.4, -4));
  dir(rim, kind === 'hall' ? 0xe4f3ea : 0xd5e0f0, kind === 'hall' ? 2.2 : kind === 'lapd' ? 3.4 : 1.3, new Vector3(0.15, -0.2, -2), new Vector3(0, 0.8, -8));
  // Head-on fill so a dark crown soffit is not a black wedge in the rim pass.
  dir(rim, 0xd5e2f0, kind === 'lapd' ? 3.8 : 0.35, new Vector3(0.05, 0.2, -7), new Vector3(0, 0.15, -8));
  dir(studio, 0xffffff, kind === 'hall' ? 1.45 : kind === 'wallace' ? 2.3 : 2.6, new Vector3(-1.8, 2.4, -2), new Vector3(0, 0, -8));
  dir(studio, 0xd5d8de, kind === 'hall' ? 1.05 : 1.35, new Vector3(1.6, 0.5, -3), new Vector3(0, 0, -8));
  return { night, rim, studio };
}

function applyLight(
  scene: Scene, rigs: Record<LightName, Group>, hemi: HemisphereLight,
  ground: { night: Mesh; rim: Mesh; studio: Mesh }, light: LightName, height: number, kind: Kind,
): void {
  rigs.night.visible = light === 'night';
  rigs.rim.visible = light === 'rim';
  rigs.studio.visible = light === 'studio';
  ground.night.visible = light === 'night';
  ground.rim.visible = light === 'rim';
  ground.studio.visible = light === 'studio';
  const nightHemi = kind === 'hall' ? 0.42 : kind === 'wallace' ? 0.34 : 0.42;
  hemi.intensity = light === 'night' ? nightHemi : light === 'rim' ? (kind === 'lapd' ? 0.48 : 0.28) : kind === 'hall' ? 0.55 : 0.7;
  const nightHemiColor = kind === 'hall' ? 0xc9e6dc : kind === 'wallace' ? 0x8eabc8 : 0x4a5868;
  hemi.color.set(light === 'studio' ? 0xc8c8c8 : light === 'rim' ? 0x243656 : nightHemiColor);
  hemi.groundColor.set(light === 'studio' ? 0x9a9a9a : 0x121018);
  const nightEnv = kind === 'hall' ? 0.5 : kind === 'wallace' ? 0.42 : 0.48;
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
  return [TILE, TILE, TILE, TILE + REF_W];
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
  const span = Math.max(box.getSize(new Vector3()).x, box.getSize(new Vector3()).z) * 3;
  const groundMat = (color: number, rough: number) => new MeshStandardNodeMaterial({ color, roughness: rough, metalness: 0.08 });
  const grounds = {
    night: new Mesh(new PlaneGeometry(span, span), groundMat(0x07080c, 0.35)),
    rim: new Mesh(new PlaneGeometry(span, span), groundMat(0x05060a, 0.6)),
    studio: new Mesh(new PlaneGeometry(span, span), groundMat(0xb4b6b8, 0.7)),
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
    if (i % 4 === 3) {
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
    renderer.setViewport(x, y, viewW, TILE_H);
    renderer.setScissor(x, y, viewW, TILE_H);
    renderer.setClearColor(scene.background as Color, 1);
    shot.pose(camera);
    camera.aspect = viewW / TILE_H;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    if (col === 3) {
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
  const groundSpan = Math.max(box.getSize(new Vector3()).x, box.getSize(new Vector3()).z) * 3;
  const grounds = {
    night: new Mesh(new PlaneGeometry(groundSpan, groundSpan), new MeshStandardNodeMaterial({ color: 0x07080c, roughness: 0.35 })),
    rim: new Mesh(new PlaneGeometry(groundSpan, groundSpan), new MeshStandardNodeMaterial({ color: 0x05060a, roughness: 0.6 })),
    studio: new Mesh(new PlaneGeometry(groundSpan, groundSpan), new MeshStandardNodeMaterial({ color: 0xb4b6b8, roughness: 0.7 })),
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

function gauge(parent: Group, x: number, y: number, z: number, toward: number): void {
  const cloth = concrete(0x3c4558);
  const skin = concrete(0xc2a588);
  const paint = concrete(0xf4f6f8);
  const lane = concrete(0x8d8678);
  addBox(parent, 0.34, 0.86, 0.22, x, y, z, cloth);
  addBox(parent, 0.46, 0.58, 0.24, x, y + 0.86, z, cloth);
  addBox(parent, 0.24, 0.28, 0.24, x, y + 1.46, z, skin);
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
  addFlight(parent, x - 4.35, y, z + toward * 0.8, toward);
}

function scaleStand(kind: Kind): { look: Vector3; wide: Vector3; person: Vector3; toward: number } {
  if (kind === 'lapd') {
    // Beside the stair, so the white frame is the only door in the close view.
    const person = new Vector3(26, 0, -80);
    return { person, look: new Vector3(26, 1.2, -80), wide: new Vector3(0, 80, -48), toward: 1 };
  }
  if (kind === 'hall') {
    const person = new Vector3(-30, 0, 56);
    return { person, look: new Vector3(-30, 1.2, 56), wide: new Vector3(0, 55, 28), toward: -1 };
  }
  const person = new Vector3(0, 0, -1724);
  return { person, look: new Vector3(0, 1.25, -1724), wide: new Vector3(0, 420, -1400), toward: 1 };
}

async function renderScale(
  renderer: WebGPURenderer, scene: Scene, model: Group, box: Box3, tris: number,
): Promise<void> {
  const kind = target.kind;
  const cellW = 1400;
  const cellH = 900;
  layoutSheet([cellW, cellW], 1, cellH);
  const stand = scaleStand(kind);
  gauge(scene, stand.person.x, stand.person.y, stand.person.z, stand.toward);
  const span = Math.max(box.getSize(new Vector3()).x, box.getSize(new Vector3()).z) * 2.4;
  const ground = new Mesh(
    new PlaneGeometry(span, span),
    new MeshStandardNodeMaterial({ color: 0xb7b9bb, roughness: 0.72 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = box.min.y - 0.02;
  scene.add(ground);
  const hemi = new HemisphereLight(0xd0d4dc, 0x8a8e94, 0.85);
  scene.add(hemi);
  const sign = entranceSign(kind);
  const key = new DirectionalLight(0xffffff, 3.4);
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
  const closeDir = new Vector3(0, 0.06, entranceSign(kind));
  aim(close, closeDir, stand.look, kind === 'wallace' ? 4.2 : 3.15, 30);
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
