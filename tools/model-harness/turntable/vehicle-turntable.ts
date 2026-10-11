// Contact sheet for a ground car or hauler. Does not load the player spinner.
// Night row is rim-lit. Studio row keeps the same mesh next to a 1.80 m figure,
// a 3.60 m lane and a 2.20 × 1.00 m door.
import {
  ACESFilmicToneMapping, Box3, BoxGeometry, Color, DirectionalLight, FogExp2, Group,
  HemisphereLight, Mesh, MeshStandardMaterial, MeshStandardNodeMaterial, PerspectiveCamera,
  PlaneGeometry, Scene, SRGBColorSpace, Vector3, WebGPURenderer, type Material, type Object3D,
} from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as TSL from 'three/tsl';
import { U } from '../../../src/atmosphere/uniforms';

const T = TSL as any;
const TILE_W = 480;
const TILE_H = 270;
const COLS = 4;
const ROWS = 2;
const PERSON = 1.8;
const LANE = 3.6;
const DOOR_W = 1.0;
const DOOR_H = 2.2;

declare global {
  interface Window {
    __harness?: { done: boolean; error: string | null; size: { x: number; y: number; z: number } | null; tris: number };
  }
}

const params = new URLSearchParams(location.search);
const src = params.get('src') ?? '/models/traffic/car-high.glb';
const title = params.get('title') ?? src;

function present(root: Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const raw = mesh.material as Material | Material[];
    const srcMat = (Array.isArray(raw) ? raw[0] : raw) as MeshStandardMaterial;
    const dry = typeof srcMat.roughness === 'number' ? srcMat.roughness : 0.45;
    const m = new MeshStandardNodeMaterial({
      color: srcMat.color?.clone() ?? new Color(0x111111),
      metalness: typeof srcMat.metalness === 'number' ? srcMat.metalness : 0.6,
      roughness: dry,
      emissive: srcMat.emissive?.clone() ?? new Color(0x000000),
      emissiveIntensity: typeof srcMat.emissiveIntensity === 'number' ? srcMat.emissiveIntensity : 1,
      name: srcMat.name,
    });
    m.roughnessNode = T.mix(T.float(dry), T.float(0.14), U.wetness);
    const list = Array.isArray(raw) ? raw : [raw];
    list.forEach((mat) => mat.dispose());
    mesh.material = m;
    mesh.frustumCulled = false;
  });
}

async function loadModel(): Promise<Group> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  await MeshoptDecoder.ready;
  const url = src.startsWith('/') || src.startsWith('http') ? src : `/${src.replace(/^\.\//, '')}`;
  const gltf = await loader.loadAsync(url);
  present(gltf.scene);
  return gltf.scene;
}

function mannequin(): Group {
  const g = new Group();
  g.name = 'scale-person';
  const mat = new MeshStandardNodeMaterial({ color: 0xc8c2b4, roughness: 0.62, metalness: 0 });
  const add = (w: number, h: number, d: number, y: number) => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), mat);
    mesh.position.y = y;
    g.add(mesh);
  };
  add(0.22, 0.86, 0.16, 0.43);
  add(0.42, 0.58, 0.22, 1.15);
  add(0.22, 0.26, 0.2, 1.67);
  return g;
}

function doorFrame(): Group {
  const g = new Group();
  g.name = 'scale-door';
  const mat = new MeshStandardNodeMaterial({ color: 0x8a6a3a, roughness: 0.55, metalness: 0.05 });
  const jamb = (x: number) => {
    const mesh = new Mesh(new BoxGeometry(0.06, DOOR_H, 0.06), mat);
    mesh.position.set(x, DOOR_H / 2, 0);
    g.add(mesh);
  };
  jamb(-DOOR_W / 2);
  jamb(DOOR_W / 2);
  const head = new Mesh(new BoxGeometry(DOOR_W + 0.06, 0.06, 0.06), mat);
  head.position.y = DOOR_H;
  g.add(head);
  return g;
}

function laneStripes(length: number): Group {
  const g = new Group();
  g.name = 'scale-lane';
  const mat = new MeshStandardNodeMaterial({ color: 0xd7a15a, roughness: 0.45, metalness: 0.1, emissive: 0x3a2410, emissiveIntensity: 0.4 });
  for (const side of [-1, 1]) {
    const mesh = new Mesh(new BoxGeometry(0.06, 0.012, length + 6), mat);
    mesh.position.set(side * LANE / 2, 0.008, 0);
    g.add(mesh);
  }
  return g;
}

