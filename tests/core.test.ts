import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cloneKit,
  clonePreset,
  FACTORY_KITS,
  FACTORY_PRESETS,
} from '../src/presets/factorySounds.ts';
import { RHYTHM_PRESETS } from '../src/presets/rhythms.ts';
import {
  createPattern,
  nearestStep,
  quantizeHit,
  resizePattern,
  secondsPerStep,
  stepTime,
  swingOffset,
} from '../src/transport/timing.ts';
import {
  parseUserData,
  serializeUserData,
  type UserDataBundle,
} from '../src/persistence/database.ts';
import {
  findOnset,
  scopeTrace,
  scopeWindow,
  waveformPath,
} from '../src/audio/waveform.ts';

void test('timing uses Web Audio-compatible absolute step positions', () => {
  assert.equal(secondsPerStep(120, 16), 0.125);
  assert.equal(swingOffset(0, 0.125, 0.2), 0);
  assert.equal(swingOffset(1, 0.125, 0.2), 0.025);
  assert.equal(stepTime(10, 1, 120, 16, 0.2), 10.15);
});

void test('quantization wraps into the pattern and retains microtiming', () => {
  const pattern = createPattern('test', 'Test', ['pad-0'], 1);
  const near = nearestStep(1.128, 1, 120, 16, 16);
  assert.equal(near.index, 1);
  assert.ok(Math.abs(near.offsetMs - 3) < 0.001);
  const result = quantizeHit(1.128, 1, pattern, 120);
  assert.equal(result.step, 1);
  assert.ok(Math.abs(result.microtiming - 3) < 0.001);
});

void test('patterns resize without sharing mutable step data', () => {
  const source = createPattern('test', 'Test', ['pad-0'], 1);
  source.tracks[0].steps[0].active = true;
  const resized = resizePattern(source, 2);
  assert.equal(resized.tracks[0].steps.length, 32);
  resized.tracks[0].steps[0].active = false;
  assert.equal(source.tracks[0].steps[0].active, true);
});

void test('factory presets and kits stay immutable while clones are editable', () => {
  assert.ok(Object.isFrozen(FACTORY_PRESETS));
  assert.ok(Object.isFrozen(FACTORY_KITS[0].pads));
  const sound = clonePreset(FACTORY_PRESETS[0]);
  const kit = cloneKit(FACTORY_KITS[0]);
  assert.equal(sound.factory, false);
  assert.equal(kit.factory, false);
  sound.voice.engines[0].patch.baseFrequency = 100;
  kit.pads[0].label = 'EDITED';
  assert.notEqual(FACTORY_PRESETS[0].voice.engines[0].patch.baseFrequency, 100);
  assert.notEqual(FACTORY_KITS[0].pads[0].label, 'EDITED');
});

void test('rhythm library covers fundamental, groove, meter, Latin and polyrhythm concepts', () => {
  assert.ok(RHYTHM_PRESETS.length >= 20);
  const tags = new Set(RHYTHM_PRESETS.flatMap((rhythm) => rhythm.tags));
  for (const tag of ['fundamentals', 'groove', '7/8', 'latin', 'polyrhythm'])
    assert.ok(tags.has(tag));
  const clave = RHYTHM_PRESETS.find(
    (rhythm) => rhythm.id === 'rhythm-clave-32',
  );
  assert.equal(clave?.pattern.bars, 2);
  assert.equal(
    clave?.pattern.tracks[13].steps.filter((step) => step.active).length,
    5,
  );
});

void test('user data export serialization round-trips', () => {
  const bundle: UserDataBundle = {
    version: 1,
    exportedAt: '2026-09-24T00:00:00.000Z',
    customPresets: [],
    customKits: [],
    customPatterns: [],
    attempts: [],
    session: { bpm: 112 },
  };
  assert.deepEqual(parseUserData(serializeUserData(bundle)), bundle);
  assert.throws(() => parseUserData('{"version":2}'));
});

void test('waveform buckets retain transients and stereo phase differences', () => {
  const transient = new Float32Array(1600);
  transient[4] = 1;
  transient[5] = -1;
  const signal = waveformPath([transient]);
  assert.ok(signal.startsWith('M0.00,3.00'));
  assert.ok(signal.includes('0.00,61.00'));
  assert.equal(signal.includes('NaN'), false);
  const opposite = Float32Array.from(transient, (value) => -value);
  assert.equal(waveformPath([transient, opposite]), signal);
  assert.equal(waveformPath([new Float32Array(1600)]), 'M0,32 L160,32');
  assert.equal(waveformPath([]), '');
});

void test('scope traces draw a single line of real cycles, zoomed to the pitch', () => {
  const rate = 44100;
  const sine = Float32Array.from(
    { length: rate },
    (_, i) => Math.sin((2 * Math.PI * 100 * i) / rate) * 0.5,
  );
  const window = scopeWindow('auto', 1, 100);
  assert.ok(Math.abs(window - 0.06) < 1e-9, 'six cycles of 100 Hz');
  const path = scopeTrace([sine], rate, window, 240);
  assert.ok(path.startsWith('M0.00,'));
  assert.equal(path.includes('Z'), false, 'a line, not a filled shape');
  assert.equal(path.split(' L').length, 240);
  assert.equal(path.includes('NaN'), false);
  const ys = path
    .slice(1)
    .split(' L')
    .map((point) => Number(point.split(',')[1]));
  assert.ok(
    Math.min(...ys) < 4 && Math.max(...ys) > 60,
    'normalised to the window',
  );
  assert.equal(scopeWindow('auto', 1, 8000), 0.012);
  assert.equal(scopeWindow('full', 0.4, 100), 0.4);
  assert.equal(
    scopeWindow('medium', 0.05, 100),
    0.05,
    'never beyond the sound',
  );
  assert.equal(scopeTrace([new Float32Array(100)], rate, 1), 'M0,32 L160,32');
});

void test('scope traces start at the onset, skipping leading silence', () => {
  const rate = 1000;
  const late = new Float32Array(200);
  for (let i = 50; i < 200; i++) late[i] = Math.sin(i / 3);
  const onset = findOnset([late], rate);
  assert.ok(Math.abs(onset - 0.0505) < 0.002, `onset ${onset}`);
  const trimmed = scopeTrace([late], rate, 0.05, 50, onset);
  assert.notEqual(trimmed.split(' L')[1].split(',')[1], '32.00');
  assert.equal(findOnset([new Float32Array(10)], rate), 0);
});
