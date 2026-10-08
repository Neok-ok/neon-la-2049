// Refinery flare-stack fireballs (camera-facing additive quads, flicker in the shader).
import { AdditiveBlending, BufferAttribute, BufferGeometry, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';

const T = TSL as any;
const { Fn, attribute, vec3, vec4, normalize, cross, cameraPosition, sin, smoothstep, length, exp, mx_noise_float, float } = T;

export class Flares {
  private list: Array<{ x: number; y: number; z: number; size: number }> = [];

  add(x: number, y: number, z: number, size: number): void {
    this.list.push({ x, y, z, size });
  }

  build(): Mesh {
    const n = Math.max(1, this.list.length);
    const pos = new Float32Array(n * 4 * 3);
    const ctr = new Float32Array(n * 4 * 4);
    const crn = new Float32Array(n * 4 * 2);
    const idx = new Uint32Array(n * 6);
    const cs = [-1, -1, 1, -1, 1, 1, -1, 1];
    this.list.forEach((f, i) => {
      for (let k = 0; k < 4; k++) {
        ctr.set([f.x, f.y, f.z, f.size], (i * 4 + k) * 4);
        crn.set([cs[k * 2], cs[k * 2 + 1]], (i * 4 + k) * 2);
        pos.set([f.x, f.y, f.z], (i * 4 + k) * 3);
      }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('fctr', new BufferAttribute(ctr, 4));
    g.setAttribute('fcrn', new BufferAttribute(crn, 2));
    g.setIndex(new BufferAttribute(idx, 1));
    g.setDrawRange(0, this.list.length * 6);
    const m = new MeshBasicNodeMaterial();
    m.transparent = true;
    m.depthWrite = false;
    m.blending = AdditiveBlending;
    m.fog = false;
    const c = attribute('fctr', 'vec4');
    const k = attribute('fcrn', 'vec2');
    m.positionNode = Fn(() => {
      const center = c.xyz;
      const toCam = normalize(cameraPosition.sub(center));
      const side = normalize(cross(vec3(0, 1, 0), toCam));
      const up = normalize(cross(toCam, side));
      const s = c.w.mul(sin(U.time.mul(9.0).add(c.x)).mul(0.12).add(1.0));
      return center.add(side.mul(k.x.mul(s))).add(up.mul(k.y.mul(s).mul(1.6)).add(vec3(0, s.mul(1.2), 0)));
    })();
    m.colorNode = Fn(() => {
      const r = length(k);
      const n = mx_noise_float(vec3(k.x.mul(2.0), k.y.mul(2.0).sub(U.time.mul(3.0)), c.x)).mul(0.5).add(0.5);
      const core = smoothstep(1.0, 0.1, r.add(n.mul(0.35)));
      const col = vec3(1.0, 0.45, 0.1).mul(core).add(vec3(1.0, 0.85, 0.5).mul(smoothstep(0.45, 0.0, r)));
      const d = length(c.xyz.sub(cameraPosition));
      const att = exp(d.mul(U.fogDensity).mul(-0.35));
      return vec4(col.mul(att).mul(3.0), float(1));
    })();
    const mesh = new Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.name = 'flares';
    return mesh;
  }
}
