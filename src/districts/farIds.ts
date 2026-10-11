// Districts outside the opening downtown view. Their modules load after the entry
// chunk so the first frame does not wait on the whole basin. Fabric for these
// archetypes is not generated until the detailed module has replaced any shared blockout.

/** Archetype ids registered by a far district module. `basin-sprawl` stays eager: it is the fallback. */
export const FAR_ARCHETYPES: ReadonlySet<string> = new Set([
  'lakewood-megablocks',
  'south-la-megablocks',
  'westside-sprawl',
  'southeast-refinery',
  'hollywood-strip',
  'lax-apron',
  'south-bay-refinery',
  'harbor-port',
  'long-beach-core',
  'east-la-sprawl',
  'coastal-grey',
]);

/** District ids whose LOD0 props, interiors, or landmarks can arrive after the first frame. */
export const FAR_DISTRICTS: ReadonlySet<string> = new Set([
  'lakewood-megablocks',
  'south-la-megablocks',
  'westside',
  'basin-sprawl',
  'southeast-industrial',
  'hollywood',
  'lax-spaceport',
  'south-bay-refineries',
  'harbor',
  'long-beach',
  'east-la',
  'coastal-strip',
]);

/** Landmark types whose detailed builder lives in a far chunk. Blockouts fill in if that chunk fails. */
export const DEFERRED_LANDMARKS: ReadonlySet<string> = new Set(['veil-mark', 'spaceport']);
