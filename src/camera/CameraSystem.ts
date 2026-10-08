// Owns the three camera modes and hands the pose over when switching (fly <-> walk <-> cinematic).
import { Vector3 } from 'three/webgpu';
import type { Controller, ModeId, Pose } from './types';
import type { FlyController } from './FlyController';
import type { WalkController } from './WalkController';
import type { CinematicDirector } from './CinematicDirector';

/** Distance within which "fly" from walk mode re-boards the parked spinner instead of summoning one. */
const BOARD_RADIUS = 120;

export class CameraSystem {
  private current: Controller;
  onChange: (m: ModeId) => void = () => {};

  constructor(
    readonly fly: FlyController,
    readonly walk: WalkController,
    readonly cine: CinematicDirector,
    initial: ModeId,
    pose: Pose,
  ) {
    this.current = this.get(initial);
    this.current.enter(pose);
  }

  get mode(): ModeId {
    return this.current.id;
  }

  get(m: ModeId): Controller {
    return m === 'fly' ? this.fly : m === 'walk' ? this.walk : this.cine;
  }

  pose(): Pose {
    return this.current.pose();
  }

  setMode(m: ModeId): void {
    if (m === this.current.id) return;
    const from = this.current.pose();
    const prev = this.current.id;
    this.current.exit();
    let pose = from;
    if (m === 'fly' && prev === 'walk') {
      const sp = this.fly.spinner.position;
      if (this.fly.spinner.visible && sp.distanceTo(from.position) < BOARD_RADIUS) {
        pose = { position: sp.clone(), heading: this.fly.heading, pitch: 0 };
      } else {
        pose = { position: from.position.clone().add(new Vector3(0, 4, 0)), heading: from.heading, pitch: 0.1 };
      }
    }
    // the spinner stays parked where you stepped out; it disappears in cinematic mode
    this.fly.park(m === 'walk' && prev === 'fly');
    this.current = this.get(m);
    this.current.enter(pose);
    this.onChange(m);
  }

  /** Teleport within the current mode (URL params / debug API). */
  setPose(p: Pose): void {
    this.current.exit();
    this.current.enter(p);
  }

  update(dt: number): void {
    this.current.update(dt);
  }
}
