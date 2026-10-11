// Contact sheet, orthographic silhouettes, and the scale rig.
// Playwright screenshots #sheet. Film stills load from /harness-refs/ (dev only, gitignored).
import {
  ACESFilmicToneMapping, Box3, BoxGeometry, CanvasTexture, Color, DirectionalLight, DoubleSide,
  EquirectangularReflectionMapping, FogExp2, GridHelper,
  Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshBasicNodeMaterial, MeshStandardNodeMaterial,
  OrthographicCamera, PerspectiveCamera, PlaneGeometry, PointLight, Scene, SRGBColorSpace, Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../../src/atmosphere/uniforms';
import { createLegacySpinnerMesh, loadSpinnerFile } from '../../../src/vehicles/spinnerModel';
import frustum from '../silhouettes/frustum.json';
import manifest from '../refs/manifest.json';

const T = TSL as any;

type Shot = {
  label: string;
  light: 'night' | 'rim' | 'studio';
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
      scale: {
        figure: number;
        lane: number;
        door: number;
        storey: number;
        spinner: { length: number; width: number; height: number };
        ratios: { heightOverFigure: number; widthOverLane: number; heightOverDoor: number; heightOverStorey: number };
      } | null;
    };
  }
}

const params = new URLSearchParams(location.search);
const src = params.get('src') ?? 'legacy';
const title = params.get('title') ?? src;
const mode = params.get('mode') ?? 'sheet';

const TILE_W = 300;
const REF_W = 220;
const TILE_H = 200;
const CELL_W = TILE_W + REF_W;

const FIGURE_M = 1.75;
const LANE_M = 3.7;
const DOOR_M = 2.0;
const STOREY_M = 3.4;

function refFile(angle: string): string | null {
  for (const still of manifest.stills) {
    if (still.angles.includes(angle)) return still.file;
  }
  return null;
}

function orbit(yawDeg: number, camera: PerspectiveCamera): void {
  const yaw = yawDeg * Math.PI / 180;
  const elev = 16 * Math.PI / 180;
  const dist = 11.5;
  const horiz = Math.cos(elev) * dist;
  camera.position.set(Math.sin(yaw) * horiz, Math.sin(elev) * dist + 0.15, -Math.cos(yaw) * horiz);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0.62, 0);
  camera.fov = 30;
  camera.updateProjectionMatrix();
}

function closeNose(camera: PerspectiveCamera): void {
  camera.position.set(1.15, 0.72, -4.35);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0.48, -2.15);
  camera.fov = 28;
  camera.updateProjectionMatrix();
}

function closePod(camera: PerspectiveCamera): void {
  // Rear drum. three.js +Z is the tail.
  camera.position.set(2.35, 0.72, 2.85);
  camera.up.set(0, 1, 0);
  camera.lookAt(0.85, 0.38, 1.65);
  camera.fov = 30;
  camera.updateProjectionMatrix();
}

function topDown(camera: PerspectiveCamera): void {
  // Whole car, nose toward the top of the frame. The slot is only the front of a filled roof.
  camera.position.set(0, 14.5, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.fov = 26;
  camera.updateProjectionMatrix();
}

function topThreeQuarter(camera: PerspectiveCamera): void {
  camera.position.set(2.6, 4.8, -5.4);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0.42, -0.7);
  camera.fov = 30;
  camera.updateProjectionMatrix();
}

function topNose(camera: PerspectiveCamera): void {
  camera.position.set(0.2, 2.8, -5.8);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0.4, -1.5);
  camera.fov = 28;
  camera.updateProjectionMatrix();
}

const YAWS = [0, 45, 90, 135, 180, 225, 270, 315];

