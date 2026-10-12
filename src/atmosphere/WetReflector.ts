// Planar wet-street mirror. One reflector under the camera, high/ultra on a real GPU only —
// it re-renders the scene, which SwiftShader cannot afford. `?refl=1` forces it, `?refl=0` disables it.
// The normal of a ReflectorNode is the target's local +Z, so the mesh is pitched onto its back.
import { Mesh, MeshBasicNodeMaterial, PlaneGeometry } from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { Scene } from 'three/webgpu';
import { U } from './uniforms';

const T = TSL as any;
const {
  reflector, vec4, vec3, vec2, float, mix, positionWorld, cameraPosition,
  smoothstep, mx_noise_float, sin, max, length,
} = T;

export class WetReflector {
  readonly mesh: Mesh;
  private active = false;

  constructor(scene: Scene) {
    const geo = new PlaneGeometry(64, 64);
    const mat = new MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
    // Quarter-res so a streak is a smear, not a readable sign. Gaps stay the road.
    // mx_noise_float is about -1..1. Remap before the threshold or the mask stays shut.
    const mirror = reflector({ resolutionScale: 0.18, bounces: false, generateMipmaps: false });
    const w = positionWorld;
    const cam = cameraPosition;
    const vx = cam.x.sub(w.x);
    const vz = cam.z.sub(w.z);
    const horiz = max(length(vec2(vx, vz)), float(0.001));
    const fx = vx.div(horiz);
    const fz = vz.div(horiz);
    const across = w.x.mul(fz).sub(w.z.mul(fx));
    const along = w.x.mul(fx).add(w.z.mul(fz));
    const warp = mx_noise_float(vec3(across.mul(0.08), along.mul(0.03), float(2))).mul(0.5).add(0.5);
    const wave = sin(across.mul(1.35).add(warp.mul(4.0))).mul(0.5).add(0.5);
    const dash = mx_noise_float(vec3(along.mul(0.09), across.mul(0.02), float(6))).mul(0.5).add(0.5);
    const streak = smoothstep(float(0.72), float(0.94), wave).mul(smoothstep(float(0.28), float(0.58), dash));
    const dark = mirror.rgb.mul(float(0.66)).mul(mix(vec3(1, 1, 1), vec3(0.55, 0.64, 0.78), U.night));
    mat.colorNode = vec4(dark, streak.mul(float(0.84)).mul(U.wetness));
    this.mesh = new Mesh(geo, mat);
    this.mesh.name = 'wet-reflector';
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    this.mesh.add(mirror.target);
    scene.add(this.mesh);
  }

  get enabled(): boolean {
    return this.active;
  }

  place(x: number, y: number, z: number, on: boolean): void {
    this.mesh.visible = on;
    this.active = on;
    U.reflMix.value = on ? 1 : 0;
    if (on) this.mesh.position.set(x, y + 0.03, z);
  }
}
