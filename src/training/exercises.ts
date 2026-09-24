import type {
  Exercise,
  ExercisePart,
  ExerciseSkill,
  ExerciseStyle,
} from '../model/types.ts';
import { deepFreeze } from '../model/types.ts';
import { RHYTHM_PRESETS } from '../presets/rhythms.ts';
import { stepsForMeter } from '../transport/timing.ts';

export const SKILLS: { id: ExerciseSkill; name: string; text: string }[] = [
  { id: 'pulse', name: 'Pulse', text: 'Even beats locked to the click' },
  { id: 'subdivision', name: 'Subdivision', text: 'Splitting the beat evenly' },
  { id: 'accents', name: 'Accents', text: 'Moving the emphasis between pads' },
  { id: 'rests', name: 'Rests', text: 'Feeling the notes you don’t play' },
  { id: 'syncopation', name: 'Syncopation', text: 'Landing between the beats' },
  {
    id: 'coordination',
    name: 'Coordination',
    text: 'Two parts, one time feel',
  },
  { id: 'grooves', name: 'Grooves', text: 'Full beats across the kit' },
  { id: 'rudiments', name: 'Rudiments', text: 'Stickings on two pads' },
  { id: 'fills', name: 'Fills', text: 'Leaving and returning to the groove' },
  { id: 'meters', name: 'Meters', text: 'Bars of three, five, six and seven' },
  { id: 'triplets', name: 'Triplets & shuffle', text: 'Three notes per beat' },
  { id: 'polyrhythm', name: 'Polyrhythm', text: 'Two pulses at once' },
  { id: 'tempo', name: 'Tempo control', text: 'Keeping time without help' },
  {
    id: 'latin',
    name: 'Latin & clave',
    text: 'Timelines from Afro-Cuban music',
  },
];

export const STYLES: { id: ExerciseStyle; name: string }[] = [
  { id: 'fundamentals', name: 'Fundamentals' },
  { id: 'rock', name: 'Rock' },
  { id: 'funk', name: 'Funk' },
  { id: 'hip-hop', name: 'Hip-hop' },
  { id: 'dance', name: 'Dance' },
  { id: 'latin', name: 'Latin' },
  { id: 'jazz-blues', name: 'Jazz & blues' },
  { id: 'world', name: 'World' },
];

export const LEVELS = [
  'Beginner',
  'Easy',
  'Intermediate',
  'Advanced',
  'Expert',
];

export const skillName = (skill: ExerciseSkill) =>
  SKILLS.find((item) => item.id === skill)?.name ?? skill;
export const styleName = (style: ExerciseStyle) =>
  STYLES.find((item) => item.id === style)?.name ?? style;
export const levelName = (level: number) =>
  LEVELS[level - 1] ?? `Level ${level}`;

// Pad positions as laid out in every factory kit.
const K = 0;
const S = 1;
const H = 2;
const O = 3;
const TL = 4;
const TH = 5;
const MAL = 9;
const CR = 11;
const CLV = 13;

/** Every `step`th sixteenth from `from` up to `length`. */
const every = (step: number, length: number, from = 0) =>
  Array.from(
    { length: Math.ceil((length - from) / step) },
    (_, i) => from + i * step,
  );
const without = (steps: number[], remove: number[]) =>
  steps.filter((step) => !remove.includes(step));
const eighths = every(2, 16);
const sixteenths = every(1, 16);

interface Spec {
  id: string;
  title: string;
  summary: string;
  instructions: string[];
  tip?: string;
  skill: ExerciseSkill;
  style?: ExerciseStyle;
  difficulty: Exercise['difficulty'];
  meter?: string;
  bars?: number;
  bpm: number;
  range: [number, number];
  parts: Record<number, number[]>;
  backing?: string;
  gap?: Exercise['gap'];
}

