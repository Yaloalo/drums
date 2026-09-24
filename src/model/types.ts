export type SynthEngineType = 'subtractive' | 'fm' | 'additive';
export type Waveform = OscillatorType | 'noise';
export type FilterMode = 'lowpass' | 'highpass' | 'bandpass' | 'notch';
export type LfoShape = 'sine' | 'triangle' | 'sawtooth' | 'square';
/** How Engine 2 joins Engine 1: summed, as an audio-rate pitch modulator, or as a ring modulator. */
export type CombineMode = 'layer' | 'fm' | 'ring';
export type ModulationSource =
  | 'lfo1'
  | 'lfo2'
  | 'ampEnv'
  | 'modEnv'
  | 'velocity'
  | 'random'
  | 'macro1'
  | 'macro2'
  | 'macro3'
  | 'macro4';
export type ModulationDestination =
  | 'pitch'
  | 'pitch1'
  | 'pitch2'
  | 'level'
  | 'amplitude'
  | 'pan'
  | 'engine1'
  | 'engine2'
  | 'utility'
  | 'utilityPitch'
  | 'combine'
  | 'cutoff'
  | 'resonance'
  | 'cutoff2'
  | 'resonance2'
  | 'fmIndex'
  | 'spectralTilt';

export interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/** A pitch drop from `amount` semitones above the base pitch, over `decay` seconds. */
export interface PitchSweep {
  amount: number;
  decay: number;
}

export interface OscillatorDefinition {
  waveform: Exclude<Waveform, 'noise'>;
  octave: number;
  semitone: number;
  fine: number;
  level: number;
  phase: number;
  retrigger: boolean;
}

export interface LFO {
  shape: LfoShape;
  rate: number;
}

export interface ModulationRoute {
  source: ModulationSource;
  destination: ModulationDestination;
  amount: number;
}

export interface EffectDefinition {
  type: 'drive' | 'bitcrush' | 'compressor' | 'delay' | 'reverb';
  enabled: boolean;
  mix: number;
  amount: number;
  time?: number;
  feedback?: number;
}

export interface SubtractivePatch {
  engine: 'subtractive';
  baseFrequency: number;
  oscillators: OscillatorDefinition[];
  noise: { level: number; type: 'white' | 'pink' | 'metal' };
  ampEnvelope: Envelope;
  pitchEnvelope: PitchSweep;
}

export interface FMOperator {
  ratio: number;
  coarse: number;
  fine: number;
  level: number;
  feedback: number;
  envelope: Envelope;
}

export interface FMPatch {
  engine: 'fm';
  baseFrequency: number;
  algorithm: 1 | 2 | 3 | 4 | 5 | 6;
  operators: FMOperator[];
  ampEnvelope: Envelope;
  pitchEnvelope: PitchSweep;
}

export interface AdditivePartial {
  ratio: number;
  amplitude: number;
  decay: number;
  detune: number;
}

export interface AdditivePatch {
  engine: 'additive';
  baseFrequency: number;
  partials: AdditivePartial[];
  ampEnvelope: Envelope;
  pitchEnvelope: PitchSweep;
  spectralTilt: number;
  inharmonicity: number;
  spread: number;
}

/** The sound source of one engine slot, including its own amplitude envelope. */
export type SynthPatch = SubtractivePatch | FMPatch | AdditivePatch;

export interface EngineSlot {
  enabled: boolean;
  patch: SynthPatch;
  level: number;
  /** 0 sends the engine to Filter 1 only, 1 to Filter 2 only. */
  filterMix: number;
  /** Edits for the other engine types, recalled when this slot switches back. */
  drafts?: Partial<Record<SynthEngineType, SynthPatch>>;
}

export interface FilterDefinition {
  enabled: boolean;
  mode: FilterMode;
  cutoff: number;
  resonance: number;
  envelopeAmount: number;
  keyTracking: number;
}

/** Pigments-style always-available support layer for sub weight and attack noise. */
export interface UtilitySource {
  enabled: boolean;
  baseFrequency: number;
  oscillator: {
    enabled: boolean;
    waveform: Exclude<Waveform, 'noise'>;
    octave: number;
    level: number;
  };
  noise: {
    enabled: boolean;
    type: 'white' | 'pink' | 'metal';
    level: number;
  };
  ampEnvelope: Envelope;
  /** 0 sends the source to Filter 1, 1 to Filter 2. */
  filterMix: number;
  /** A parallel clean feed around both filters; useful for preserving a sub. */
  direct: number;
}

/** Two engine slots feed two filters, then the amp and the effects. */
export interface VoiceArchitecture {
  engines: [EngineSlot, EngineSlot];
  utility: UtilitySource;
  combine: { mode: CombineMode; amount: number };
  filters: [FilterDefinition, FilterDefinition];
  /** 0 = series (Filter 1 feeds Filter 2), 1 = parallel. */
  filterRouting: number;
  filterEnvelope: Envelope;
  lfos: [LFO, LFO];
  amp: { level: number; pan: number; velocity: number };
}

export interface MacroMapping {
  name: string;
  destination: string;
  min: number;
  max: number;
  /** Performance position. Macro routes use this as a 0…1 modulation source. */
  value?: number;
}

