// Emissive roles for the B1 towers.
// Glow faces are Style.Glow on the shared city shader. That shader scales the family
// by NITS.window, so these are not a second exposure and not a punctual light per tower.
import { NITS } from '../../lighting/presets.ts';
import { Style, SignColor, type StyleId } from '../fabric/types';

export const LIGHT_ADAPTER = 'l1';

/** Nit scale the city material applies to every glow face, including these roles. */
export const TOWER_GLOW_NITS = NITS.window;

/** Window lottery, crown lanterns, door soffits, obstruction tips, ad faces. */
export const LIGHT_ROLES = {
  /** Fraction of façade cells the city window shader may light. Not a scene light. */
  windows: { lit: 0.34, nightScale: 'U.windowLit' },
  doorSoffit: { style: Style.Glow as StyleId, lit: 0.72, tint: 1.15, h: 0.1 },
  crown: { style: Style.Glow as StyleId, lit: 0.88, tint: 1.32 },
  obstruction: { style: Style.Glow as StyleId, lit: 1, tint: 1.85 },
  adFace: { style: Style.Glow as StyleId, lit: 0.5, tint: 1.25 },
} as const;

/** Lease-band colours. No food cells. The sign mesh is the existing chunk instance, not a new draw. */
export const AD_COLORS = [SignColor.Cyan, SignColor.Amber, SignColor.White, SignColor.Pink] as const;
