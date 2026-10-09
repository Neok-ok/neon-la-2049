// Distance-switched detail levels for kilometre-scale landmarks (hero megatowers, the Wallace pyramid).
// Distance is measured to the landmark's vertical axis segment, not its base, so a camera hovering
// beside a 1 km crown gets the full model even though the base is far away.
// Levels: [0] full detail, [1] mid, [2] silhouette proxy (the "impostor": a few dozen boxes that share
// the live procedural facade, so day/night/wet/snow stay correct where a baked billboard would not).
import { Group, type Object3D, type Vector3 } from 'three/webgpu';

interface Entry {
  name: string;
  levels: Object3D[];
  /** Switch distances: level i is used while d < dists[i] × scale. Length = levels.length − 1. */
  dists: number[];
  x: number;
  z: number;
  y0: number;
  y1: number;
  /** Footprint radius: distances are measured from the hull, not the axis. */
  r: number;
  current: number;
}

const HYSTERESIS = 0.08;

export class LandmarkLods {
  readonly root = new Group();
  private list: Entry[] = [];
  /** Per-level counts for the HUD / stats. */
  readonly active = [0, 0, 0];

  constructor() {
    this.root.name = 'landmark-lods';
  }

  /** `levels[0]` is the most detailed. Returns a group holding every level (only one visible). */
  add(name: string, levels: Object3D[], dists: number[], x: number, z: number, y0: number, y1: number, r: number): Group {
    const g = new Group();
    g.name = name;
    levels.forEach((o, i) => {
      o.visible = i === levels.length - 1;
      g.add(o);
    });
    this.list.push({ name, levels, dists, x, z, y0, y1, r, current: levels.length - 1 });
    return g;
  }

  update(cam: Vector3, scale: number): void {
    this.active.fill(0);
    for (const e of this.list) {
      const dh = Math.max(0, Math.hypot(cam.x - e.x, cam.z - e.z) - e.r);
      const dy = cam.y < e.y0 ? e.y0 - cam.y : cam.y > e.y1 ? cam.y - e.y1 : 0;
      const d = Math.hypot(dh, dy);
      let lvl = e.levels.length - 1;
      for (let i = 0; i < e.dists.length; i++) {
        // stay on the current level a little longer than we would switch into it
        const lim = e.dists[i]! * scale * (i === e.current ? 1 + HYSTERESIS : 1);
        if (d < lim) { lvl = i; break; }
      }
      if (lvl !== e.current) {
        e.levels[e.current]!.visible = false;
        e.levels[lvl]!.visible = true;
        e.current = lvl;
      }
      this.active[Math.min(2, lvl)]!++;
    }
  }

  levelOf(name: string): number {
    return this.list.find((e) => e.name === name)?.current ?? -1;
  }
}