export interface SynthPreset {
  id: string;
  name: string;
  category: string;
  tags: string[];
  factory: boolean;
  voice: VoiceArchitecture;
  modulation: ModulationRoute[];
  effects: EffectDefinition[];
  macros: MacroMapping[];
  version: number;
}

export interface DrumPad {
  id: string;
  label: string;
  presetId: string;
  volume: number;
  pan: number;
  tune: number;
  muted: boolean;
  color: string;
  key: string;
}

export interface DrumKit {
  id: string;
  name: string;
  description: string;
  factory: boolean;
  pads: DrumPad[];
}

export interface PatternStep {
  active: boolean;
  velocity: number;
  accent: boolean;
  probability: number;
  microtiming: number;
}

export interface PatternTrack {
  padId: string;
  steps: PatternStep[];
  muted: boolean;
}

export interface Pattern {
  id: string;
  name: string;
  bars: number;
  beatsPerBar: number;
  beatUnit: number;
  subdivision: number;
  stepsPerBar: number;
  tracks: PatternTrack[];
  factory: boolean;
}

export interface RhythmPreset {
  id: string;
  title: string;
  meter: string;
  bpm: number;
  difficulty: number;
  kitRecommendation: string;
  tags: string[];
  concepts: string[];
  explanation: string;
  pattern: Pattern;
}

export type ExerciseSkill =
  | 'pulse'
  | 'subdivision'
  | 'accents'
  | 'rests'
  | 'syncopation'
  | 'coordination'
  | 'grooves'
  | 'rudiments'
  | 'fills'
  | 'meters'
  | 'triplets'
  | 'polyrhythm'
  | 'tempo'
  | 'latin';

export type ExerciseStyle =
  | 'fundamentals'
  | 'rock'
  | 'funk'
  | 'hip-hop'
  | 'dance'
  | 'latin'
  | 'jazz-blues'
  | 'world';

/** One pad the player plays, on sixteenth-note steps across the exercise's bars. */
export interface ExercisePart {
  pad: number;
  steps: number[];
}

export interface Exercise {
  id: string;
  title: string;
  /** One line shown in the list. */
  summary: string;
  /** What to do, in order; shown in the detail view and during practice. */
  instructions: string[];
  tip?: string;
  skill: ExerciseSkill;
  style: ExerciseStyle;
  difficulty: 1 | 2 | 3 | 4 | 5;
  beatsPerBar: number;
  beatUnit: number;
  bars: number;
  bpm: number;
  bpmRange: [number, number];
  parts: ExercisePart[];
  /** Drum machine preset that plays along; the exercise's own pads are muted in it. */
  backing: string | null;
  /** Click and backing play `play` bars, then drop out for `silent` bars. */
  gap?: { play: number; silent: number };
}

export interface ExerciseHit {
  padIndex: number;
  /** Audio-context time at which the player heard their hit. */
  time: number;
  velocity: number;
}

export type Strictness = 'relaxed' | 'normal' | 'strict';
export type GuideMode = 'off' | 'lights' | 'sound';

/** Choices made in an exercise's setup before practising. */
export interface PracticeOptions {
  bpm: number;
  /** Seconds; null practises until stopped. */
  duration: number | null;
  /** Rhythm preset id, or null for click only. */
  backing: string | null;
  click: boolean;
  countInBars: number;
  strictness: Strictness;
  guide: GuideMode;
}

export interface AttemptStats {
  expected: number;
  perfect: number;
  good: number;
  ok: number;
  early: number;
  late: number;
  missed: number;
  extra: number;
  wrongPad: number;
  accuracy: number;
  meanAbsMs: number;
  spreadMs: number;
  bestStreak: number;
  toleranceMs: number;
  histogram: { from: number; to: number; count: number }[];
  bars: {
    bar: number;
    expected: number;
    score: number;
    offsetMs: number | null;
    silent: boolean;
  }[];
  pads: {
    pad: number;
    expected: number;
    hit: number;
    offsetMs: number | null;
    meanAbsMs: number | null;
  }[];
}

export interface ExerciseAttempt {
  id: string;
  exerciseId: string;
  startedAt: number;
  completedAt: number;
  score: number;
  averageErrorMs: number;
  consistencyMs: number;
  biasMs: number;
  missed: number;
  extra: number;
  wrongPad: number;
  feedback: string;
  /** Present on attempts recorded since sessions gained timers and statistics. */
  grade?: string;
  bpm?: number;
  durationSec?: number;
  options?: PracticeOptions;
  stats?: AttemptStats;
  insights?: string[];
}

/** What the metronome plays on one beat of the bar. */
export type ClickLevel = 'accent' | 'normal' | 'off';

export interface TransportState {
  bpm: number;
  playing: boolean;
  paused: boolean;
  loop: boolean;
  swing: number;
  metronome: boolean;
  metronomeBeat?: number;
  /** Per-beat click levels; missing beats use the default (accent on 1). */
  clickLevels: ClickLevel[];
  countIn: number;
  currentStep: number;
}

export interface AppSettings {
  masterVolume: number;
  haptics: boolean;
  padVelocity: number;
  lastArea: string;
}

export const emptyStep = (): PatternStep => ({ active: false, velocity: 0.82, accent: false, probability: 1, microtiming: 0 });

export function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
  }
  return value;
}
