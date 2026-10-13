// GPU-animated rain streaks / snow flakes in a box that wraps around the camera. No CPU per-particle work.
import { BufferGeometry, BufferAttribute, Mesh, MeshBasicNodeMaterial, AdditiveBlending, NormalBlending, Vector3 } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { BOKEH } from '../photo/bokeh';
import { Rng, visualSeed } from '../core/rng';
import { U } from './uniforms';
import { lightGain, lightTint } from './airLights';

const T = TSL as any;
const { Fn, attribute, uniform, vec3, floor, normalize, cross, sin, cameraPosition, length, smoothstep, float, mix } = T;

export type PrecipKind = 'rain' | 'snow';

export class Precipitation {
  readonly mesh: Mesh;
  readonly max: number;
  private uCam = uniform(new Vector3());
  private uWind = uniform(new Vector3());
  private uDrift = uniform(new Vector3());

  private uFocus = uniform(12);
  private uFocal = uniform(35);
  private uFStop = uniform(4);
  private uSensor = uniform(24);
  private uViewH = uniform(720);
  private uMaxPx = uniform(32);
  private uLens = uniform(0);
  private uRadPerPx = uniform(0.001);

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
    const seeded = visualSeed(`precip-${kind}`);
    const rng = seeded === undefined ? null : new Rng(seeded);
    for (let i = 0; i < max; i++) {
      const r = rng
        ? [rng.next(), rng.next(), rng.next(), rng.next()]
        : [Math.random(), Math.random(), Math.random(), Math.random()];
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

    const streakCoc = (distNode: ReturnType<typeof length>) => {
      const f = T.max(this.uFocal, float(1));
      const nStop = T.max(this.uFStop, float(1.1));
      const focusM = T.max(this.uFocus, float(0.35));
      const distM = T.max(distNode, float(0.35));
      const rel = T.abs(distM.sub(focusM)).div(T.max(focusM, float(1)));
      const farther = T.smoothstep(float(0), float(0.02), distM.sub(focusM));
      // Rain sits in a box around the camera, so the near side has to open inside that box.
      // The scene curve stays gentler so a sign on the focus plane does not melt with the drops.
      const nearFall = T.smoothstep(float(0.1), float(0.48), rel);
      const farFall = T.smoothstep(float(BOKEH.far0), float(BOKEH.far1), rel);
      const falloff = T.mix(nearFall, farFall, farther);
      const stop = T.smoothstep(float(BOKEH.stopHi), float(BOKEH.stopLo), nStop);
      const focalW = T.smoothstep(float(BOKEH.focalLo), float(BOKEH.focalHi), f);
      return falloff.mul(stop).mul(focalW).mul(this.uMaxPx).mul(this.uLens);
    };

    m.positionNode = Fn(() => {
      const c = attribute('corner', 'vec2');
      // Tilt follows the wind. lightGain below samples `center`, the streak's
      // un-rotated position, so a coastal lean does not move the light lookup.
      const vel = normalize(vec3(this.uWind.x, float(-speed), this.uWind.z));
      const toCam = normalize(cameraPosition.sub(center));
      const side = normalize(cross(vel, toCam));
      const up = isRain ? vel : normalize(cross(toCam, side));
      const stretch = isRain ? float(1).add(lightGain(center).mul(U.rainReact).mul(1.45)) : float(1);
      const l = isRain ? float(len).mul(stretch) : float(width);
      const distM = length(center.sub(cameraPosition));
      const coc = isRain ? streakCoc(distM) : float(0);
      const baseW = float(width * 2);
      const diameter = T.min(coc.mul(distM).mul(this.uRadPerPx).mul(2), float(1.1));
      const fullW = T.max(baseW, diameter);
      return center.add(side.mul(c.x.mul(fullW))).add(up.mul(c.y.sub(0.5).mul(l)));
    })();

    m.colorNode = Fn(() => {
      const d = length(center.sub(cameraPosition));
      const fade = smoothstep(0.5, 2.5, d).mul(smoothstep(box.x * 0.25, box.x * 0.5, d).oneMinus());
      const coc = isRain ? streakCoc(d) : float(0);
      const baseW = float(width * 2);
      const diameter = T.min(coc.mul(d).mul(this.uRadPerPx).mul(2), float(1.1));
      const span = T.max(baseW, diameter).div(baseW);
      const magCyan = vec3(1.0, 0.22, 0.48).mul(0.55).add(vec3(0.2, 0.75, 1.0).mul(0.45));
      const neon = mix(magCyan, vec3(1.0, 0.58, 0.22), U.sheen);
      const rainCol = U.fogColor.mul(2.2).add(vec3(0.05, 0.06, 0.07));
      let base = isRain ? mix(rainCol, neon, U.neonWet.mul(U.night).mul(0.65)) : mix(vec3(0.75, 0.78, 0.85), U.fogColor.mul(3.0), 0.3);
      // Unlit streaks were a fraction of a nit, so a dark facade hid the rain.
      // The floor stays under the 32-nit bloom threshold.
      if (isRain) base = T.max(base, vec3(6.5, 7.5, 9.0));
      let a = isRain ? fade.mul(0.55) : fade.mul(0.85);
      if (isRain) {
        const gain = lightGain(center).mul(U.rainReact);
        base = base.add(lightTint(center).mul(gain).mul(1.5));
        a = a.mul(float(1).add(gain.mul(0.8)));
      }
      if (isRain) {
        const across = T.abs(attribute('corner', 'vec2').x);
        const soft = smoothstep(float(0.5), float(0.05), across);
        // Spread the drop, but keep the core visible. Dividing by the full width hid every close streak.
        a = a.mul(T.mix(float(1), soft, T.smoothstep(float(0.8), float(3.5), coc)));
        a = a.div(T.pow(T.max(span, float(1)), float(0.35)));
      }
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

  /**
   * Widen rain by the circle of confusion of the streak itself. Walk and fly pass null,
   * and the streaks stay thin. Depth stays off: an additive drop must not punch the wall.
   */
  setDefocus(opts: {
    focus: number;
    focalMm: number;
    fStop: number;
    sensor: number;
    viewHeight: number;
    maxPx: number;
    fovDeg: number;
  } | null): void {
    if (!opts || this.kind !== 'rain') {
      this.uLens.value = 0;
      return;
    }
    this.uFocus.value = Math.max(0.35, opts.focus);
    this.uFocal.value = Math.max(1, opts.focalMm);
    this.uFStop.value = Math.max(1.1, opts.fStop);
    this.uSensor.value = Math.max(1, opts.sensor);
    this.uViewH.value = Math.max(1, opts.viewHeight);
    this.uMaxPx.value = Math.max(1, opts.maxPx);
    const fov = opts.fovDeg * Math.PI / 180;
    this.uRadPerPx.value = (2 * Math.tan(fov * 0.5)) / Math.max(1, opts.viewHeight);
    this.uLens.value = 1;
  }
}
