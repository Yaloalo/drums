import { FM_ALGORITHMS } from './synthTopology';
import type {
  AdditivePatch,
  Envelope,
  FMPatch,
  SubtractivePatch,
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

  get currentTime(): number {
    return this.context?.currentTime ?? 0;
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
    preset: SynthPreset,
    tune = 0,
  ): Promise<AudioBuffer> {
    const engine = new AudioEngine();
    const tail = preset.effects.some(
      (effect) => effect.enabled && ['delay', 'reverb'].includes(effect.type),
    )
      ? 1.8
      : 0.06;
    const duration = Math.min(
      8,
      engine.envelopeLength(preset.patch.ampEnvelope) + 0.08 + tail,
    );
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

  trigger(preset: SynthPreset, options: TriggerOptions = {}) {
    if (!this.context || !this.master) return;
    const time = Math.max(
      this.context.currentTime,
      options.time ?? this.context.currentTime,
    );
    const velocity = Math.max(0.02, Math.min(1, options.velocity ?? 0.85));
    if (this.activeVoices.size >= this.maxVoices) this.releaseOldest();
    if (preset.patch.engine === 'subtractive')
      this.triggerSubtractive(preset.patch, preset, time, velocity, options);
    else if (preset.patch.engine === 'fm')
      this.triggerFM(preset.patch, preset, time, velocity, options);
    else this.triggerAdditive(preset.patch, preset, time, velocity, options);
    if (options.padId) {
      const hit = {
        padId: options.padId,
        delay: Math.max(0, time - this.context.currentTime) * 1000,
        duration: this.envelopeLength(preset.patch.ampEnvelope) * 1000,
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

  private triggerSubtractive(
    patch: SubtractivePatch,
    preset: SynthPreset,
    time: number,
    velocity: number,
    options: TriggerOptions,
  ) {
    const context = this.context!;
    const output = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = patch.filter.mode;
    filter.Q.setValueAtTime(patch.filter.resonance, time);
    const cutoff = Math.max(
      40,
      Math.min(
        19000,
        patch.filter.cutoff *
          2 ** (((options.tune ?? 0) / 12) * patch.filter.keyTracking),
      ),
    );
    const filterLevel = (level: number) =>
      Math.max(
        40,
        Math.min(19000, cutoff + patch.filter.envelopeAmount * level),
      );
    const env = patch.filterEnvelope;
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(
      filterLevel(1),
      time + Math.max(0.001, env.attack),
    );
    filter.frequency.exponentialRampToValueAtTime(
      filterLevel(env.sustain),
      time + Math.max(0.001, env.attack) + Math.max(0.005, env.decay),
    );
    filter.frequency.exponentialRampToValueAtTime(
      cutoff,
      time + this.envelopeLength(env),
    );
    this.scheduleEnvelope(
      output.gain,
      patch.ampEnvelope,
      time,
      velocity * (options.volume ?? 1),
    );
    const voice = this.connectVoice(
      filter,
      output,
      preset,
      options.pan ?? 0,
      time,
      this.envelopeLength(patch.ampEnvelope),
    );
    const tuneRatio = 2 ** ((options.tune ?? 0) / 12);

    patch.oscillators.forEach((definition) => {
      if (definition.level <= 0) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = definition.waveform;
      const semitones =
        definition.octave * 12 + definition.semitone + definition.fine / 100;
      const base = patch.baseFrequency * tuneRatio * 2 ** (semitones / 12);
      const pitchStart = base * 2 ** (patch.pitchEnvelope.amount / 12);
      oscillator.frequency.setValueAtTime(Math.max(20, pitchStart), time);
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, base),
        time + Math.max(0.008, patch.pitchEnvelope.decay),
      );
      gain.gain.value = definition.level;
      oscillator.connect(gain).connect(filter);
      oscillator.start(time);
      oscillator.stop(voice.stopAt);
      voice.sources.push(oscillator);
      voice.nodes.push(gain);
    });

    if (patch.noise.level > 0) {
      const noise = context.createBufferSource();
      const gain = context.createGain();
      noise.buffer = this.getNoiseBuffer(patch.noise.type);
      gain.gain.value = patch.noise.level;
      noise.connect(gain).connect(filter);
      noise.start(time);
      noise.stop(voice.stopAt);
      voice.sources.push(noise);
      voice.nodes.push(gain);
    }
    this.attachModulation(
      preset,
      voice,
      {
        pitch: voice.sources
          .filter(
            (source): source is OscillatorNode =>
              source instanceof OscillatorNode,
          )
          .map((oscillator) => oscillator.detune),
        cutoff: [filter.frequency],
        resonance: [filter.Q],
        amplitude: [output.gain],
      },
      time,
      velocity,
    );
    this.trackVoice(voice);
  }

  private triggerFM(
    patch: FMPatch,
    preset: SynthPreset,
    time: number,
    velocity: number,
    options: TriggerOptions,
  ) {
    const context = this.context!;
    const output = context.createGain();
    this.scheduleEnvelope(
      output.gain,
      patch.ampEnvelope,
      time,
      velocity * (options.volume ?? 1),
    );
    const voice = this.connectVoice(
      output,
      output,
      preset,
      options.pan ?? 0,
      time,
      this.envelopeLength(patch.ampEnvelope),
    );
    const oscillators = patch.operators.map((operator) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = Math.max(
        20,
        patch.baseFrequency *
          2 ** ((options.tune ?? 0) / 12) *
          operator.ratio *
          2 ** ((operator.coarse * 12 + operator.fine / 100) / 12),
      );
      return oscillator;
    });
    const topology = FM_ALGORITHMS[patch.algorithm];
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
    const mod = (from: number, to: number) =>
      operatorGains[from].connect(oscillators[to].frequency);
    topology.links.forEach(([from, to]) => mod(from, to));
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
        voice.nodes.push(feedback, feedbackDelay);
      }
      oscillators[index].start(time);
      oscillators[index].stop(voice.stopAt);
    });
    voice.sources.push(...oscillators);
    voice.nodes.push(...operatorGains);
    this.attachModulation(
      preset,
      voice,
      {
        pitch: oscillators.map((oscillator) => oscillator.detune),
        fmIndex: operatorGains
          .filter((_, index) => !topology.carriers.includes(index))
          .map((gain) => gain.gain),
        amplitude: [output.gain],
      },
      time,
      velocity,
    );
    this.trackVoice(voice);
  }

  private triggerAdditive(
    patch: AdditivePatch,
    preset: SynthPreset,
    time: number,
    velocity: number,
    options: TriggerOptions,
  ) {
    const context = this.context!;
    const output = context.createGain();
    this.scheduleEnvelope(
      output.gain,
      patch.ampEnvelope,
      time,
      velocity * (options.volume ?? 1),
    );
    const voice = this.connectVoice(
      output,
      output,
      preset,
      options.pan ?? 0,
      time,
      this.envelopeLength(patch.ampEnvelope),
    );
    const tiltParams: AudioParam[] = [];
    patch.partials.forEach((partial, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const panner = context.createStereoPanner();
      const ratio = partial.ratio + patch.inharmonicity * index * index;
      oscillator.frequency.value = Math.max(
        20,
        patch.baseFrequency * 2 ** ((options.tune ?? 0) / 12) * ratio,
      );
      oscillator.detune.value = partial.detune;
      const tiltGain = context.createGain();
      tiltGain.gain.value = Math.max(
        0.06,
        1 - patch.spectralTilt * index * 0.12,
      );
      if (index > 0) tiltParams.push(tiltGain.gain);
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
      oscillator.stop(voice.stopAt);
      voice.sources.push(oscillator);
      voice.nodes.push(gain, panner, tiltGain);
    });
    this.attachModulation(
      preset,
      voice,
      {
        pitch: voice.sources
          .filter(
            (source): source is OscillatorNode =>
              source instanceof OscillatorNode,
          )
          .map((oscillator) => oscillator.detune),
        amplitude: [output.gain],
        spectralTilt: tiltParams,
      },
      time,
      velocity,
    );
    this.trackVoice(voice);
  }

  private connectVoice(
    input: AudioNode,
    output: GainNode,
    preset: SynthPreset,
    pan: number,
    time: number,
    duration: number,
  ): VoiceNodes {
    const context = this.context!;
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), time);
    const modulationGain = context.createGain();
    modulationGain.gain.value = 1;
    output.connect(modulationGain);
    let tail: AudioNode = modulationGain;
    const nodes: AudioNode[] = [output, panner, modulationGain];
    if (input !== output) input.connect(output);
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
      tail.connect(color).connect(send).connect(this.reverb);
      nodes.push(send, color);
    }
    return {
      sources: [],
      nodes,
      stopAt: time + Math.min(6, Math.max(0.08, duration + 0.08)),
      modulationGain: modulationGain.gain,
      pan: panner.pan,
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
    param.exponentialRampToValueAtTime(
      0.0001,
      time + this.envelopeLength(envelope),
    );
  }

  private envelopeLength(envelope: Envelope) {
    return Math.max(
      0.04,
      envelope.attack +
        envelope.decay +
        envelope.release +
        (envelope.sustain > 0 ? 0.08 : 0),
    );
  }

  private attachModulation(
    preset: SynthPreset,
    voice: VoiceNodes,
    destinations: Partial<Record<string, AudioParam[]>>,
    time: number,
    velocity: number,
  ) {
    const context = this.context!;
    // Volume modulation sits after the amplitude envelope, so it never opens
    // a decaying voice back up or bypasses a pad's volume/mute setting.
    const targets = {
      ...destinations,
      amplitude: [voice.modulationGain],
      level: [voice.modulationGain],
      pan: [voice.pan],
    };
    const scales: Record<string, number> = {
      pitch: 1200,
      cutoff: 5000,
      resonance: 8,
      amplitude: 0.5,
      level: 0.5,
      pan: 1,
      fmIndex: preset.patch.baseFrequency,
      spectralTilt: -0.12,
    };
    const routeSignal = (
      source: AudioScheduledSourceNode,
      destination: string,
      amount: number,
    ) => {
      const params = targets[destination as keyof typeof targets];
      if (!params?.length || amount === 0) return;
      params.forEach((param, index) => {
        const gain = context.createGain();
        gain.gain.value =
          amount *
          (scales[destination] ?? 1) *
          (destination === 'spectralTilt' ? index + 1 : 1);
        source.connect(gain).connect(param);
        voice.nodes.push(gain);
      });
      source.start(time);
      source.stop(voice.stopAt);
      voice.sources.push(source);
    };
    const createLfo = (index: number) => {
      const definition = preset.patch.lfos[index];
      if (!definition) return null;
      const oscillator = context.createOscillator();
      oscillator.type = definition.shape;
      oscillator.frequency.value = definition.rate;
      return oscillator;
    };
    preset.patch.lfos.forEach((definition, index) => {
      if (definition.depth === 0) return;
      const oscillator = createLfo(index)!;
      routeSignal(oscillator, definition.destination, definition.depth);
    });
    preset.modulation.forEach((route) => {
      if (route.amount === 0) return;
      if (route.source === 'lfo1' || route.source === 'lfo2') {
        const oscillator = createLfo(route.source === 'lfo1' ? 0 : 1);
        if (oscillator)
          routeSignal(oscillator, route.destination, route.amount);
        return;
      }
      const source = context.createConstantSource();
      if (route.source === 'ampEnv' || route.source === 'modEnv') {
        const envelope =
          route.source === 'modEnv' && preset.patch.engine === 'subtractive'
            ? preset.patch.filterEnvelope
            : preset.patch.ampEnvelope;
        this.scheduleEnvelope(source.offset, envelope, time, 1);
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
