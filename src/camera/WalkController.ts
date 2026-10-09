// First-person street-level walking (1.7 m eye height, realistic walk/run speeds, building collision).
import { MathUtils, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { Controller, Pose } from './types';
import type { Input } from '../input/Input';
import type { CityQuery } from '../world/CityQuery';
import { nearestSeat } from '../world/seats';

export const HUMAN = { eye: 1.7, radius: 0.32, height: 1.8, walk: 1.5, run: 4.2 };

export class WalkController implements Controller {
  readonly id = 'walk' as const;
  pos = new Vector3();
  heading = 0;
  pitch = 0;
  private vy = 0;
  private bob = 0;
  private active = false;
  private seated = false;
  private sitLock = 0;
  /** debug: lets testers cover ground faster (not shown in UI) */
  speedScale = 1;
  /**
   * When set, a flyer near a roof door starts there instead of on the street.
   * Wired from the interior system. Street doors do not use it.
   */
  spawnHook: ((x: number, y: number, z: number) => { x: number; y: number; z: number; heading: number } | null) | null = null;

  constructor(private camera: PerspectiveCamera, private input: Input, private query: CityQuery) {}

  enter(from: Pose): void {
    this.active = true;
    const roof = this.spawnHook?.(from.position.x, from.position.y, from.position.z);
    if (roof) {
      this.pos.set(roof.x, roof.y, roof.z);
      this.heading = roof.heading;
    } else {
      const [x, z] = this.query.findStreetSpot(from.position.x, from.position.z);
      this.pos.set(x, this.query.groundHeight(x, z), z);
      this.heading = from.heading;
    }
    this.pitch = 0.08;
    this.vy = 0;
    this.input.pointerLockWanted = true;
    this.camera.fov = 70;
    this.camera.updateProjectionMatrix();
  }

  exit(): void {
    this.active = false;
    this.seated = false;
    this.input.pointerLockWanted = false;
  }

  pose(): Pose {
    return { position: this.pos.clone().add(new Vector3(0, HUMAN.eye, 0)), heading: this.heading, pitch: this.pitch };
  }

  update(dt: number): void {
    if (!this.active) return;
    const inp = this.input;
    const [mx, my] = inp.consumeLook();
    this.heading += mx * 0.0022 + inp.turn * 1.8 * dt;
    this.pitch = MathUtils.clamp(this.pitch - my * 0.0022 - inp.tilt * 1.3 * dt, -1.45, 1.45);

    const speed = (inp.boost ? HUMAN.run : HUMAN.walk) * this.speedScale;
    const f = MathUtils.clamp(inp.forward, -1, 1), s = MathUtils.clamp(inp.strafe, -1, 1);
    this.sitLock = Math.max(0, this.sitLock - dt);
    if (inp.wasPressed('KeyE') && this.sitLock <= 0) {
      if (this.seated) this.seated = false;
      else {
        const seat = nearestSeat(this.pos.x, this.pos.z);
        if (seat) {
          this.seated = true;
          this.sitLock = 0.35;
          this.pos.set(seat.x, seat.y, seat.z);
          this.heading = seat.heading;
          this.vy = 0;
        }
      }
    }
    if (this.seated && (Math.abs(f) > 0.2 || Math.abs(s) > 0.2)) this.seated = false;
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    let dx = (sh * f + ch * s) * speed * dt;
    let dz = (-ch * f + sh * s) * speed * dt;
    const len = Math.hypot(dx, dz), maxLen = speed * dt;
    if (len > maxLen) { dx *= maxLen / len; dz *= maxLen / len; }

    let nx = this.pos.x + (this.seated ? 0 : dx), nz = this.pos.z + (this.seated ? 0 : dz);
    if (this.query.layout.isOcean(nx, nz)) { nx = this.pos.x; nz = this.pos.z; }
    if (!this.seated) [nx, nz] = this.query.resolveCircle(nx, nz, this.pos.y + 0.45, HUMAN.height - 0.45, HUMAN.radius);
    this.pos.x = nx;
    this.pos.z = nz;

    // floor: step up to 0.45 m, otherwise fall with gravity
    const floor = this.query.floorBelow(nx, this.pos.y + 0.45, nz);
    if (floor >= this.pos.y - 0.05) {
      this.pos.y = MathUtils.lerp(this.pos.y, floor, 1 - Math.exp(-dt * 20));
      this.vy = 0;
    } else {
      this.vy -= 9.81 * dt;
      this.pos.y = Math.max(floor, this.pos.y + this.vy * dt);
    }

    const moving = this.seated ? 0 : Math.hypot(dx, dz) / Math.max(dt, 1e-4);
    this.bob += moving * dt * 2.2;
    const bobY = Math.sin(this.bob * Math.PI) * 0.025 * Math.min(1, moving / 1.5);
    const eye = this.seated ? 1.15 : HUMAN.eye;
    this.camera.position.set(this.pos.x, this.pos.y + eye + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch, -this.heading, 0, 'YXZ');
  }
}
