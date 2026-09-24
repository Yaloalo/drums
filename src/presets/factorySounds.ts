import type {
  DrumKit,
  SynthPreset,
  VoiceArchitecture,
} from '../model/types.ts';
import { cloneSerializable, deepFreeze } from '../model/types.ts';
import {
  defaultFilter,
  defaultSlot,
  defaultUtility,
  normalizePreset,
  sourceFromLegacy,
  type LegacyAdditivePatch,
  type LegacyFMPatch,
  type LegacySubtractivePatch,
} from '../model/voice.ts';

const env = (attack: number, decay: number, sustain = 0, release = 0.04) => ({
  attack,
  decay,
  sustain,
  release,
});
const lfos = () => [
  {
    shape: 'sine' as const,
    rate: 5,
    depth: 0,
    sync: false,
    destination: 'pitch' as const,
  },
  {
    shape: 'triangle' as const,
    rate: 2,
    depth: 0,
    sync: true,
    destination: 'pan' as const,
  },
];

// The single-engine library is written in the original one-engine shape and
// migrated like saved user presets, which keeps both paths identical.
function subtractive(
  baseFrequency: number,
  decay: number,
  options: Partial<LegacySubtractivePatch> = {},
): LegacySubtractivePatch {
  return {
    engine: 'subtractive',
    baseFrequency,
    oscillators: [
      {
        waveform: 'sine',
        octave: 0,
        semitone: 0,
        fine: 0,
        level: 0.95,
        phase: 0,
        retrigger: true,
      },
      {
        waveform: 'triangle',
        octave: 0,
        semitone: 0,
        fine: 4,
        level: 0.18,
        phase: 0,
        retrigger: true,
      },
    ],
    noise: { level: 0, type: 'white' },
    filter: {
      mode: 'lowpass',
      cutoff: 12000,
      resonance: 0.8,
      envelopeAmount: 0,
      keyTracking: 0,
    },
    ampEnvelope: env(0.002, decay, 0, 0.05),
    filterEnvelope: env(0.001, 0.12, 0, 0.03),
    pitchEnvelope: { amount: 0, decay: 0.08 },
    lfos: lfos(),
    ...options,
  };
}

function fm(
  baseFrequency: number,
  decay: number,
  algorithm: LegacyFMPatch['algorithm'],
  ratios: number[],
): LegacyFMPatch {
  return {
    engine: 'fm',
    baseFrequency,
    algorithm,
    operators: ratios.map((ratio, index) => ({
      ratio,
      coarse: 0,
      fine: index * 2,
      level: index === 0 ? 0.85 : 0.45 - index * 0.06,
      feedback: index === 3 ? 0.18 : 0,
      envelope: env(0.001 + index * 0.001, decay * (1 - index * 0.12), 0, 0.04),
    })),
    ampEnvelope: env(0.001, decay, 0, 0.06),
    lfos: lfos(),
  };
}

function additive(
  baseFrequency: number,
  decay: number,
  ratios: number[],
  tilt = 0.55,
  inharmonicity = 0,
): LegacyAdditivePatch {
  return {
    engine: 'additive',
    baseFrequency,
    partials: ratios.map((ratio, index) => ({
      ratio,
      amplitude: Math.max(0.04, 0.82 / (index + 1)),
      decay: decay * (1 + index * 0.11),
      detune: index % 2 ? 2 : -2,
    })),
    ampEnvelope: env(0.002, decay, 0, 0.08),
    spectralTilt: tilt,
    inharmonicity,
    spread: 0.12,
    lfos: lfos(),
  };
}

type Spec = {
  name: string;
  category: string;
  tags: string[];
  patch: LegacySubtractivePatch | LegacyFMPatch | LegacyAdditivePatch;
  drive?: number;
  reverb?: number;
};

