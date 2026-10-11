// Settings sheet: graphics tier, field of view, look, and desktop key bindings. Persisted by the callers.
import { TIERS, type Tier } from '../core/quality';
import {
  ACTION_LABELS, ACTIONS, FOV_MAX, FOV_MIN, SENS_MAX, SENS_MIN,
  controlPrefs, keyLabel, resetControls, setFov, setGameplayHeld, setInvertLook, setLookSensitivity, tryBind,
  type Action,
} from '../input/controls';
import { paintTierPreview } from './tierPreview';

const TIER_BLURB: Record<Tier, string> = {
  low: 'Simple streets, no glow, light weather.',
  medium: 'Lighter streets, scanline signs, some traffic.',
  high: 'Full streets, bloom, denser rain and crowds.',
  ultra: 'Sharpest image, full detail, heavy weather.',
};

type Choice = Tier | 'auto';

export class SettingsPanel {
  private readonly back: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly cards = new Map<Choice, HTMLButtonElement>();
  private readonly previews = new Map<Choice, HTMLCanvasElement>();
  private readonly autoBlurb: HTMLSpanElement;
  private readonly fov: HTMLInputElement;
  private readonly fovOut: HTMLSpanElement;
  private readonly sens: HTMLInputElement;
  private readonly sensOut: HTMLSpanElement;
  private readonly invert: HTMLInputElement;
  private readonly bindButtons = new Map<Action, HTMLButtonElement>();
  private readonly status: HTMLParagraphElement;
  private value: Choice;
  private applied: Tier;
  private capturing: Action | null = null;
  private returnFocus: HTMLElement | null = null;

  constructor(
    private cb: { setQuality(t: Choice): void },
    opts: { quality: Choice; autoTier: Tier },
  ) {
    this.value = opts.quality;
    this.applied = opts.quality === 'auto' ? opts.autoTier : opts.quality;
    this.autoTier = opts.autoTier;

    this.back = document.createElement('div');
    this.back.className = 'settings-back';
    this.back.hidden = true;
    this.panel = document.createElement('div');
    this.panel.className = 'settings-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-labelledby', 'settings-title');
    this.back.appendChild(this.panel);