function sheetShots(): Shot[] {
  const out: Shot[] = [];
  for (const light of ['night', 'rim', 'studio'] as const) {
    for (const yaw of YAWS) {
      out.push({ label: `${light} · ${yaw}°`, light, angle: String(yaw), pose: (c) => orbit(yaw, c) });
    }
    out.push({ label: `${light} · nose`, light, angle: 'nose', pose: closeNose });
    out.push({ label: `${light} · pod`, light, angle: 'pod', pose: closePod });
    out.push({ label: `${light} · top`, light, angle: 'top', pose: topDown });
    out.push({ label: `${light} · top 3/4`, light, angle: 'top34', pose: topThreeQuarter });
    out.push({ label: `${light} · channel`, light, angle: 'channel', pose: topNose });
    out.push({ label: `${light} · flight`, light, angle: 'flight', pose: topNose });
    out.push({ label: `${light} · roof`, light, angle: 'roof', pose: topDown });
  }
  return out;
}

function dir(parent: Group, color: number, intensity: number, from: Vector3, to: Vector3): void {
  const light = new DirectionalLight(color, intensity);
  light.position.copy(from);
  light.target.position.copy(to);
  parent.add(light, light.target);
}

function buildLights(camera: PerspectiveCamera): { night: Group; rim: Group; studio: Group } {
  const night = new Group();
  const rim = new Group();
  const studio = new Group();
  camera.add(night, rim, studio);
  dir(night, 0xfff1dc, 18, new Vector3(-1.8, 2.8, 0.3), new Vector3(0, 0.3, -1));
  dir(night, 0xd5dde8, 12, new Vector3(0.3, 1.4, 1.6), new Vector3(0, 0.35, -3));
  dir(night, 0xb7c4d6, 5, new Vector3(2.0, 0.7, 0.5), new Vector3(0, 0.2, -1));
  // Off the body. A practical sitting on the drum paints a turbine ring that is not on the mesh.
  night.add(new PointLight(0xff2eb8, 70, 0, 2).translateX(-3.6).translateY(1.6).translateZ(0.4));
  night.add(new PointLight(0x3dfff0, 60, 0, 2).translateX(3.6).translateY(1.5).translateZ(0.2));
  night.add(new PointLight(0xff8a32, 28, 0, 2).translateY(0.4).translateZ(2.4));
  // Camera looks down its -Z. Lights past the subject (more negative Z) rim the far edges.
  // Hot enough to rim the wedge, dim enough that the paint stays paint.
  dir(rim, 0xd5e6ff, 8, new Vector3(1.7, 1.9, -6.2), new Vector3(0, 0.45, -2));
  dir(rim, 0xa9c4f5, 5.5, new Vector3(-2.1, 0.35, -5.4), new Vector3(0, 0.4, -2));
  dir(rim, 0xf0f6ff, 3.5, new Vector3(0.2, 2.4, -4.8), new Vector3(0, 0.7, -2));
  dir(rim, 0xffe4c6, 1.4, new Vector3(-0.3, 0.45, 0.6), new Vector3(0, 0.4, -2));
  dir(studio, 0xffffff, 8.0, new Vector3(-2.2, 2.6, 0.6), new Vector3(0, 0.3, -1));
  dir(studio, 0xd5d8de, 3.2, new Vector3(2.0, 0.6, 0.2), new Vector3(0, 0.2, -1));
  dir(studio, 0xffffff, 3.6, new Vector3(0.4, 1.8, -2.4), new Vector3(0, 0.4, -1));
  return { night, rim, studio };
}

function layout(cols: number, rows: number, cellW: number, cellH: number): { w: number; h: number } {
  const w = cols * cellW;
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
  labels.style.gridTemplateColumns = `repeat(${cols}, ${cellW}px)`;
  labels.style.gridTemplateRows = `repeat(${rows}, ${cellH}px)`;
  return { w, h };
}

async function loadModel(): Promise<Group> {
  if (src === 'legacy') return createLegacySpinnerMesh();
  const url = src.startsWith('/') || src.startsWith('http') ? src : `/${src.replace(/^\.\//, '')}`;
  return loadSpinnerFile(url);
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
    const name = (mesh.material && !Array.isArray(mesh.material) ? mesh.material.name : '') .toLowerCase();
    // Lamps are not part of the outline. A rocker strip under the belly would invent a silhouette.
    if (name.includes('light-') || name.includes('strobe') || name.includes('underglow')) {
      mesh.visible = false;
      return;
    }
    mesh.material = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide });
  });
}

