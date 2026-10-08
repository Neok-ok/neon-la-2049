// Unified input: keyboard + mouse (pointer lock or drag-to-look) + touch joysticks (see TouchControls).
export interface TouchState {
  moveX: number; // -1..1 (strafe)
  moveY: number; // -1..1 (forward = +1)
  lookX: number; // -1..1 continuous turn rate
  lookY: number;
  up: boolean;
  down: boolean;
  boost: boolean;
}

export class Input {
  readonly keys = new Set<string>();
  private lookDX = 0;
  private lookDY = 0;
  private dragging = false;
  private pressed = new Set<string>();
  readonly touch: TouchState = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, up: false, down: false, boost: false };
  pointerLockWanted = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      if (this.pointerLockWanted && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.()?.catch?.(() => {});
      }
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas || this.dragging) {
        this.lookDX += e.movementX;
        this.lookDY += e.movementY;
      }
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Was the key pressed since the last frame (edge-triggered)? */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  endFrame(): void {
    this.pressed.clear();
  }

  /** Mouse delta since last call (pixels). */
  consumeLook(): [number, number] {
    const r: [number, number] = [this.lookDX, this.lookDY];
    this.lookDX = this.lookDY = 0;
    return r;
  }

  key(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  /** forward (+1) / back (-1) */
  get forward(): number {
    return (this.key('KeyW') ? 1 : 0) - (this.key('KeyS') ? 1 : 0) + this.touch.moveY;
  }
  get strafe(): number {
    return (this.key('KeyD') ? 1 : 0) - (this.key('KeyA') ? 1 : 0) + this.touch.moveX;
  }
  get vertical(): number {
    return (this.key('Space', 'KeyE') || this.touch.up ? 1 : 0) - (this.key('KeyC', 'KeyQ', 'ControlLeft') || this.touch.down ? 1 : 0);
  }
  get turn(): number {
    return (this.key('ArrowRight') ? 1 : 0) - (this.key('ArrowLeft') ? 1 : 0) + this.touch.lookX;
  }
  get tilt(): number {
    return (this.key('ArrowDown') ? 1 : 0) - (this.key('ArrowUp') ? 1 : 0) + this.touch.lookY;
  }
  get boost(): boolean {
    return this.key('ShiftLeft', 'ShiftRight') || this.touch.boost;
  }
}
