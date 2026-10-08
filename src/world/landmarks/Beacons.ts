// Aviation / police beacons: tiny emissive octahedra, instanced, blinking in the shader.
// They ignore scene fog (real beacons punch through haze) and attenuate with their own softer falloff.
import { InstancedBufferAttribute, InstancedMesh, MeshBasicNodeMaterial, Matrix4, OctahedronGeometry, Vector3, Quaternion } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from '../../atmosphere/uniforms';

const T = TSL as any;
const { Fn, attribute, vec3, step, fract, mix, exp, length, positionWorld, cameraPosition, select, float } = T;

/** kind: 0 = red aviation blink, 1 = steady red, 2 = police red/blue strobe */
export class Beacons {
  private list: Array<{ x: number; y: number; z: number; kind: number; size: number }> = [];

  add(x: number, y: number, z: number, kind: number, size: number): void {
    this.list.push({ x, y, z, kind, size });
  }

  build(): InstancedMesh {
    const n = Math.max(1, this.list.length);
    const geo = new OctahedronGeometry(0.5, 0);
    const data = new Float32Array(n * 2);
    const mat = new MeshBasicNodeMaterial();
    mat.fog = false;
    const mesh = new InstancedMesh(geo, mat, n);
    const m = new Matrix4(), q = new Quaternion(), p = new Vector3(), s = new Vector3();
    this.list.forEach((b, i) => {
      mesh.setMatrixAt(i, m.compose(p.set(b.x, b.y, b.z), q, s.setScalar(b.size)));
      data[i * 2] = b.kind;
      data[i * 2 + 1] = Math.random();
    });
    geo.setAttribute('iBeacon', new InstancedBufferAttribute(data, 2));
    mat.colorNode = Fn(() => {
      const a = attribute('iBeacon', 'vec2');
      const kind = a.x;
      const t = U.time.add(a.y.mul(10.0));
      const blink = step(0.82, fract(t.mul(0.5)));
      const strobe = step(0.5, fract(t.mul(3.0)));
      const red = vec3(1.0, 0.08, 0.04);
      const police = mix(vec3(1.0, 0.05, 0.05), vec3(0.1, 0.25, 1.0), strobe);
      const col = select(kind.lessThan(0.5), red.mul(blink.mul(0.9).add(0.1)), select(kind.lessThan(1.5), red, police));
      const d = length(positionWorld.sub(cameraPosition));
      const att = exp(d.mul(U.fogDensity).mul(-0.25));
      return col.mul(att).mul(4.0).add(float(0));
    })();
    mesh.frustumCulled = false;
    mesh.name = 'beacons';
    mesh.count = this.list.length;
    return mesh;
  }
}
