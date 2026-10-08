// On-screen joysticks for iPhone/iPad: left stick = move, right stick = look, plus up/down/boost buttons.
import type { TouchState } from './Input';

class Stick {
  readonly el: HTMLDivElement;
  private knob: HTMLDivElement;
  private id: number | null = null;
  private cx = 0;
  private cy = 0;
  x = 0;
  y = 0;

  constructor(parent: HTMLElement, cls: string, private radius = 52) {
    this.el = document.createElement('div');
    this.el.className = `stick ${cls}`;
    this.knob = document.createElement('div');
    this.knob.className = 'knob';
    this.el.appendChild(this.knob);
    parent.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => {
      if (this.id !== null) return;
      this.id = e.pointerId;
      this.el.setPointerCapture(e.pointerId);
      const r = this.el.getBoundingClientRect();
      this.cx = r.left + r.width / 2;
      this.cy = r.top + r.height / 2;
      this.move(e);
      e.preventDefault();
    });
    this.el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.id) this.move(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.id) return;
      this.id = null;
      this.x = this.y = 0;
      this.knob.style.transform = 'translate(-50%, -50%)';
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  }

  private move(e: PointerEvent): void {
    let dx = e.clientX - this.cx, dy = e.clientY - this.cy;
    const l = Math.hypot(dx, dy);
    if (l > this.radius) { dx *= this.radius / l; dy *= this.radius / l; }
    this.x = dx / this.radius;
    this.y = dy / this.radius;
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
}

function holdButton(parent: HTMLElement, label: string, cls: string, set: (v: boolean) => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `tbtn ${cls}`;
  b.textContent = label;
  b.addEventListener('pointerdown', (e) => { set(true); b.setPointerCapture(e.pointerId); e.preventDefault(); });
  const up = () => set(false);
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  parent.appendChild(b);
  return b;
}

export class TouchControls {
  readonly root: HTMLDivElement;
  private move: Stick;
  private look: Stick;
  private flyButtons: HTMLDivElement;

  constructor(private state: TouchState) {
    this.root = document.createElement('div');
    this.root.className = 'touch-ui';
    document.body.appendChild(this.root);
    this.move = new Stick(this.root, 'left');
    this.look = new Stick(this.root, 'right');
    this.flyButtons = document.createElement('div');
    this.flyButtons.className = 'fly-buttons';
    this.root.appendChild(this.flyButtons);
    holdButton(this.flyButtons, '▲', 'up', (v) => (state.up = v));
    holdButton(this.flyButtons, '▼', 'down', (v) => (state.down = v));
    holdButton(this.flyButtons, '»', 'boost', (v) => (state.boost = v));
  }

  static wanted(): boolean {
    return matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).get('touch') === '1';
  }

  setMode(mode: 'fly' | 'walk' | 'cine'): void {
    this.root.style.display = mode === 'cine' ? 'none' : '';
    this.flyButtons.style.display = mode === 'fly' ? '' : 'none';
    this.flyButtons.querySelector<HTMLButtonElement>('.boost')!.style.display = '';
  }

  update(): void {
    const s = this.state;
    const dz = (v: number) => (Math.abs(v) < 0.12 ? 0 : v);
    s.moveX = dz(this.move.x);
    s.moveY = -dz(this.move.y);
    s.lookX = dz(this.look.x) * Math.abs(this.look.x);
    s.lookY = dz(this.look.y) * Math.abs(this.look.y);
  }
}
