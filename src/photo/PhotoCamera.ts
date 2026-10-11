// Free camera for photo mode. Collision-free, clamped to the city. The walk/fly/cine
// controllers stay where they were; this one owns the lens until exit.
import { Euler, MathUtils, Vector3, type PerspectiveCamera } from 'three/webgpu';
import { forwardOf } from '../camera/types';
import type { Input } from '../input/Input';
import type { CityLayout } from '../world/layout';
import type { PhotoPose } from './postcards';

const FOCAL_MIN = 18;
const FOCAL_MAX = 200;
const ROLL_MAX = Math.PI / 6;

export class PhotoCamera {
  focal = 35;
  focus = 12;
  roll = 0;
  orbit = false;
  heading = 0;
  pitch = 0;

  private x = 0;
  private y = 2;
  private z = 0;
  private readonly entry = new Vector3();
  private readonly target = new Vector3();
  private readonly euler = new Euler();
  private readonly fwd = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly aim = new Vector3();
  private readonly foci: Vector3[];
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private gesture = { two: false, moved: 0, pinch: 0, focal: 35, cx: 0, cy: 0 };
  private listening = false;

  onTap: ((clientX: number, clientY: number) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement, private layout: CityLayout) {
    this.foci = [this.entry, this.aim];
  }

  grab(cam: PerspectiveCamera): void {
    this.x = cam.position.x;
    this.y = cam.position.y;
    this.z = cam.position.z;
    // Controllers write YXZ as (pitch, -heading, roll). Read the quaternion back
    // the same way so entering photo mode does not swing the lens.
    this.euler.setFromQuaternion(cam.quaternion, 'YXZ');
    this.pitch = this.euler.x;
    this.heading = -this.euler.y;
    this.roll = this.euler.z;
    cam.filmGauge = 35;
    cam.aspect = innerWidth / Math.max(1, innerHeight);
    this.focal = MathUtils.clamp(cam.getFocalLength(), FOCAL_MIN, FOCAL_MAX);
    const ground = this.layout.heightAt(this.x, this.z);
    const alt = this.y - ground;
    this.focus = alt < 40 ? 8 : Math.min(180, Math.max(8, alt * 0.8));
    this.entry.copy(cam.position);
    this.captureTarget();
    this.clampPos();
  }

  setPose(p: PhotoPose): void {
    this.x = p.x;
    this.y = p.y;
    this.z = p.z;
    this.heading = p.heading;
    this.pitch = p.pitch;
    this.roll = 0;
    this.clampPos();
    this.captureTarget();
  }

  /** Look-at point the orbit and the streamer both use. */
  captureTarget(): void {
    forwardOf(this.heading, this.pitch, this.fwd);
    this.target.set(this.x, this.y, this.z).addScaledVector(this.fwd, Math.max(0.6, this.focus));
  }

  setOrbit(on: boolean): void {
    this.orbit = on;
    if (on) this.captureTarget();
  }

  /** Entry neighbourhood plus the subject, so a free camera does not unload the block it is framing. */
  focusPoints(): Vector3[] {
    forwardOf(this.heading, this.pitch, this.fwd);
    const d = Math.min(140, Math.max(8, this.focus));
    this.aim.set(this.x, this.y, this.z).addScaledVector(this.fwd, d);
    return this.foci;
  }

  update(dt: number, input: Input): void {
    const ground = this.layout.heightAt(this.x, this.z);
    const alt = Math.max(0, this.y - ground);
    const speed = Math.min(160, 6 + alt * 0.08) * (input.boost ? 3.2 : 1);
    const step = speed * dt;
    forwardOf(this.heading, this.pitch, this.fwd);
    this.right.set(Math.cos(this.heading), 0, Math.sin(this.heading));
    const sx = input.strafe * step;
    const sy = input.forward * step;
    const sz = input.vertical * step;
    if (this.orbit) {
      this.target.x += this.right.x * sx + this.fwd.x * sy;
      this.target.y += this.fwd.y * sy + sz;
      this.target.z += this.right.z * sx + this.fwd.z * sy;
      this.placeOrbit();
    } else {
      this.x += this.right.x * sx + this.fwd.x * sy;
      this.y += this.fwd.y * sy + sz;
      this.z += this.right.z * sx + this.fwd.z * sy;
      this.clampPos();
    }
    if (input.turn || input.tilt) this.look(input.turn * 280 * dt, input.tilt * 220 * dt);
    if (input.key('KeyZ')) this.roll -= dt * 0.7;
    if (input.key('KeyX')) this.roll += dt * 0.7;
    if (input.wasPressed('KeyR')) this.roll = 0;
    this.roll = MathUtils.clamp(this.roll, -ROLL_MAX, ROLL_MAX);
  }

