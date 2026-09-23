import type { Pattern, RhythmPreset } from '../model/types.ts';
import { deepFreeze } from '../model/types.ts';
import { createPattern } from '../transport/timing.ts';

const padIds = Array.from({ length: 16 }, (_, index) => `pad-${index}`);

interface RhythmSpec {
  id: string;
  title: string;
  meter?: string;
  bpm: number;
  difficulty: number;
  kit?: string;
  tags: string[];
  explanation: string;
  bars?: number;
  beats?: number;
  rows: Record<number, number[]>;
  accents?: Record<number, number[]>;
}

const specs: RhythmSpec[] = [
  { id: 'quarter-pulse', title: 'Quarter-note pulse', bpm: 80, difficulty: 1, tags: ['fundamentals', 'pulse'], explanation: 'Four even beats define the bar.', rows: { 0: [0, 4, 8, 12] }, accents: { 0: [0] } },
  { id: 'eighth-pulse', title: 'Eighth-note grid', bpm: 84, difficulty: 1, tags: ['fundamentals', 'subdivision'], explanation: 'Two equal notes inside every beat.', rows: { 2: [0, 2, 4, 6, 8, 10, 12, 14], 0: [0, 8] } },
  { id: 'sixteenth-pulse', title: 'Sixteenth-note grid', bpm: 72, difficulty: 2, tags: ['fundamentals', 'subdivision'], explanation: 'Four equal notes inside every beat.', rows: { 2: Array.from({ length: 16 }, (_, i) => i), 0: [0, 8], 1: [4, 12] } },
  { id: 'offbeat-hats', title: 'Offbeat hats', bpm: 118, difficulty: 2, tags: ['fundamentals', 'offbeat'], explanation: 'The hats land between the quarter-note pulse.', rows: { 3: [2, 6, 10, 14], 0: [0, 8], 1: [4, 12] } },
  { id: 'accent-cycle', title: 'Moving accents', bpm: 92, difficulty: 3, tags: ['fundamentals', 'accents'], explanation: 'A steady grid with a rotating four-note accent.', rows: { 2: Array.from({ length: 16 }, (_, i) => i) }, accents: { 2: [0, 5, 10, 15] } },
  { id: 'basic-backbeat', title: 'Basic backbeat', bpm: 96, difficulty: 1, tags: ['groove', 'backbeat'], explanation: 'Kick on 1 and 3, snare on 2 and 4.', rows: { 0: [0, 8], 1: [4, 12], 2: [0, 2, 4, 6, 8, 10, 12, 14] } },
  { id: 'funk-pocket', title: 'Funk pocket', bpm: 102, difficulty: 3, tags: ['groove', 'funk', 'syncopation'], explanation: 'Syncopated kick and ghosted snare create forward motion.', rows: { 0: [0, 3, 7, 10, 14], 1: [4, 7, 12, 15], 2: [0, 2, 4, 6, 8, 10, 12, 14] }, accents: { 1: [4, 12] } },
  { id: 'disco-drive', title: 'Disco drive', bpm: 122, difficulty: 2, tags: ['groove', 'disco'], explanation: 'Four kicks and bright offbeat open hats.', rows: { 0: [0, 4, 8, 12], 1: [4, 12], 3: [2, 6, 10, 14], 2: [0, 4, 8, 12] } },
  { id: 'house-floor', title: 'House floor', bpm: 124, difficulty: 2, tags: ['groove', 'house'], explanation: 'Four-on-the-floor with claps and offbeat hats.', rows: { 0: [0, 4, 8, 12], 8: [4, 12], 3: [2, 6, 10, 14], 2: [0, 4, 8, 12] } },
  { id: 'hip-hop-headnod', title: 'Head-nod', bpm: 86, difficulty: 2, tags: ['groove', 'hip-hop'], explanation: 'A laid-back kick pattern around a solid backbeat.', rows: { 0: [0, 3, 8, 10], 1: [4, 12], 2: [0, 2, 4, 6, 8, 10, 12, 14] } },
  { id: 'half-time', title: 'Half-time weight', bpm: 78, difficulty: 2, tags: ['groove', 'half-time'], explanation: 'One central snare makes the bar feel broad.', rows: { 0: [0, 7, 11], 1: [8], 2: [0, 2, 4, 6, 8, 10, 12, 14] } },
  { id: 'double-time', title: 'Double-time lift', bpm: 82, difficulty: 3, tags: ['groove', 'double-time'], explanation: 'Busy hats pull against a simple backbeat.', rows: { 0: [0, 7, 10], 1: [4, 12], 2: Array.from({ length: 16 }, (_, i) => i) } },
  { id: 'shuffle', title: 'Pocket shuffle', bpm: 104, difficulty: 3, tags: ['groove', 'shuffle', 'triplet'], explanation: 'A swung two-part subdivision.', rows: { 0: [0, 7, 10], 1: [4, 12], 2: [0, 3, 4, 7, 8, 11, 12, 15] } },
  { id: 'breakbeat', title: 'Broken break', bpm: 112, difficulty: 4, tags: ['groove', 'breakbeat'], explanation: 'Kicks and snares trade syncopated positions.', rows: { 0: [0, 3, 7, 10, 14], 1: [4, 9, 12, 15], 2: [0, 2, 4, 6, 8, 10, 12, 14] } },
  { id: 'three-four', title: 'Waltz frame', meter: '3/4', bpm: 92, difficulty: 2, tags: ['meter', '3/4'], explanation: 'Three quarter-note groups per bar.', rows: { 0: [0], 1: [4, 8], 2: [0, 2, 4, 6, 8, 10] } },
  { id: 'six-eight', title: 'Rolling 6/8', meter: '6/8', bpm: 92, difficulty: 3, tags: ['meter', '6/8'], explanation: 'Two large beats, each split into three.', rows: { 0: [0, 6], 1: [3, 9], 2: [0, 2, 4, 6, 8, 10] } },
  { id: 'twelve-eight', title: 'Slow 12/8', meter: '12/8', bpm: 76, difficulty: 3, tags: ['meter', '12/8'], explanation: 'Four beats with triplet subdivisions.', rows: { 0: [0, 6], 1: [3, 9], 2: [0, 2, 4, 6, 8, 10] } },
  { id: 'five-four', title: 'Five-count orbit', meter: '5/4', bpm: 96, difficulty: 4, tags: ['meter', '5/4', '3+2'], explanation: 'Hear the bar as 3 + 2.', rows: { 0: [0, 6], 1: [3, 8], 2: [0, 2, 4, 6, 8] } },
  { id: 'seven-eight-223', title: 'Seven — 2+2+3', meter: '7/8', bpm: 106, difficulty: 4, tags: ['meter', '7/8', '2+2+3'], explanation: 'Seven eighth notes grouped 2 + 2 + 3.', rows: { 0: [0, 4, 8], 1: [2, 6, 11], 2: [0, 2, 4, 6, 8, 10, 12] } },
  { id: 'seven-eight-322', title: 'Seven — 3+2+2', meter: '7/8', bpm: 104, difficulty: 4, tags: ['meter', '7/8', '3+2+2'], explanation: 'Seven eighth notes grouped 3 + 2 + 2.', rows: { 0: [0, 6, 10], 1: [4, 8, 12], 2: [0, 2, 4, 6, 8, 10, 12] } },
  { id: 'clave-32', title: '3–2 son clave', bpm: 96, difficulty: 4, kit: 'kit-latin-percussion', tags: ['latin', 'afro-cuban', 'clave'], explanation: 'The two-bar 3–2 son clave timeline.', bars: 2, rows: { 13: [0, 3, 6, 12, 18], 0: [0, 8, 16, 24], 10: [2, 6, 10, 14, 18, 22, 26, 30] } },
  { id: 'clave-23', title: '2–3 son clave', bpm: 96, difficulty: 4, kit: 'kit-latin-percussion', tags: ['latin', 'afro-cuban', 'clave'], explanation: 'The two-bar 2–3 son clave timeline.', bars: 2, rows: { 13: [0, 6, 12, 19, 22], 0: [0, 8, 16, 24], 10: [2, 6, 10, 14, 18, 22, 26, 30] } },
  { id: 'bossa-frame', title: 'Bossa frame', bpm: 116, difficulty: 4, kit: 'kit-latin-percussion', tags: ['latin', 'bossa'], explanation: 'A light syncopated clave-like frame.', rows: { 13: [0, 3, 7, 10, 13], 0: [0, 6, 8, 14], 10: [0, 2, 4, 6, 8, 10, 12, 14] } },
  { id: 'three-two-polyrhythm', title: '3:2 lattice', bpm: 72, difficulty: 5, tags: ['polyrhythm', '3:2'], explanation: 'Three evenly spaced notes against two.', rows: { 9: [0, 5, 10], 13: [0, 8] } },
  { id: 'gap-click', title: 'Gap click', bpm: 84, difficulty: 4, tags: ['pulse', 'gap-click'], explanation: 'Reference clicks leave space for internal time.', rows: { 9: [0, 8] } },
  { id: 'syncopation-study', title: 'Sixteenth syncopation', bpm: 88, difficulty: 4, tags: ['syncopation', 'rests'], explanation: 'A phrase that avoids several downbeats.', rows: { 1: [3, 6, 10, 15], 0: [0, 7, 11], 2: [0, 2, 4, 6, 8, 10, 12, 14] } },
];