const specs: Spec[] = [
  // ─── Pulse ───
  {
    id: 'quarter-notes',
    title: 'Quarter notes',
    skill: 'pulse',
    difficulty: 1,
    bpm: 80,
    range: [50, 140],
    summary: 'Four even hits per bar, locked to the click.',
    instructions: [
      'Play SNARE on every beat, together with the click.',
      'Keep the space between hits exactly the same.',
    ],
    tip: 'Count “1 2 3 4” out loud while you play.',
    parts: { [S]: [0, 4, 8, 12] },
  },
  {
    id: 'half-notes',
    title: 'Half notes',
    skill: 'pulse',
    difficulty: 1,
    bpm: 72,
    range: [50, 120],
    summary: 'Two hits per bar; the click fills the gaps.',
    instructions: [
      'Play KICK on beats 1 and 3.',
      'Feel beats 2 and 4 in the click without playing them.',
    ],
    parts: { [K]: [0, 8] },
  },
  {
    id: 'beat-one',
    title: 'Beat one',
    skill: 'pulse',
    difficulty: 2,
    bpm: 90,
    range: [60, 130],
    summary: 'One hit per bar under running eighth notes.',
    instructions: [
      'The hats play eighth notes for you.',
      'Play KICK only on beat 1 of each bar.',
    ],
    tip: 'Long gaps are where timing drifts. Count the whole bar.',
    parts: { [K]: [0] },
    backing: 'rhythm-eighth-pulse',
  },
  {
    id: 'four-on-the-floor',
    title: 'Four on the floor',
    skill: 'pulse',
    style: 'dance',
    difficulty: 1,
    bpm: 120,
    range: [90, 130],
    summary: 'The house kick under claps and open hats.',
    instructions: [
      'Play KICK on every beat.',
      'Lock in with the clap on 2 and 4.',
    ],
    parts: { [K]: [0, 4, 8, 12] },
    backing: 'rhythm-house-floor',
  },

  // ─── Subdivision ───
  {
    id: 'eighth-notes',
    title: 'Eighth notes',
    skill: 'subdivision',
    difficulty: 1,
    bpm: 84,
    range: [60, 140],
    summary: 'Two even notes per beat over a quarter-note kick.',
    instructions: [
      'Play HAT twice per beat: on the beat and on the “&”.',
      'The kick marks the beats for you.',
    ],
    tip: 'Say “1 & 2 & 3 & 4 &”.',
    parts: { [H]: eighths },
    backing: 'rhythm-quarter-pulse',
  },
  {
    id: 'sixteenth-notes',
    title: 'Sixteenth notes',
    skill: 'subdivision',
    difficulty: 3,
    bpm: 72,
    range: [50, 110],
    summary: 'Four even notes per beat under a backbeat.',
    instructions: [
      'Play HAT four times per beat: “1 e & a”.',
      'Kick and snare play the backbeat.',
    ],
    tip: 'Alternate two fingers so each one plays every other note.',
    parts: { [H]: sixteenths },
    backing: 'rhythm-basic-backbeat',
  },
  {
    id: 'gear-change',
    title: 'Gear change',
    skill: 'subdivision',
    difficulty: 3,
    bars: 2,
    bpm: 76,
    range: [55, 110],
    summary: 'Eighths for a bar, sixteenths for a bar.',
    instructions: [
      'Bar 1: eighth notes on HAT.',
      'Bar 2: double up to sixteenth notes.',
      'Switch without the tempo moving.',
    ],
    parts: { [H]: [...eighths, ...every(1, 32, 16)] },
    backing: 'rhythm-basic-backbeat',
  },
  {
    id: 'only-the-e',
    title: 'Only the “e”',
    skill: 'subdivision',
    difficulty: 4,
    bpm: 70,
    range: [50, 100],
    summary: 'The second sixteenth of every beat, and nothing else.',
    instructions: [
      'Play SNARE on the “e” of each beat — right after the beat.',
      'The hats keep eighth notes so you can hear the grid.',
    ],
    tip: 'Count all four sixteenths silently and play only the second.',
    parts: { [S]: [1, 5, 9, 13] },
    backing: 'rhythm-eighth-pulse',
  },
  {
    id: 'only-the-a',
    title: 'Only the “a”',
    skill: 'subdivision',
    difficulty: 4,
    bpm: 70,
    range: [50, 100],
    summary: 'The last sixteenth of every beat, just before the next.',
    instructions: [
      'Play SNARE on the “a” of each beat — just before the next beat.',
    ],
    tip: 'Hear it as a pickup into the next beat.',
    parts: { [S]: [3, 7, 11, 15] },
    backing: 'rhythm-eighth-pulse',
  },

  // ─── Accents ───
  {
    id: 'beats-and-ands',
    title: 'Beats and “&”s',
    skill: 'accents',
    difficulty: 2,
    bpm: 88,
    range: [60, 130],
    summary: 'Eighth notes split across two pads.',
    instructions: ['Play eighth notes: every beat on SNARE, every “&” on HAT.'],
    parts: { [S]: [0, 4, 8, 12], [H]: [2, 6, 10, 14] },
  },
  {
    id: 'accented-sixteenths',
    title: 'Accented sixteenths',
    skill: 'accents',
    difficulty: 3,
    bpm: 66,
    range: [50, 100],
    summary: 'The first of every four sixteenths moves to the snare.',
    instructions: [
      'Play sixteenth notes on HAT.',
      'Move the note on each beat to SNARE.',
    ],
    parts: { [S]: [0, 4, 8, 12], [H]: without(sixteenths, [0, 4, 8, 12]) },
  },
  {
    id: 'three-three-two',
    title: '3 + 3 + 2 accents',
    skill: 'accents',
    difficulty: 3,
    bpm: 90,
    range: [60, 130],
    summary: 'Eight eighth notes grouped 3 + 3 + 2.',
    instructions: [
      'Play eighth notes on HAT.',
      'Move notes 1, 4 and 7 to SNARE: “1 & 2 | & 3 & | 4 &”.',
    ],
    parts: { [S]: [0, 6, 12], [H]: without(eighths, [0, 6, 12]) },
    backing: 'rhythm-quarter-pulse',
  },
  {
    id: 'moving-accent',
    title: 'Moving accent',
    skill: 'accents',
    difficulty: 4,
    bpm: 72,
    range: [50, 100],
    summary: 'An accent every fifth sixteenth, drifting across the beat.',
    instructions: [
      'Play sixteenth notes on HAT.',
      'Put every fifth note on SNARE: the accent lands one sixteenth later each beat.',
    ],
    parts: { [S]: [0, 5, 10, 15], [H]: without(sixteenths, [0, 5, 10, 15]) },
    backing: 'rhythm-quarter-pulse',
  },

  // ─── Rests ───
  {
    id: 'skip-three',
    title: 'Skip beat 3',
    skill: 'rests',
    difficulty: 1,
    bpm: 80,
    range: [50, 130],
    summary: 'Three quarter notes and one felt rest.',
    instructions: [
      'Play SNARE on beats 1, 2 and 4.',
      'Stay silent on beat 3, but feel it.',
    ],
    parts: { [S]: [0, 4, 12] },
  },
  {
    id: 'silent-spaces',
    title: 'Silent spaces',
    skill: 'rests',
    difficulty: 2,
    bpm: 84,
    range: [60, 120],
    summary: 'A phrase that leaves gaps inside the bar.',
    instructions: [
      'Play SNARE on 1, the “&” of 2, 3 and the “&” of 4.',
      'The kick keeps quarter notes.',
    ],
    parts: { [S]: [0, 6, 8, 14] },
    backing: 'rhythm-quarter-pulse',
  },
  {
    id: 'bar-on-bar-off',
    title: 'Play a bar, rest a bar',
    skill: 'rests',
    difficulty: 2,
    bars: 2,
    bpm: 90,
    range: [60, 140],
    summary: 'Quarter notes, then a whole bar of silence.',
    instructions: [
      'Bar 1: quarter notes on SNARE.',
      'Bar 2: rest.',
      'Come back in exactly on beat 1.',
    ],
    parts: { [S]: [0, 4, 8, 12] },
  },

  // ─── Syncopation ───
  {
    id: 'upbeats',
    title: 'Upbeats',
    skill: 'syncopation',
    style: 'dance',
    difficulty: 2,
    bpm: 112,
    range: [80, 130],
    summary: 'The disco open hat between every kick.',
    instructions: ['Play OPEN HAT on every “&” — between the kicks.'],
    parts: { [O]: [2, 6, 10, 14] },
    backing: 'rhythm-disco-drive',
  },
  {
    id: 'charleston',
    title: 'Charleston',
    skill: 'syncopation',
    style: 'jazz-blues',
    difficulty: 2,
    bpm: 100,
    range: [70, 140],
    summary: 'Beat one and the “&” of two.',
    instructions: [
      'Play KICK on beat 1 and on the “&” of 2.',
      'Rest for the second half of the bar.',
    ],
    parts: { [K]: [0, 6] },
    backing: 'rhythm-eighth-pulse',
  },
  {
    id: 'tresillo',
    title: 'Tresillo',
    skill: 'syncopation',
    style: 'latin',
    difficulty: 3,
    bpm: 96,
    range: [70, 130],
    summary: 'Three notes grouped 3 + 3 + 2 eighths.',
    instructions: ['Play KICK on 1, the “&” of 2 and beat 4.'],
    tip: 'This is the “3” side of the clave.',
    parts: { [K]: [0, 6, 12] },
    backing: 'rhythm-eighth-pulse',
  },
  {
    id: 'push-the-one',
    title: 'Push into the one',
    skill: 'syncopation',
    style: 'rock',
    difficulty: 3,
    bpm: 104,
    range: [80, 140],
    summary: 'A kick that anticipates the next bar.',
    instructions: [
      'Play KICK on 1 and 3.',
      'Add one more on the “&” of 4, pushing into the next bar.',
    ],
    parts: { [K]: [0, 8, 14] },
    backing: 'rhythm-basic-backbeat',
  },
  {
    id: 'sixteenth-syncopation',
    title: 'Sixteenth syncopation',
    skill: 'syncopation',
    style: 'funk',
    difficulty: 4,
    bpm: 88,
    range: [60, 110],
    summary: 'A snare phrase that avoids most downbeats.',
    instructions: [
      'Play SNARE on the “a” of 1, the “&” of 2, the “&” of 3 and the “a” of 4.',
    ],
    parts: { [S]: [3, 6, 10, 15] },
    backing: 'rhythm-syncopation-study',
  },
  {
    id: 'offbeat-sixteenths',
    title: '“e” and “a” only',
    skill: 'syncopation',
    difficulty: 5,
    bpm: 66,
    range: [50, 96],
    summary: 'Every sixteenth that is neither a beat nor an “&”.',
    instructions: [
      'Play HAT only on the “e” and the “a” of every beat.',
      'Never on a beat, never on an “&”.',
    ],
    parts: { [H]: every(2, 16, 1) },
    backing: 'rhythm-quarter-pulse',
  },

  // ─── Coordination ───
  {
    id: 'kick-and-snare',
    title: 'Kick and snare',
    skill: 'coordination',
    style: 'rock',
    difficulty: 1,
    bpm: 90,
    range: [60, 140],
    summary: 'The backbeat, split between two pads.',
    instructions: [
      'KICK on 1 and 3.',
      'SNARE on 2 and 4.',
      'The hats play eighth notes.',
    ],
    parts: { [K]: [0, 8], [S]: [4, 12] },
    backing: 'rhythm-eighth-pulse',
  },
  {
    id: 'hats-and-backbeat',
    title: 'Hats and backbeat',
    skill: 'coordination',
    difficulty: 2,
    bpm: 90,
    range: [60, 130],
    summary: 'A steady ostinato with a second part on top.',
    instructions: [
      'Keep eighth notes on HAT.',
      'Add SNARE on 2 and 4 with another finger.',
    ],
    parts: { [H]: eighths, [S]: [4, 12] },
    backing: 'rhythm-quarter-pulse',
  },
  {
    id: 'moving-kick',
    title: 'Ostinato, moving kick',
    skill: 'coordination',
    difficulty: 4,
    bars: 2,
    bpm: 80,
    range: [60, 120],
    summary: 'The hats stay put while the kick changes.',
    instructions: [
      'Keep eighth notes on HAT in both bars.',
      'KICK: 1 and 3 in bar 1; 1, the “a” of 1, 3 and the “a” of 3 in bar 2.',
    ],
    parts: { [H]: every(2, 32), [K]: [0, 8, 16, 19, 24, 27] },
  },
  {
    id: 'hand-to-hand',
    title: 'Hand to hand',
    skill: 'coordination',
    difficulty: 3,
    bpm: 84,
    range: [60, 120],
    summary: 'Snare and toms trading beats.',
    instructions: [
      'Play eighth notes: two on SNARE, two on TOM HIGH, repeating.',
    ],
    parts: { [S]: [0, 2, 8, 10], [TH]: [4, 6, 12, 14] },
    backing: 'rhythm-quarter-pulse',
  },

  // ─── Grooves ───
  {
    id: 'rock-beat',
    title: 'Basic rock beat',
    skill: 'grooves',
    style: 'rock',
    difficulty: 2,
    bpm: 100,
    range: [70, 140],
    summary: 'Hats, kick and snare: the beat behind most songs.',
    instructions: [
      'HAT on every eighth note.',
      'KICK on 1 and 3, SNARE on 2 and 4.',
    ],
    tip: 'Learn it slowly with Guide on, then turn the guide off.',
    parts: { [H]: eighths, [K]: [0, 8], [S]: [4, 12] },
  },
  {
    id: 'rock-sixteenths',
    title: 'Rock beat, sixteenth hats',
    skill: 'grooves',
    style: 'rock',
    difficulty: 3,
    bpm: 84,
    range: [60, 110],
    summary: 'A driving rock beat with a busier hat.',
    instructions: [
      'HAT on every sixteenth.',
      'KICK on 1, 3 and the “&” of 3; SNARE on 2 and 4.',
    ],
    parts: { [H]: sixteenths, [K]: [0, 8, 10], [S]: [4, 12] },
  },
  {
    id: 'head-nod',
    title: 'Head-nod',
    skill: 'grooves',
    style: 'hip-hop',
    difficulty: 2,
    bpm: 86,
    range: [70, 100],
    summary: 'A laid-back hip-hop kick against the backbeat.',
    instructions: [
      'KICK on 1, the “a” of 1, 3 and the “&” of 3.',
      'SNARE on 2 and 4.',
      'The hats are played for you.',
    ],
    parts: { [K]: [0, 3, 8, 10], [S]: [4, 12] },
    backing: 'rhythm-hip-hop-headnod',
  },
  {
    id: 'half-time',
    title: 'Half-time feel',
    skill: 'grooves',
    style: 'hip-hop',
    difficulty: 2,
    bpm: 78,
    range: [60, 100],
    summary: 'One snare in the middle of the bar makes it feel twice as wide.',
    instructions: [
      'SNARE on beat 3 only.',
      'KICK on 1, the “a” of 2 and the “a” of 3.',
    ],
    parts: { [K]: [0, 7, 11], [S]: [8] },
    backing: 'rhythm-half-time',
  },
  {
    id: 'disco',
    title: 'Disco',
    skill: 'grooves',
    style: 'dance',
    difficulty: 2,
    bpm: 120,
    range: [100, 130],
    summary: 'Four-on-the-floor kick with offbeat open hats.',
    instructions: ['KICK on every beat.', 'OPEN HAT on every “&”.'],
    parts: { [K]: [0, 4, 8, 12], [O]: [2, 6, 10, 14] },
    backing: 'rhythm-disco-drive',
  },
  {
    id: 'funk-pocket',
    title: 'Funk pocket',
    skill: 'grooves',
    style: 'funk',
    difficulty: 4,
    bpm: 96,
    range: [70, 110],
    summary: 'Syncopated kick and ghosted snare.',
    instructions: [
      'KICK on 1, the “a” of 1, the “a” of 2, the “&” of 3 and the “&” of 4.',
      'SNARE on 2, the “a” of 2, 4 and the “a” of 4.',
    ],
    parts: { [K]: [0, 3, 7, 10, 14], [S]: [4, 7, 12, 15] },
    backing: 'rhythm-funk-pocket',
  },
  {
    id: 'breakbeat',
    title: 'Broken break',
    skill: 'grooves',
    style: 'funk',
    difficulty: 4,
    bpm: 106,
    range: [80, 120],
    summary: 'Kick and snare trading syncopated positions.',
    instructions: [
      'KICK on 1, the “a” of 1, the “a” of 2, the “&” of 3 and the “&” of 4.',
      'SNARE on 2, the “e” of 3, 4 and the “a” of 4.',
    ],
    parts: { [K]: [0, 3, 7, 10, 14], [S]: [4, 9, 12, 15] },
    backing: 'rhythm-breakbeat',
  },

  // ─── Rudiments ───
  {
    id: 'single-strokes',
    title: 'Single strokes',
    skill: 'rudiments',
    difficulty: 2,
    bpm: 70,
    range: [50, 120],
    summary: 'R L R L on sixteenth notes.',
    instructions: [
      'Alternate SNARE (right) and TOM HIGH (left) on every sixteenth.',
    ],
    tip: 'Keep both fingers the same height and the same speed.',
    parts: { [S]: every(2, 16), [TH]: every(2, 16, 1) },
    backing: 'rhythm-quarter-pulse',
  },
  {
    id: 'double-strokes',
    title: 'Double strokes',
    skill: 'rudiments',
    difficulty: 3,
    bpm: 64,
    range: [50, 100],
    summary: 'R R L L on sixteenth notes.',
    instructions: [
      'Play two sixteenths on SNARE, then two on TOM HIGH, and repeat.',
    ],
    parts: {
      [S]: [0, 1, 4, 5, 8, 9, 12, 13],
      [TH]: [2, 3, 6, 7, 10, 11, 14, 15],
    },
    backing: 'rhythm-quarter-pulse',
  },
  {
    id: 'paradiddle',
    title: 'Paradiddle',
    skill: 'rudiments',
    difficulty: 3,
    bpm: 64,
    range: [50, 100],
    summary: 'R L R R · L R L L.',
    instructions: [
      'SNARE is your right hand, TOM HIGH your left.',
      'Play R L R R, L R L L on sixteenth notes.',
    ],
    parts: {
      [S]: [0, 2, 3, 5, 8, 10, 11, 13],
      [TH]: [1, 4, 6, 7, 9, 12, 14, 15],
    },
    backing: 'rhythm-quarter-pulse',
  },

  // ─── Fills ───
  {
    id: 'four-note-fill',
    title: 'Four-note fill',
    skill: 'fills',
    style: 'rock',
    difficulty: 3,
    bars: 2,
    bpm: 90,
    range: [70, 120],
    summary: 'A backbeat that ends in a short tom fill.',
    instructions: [
      'SNARE on 2 and 4.',
      'On beat 4 of bar 2 play SNARE, SNARE, TOM HIGH, TOM LOW on “4 e & a”.',
    ],
    parts: { [S]: [4, 12, 20, 28, 29], [TH]: [30], [TL]: [31] },
    backing: 'rhythm-eighth-pulse',
  },
  {
    id: 'fill-into-crash',
    title: 'Fill into the crash',
    skill: 'fills',
    style: 'rock',
    difficulty: 3,
    bars: 2,
    bpm: 96,
    range: [70, 130],
    summary: 'Eighth notes on the snare leading back to a crash.',
    instructions: [
      'CRASH on beat 1 of bar 1.',
      'SNARE on 2 and 4, then eighth notes through beats 3 and 4 of bar 2.',
      'Land on the crash again.',
    ],
    parts: { [CR]: [0], [S]: [4, 12, 20, 24, 26, 28, 30] },
    backing: 'rhythm-eighth-pulse',
  },

  // ─── Meters ───
  {
    id: 'waltz',
    title: 'Waltz',
    skill: 'meters',
    difficulty: 1,
    meter: '3/4',
    bpm: 92,
    range: [60, 160],
    summary: 'Oom-pah-pah: three beats to the bar.',
    instructions: ['KICK on 1.', 'SNARE on 2 and 3.'],
    parts: { [K]: [0], [S]: [4, 8] },
  },
  {
    id: 'six-eight-pulse',
    title: '6/8 pulse',
    skill: 'meters',
    difficulty: 2,
    meter: '6/8',
    bpm: 92,
    range: [60, 130],
    summary: 'Two big beats, each split into three.',
    instructions: ['Play KICK on 1 and 4 — the two big beats of 6/8.'],
    parts: { [K]: [0, 6] },
    backing: 'rhythm-six-eight',
  },
  {
    id: 'five-three-two',
    title: 'Five: 3 + 2',
    skill: 'meters',
    difficulty: 3,
    meter: '5/4',
    bpm: 96,
    range: [70, 140],
    summary: 'Five beats heard as a three and a two.',
    instructions: ['Play CLAVE at the start of each group: beat 1 and beat 4.'],
    tip: 'Count “1 2 3 1 2”.',
    parts: { [CLV]: [0, 12] },
    backing: 'rhythm-five-four',
  },
  {
    id: 'seven-two-two-three',
    title: 'Seven: 2 + 2 + 3',
    skill: 'meters',
    difficulty: 4,
    meter: '7/8',
    bpm: 106,
    range: [80, 160],
    summary: 'Seven eighth notes grouped 2 + 2 + 3.',
    instructions: [
      'Play CLAVE at the start of each group: eighths 1, 3 and 5.',
    ],
    tip: 'Count “1 2 1 2 1 2 3”.',
    parts: { [CLV]: [0, 4, 8] },
    backing: 'rhythm-seven-eight-223',
  },
  {
    id: 'seven-three-two-two',
    title: 'Seven: 3 + 2 + 2',
    skill: 'meters',
    difficulty: 4,
    meter: '7/8',
    bpm: 104,
    range: [80, 160],
    summary: 'The same seven, with the long group first.',
    instructions: ['Play CLAVE on eighths 1, 4 and 6.'],
    tip: 'Count “1 2 3 1 2 1 2”.',
    parts: { [CLV]: [0, 6, 10] },
    backing: 'rhythm-seven-eight-322',
  },
  {
    id: 'five-groove',
    title: 'Five-four groove',
    skill: 'meters',
    difficulty: 4,
    meter: '5/4',
    bpm: 92,
    range: [70, 130],
    summary: 'A full 3 + 2 groove across three pads.',
    instructions: [
      'HAT on every beat.',
      'KICK on 1 and 4.',
      'SNARE on the “&” of 2 and on 5.',
    ],
    parts: { [H]: [0, 4, 8, 12, 16], [K]: [0, 12], [S]: [6, 16] },
  },

  // ─── Triplets & shuffle ───
  {
    id: 'eighth-triplets',
    title: 'Eighth-note triplets',
    skill: 'triplets',
    style: 'jazz-blues',
    difficulty: 2,
    meter: '12/8',
    bpm: 70,
    range: [50, 110],
    summary: 'Three even notes per beat over a slow 12/8.',
    instructions: [
      'Play HAT on every eighth note: three per beat, “1 & a 2 & a …”.',
    ],
    parts: { [H]: every(2, 24) },
    backing: 'rhythm-twelve-eight',
  },
  {
    id: 'shuffle',
    title: 'Shuffle',
    skill: 'triplets',
    style: 'jazz-blues',
    difficulty: 3,
    meter: '12/8',
    bpm: 72,
    range: [55, 110],
    summary: 'Long-short: the first and last note of each triplet.',
    instructions: [
      'Play HAT on the first and third note of every triplet.',
      'Leave the middle one out.',
    ],
    parts: { [H]: [0, 4, 6, 10, 12, 16, 18, 22] },
    backing: 'rhythm-twelve-eight',
  },
  {
    id: 'slow-blues',
    title: 'Slow blues groove',
    skill: 'triplets',
    style: 'jazz-blues',
    difficulty: 4,
    meter: '12/8',
    bpm: 64,
    range: [50, 90],
    summary: 'Triplet hats with kick and snare in 12/8.',
    instructions: [
      'HAT on every eighth note.',
      'KICK on beats 1 and 3, SNARE on beats 2 and 4.',
    ],
    parts: { [H]: every(2, 24), [K]: [0, 12], [S]: [6, 18] },
  },

  // ─── Polyrhythm ───
  {
    id: 'three-against-two',
    title: '3 against 2: the three',
    skill: 'polyrhythm',
    style: 'world',
    difficulty: 3,
    meter: '3/4',
    bpm: 70,
    range: [50, 110],
    summary: 'Three evenly spaced notes while the clave plays two.',
    instructions: [
      'The clave plays two notes per bar.',
      'Play MALLET three times per bar, evenly: on every beat.',
    ],
    tip: 'Say “nice cup of tea”: both parts meet on “nice”.',
    parts: { [MAL]: [0, 4, 8] },
    backing: 'rhythm-three-two-waltz',
  },
  {
    id: 'three-two-both',
    title: '3 against 2: both parts',
    skill: 'polyrhythm',
    style: 'world',
    difficulty: 4,
    meter: '3/4',
    bpm: 66,
    range: [50, 100],
    summary: 'Both sides of the 3:2 at once.',
    instructions: [
      'MALLET three times per bar, on every beat.',
      'CLAVE twice per bar: on 1 and halfway through beat 2.',
    ],
    parts: { [MAL]: [0, 4, 8], [CLV]: [0, 6] },
  },
  {
    id: 'four-against-three',
    title: '4 against 3',
    skill: 'polyrhythm',
    style: 'world',
    difficulty: 5,
    meter: '3/4',
    bpm: 60,
    range: [45, 90],
    summary: 'Four notes evenly across a bar of three.',
    instructions: [
      'CLAVE on every beat (three per bar).',
      'MALLET four times per bar, evenly: every dotted eighth.',
    ],
    parts: { [MAL]: [0, 3, 6, 9], [CLV]: [0, 4, 8] },
  },
  {
    id: 'three-against-four',
    title: '3 against 4',
    skill: 'polyrhythm',
    style: 'world',
    difficulty: 5,
    meter: '12/8',
    bpm: 60,
    range: [45, 90],
    summary: 'Three notes evenly across four beats.',
    instructions: [
      'CLAVE on each of the four beats.',
      'MALLET three times per bar, evenly spaced.',
    ],
    parts: { [MAL]: [0, 8, 16], [CLV]: [0, 6, 12, 18] },
  },

  // ─── Tempo control ───
  {
    id: 'slow-and-steady',
    title: 'Slow and steady',
    skill: 'tempo',
    difficulty: 2,
    bpm: 50,
    range: [40, 64],
    summary: 'Quarter notes at a tempo that invites rushing.',
    instructions: [
      'Play SNARE on every beat.',
      'Fill the long gaps by counting sixteenths in your head.',
    ],
    parts: { [S]: [0, 4, 8, 12] },
  },
  {
    id: 'gap-two-two',
    title: 'Gap click: 2 on, 2 off',
    skill: 'tempo',
    difficulty: 3,
    bpm: 90,
    range: [60, 130],
    summary: 'The click disappears for two bars at a time.',
    instructions: [
      'Play SNARE on every beat.',
      'The click stops for two bars — keep going.',
      'Land together with it when it returns.',
    ],
    parts: { [S]: [0, 4, 8, 12] },
    gap: { play: 2, silent: 2 },
  },
  {
    id: 'gap-one-three',
    title: 'Gap click: 1 on, 3 off',
    skill: 'tempo',
    difficulty: 5,
    bpm: 90,
    range: [60, 130],
    summary: 'One bar of reference, three bars on your own.',
    instructions: [
      'Play SNARE on every beat.',
      'You hear one bar of click, then three bars of silence.',
    ],
    parts: { [S]: [0, 4, 8, 12] },
    gap: { play: 1, silent: 3 },
  },
  {
    id: 'groove-dropout',
    title: 'Groove dropout',
    skill: 'tempo',
    style: 'rock',
    difficulty: 4,
    bpm: 100,
    range: [70, 130],
    summary: 'The band drops out every fourth bar; you don’t.',
    instructions: [
      'KICK on 1 and 3, SNARE on 2 and 4.',
      'Every fourth bar the hats and the click go silent. Keep the groove going.',
    ],
    parts: { [K]: [0, 8], [S]: [4, 12] },
    backing: 'rhythm-eighth-pulse',
    gap: { play: 3, silent: 1 },
  },

  // ─── Latin & clave ───
  {
    id: 'son-clave-3-2',
    title: 'Son clave 3-2',
    skill: 'latin',
    style: 'latin',
    difficulty: 3,
    bars: 2,
    bpm: 96,
    range: [70, 130],
    summary: 'The two-bar timeline, three side first.',
    instructions: [
      'Bar 1: CLAVE on 1, the “&” of 2 and 4.',
      'Bar 2: CLAVE on 2 and 3.',
    ],
    parts: { [CLV]: [0, 6, 12, 20, 24] },
    backing: 'rhythm-clave-32',
  },
  {
    id: 'son-clave-2-3',
    title: 'Son clave 2-3',
    skill: 'latin',
    style: 'latin',
    difficulty: 3,
    bars: 2,
    bpm: 96,
    range: [70, 130],
    summary: 'The same timeline, two side first.',
    instructions: [
      'Bar 1: CLAVE on 2 and 3.',
      'Bar 2: CLAVE on 1, the “&” of 2 and 4.',
    ],
    parts: { [CLV]: [4, 8, 16, 22, 28] },
    backing: 'rhythm-clave-23',
  },
  {
    id: 'rumba-clave',
    title: 'Rumba clave 3-2',
    skill: 'latin',
    style: 'latin',
    difficulty: 4,
    bars: 2,
    bpm: 96,
    range: [70, 130],
    summary: 'Son clave with the third note pushed late.',
    instructions: [
      'Bar 1: CLAVE on 1, the “&” of 2 and the “&” of 4.',
      'Bar 2: CLAVE on 2 and 3.',
    ],
    parts: { [CLV]: [0, 6, 14, 20, 24] },
    backing: 'rhythm-clave-32',
  },
];

