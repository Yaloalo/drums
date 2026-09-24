import { FM_ALGORITHMS } from './synthTopology';
import { envelopeLength, normalizePreset, voiceLength } from '../model/voice';
import type {
  AdditivePatch,
  Envelope,
  FilterDefinition,
  FMPatch,
  ModulationDestination,
  PitchSweep,
  SubtractivePatch,
  SynthPatch,
  SynthPreset,
} from '../model/types';

interface TriggerOptions {
  padId?: string;
  time?: number;
  velocity?: number;
  tune?: number;
  volume?: number;
  pan?: number;
}

interface VoiceNodes {
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  stopAt: number;
  modulationGain: AudioParam;
  pan: AudioParam;
  effects: Partial<Record<'drive' | 'delay' | 'reverb', Target[]>>;
}

/** A modulation target and how far one unit of modulation moves it. */
interface Target {
  param: AudioParam;
  scale: number;
}

/** One engine slot, rendered up to its own amplitude envelope. */
interface EngineVoice {
  output: GainNode;
  detune: AudioParam[];
  /** Oscillator frequencies another engine may frequency-modulate. */
  frequencies: { param: AudioParam; frequency: number }[];
  fmIndex: Target[];
  tilt: Target[];
}

interface FilterStage {
  input: GainNode;
  output: AudioNode;
  frequency: AudioParam | null;
  q: AudioParam | null;
}

export class AudioEngine {
  private hitListeners = new Set<
    (hit: { padId: string; delay: number; duration: number }) => void
  >();
  private context: AudioContext | OfflineAudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private delay: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayReturn: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbReturn: GainNode | null = null;
  private noiseBuffers = new Map<string, AudioBuffer>();
  private activeVoices = new Set<VoiceNodes>();
  private maxVoices = 48;
  private clicks = new Set<OscillatorNode>();

  /** Scheduled sounds reach the speakers this much later: the master
   * compressor's look-ahead (measured at 6 ms in Chromium). */
  static readonly graphDelay = 0.006;

  get currentTime(): number {
    return this.context?.currentTime ?? 0;
  }

  /**
   * The context time the listener was hearing at a DOM event timestamp.
   * Output latency is taken from the device's own output timestamp, so a hit
   * played in time with what is heard compares fairly with scheduled notes.
   */
  audibleTime(eventTime = performance.now()): number {
    const context = this.context;
    if (!(context instanceof AudioContext)) return this.currentTime;
    const stamp = context.getOutputTimestamp?.();
    if (stamp?.performanceTime && stamp.contextTime !== undefined)
      return stamp.contextTime + (eventTime - stamp.performanceTime) / 1000;
    return (
      context.currentTime -
      (context.outputLatency || 0) -
      (context.baseLatency || 0) -
      (performance.now() - eventTime) / 1000
    );
  }
  get ready(): boolean {
    return this.context?.state === 'running';
  }

  onHit(
    listener: (hit: { padId: string; delay: number; duration: number }) => void,
  ) {
    this.hitListeners.add(listener);
    return () => {
      this.hitListeners.delete(listener);
    };
  }

