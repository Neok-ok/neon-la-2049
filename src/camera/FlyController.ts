// Spinner flight: chase or cockpit camera, mouse/touch steering, thrust along the look direction,
// building/landmark collision with axis sliding, landing on roofs or streets.
import { Group, MathUtils, Vector3, type PerspectiveCamera, type Scene } from 'three/webgpu';
import type { Controller, Pose } from './types';
import { forwardOf } from './types';
import type { Input } from '../input/Input';
import { CityQuery } from '../world/CityQuery';
import { createSpinnerMesh } from '../vehicles/spinnerModel';

const v1 = new Vector3(), v2 = new Vector3(), v3 = new Vector3();

export class FlyController implements Controller {
  readonly id = 'fly' as const;
  readonly spinner: Group;
  pos = new Vector3(0, 200, 0);
  vel = new Vector3();
  heading = 0;
  pitch = -0.15;
  cockpit = false;
  cruise = 75;
  boostSpeed = 260;
  private camPos = new Vector3();
  private bank = 0;
  private active = false;

  constructor(private camera: PerspectiveCamera, private input: Input, private query: CityQuery, scene: Scene) {
    this.spinner = createSpinnerMesh();
    this.spinner.visible = false;
    scene.add(this.spinner);
  }

  enter(from: Pose): void {
    this.active = true;
    this.pos.copy(from.position);
    // never start inside something
    for (let k = 0; k < 60 && this.solid(this.pos); k++) this.pos.y += 10;
    this.pos.y = Math.max(this.pos.y, this.query.floorBelow(this.pos.x, this.pos.y, this.pos.z) + 0.5);
    this.heading = from.heading;
    this.pitch = MathUtils.clamp(from.pitch, -1.2, 0.9);
    this.vel.set(0, 0, 0);
    this.spinner.visible = true;
    this.input.pointerLockWanted = true;
    forwardOf(this.heading, this.pitch, v1);
    this.camPos.copy(this.pos).addScaledVector(v1, -11).add(v2.set(0, 2.5, 0));
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
  }

  exit(): void {
    this.active = false;
    this.input.pointerLockWanted = false;
  }

  /** Show/hide the parked spinner; optionally set it down at a street position (walk mode). */
  park(visible: boolean, at?: Vector3, heading = this.heading): void {
    this.spinner.visible = visible;
    if (!at) return;
    this.pos.copy(at);
    this.heading = heading;
    this.pitch = 0;
    this.bank = 0;
    this.spinner.position.copy(at);
    this.spinner.rotation.set(0, -heading, 0, 'YXZ');
  }

  private solid(p: Vector3): boolean {
    if (p.y > CityQuery.FABRIC_CEILING) return this.query.insideLandmark(p.x, p.y + 0.7, p.z, 2);
    return this.query.insideSolid(p.x, p.y + 0.7, p.z, 1.3);
  }

  pose(): Pose {
    return { position: this.pos.clone(), heading: this.heading, pitch: this.pitch };
  }

  update(dt: number): void {
    if (!this.active) return;
    const inp = this.input;
    if (inp.wasPressed('KeyV')) this.cockpit = !this.cockpit;
    const [mx, my] = inp.consumeLook();
    this.heading += mx * 0.0022 + inp.turn * 1.5 * dt;
    this.pitch = MathUtils.clamp(this.pitch - my * 0.0018 - inp.tilt * 1.1 * dt, -1.35, 1.1);

    const max = inp.boost ? this.boostSpeed : this.cruise;
    const look = forwardOf(this.heading, this.pitch, v1);
    const right = v2.set(Math.cos(this.heading), 0, Math.sin(this.heading));
    const target = v3.set(0, 0, 0)
      .addScaledVector(look, inp.forward * max)
      .addScaledVector(right, inp.strafe * max * 0.6);
    target.y += inp.vertical * max * 0.55;
    const k = 1 - Math.exp(-dt * (inp.boost ? 1.2 : 1.9));
    this.vel.lerp(target, k);

    // integrate with per-axis collision sliding
    const next = this.pos.clone().addScaledVector(this.vel, dt);
    if (this.solid(next)) {
      const tryAxis = (axis: 'x' | 'y' | 'z') => {
        const p = this.pos.clone();
        p[axis] = next[axis];
        if (!this.solid(p)) this.pos[axis] = next[axis];
        else this.vel[axis] *= -0.15;
      };
      tryAxis('y');
      tryAxis('x');
      tryAxis('z');
    } else {
      this.pos.copy(next);
    }
    const floor = this.query.floorBelow(this.pos.x, this.pos.y + 0.5, this.pos.z);
    if (this.pos.y < floor + 0.05) {
      this.pos.y = floor + 0.05;
      if (this.vel.y < 0) this.vel.y = 0;
    }
    const b = this.query.layout.bounds;
    this.pos.x = MathUtils.clamp(this.pos.x, b.minX - 3000, b.maxX + 3000);
    this.pos.z = MathUtils.clamp(this.pos.z, b.minZ - 3000, b.maxZ + 3000);
    this.pos.y = Math.min(this.pos.y, 6000);

    // spinner attitude: yaw to heading, bank into strafe/turns, nose follows climb a little
    const lateral = this.vel.dot(right) / this.cruise;
    this.bank = MathUtils.lerp(this.bank, MathUtils.clamp(-lateral * 0.5 - mx * 0.002, -0.6, 0.6), 1 - Math.exp(-dt * 4));
    this.spinner.position.copy(this.pos);
    this.spinner.rotation.set(MathUtils.clamp(this.vel.y / 200, -0.3, 0.3), -this.heading, this.bank, 'YXZ');

    // camera
    if (this.cockpit) {
      this.camera.position.copy(this.pos).add(v2.set(0, 1.22, 0)).addScaledVector(look, 0.3);
      this.camPos.copy(this.camera.position);
    } else {
      const dist = 11 + this.vel.length() * 0.02;
      const desired = v2.copy(this.pos).addScaledVector(look, -dist);
      desired.y += 2.6;
      // pull the camera in if it would end up inside a building
      for (let i = 0; i < 6 && this.solid(desired); i++) desired.lerp(this.pos, 0.4).y += 0.5;
      this.camPos.lerp(desired, 1 - Math.exp(-dt * 9));
      this.camera.position.copy(this.camPos);
    }
    const target2 = v3.copy(this.pos).addScaledVector(look, 25);
    target2.y += this.cockpit ? 1.2 : 1.5;
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target2);
    if (this.cockpit) this.camera.rotateZ(this.bank * 0.6);
    this.spinner.visible = !this.cockpit;
  }
}