// Structured families keep the curriculum broad without turning each tempo,
// displacement, or meter variation into bespoke UI code. Every generated
// entry is still a complete, inspectable exercise definition.
const tempoFamily: Spec[] = [
  [56, 'Slow pulse control', 2, 'Let each slow beat arrive; do not reach for it.'],
  [68, 'Relaxed pulse control', 2, 'Keep the motion small and the spaces even.'],
  [84, 'Walking pulse control', 2, 'Settle into a natural, unforced quarter-note pulse.'],
  [104, 'Bright pulse control', 3, 'Stay loose as the beat begins to move faster.'],
  [124, 'Fast pulse control', 4, 'Use minimum motion and listen for rushing.'],
  [144, 'Peak pulse control', 5, 'Keep every hit centred without tensing up.'],
].map(([bpm, title, difficulty, tip]) => ({
  id: `tempo-quarter-${bpm}`,
  title: String(title),
  skill: 'tempo',
  difficulty: difficulty as Exercise['difficulty'],
  bpm: Number(bpm),
  range: [Math.max(45, Number(bpm) - 16), Math.min(170, Number(bpm) + 16)],
  summary: `Quarter-note time at ${bpm} BPM with a sparse reference.`,
  instructions: [
    'Play SNARE on all four beats.',
    'Listen to the space after each hit and correct gradually, not suddenly.',
  ],
  tip: String(tip),
  parts: { [S]: [0, 4, 8, 12] },
}));

