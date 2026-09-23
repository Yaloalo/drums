import { audioEngine } from '../audio/AudioEngine';
import type { Pattern, TransportState } from '../model/types';
import { secondsPerStep, shouldPlayStep } from './timing';

type StateListener = (state: TransportState) => void;
type StepTrigger = (padId: string, velocity: number, time: number) => void;

export class TransportService {
  private state: TransportState = {
    bpm: 112, playing: false, paused: false, loop: true, swing: .06, metronome: false,
    recording: false, overdub: true, quantize: true, countIn: 0, currentStep: 0,
  };
  private patternGetter: () => Pattern;
  private trigger: StepTrigger;
  private listeners = new Set<StateListener>();
  private timer: number | null = null;
  private nextStep = 0;
  private nextStepTime = 0;
  private lookAheadSeconds = .12;
  private schedulerIntervalMs = 24;

  constructor(patternGetter: () => Pattern, trigger: StepTrigger) {
    this.patternGetter = patternGetter;
    this.trigger = trigger;
  }

  subscribe(listener: StateListener) { this.listeners.add(listener); listener(this.state); return () => { this.listeners.delete(listener); }; }
  get snapshot() { return this.state; }

  update(patch: Partial<TransportState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  async play() {
    await audioEngine.initialize();
    if (this.state.playing && !this.state.paused) return;
    const contextTime = audioEngine.currentTime;
    this.nextStep = this.state.paused ? this.state.currentStep : 0;
    this.nextStepTime = contextTime + .055;
    this.update({ playing: true, paused: false });
    this.timer = window.setInterval(() => this.scheduleWindow(), this.schedulerIntervalMs);
    this.scheduleWindow();
  }

  pause() {
    if (!this.state.playing) return;
    this.stopTimer();
    this.update({ playing: false, paused: true });
  }

  stop() {
    this.stopTimer();
    this.nextStep = 0;
    this.update({ playing: false, paused: false, currentStep: 0, recording: false });
  }

  toggle() { return this.state.playing ? (this.pause(), Promise.resolve()) : this.play(); }

  destroy() { this.stopTimer(); this.listeners.clear(); }

  private scheduleWindow() {
    if (!this.state.playing) return;
    const pattern = this.patternGetter();
    const length = Math.max(1, pattern.bars * pattern.stepsPerBar);
    const duration = secondsPerStep(this.state.bpm, pattern.subdivision);
    while (this.nextStepTime < audioEngine.currentTime + this.lookAheadSeconds) {
      const scheduledTime = this.nextStepTime;
      pattern.tracks.forEach((track) => {
        const step = track.steps[this.nextStep];
        if (!track.muted && step && shouldPlayStep(step)) this.trigger(track.padId, step.accent ? 1 : step.velocity, scheduledTime + step.microtiming / 1000);
      });
      if (this.state.metronome && this.nextStep % Math.max(1, pattern.subdivision / 4) === 0) audioEngine.click(scheduledTime, this.nextStep % pattern.stepsPerBar === 0);
      this.update({ currentStep: this.nextStep });
      this.nextStep += 1;
      this.nextStepTime += duration * (this.nextStep % 2 === 1 ? 1 + this.state.swing : 1 - this.state.swing);
      if (this.nextStep >= length) {
        if (this.state.loop) this.nextStep = 0;
        else { this.stop(); break; }
      }
    }
  }

  private stopTimer() { if (this.timer !== null) window.clearInterval(this.timer); this.timer = null; }
  private emit() { this.listeners.forEach((listener) => listener(this.state)); }
}
