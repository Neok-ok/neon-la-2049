// Debug / performance overlay (toggle: H key or the HUD button).
export class HUD {
  readonly el: HTMLDivElement;
  visible: boolean;
  private frames = 0;
  private acc = 0;
  private worst = 0;
  fps = 60;
  frameMs = 16;

  constructor(visible: boolean) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    document.body.appendChild(this.el);
    this.visible = visible;
    this.el.style.display = visible ? '' : 'none';
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? '' : 'none';
  }

  /** Call every frame with the frame delta; `lines` is only evaluated ~4x per second. */
  tick(dt: number, lines: () => Array<[string, string | number]>): void {
    this.frames++;
    this.acc += dt;
    this.worst = Math.max(this.worst, dt);
    if (this.acc < 0.25) return;
    this.fps = this.frames / this.acc;
    this.frameMs = (this.acc / this.frames) * 1000;
    const worst = this.worst * 1000;
    this.frames = 0;
    this.acc = 0;
    this.worst = 0;
    if (!this.visible) return;
    const rows: Array<[string, string | number]> = [['fps', `${this.fps.toFixed(0)}  (${this.frameMs.toFixed(1)} ms, worst ${worst.toFixed(0)})`], ...lines()];
    this.el.innerHTML = rows.map(([k, v]) => `<div><b>${k}</b> ${v}</div>`).join('');
  }
}