const restFamily: Spec[] = [
  ['Leave beat 1', [4, 8, 12], 'Hear beat 1 internally before entering on beat 2.'],
  ['Leave beat 2', [0, 8, 12], 'Let the silent second beat feel as wide as the others.'],
  ['Leave beat 3', [0, 4, 12], 'Do not let the middle of the bar collapse.'],
  ['Leave beat 4', [0, 4, 8], 'Complete the silent final beat before returning to 1.'],
  ['Broken eighths', [0, 2, 6, 8, 12, 14], 'Keep counting every “&”, including the missing ones.'],
  ['Sixteenth windows', [0, 1, 4, 7, 8, 10, 13, 15], 'Treat each rest as part of the phrase, not a pause in counting.'],
].map(([title, steps, tip], index) => ({
  id: `rest-study-${index + 1}`,
  title: String(title),
  skill: 'rests',
  difficulty: (index < 4 ? 2 : index === 4 ? 3 : 4) as Exercise['difficulty'],
  bpm: index < 4 ? 76 : 70,
  range: [50, 115],
  summary: index < 4 ? 'A quarter-note bar with one deliberate silence.' : 'A broken subdivision that keeps its underlying grid.',
  instructions: [
    'Play the written notes on HAT and keep counting through every rest.',
    'Repeat the bar without filling the empty spaces.',
  ],
  tip: String(tip),
  parts: { [H]: steps as number[] },
  backing: 'rhythm-quarter-pulse',
}));