function ppmSpan(a: number, b: number): number {
  return Math.round((b - a) * frustum.ppm);
}

function panels(): Panel[] {
  const sideH = ppmSpan(frustum.side.z0, frustum.side.z1);
  const frontH = ppmSpan(frustum.front.z0, frustum.front.z1);
  const topH = ppmSpan(frustum.top.y0, frustum.top.y1);
  const side: Panel = {
    id: 'side', x: 0, y: 0,
    w: ppmSpan(frustum.side.x0, frustum.side.x1), h: sideH,
    note: 'nose to the right, ground at the bottom. Trace is a perspective estimate.',
  };
  const front: Panel = {
    id: 'front', x: 0, y: sideH,
    w: ppmSpan(frustum.front.x0, frustum.front.x1), h: frontH,
    note: 'right of the car to the right. Trace is a perspective estimate.',
  };
  const top: Panel = {
    id: 'top', x: 0, y: sideH + frontH,
    w: ppmSpan(frustum.top.x0, frustum.top.x1), h: topH,
    note: 'nose to the right. Outline traced from the published top view, with the film overheads on the sheet.',
  };
  return [side, front, top];
}

function ortho(left: number, right: number, top: number, bottom: number): OrthographicCamera {
  return new OrthographicCamera(left, right, top, bottom, 0.05, 40);
}

function sideCamera(): OrthographicCamera {
  const { x0, x1, z0, z1 } = frustum.side;
  const cam = ortho(-(x1 - x0) / 2, (x1 - x0) / 2, (z1 - z0) / 2, -(z1 - z0) / 2);
  const midY = (z0 + z1) / 2;
  cam.position.set(12, midY, -(x0 + x1) / 2);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, midY, -(x0 + x1) / 2);
  cam.updateProjectionMatrix();
  return cam;
}

function frontCamera(): OrthographicCamera {
  const { x0, x1, z0, z1 } = frustum.front;
  const cam = ortho(-(x1 - x0) / 2, (x1 - x0) / 2, (z1 - z0) / 2, -(z1 - z0) / 2);
  const midY = (z0 + z1) / 2;
  cam.position.set(0, midY, -12);
  cam.up.set(0, 1, 0);
  cam.lookAt(0, midY, 0);
  cam.updateProjectionMatrix();
  return cam;
}

function topCamera(): OrthographicCamera {
  const { x0, x1, y0, y1 } = frustum.top;
  const cam = ortho(-(x1 - x0) / 2, (x1 - x0) / 2, (y1 - y0) / 2, -(y1 - y0) / 2);
  cam.position.set(0, 14, -(x0 + x1) / 2);
  cam.up.set(-1, 0, 0);
  cam.lookAt(0, 0, -(x0 + x1) / 2);
  cam.updateProjectionMatrix();
  return cam;
}