  apply(cam: PerspectiveCamera): void {
    cam.position.set(this.x, this.y, this.z);
    cam.up.set(0, 1, 0);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch, -this.heading, this.roll);
    cam.filmGauge = 35;
    cam.aspect = innerWidth / Math.max(1, innerHeight);
    cam.setFocalLength(this.focal);
  }

  attach(): void {
    if (this.listening) return;
    this.listening = true;
    this.canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  detach(): void {
    if (!this.listening) return;
    this.listening = false;
    this.pointers.clear();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  private placeOrbit(): void {
    forwardOf(this.heading, this.pitch, this.fwd);
    const dist = Math.max(0.6, this.focus);
    this.x = this.target.x - this.fwd.x * dist;
    this.y = this.target.y - this.fwd.y * dist;
    this.z = this.target.z - this.fwd.z * dist;
    this.clampPos();
  }

  private look(dx: number, dy: number): void {
    this.heading -= dx * 0.0045;
    if (this.orbit) {
      this.pitch = MathUtils.clamp(this.pitch - dy * 0.0045, -1.2, 1.2);
      this.placeOrbit();
    } else {
      this.pitch = MathUtils.clamp(this.pitch - dy * 0.0045, -1.35, 1.35);
    }
  }

  private truck(dx: number, dy: number): void {
    const aspect = innerWidth / Math.max(1, innerHeight);
    const filmH = 35 / Math.max(aspect, 1);
    const vfov = 2 * Math.atan((0.5 * filmH) / Math.max(this.focal, 1));
    const worldPerPx = (2 * Math.tan(vfov / 2) * Math.max(0.6, this.focus)) / Math.max(1, innerHeight);
    forwardOf(this.heading, this.pitch, this.fwd);
    this.right.set(Math.cos(this.heading), 0, Math.sin(this.heading));
    this.up.crossVectors(this.right, this.fwd);
    const mx = dx * worldPerPx;
    const my = -dy * worldPerPx;
    this.x += this.right.x * mx + this.up.x * my;
    this.y += this.up.y * my;
    this.z += this.right.z * mx + this.up.z * my;
    this.target.x += this.right.x * mx + this.up.x * my;
    this.target.y += this.up.y * my;
    this.target.z += this.right.z * mx + this.up.z * my;
    this.clampPos();
  }

  private clampPos(): void {
    const b = this.layout.bounds;
    const m = 40;
    this.x = MathUtils.clamp(this.x, b.minX + m, b.maxX - m);
    this.z = MathUtils.clamp(this.z, b.minZ + m, b.maxZ - m);
    const g = this.layout.heightAt(this.x, this.z);
    this.y = MathUtils.clamp(this.y, g + 1.4, 4200);
  }

  private pinchDist(): number {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
  }

  private centroid(): { x: number; y: number } {
    let x = 0, y = 0, n = 0;
    for (const p of this.pointers.values()) { x += p.x; y += p.y; n++; }
    return { x: x / Math.max(1, n), y: y / Math.max(1, n) };
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.gesture.moved = 0;
    if (this.pointers.size === 2) {
      this.gesture.two = true;
      this.gesture.pinch = this.pinchDist();
      this.gesture.focal = this.focal;
      const c = this.centroid();
      this.gesture.cx = c.x;
      this.gesture.cy = c.y;
    }
  };

  private onMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    this.gesture.moved += Math.abs(dx) + Math.abs(dy);
    if (this.pointers.size >= 2) {
      const c = this.centroid();
      this.truck(c.x - this.gesture.cx, c.y - this.gesture.cy);
      this.gesture.cx = c.x;
      this.gesture.cy = c.y;
      const d = this.pinchDist();
      if (this.gesture.pinch > 8) this.focal = MathUtils.clamp(this.gesture.focal * (d / this.gesture.pinch), FOCAL_MIN, FOCAL_MAX);
      return;
    }
    if (this.gesture.two) return;
    this.look(dx, dy);
  };

  private onUp = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    const moved = this.gesture.moved;
    const wasTwo = this.gesture.two;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0) {
      if (!wasTwo && moved < 8) this.onTap?.(e.clientX, e.clientY);
      this.gesture.two = false;
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const next = Math.exp(Math.log(this.focal) - e.deltaY * 0.0012);
    this.focal = MathUtils.clamp(next, FOCAL_MIN, FOCAL_MAX);
  };
}