const accentFamily: Spec[] = [
  ['Accent every 3', [0, 3, 6, 9, 12, 15]],
  ['Accent every 5', [0, 5, 10, 15]],
  ['Accent the “e”', [1, 5, 9, 13]],
  ['Accent the “&”', [2, 6, 10, 14]],
  ['Accent the “a”', [3, 7, 11, 15]],
  ['Two strong, two light', [0, 1, 4, 5, 8, 9, 12, 13]],
].map(([title, rawAccents], index) => {
  const accents = rawAccents as number[];
  return {
    id: `accent-grid-${index + 1}`,
    title: String(title),
    skill: 'accents',
    difficulty: (index < 2 ? 4 : 3) as Exercise['difficulty'],
    bpm: index < 2 ? 68 : 78,
    range: [50, 110],
    summary: 'Continuous sixteenths with the strong notes moved to a second pad.',
    instructions: [
      'Play every sixteenth: accented notes on SNARE, all others on HAT.',
      'Keep the unaccented notes quiet and even.',
    ],
    tip: 'The pulse must stay still while the accent pattern moves across it.',
    parts: { [S]: accents, [H]: without(sixteenths, accents) },
  };
});

const coordinationFamily: Spec[] = [
  ['Kick on 1 and 3', [0, 8], [4, 12], 'A spacious two-pad foundation.'],
  ['Kick on all beats', [0, 4, 8, 12], [4, 12], 'Keep the snare independent of the repeated kick.'],
  ['Anticipated kick', [0, 6, 8, 14], [4, 12], 'Feel each offbeat kick pull toward the next beat.'],
  ['Half-time hands', [0, 3, 8, 11], [8], 'Hold the slow snare centre while the kick moves around it.'],
  ['Broken backbeat', [0, 7, 10, 14], [4, 12], 'Keep the backbeat firm against the displaced kick.'],
  ['Kick–snare conversation', [0, 6, 10], [4, 8, 14], 'Hear the two pads as one continuous phrase.'],
  ['Three against the backbeat', [0, 6, 12], [4, 12], 'Do not let the three-note kick cycle bend the bar.'],
  ['Dense independence', [0, 3, 7, 10, 14], [4, 8, 12, 15], 'Practise slowly until neither pad follows the other.'],
].map(([title, kick, snare, tip], index) => ({
  id: `coordination-study-${index + 1}`,
  title: String(title),
  skill: 'coordination',
  style: index < 2 ? 'rock' : index < 5 ? 'funk' : 'hip-hop',
  difficulty: Math.min(5, 2 + Math.floor(index / 2)) as Exercise['difficulty'],
  bpm: Math.max(64, 92 - index * 3),
  range: [50, 125],
  summary: 'Independent kick and snare parts over a steady hat backing.',
  instructions: [
    'Play KICK and SNARE as written while the backing hats hold the grid.',
    'Keep both sounds balanced; one part should not drag the other.',
  ],
  tip: String(tip),
  parts: { [K]: kick as number[], [S]: snare as number[] },
  backing: 'rhythm-eighth-pulse',
}));

