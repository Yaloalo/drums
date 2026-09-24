import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clickLevelsFor,
  MetronomeClock,
  nextClickLevel,
} from '../src/transport/MetronomeClock.ts';
import { FM_ALGORITHMS } from '../src/audio/synthTopology.ts';
import { FACTORY_KITS, FACTORY_PRESETS } from '../src/presets/factorySounds.ts';
import { RHYTHM_PRESETS } from '../src/presets/rhythms.ts';
import {
  availableDestinations,
  engineSummary,
  normalizePreset,
  selectSlotEngine,
  voiceLength,
  type LegacySynthPreset,
} from '../src/model/voice.ts';
import {
  createPattern,
  setPatternMeter,
  stepsForMeter,
} from '../src/transport/timing.ts';

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

void test('click levels fill any meter and keep per-beat choices', () => {
  assert.deepEqual(clickLevelsFor(undefined, 4), [
    'accent',
    'normal',
    'normal',
    'normal',
  ]);
  const backbeat = ['off', 'accent', 'off', 'accent'] as const;
  assert.deepEqual(clickLevelsFor(backbeat, 3), ['off', 'accent', 'off']);
  assert.deepEqual(clickLevelsFor(backbeat, 5).at(-1), 'normal');
  assert.equal(nextClickLevel('accent'), 'normal');
  assert.equal(nextClickLevel('normal'), 'off');
  assert.equal(nextClickLevel('off'), 'accent');
});

void test('meters set the bar length and keep each bar’s steps', () => {
  assert.equal(stepsForMeter(4, 4), 16);
  assert.equal(stepsForMeter(7, 8), 14);
  assert.equal(stepsForMeter(5, 4), 20);
  assert.equal(stepsForMeter(3, 16), 3);
  const pattern = createPattern('meter', 'Meter', ['pad-0'], 2);
  pattern.tracks[0].steps[2].active = true;
  pattern.tracks[0].steps[15].active = true;
  pattern.tracks[0].steps[16 + 4].active = true;
  const seven = setPatternMeter(pattern, 7, 8);
  assert.equal(seven.stepsPerBar, 14);
  assert.equal(seven.tracks[0].steps.length, 28);
  assert.deepEqual(
    seven.tracks[0].steps.flatMap((step, index) =>
      step.active ? [index] : [],
    ),
    [2, 14 + 4],
    'step 16 falls outside a 7/8 bar; bar 2 keeps its first beat',
  );
  seven.tracks[0].steps[2].active = false;
  assert.equal(pattern.tracks[0].steps[2].active, true, 'no shared steps');
});

void test('rhythm presets fill whole bars of their meter', () => {
  for (const rhythm of RHYTHM_PRESETS) {
    const { pattern } = rhythm;
    assert.equal(
      pattern.stepsPerBar,
      stepsForMeter(pattern.beatsPerBar, pattern.beatUnit),
      rhythm.id,
    );
    for (const track of pattern.tracks)
      assert.equal(track.steps.length, pattern.bars * pattern.stepsPerBar);
  }
});

void test('legacy one-engine presets migrate without changing their sound', () => {
  const legacy: LegacySynthPreset = {
    id: 'custom-old',
    name: 'Old snare',
    category: 'Snare',
    tags: [],
    factory: false,
    engineType: 'subtractive',
    patch: {
      engine: 'subtractive',
      baseFrequency: 180,
      oscillators: [],
      noise: { level: 0.7, type: 'pink' },
      filter: {
        mode: 'bandpass',
        cutoff: 2400,
        resonance: 3,
        envelopeAmount: 900,
        keyTracking: 0.2,
      },
      ampEnvelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.05 },
      filterEnvelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.02 },
      pitchEnvelope: { amount: 12, decay: 0.04 },
      lfos: [
        { shape: 'square', rate: 7, depth: 0.3, destination: 'cutoff' },
        { shape: 'triangle', rate: 2, depth: 0, destination: 'pan' },
      ],
    },
    engineDrafts: {
      fm: {
        engine: 'fm',
        baseFrequency: 333,
        algorithm: 2,
        operators: [],
        ampEnvelope: { attack: 0, decay: 1, sustain: 0, release: 0 },
      },
    },
    modulation: [{ source: 'velocity', destination: 'amplitude', amount: 0.8 }],
    effects: [],
    macros: [],
    version: 3,
  };
  const preset = normalizePreset(legacy);
  const [one, two] = preset.voice.engines;
  assert.equal(one.enabled, true);
  assert.equal(one.filterMix, 0);
  assert.equal(two.enabled, false, 'no second layer appears');
  assert.deepEqual(preset.voice.filters[0], {
    enabled: true,
    ...legacy.patch.filter!,
  });
  assert.equal(preset.voice.filters[1].enabled, false);
  assert.deepEqual(preset.voice.filterEnvelope, legacy.patch.filterEnvelope);
  assert.equal('filter' in one.patch, false);
  assert.equal('lfos' in one.patch, false);
  assert.deepEqual(preset.voice.lfos[0], { shape: 'square', rate: 7 });
  assert.deepEqual(preset.modulation.at(-1), {
    source: 'lfo1',
    destination: 'cutoff',
    amount: 0.3,
  });
  assert.equal(preset.modulation.length, 2, 'zero-depth LFOs add no route');
  assert.equal(one.drafts?.fm?.baseFrequency, 333);
  assert.deepEqual(one.drafts?.fm?.pitchEnvelope, { amount: 0, decay: 0.08 });
  assert.equal(preset.voice.utility.enabled, false);
  assert.equal(preset.macros.length, 4);
  assert.ok(preset.macros.every((macro) => typeof macro.value === 'number'));
  assert.equal(normalizePreset(preset), preset, 'current presets pass through');
  assert.equal('engineType' in preset, false);
});

