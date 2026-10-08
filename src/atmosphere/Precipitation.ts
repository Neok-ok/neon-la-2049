// GPU-animated rain streaks / snow flakes in a box that wraps around the camera. No CPU per-particle work.
import { BufferGeometry, BufferAttribute, Mesh, MeshBasicNodeMaterial, AdditiveBlending, NormalBlending, Vector3 } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from './uniforms';

const T = TSL as any;
const { Fn, attribute, uniform, vec3, floor, normalize, cross, sin, cameraPosition, length, smoothstep, float, mix } = T;

export type PrecipKind = 'rain' | 'snow';

export class Precipitation {
  readonly mesh: Mesh;
  readonly max: number;
  private uCam = uniform(new Vector3());
  private uWind = uniform(new Vector3());
  private uDrift = uniform(new Vector3());

  constructor(readonly kind: PrecipKind, max: number) {
    this.max = max;
    const isRain = kind === 'rain';
    const box = isRain ? new Vector3(70, 50, 70) : new Vector3(60, 40, 60);
    const g = new BufferGeometry();
    const corner = new Float32Array(max * 4 * 2);
    const rand = new Float32Array(max * 4 * 4);
    const pos = new Float32Array(max * 4 * 3);
    const idx = new Uint32Array(max * 6);
    const cs = [-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 1];
    for (let i = 0; i < max; i++) {
      const r = [Math.random(), Math.random(), Math.random(), Math.random()];
      for (let k = 0; k < 4; k++) {
        corner.set([cs[k * 2], cs[k * 2 + 1]], (i * 4 + k) * 2);
        rand.set(r, (i * 4 + k) * 4);
      }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('corner', new BufferAttribute(corner, 2));
    g.setAttribute('rand', new BufferAttribute(rand, 4));
    g.setIndex(new BufferAttribute(idx, 1));

    const m = new MeshBasicNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.blending = isRain ? AdditiveBlending : NormalBlending;
    m.fog = false;
    const speed = isRain ? 11 : 1.3;
    const len = isRain ? 0.9 : 0.06;
    const width = isRain ? 0.012 : 0.06;
    const boxN = vec3(box.x, box.y, box.z);

    const center = Fn(() => {
      const r = attribute('rand', 'vec4');
      const t = U.time;
      const fall = t.mul(speed).mul(r.w.mul(0.4).add(0.8));
      let p = r.xyz.mul(boxN).add(vec3(this.uDrift.x, fall.negate(), this.uDrift.z));
      if (!isRain) {
        p = p.add(vec3(sin(t.mul(0.9).add(r.x.mul(40.0))).mul(0.6), 0, sin(t.mul(0.7).add(r.y.mul(40.0))).mul(0.6)));
      }
      const rel = p.sub(this.uCam).add(boxN.mul(0.5));
      const wrapped = rel.sub(boxN.mul(floor(rel.div(boxN)))).sub(boxN.mul(0.5));
      return this.uCam.add(wrapped);
    })();

    m.positionNode = Fn(() => {
      const c = attribute('corner', 'vec2');
      const vel = normalize(vec3(this.uWind.x, float(-speed), this.uWind.z));
      const toCam = normalize(cameraPosition.sub(center));
      const side = normalize(cross(vel, toCam));
      const up = isRain ? vel : normalize(cross(toCam, side));
      const l = isRain ? float(len) : float(width);
      return center.add(side.mul(c.x.mul(width * 2))).add(up.mul(c.y.sub(0.5).mul(l)));
    })();

    m.colorNode = Fn(() => {
      const d = length(center.sub(cameraPosition));
      const fade = smoothstep(0.5, 2.5, d).mul(smoothstep(box.x * 0.5, box.x * 0.25, d));
      const base = isRain ? U.fogColor.mul(2.2).add(vec3(0.05, 0.06, 0.07)) : mix(vec3(0.75, 0.78, 0.85), U.fogColor.mul(3.0), 0.3);
      const a = isRain ? fade.mul(0.55) : fade.mul(0.85);
      return T.vec4(base.add(vec3(U.lightning)), a);
    })();

    this.mesh = new Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = `precip-${kind}`;
  }

  update(dt: number, camPos: Vector3, intensity: number, wind: number, windDir: number, budget: number): void {
    (this.uCam.value as Vector3).copy(camPos);
    const wv = this.uWind.value as Vector3;
    wv.set(Math.cos(windDir) * wind, 0, Math.sin(windDir) * wind);
    const drift = this.uDrift.value as Vector3;
    drift.addScaledVector(wv, this.kind === 'snow' ? dt * 0.6 : dt);
    if (Math.abs(drift.x) > 1e4 || Math.abs(drift.z) > 1e4) drift.set(0, 0, 0);
    const n = Math.floor(Math.min(this.max, budget) * Math.min(1, intensity));
    this.mesh.geometry.setDrawRange(0, n * 6);
    this.mesh.visible = n > 0;
  }
}