const specs: Spec[] = [
  {
    name: 'Deep 808',
    category: 'Kick',
    tags: ['sub', 'long', 'classic'],
    patch: subtractive(49, 0.72, {
      pitchEnvelope: { amount: 44, decay: 0.075 },
      filter: {
        mode: 'lowpass',
        cutoff: 900,
        resonance: 1.2,
        envelopeAmount: 400,
        keyTracking: 0,
      },
    }),
    drive: 0.2,
  },
  {
    name: 'Short Punch',
    category: 'Kick',
    tags: ['tight', 'electronic'],
    patch: subtractive(58, 0.2, {
      pitchEnvelope: { amount: 62, decay: 0.045 },
    }),
    drive: 0.42,
  },
  {
    name: 'Warehouse Kick',
    category: 'Kick',
    tags: ['house', 'hard'],
    patch: subtractive(52, 0.38, {
      pitchEnvelope: { amount: 76, decay: 0.06 },
      oscillators: [
        {
          waveform: 'sine',
          octave: 0,
          semitone: 0,
          fine: 0,
          level: 1,
          phase: 0,
          retrigger: true,
        },
        {
          waveform: 'square',
          octave: 1,
          semitone: 0,
          fine: -3,
          level: 0.08,
          phase: 0,
          retrigger: true,
        },
      ],
    }),
    drive: 0.64,
  },
  {
    name: 'Soft Practice Kick',
    category: 'Kick',
    tags: ['neutral', 'soft'],
    patch: subtractive(62, 0.28, {
      pitchEnvelope: { amount: 25, decay: 0.09 },
    }),
  },
  {
    name: 'Crush Snare',
    category: 'Snare',
    tags: ['noise', 'electronic'],
    patch: subtractive(178, 0.24, {
      noise: { level: 0.72, type: 'white' },
      oscillators: [
        {
          waveform: 'triangle',
          octave: 0,
          semitone: 0,
          fine: 0,
          level: 0.38,
          phase: 0,
          retrigger: true,
        },
        {
          waveform: 'sine',
          octave: 0,
          semitone: 5,
          fine: 8,
          level: 0.18,
          phase: 0,
          retrigger: true,
        },
      ],
      filter: {
        mode: 'bandpass',
        cutoff: 3200,
        resonance: 1.1,
        envelopeAmount: 1200,
        keyTracking: 0,
      },
    }),
    drive: 0.28,
  },
  {
    name: 'Noise Snare',
    category: 'Snare',
    tags: ['wide', 'bright'],
    patch: subtractive(205, 0.31, {
      noise: { level: 0.9, type: 'pink' },
      filter: {
        mode: 'highpass',
        cutoff: 1250,
        resonance: 0.7,
        envelopeAmount: 2400,
        keyTracking: 0,
      },
    }),
  },
  {
    name: 'Synthetic Acoustic',
    category: 'Snare',
    tags: ['body', 'practice'],
    patch: subtractive(164, 0.34, {
      noise: { level: 0.55, type: 'pink' },
      pitchEnvelope: { amount: 12, decay: 0.04 },
    }),
    reverb: 0.12,
  },
  {
    name: 'Dry Crowd',
    category: 'Clap',
    tags: ['tight', 'dry'],
    patch: subtractive(330, 0.18, {
      noise: { level: 1, type: 'white' },
      oscillators: [
        {
          waveform: 'square',
          octave: 1,
          semitone: 0,
          fine: 0,
          level: 0.08,
          phase: 0,
          retrigger: true,
        },
      ],
      filter: {
        mode: 'bandpass',
        cutoff: 1800,
        resonance: 2,
        envelopeAmount: 4100,
        keyTracking: 0,
      },
    }),
  },
  {
    name: 'Wide Clap',
    category: 'Clap',
    tags: ['wide', 'house'],
    patch: subtractive(380, 0.29, {
      noise: { level: 1, type: 'pink' },
      filter: {
        mode: 'bandpass',
        cutoff: 2400,
        resonance: 1.5,
        envelopeAmount: 5200,
        keyTracking: 0,
      },
    }),
    reverb: 0.22,
  },
  {
    name: '909 Tight',
    category: 'Closed Hat',
    tags: ['metal', 'short'],
    patch: subtractive(6100, 0.065, {
      oscillators: [
        {
          waveform: 'square',
          octave: 0,
          semitone: 0,
          fine: 0,
          level: 0.16,
          phase: 0,
          retrigger: true,
        },
        {
          waveform: 'square',
          octave: 0,
          semitone: 7,
          fine: 0,
          level: 0.14,
          phase: 0,
          retrigger: true,
        },
      ],
      noise: { level: 0.78, type: 'metal' },
      filter: {
        mode: 'highpass',
        cutoff: 5900,
        resonance: 0.6,
        envelopeAmount: 1800,
        keyTracking: 0,
      },
    }),
  },
  {
    name: 'Dust Hat',
    category: 'Closed Hat',
    tags: ['soft', 'lofi'],
    patch: subtractive(4900, 0.09, {
      noise: { level: 0.9, type: 'pink' },
      filter: {
        mode: 'highpass',
        cutoff: 4600,
        resonance: 0.4,
        envelopeAmount: 800,
        keyTracking: 0,
      },
    }),
  },
  {
    name: '909 Open',
    category: 'Open Hat',
    tags: ['metal', 'long'],
    patch: subtractive(5700, 0.58, {
      noise: { level: 0.85, type: 'metal' },
      filter: {
        mode: 'highpass',
        cutoff: 5200,
        resonance: 0.7,
        envelopeAmount: 2000,
        keyTracking: 0,
      },
    }),
  },
  {
    name: 'Air Hat',
    category: 'Open Hat',
    tags: ['smooth', 'wide'],
    patch: subtractive(6500, 0.76, {
      noise: { level: 0.78, type: 'pink' },
      filter: {
        mode: 'highpass',
        cutoff: 6200,
        resonance: 0.3,
        envelopeAmount: 1000,
        keyTracking: 0,
      },
    }),
    reverb: 0.12,
  },
  {
    name: 'Sand Shake',
    category: 'Shaker',
    tags: ['organic', 'short'],
    patch: subtractive(7200, 0.12, {
      noise: { level: 1, type: 'pink' },
      filter: {
        mode: 'bandpass',
        cutoff: 6800,
        resonance: 2.4,
        envelopeAmount: 800,
        keyTracking: 0,
      },
    }),
  },
  {
    name: 'Cabasa Wire',
    category: 'Shaker',
    tags: ['bright', 'latin'],
    patch: subtractive(8200, 0.2, {
      noise: { level: 0.95, type: 'metal' },
      filter: {
        mode: 'bandpass',
        cutoff: 7500,
        resonance: 1.8,
        envelopeAmount: 1200,
        keyTracking: 0,
      },
    }),
  },
  {
    name: 'Round Tom',
    category: 'Tom',
    tags: ['round', 'electronic'],
    patch: subtractive(142, 0.4, {
      pitchEnvelope: { amount: 18, decay: 0.08 },
    }),
  },
  {
    name: 'Sub Tom',
    category: 'Tom',
    tags: ['deep', 'long'],
    patch: subtractive(92, 0.62, {
      pitchEnvelope: { amount: 22, decay: 0.12 },
    }),
  },
  {
    name: 'High Tom',
    category: 'Tom',
    tags: ['high', 'tight'],
    patch: subtractive(220, 0.28, {
      pitchEnvelope: { amount: 26, decay: 0.06 },
    }),
  },
  {
    name: 'Hard Rim',
    category: 'Rim',
    tags: ['dry', 'sharp'],
    patch: subtractive(520, 0.055, {
      oscillators: [
        {
          waveform: 'square',
          octave: 0,
          semitone: 0,
          fine: 0,
          level: 0.5,
          phase: 0,
          retrigger: true,
        },
        {
          waveform: 'sine',
          octave: 1,
          semitone: 7,
          fine: 0,
          level: 0.3,
          phase: 0,
          retrigger: true,
        },
      ],
      noise: { level: 0.16, type: 'white' },
      filter: {
        mode: 'bandpass',
        cutoff: 3100,
        resonance: 3.2,
        envelopeAmount: 1200,
        keyTracking: 0,
      },
    }),
    drive: 0.35,
  },
  {
    name: 'Bright Clave',
    category: 'Wood',
    tags: ['clave', 'latin'],
    patch: subtractive(880, 0.095, {
      oscillators: [
        {
          waveform: 'sine',
          octave: 0,
          semitone: 0,
          fine: 0,
          level: 0.75,
          phase: 0,
          retrigger: true,
        },
        {
          waveform: 'triangle',
          octave: 1,
          semitone: 7,
          fine: 0,
          level: 0.2,
          phase: 0,
          retrigger: true,
        },
      ],
      filter: {
        mode: 'bandpass',
        cutoff: 2300,
        resonance: 3.8,
        envelopeAmount: 1000,
        keyTracking: 0,
      },
    }),
  },
  {
    name: 'Wood Block',
    category: 'Wood',
    tags: ['woody', 'dry'],
    patch: subtractive(510, 0.14, {
      oscillators: [
        {
          waveform: 'triangle',
          octave: 0,
          semitone: 0,
          fine: 0,
          level: 0.8,
          phase: 0,
          retrigger: true,
        },
      ],
      filter: {
        mode: 'bandpass',
        cutoff: 1300,
        resonance: 4.1,
        envelopeAmount: 700,
        keyTracking: 0,
      },
    }),
  },
  {
    name: 'Dub Blip',
    category: 'Percussion',
    tags: ['minimal', 'blip'],
    patch: subtractive(390, 0.19, {
      filter: {
        mode: 'lowpass',
        cutoff: 1800,
        resonance: 6.5,
        envelopeAmount: 4300,
        keyTracking: 0.25,
      },
      pitchEnvelope: { amount: -11, decay: 0.16 },
    }),
  },
  {
    name: 'Rubber Perc',
    category: 'Percussion',
    tags: ['bouncy', 'synthetic'],
    patch: subtractive(260, 0.3, {
      pitchEnvelope: { amount: -28, decay: 0.2 },
      filter: {
        mode: 'bandpass',
        cutoff: 1100,
        resonance: 5.2,
        envelopeAmount: 2600,
        keyTracking: 0.2,
      },
    }),
  },
  {
    name: 'Sub Drop',
    category: 'Bass Percussion',
    tags: ['sub', 'drop'],
    patch: subtractive(73, 0.9, {
      pitchEnvelope: { amount: 58, decay: 0.42 },
      filter: {
        mode: 'lowpass',
        cutoff: 500,
        resonance: 1.2,
        envelopeAmount: 200,
        keyTracking: 0,
      },
    }),
    drive: 0.14,
  },

  {
    name: 'FM Bell',
    category: 'Bell',
    tags: ['bell', 'clean'],
    patch: fm(520, 1.4, 1, [1, 2, 3.01, 5.98]),
    reverb: 0.28,
  },
  {
    name: 'Synthetic Cowbell',
    category: 'Bell',
    tags: ['cowbell', 'latin'],
    patch: fm(438, 0.38, 3, [1, 1.48, 2.05, 3.6]),
    drive: 0.16,
  },
  {
    name: 'FM Ride',
    category: 'Cymbal',
    tags: ['ride', 'metallic'],
    patch: fm(710, 1.8, 5, [1, 1.414, 2.39, 5.17]),
    reverb: 0.18,
  },
  {
    name: 'Glass Crash',
    category: 'Cymbal',
    tags: ['crash', 'bright'],
    patch: fm(380, 1.65, 6, [1, 1.57, 2.83, 7.11]),
    drive: 0.12,
    reverb: 0.3,
  },
  {
    name: 'Tin Hat',
    category: 'Closed Hat',
    tags: ['fm', 'thin'],
    patch: fm(1320, 0.07, 4, [1, 1.31, 2.76, 6.22]),
  },
  {
    name: 'Alien Hat',
    category: 'Open Hat',
    tags: ['fm', 'experimental'],
    patch: fm(940, 0.64, 6, [1, 1.73, 4.09, 8.21]),
    reverb: 0.16,
  },
  {
    name: 'Digital Clave',
    category: 'Wood',
    tags: ['fm', 'clave'],
    patch: fm(760, 0.11, 2, [1, 2.01, 3.98, 7.2]),
  },
  {
    name: 'Laser Tom',
    category: 'Tom',
    tags: ['fm', 'bent'],
    patch: fm(170, 0.48, 2, [1, 1.99, 2.7, 4.2]),
    drive: 0.25,
  },
  {
    name: 'Circuit Kick',
    category: 'Kick',
    tags: ['fm', 'digital'],
    patch: fm(56, 0.42, 1, [1, 0.5, 1.51, 3.02]),
    drive: 0.44,
  },
  {
    name: 'Chrome Snare',
    category: 'Snare',
    tags: ['fm', 'metallic'],
    patch: fm(210, 0.3, 5, [1, 2.17, 5.12, 8.93]),
    drive: 0.2,
  },
  {
    name: 'Arcade Zap',
    category: 'Experimental',
    tags: ['fm', 'zap'],
    patch: fm(640, 0.3, 6, [1, 0.37, 4.7, 9.1]),
    reverb: 0.22,
  },
  {
    name: 'Temple Gong',
    category: 'Metallic',
    tags: ['fm', 'gong'],
    patch: fm(210, 2.2, 3, [1, 1.41, 2.91, 5.02]),
    reverb: 0.42,
  },
  {
    name: 'Signal Block',
    category: 'Percussion',
    tags: ['fm', 'short'],
    patch: fm(990, 0.085, 2, [1, 2.72, 4.11, 6.3]),
  },
  {
    name: 'Data Rattle',
    category: 'Shaker',
    tags: ['fm', 'digital'],
    patch: fm(1820, 0.16, 6, [1, 1.17, 3.71, 9.8]),
  },

  {
    name: 'Pure Mallet',
    category: 'Tonal',
    tags: ['additive', 'clean'],
    patch: additive(440, 0.62, [1, 2, 3, 4, 5, 6], 0.68),
  },
  {
    name: 'Marimba Wood',
    category: 'Wood',
    tags: ['additive', 'mallet'],
    patch: additive(310, 0.48, [1, 3.98, 9.2, 13.1], 0.76, 0.01),
  },
  {
    name: 'Vibra Bell',
    category: 'Bell',
    tags: ['additive', 'vibes'],
    patch: additive(590, 1.35, [1, 2.01, 3.91, 5.82, 8.2], 0.5, 0.025),
    reverb: 0.3,
  },
  {
    name: 'Bronze Bowl',
    category: 'Metallic',
    tags: ['additive', 'bowl'],
    patch: additive(270, 2.1, [1, 1.52, 2.31, 3.89, 6.72], 0.44, 0.07),
    reverb: 0.36,
  },
  {
    name: 'Hollow Log',
    category: 'Wood',
    tags: ['additive', 'hollow'],
    patch: additive(190, 0.44, [1, 2.78, 5.1, 8.4], 0.8, 0.015),
  },
  {
    name: 'Crystal Tick',
    category: 'Percussion',
    tags: ['additive', 'short'],
    patch: additive(1150, 0.12, [1, 2.12, 4.28, 7.9], 0.42, 0.04),
  },
  {
    name: 'Glass Drops',
    category: 'Tonal',
    tags: ['additive', 'ambient'],
    patch: additive(720, 0.9, [1, 1.99, 4.02, 7.13], 0.48, 0.02),
    reverb: 0.4,
  },
  {
    name: 'Steel Tongue',
    category: 'Tonal',
    tags: ['additive', 'tongue'],
    patch: additive(330, 1.1, [1, 2.76, 5.4, 8.93], 0.6, 0.018),
    reverb: 0.2,
  },
  {
    name: 'Spectral Tom',
    category: 'Tom',
    tags: ['additive', 'tonal'],
    patch: additive(130, 0.58, [1, 1.99, 3.04, 4.13], 0.72, 0.012),
  },
  {
    name: 'Wire Pulse',
    category: 'Experimental',
    tags: ['additive', 'metal'],
    patch: additive(480, 0.36, [1, 1.19, 2.76, 6.1, 10.2], 0.33, 0.1),
    drive: 0.2,
  },
  {
    name: 'Soft Kalimba',
    category: 'Tonal',
    tags: ['additive', 'soft'],
    patch: additive(520, 0.72, [1, 2, 5.12, 8.2], 0.78, 0.008),
    reverb: 0.18,
  },
  {
    name: 'Cluster Hit',
    category: 'Experimental',
    tags: ['additive', 'cluster'],
    patch: additive(240, 0.7, [1, 1.13, 1.49, 2.77, 5.21, 8.08], 0.3, 0.15),
    drive: 0.32,
    reverb: 0.25,
  },
];

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function presetBase(spec: {
  name: string;
  category: string;
  tags: string[];
  drive?: number;
  reverb?: number;
}): Omit<SynthPreset, 'voice'> {
  return {
    id: `factory-${slug(spec.name)}`,
    name: spec.name,
    category: spec.category,
    tags: spec.tags,
    factory: true,
    modulation: [
      { source: 'velocity', destination: 'amplitude', amount: 0.8 },
      {
        source: 'random',
        destination: 'pitch',
        amount: spec.category === 'Shaker' ? 0.14 : 0.02,
      },
    ],
    effects: [
      {
        type: 'drive',
        enabled: Boolean(spec.drive),
        mix: spec.drive ?? 0,
        amount: spec.drive ?? 0,
      },
      {
        type: 'reverb',
        enabled: Boolean(spec.reverb),
        mix: spec.reverb ?? 0,
        amount: spec.reverb ?? 0,
      },
    ],
    macros: [
      { name: 'Body', destination: 'cutoff', min: 0, max: 1, value: 0.5 },
      { name: 'Motion', destination: 'pitch', min: 0, max: 1, value: 0 },
      { name: 'Edge', destination: 'effects', min: 0, max: 1, value: 0 },
      { name: 'Space', destination: 'reverb', min: 0, max: 1, value: 0 },
    ],
    version: 1,
  };
}