void test('factory library is migrated, frozen and includes layered voices', () => {
  const ids = new Set(FACTORY_PRESETS.map((preset) => preset.id));
  assert.equal(ids.size, FACTORY_PRESETS.length);
  for (const kit of FACTORY_KITS)
    for (const pad of kit.pads) assert.ok(ids.has(pad.presetId), pad.presetId);
  const layered = FACTORY_PRESETS.filter(
    (preset) => preset.voice.engines[1].enabled,
  );
  assert.deepEqual(
    [...new Set(layered.map((preset) => preset.voice.combine.mode))].sort(),
    ['fm', 'layer', 'ring'],
  );
  assert.equal(engineSummary(layered[0]), 'Analog + Analog');
  assert.ok(Object.isFrozen(FACTORY_PRESETS[0].voice.engines[0].patch));
  const fm = FACTORY_PRESETS.find((p) => p.name === 'FM Bell')!;
  assert.equal(fm.voice.filters[0].enabled, false, 'FM sounds stay unfiltered');
  assert.ok(availableDestinations(fm.voice, fm.effects).includes('reverb'));
  assert.deepEqual(
    FACTORY_PRESETS.filter((preset) => preset.voice.utility.enabled).map(
      (preset) => preset.name,
    ),
    ['Deep 808', 'Chrome Snare'],
  );
  for (const preset of FACTORY_PRESETS) {
    assert.equal(preset.macros.length, 4);
    for (const source of ['macro1', 'macro2', 'macro3', 'macro4'] as const)
      assert.ok(
        preset.modulation.some((route) => route.source === source),
        `${preset.name} has ${source}`,
      );
  }
});

void test('switching a slot’s engine recalls its edits and leaves the other slot alone', () => {
  const initial = FACTORY_PRESETS.find((p) => p.name === 'Layer Snare')!;
  const edited = structuredClone(initial);
  edited.voice.engines[0].patch.baseFrequency = 137;
  const switched = selectSlotEngine(edited, 0, 'fm');
  assert.equal(switched.voice.engines[0].patch.engine, 'fm');
  switched.voice.engines[0].patch.baseFrequency = 222;
  const back = selectSlotEngine(switched, 0, 'subtractive');
  assert.equal(back.voice.engines[0].patch.baseFrequency, 137);
  assert.equal(
    selectSlotEngine(back, 0, 'fm').voice.engines[0].patch.baseFrequency,
    222,
  );
  assert.deepEqual(back.voice.engines[1], initial.voice.engines[1]);
  assert.notEqual(initial.voice.engines[0].patch.baseFrequency, 137);
  assert.deepEqual(back.effects, initial.effects);
});

void test('voice length and destinations follow the active engines', () => {
  const preset = structuredClone(
    FACTORY_PRESETS.find((p) => p.name === 'Ring Clang')!,
  );
  preset.voice.engines[0].patch.ampEnvelope.decay = 0.1;
  preset.voice.engines[1].patch.ampEnvelope.decay = 0.9;
  // attack 2 ms + decay + release 50 ms of the longer engine
  assert.ok(Math.abs(voiceLength(preset.voice) - 0.952) < 1e-9);
  const destinations = availableDestinations(preset.voice);
  assert.ok(destinations.includes('combine'));
  assert.ok(destinations.includes('cutoff'));
  assert.equal(destinations.includes('cutoff2'), false);
  preset.voice.engines[1].enabled = false;
  assert.ok(Math.abs(voiceLength(preset.voice) - 0.152) < 1e-9);
  assert.equal(availableDestinations(preset.voice).includes('combine'), false);
  assert.equal(availableDestinations(preset.voice).includes('pitch2'), false);
  preset.voice.utility.enabled = true;
  preset.voice.utility.ampEnvelope = {
    attack: 0.01,
    decay: 1.2,
    sustain: 0,
    release: 0.1,
  };
  assert.ok(Math.abs(voiceLength(preset.voice) - 1.31) < 1e-9);
  assert.ok(availableDestinations(preset.voice).includes('utility'));
  assert.ok(availableDestinations(preset.voice).includes('utilityPitch'));
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
