// One model, no city. Eight orbit angles and two close-ups, night-rain and grey studio,
// tiled into #sheet. Playwright screenshots that element. Lights live on the camera so a
// rear view is still readable.
import {
  ACESFilmicToneMapping, Box3, BoxGeometry, Color, DirectionalLight, FogExp2, GridHelper,
  Group, HemisphereLight, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial,
  PerspectiveCamera, PlaneGeometry, PointLight, Scene, SRGBColorSpace, Vector3, WebGPURenderer,
} from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../../src/atmosphere/uniforms';
import { createLegacySpinnerMesh, loadSpinnerFile } from '../../../src/vehicles/spinnerModel';

const T = TSL as any;
const TILE_W = 480;
const TILE_H = 270;
const COLS = 5;
const ROWS = 4;

declare global {
  interface Window {
    __harness?: { done: boolean; error: string | null; size: { x: number; y: number; z: number } | null; tris: number };
  }
}

const params = new URLSearchParams(location.search);
const src = params.get('src') ?? 'legacy';
const title = params.get('title') ?? src;

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
  camera.position.set(0.4, 0.78, -3.15);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0.55, -1.7);
  camera.fov = 32;
  camera.updateProjectionMatrix();
}

function closeThruster(camera: PerspectiveCamera): void {
  camera.position.set(1.55, 0.62, 2.55);
  camera.up.set(0, 1, 0);
  camera.lookAt(0.85, 0.4, 1.35);
  camera.fov = 34;
  camera.updateProjectionMatrix();
}

const YAWS = [0, 45, 90, 135, 180, 225, 270, 315];

function tiles(): { label: string; night: boolean; pose: (camera: PerspectiveCamera) => void }[] {
  const out = [];
  for (const night of [true, false]) {
    const light = night ? 'night' : 'studio';
    for (const yaw of YAWS) {
      out.push({ label: `${light} · ${yaw}°`, night, pose: (c: PerspectiveCamera) => orbit(yaw, c) });
    }
    out.push({ label: `${light} · nose`, night, pose: closeNose });
    out.push({ label: `${light} · thruster`, night, pose: closeThruster });
  }
  return out;
}

function dir(parent: Group, color: number, intensity: number, from: Vector3, to: Vector3): void {
  const light = new DirectionalLight(color, intensity);
  light.position.copy(from);
  light.target.position.copy(to);
  parent.add(light, light.target);
}

function buildLights(camera: PerspectiveCamera): { night: Group; studio: Group } {
  const night = new Group();
  const studio = new Group();
  camera.add(night, studio);
  // Dark metal at albedo ~0.01 needs a hard key or the night row is a black frame.
  dir(night, 0xfff1dc, 18, new Vector3(-1.8, 2.8, 0.3), new Vector3(0, 0.3, -1));
  dir(night, 0xd5dde8, 12, new Vector3(0.3, 1.4, 1.6), new Vector3(0, 0.35, -3));
  dir(night, 0xb7c4d6, 5, new Vector3(2.0, 0.7, 0.5), new Vector3(0, 0.2, -1));
  night.add(new PointLight(0xff2eb8, 140, 0, 2).translateX(-2.2).translateY(0.3).translateZ(-1.2));
  night.add(new PointLight(0x3dfff0, 120, 0, 2).translateX(2.2).translateY(0.5).translateZ(-1.1));
  night.add(new PointLight(0xff8a32, 55, 0, 2).translateY(-1.1).translateZ(-1.4));
  dir(studio, 0xffffff, 5.5, new Vector3(-2.2, 2.6, 0.6), new Vector3(0, 0.3, -1));
  dir(studio, 0xd5d8de, 2.0, new Vector3(2.0, 0.6, 0.2), new Vector3(0, 0.2, -1));
  dir(studio, 0xffffff, 2.6, new Vector3(0.4, 1.8, -2.4), new Vector3(0, 0.4, -1));
  return { night, studio };
}

async function loadModel(): Promise<Group> {
  if (src === 'legacy') return createLegacySpinnerMesh();
  const url = src.startsWith('/') || src.startsWith('http') ? src : `/${src.replace(/^\.\//, '')}`;
  return loadSpinnerFile(url);
}