  async initialize(): Promise<AudioContext> {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.prepareGraph();
    }
    if (!(this.context instanceof AudioContext))
      throw new Error('Preview contexts cannot play live audio.');
    if (this.context.state !== 'running') await this.context.resume();
    return this.context;
  }

  private prepareGraph() {
    if (!this.context) return;
    this.master = this.context.createGain();
    this.master.gain.value = 0.78;
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -8;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 8;
    this.compressor.attack.value = 0.002;
    this.compressor.release.value = 0.12;
    this.master.connect(this.compressor).connect(this.context.destination);

    this.delay = this.context.createDelay(1);
    this.delay.delayTime.value = 0.22;
    this.delayFeedback = this.context.createGain();
    this.delayFeedback.gain.value = 0.28;
    this.delayReturn = this.context.createGain();
    this.delayReturn.gain.value = 0.18;
    this.delay.connect(this.delayFeedback).connect(this.delay);
    this.delay.connect(this.delayReturn).connect(this.master);

    this.reverb = this.context.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.8, 2.7);
    this.reverbReturn = this.context.createGain();
    this.reverbReturn.gain.value = 0.22;
    this.reverb.connect(this.reverbReturn).connect(this.master);
  }

  // Render through the same voices, filters and effects as live hits, without
  // touching the live AudioContext or requiring an audible user gesture.
  static async renderPreview(
    input: SynthPreset,
    tune = 0,
  ): Promise<AudioBuffer> {
    const preset = normalizePreset(input);
    const engine = new AudioEngine();
    const tail = preset.effects.some(
      (effect) => effect.enabled && ['delay', 'reverb'].includes(effect.type),
    )
      ? 1.8
      : 0.06;
    const duration = Math.min(8, voiceLength(preset.voice) + 0.08 + tail);
    const context = new OfflineAudioContext(
      2,
      Math.ceil(duration * 44100),
      44100,
    );
    engine.context = context;
    engine.prepareGraph();
    engine.trigger(preset, { time: 0, velocity: 0.85, tune });
    return context.startRendering();
  }

  setMasterVolume(value: number) {
    if (!this.master || !this.context) return;
    this.master.gain.setTargetAtTime(
      Math.max(0, Math.min(1, value)),
      this.context.currentTime,
      0.015,
    );
  }

  trigger(input: SynthPreset, options: TriggerOptions = {}) {
    if (!this.context || !this.master) return;
    const preset = normalizePreset(input);
    const time = Math.max(
      this.context.currentTime,
      options.time ?? this.context.currentTime,
    );
    const velocity = Math.max(0.02, Math.min(1, options.velocity ?? 0.85));
    if (this.activeVoices.size >= this.maxVoices) this.releaseOldest();
    this.playVoice(preset, time, velocity, options);
    if (options.padId) {
      const hit = {
        padId: options.padId,
        delay: Math.max(0, time - this.context.currentTime) * 1000,
        duration: voiceLength(preset.voice) * 1000,
      };
      this.hitListeners.forEach((listener) => listener(hit));
    }
  }

  click(time: number, accent = false) {
    if (!this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(accent ? 1560 : 1050, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.16 : 0.1, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
    oscillator.connect(gain).connect(this.master);
    this.clicks.add(oscillator);
    oscillator.onended = () => {
      this.clicks.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(time);
    oscillator.stop(time + 0.04);
  }

  cancelClicks() {
    this.clicks.forEach((click) => click.stop());
    this.clicks.clear();
  }

  /*
   * Engine 1 ─┬─ level ─┬─(1 − mix)─▶ Filter 1 ─┬─(1 − routing)─▶ Filter 2 ─┐
   *           │         └─(mix)──────────────────┼───────────────▶ Filter 2 ─┼─▶ Amp ─▶ FX ─▶ out
   * Engine 2 ─┘ (layer, FM or ring into Engine 1) └─(routing)───────────────────┘
   * Utility ───────── filtered mix ────────────────┘  + clean direct feed ─▶ Amp
   */
  private playVoice(
    preset: SynthPreset,
    time: number,
    velocity: number,
    options: TriggerOptions,
  ) {
    const context = this.context!;
    const { voice } = preset;
    const amp = context.createGain();
    const sensitivity = Math.max(0, Math.min(1, voice.amp.velocity));
    amp.gain.setValueAtTime(
      Math.max(
        0.0001,
        voice.amp.level *
          (options.volume ?? 1) *
          (1 - sensitivity + sensitivity * velocity),
      ),
      time,
    );
    const chain = this.connectVoice(
      amp,
      preset,
      Math.max(-1, Math.min(1, (options.pan ?? 0) + voice.amp.pan)),
      time,
      voiceLength(voice),
    );
    const gain = (value: number) => {
      const node = context.createGain();
      node.gain.value = value;
      chain.nodes.push(node);
      return node;
    };
    const tune = options.tune ?? 0;
    const [filterOne, filterTwo] = voice.filters.map((definition) =>
      this.filterStage(definition, voice.filterEnvelope, time, tune, chain),
    );
    const routing = Math.max(0, Math.min(1, voice.filterRouting));
    filterOne.output.connect(gain(1 - routing)).connect(filterTwo.input);
    filterOne.output.connect(gain(routing)).connect(amp);
    filterTwo.output.connect(amp);

    const engines = voice.engines.map((slot) =>
      slot.enabled
        ? this.buildEngine(slot.patch, time, 2 ** (tune / 12), chain)
        : null,
    );
    const levels = voice.engines.map((slot, index) => {
      if (!engines[index]) return null;
      const level = gain(slot.level);
      const mix = Math.max(0, Math.min(1, slot.filterMix));
      level.connect(gain(1 - mix)).connect(filterOne.input);
      level.connect(gain(mix)).connect(filterTwo.input);
      return level;
    });

    // The support layer is intentionally independent of both primary engine
    // slots: it can reinforce a transient/noise band through the filters while
    // preserving a clean sub through its direct feed.
    const utilityPatch: SubtractivePatch | null = voice.utility?.enabled
      ? {
          engine: 'subtractive',
          baseFrequency: voice.utility.baseFrequency,
          oscillators: [
            {
              waveform: voice.utility.oscillator.waveform,
              octave: voice.utility.oscillator.octave,
              semitone: 0,
              fine: 0,
              level: voice.utility.oscillator.enabled
                ? voice.utility.oscillator.level
                : 0,
              phase: 0,
              retrigger: true,
            },
          ],
          noise: {
            level: voice.utility.noise.enabled ? voice.utility.noise.level : 0,
            type: voice.utility.noise.type,
          },
          ampEnvelope: voice.utility.ampEnvelope,
          pitchEnvelope: { amount: 0, decay: 0.05 },
        }
      : null;
    const utilityEngine = utilityPatch
      ? this.buildEngine(utilityPatch, time, 2 ** (tune / 12), chain)
      : null;
    const utilityLevel = utilityEngine ? gain(1) : null;
    if (utilityEngine && utilityLevel) {
      const direct = Math.max(0, Math.min(1, voice.utility.direct));
      const mix = Math.max(0, Math.min(1, voice.utility.filterMix));
      utilityEngine.output.connect(utilityLevel);
      utilityLevel.connect(gain(direct)).connect(amp);
      utilityLevel
        .connect(gain((1 - direct) * (1 - mix)))
        .connect(filterOne.input);
      utilityLevel.connect(gain((1 - direct) * mix)).connect(filterTwo.input);
    }

    const [one, two] = engines;
    const combine: Target[] = [];
    const amount = Math.max(0, Math.min(1, voice.combine.amount));
    if (one && two && voice.combine.mode === 'fm') {
      // Engine 2 bends Engine 1's oscillators at audio rate; depth scales with
      // each oscillator's own frequency so the modulation index is consistent.
      for (const { param, frequency } of one.frequencies) {
        const depth = gain(amount * 2 * frequency);
        two.output.connect(depth).connect(param);
        combine.push({ param: depth.gain, scale: 2 * frequency });
      }
      one.output.connect(levels[0]!);
    } else if (one && two && voice.combine.mode === 'ring') {
      const ring = gain(0);
      const wet = gain(amount);
      one.output.connect(gain(1 - amount)).connect(levels[0]!);
      one.output.connect(ring).connect(wet).connect(levels[0]!);
      two.output.connect(ring.gain);
      combine.push({ param: wet.gain, scale: 1 });
    } else if (one) one.output.connect(levels[0]!);
    if (two) two.output.connect(levels[1]!);

    const cents = (engine: EngineVoice | null) =>
      (engine?.detune ?? []).map((param) => ({ param, scale: 1200 }));
    const level = (node: GainNode | null) =>
      node ? [{ param: node.gain, scale: 1 }] : [];
    const param = (value: AudioParam | null, scale: number) =>
      value ? [{ param: value, scale }] : [];
    this.attachModulation(
      preset,
      chain,
      {
        pitch: [...cents(one), ...cents(two)],
        pitch1: cents(one),
        pitch2: cents(two),
        engine1: level(levels[0]),
        engine2: level(levels[1]),
        utility: level(utilityLevel),
        utilityPitch: cents(utilityEngine),
        combine,
        cutoff: param(filterOne.frequency, 5000),
        resonance: param(filterOne.q, 8),
        cutoff2: param(filterTwo.frequency, 5000),
        resonance2: param(filterTwo.q, 8),
        fmIndex: [...(one?.fmIndex ?? []), ...(two?.fmIndex ?? [])],
        spectralTilt: [...(one?.tilt ?? []), ...(two?.tilt ?? [])],
        ...chain.effects,
      },
      time,
      velocity,
    );
    this.trackVoice(chain);
  }

  private filterStage(
    definition: FilterDefinition,
    envelope: Envelope,
    time: number,
    tune: number,
    chain: VoiceNodes,
  ): FilterStage {
    const context = this.context!;
    const input = context.createGain();
    chain.nodes.push(input);
    if (!definition.enabled)
      return { input, output: input, frequency: null, q: null };
    const filter = context.createBiquadFilter();
    filter.type = definition.mode;
    filter.Q.setValueAtTime(definition.resonance, time);
    const cutoff = Math.max(
      40,
      Math.min(
        19000,
        definition.cutoff * 2 ** ((tune / 12) * definition.keyTracking),
      ),
    );
    const level = (value: number) =>
      Math.max(40, Math.min(19000, cutoff + definition.envelopeAmount * value));
    filter.frequency.setValueAtTime(cutoff, time);
    if (definition.envelopeAmount !== 0) {
      filter.frequency.exponentialRampToValueAtTime(
        level(1),
        time + Math.max(0.001, envelope.attack),
      );
      filter.frequency.exponentialRampToValueAtTime(
        level(envelope.sustain),
        time +
          Math.max(0.001, envelope.attack) +
          Math.max(0.005, envelope.decay),
      );
      filter.frequency.exponentialRampToValueAtTime(
        cutoff,
        time + envelopeLength(envelope),
      );
    }
    input.connect(filter);
    chain.nodes.push(filter);
    return { input, output: filter, frequency: filter.frequency, q: filter.Q };
  }

  private buildEngine(
    patch: SynthPatch,
    time: number,
    tuneRatio: number,
    chain: VoiceNodes,
  ): EngineVoice {
    const output = this.context!.createGain();
    this.scheduleEnvelope(output.gain, patch.ampEnvelope, time, 1);
    chain.nodes.push(output);
    if (patch.engine === 'fm')
      return this.buildFM(patch, output, time, tuneRatio, chain);
    if (patch.engine === 'additive')
      return this.buildAdditive(patch, output, time, tuneRatio, chain);
    return this.buildAnalog(patch, output, time, tuneRatio, chain);
  }

  private sweep(
    param: AudioParam,
    frequency: number,
    sweep: PitchSweep | undefined,
    time: number,
  ) {
    const base = Math.max(20, frequency);
    if (!sweep?.amount) {
      param.setValueAtTime(base, time);
      return;
    }
    param.setValueAtTime(Math.max(20, base * 2 ** (sweep.amount / 12)), time);
    param.exponentialRampToValueAtTime(
      base,
      time + Math.max(0.008, sweep.decay),
    );
  }

  private buildAnalog(
    patch: SubtractivePatch,
    output: GainNode,
    time: number,
    tuneRatio: number,
    chain: VoiceNodes,
  ): EngineVoice {
    const context = this.context!;
    const engine: EngineVoice = {
      output,
      detune: [],
      frequencies: [],
      fmIndex: [],
      tilt: [],
    };
    patch.oscillators.forEach((definition) => {
      if (definition.level <= 0) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = definition.waveform;
      const semitones =
        definition.octave * 12 + definition.semitone + definition.fine / 100;
      const base = patch.baseFrequency * tuneRatio * 2 ** (semitones / 12);
      this.sweep(oscillator.frequency, base, patch.pitchEnvelope, time);
      gain.gain.value = definition.level;
      oscillator.connect(gain).connect(output);
      oscillator.start(time);
      oscillator.stop(chain.stopAt);
      chain.sources.push(oscillator);
      chain.nodes.push(gain);
      engine.detune.push(oscillator.detune);
      engine.frequencies.push({ param: oscillator.frequency, frequency: base });
    });
    if (patch.noise.level > 0) {
      const noise = context.createBufferSource();
      const gain = context.createGain();
      noise.buffer = this.getNoiseBuffer(patch.noise.type);
      gain.gain.value = patch.noise.level;
      noise.connect(gain).connect(output);
      noise.start(time);
      noise.stop(chain.stopAt);
      chain.sources.push(noise);
      chain.nodes.push(gain);
    }
    return engine;
  }

  private buildFM(
    patch: FMPatch,
    output: GainNode,
    time: number,
    tuneRatio: number,
    chain: VoiceNodes,
  ): EngineVoice {
    const context = this.context!;
    const topology = FM_ALGORITHMS[patch.algorithm];
    const frequencies = patch.operators.map(
      (operator) =>
        patch.baseFrequency *
        tuneRatio *
        operator.ratio *
        2 ** ((operator.coarse * 12 + operator.fine / 100) / 12),
    );
    const oscillators = frequencies.map((frequency) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      this.sweep(oscillator.frequency, frequency, patch.pitchEnvelope, time);
      return oscillator;
    });
    const operatorGains = patch.operators.map((operator, index) => {
      const gain = context.createGain();
      this.scheduleEnvelope(
        gain.gain,
        operator.envelope,
        time,
        operator.level *
          (topology.carriers.includes(index)
            ? 1 / topology.carriers.length
            : patch.baseFrequency),
      );
      oscillators[index].connect(gain);
      return gain;
    });
    topology.links.forEach(([from, to]) =>
      operatorGains[from].connect(oscillators[to].frequency),
    );
    topology.carriers.forEach((index) => operatorGains[index].connect(output));
    patch.operators.forEach((operator, index) => {
      if (operator.feedback > 0) {
        const feedback = context.createGain();
        feedback.gain.value = operator.feedback * patch.baseFrequency;
        const feedbackDelay = context.createDelay(1);
        feedbackDelay.delayTime.value = 1 / context.sampleRate;
        oscillators[index]
          .connect(feedbackDelay)
          .connect(feedback)
          .connect(oscillators[index].frequency);
        chain.nodes.push(feedback, feedbackDelay);
      }
      oscillators[index].start(time);
      oscillators[index].stop(chain.stopAt);
    });
    chain.sources.push(...oscillators);
    chain.nodes.push(...operatorGains);
    return {
      output,
      detune: oscillators.map((oscillator) => oscillator.detune),
      frequencies: topology.carriers.map((index) => ({
        param: oscillators[index].frequency,
        frequency: frequencies[index],
      })),
      fmIndex: operatorGains
        .filter((_, index) => !topology.carriers.includes(index))
        .map((gain) => ({ param: gain.gain, scale: patch.baseFrequency })),
      tilt: [],
    };
  }

  private buildAdditive(
    patch: AdditivePatch,
    output: GainNode,
    time: number,
    tuneRatio: number,
    chain: VoiceNodes,
  ): EngineVoice {
    const context = this.context!;
    const engine: EngineVoice = {
      output,
      detune: [],
      frequencies: [],
      fmIndex: [],
      tilt: [],
    };
    patch.partials.forEach((partial, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const panner = context.createStereoPanner();
      const ratio = partial.ratio + patch.inharmonicity * index * index;
      const frequency = patch.baseFrequency * tuneRatio * ratio;
      this.sweep(oscillator.frequency, frequency, patch.pitchEnvelope, time);
      oscillator.detune.value = partial.detune;
      const tiltGain = context.createGain();
      tiltGain.gain.value = Math.max(
        0.06,
        1 - patch.spectralTilt * index * 0.12,
      );
      if (index > 0)
        engine.tilt.push({ param: tiltGain.gain, scale: -0.12 * index });
      gain.gain.setValueAtTime(Math.max(0.0001, partial.amplitude), time);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        time + Math.max(0.03, partial.decay),
      );
      panner.pan.value = Math.max(
        -1,
        Math.min(
          1,
          ((index % 2 ? 1 : -1) * patch.spread * index) / patch.partials.length,
        ),
      );
      oscillator
        .connect(gain)
        .connect(tiltGain)
        .connect(panner)
        .connect(output);
      oscillator.start(time);
      oscillator.stop(chain.stopAt);
      chain.sources.push(oscillator);
      chain.nodes.push(gain, panner, tiltGain);
      engine.detune.push(oscillator.detune);
      engine.frequencies.push({ param: oscillator.frequency, frequency });
    });
    return engine;
  }

  private connectVoice(
    output: GainNode,
    preset: SynthPreset,
    pan: number,
    time: number,
    duration: number,
  ): VoiceNodes {
    const context = this.context!;
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(pan, time);
    const modulationGain = context.createGain();
    modulationGain.gain.value = 1;
    output.connect(modulationGain);
    let tail: AudioNode = modulationGain;
    const nodes: AudioNode[] = [output, panner, modulationGain];
    const effectTargets: VoiceNodes['effects'] = {};
    for (const effect of preset.effects.filter(
      (item) =>
        item.enabled && ['drive', 'bitcrush', 'compressor'].includes(item.type),
    )) {
      let processor: AudioNode;
      if (effect.type === 'compressor') {
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -6 - effect.amount * 34;
        compressor.ratio.value = 1 + effect.amount * 11;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.1;
        processor = compressor;
      } else {
        const shaper = context.createWaveShaper();
        if (effect.type === 'drive') {
          shaper.curve = this.driveCurve(1 + effect.amount * 18);
          shaper.oversample = '2x';
        } else {
          const levels = 2 ** Math.round(12 - effect.amount * 10);
          shaper.curve = Float32Array.from(
            { length: 4096 },
            (_, i) => Math.round(((i / 4095) * 2 - 1) * levels) / levels,
          );
        }
        processor = shaper;
      }
      const dry = context.createGain();
      const wet = context.createGain();
      const mix = context.createGain();
      dry.gain.value = 1 - effect.mix;
      wet.gain.value = effect.mix;
      if (effect.type === 'drive')
        effectTargets.drive = [{ param: wet.gain, scale: 0.65 }];
      tail.connect(dry).connect(mix);
      tail.connect(processor).connect(wet).connect(mix);
      tail = mix;
      nodes.push(processor, dry, wet, mix);
    }
    tail.connect(panner).connect(this.master!);
    const delayDefinition = preset.effects.find(
      (effect) => effect.type === 'delay' && effect.enabled,
    );
    if (delayDefinition && this.delay) {
      const send = context.createGain();
      const color = context.createBiquadFilter();
      color.frequency.value = 600 + delayDefinition.amount * 15000;
      send.gain.value = delayDefinition.mix;
      effectTargets.delay = [{ param: send.gain, scale: 0.8 }];
      tail.connect(color).connect(send).connect(this.delay);
      nodes.push(send, color);
    }
    const reverbDefinition = preset.effects.find(
      (effect) => effect.type === 'reverb' && effect.enabled,
    );
    if (reverbDefinition && this.reverb) {
      const send = context.createGain();
      const color = context.createBiquadFilter();
      color.frequency.value = 600 + reverbDefinition.amount * 15000;
      send.gain.value = reverbDefinition.mix;
      effectTargets.reverb = [{ param: send.gain, scale: 0.8 }];
      tail.connect(color).connect(send).connect(this.reverb);
      nodes.push(send, color);
    }
    return {
      sources: [],
      nodes,
      stopAt: time + Math.min(6, Math.max(0.08, duration + 0.08)),
      modulationGain: modulationGain.gain,
      pan: panner.pan,
      effects: effectTargets,
    };
  }

  private scheduleEnvelope(
    param: AudioParam,
    envelope: Envelope,
    time: number,
    peak: number,
  ) {
    const safePeak = Math.max(0.0001, peak);
    param.cancelScheduledValues(time);
    param.setValueAtTime(0.0001, time);
    param.linearRampToValueAtTime(
      safePeak,
      time + Math.max(0.001, envelope.attack),
    );
    param.exponentialRampToValueAtTime(
      Math.max(0.0001, safePeak * Math.max(0.0001, envelope.sustain)),
      time + envelope.attack + Math.max(0.005, envelope.decay),
    );
    param.exponentialRampToValueAtTime(0.0001, time + envelopeLength(envelope));
  }

  private attachModulation(
    preset: SynthPreset,
    voice: VoiceNodes,
    destinations: Partial<Record<ModulationDestination, Target[]>>,
    time: number,
    velocity: number,
  ) {
    const context = this.context!;
    // Volume modulation sits after the amplitude envelopes, so it never opens
    // a decaying voice back up or bypasses a pad's volume/mute setting.
    const volume = [{ param: voice.modulationGain, scale: 0.5 }];
    const targets: Partial<Record<ModulationDestination, Target[]>> = {
      ...destinations,
      amplitude: volume,
      level: volume,
      pan: [{ param: voice.pan, scale: 1 }],
    };
    const routeSignal = (
      source: AudioScheduledSourceNode,
      destination: ModulationDestination,
      amount: number,
    ) => {
      const params = targets[destination];
      if (!params?.length || amount === 0) return;
      params.forEach(({ param, scale }) => {
        const gain = context.createGain();
        gain.gain.value = amount * scale;
        source.connect(gain).connect(param);
        voice.nodes.push(gain);
      });
      source.start(time);
      source.stop(voice.stopAt);
      voice.sources.push(source);
    };
    const { lfos, engines, filterEnvelope } = preset.voice;
    preset.modulation.forEach((route) => {
      if (route.amount === 0) return;
      if (route.source === 'lfo1' || route.source === 'lfo2') {
        const definition = lfos[route.source === 'lfo1' ? 0 : 1];
        const oscillator = context.createOscillator();
        oscillator.type = definition.shape;
        oscillator.frequency.value = definition.rate;
        routeSignal(oscillator, route.destination, route.amount);
        return;
      }
      const source = context.createConstantSource();
      if (route.source === 'ampEnv' || route.source === 'modEnv') {
        const envelope =
          route.source === 'modEnv'
            ? filterEnvelope
            : engines[0].patch.ampEnvelope;
        this.scheduleEnvelope(source.offset, envelope, time, 1);
      } else if (route.source.startsWith('macro')) {
        const index = Number(route.source.slice(-1)) - 1;
        source.offset.value = Math.max(
          0,
          Math.min(1, preset.macros[index]?.value ?? 0),
        );
      } else {
        source.offset.value =
          route.source === 'random' ? Math.random() * 2 - 1 : velocity - 1;
      }
      routeSignal(source, route.destination, route.amount);
    });
  }

  private trackVoice(voice: VoiceNodes) {
    if (this.context instanceof OfflineAudioContext) return;
    this.activeVoices.add(voice);
    const delay = Math.max(10, (voice.stopAt - this.currentTime + 0.1) * 1000);
    window.setTimeout(() => {
      voice.sources.forEach((source) => {
        try {
          source.disconnect();
        } catch {}
      });
      voice.nodes.forEach((node) => {
        try {
          node.disconnect();
        } catch {}
      });
      this.activeVoices.delete(voice);
    }, delay);
  }

  private releaseOldest() {
    const oldest = this.activeVoices.values().next().value as
      | VoiceNodes
      | undefined;
    if (!oldest) return;
    oldest.sources.forEach((source) => {
      try {
        source.stop();
      } catch {}
    });
    this.activeVoices.delete(oldest);
  }

  private getNoiseBuffer(type: string) {
    const existing = this.noiseBuffers.get(type);
    if (existing) return existing;
    const context = this.context!;
    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      if (type === 'pink') {
        previous = 0.98 * previous + 0.02 * white;
        data[index] = previous * 3.2;
      } else if (type === 'metal')
        data[index] =
          Math.sign(
            Math.sin(index * 0.73) + Math.sin(index * 1.17) + white * 0.4,
          ) * 0.65;
      else data[index] = white;
    }
    this.noiseBuffers.set(type, buffer);
    return buffer;
  }

  private makeImpulse(seconds: number, decay: number) {
    const context = this.context!;
    const length = context.sampleRate * seconds;
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < length; index += 1)
        data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** decay;
    }
    return impulse;
  }

  private driveCurve(amount: number) {
    const samples = 1024;
    const curve = new Float32Array(samples);
    for (let index = 0; index < samples; index += 1) {
      const x = (index * 2) / samples - 1;
      curve[index] =
        ((3 + amount) * x * 20 * Math.PI) /
        180 /
        (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }
}

export const audioEngine = new AudioEngine();
