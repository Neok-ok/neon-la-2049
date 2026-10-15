/**
 * What is allowed into the city.
 *
 * Billboard cards, the ray march, and the lit-shell prototype never cleared a
 * 7. They stay in the repo and out of the frame. The live plume is the path
 * that draws: soft curtains, wind lean, and a lighter card count on medium
 * and low. `?smoke=off` hides it for a comparison load.
 */
import { params } from '../../core/params';

/**
 * Soft live plumes. Built after the rebase and left off: the 15 October
 * critics scored the stills 2, 2, and 3 overall. `?smoke=live` draws them
 * for a still. A normal load does not.
 */
export const SMOKE_LIVE: boolean = params.smoke === 'live';

/** Camera-facing stamps. Twelve rounds, none cleared 7. Off. */
export const SMOKE_CARDS: boolean = false;

/**
 * Ray-marched launch sheath. The burn-camera still read as a searchlight
 * (film 4 and 1, realism 2 and 1). Off.
 */
export const SMOKE_LAUNCH_VOLUME: boolean = false;

/** Knee-high manhole sheet. The market still had no steam the critics would count. Off. */
export const SMOKE_MANHOLE_VOLUME: boolean = false;

/** Tailpipe wakes. The avenue still read as lamps. Off. */
export const SMOKE_EXHAUST_VOLUME: boolean = false;

/**
 * Lit soft shells around the flame. Off until the film, realism, and
 * technical critics each score the still at 7 or higher.
 */
export const SMOKE_LAUNCH_SHELL: boolean = false;

/** Lit soft shells on a manhole. Same gate as the launch shells. Off. */
export const SMOKE_MANHOLE_SHELL: boolean = false;