const fillFamily: Spec[] = [
  ['Two-beat descending fill', [24, 25], [26, 27], [28, 29], [30, 31]],
  ['Offbeat tom fill', [25, 29], [27, 31], [24, 28], [26, 30]],
  ['Sparse answer fill', [24, 30], [26], [28], [31]],
  ['Sixteenth staircase', [24, 28], [25, 29], [26, 30], [27, 31]],
  ['Syncopated four-pad fill', [24, 27], [25, 30], [28], [29, 31]],
  ['Long fill into the one', [20, 24, 28], [21, 25, 29], [22, 26, 30], [23, 27, 31]],
].map(([title, low, high, mallet, crash], index) => ({
  id: `fill-family-${index + 1}`,
  title: String(title),
  skill: 'fills',
  style: index < 2 ? 'rock' : index < 4 ? 'funk' : 'hip-hop',
  difficulty: (index < 2 ? 3 : index < 5 ? 4 : 5) as Exercise['difficulty'],
  bars: 2,
  bpm: 76 - Math.min(index, 3) * 2,
  range: [50, 115],
  summary: 'Hold the first bar, then place a controlled fill in bar 2.',
  instructions: [
    'Listen through bar 1 without playing.',
    'Play the four-pad fill in bar 2 and land cleanly back on beat 1.',
  ],
  tip: 'The final note is not the goal—the next beat 1 is.',
  parts: {
    [TL]: low as number[],
    [TH]: high as number[],
    [MAL]: mallet as number[],
    [CR]: crash as number[],
  },
  backing: 'rhythm-basic-backbeat',
}));