const silent = (
  waveform: 'sine' | 'triangle' | 'sawtooth' | 'square',
  level = 0,
  octave = 0,
  semitone = 0,
) => ({
  waveform,
  octave,
  semitone,
  fine: 0,
  level,
  phase: 0,
  retrigger: true,
});

interface LayeredSpec {
  name: string;
  category: string;
  tags: string[];
  drive?: number;
  reverb?: number;
  one: {
    patch: LegacySubtractivePatch | LegacyFMPatch | LegacyAdditivePatch;
    level?: number;
    filterMix?: number;
  };
  two: {
    patch: LegacySubtractivePatch | LegacyFMPatch | LegacyAdditivePatch;
    level?: number;
    filterMix?: number;
  };
  combine?: VoiceArchitecture['combine'];
  filters: [
    Partial<VoiceArchitecture['filters'][number]>,
    Partial<VoiceArchitecture['filters'][number]>?,
  ];
  filterRouting?: number;
  filterDecay?: number;
}

// Two-engine sounds that show each way the engines combine.
const layeredSpecs: LayeredSpec[] = [
  {
    name: 'Layer Snare',
    category: 'Snare',
    tags: ['layered', 'noise', 'parallel filters'],
    one: {
      patch: subtractive(190, 0.16, {
        oscillators: [silent('triangle', 0.7), silent('sine', 0.25, 0, 7)],
        pitchEnvelope: { amount: 12, decay: 0.03 },
      }),
      level: 0.9,
      filterMix: 0,
    },
    two: {
      patch: subtractive(190, 0.24, {
        oscillators: [silent('sine'), silent('triangle')],
        noise: { level: 0.95, type: 'white' },
      }),
      level: 0.75,
      filterMix: 1,
    },
    filters: [
      { mode: 'lowpass', cutoff: 3200, resonance: 0.9, envelopeAmount: 1200 },
      { mode: 'highpass', cutoff: 1400, resonance: 0.8, envelopeAmount: 2600 },
    ],
    filterDecay: 0.1,
  },
  {
    name: 'Knock Kick',
    category: 'Kick',
    tags: ['layered', 'fm click', 'punch'],
    drive: 0.25,
    one: {
      patch: subtractive(50, 0.5, {
        oscillators: [silent('sine', 1), silent('triangle', 0.06, 1)],
        pitchEnvelope: { amount: 46, decay: 0.07 },
      }),
      level: 1,
      filterMix: 0,
    },
    two: {
      patch: fm(160, 0.045, 1, [1, 3.5, 7.2, 11]),
      level: 0.45,
      filterMix: 1,
    },
    filters: [
      { mode: 'lowpass', cutoff: 1100, resonance: 1, envelopeAmount: 600 },
      { mode: 'highpass', cutoff: 900, resonance: 0.7 },
    ],
    filterDecay: 0.08,
  },
  {
    name: 'Ring Clang',
    category: 'Metallic',
    tags: ['layered', 'ring mod', 'metal'],
    reverb: 0.18,
    one: {
      patch: subtractive(420, 0.55, {
        oscillators: [silent('triangle', 1), silent('sine')],
      }),
      level: 1,
      filterMix: 0,
    },
    two: {
      patch: subtractive(613, 0.5, {
        oscillators: [silent('square', 0.8), silent('sine')],
      }),
      level: 0.15,
      filterMix: 0,
    },
    combine: { mode: 'ring', amount: 0.85 },
    filters: [{ mode: 'highpass', cutoff: 380, resonance: 1.2 }],
  },
  {
    name: 'Growl Tom',
    category: 'Tom',
    tags: ['layered', 'engine fm', 'growl'],
    one: {
      patch: subtractive(118, 0.5, {
        pitchEnvelope: { amount: 20, decay: 0.12 },
      }),
      level: 1,
      filterMix: 0,
    },
    two: {
      patch: subtractive(236, 0.35, {
        oscillators: [silent('sine', 1), silent('triangle')],
      }),
      level: 0.1,
      filterMix: 0,
    },
    combine: { mode: 'fm', amount: 0.18 },
    filters: [
      { mode: 'lowpass', cutoff: 2600, resonance: 1.1, envelopeAmount: 1800 },
    ],
    filterDecay: 0.2,
  },
];

