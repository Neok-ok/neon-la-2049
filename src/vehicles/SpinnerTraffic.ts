// Ambient spinner traffic: instanced bodies + additive glow billboards that stay readable at distance.
// Vehicles stream along street-grid headings in altitude layers around the camera and respawn when far.
import {
  AdditiveBlending, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicNodeMaterial, PlaneGeometry,
  Quaternion, Vector3, type Camera, type Group, type Scene,
} from 'three/webgpu';
import * as TSL from 'three/tsl';
import { spinnerGeometries, spinnerMaterials } from './spinnerModel';
import { U } from '../atmosphere/uniforms';
import type { CityQuery } from '../world/CityQuery';
import { Rng, trueRandomSeed } from '../core/rng';
import { advanceGraph, downtownGraph, edgeAround, poseOn } from './streetGraph';

const T = TSL as any;

/** A lane ≥ 5 must not park spinners at 74 m or 112 m. Those bands sit inside the slabs and the stacks. */
function overRoofs(id: string): boolean {
  return id === 'lakewood-megablocks' || id === 'south-la-megablocks' || id === 'arts-district'
    || id === 'southeast-industrial' || id === 'hollywood';
}

interface Car {
  p: Vector3;
  dir: Vector3;
  speed: number;
  police: boolean;
  phase: number;
  /** Low layer over the downtown street graph (74 m and 112 m, between the walkway decks). */
  graph: boolean;
  edge: number;
  t: number;
  gdir: 1 | -1;
  alt: number;
  side: number;
  salt: number;
}

const _m = new Matrix4(), _q = new Quaternion(), _s = new Vector3(1, 1, 1), _f = new Vector3(0, 0, -1);

export class SpinnerTraffic {
  private cars: Car[] = [];
  private body: InstancedMesh;
  private lights: InstancedMesh;
  private glow: InstancedMesh;
  readonly nodes: InstancedMesh[];
  private glowColor: InstancedBufferAttribute;
  private rng = new Rng(trueRandomSeed());
  radius = 2600;
  /** expose for the cinematic director (tracking shots) */
  get vehicles(): readonly Car[] {
    return this.cars;
  }

