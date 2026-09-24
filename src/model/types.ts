export type SynthEngineType = 'subtractive' | 'fm' | 'additive';
export type Waveform = OscillatorType | 'noise';
export type FilterMode = 'lowpass' | 'highpass' | 'bandpass';
export type LfoShape = 'sine' | 'triangle' | 'sawtooth' | 'square';
export type ModulationSource = 'lfo1' | 'lfo2' | 'ampEnv' | 'modEnv' | 'velocity' | 'random';
export type ModulationDestination = 'pitch' | 'level' | 'cutoff' | 'resonance' | 'pan' | 'amplitude' | 'fmIndex' | 'spectralTilt';

export interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
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
  depth: number;
  sync: boolean;
  destination: ModulationDestination;
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
  filter: { mode: FilterMode; cutoff: number; resonance: number; envelopeAmount: number; keyTracking: number };
  ampEnvelope: Envelope;
  filterEnvelope: Envelope;
  pitchEnvelope: { amount: number; decay: number };
  lfos: LFO[];
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
  lfos: LFO[];
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
  spectralTilt: number;
  inharmonicity: number;
  spread: number;
  lfos: LFO[];
}

export type SynthPatch = SubtractivePatch | FMPatch | AdditivePatch;

export interface MacroMapping {
  name: string;
  destination: string;
  min: number;
  max: number;
}

export interface SynthPreset {
  id: string;
  name: string;
  category: string;
  tags: string[];
  factory: boolean;
  engineType: SynthEngineType;
  patch: SynthPatch;
  /** Inactive engine drafts are retained, not layered into the active voice. */
  engineDrafts?: Partial<Record<SynthEngineType, SynthPatch>>;
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

export type ExerciseMode = 'perform' | 'imitate' | 'recognize' | 'reconstruct' | 'polyrhythm';

export interface Exercise {
  id: string;
  title: string;
  explanation: string;
  category: string;
  difficulty: number;
  bpm: number;
  bpmRange: [number, number];
  meter: string;
  bars: number;
  kitPresetId: string;
  rhythmPresetId: string;
  targetPads: number[];
  targetSteps: number[];
  interactionMode: ExerciseMode;
  countIn: number;
  metronome: { enabled: boolean; gapEvery?: number; silentBars?: number };
  toleranceMs: number;
  hints: string[];
  progression: { stage: number; prerequisite?: string };
}

export interface ExerciseHit {
  padIndex: number;
  time: number;
  velocity: number;
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
}

export interface UserProgress {
  completed: Record<string, number>;
  attempts: ExerciseAttempt[];
  favorites: string[];
}

export interface TransportState {
  bpm: number;
  playing: boolean;
  paused: boolean;
  loop: boolean;
  swing: number;
  metronome: boolean;
  metronomeBeat?: number;
  recording: boolean;
  overdub: boolean;
  quantize: boolean;
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
