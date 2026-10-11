// Facade tables shared by the city material and the lit-window census.
// CELL_H is the storey a person counts. Housing, shops, civic, coffer, masonry
// and deco sit in 3–4 m. Slit and monolith stay tall panels, not floors.
// Window fractions are retuned so a pane keeps about the same absolute height
// when its cell shrinks. Industrial bays become 3.5 m storeys; the pane stays ~1.75 m.

export const CELL_W = [1, 3.6, 2.2, 9.0, 3.2, 5.0, 3.2, 6.0, 3.4, 3.0, 4.0, 19.0, 4.6, 6.0, 11.7, 2.6, 3.3, 9.6, 3.2, 1.7];
export const CELL_H = [1, 3.6, 4.0, 3.5, 3.2, 3.4, 3.1, 4.0, 3.2, 3.4, 3.2, 4.0, 13.0, 4.5, 11.7, 3.5, 3.3, 3.9, 3.2, 3.8];
export const WIN_W = [0, 0.55, 0.7, 0.3, 0.6, 0.35, 0.5, 0.25, 0.45, 0.6, 0, 0.97, 0.14, 0.94, 0.07, 0.2, 0.48, 0.8, 0.34, 0.16];
export const WIN_H = [0, 0.45, 0.5, 0.50, 0.5, 0.35, 0.45, 0.28, 0.45, 0.5, 0, 0.44, 0.86, 0.82, 0.05, 0.74, 0.50, 0.22, 0.58, 0.72];

/**
 * 1 = residential or office glazing that gets a parallax room.
 * Industrial, coastal, slits, glow, monolith and windowless styles stay flat.
 * Index is Style id.
 */
export const ROOM_STYLE = [0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1];

/** Half-width of the occupancy band around each facade's lit threshold. Symmetric, so the mean holds. */
export const SCHED_BAND = 0.008;
