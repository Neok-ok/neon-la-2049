// Original grade names. No film titles, logos, or trademarked words.
// These run after tone mapping, in display light, so a later change to the
// scene's tone curve does not flatten them.
import type { GradeId } from './types';

export interface Grade {
  id: GradeId;
  name: string;
  /** Added after tone mapping. */
  lift: [number, number, number];
  /** Multiplied after tone mapping. */
  gain: [number, number, number];
  saturation: number;
  contrast: number;
  /** 1 is unchanged. Above 1 lifts the shadows. */
  gamma: number;
}

export const GRADES: readonly Grade[] = [
  { id: 'plain', name: 'Plain', lift: [0, 0, 0], gain: [1, 1, 1], saturation: 1, contrast: 1, gamma: 1 },
  { id: 'sodium', name: 'Sodium haze', lift: [0.012, 0.004, 0], gain: [1.18, 0.78, 0.48], saturation: 0.82, contrast: 1.08, gamma: 0.96 },
  { id: 'neon', name: 'Neon rain', lift: [0.008, 0, 0.016], gain: [0.82, 1.06, 1.22], saturation: 1.28, contrast: 1.14, gamma: 1.04 },
  { id: 'ash', name: 'Ash snow', lift: [0.03, 0.032, 0.036], gain: [0.9, 0.93, 0.98], saturation: 0.32, contrast: 1.06, gamma: 1.08 },
  { id: 'harbor', name: 'Harbor fog', lift: [0.016, 0.022, 0.02], gain: [0.72, 0.84, 0.86], saturation: 0.66, contrast: 0.94, gamma: 1.12 },
  { id: 'orange', name: 'Orange haze', lift: [0.004, 0.006, 0.02], gain: [1.18, 0.74, 0.46], saturation: 0.84, contrast: 1.16, gamma: 0.9 },
  { id: 'cyan', name: 'Cold cyan', lift: [0.008, 0.02, 0.06], gain: [0.68, 0.88, 1.28], saturation: 0.8, contrast: 1.06, gamma: 1.08 },
  { id: 'amber', name: 'Amber ruin', lift: [0.028, 0.016, 0.012], gain: [1.18, 0.8, 0.48], saturation: 0.72, contrast: 1.06, gamma: 1 },
];

const BY_ID = new Map(GRADES.map((g) => [g.id, g]));

export function gradeById(id: GradeId): Grade {
  return BY_ID.get(id) ?? GRADES[0]!;
}
