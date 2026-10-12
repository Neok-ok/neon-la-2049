// Planar wet-street mirror. One reflector under the camera, high/ultra on a real GPU only —
// it re-renders the scene, which SwiftShader cannot afford. `?refl=1` forces it, `?refl=0` disables it.
// The normal of a ReflectorNode is the target's local +Z, so the mesh is pitched onto its back.
import { Mesh, MeshBasicNodeMaterial, PlaneGeometry } from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { Scene } from 'three/webgpu';
import { U } from './uniforms';

const T = TSL as any;
const { reflector, vec4, vec3, float, mix, positionWorld, smoothstep, mx_noise_float, sin } = T;

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
    const mirror = reflector({ resolutionScale: 0.22, bounces: false, generateMipmaps: false });
    // Broken dark streaks. The asphalt between them stays the road, not a copy of the signs.
    const w = positionWorld;
    const grain = mx_noise_float(vec3(w.x.mul(0.09), w.z.mul(0.31), float(3)));
    const cross = mx_noise_float(vec3(w.x.mul(0.37), w.z.mul(0.07), float(8)));
    const rib = sin(w.x.mul(0.42).add(w.z.mul(0.16)));
    const streak = smoothstep(0.38, 0.7, grain.mul(0.62).add(cross.mul(0.38)).add(rib.mul(0.07)));
    const dark = mirror.rgb.mul(float(0.3)).mul(mix(vec3(1, 1, 1), vec3(0.62, 0.72, 0.86), U.night));
    mat.colorNode = vec4(dark, streak.mul(float(0.6)).mul(U.wetness));
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