function dir(parent: Group, color: number, intensity: number, from: Vector3, to: Vector3): void {
  const light = new DirectionalLight(color, intensity);
  light.position.copy(from);
  light.target.position.copy(to);
  parent.add(light, light.target);
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
  const camera = new PerspectiveCamera(32, TILE_W / TILE_H, 0.05, 200);
  scene.add(camera);
  const hemi = new HemisphereLight(0x6e7c90, 0x1a120e, 0.7);
  scene.add(hemi);

  const night = new Group();
  const studio = new Group();
  camera.add(night, studio);
  dir(night, 0xfff1dc, 22, new Vector3(-2.4, 3.2, -1.2), new Vector3(0, 0.6, 0));
  dir(night, 0xc5d4e8, 14, new Vector3(2.2, 1.6, 2.4), new Vector3(0, 0.5, 0));
  dir(night, 0x9eb0c8, 6, new Vector3(0.4, 2.4, -3.2), new Vector3(0, 0.4, 0));
  dir(studio, 0xffffff, 6, new Vector3(-2.4, 3.4, 1.2), new Vector3(0, 0.6, 0));
  dir(studio, 0xd5d8de, 2.4, new Vector3(2.2, 1.2, -1.4), new Vector3(0, 0.4, 0));

  const model = await loadModel();
  scene.add(model);
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const lookY = Math.min(1.1, size.y * 0.45);
  let tris = 0;
  model.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    tris += g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
  });

  const person = mannequin();
  person.position.set(size.x / 2 + 0.55, 0, 0.2);
  const door = doorFrame();
  door.position.set(-(size.x / 2 + 0.85), 0, -0.3);
  const lane = laneStripes(size.z);
  scene.add(person, door, lane);

  const nightGround = new Mesh(
    new PlaneGeometry(80, 80),
    new MeshStandardNodeMaterial({ color: 0x07080c, metalness: 0.55, roughness: 0.2 }),
  );
  nightGround.material.roughnessNode = T.mix(T.float(0.4), T.float(0.07), U.wetness);
  nightGround.rotation.x = -Math.PI / 2;
  const studioGround = new Mesh(
    new PlaneGeometry(80, 80),
    new MeshStandardNodeMaterial({ color: 0xb4b6b8, metalness: 0, roughness: 0.62 }),
  );
  studioGround.rotation.x = -Math.PI / 2;
  scene.add(nightGround, studioGround);

  const reach = Math.max(size.x, size.y, size.z, 4);
  const shots: { label: string; night: boolean; pose: (c: PerspectiveCamera) => void }[] = [];
  const orbit = (yawDeg: number, elevDeg: number, distMul: number) => (c: PerspectiveCamera) => {
    const yaw = yawDeg * Math.PI / 180;
    const elev = elevDeg * Math.PI / 180;
    const dist = reach * distMul;
    const horiz = Math.cos(elev) * dist;
    c.position.set(Math.sin(yaw) * horiz, Math.sin(elev) * dist + lookY * 0.25, -Math.cos(yaw) * horiz);
    c.up.set(0, 1, 0);
    c.lookAt(0, lookY, 0);
    c.fov = 32;
    c.updateProjectionMatrix();
  };
  const top = (c: PerspectiveCamera) => {
    c.position.set(0, reach * 1.35, 0.02);
    c.up.set(0, 0, -1);
    c.lookAt(0, 0, 0);
    c.fov = 36;
    c.updateProjectionMatrix();
  };
  for (const isNight of [true, false]) {
    const light = isNight ? 'night' : 'studio';
    shots.push(
      { label: `${light} · front 3/4`, night: isNight, pose: orbit(32, 16, 1.15) },
      { label: `${light} · side`, night: isNight, pose: orbit(90, 12, 1.2) },
      { label: `${light} · rear 3/4`, night: isNight, pose: orbit(210, 14, 1.15) },
      { label: `${light} · top`, night: isNight, pose: top },
    );
  }

  document.getElementById('title')!.textContent = title;
  document.getElementById('dims')!.textContent =
    `L ${size.z.toFixed(2)} × W ${size.x.toFixed(2)} × H ${size.y.toFixed(2)} m · person ${PERSON.toFixed(2)} · lane ${LANE.toFixed(2)} · door ${DOOR_H.toFixed(2)}×${DOOR_W.toFixed(2)} · ${Math.round(tris)} tris`;
  const labels = document.getElementById('labels')!;
  for (const shot of shots) {
    const cell = document.createElement('div');
    const span = document.createElement('span');
    span.textContent = shot.label;
    cell.appendChild(span);
    labels.appendChild(cell);
  }

  const nightFog = new FogExp2(0x100e16, 0.012);
  renderer.setScissorTest(true);
  shots.forEach((shot, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    night.visible = shot.night;
    studio.visible = !shot.night;
    nightGround.visible = shot.night;
    studioGround.visible = !shot.night;
    hemi.intensity = shot.night ? 0.85 : 0.4;
    hemi.color.set(shot.night ? 0x243044 : 0xc8c8c8);
    hemi.groundColor.set(shot.night ? 0x140c10 : 0x9a9a9a);
    scene.fog = shot.night ? nightFog : null;
    scene.background = new Color(shot.night ? 0x09080d : 0xb9bbbe);
    U.wetness.value = shot.night ? 1 : 0;
    U.night.value = shot.night ? 1 : 0;
    renderer.setViewport(col * TILE_W, row * TILE_H, TILE_W, TILE_H);
    renderer.setScissor(col * TILE_W, row * TILE_H, TILE_W, TILE_H);
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
