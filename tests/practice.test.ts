import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describePart,
  EXERCISES,
  exerciseById,
  PROGRESSION,
  SKILLS,
  stepsPerBarOf,
  validateExercise,
} from '../src/training/exercises.ts';
import {
  buildSessionPattern,
  gradeFor,
  insightsFor,
  isSilentBar,
  judge,
  practiceSummary,
  recommendNext,
  SessionScorer,
  sessionBars,
  type ScorerConfig,
} from '../src/training/session.ts';
import { rhythmById } from '../src/presets/rhythms.ts';
import type { ExerciseAttempt } from '../src/model/types.ts';

const padIds = Array.from({ length: 16 }, (_, i) => `pad-${i}`);
const quarter = exerciseById('exercise-quarter-notes')!;

void test('the exercise library is varied and every exercise is valid', () => {
  assert.equal(PROGRESSION.length, 15, 'the public curriculum remains available');
  assert.ok(EXERCISES.length >= 100, `${EXERCISES.length} exercises`);
  assert.equal(
    new Set(EXERCISES.map((exercise) => exercise.id)).size,
    EXERCISES.length,
  );
  assert.deepEqual(
    new Set(EXERCISES.map((exercise) => exercise.skill)),
    new Set(SKILLS.map((skill) => skill.id)),
    'every skill has exercises',
  );
  assert.deepEqual(
    [...new Set(EXERCISES.map((exercise) => exercise.difficulty))].sort(
      (a, b) => a - b,
    ),
    [1, 2, 3, 4, 5],
  );
  assert.ok(
    new Set(EXERCISES.map((e) => `${e.beatsPerBar}/${e.beatUnit}`)).size >= 6,
  );
  assert.ok(EXERCISES.filter((exercise) => exercise.backing).length >= 30);
  for (const exercise of EXERCISES)
    assert.deepEqual(validateExercise(exercise), [], exercise.id);
});

void test('parts are described in counting language', () => {
  assert.equal(describePart(quarter, quarter.parts[0]), 'every beat');
  const charleston = exerciseById('exercise-charleston')!;
  assert.equal(describePart(charleston, charleston.parts[0]), '1 · 2&');
  const eighth = exerciseById('exercise-eighth-triplets')!;
  assert.equal(stepsPerBarOf(eighth), 24);
  assert.equal(describePart(eighth, eighth.parts[0]), 'every beat');
});

void test('session patterns mute the player’s pads in the backing', () => {
  const exercise = exerciseById('exercise-kick-and-snare')!;
  const backing = rhythmById(exercise.backing!);
  const practice = buildSessionPattern(exercise, backing, padIds, 0);
  const active = (pattern: typeof practice, pad: number) =>
    pattern.tracks[pad].steps.flatMap((step, index) =>
      step.active ? [index] : [],
    );
  assert.deepEqual(active(practice, 0), [], 'kick is the player’s');
  assert.deepEqual(active(practice, 1), [], 'snare is the player’s');
  assert.deepEqual(
    active(practice, 2),
    [0, 2, 4, 6, 8, 10, 12, 14],
    'hats play along',
  );
  const listen = buildSessionPattern(exercise, backing, padIds, 1);
  assert.deepEqual(active(listen, 0), [0, 8]);
  assert.deepEqual(active(listen, 1), [4, 12]);
  const clave = exerciseById('exercise-son-clave-3-2')!;
  assert.equal(sessionBars(clave, rhythmById(clave.backing!)), 2);
  const fill = exerciseById('exercise-four-note-fill')!;
  assert.equal(
    sessionBars(fill, rhythmById(fill.backing!)),
    2,
    'a 1-bar backing repeats under a 2-bar phrase',
  );
  assert.equal(
    buildSessionPattern(fill, rhythmById(fill.backing!), padIds, 0).tracks[2]
      .steps.length,
    32,
  );
});

void test('gap bars fall silent on schedule', () => {
  const gap = { play: 2, silent: 2 };
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((bar) => isSilentBar(gap, bar)),
    [false, false, true, true, false, false],
  );
  assert.equal(isSilentBar(gap, -1), false, 'the count-in is never silent');
  assert.equal(isSilentBar(undefined, 3), false);
});

const config = (overrides: Partial<ScorerConfig> = {}): ScorerConfig => ({
  parts: quarter.parts,
  stepsPerBar: 16,
  bars: 1,
  start: 10,
  stepDuration: 0.125,
  end: 10 + 4 * 2,
  toleranceMs: 45,
  ...overrides,
});

void test('judgements grade timing against the tolerance', () => {
  assert.equal(judge(5, 45), 'perfect');
  assert.equal(judge(-25, 45), 'good');
  assert.equal(judge(40, 45), 'ok');
  assert.equal(judge(-60, 45), 'early');
  assert.equal(judge(70, 45), 'late');
});