const meterFamily: Spec[] = [
  ['Five as 3 + 2', '5/4', [0, 4, 8, 12, 16], [0, 12], 'Count “1 2 3, 1 2”.'],
  ['Five as 2 + 3', '5/4', [0, 4, 8, 12, 16], [0, 8], 'Count “1 2, 1 2 3”.'],
  ['Seven as 2 + 2 + 3', '7/8', [0, 2, 4, 6, 8, 10, 12], [0, 4, 8], 'Feel two short groups and one long group.'],
  ['Seven as 3 + 2 + 2', '7/8', [0, 2, 4, 6, 8, 10, 12], [0, 6, 10], 'Let the long group lead the bar.'],
  ['Six-eight two-pulse', '6/8', [0, 2, 4, 6, 8, 10], [0, 6], 'Feel two large beats, each divided into three.'],
  ['Twelve-eight four-pulse', '12/8', every(2, 24), [0, 6, 12, 18], 'Feel four large beats without flattening the triplets.'],
].map(([title, meter, notes, anchors, tip], index) => ({
  id: `meter-grouping-${index + 1}`,
  title: String(title),
  skill: 'meters',
  style: index < 4 ? 'world' : 'jazz-blues',
  difficulty: (index < 2 ? 4 : index < 4 ? 5 : 3) as Exercise['difficulty'],
  meter: String(meter),
  bpm: index < 4 ? 82 : 92,
  range: [55, 130],
  summary: `Make the grouping audible inside ${String(meter)}.`,
  instructions: [
    'Play the full pulse on HAT and the group beginnings on KICK.',
    'Repeat until the uneven bar feels circular rather than truncated.',
  ],
  tip: String(tip),
  parts: { [H]: notes as number[], [K]: anchors as number[] },
}));