  /** Closest spinner to a point, for the market's distant-engine layer. */
  nearestTo(x: number, y: number, z: number): { x: number; y: number; z: number; dist: number } | null {
    let best: Car | null = null;
    let bd = Infinity;
    for (const c of this.cars) {
      const d = Math.hypot(c.p.x - x, c.p.y - y, c.p.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best ? { x: best.p.x, y: best.p.y, z: best.p.z, dist: bd } : null;
  }

  constructor(scene: Scene | Group, private query: CityQuery, readonly max: number) {
    const g = spinnerGeometries();
    const m = spinnerMaterials();
    this.body = new InstancedMesh(g.body, m.body, max);
    this.lights = new InstancedMesh(g.lights, m.lights, max);
    const glowGeo = new PlaneGeometry(1, 1);
    this.glowColor = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
    glowGeo.setAttribute('gcol', this.glowColor);
    const gm = new MeshBasicNodeMaterial();
    gm.transparent = true;
    gm.depthWrite = false;
    gm.blending = AdditiveBlending;
    gm.fog = false;
    gm.colorNode = T.Fn(() => {
      const c = T.attribute('gcol', 'vec4');
      const r = T.length(T.uv().sub(0.5)).mul(2.0);
      const fall = T.smoothstep(0.0, 1.0, r).oneMinus().pow(2.5);
      const d = T.length(T.positionWorld.sub(T.cameraPosition));
      const att = T.exp(d.mul(U.fogDensity).mul(-0.3));
      const strobe = T.mix(T.float(1), T.step(0.5, T.fract(U.time.mul(2.5).add(c.w))), T.step(0.5, c.w));
      return T.vec4(c.xyz.mul(fall).mul(att).mul(strobe).mul(1.6), T.float(1));
    })();
    this.glow = new InstancedMesh(glowGeo, gm, max);
    for (const im of [this.body, this.lights, this.glow]) {
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
      scene.add(im);
    }
    this.body.name = 'traffic-body';
    this.glow.name = 'traffic-glow';
    this.nodes = [this.body, this.lights, this.glow];
  }

  private blank(c: Car | null): Car {
    return c ?? {
      p: new Vector3(), dir: new Vector3(), speed: 0, police: false, phase: 0,
      graph: false, edge: 0, t: 0, gdir: 1, alt: 80, side: 11, salt: 1,
    };
  }

  /** Park a spinner on the street graph, offset so it clears the 5.6 m centre bridges.
   *  Canyon lanes are 18 m with 40–110 m roofs; a 74 m spinner at ±11 m would clip them. */
  private onGraph(car: Car, x: number, z: number, low: boolean): boolean {
    const g = downtownGraph(this.query.layout);
    let hit: { edge: number; t: number } | null = null;
    for (let k = 0; k < 16; k++) {
      const tryHit = edgeAround(g, x, z, this.radius * 0.9, this.rng);
      if (!tryHit) return false;
      const edge = g.edges[tryHit.edge];
      // Lakewood and South LA slabs are 45–130 m. A 74 m or 112 m park on a lane ≥ 5 would sit inside them.
      if (!edge || edge.kind === 'freeway' || (edge.lane ?? 7.2) < 5 || overRoofs(edge.district)) continue;
      hit = tryHit;
      break;
    }
    if (!hit) return false;
    car.graph = true;
    car.edge = hit.edge;
    car.t = hit.t;
    car.gdir = this.rng.chance(0.5) ? 1 : -1;
    car.alt = low ? 74 : 112;
    car.side = this.rng.chance(0.5) ? -11 : 11;
    car.speed = this.rng.range(28, 52);
    car.salt = this.rng.int(1, 8000);
    const pose = poseOn(g, car.edge, car.t, car.gdir, car.side);
    car.p.set(pose.x, this.query.groundHeight(pose.x, pose.z) + car.alt, pose.z);
    car.dir.set(pose.fx, 0, pose.fz);
    return true;
  }

  private spawn(c: Car | null, cam: Vector3, initial: boolean): Car {
    const r = this.rng;
    const car = this.blank(c);
    car.graph = false;
    const here = this.query.district(cam.x, cam.z).id;
    const downtown = here === 'dtla' || here === 'financial-megatowers' || here === 'civic-center';
    const canyon = here === 'historic-core';
    const lakewood = overRoofs(here);
    const layer = r.next();
    car.police = r.chance(0.18);
    car.phase = r.next();
    // Over downtown the 175–260 m band belongs to the avenue sky lanes, so free fliers stay above the fabric ceiling.
    // The historic canyon is not that graph: roofs are 40–110 m and the streets are 18 m, so spinners stay free at 148–260 m.
    // Lakewood and South LA fabric is 45–130 m, Arts District stacks reach about 136 m,
    // Southeast flare stacks reach 140 m, and Hollywood roofs reach about 119 m,
    // so spinners stay off those lattices (158–210 m or 240–420 m, and a lift under ground + 155).
    if (!canyon && downtown && layer < 0.78) {
      if (this.onGraph(car, cam.x, cam.z, layer < 0.4)) return car;
    } else if (!canyon && !downtown && !lakewood && layer < 0.22 && this.onGraph(car, cam.x, cam.z, layer < 0.1)) {
      return car;
    }
    const district = this.query.district(cam.x, cam.z);
    const bearing = r.chance(0.6) ? district.grid.bearingDeg : r.pick([0, 90, 38, 128]);
    const heading = ((bearing + r.pick([0, 90, 180, 270]) + r.range(-6, 6)) * Math.PI) / 180;
    car.dir.set(Math.sin(heading), 0, -Math.cos(heading));
    const dist = initial ? r.range(100, this.radius) : this.radius * r.range(0.85, 0.98);
    const side = r.range(-1, 1) * this.radius * 0.7;
    const perp = new Vector3(-car.dir.z, 0, car.dir.x);
    if (initial) car.p.set(cam.x + r.range(-1, 1) * dist, 0, cam.z + r.range(-1, 1) * dist);
    else car.p.set(cam.x - car.dir.x * dist + perp.x * side, 0, cam.z - car.dir.z * dist + perp.z * side);
    const ground = this.query.groundHeight(car.p.x, car.p.z);
    if (downtown) car.p.y = ground + r.range(340, 520);
    else if (canyon) car.p.y = ground + r.range(148, 260);
    else if (lakewood) car.p.y = ground + (layer < 0.72 ? r.range(158, 210) : r.range(240, 420));
    else car.p.y = ground + (layer < 0.12 ? r.range(55, 90) : layer < 0.82 ? r.range(175, 260) : r.range(320, 520));
    car.speed = r.range(35, 85);
    return car;
  }

  update(dt: number, camera: Camera, active: number): void {
    const cam = camera.position;
    const n = Math.min(this.max, active);
    while (this.cars.length < n) this.cars.push(this.spawn(null, cam, true));
    this.cars.length = n;
    const glowCol = this.glowColor.array as Float32Array;
    const warm = new Color(1.0, 0.85, 0.65), pol = new Color(0.9, 0.2, 0.25);
    for (let i = 0; i < n; i++) {
      const c = this.cars[i];
      if (c.graph) {
        const g = downtownGraph(this.query.layout);
        const step = advanceGraph(g, c.edge, c.t, c.gdir, c.speed * dt, c.salt);
        c.edge = step.edge;
        c.t = step.t;
        c.gdir = step.dir;
        const pose = poseOn(g, c.edge, c.t, c.gdir, c.side);
        c.p.set(pose.x, this.query.groundHeight(pose.x, pose.z) + c.alt, pose.z);
        c.dir.set(pose.fx, 0, pose.fz);
      } else {
        c.p.addScaledVector(c.dir, c.speed * dt);
        c.p.y += Math.sin(U.time.value * 0.5 + c.phase * 20) * 0.02;
        if (this.query.insideLandmark(c.p.x, c.p.y, c.p.z, 30)) c.p.y += 120 * dt + 4;
        // A free flier that drifts in from the 55–90 m band would otherwise cut the slabs or the stacks.
        if (overRoofs(this.query.district(c.p.x, c.p.z).id)) {
          const floor = this.query.groundHeight(c.p.x, c.p.z) + 155;
          if (c.p.y < floor) c.p.y = floor;
        }
      }
      const dx = c.p.x - cam.x, dz = c.p.z - cam.z;
      if (dx * dx + dz * dz > this.radius * this.radius * 1.1) this.spawn(c, cam, false);
      _q.setFromUnitVectors(_f, c.dir);
      _m.compose(c.p, _q, _s);
      this.body.setMatrixAt(i, _m);
      this.lights.setMatrixAt(i, _m);
      // glow billboard faces the camera, grows with distance so it stays a few pixels wide
      const d = Math.sqrt(dx * dx + dz * dz + (c.p.y - cam.y) ** 2);
      const size = Math.max(2.5, d * 0.006);
      _m.compose(c.p, camera.quaternion, _s.setScalar(size));
      _s.set(1, 1, 1);
      this.glow.setMatrixAt(i, _m);
      const col = c.police ? pol : warm;
      glowCol.set([col.r, col.g, col.b, c.police ? 0.75 + c.phase * 0.2 : 0], i * 4);
    }
    for (const im of [this.body, this.lights, this.glow]) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    }
    this.glowColor.needsUpdate = true;
  }
}