void test('the scorer judges live hits, misses, extras and wrong pads', () => {
  const scorer = new SessionScorer(config());
  // Beat 1 perfect, beat 2 20 ms early, beat 3 missed, beat 4 too late.
  assert.equal(scorer.hit(1, 10.002)?.kind, 'perfect');
  assert.equal(scorer.hit(1, 10.48)?.kind, 'good');
  assert.equal(scorer.hit(1, 11.56)?.kind, 'late');
  assert.equal(scorer.hit(1, 10.75)?.kind, 'extra', 'between the notes');
  assert.equal(scorer.hit(0, 11.0)?.kind, 'wrong', 'right time, wrong pad');
  assert.equal(scorer.hit(1, 9.0), null, 'count-in hits are ignored');
  const missed = scorer.advance(11.2);
  assert.equal(missed.length, 1);
  assert.equal(missed[0].step, 8);
  const stats = scorer.summary(11.9);
  assert.equal(stats.expected, 4);
  assert.equal(stats.perfect, 1);
  assert.equal(stats.missed, 1);
  assert.equal(stats.late, 1);
  assert.equal(stats.extra, 1);
  assert.equal(stats.wrongPad, 1);
  assert.equal(stats.bestStreak, 2);
  assert.equal(stats.accuracy, 0.5);
  assert.ok(stats.score > 0 && stats.score < 60, `score ${stats.score}`);
});

void test('a clean session scores high and reports its tendency', () => {
  const scorer = new SessionScorer(config());
  const expected = Array.from({ length: 16 }, (_, beat) => 10 + beat * 0.5);
  expected.forEach((time) => scorer.hit(1, time - 0.012));
  scorer.advance(20);
  const stats = scorer.summary();
  assert.equal(stats.expected, 16);
  assert.equal(stats.accuracy, 1);
  assert.ok(stats.score >= 95);
  assert.equal(stats.biasMs, -12);
  assert.equal(stats.spreadMs, 0);
  assert.equal(stats.bars.length, 4);
  assert.deepEqual(
    stats.bars.map((bar) => bar.offsetMs),
    [-12, -12, -12, -12],
  );
  assert.equal(stats.histogram.find((bin) => bin.from === -20)?.count, 16);
  assert.equal(stats.pads[0].hit, 16);
  assert.equal(gradeFor(stats.score), 'S');
  const insight = insightsFor(stats, quarter, {
    bpm: 120,
    duration: 8,
    backing: null,
    click: true,
    countInBars: 1,
    strictness: 'normal',
    guide: 'off',
  });
  assert.match(insight[0], /12 ms ahead of the beat/);
});

void test('untimed sessions generate notes as they go and never judge the future', () => {
  const scorer = new SessionScorer(config({ end: Infinity }));
  scorer.hit(1, 10);
  assert.equal(
    scorer.summary(10.2).expected,
    1,
    'only notes whose time has passed',
  );
  assert.equal(scorer.hit(1, 70.001)?.kind, 'perfect', 'a minute later');
});

void test('sparse parts judge wide misses; dense parts keep each note its own', () => {
  const sparse = new SessionScorer(config());
  assert.equal(
    sparse.hit(1, 10.07)?.kind,
    'late',
    '70 ms late still belongs to its note',
  );
  const sixteenths = exerciseById('exercise-sixteenth-notes')!;
  const dense = new SessionScorer(
    config({ parts: sixteenths.parts, stepDuration: 0.1 }),
  );
  assert.equal(
    dense.hit(2, 10.03)?.kind,
    'good',
    '30 ms late on the first note',
  );
  assert.equal(
    dense.hit(2, 10.1)?.kind,
    'perfect',
    'the next note is still free',
  );
  assert.equal(dense.hit(2, 10.4)?.kind, 'perfect');
  assert.equal(
    dense.hit(2, 10.448)?.kind,
    'extra',
    'past its own note, too early for the next',
  );
  assert.equal(dense.hit(2, 10.46)?.kind, 'ok', '40 ms early on the next note');
});

void test('recommendations and totals follow the history', () => {
  const day = new Date(2026, 8, 24, 18).getTime();
  const attempt = (
    exerciseId: string,
    score: number,
    completedAt: number,
  ): ExerciseAttempt => ({
    id: `${exerciseId}-${completedAt}`,
    exerciseId,
    startedAt: completedAt - 60000,
    completedAt,
    score,
    averageErrorMs: 10,
    consistencyMs: 5,
    biasMs: 0,
    missed: 0,
    extra: 0,
    wrongPad: 0,
    feedback: '',
    durationSec: 60,
  });
  const attempts = [
    attempt('exercise-quarter-notes', 92, day),
    attempt('exercise-half-notes', 60, day - 86400000),
    attempt('exercise-half-notes', 70, day - 2 * 86400000),
  ];
  assert.deepEqual(practiceSummary(attempts, day + 3600000), {
    sessions: 3,
    minutes: 3,
    mastered: 1,
    streak: 3,
  });
  const next = recommendNext(quarter, attempts);
  assert.equal(next?.skill, 'pulse');
  assert.notEqual(next?.id, quarter.id);
});
