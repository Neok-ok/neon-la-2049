// Shared circle-of-confusion curve. The sensor term is a thin lens. The shaped term
// opens once a point leaves the focus plane, because a 720p frame hides f/4 from f/16.
// Rain streaks use the same edges so a drop softens with its own distance.

export const BOKEH = {
  /** Relative focus error where the near side starts to open, then saturates. */
  near0: 0.22,
  near1: 0.9,
  /** Background opens earlier than the foreground and keeps climbing down the street. */
  far0: 0.06,
  far1: 0.55,
  /** f/16 contributes nothing. f/2 is fully open. */
  stopHi: 11,
  stopLo: 2,
  /** 28 mm stays near the sensor circle. 55 mm carries the shaped disc. */
  focalLo: 32,
  focalHi: 58,
};
