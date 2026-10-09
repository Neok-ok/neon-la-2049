// Aviation, pad, police and floodlight points: one merged mesh of camera-facing additive quads.
// A quad never shrinks below ~3 px (it grows with distance and dims instead), so a 1 km tower still
// shows its obstruction lights from across the basin. Lights see a fraction of the fog optical depth:
// real beacons punch through haze, but the smog layer still swallows the far ones.
// Red obstruction lights flash in sync city-wide (0.5 Hz, as aviation rules require for one structure;
// the whole skyline pulsing together is the film's look).
import { AdditiveBlending, BufferAttribute, BufferGeometry, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';
import { fogDepth } from '../../atmosphere/SkyFog';

const T = TSL as any;
const { Fn, attribute, vec3, vec4, normalize, cross, cameraPosition, length, exp, step, fract, mix, select, float, max, min, smoothstep, sin, clamp } = T;

/** Light kinds. Numbers are stored in the vertex data. */
export const LightKind = {
  /** red obstruction flash, synchronised */
  Red: 0,
  /** steady red (mid-height obstruction) */
  Steady: 1,
  /** police red / blue strobe */
  Police: 2,
  /** white double strobe (mast tips, the tallest structures) */
  Strobe: 3,
  /** amber pad / landing-edge light, slow pulse */
  Pad: 4,
  /** warm steady floodlight point */
  Warm: 5,
} as const;

/** Apparent size floor, as a fraction of distance (≈ 3 px radius at 60° FOV on a 540 px tall view). */
const MIN_ANGLE = 0.0058;

export class Beacons {
  private list: Array<{ x: number; y: number; z: number; kind: number; size: number; phase: number }> = [];

  /** `size`: glow radius in metres at close range. `phase` desynchronises blinkers that are not obstruction lights. */
  add(x: number, y: number, z: number, kind: number, size: number, phase = -1): void {
    this.list.push({ x, y, z, kind, size, phase: phase >= 0 ? phase : kind === 0 ? 0 : (Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453) % 1 });
  }

  get count(): number {
    return this.list.length;
  }

  build(): Mesh {
    const n = Math.max(1, this.list.length);
    const pos = new Float32Array(n * 4 * 3);
    const ctr = new Float32Array(n * 4 * 4);
    const crn = new Float32Array(n * 4 * 4);
    const idx = new Uint32Array(n * 6);
    const cs = [-1, -1, 1, -1, 1, 1, -1, 1];
    this.list.forEach((b, i) => {
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        ctr.set([b.x, b.y, b.z, b.size], v * 4);
        crn.set([cs[k * 2]!, cs[k * 2 + 1]!, b.kind, b.phase], v * 4);
        pos.set([b.x, b.y, b.z], v * 3);
      }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('lctr', new BufferAttribute(ctr, 4));
    g.setAttribute('lcrn', new BufferAttribute(crn, 4));
    g.setIndex(new BufferAttribute(idx, 1));
    g.setDrawRange(0, this.list.length * 6);

    const m = new MeshBasicNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.blending = AdditiveBlending;
    m.fog = false;
    const c = attribute('lctr', 'vec4');
    const k = attribute('lcrn', 'vec4');
    const worldSize = () => {
      const d = length(c.xyz.sub(cameraPosition));
      return max(c.w, d.mul(MIN_ANGLE));
    };
    m.positionNode = Fn(() => {
      const center = c.xyz;
      const toCam = normalize(cameraPosition.sub(center));
      const side = normalize(cross(vec3(0, 1, 0), toCam));
      const up = normalize(cross(toCam, side));
      const s = worldSize();
      // pull slightly toward the camera so a light on a wall is not half buried in it
      return center.add(toCam.mul(min(s, 6.0))).add(side.mul(k.x.mul(s))).add(up.mul(k.y.mul(s)));
    })();
    m.colorNode = Fn(() => {
      const kind = k.z;
      const t = U.time.add(k.w.mul(17.0));
      // synchronised obstruction flash: ~0.35 s on per 2 s
      const flash = smoothstep(0.0, 0.04, fract(U.time.mul(0.5))).mul(smoothstep(0.2, 0.16, fract(U.time.mul(0.5))));
      const strobePh = fract(t.mul(0.75));
      const strobe = step(strobePh, 0.03).add(step(0.12, strobePh).mul(step(strobePh, 0.15)));
      const police = step(0.5, fract(t.mul(2.5)));
      const pulse = sin(t.mul(2.2)).mul(0.35).add(0.65);
      const red = vec3(1.0, 0.07, 0.03);
      const col = select(kind.lessThan(0.5), red.mul(flash.mul(0.92).add(0.08)),
        select(kind.lessThan(1.5), red.mul(0.75),
          select(kind.lessThan(2.5), mix(vec3(1.0, 0.04, 0.04), vec3(0.12, 0.3, 1.0), police),
            select(kind.lessThan(3.5), vec3(0.85, 0.92, 1.0).mul(strobe.mul(2.2)),
              select(kind.lessThan(4.5), vec3(1.0, 0.55, 0.12).mul(pulse), vec3(1.0, 0.78, 0.5))))));
      const r = length(k.xy);
      const core = smoothstep(0.4, 0.0, r);
      const halo = smoothstep(1.0, 0.0, r).pow(2.6).mul(0.55);
      // enlarged far quads spread the same light over more pixels: dim them, but keep a floor
      const s = worldSize();
      const spread = clamp(c.w.div(s), 0.3, 1.0);
      const att = exp(fogDepth(cameraPosition, c.xyz).mul(-0.3));
      // red and amber read weakly against a bright day sky, the white strobes stay
      const dayDim = select(kind.greaterThan(2.5).and(kind.lessThan(3.5)), float(1.0), U.night.mul(0.6).add(0.4));
      const a = core.add(halo).mul(spread).mul(att).mul(dayDim).mul(3.2);
      return vec4(col.mul(a), float(1));
    })();
    const mesh = new Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 7;
    mesh.name = 'beacons';
    return mesh;
  }
}