    const head = document.createElement('div');
    head.className = 'settings-head';
    const title = document.createElement('h2');
    title.id = 'settings-title';
    title.textContent = 'Settings';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'settings-close';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.close());
    head.append(title, close);
    this.panel.appendChild(head);

    const graphics = section('Graphics');
    const note = document.createElement('p');
    note.className = 'settings-note';
    note.textContent = 'The whole city stays. Lower tiers draw simpler streets, weather, and lights.';
    graphics.appendChild(note);
    const grid = document.createElement('div');
    grid.className = 'tier-grid';
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', 'Graphics tier');
    grid.addEventListener('keydown', (e) => this.onTierKey(e));
    this.autoBlurb = document.createElement('span');
    this.autoBlurb.className = 'tier-blurb';
    this.addCard(grid, 'auto', 'Auto', this.autoBlurb);
    for (const tier of TIERS) {
      const blurb = document.createElement('span');
      blurb.className = 'tier-blurb';
      blurb.textContent = TIER_BLURB[tier];
      this.addCard(grid, tier, tier[0].toUpperCase() + tier.slice(1), blurb);
    }
    graphics.appendChild(grid);
    this.panel.appendChild(graphics);

    const view = section('View');
    const fovRow = this.slider('Field of view', FOV_MIN, FOV_MAX, 1, controlPrefs.fov);
    this.fov = fovRow.input;
    this.fovOut = fovRow.out;
    this.fov.addEventListener('input', () => {
      setFov(Number(this.fov.value));
      this.fovOut.textContent = fovLabel(controlPrefs.fov);
    });
    const sensRow = this.slider('Look sensitivity', SENS_MIN, SENS_MAX, 0.05, controlPrefs.lookSensitivity);
    this.sens = sensRow.input;
    this.sensOut = sensRow.out;
    this.sens.addEventListener('input', () => {
      setLookSensitivity(Number(this.sens.value));
      this.sensOut.textContent = sensLabel(controlPrefs.lookSensitivity);
    });
    view.append(fovRow.label, sensRow.label);

    const invertLabel = document.createElement('label');
    invertLabel.className = 'settings-check';
    this.invert = document.createElement('input');
    this.invert.type = 'checkbox';
    this.invert.checked = controlPrefs.invertLook;
    this.invert.addEventListener('change', () => setInvertLook(this.invert.checked));
    const invertText = document.createElement('span');
    invertText.textContent = 'Invert look';
    invertLabel.append(this.invert, invertText);
    view.appendChild(invertLabel);
    this.panel.appendChild(view);

    const keys = section('Controls');
    const keyNote = document.createElement('p');
    keyNote.className = 'settings-note';
    keyNote.textContent = 'Desktop keys. Touch uses the sticks. Saved on this device.';
    keys.appendChild(keyNote);
    const list = document.createElement('div');
    list.className = 'bind-list';
    for (const action of ACTIONS) {
      const row = document.createElement('div');
      row.className = 'bind-row';
      const name = document.createElement('span');
      name.textContent = ACTION_LABELS[action];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bind';
      btn.textContent = keyLabel(controlPrefs.binds[action]);
      btn.addEventListener('click', () => this.arm(action));
      this.bindButtons.set(action, btn);
      row.append(name, btn);
      list.appendChild(row);
    }
    keys.appendChild(list);
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'settings-reset';
    reset.textContent = 'Reset controls';
    reset.addEventListener('click', () => {
      this.cancelCapture();
      resetControls();
      this.syncControls();
      this.setStatus('Controls reset.');
    });
    keys.appendChild(reset);
    this.panel.appendChild(keys);

    this.status = document.createElement('p');
    this.status.className = 'settings-status';
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.panel.appendChild(this.status);

    this.back.addEventListener('pointerdown', (e) => {
      if (e.target === this.back) this.close();
    });
    this.panel.id = 'settings-dialog';
    this.panel.addEventListener('keydown', (e) => this.onPanelKey(e), true);
    document.body.appendChild(this.back);
    this.renderAuto();
    this.syncCards();
    this.paintAll();
  }

  private autoTier: Tier;

  open(returnFocus?: HTMLElement | null): void {
    this.cancelCapture();
    this.syncControls();
    this.returnFocus = returnFocus ?? null;
    this.back.hidden = false;
    document.body.classList.add('settings-on');
    setGameplayHeld(true);
    if (document.pointerLockElement) document.exitPointerLock();
    queueMicrotask(() => this.cards.get(this.value)?.focus());
  }

  close(): void {
    if (this.back.hidden) return;
    this.cancelCapture();
    this.back.hidden = true;
    document.body.classList.remove('settings-on');
    setGameplayHeld(false);
    this.returnFocus?.focus();
    this.returnFocus = null;
  }

  setQualityValue(v: Choice): void {
    this.value = v;
    this.syncCards();
    this.renderAuto();
    this.paintAuto();
  }

  setAppliedTier(tier: Tier): void {
    this.applied = tier;
    this.renderAuto();
    if (this.value === 'auto') this.paintAuto();
  }

  private addCard(grid: HTMLElement, id: Choice, name: string, blurb: HTMLElement): void {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'tier-card';
    card.dataset.tier = id;
    card.setAttribute('role', 'radio');
    card.addEventListener('click', () => this.choose(id));
    const canvas = document.createElement('canvas');
    canvas.className = 'tier-preview';
    canvas.setAttribute('aria-hidden', 'true');
    const title = document.createElement('span');
    title.className = 'tier-name';
    title.textContent = name;
    const text = document.createElement('span');
    text.className = 'tier-copy';
    text.append(title, blurb);
    card.append(canvas, text);
    grid.appendChild(card);
    this.cards.set(id, card);
    this.previews.set(id, canvas);
  }

  private choose(id: Choice): void {
    if (this.value === id) {
      this.cards.get(id)?.focus();
      return;
    }
    this.cb.setQuality(id);
    this.cards.get(id)?.focus();
  }

  private onTierKey(e: KeyboardEvent): void {
    const order: Choice[] = ['auto', ...TIERS];
    const i = order.indexOf(this.value);
    let n = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % order.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + order.length) % order.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = order.length - 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    this.choose(order[n]);
  }

  private onPanelKey(e: KeyboardEvent): void {
    if (this.capturing) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === 'Tab') {
        this.cancelCapture();
        this.setStatus('Binding cancelled.');
        return;
      }
      if (e.repeat || e.metaKey || e.altKey || e.ctrlKey) return;
      const err = tryBind(this.capturing, e.code);
      const action = this.capturing;
      this.cancelCapture();
      this.syncBinds();
      this.setStatus(err ?? `${ACTION_LABELS[action]} is ${keyLabel(controlPrefs.binds[action])}.`);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = this.focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !this.panel.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  private arm(action: Action): void {
    this.cancelCapture();
    this.capturing = action;
    const btn = this.bindButtons.get(action);
    if (!btn) return;
    btn.classList.add('listening');
    btn.textContent = 'Press a key';
    btn.focus();
    this.setStatus(`Press a key for ${ACTION_LABELS[action]}. Esc cancels.`);
  }

  private cancelCapture(): void {
    if (!this.capturing) return;
    const btn = this.bindButtons.get(this.capturing);
    btn?.classList.remove('listening');
    this.capturing = null;
    this.syncBinds();
  }

  private syncControls(): void {
    this.fov.value = String(controlPrefs.fov);
    this.fovOut.textContent = fovLabel(controlPrefs.fov);
    this.sens.value = String(controlPrefs.lookSensitivity);
    this.sensOut.textContent = sensLabel(controlPrefs.lookSensitivity);
    this.invert.checked = controlPrefs.invertLook;
    this.syncBinds();
  }

  private syncBinds(): void {
    for (const action of ACTIONS) {
      const btn = this.bindButtons.get(action);
      if (!btn || this.capturing === action) continue;
      btn.textContent = keyLabel(controlPrefs.binds[action]);
    }
  }

  private syncCards(): void {
    for (const [id, card] of this.cards) {
      const on = id === this.value;
      card.setAttribute('aria-checked', on ? 'true' : 'false');
      card.tabIndex = on ? 0 : -1;
    }
  }

  private renderAuto(): void {
    const playing = this.value === 'auto' && this.applied !== this.autoTier
      ? ` Playing at ${this.applied} after a slow patch.`
      : '';
    this.autoBlurb.textContent = `Follows this device (${this.autoTier}). Steps down if frames stay slow.${playing}`;
  }

  private paintAll(): void {
    for (const tier of TIERS) {
      const canvas = this.previews.get(tier);
      if (canvas) paintTierPreview(canvas, tier);
    }
    this.paintAuto();
  }

  private paintAuto(): void {
    const canvas = this.previews.get('auto');
    if (!canvas) return;
    const shown = this.value === 'auto' ? this.applied : this.autoTier;
    paintTierPreview(canvas, shown, true);
  }

  private slider(name: string, min: number, max: number, step: number, value: number): { label: HTMLLabelElement; input: HTMLInputElement; out: HTMLSpanElement } {
    const label = document.createElement('label');
    label.className = 'settings-slider';
    const title = document.createElement('span');
    title.textContent = name;
    const out = document.createElement('span');
    out.className = 'v';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-label', name);
    out.textContent = step >= 1 ? fovLabel(value) : sensLabel(value);
    label.append(title, out, input);
    return { label, input, out };
  }

  private focusables(): HTMLElement[] {
    return [...this.panel.querySelectorAll<HTMLElement>('button, input, [href], select, textarea')]
      .filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
  }

  private setStatus(text: string): void {
    this.status.textContent = text;
  }
}

function section(title: string): HTMLElement {
  const el = document.createElement('section');
  const h = document.createElement('h3');
  h.textContent = title;
  el.appendChild(h);
  return el;
}

function fovLabel(v: number): string {
  return `${Math.round(v)}°`;
}

function sensLabel(v: number): string {
  return `${v.toFixed(2)}×`;
}
