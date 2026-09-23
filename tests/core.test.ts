import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneKit, clonePreset, FACTORY_KITS, FACTORY_PRESETS } from '../src/presets/factorySounds.ts';
import { RHYTHM_PRESETS } from '../src/presets/rhythms.ts';
import { EXERCISES, validateExercise } from '../src/training/exercises.ts';
import { scorePerformance } from '../src/training/scoring.ts';
import { createPattern, nearestStep, quantizeHit, resizePattern, secondsPerStep, stepTime, swingOffset } from '../src/transport/timing.ts';
import { parseUserData, serializeUserData, type UserDataBundle } from '../src/persistence/database.ts';

void test('timing uses Web Audio-compatible absolute step positions', () => {
  assert.equal(secondsPerStep(120, 16), 0.125);
  assert.equal(swingOffset(0, 0.125, 0.2), 0);
  assert.equal(swingOffset(1, 0.125, 0.2), 0.025);
  assert.equal(stepTime(10, 1, 120, 16, 0.2), 10.15);
});

void test('quantization wraps into the pattern and retains microtiming', () => {
  const pattern = createPattern('test', 'Test', ['pad-0'], 1, 16);
  const near = nearestStep(1.128, 1, 120, 16, 16);
  assert.equal(near.index, 1);
  assert.ok(Math.abs(near.offsetMs - 3) < 0.001);
  const result = quantizeHit(1.128, 1, pattern, 120);
  assert.equal(result.step, 1);
  assert.ok(Math.abs(result.microtiming - 3) < 0.001);
});

void test('patterns resize without sharing mutable step data', () => {
  const source = createPattern('test', 'Test', ['pad-0'], 1, 16);
  source.tracks[0].steps[0].active = true;
  const resized = resizePattern(source, 2);
  assert.equal(resized.tracks[0].steps.length, 32);
  resized.tracks[0].steps[0].active = false;
  assert.equal(source.tracks[0].steps[0].active, true);
});

void test('performance scoring reports accurate timing and bias', () => {
  const result = scorePerformance({
    exerciseId: 'pulse', toleranceMs: 80,
    expected: [{ time: 1, padIndex: 1 }, { time: 2, padIndex: 1 }, { time: 3, padIndex: 1 }],
    actual: [{ time: .99, padIndex: 1, velocity: .9 }, { time: 1.99, padIndex: 1, velocity: .9 }, { time: 2.99, padIndex: 1, velocity: .9 }],
  });
  assert.ok(result.score >= 90);
  assert.equal(result.missed, 0);
  assert.equal(result.extra, 0);
  assert.equal(result.biasMs, -10);
});

void test('scoring distinguishes misses, extra hits and wrong pads', () => {
  const result = scorePerformance({
    exerciseId: 'coordination', toleranceMs: 60,
    expected: [{ time: 1, padIndex: 0 }, { time: 2, padIndex: 1 }],
    actual: [{ time: 1.01, padIndex: 2, velocity: .8 }, { time: 2.5, padIndex: 1, velocity: .8 }],
  });
  assert.equal(result.wrongPad, 1);
  assert.equal(result.missed, 1);
  assert.equal(result.extra, 1);
});

void test('factory presets and kits stay immutable while clones are editable', () => {
  assert.ok(Object.isFrozen(FACTORY_PRESETS));
  assert.ok(Object.isFrozen(FACTORY_KITS[0].pads));
  const sound = clonePreset(FACTORY_PRESETS[0]);
  const kit = cloneKit(FACTORY_KITS[0]);
  assert.equal(sound.factory, false);
  assert.equal(kit.factory, false);
  sound.patch.baseFrequency = 100;
  kit.pads[0].label = 'EDITED';
  assert.notEqual(FACTORY_PRESETS[0].patch.baseFrequency, 100);
  assert.notEqual(FACTORY_KITS[0].pads[0].label, 'EDITED');
});

void test('exercise library is substantial, data-driven and valid', () => {
  assert.ok(EXERCISES.length >= 100);
  assert.ok(new Set(EXERCISES.map((exercise) => exercise.category)).size >= 10);
  for (const exercise of EXERCISES) assert.deepEqual(validateExercise(exercise), []);
});

void test('rhythm library covers fundamental, groove, meter, Latin and polyrhythm concepts', () => {
  assert.ok(RHYTHM_PRESETS.length >= 20);
  const tags = new Set(RHYTHM_PRESETS.flatMap((rhythm) => rhythm.tags));
  for (const tag of ['fundamentals', 'groove', '7/8', 'latin', 'polyrhythm']) assert.ok(tags.has(tag));
  const clave = RHYTHM_PRESETS.find((rhythm) => rhythm.id === 'rhythm-clave-32');
  assert.equal(clave?.pattern.bars, 2);
  assert.equal(clave?.pattern.tracks[13].steps.filter((step) => step.active).length, 5);
});

void test('user data export serialization round-trips', () => {
  const bundle: UserDataBundle = { version: 1, exportedAt: '2026-09-24T00:00:00.000Z', customPresets: [], customKits: [], customPatterns: [], attempts: [], session: { bpm: 112 } };
  assert.deepEqual(parseUserData(serializeUserData(bundle)), bundle);
  assert.throws(() => parseUserData('{"version":2}'));
});