async function main(): Promise<void> {
  window.__harness = { done: false, error: null, size: null, tris: 0 };
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
  await renderer.init();
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(1);
  renderer.setSize(TILE_W * COLS, TILE_H * ROWS, false);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, TILE_W / TILE_H, 0.05, 80);
  scene.add(camera);
  const hemi = new HemisphereLight(0x6e7c90, 0x1a120e, 0.7);
  scene.add(hemi);
  const rigs = buildLights(camera);

  const nightGround = new Mesh(
    new PlaneGeometry(48, 48),
    new MeshStandardNodeMaterial({ color: 0x07080c, metalness: 0.55, roughness: 0.2 }),
  );
  nightGround.material.roughnessNode = T.mix(T.float(0.4), T.float(0.07), U.wetness);
  nightGround.rotation.x = -Math.PI / 2;
  nightGround.position.y = -0.004;
  const studioGround = new Mesh(
    new PlaneGeometry(48, 48),
    new MeshStandardNodeMaterial({ color: 0xb4b6b8, metalness: 0, roughness: 0.62 }),
  );
  studioGround.rotation.x = -Math.PI / 2;
  studioGround.position.y = -0.004;
  const streakMat = new MeshBasicNodeMaterial({ color: new Color(1.4, 0.12, 0.85) });
  const streak = new Mesh(new BoxGeometry(0.12, 0.01, 22), streakMat);
  streak.scale.z = 0.22;
  streak.position.set(-4.2, 0.001, 6.5);
  const streak2 = streak.clone();
  streak2.material = new MeshBasicNodeMaterial({ color: new Color(0.15, 0.85, 1.3) });
  streak2.position.set(4.2, 0.001, -6.5);
  scene.add(nightGround, studioGround, streak, streak2);
  const grid = new GridHelper(8, 8, 0x9aa0a6, 0x8e949a);
  grid.position.y = 0.001;
  scene.add(grid);

  const model = await loadModel();
  scene.add(model);
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  let tris = 0;
  model.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    tris += g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
  });

  const dims = document.getElementById('dims')!;
  document.getElementById('title')!.textContent = title;
  dims.textContent = `L ${size.z.toFixed(2)} m × W ${size.x.toFixed(2)} m × H ${size.y.toFixed(2)} m · ${Math.round(tris)} tris`;

  const labels = document.getElementById('labels')!;
  const shots = tiles();
  for (const shot of shots) {
    const cell = document.createElement('div');
    const span = document.createElement('span');
    span.textContent = shot.label;
    cell.appendChild(span);
    labels.appendChild(cell);
  }

  U.time.value = 0.22;
  const nightFog = new FogExp2(0x100e16, 0.016);
  renderer.setScissorTest(true);
  shots.forEach((shot, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * TILE_W;
    // WebGLBackend flips viewport Y, so this origin is the top of the sheet.
    const y = row * TILE_H;
    const night = shot.night;
    rigs.night.visible = night;
    rigs.studio.visible = !night;
    nightGround.visible = night;
    streak.visible = night;
    streak2.visible = night;
    studioGround.visible = !night;
    grid.visible = !night;
    hemi.intensity = night ? 1.05 : 0.35;
    hemi.color.set(night ? 0x243044 : 0xc8c8c8);
    hemi.groundColor.set(night ? 0x140c10 : 0x9a9a9a);
    scene.fog = night ? nightFog : null;
    scene.background = new Color(night ? 0x09080d : 0xb9bbbe);
    U.wetness.value = night ? 1 : 0;
    renderer.setViewport(x, y, TILE_W, TILE_H);
    renderer.setScissor(x, y, TILE_W, TILE_H);
    renderer.setClearColor(scene.background, 1);
    shot.pose(camera);
    renderer.render(scene, camera);
  });

  window.__harness = {
    done: true,
    error: null,
    size: { x: size.x, y: size.y, z: size.z },
    tris: Math.round(tris),
  };
}

main().catch((err) => {
  console.error(err);
  window.__harness = { done: false, error: String(err), size: null, tris: 0 };
});