function layeredPreset(spec: LayeredSpec): SynthPreset {
  const slot = (index: number, layer: LayeredSpec['one']) => ({
    ...defaultSlot(index, true),
    patch: sourceFromLegacy(layer.patch),
    level: layer.level ?? 1,
    filterMix: layer.filterMix ?? index,
  });
  return {
    ...presetBase(spec),
    voice: {
      engines: [slot(0, spec.one), slot(1, spec.two)],
      utility: defaultUtility(),
      combine: spec.combine ?? { mode: 'layer', amount: 0.5 },
      filters: [
        { ...defaultFilter(true), ...spec.filters[0] },
        spec.filters[1]
          ? { ...defaultFilter(true), ...spec.filters[1] }
          : defaultFilter(false),
      ],
      filterRouting: spec.filterRouting ?? 1,
      filterEnvelope: env(0.001, spec.filterDecay ?? 0.12, 0, 0.03),
      lfos: [
        { shape: 'sine', rate: 5 },
        { shape: 'triangle', rate: 2 },
      ],
      amp: { level: 1, pan: 0, velocity: 1 },
    },
  };
}

function configureMacros(preset: SynthPreset): SynthPreset {
  if (preset.name === 'Deep 808') {
    preset.voice.utility = {
      ...preset.voice.utility,
      enabled: true,
      baseFrequency: 98,
      oscillator: {
        ...preset.voice.utility.oscillator,
        enabled: true,
        waveform: 'sine',
        octave: -1,
        level: 0.18,
      },
      noise: { ...preset.voice.utility.noise, enabled: false },
      ampEnvelope: env(0.001, 0.62, 0, 0.05),
      direct: 1,
    };
  }
  if (preset.name === 'Chrome Snare') {
    preset.voice.utility = {
      ...preset.voice.utility,
      enabled: true,
      oscillator: { ...preset.voice.utility.oscillator, enabled: false },
      noise: { enabled: true, type: 'white', level: 0.14 },
      ampEnvelope: env(0.001, 0.055, 0, 0.02),
      filterMix: 0,
      direct: 1,
    };
  }
  const engines = preset.voice.engines.filter((slot) => slot.enabled);
  const has = (type: 'drive' | 'reverb') =>
    preset.effects.some((effect) => effect.type === type && effect.enabled);
  const body = preset.voice.filters[0].enabled ? 'cutoff' : 'engine1';
  const motion = engines.some((slot) => slot.patch.engine === 'fm')
    ? 'fmIndex'
    : engines.some((slot) => slot.patch.engine === 'additive')
      ? 'spectralTilt'
      : 'pitch';
  preset.modulation.push(
    {
      source: 'macro1',
      destination: body,
      amount: body === 'cutoff' ? 0.28 : 0.12,
    },
    {
      source: 'macro2',
      destination: motion,
      amount: motion === 'pitch' ? 0.035 : 0.3,
    },
    {
      source: 'macro3',
      destination: has('drive') ? 'drive' : 'engine1',
      amount: 0.25,
    },
    {
      source: 'macro4',
      destination: has('reverb') ? 'reverb' : 'pan',
      amount: 0.3,
    },
  );
  return preset;
}