function meterNumbers(meter = '4/4') {
  const [beatsPerBar, beatUnit] = meter.split('/').map(Number);
  return { beatsPerBar, beatUnit };
}

export function patternFromRows(spec: RhythmSpec): Pattern {
  const bars = spec.bars ?? 1;
  const pattern = createPattern(`pattern-${spec.id}`, spec.title, padIds, bars);
  const { beatsPerBar, beatUnit } = meterNumbers(spec.meter);
  pattern.beatsPerBar = beatsPerBar;
  pattern.beatUnit = beatUnit;
  Object.entries(spec.rows).forEach(([row, hits]) => hits.forEach((step) => {
    if (pattern.tracks[Number(row)]?.steps[step]) pattern.tracks[Number(row)].steps[step].active = true;
  }));
  Object.entries(spec.accents ?? {}).forEach(([row, hits]) => hits.forEach((step) => {
    if (pattern.tracks[Number(row)]?.steps[step]) { pattern.tracks[Number(row)].steps[step].accent = true; pattern.tracks[Number(row)].steps[step].velocity = 1; }
  }));
  pattern.factory = true;
  return pattern;
}

export const RHYTHM_PRESETS: readonly RhythmPreset[] = deepFreeze(specs.map((spec) => ({
  id: `rhythm-${spec.id}`,
  title: spec.title,
  meter: spec.meter ?? '4/4',
  bpm: spec.bpm,
  difficulty: spec.difficulty,
  kitRecommendation: spec.kit ?? (spec.tags.includes('house') ? 'kit-house' : 'kit-neutral-practice-kit'),
  tags: spec.tags,
  concepts: spec.tags,
  explanation: spec.explanation,
  pattern: patternFromRows(spec),
})));

export const rhythmById = (id: string) => RHYTHM_PRESETS.find((rhythm) => rhythm.id === id) ?? RHYTHM_PRESETS[5];
