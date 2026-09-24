import type {
  AdditivePatch,
  EngineSlot,
  Envelope,
  EffectDefinition,
  FilterDefinition,
  FilterMode,
  FMPatch,
  LfoShape,
  ModulationDestination,
  ModulationRoute,
  PitchSweep,
  SubtractivePatch,
  SynthEngineType,
  SynthPatch,
  SynthPreset,
  UtilitySource,
  VoiceArchitecture,
} from './types.ts';
import { cloneSerializable } from './types.ts';

/* Presets saved before the two-engine voice kept one engine in `patch`, with
 * the filter and LFOs inside it. They are migrated on load so saved user
 * sounds keep playing the same way. */
interface LegacyLFO {
  shape: LfoShape;
  rate: number;
  depth?: number;
  destination?: ModulationDestination;
}
interface LegacyFilter {
  mode: FilterMode;
  cutoff: number;
  resonance: number;
  envelopeAmount: number;
  keyTracking: number;
}
type Legacy<T extends SynthPatch> = Omit<T, 'pitchEnvelope'> & {
  pitchEnvelope?: PitchSweep;
  filter?: LegacyFilter;
  filterEnvelope?: Envelope;
  lfos?: LegacyLFO[];
};
export type LegacySubtractivePatch = Legacy<SubtractivePatch>;
export type LegacyFMPatch = Legacy<FMPatch>;
export type LegacyAdditivePatch = Legacy<AdditivePatch>;
export type LegacyPatch =
  | LegacySubtractivePatch
  | LegacyFMPatch
  | LegacyAdditivePatch;

export interface LegacySynthPreset extends Omit<SynthPreset, 'voice'> {
  engineType: SynthEngineType;
  patch: LegacyPatch;
  engineDrafts?: Partial<Record<SynthEngineType, LegacyPatch>>;
  voice?: undefined;
}

export const ENGINE_NAMES: Record<SynthEngineType, string> = {
  subtractive: 'Analog',
  fm: 'FM',
  additive: 'Harmonic',
};

export const ENGINE_DETAILS: Record<SynthEngineType, string> = {
  subtractive: 'Oscillators + noise',
  fm: '4 operators',
  additive: 'Additive partials',
};

const env = (
  attack: number,
  decay: number,
  sustain = 0,
  release = 0.04,
): Envelope => ({ attack, decay, sustain, release });

export const noPitchSweep = (): PitchSweep => ({ amount: 0, decay: 0.08 });

export function defaultFilter(enabled = false): FilterDefinition {
  return {
    enabled,
    mode: 'lowpass',
    cutoff: 8000,
    resonance: 0.8,
    envelopeAmount: 0,
    keyTracking: 0,
  };
}

/** Starting points for an empty slot. Slot 2 defaults to a short noise
 * transient because that is the most common second layer of a drum. */
export function defaultEnginePatch(
  engine: SynthEngineType,
  slot = 0,
): SynthPatch {
  if (engine === 'fm')
    return {
      engine: 'fm',
      baseFrequency: slot ? 420 : 220,
      algorithm: 1,
      operators: [1, 2, 3.5, 7].map((ratio, index) => ({
        ratio,
        coarse: 0,
        fine: 0,
        level: index === 0 ? 0.85 : 0.45 - index * 0.08,
        feedback: 0,
        envelope: env(0.001, (slot ? 0.12 : 0.5) * (1 - index * 0.15)),
      })),
      ampEnvelope: env(0.001, slot ? 0.12 : 0.5),
      pitchEnvelope: noPitchSweep(),
    };
  if (engine === 'additive')
    return {
      engine: 'additive',
      baseFrequency: slot ? 660 : 330,
      partials: [1, 2, 3, 4.2, 5.4].map((ratio, index) => ({
        ratio,
        amplitude: 0.8 / (index + 1),
        decay: (slot ? 0.2 : 0.6) * (1 + index * 0.1),
        detune: 0,
      })),
      ampEnvelope: env(0.002, slot ? 0.2 : 0.6),
      pitchEnvelope: noPitchSweep(),
      spectralTilt: 0.5,
      inharmonicity: 0,
      spread: 0.1,
    };
  return {
    engine: 'subtractive',
    baseFrequency: slot ? 1200 : 150,
    oscillators: [
      {
        waveform: 'sine',
        octave: 0,
        semitone: 0,
        fine: 0,
        level: slot ? 0 : 0.9,
        phase: 0,
        retrigger: true,
      },
      {
        waveform: 'triangle',
        octave: 1,
        semitone: 0,
        fine: 0,
        level: slot ? 0 : 0.15,
        phase: 0,
        retrigger: true,
      },
    ],
    noise: { level: slot ? 0.8 : 0, type: 'white' },
    ampEnvelope: env(0.001, slot ? 0.09 : 0.35),
    pitchEnvelope: slot ? noPitchSweep() : { amount: 24, decay: 0.06 },
  };
}