export const FACTORY_PRESETS: readonly SynthPreset[] = deepFreeze(
  [
    ...specs.map((spec) =>
      normalizePreset({
        ...presetBase(spec),
        engineType: spec.patch.engine,
        patch: spec.patch,
      }),
    ),
    ...layeredSpecs.map(layeredPreset),
  ].map(configureMacros),
);

const presetId = (name: string) => `factory-${slug(name)}`;
const kitNames = [
  'Electronic',
  '808',
  '909-inspired',
  'Funk',
  'Hip-Hop',
  'House',
  'Minimal',
  'Synthetic Acoustic',
  'Latin Percussion',
  'Experimental',
  'Neutral Practice Kit',
];
const palettes: Record<string, string[]> = {
  Electronic: [
    'Short Punch',
    'Crush Snare',
    '909 Tight',
    '909 Open',
    'Round Tom',
    'High Tom',
    'Hard Rim',
    'Synthetic Cowbell',
    'Dry Crowd',
    'FM Bell',
    'Sand Shake',
    'Glass Crash',
    'FM Ride',
    'Wood Block',
    'Dub Blip',
    'Sub Drop',
  ],
  '808': [
    'Deep 808',
    'Noise Snare',
    '909 Tight',
    '909 Open',
    'Sub Tom',
    'Round Tom',
    'Hard Rim',
    'Synthetic Cowbell',
    'Wide Clap',
    'FM Bell',
    'Sand Shake',
    'Glass Crash',
    'FM Ride',
    'Bright Clave',
    'Rubber Perc',
    'Sub Drop',
  ],
  '909-inspired': [
    'Warehouse Kick',
    'Crush Snare',
    '909 Tight',
    '909 Open',
    'High Tom',
    'Round Tom',
    'Hard Rim',
    'Synthetic Cowbell',
    'Wide Clap',
    'Tin Hat',
    'Data Rattle',
    'Glass Crash',
    'FM Ride',
    'Digital Clave',
    'Signal Block',
    'Sub Drop',
  ],
  Funk: [
    'Short Punch',
    'Synthetic Acoustic',
    'Dust Hat',
    'Air Hat',
    'High Tom',
    'Round Tom',
    'Hard Rim',
    'Synthetic Cowbell',
    'Dry Crowd',
    'Marimba Wood',
    'Cabasa Wire',
    'Glass Crash',
    'FM Ride',
    'Bright Clave',
    'Wood Block',
    'Rubber Perc',
  ],
  'Hip-Hop': [
    'Deep 808',
    'Noise Snare',
    'Dust Hat',
    'Air Hat',
    'Sub Tom',
    'Round Tom',
    'Hard Rim',
    'Synthetic Cowbell',
    'Dry Crowd',
    'Soft Kalimba',
    'Sand Shake',
    'Glass Crash',
    'FM Ride',
    'Wood Block',
    'Dub Blip',
    'Sub Drop',
  ],
  House: [
    'Warehouse Kick',
    'Wide Clap',
    '909 Tight',
    '909 Open',
    'High Tom',
    'Round Tom',
    'Hard Rim',
    'Synthetic Cowbell',
    'Crush Snare',
    'Vibra Bell',
    'Data Rattle',
    'Glass Crash',
    'FM Ride',
    'Digital Clave',
    'Signal Block',
    'Sub Drop',
  ],
  Minimal: [
    'Short Punch',
    'Crush Snare',
    'Tin Hat',
    'Alien Hat',
    'Spectral Tom',
    'Laser Tom',
    'Hard Rim',
    'Signal Block',
    'Dry Crowd',
    'Crystal Tick',
    'Sand Shake',
    'Wire Pulse',
    'FM Ride',
    'Digital Clave',
    'Dub Blip',
    'Sub Drop',
  ],
  'Synthetic Acoustic': [
    'Soft Practice Kick',
    'Synthetic Acoustic',
    'Dust Hat',
    'Air Hat',
    'High Tom',
    'Round Tom',
    'Hard Rim',
    'Bronze Bowl',
    'Dry Crowd',
    'Marimba Wood',
    'Cabasa Wire',
    'Glass Crash',
    'FM Ride',
    'Hollow Log',
    'Wood Block',
    'Sub Tom',
  ],
  'Latin Percussion': [
    'Short Punch',
    'Synthetic Acoustic',
    'Dust Hat',
    'Air Hat',
    'Round Tom',
    'Sub Tom',
    'Hard Rim',
    'Synthetic Cowbell',
    'Dry Crowd',
    'Marimba Wood',
    'Cabasa Wire',
    'Bronze Bowl',
    'Steel Tongue',
    'Bright Clave',
    'Wood Block',
    'Rubber Perc',
  ],
  Experimental: [
    'Circuit Kick',
    'Chrome Snare',
    'Alien Hat',
    'Glass Crash',
    'Laser Tom',
    'Spectral Tom',
    'Wire Pulse',
    'Cluster Hit',
    'Arcade Zap',
    'Temple Gong',
    'Data Rattle',
    'Bronze Bowl',
    'FM Ride',
    'Digital Clave',
    'Signal Block',
    'Sub Drop',
  ],
  'Neutral Practice Kit': [
    'Soft Practice Kick',
    'Synthetic Acoustic',
    'Dust Hat',
    'Air Hat',
    'Round Tom',
    'High Tom',
    'Hard Rim',
    'Synthetic Cowbell',
    'Dry Crowd',
    'Pure Mallet',
    'Sand Shake',
    'Glass Crash',
    'FM Ride',
    'Bright Clave',
    'Wood Block',
    'Sub Tom',
  ],
};

