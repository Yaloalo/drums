import type { FMPatch } from '../model/types.ts';

/** One source of truth for the audio graph and its visual routing diagram. */
export const FM_ALGORITHMS: Record<
  FMPatch['algorithm'],
  { links: [number, number][]; carriers: number[] }
> = {
  1: {
    links: [
      [3, 2],
      [2, 1],
      [1, 0],
    ],
    carriers: [0],
  },
  2: {
    links: [
      [3, 1],
      [2, 1],
      [1, 0],
    ],
    carriers: [0],
  },
  3: {
    links: [
      [3, 2],
      [2, 0],
      [1, 0],
    ],
    carriers: [0],
  },
  4: {
    links: [
      [1, 0],
      [3, 2],
    ],
    carriers: [0, 2],
  },
  5: {
    links: [
      [1, 0],
      [2, 0],
      [3, 0],
    ],
    carriers: [0],
  },
  6: { links: [], carriers: [0, 1, 2, 3] },
};
