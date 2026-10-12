// Planar wet-street mirror. One reflector under the camera, high/ultra on a real GPU only —
// it re-renders the scene, which SwiftShader cannot afford. `?refl=1` forces it, `?refl=0` disables it.
// The normal of a ReflectorNode is the target's local +Z, so the mesh is pitched onto its back.
import { Mesh, MeshBasicNodeMaterial, PlaneGeometry } from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { Scene } from 'three/webgpu';
import { U } from './uniforms';

const T = TSL as any;
const { reflector, vec4, vec3, float, mix, positionWorld, smoothstep, mx_noise_float, sin, max } = T;

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
    const mirror = reflector({ resolutionScale: 0.18, bounces: false, generateMipmaps: false });
    const w = positionWorld;
    const warp = mx_noise_float(vec3(w.x.mul(0.05), w.z.mul(0.05), float(2)));
    const alongX = mx_noise_float(vec3(w.x.mul(0.03), w.z.mul(0.55), float(4)));
    const alongZ = mx_noise_float(vec3(w.x.mul(0.55), w.z.mul(0.03), float(9)));
    const rib = sin(w.x.mul(0.85).add(w.z.mul(0.22)).add(warp.mul(3.2)));
    const ribbons = max(alongX, alongZ);
    const streak = smoothstep(float(0.58), float(0.82), ribbons.mul(0.7).add(rib.mul(0.5).add(0.5).mul(0.3)));
    const dark = mirror.rgb.mul(float(0.8)).mul(mix(vec3(1, 1, 1), vec3(0.5, 0.6, 0.76), U.night));
    mat.colorNode = vec4(dark, streak.mul(float(0.88)).mul(U.wetness));
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