const latinFamily: Spec[] = [
  ['Cascara cell', [0, 3, 6, 8, 10, 13], 'A compact shell pattern with forward motion.'],
  ['Tumbao anticipation', [0, 7, 10, 15], 'Place the final note as an anticipation, not a rushed beat.'],
  ['Bossa cross-stick', [0, 3, 6, 10, 12], 'Keep the line soft and flowing over the pulse.'],
  ['Bell cycle', [0, 3, 6, 8, 11, 14], 'Let the six-note bell phrase roll evenly through the bar.'],
].map(([title, steps, summary], index) => ({
  id: `latin-study-${index + 1}`,
  title: String(title),
  skill: 'latin',
  style: 'latin',
  difficulty: (index < 2 ? 4 : 3) as Exercise['difficulty'],
  bpm: 92,
  range: [65, 125],
  summary: String(summary),
  instructions: [
    `Play the timeline on ${index === 3 ? 'MALLET' : 'CLAVE'}.`,
    'Keep it locked to the backing without straightening its syncopation.',
  ],
  parts: { [index === 3 ? MAL : CLV]: steps as number[] },
  backing: 'rhythm-quarter-pulse',
}));

specs.push(
  ...tempoFamily,
  ...restFamily,
  ...accentFamily,
  ...coordinationFamily,
  ...fillFamily,
  ...meterFamily,
  ...latinFamily,
);

function meterNumbers(meter = '4/4') {
  const [beatsPerBar, beatUnit] = meter.split('/').map(Number);
  return { beatsPerBar, beatUnit };
}

export const EXERCISES: readonly Exercise[] = deepFreeze(
  specs.map((spec): Exercise => {
    const { beatsPerBar, beatUnit } = meterNumbers(spec.meter);
    const parts: ExercisePart[] = Object.entries(spec.parts).map(
      ([pad, steps]) => ({
        pad: Number(pad),
        steps: [...steps].sort((a, b) => a - b),
      }),
    );
    return {
      id: `exercise-${spec.id}`,
      title: spec.title,
      summary: spec.summary,
      instructions: spec.instructions,
      tip: spec.tip,
      skill: spec.skill,
      style: spec.style ?? 'fundamentals',
      difficulty: spec.difficulty,
      beatsPerBar,
      beatUnit,
      bars: spec.bars ?? 1,
      bpm: spec.bpm,
      bpmRange: spec.range,
      parts,
      backing: spec.backing ?? null,
      gap: spec.gap,
    };
  }),
);

export const exerciseById = (id: string) =>
  EXERCISES.find((exercise) => exercise.id === id);

export function stepsPerBarOf(exercise: Exercise): number {
  return stepsForMeter(exercise.beatsPerBar, exercise.beatUnit);
}

export const meterOf = (exercise: Exercise) =>
  `${exercise.beatsPerBar}/${exercise.beatUnit}`;

export const padsOf = (exercise: Exercise) =>
  exercise.parts.map((part) => part.pad);

/** Rhythm presets that can play along with an exercise: the same meter. */
export function compatibleBackings(exercise: Exercise) {
  return RHYTHM_PRESETS.filter(
    (rhythm) =>
      rhythm.pattern.beatsPerBar === exercise.beatsPerBar &&
      rhythm.pattern.beatUnit === exercise.beatUnit,
  );
}

/** “1”, “e”, “&”, “a” names for each sixteenth of a bar. */
export function countLabels(exercise: Exercise): string[] {
  const perBeat = Math.max(1, 16 / exercise.beatUnit);
  const names =
    perBeat === 4 ? ['', 'e', '&', 'a'] : perBeat === 2 ? ['', '&'] : [''];
  return Array.from({ length: stepsPerBarOf(exercise) }, (_, step) => {
    const beat = Math.floor(step / perBeat);
    const within = step % perBeat;
    if (perBeat > 4) return within ? '' : String(beat + 1);
    return within ? names[within] : String(beat + 1);
  });
}

/** Where one part plays, in words: “every beat”, “1 · 2& · 4”… */
export function describePart(exercise: Exercise, part: ExercisePart): string {
  const perBar = stepsPerBarOf(exercise);
  const total = perBar * exercise.bars;
  const perBeat = Math.max(1, 16 / exercise.beatUnit);
  const regular = (gap: number) =>
    part.steps.length === total / gap &&
    part.steps.every((step, index) => step === index * gap);
  if (regular(1)) return 'every sixteenth';
  if (regular(perBeat)) return 'every beat';
  if (regular(2)) return 'every eighth note';
  const labels = countLabels(exercise);
  const names = part.steps.map((step) => {
    const within = step % perBar;
    const beat = Math.floor(within / perBeat) + 1;
    const label = labels[within];
    const name = label === String(beat) ? label : `${beat}${label}`;
    return exercise.bars > 1
      ? `${name} (bar ${Math.floor(step / perBar) + 1})`
      : name;
  });
  return names.length > 8
    ? `${names.length} notes per phrase`
    : names.join(' · ');
}

export function validateExercise(exercise: Exercise): string[] {
  const errors: string[] = [];
  const total = stepsPerBarOf(exercise) * exercise.bars;
  if (!exercise.id || !exercise.title)
    errors.push('Exercise requires an id and title.');
  if (!exercise.instructions.length)
    errors.push('Exercise needs instructions.');
  if (exercise.difficulty < 1 || exercise.difficulty > 5)
    errors.push('Difficulty is 1–5.');
  if (
    exercise.bpm < exercise.bpmRange[0] ||
    exercise.bpm > exercise.bpmRange[1]
  )
    errors.push('Default tempo is outside its range.');
  if (!exercise.parts.length) errors.push('At least one part is required.');
  for (const part of exercise.parts) {
    if (part.pad < 0 || part.pad > 15)
      errors.push(`Pad ${part.pad} does not exist.`);
    if (!part.steps.length) errors.push(`Pad ${part.pad} has no notes.`);
    if (part.steps.some((step) => step < 0 || step >= total))
      errors.push(
        `Pad ${part.pad} has a note outside the ${exercise.bars}-bar phrase.`,
      );
  }
  if (
    new Set(exercise.parts.map((part) => part.pad)).size !==
    exercise.parts.length
  )
    errors.push('Each pad may appear in one part only.');
  if (exercise.backing) {
    const rhythm = RHYTHM_PRESETS.find((item) => item.id === exercise.backing);
    if (!rhythm) errors.push(`Backing ${exercise.backing} does not exist.`);
    else if (!compatibleBackings(exercise).includes(rhythm))
      errors.push(`Backing ${exercise.backing} is in a different meter.`);
  }
  if (exercise.gap && (exercise.gap.play < 1 || exercise.gap.silent < 1))
    errors.push('Gap bars must be at least one.');
  return errors;
}
