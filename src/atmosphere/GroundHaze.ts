// A few camera-following sheets so a dressed street reads as volumetric haze on high/ultra.
// Cheap: three transparent cards, no raymarch.
import { AdditiveBlending, DoubleSide, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Group } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { U } from './uniforms';
import type { Tier } from '../core/quality';

const T = TSL as any;
const { vec4, sin, positionWorld, float, smoothstep } = T;

export class GroundHaze {
  readonly group = new Group();
  private sheets: Mesh[] = [];

  constructor() {
    this.group.name = 'ground-haze';
    const geo = new PlaneGeometry(90, 90);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const m = new MeshBasicNodeMaterial();
      m.transparent = true;
      m.depthWrite = false;
      m.blending = AdditiveBlending;
      m.side = DoubleSide;
      m.fog = false;
      const phase = float(i * 1.7);
      m.colorNode = T.Fn(() => {
        const n = sin(positionWorld.x.mul(0.15).add(U.time.mul(0.15)).add(phase))
          .mul(sin(positionWorld.z.mul(0.11).sub(U.time.mul(0.1))));
        const a = n.mul(0.5).add(0.5);
        const col = U.fogColor.mul(1.4).add(T.vec3(0.08, 0.04, 0.05).mul(U.neonWet));
        return vec4(col, a.mul(0.045).mul(smoothstep(0.05, 0.4, U.streetFog)));
      })();
      const mesh = new Mesh(geo, m);
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.sheets.push(mesh);
    }
    this.group.visible = false;
  }

  update(camX: number, camZ: number, groundY: number, alt: number, tier: Tier): void {
    const on = (tier === 'high' || tier === 'ultra') && alt < 140 && alt > -2;
    this.group.visible = on;
    if (!on) return;
    this.group.position.set(camX, 0, camZ);
    const lifts = [1.4, 3.6, 7.5];
    for (let i = 0; i < this.sheets.length; i++) this.sheets[i].position.y = groundY + lifts[i];
  }
}
