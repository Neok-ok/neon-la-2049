/**
 * What is allowed into the city.
 *
 * Billboard cards never cleared a 7 with the film, realism, and technical
 * critics. They stay in the repo and out of the frame. A volume is on only
 * after those three each score it at 7 or better. Until then the flag is off
 * and the effect is not drawn.
 */

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
