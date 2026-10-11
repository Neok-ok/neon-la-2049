// Facade tables shared by the city material and the lit-window census.
// The arrays are the same values the night city has always used.

export const CELL_W = [1, 3.6, 2.2, 9.0, 3.2, 5.0, 3.2, 6.0, 3.4, 3.0, 4.0, 19.0, 4.6, 6.0, 11.7, 2.6, 7.2, 9.6, 3.2, 1.7];
export const CELL_H = [1, 3.6, 4.0, 7.0, 3.2, 3.4, 3.1, 5.5, 3.2, 3.4, 3.2, 4.4, 13.0, 4.5, 11.7, 3.5, 6.6, 3.9, 4.8, 5.6];
export const WIN_W = [0, 0.55, 0.7, 0.3, 0.6, 0.35, 0.5, 0.25, 0.45, 0.6, 0, 0.97, 0.14, 0.94, 0.07, 0.2, 0.36, 0.8, 0.34, 0.16];
export const WIN_H = [0, 0.45, 0.5, 0.25, 0.5, 0.35, 0.45, 0.2, 0.45, 0.5, 0, 0.4, 0.86, 0.82, 0.05, 0.74, 0.32, 0.22, 0.66, 0.78];

/**
 * 1 = residential or office glazing that gets a parallax room.
 * Industrial, coastal, slits, glow, monolith and windowless styles stay flat.
 * Index is Style id.
 */
export const ROOM_STYLE = [0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1];

/** Half-width of the occupancy band around each facade's lit threshold. Symmetric, so the mean holds. */
export const SCHED_BAND = 0.008;