export function defaultSlot(slot: number, enabled = false): EngineSlot {
  return {
    enabled,
    patch: defaultEnginePatch('subtractive', slot),
    level: slot ? 0.7 : 1,
    filterMix: slot ? 1 : 0,
  };
}

export function defaultUtility(): UtilitySource {
  return {
    enabled: false,
    baseFrequency: 55,
    oscillator: {
      enabled: true,
      waveform: 'sine',
      octave: -1,
      level: 0.45,
    },
    noise: { enabled: false, type: 'white', level: 0.25 },
    ampEnvelope: env(0.001, 0.22, 0, 0.04),
    filterMix: 0,
    direct: 0.75,
  };
}

const DEFAULT_MACROS = [
  { name: 'Body', destination: 'cutoff', min: 0, max: 1, value: 0.5 },
  { name: 'Motion', destination: 'pitch', min: 0, max: 1, value: 0 },
  { name: 'Edge', destination: 'effects', min: 0, max: 1, value: 0 },
  { name: 'Space', destination: 'reverb', min: 0, max: 1, value: 0 },
];

function normalizedMacros(
  macros: SynthPreset['macros'],
): SynthPreset['macros'] {
  return DEFAULT_MACROS.map((fallback, index) => ({
    ...fallback,
    ...macros[index],
    value: Math.max(0, Math.min(1, macros[index]?.value ?? fallback.value)),
  }));
}

/** A one-engine patch without the parts that moved to the voice. */
export function sourceFromLegacy(patch: LegacyPatch): SynthPatch {
  const copy = cloneSerializable(patch) as LegacyPatch;
  delete copy.filter;
  delete copy.filterEnvelope;
  delete copy.lfos;
  return {
    ...copy,
    pitchEnvelope: copy.pitchEnvelope ?? noPitchSweep(),
  } as SynthPatch;
}

function migrateLegacy(legacy: LegacySynthPreset): SynthPreset {
  const patch = legacy.patch;
  const filter: FilterDefinition = patch.filter
    ? { enabled: true, ...patch.filter }
    : defaultFilter(false);
  const lfos = [0, 1].map((index) => ({
    shape: patch.lfos?.[index]?.shape ?? (index ? 'triangle' : 'sine'),
    rate: patch.lfos?.[index]?.rate ?? (index ? 2 : 5),
  })) as VoiceArchitecture['lfos'];
  const lfoRoutes: ModulationRoute[] = (patch.lfos ?? []).flatMap(
    (lfo, index) =>
      lfo.depth && lfo.destination && index < 2
        ? [
            {
              source: index ? 'lfo2' : 'lfo1',
              destination: lfo.destination,
              amount: lfo.depth,
            },
          ]
        : [],
  );
  const drafts = Object.fromEntries(
    Object.entries(legacy.engineDrafts ?? {})
      .filter(([engine, draft]) => draft && engine !== patch.engine)
      .map(([engine, draft]) => [engine, sourceFromLegacy(draft)]),
  ) as EngineSlot['drafts'];
  const { engineType: _engineType, patch: _patch, ...rest } = legacy;
  delete (rest as Partial<LegacySynthPreset>).engineDrafts;
  delete (rest as Partial<LegacySynthPreset>).voice;
  return {
    ...cloneSerializable(rest),
    macros: normalizedMacros(legacy.macros ?? []),
    modulation: [...cloneSerializable(legacy.modulation ?? []), ...lfoRoutes],
    voice: {
      engines: [
        {
          enabled: true,
          patch: sourceFromLegacy(patch),
          level: 1,
          filterMix: 0,
          ...(drafts && Object.keys(drafts).length ? { drafts } : {}),
        },
        defaultSlot(1),
      ],
      utility: defaultUtility(),
      combine: { mode: 'layer', amount: 0.5 },
      filters: [filter, defaultFilter(false)],
      filterRouting: 1,
      filterEnvelope: cloneSerializable(
        patch.filterEnvelope ?? env(0.001, 0.12, 0, 0.03),
      ),
      lfos,
      amp: { level: 1, pan: 0, velocity: 1 },
    },
  };
}

/** Accepts a current or pre-two-engine preset and returns a current one.
 * Current presets are returned unchanged, so this is cheap on every hit. */
export function normalizePreset(
  preset: SynthPreset | LegacySynthPreset,
): SynthPreset {
  if (preset.voice) {
    const current = preset as SynthPreset;
    const hasUtility = Boolean(current.voice.utility);
    const hasMacros =
      current.macros.length === 4 &&
      current.macros.every((macro) => typeof macro.value === 'number');
    if (hasUtility && hasMacros) return current;
    const next = cloneSerializable(current);
    next.voice.utility ??= defaultUtility();
    next.macros = normalizedMacros(next.macros ?? []);
    return next;
  }
  return migrateLegacy(preset as LegacySynthPreset);
}