const labels = [
  'KICK',
  'SNARE',
  'CLOSED',
  'OPEN',
  'TOM LOW',
  'TOM HIGH',
  'RIM',
  'COWBELL',
  'CLAP',
  'MALLET',
  'SHAKER',
  'CRASH',
  'RIDE',
  'CLAVE',
  'PERC',
  'SUB',
];
const keys = [
  '1',
  '2',
  '3',
  '4',
  'q',
  'w',
  'e',
  'r',
  'a',
  's',
  'd',
  'f',
  'z',
  'x',
  'c',
  'v',
];
const colors = ['#31d8ff', '#b7ff2a', '#ff6b35', '#d88cff'];

export const FACTORY_KITS: readonly DrumKit[] = deepFreeze(
  kitNames.map((name) => ({
    id: `kit-${slug(name)}`,
    name,
    description: `${name} synthesis palette`,
    factory: true,
    pads: palettes[name].map((sound, index) => ({
      id: `pad-${index}`,
      label: labels[index],
      presetId: presetId(sound),
      volume: index > 10 ? 0.75 : 0.9,
      pan: index % 3 === 0 ? -0.08 : index % 3 === 2 ? 0.08 : 0,
      tune: 0,
      muted: false,
      color: colors[index % colors.length],
      key: keys[index],
    })),
  })),
);

export function clonePreset(
  preset: SynthPreset,
  name = `${preset.name} Copy`,
): SynthPreset {
  const copy = cloneSerializable(preset);
  return {
    ...copy,
    id: `custom-${slug(name)}-${Date.now()}`,
    name,
    factory: false,
    version: preset.version + 1,
  };
}

export function cloneKit(kit: DrumKit, name = `${kit.name} Copy`): DrumKit {
  const copy = cloneSerializable(kit);
  return {
    ...copy,
    id: `custom-kit-${slug(name)}-${Date.now()}`,
    name,
    factory: false,
  };
}

export function presetById(
  id: string,
  custom: SynthPreset[] = [],
): SynthPreset {
  return (
    custom.find((preset) => preset.id === id) ??
    FACTORY_PRESETS.find((preset) => preset.id === id) ??
    FACTORY_PRESETS[0]
  );
}