function addBox(parent: Group, mat: MeshStandardNodeMaterial, w: number, h: number, d: number, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function buildScaleProps(modelSize: Vector3): Group {
  const rig = new Group();
  const cloth = new MeshStandardNodeMaterial({ color: 0x3c4558, roughness: 0.82, metalness: 0.04 });
  const skin = new MeshStandardNodeMaterial({ color: 0xc2a588, roughness: 0.72, metalness: 0 });
  const paint = new MeshStandardNodeMaterial({ color: 0xd7dadf, roughness: 0.55, metalness: 0.02 });
  const wallMat = new MeshStandardNodeMaterial({ color: 0x8d929a, roughness: 0.7, metalness: 0.08 });
  const human = new Group();
  const hx = modelSize.x / 2 + 0.42;
  addBox(human, cloth, 0.28, 0.86, 0.2, 0, 0.43, 0);
  addBox(human, cloth, 0.44, 0.58, 0.24, 0, 1.15, 0);
  addBox(human, skin, 0.2, 0.24, 0.2, 0, 1.63, 0);
  human.position.set(hx, 0, 0.15);
  rig.add(human);
  for (const sign of [-1, 1]) {
    const line = addBox(rig, paint, 0.1, 0.025, 14, sign * (LANE_M / 2), 0.015, 0);
    line.name = 'lane';
  }
  const doorX = -(modelSize.x / 2 + 0.55);
  const doorZ = modelSize.z / 2 + 0.35;
  const post = 0.08;
  const opening = 0.9;
  addBox(rig, wallMat, 2.4, STOREY_M, 0.12, doorX - 0.2, STOREY_M / 2, doorZ);
  addBox(rig, paint, post, DOOR_M, post, doorX - opening / 2, DOOR_M / 2, doorZ + 0.08);
  addBox(rig, paint, post, DOOR_M, post, doorX + opening / 2, DOOR_M / 2, doorZ + 0.08);
  addBox(rig, paint, opening + post, post, post, doorX, DOOR_M + post / 2, doorZ + 0.08);
  return rig;
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
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(1);

  const scene = new Scene();
  const model = await loadModel();
  scene.add(model);
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const tris = countTris(model);
  document.getElementById('title')!.textContent = title;

  if (mode === 'silhouette') {
    await renderSilhouette(renderer, scene, model, size, tris);
    return;
  }
  if (mode === 'scale') {
    await renderScale(renderer, scene, model, size, tris);
    return;
  }
  await renderSheet(renderer, scene, model, size, tris);
}

function sheetEnv(): CanvasTexture {
  const W = 256;
  const H = 128;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#12161c');
  grad.addColorStop(0.38, '#3a342c');
  grad.addColorStop(0.5, '#8a7048');
  grad.addColorStop(0.62, '#1a1816');
  grad.addColorStop(1, '#07080a');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const blotches: Array<[string, number, number, number, number]> = [
    ['#ff2d8c', 20, 58, 10, 5],
    ['#20d8ff', 70, 60, 14, 4],
    ['#ff8a1e', 120, 56, 8, 6],
    ['#30ffb0', 180, 62, 12, 4],
    ['#a040ff', 220, 58, 9, 5],
    ['#ffd2a8', 40, 52, 18, 3],
    ['#9ecbff', 150, 50, 16, 3],
  ];
  for (const [color, x, y, w, h] of blotches) {
    g.fillStyle = color;
    g.globalAlpha = 0.55;
    g.fillRect(x, y, w, h);
  }
  g.globalAlpha = 1;
  const tex = new CanvasTexture(cv);
  tex.mapping = EquirectangularReflectionMapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

async function renderSheet(
  renderer: WebGPURenderer, scene: Scene, model: Group, size: Vector3, tris: number,
): Promise<void> {
  const shots = sheetShots();
  const cols = 5;
  const rows = Math.ceil(shots.length / cols);
  const { w, h } = layout(cols, rows, CELL_W, TILE_H);
  renderer.setSize(w, h, false);
  const camera = new PerspectiveCamera(30, TILE_W / TILE_H, 0.05, 80);
  scene.add(camera);
  const hemi = new HemisphereLight(0x6e7c90, 0x1a120e, 0.7);
  scene.add(hemi);
  scene.environment = sheetEnv();
  const rigs = buildLights(camera);
  const nightGround = new Mesh(
    new PlaneGeometry(48, 48),
    new MeshStandardNodeMaterial({ color: 0x07080c, metalness: 0.55, roughness: 0.2 }),
  );
  nightGround.material.roughnessNode = T.mix(T.float(0.4), T.float(0.07), U.wetness);
  nightGround.rotation.x = -Math.PI / 2;
  nightGround.position.y = -0.004;
  const studioGround = nightGround.clone();
  studioGround.material = new MeshStandardNodeMaterial({ color: 0xb4b6b8, metalness: 0, roughness: 0.62 });
  const rimGround = nightGround.clone();
  rimGround.material = new MeshStandardNodeMaterial({ color: 0x05060a, metalness: 0.35, roughness: 0.55 });
  const streakMat = new MeshBasicNodeMaterial({ color: new Color(1.4, 0.12, 0.85) });
  const streak = new Mesh(new BoxGeometry(0.12, 0.01, 22), streakMat);
  streak.scale.set(1, 1, 0.08);
  streak.position.set(-6.4, 0.001, 0.4);
  const streak2 = streak.clone();
  streak2.material = new MeshBasicNodeMaterial({ color: new Color(0.15, 0.85, 1.3) });
  streak2.position.set(6.6, 0.001, -0.8);
  scene.add(nightGround, studioGround, rimGround, streak, streak2);
  const grid = new GridHelper(8, 8, 0x9aa0a6, 0x8e949a);
  grid.position.y = 0.001;
  scene.add(grid);

  document.getElementById('dims')!.textContent =
    `L ${size.z.toFixed(2)} m × W ${size.x.toFixed(2)} m × H ${size.y.toFixed(2)} m · ${tris} tris · night / rim / studio`;

  const labels = document.getElementById('labels')!;
  for (const shot of shots) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const span = document.createElement('span');
    span.textContent = shot.label;
    cell.appendChild(span);
    const file = refFile(shot.angle);
    if (file) {
      const img = document.createElement('img');
      img.src = `/harness-refs/${file}`;
      img.alt = file;
      img.style.width = `${REF_W}px`;
      cell.appendChild(img);
      const cap = document.createElement('em');
      cap.textContent = file.replace('.jpg', '');
      cell.appendChild(cap);
    }
    labels.appendChild(cell);
  }

  U.time.value = 0.22;
  const nightFog = new FogExp2(0x100e16, 0.016);
  renderer.setScissorTest(true);
  shots.forEach((shot, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * CELL_W;
    const y = row * TILE_H;
    const light = shot.light;
    rigs.night.visible = light === 'night';
    rigs.rim.visible = light === 'rim';
    rigs.studio.visible = light === 'studio';
    nightGround.visible = light === 'night';
    rimGround.visible = light === 'rim';
    studioGround.visible = light === 'studio';
    streak.visible = light === 'night';
    streak2.visible = light === 'night';
    grid.visible = light === 'studio';
    hemi.intensity = light === 'night' ? 1.55 : light === 'rim' ? 0.32 : 0.62;
    scene.environmentIntensity = light === 'night' ? 0.4 : light === 'rim' ? 0.5 : 0.22;
    hemi.color.set(light === 'studio' ? 0xc8c8c8 : light === 'rim' ? 0x1a2740 : 0x243044);
    hemi.groundColor.set(light === 'studio' ? 0x9a9a9a : 0x0c0a10);
    scene.fog = light === 'night' ? nightFog : null;
    scene.background = new Color(light === 'night' ? 0x09080d : light === 'rim' ? 0x04060c : 0xb9bbbe);
    U.wetness.value = light === 'night' ? 1 : light === 'rim' ? 0.2 : 0;
    renderer.setViewport(x, y, TILE_W, TILE_H);
    renderer.setScissor(x, y, TILE_W, TILE_H);
    renderer.setClearColor(scene.background, 1);
    shot.pose(camera);
    renderer.render(scene, camera);
    renderer.setViewport(x + TILE_W, y, REF_W, TILE_H);
    renderer.setScissor(x + TILE_W, y, REF_W, TILE_H);
    renderer.setClearColor(0x07080c, 1);
    renderer.clear();
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

async function renderSilhouette(
  renderer: WebGPURenderer, scene: Scene, model: Group, size: Vector3, tris: number,
): Promise<void> {
  paintWhite(model);
  const list = panels();
  const w = Math.max(...list.map((p) => p.x + p.w));
  const h = Math.max(...list.map((p) => p.y + p.h));
  layout(1, 1, w, h);
  const labels = document.getElementById('labels')!;
  labels.style.display = 'block';
  for (const panel of list) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.style.position = 'absolute';
    cell.style.left = `${panel.x}px`;
    cell.style.top = `${panel.y}px`;
    cell.style.width = `${panel.w}px`;
    cell.style.height = `${panel.h}px`;
    const span = document.createElement('span');
    span.textContent = `${panel.id} · ${panel.note}`;
    cell.appendChild(span);
    labels.appendChild(cell);
  }
  renderer.setSize(w, h, false);
  scene.background = new Color(0x000000);
  scene.fog = null;
  document.getElementById('dims')!.textContent =
    `L ${size.z.toFixed(2)} × W ${size.x.toFixed(2)} × H ${size.y.toFixed(2)} m · ortho mask · ${tris} tris`;
  const cams = { side: sideCamera(), front: frontCamera(), top: topCamera() };
  renderer.setScissorTest(true);
  renderer.setClearColor(0x000000, 1);
  for (const panel of list) {
    renderer.setViewport(panel.x, panel.y, panel.w, panel.h);
    renderer.setScissor(panel.x, panel.y, panel.w, panel.h);
    renderer.render(scene, cams[panel.id]);
  }
  window.__harness = {
    done: true, error: null, size: { x: size.x, y: size.y, z: size.z }, tris, mode, tiles: [], panels: list, scale: null,
  };
}

async function renderScale(
  renderer: WebGPURenderer, scene: Scene, model: Group, size: Vector3, tris: number,
): Promise<void> {
  const cellW = 860;
  const cellH = 480;
  const { w, h } = layout(2, 1, cellW, cellH);
  renderer.setSize(w, h, false);
  scene.add(buildScaleProps(size));
  const ground = new Mesh(
    new PlaneGeometry(40, 40),
    new MeshStandardNodeMaterial({ color: 0xb7b9bb, metalness: 0, roughness: 0.7 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const grid = new GridHelper(16, 16, 0x5c6168, 0x8e949a);
  grid.position.y = 0.002;
  scene.add(grid);
  const hemi = new HemisphereLight(0xd0d4dc, 0x8a8e94, 0.55);
  scene.add(hemi);
  const key = new DirectionalLight(0xffffff, 3.2);
  key.position.set(-4, 8, -3);
  scene.add(key);
  const fill = new DirectionalLight(0xd5dbe8, 1.4);
  fill.position.set(5, 3, 4);
  scene.add(fill);
  scene.background = new Color(0xc5c7ca);
  const ratios = {
    heightOverFigure: size.y / FIGURE_M,
    widthOverLane: size.x / LANE_M,
    heightOverDoor: size.y / DOOR_M,
    heightOverStorey: size.y / STOREY_M,
  };
  document.getElementById('dims')!.textContent =
    `spinner L ${size.z.toFixed(2)} × W ${size.x.toFixed(2)} × H ${size.y.toFixed(2)} m`
    + ` · figure ${FIGURE_M.toFixed(2)} (H/figure ${ratios.heightOverFigure.toFixed(2)})`
    + ` · lane ${LANE_M.toFixed(2)} (W/lane ${ratios.widthOverLane.toFixed(2)})`
    + ` · door ${DOOR_M.toFixed(2)} (H/door ${ratios.heightOverDoor.toFixed(2)})`
    + ` · storey ${STOREY_M.toFixed(2)} · ${tris} tris`;
  const labels = document.getElementById('labels')!;
  for (const name of ['side · 1 m grid', 'front quarter · lane 3.7 m']) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const span = document.createElement('span');
    span.textContent = name;
    cell.appendChild(span);
    labels.appendChild(cell);
  }
  const side = new PerspectiveCamera(22, cellW / cellH, 0.05, 80);
  side.position.set(16, 1.7, 0.2);
  side.lookAt(0, 0.75, 0.4);
  const quarter = new PerspectiveCamera(28, cellW / cellH, 0.05, 80);
  quarter.position.set(-7.5, 2.4, -9);
  quarter.lookAt(0, 0.7, 0.4);
  renderer.setScissorTest(true);
  renderer.setClearColor(0xc5c7ca, 1);
  [side, quarter].forEach((cam, i) => {
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
      figure: FIGURE_M,
      lane: LANE_M,
      door: DOOR_M,
      storey: STOREY_M,
      spinner: { length: size.z, width: size.x, height: size.y },
      ratios,
    },
  };
}

main().catch((err) => {
  console.error(err);
  window.__harness = {
    done: false, error: String(err), size: null, tris: 0, mode, tiles: [], panels: [], scale: null,
  };
});
