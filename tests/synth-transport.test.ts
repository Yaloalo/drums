import test from 'node:test';
import assert from 'node:assert/strict';
import { MetronomeClock } from '../src/transport/MetronomeClock.ts';
import { FM_ALGORITHMS, selectEngine } from '../src/audio/synthTopology.ts';
import { FACTORY_PRESETS } from '../src/presets/factorySounds.ts';

void test('metronome schedules straight audio-clock beats with bar accents', () => {
  const clock = new MetronomeClock();
  clock.reset(10);
  const clicks = clock.window(10, 12.1, 120, 4, 4);
  assert.deepEqual(
    clicks.map((click) => click.time),
    [10, 10.5, 11, 11.5, 12],
  );
  assert.deepEqual(
    clicks.map((click) => click.accent),
    [true, false, false, false, true],
  );
  assert.deepEqual(
    clock.window(12, 12.1, 120, 4, 4),
    [],
    'Overlapping lookahead windows never duplicate clicks',
  );
});

void test('metronome handles compound meters, tempo changes, and phase alignment', () => {
  const clock = new MetronomeClock();
  clock.reset(0);
  assert.deepEqual(
    clock.window(0, 1.51, 120, 6, 8).map((c) => c.time),
    [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5],
  );
  clock.reset(5, 2);
  assert.deepEqual(clock.window(5, 6.1, 60, 3, 4), [
    { time: 5, beat: 2, accent: false },
    { time: 6, beat: 0, accent: true },
  ]);
});

void test('metronome drops stale clicks after a tab suspension', () => {
  const clock = new MetronomeClock();
  clock.reset(0);
  const clicks = clock.window(100, 100.12, 120, 4, 4);
  assert.equal(clicks.length, 1);
  assert.equal(clicks[0].time, 100);
});

void test('switching engines preserves edits and never layers or mutates factory patches', () => {
  const initial = FACTORY_PRESETS.find((p) => p.engineType === 'subtractive')!;
  const fm = FACTORY_PRESETS.find((p) => p.engineType === 'fm')!;
  const edited = structuredClone(initial);
  edited.patch.baseFrequency = 137;
  const switched = selectEngine(edited, 'fm', fm);
  switched.patch.baseFrequency = 222;
  const back = selectEngine(switched, 'subtractive', initial);
  assert.equal(back.patch.baseFrequency, 137);
  assert.equal(back.patch.engine, 'subtractive');
  assert.equal(selectEngine(back, 'fm', fm).patch.baseFrequency, 222);
  assert.notEqual(initial.patch.baseFrequency, 137);
  assert.notEqual(fm.patch.baseFrequency, 222);
  assert.deepEqual(back.effects, initial.effects);
});

void test('every FM graph has valid operators and carriers, with no audio-rate graph cycles', () => {
  for (const topology of Object.values(FM_ALGORITHMS)) {
    assert.ok(topology.carriers.length > 0);
    for (const [from, to] of topology.links) {
      assert.ok(from >= 0 && from < 4 && to >= 0 && to < 4);
      assert.ok(
        from > to,
        'Algorithms are directed toward lower-index carriers',
      );
      assert.ok(!topology.carriers.includes(from));
    }
  }
});