export function envelopeLength(envelope: Envelope): number {
  return Math.max(
    0.04,
    envelope.attack +
      envelope.decay +
      envelope.release +
      (envelope.sustain > 0 ? 0.08 : 0),
  );
}

/** The audible length of a hit: the longest active engine envelope. */
export function voiceLength(voice: VoiceArchitecture): number {
  return Math.max(
    0.04,
    ...voice.engines
      .filter((slot) => slot.enabled)
      .map((slot) => envelopeLength(slot.patch.ampEnvelope)),
    voice.utility?.enabled ? envelopeLength(voice.utility.ampEnvelope) : 0,
  );
}

export function selectSlotEngine(
  preset: SynthPreset,
  slotIndex: 0 | 1,
  engine: SynthEngineType,
): SynthPreset {
  const next = cloneSerializable(preset);
  const slot = next.voice.engines[slotIndex];
  if (slot.patch.engine === engine) return next;
  const drafts = { ...slot.drafts, [slot.patch.engine]: slot.patch };
  slot.patch = cloneSerializable(
    drafts[engine] ?? defaultEnginePatch(engine, slotIndex),
  );
  delete drafts[engine];
  slot.drafts = drafts;
  return next;
}

/** "Analog", or "Analog + FM" when the second engine is on. */
export function engineSummary(preset: SynthPreset): string {
  return preset.voice.engines
    .filter((slot) => slot.enabled)
    .map((slot) => ENGINE_NAMES[slot.patch.engine])
    .join(' + ');
}

export const MODULATION_SOURCES = [
  'lfo1',
  'lfo2',
  'modEnv',
  'ampEnv',
  'velocity',
  'random',
  'macro1',
  'macro2',
  'macro3',
  'macro4',
] as const;

export const SOURCE_NAMES: Record<ModulationRoute['source'], string> = {
  lfo1: 'LFO 1',
  lfo2: 'LFO 2',
  modEnv: 'Filter env',
  ampEnv: 'Engine 1 env',
  velocity: 'Velocity',
  random: 'Random',
  macro1: 'Macro 1',
  macro2: 'Macro 2',
  macro3: 'Macro 3',
  macro4: 'Macro 4',
};

export const SOURCE_TAGS: Record<ModulationRoute['source'], string> = {
  lfo1: 'L1',
  lfo2: 'L2',
  modEnv: 'FE',
  ampEnv: 'E1',
  velocity: 'VEL',
  random: 'RND',
  macro1: 'M1',
  macro2: 'M2',
  macro3: 'M3',
  macro4: 'M4',
};

export const DESTINATION_NAMES: Record<ModulationDestination, string> = {
  pitch: 'Pitch (both engines)',
  pitch1: 'Engine 1 pitch',
  pitch2: 'Engine 2 pitch',
  level: 'Volume',
  amplitude: 'Volume',
  pan: 'Pan',
  engine1: 'Engine 1 level',
  engine2: 'Engine 2 level',
  utility: 'Utility level',
  utilityPitch: 'Utility pitch',
  combine: 'Combine amount',
  cutoff: 'Filter 1 cutoff',
  resonance: 'Filter 1 resonance',
  cutoff2: 'Filter 2 cutoff',
  resonance2: 'Filter 2 resonance',
  fmIndex: 'FM index',
  spectralTilt: 'Harmonic tilt',
  drive: 'Drive mix',
  delay: 'Delay send',
  reverb: 'Reverb send',
};

/** Destinations that do something for this voice right now. */
export function availableDestinations(
  voice: VoiceArchitecture,
  effects: EffectDefinition[] = [],
): ModulationDestination[] {
  const [one, two] = voice.engines;
  const engines = voice.engines.filter((slot) => slot.enabled);
  const list: ModulationDestination[] = ['pitch', 'pitch1'];
  if (two.enabled) list.push('pitch2');
  list.push('amplitude', 'pan', 'engine1');
  if (two.enabled) list.push('engine2');
  if (voice.utility?.enabled) list.push('utility', 'utilityPitch');
  if (two.enabled && voice.combine.mode !== 'layer') list.push('combine');
  if (voice.filters[0].enabled) list.push('cutoff', 'resonance');
  if (voice.filters[1].enabled) list.push('cutoff2', 'resonance2');
  if (engines.some((slot) => slot.patch.engine === 'fm')) list.push('fmIndex');
  if (engines.some((slot) => slot.patch.engine === 'additive'))
    list.push('spectralTilt');
  for (const type of ['drive', 'delay', 'reverb'] as const)
    if (effects.some((effect) => effect.type === type && effect.enabled))
      list.push(type);
  return one.enabled ? list : list.filter((item) => item !== 'engine1');
}
