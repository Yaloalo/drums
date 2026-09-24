import { audioEngine } from '../audio/AudioEngine';
import type { Pattern, TransportState } from '../model/types';
import { secondsPerStep, shouldPlayStep, swingOffset } from './timing';
import { clickLevelsFor, MetronomeClock } from './MetronomeClock';

type StateListener = (state: TransportState) => void;
type StepTrigger = (padId: string, velocity: number, time: number) => void;

export class TransportService {
  private state: TransportState = {
    bpm: 112,
    playing: false,
    paused: false,
    loop: true,
    swing: 0.06,
    metronome: false,
    clickLevels: [],
    countIn: 0,
    currentStep: 0,
  };
  private patternGetter: () => Pattern;
  private trigger: StepTrigger;
  private listeners = new Set<StateListener>();
  private timer: number | null = null;
  private nextStep = 0;
  private nextStepTime = 0;
  private lookAheadSeconds = 0.12;
  private schedulerIntervalMs = 24;
  private clickClock = new MetronomeClock();
  private clickVisuals = new Set<number>();
  private playGeneration = 0;
  private clickGeneration = 0;
  /** Audio time of step 0 of the current run, after any count-in. */
  private runStart = 0;
  private absoluteStep = 0;
  /** Returns false for bars in which pattern and click stay silent. */
  private gate: ((bar: number) => boolean) | null = null;

  constructor(patternGetter: () => Pattern, trigger: StepTrigger) {
    this.patternGetter = patternGetter;
    this.trigger = trigger;
  }

  subscribe(listener: StateListener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
  get snapshot() {
    return this.state;
  }
  get runStartTime() {
    return this.runStart;
  }

  setGate(gate: ((bar: number) => boolean) | null) {
    this.gate = gate;
  }

  update(patch: Partial<TransportState>) {
    const tempoChanged =
      patch.bpm !== undefined && patch.bpm !== this.state.bpm;
    const enablingClick = patch.metronome === true && !this.state.metronome;
    const disablingClick = patch.metronome === false && this.state.metronome;
    this.state = { ...this.state, ...patch };
    if (tempoChanged && this.state.playing && this.state.metronome) {
      this.clearClicks();
      this.syncClickClock();
    }
    if (disablingClick) this.clearClicks();
    if (enablingClick) {
      const generation = ++this.clickGeneration;
      void audioEngine
        .initialize()
        .then(() => {
          if (!this.state.metronome || generation !== this.clickGeneration)
            return;
          this.syncClickClock();
          this.startTimer();
          this.scheduleWindow();
        })
        .catch(() => {
          this.state = { ...this.state, metronome: false };
          this.emit();
        });
    }
    if (!this.state.metronome && !this.state.playing) this.stopTimer();
    this.emit();
  }

  /** Starts or resumes; a fresh start can be preceded by bars of count-in clicks. */
  async play(options: { countInBars?: number } = {}) {
    const generation = ++this.playGeneration;
    await audioEngine.initialize();
    if (generation !== this.playGeneration) return;
    if (this.state.playing && !this.state.paused) return;
    const resuming = this.state.paused;
    const pattern = this.patternGetter();
    const stepDuration = secondsPerStep(this.state.bpm, pattern.subdivision);
    const beat = stepDuration * (pattern.subdivision / pattern.beatUnit);
    const countIn = resuming ? 0 : Math.max(0, options.countInBars ?? 0);
    const lead = audioEngine.currentTime + 0.055;
    this.clearClicks();
    for (let index = 0; index < countIn * pattern.beatsPerBar; index++)
      audioEngine.click(lead + index * beat, index % pattern.beatsPerBar === 0);
    this.nextStep = resuming ? this.state.currentStep : 0;
    this.nextStepTime = lead + countIn * pattern.stepsPerBar * stepDuration;
    if (!resuming) {
      this.absoluteStep = 0;
      this.runStart = this.nextStepTime;
    }
    this.update({ playing: true, paused: false });
    this.syncClickClock();
    this.startTimer();
    this.scheduleWindow();
  }

  pause() {
    if (!this.state.playing) return;
    this.update({ playing: false, paused: true });
  }

  stop() {
    this.playGeneration++;
    this.nextStep = 0;
    this.update({
      playing: false,
      paused: false,
      currentStep: 0,
    });
  }

  /** Re-derives the click phase after the pattern's meter or length changed. */
  realign() {
    const pattern = this.patternGetter();
    this.nextStep %= Math.max(1, pattern.bars * pattern.stepsPerBar);
    if (!this.state.metronome) return;
    this.clearClicks();
    this.syncClickClock();
  }

  toggle() {
    return this.state.playing ? (this.pause(), Promise.resolve()) : this.play();
  }

  destroy() {
    this.playGeneration++;
    this.stopTimer();
    this.clearClicks();
    this.listeners.clear();
  }

  private startTimer() {
    if (this.timer === null)
      this.timer = window.setInterval(
        () => this.scheduleWindow(),
        this.schedulerIntervalMs,
      );
  }

  private syncClickClock() {
    if (!this.state.playing) {
      this.clickClock.reset(audioEngine.currentTime + 0.04);
      return;
    }
    const pattern = this.patternGetter();
    const duration = secondsPerStep(this.state.bpm, pattern.subdivision);
    const stepsPerBeat = pattern.subdivision / pattern.beatUnit;
    const beat = Math.ceil(this.nextStep / stepsPerBeat);
    const time =
      this.nextStepTime -
      swingOffset(this.nextStep, duration, this.state.swing) +
      (beat * stepsPerBeat - this.nextStep) * duration;
    this.clickClock.reset(time, beat % pattern.beatsPerBar);
  }

  private clearClicks() {
    this.clickGeneration++;
    this.clickVisuals.forEach(window.clearTimeout);
    this.clickVisuals.clear();
    audioEngine.cancelClicks();
  }

  private scheduleWindow() {
    const pattern = this.patternGetter();
    if (this.state.metronome) {
      const now = audioEngine.currentTime;
      const levels = clickLevelsFor(
        this.state.clickLevels,
        pattern.beatsPerBar,
      );
      for (const click of this.clickClock.window(
        now,
        now + this.lookAheadSeconds,
        this.state.bpm,
        pattern.beatsPerBar,
        pattern.beatUnit,
      )) {
        const level = levels[click.beat] ?? 'normal';
        const bar = this.state.playing
          ? Math.floor(
              (click.time - this.runStart + 0.001) /
                (secondsPerStep(this.state.bpm, pattern.subdivision) *
                  pattern.stepsPerBar),
            )
          : -1;
        if (level !== 'off' && (!this.gate || this.gate(bar)))
          audioEngine.click(click.time, level === 'accent');
        const timer = window.setTimeout(
          () => {
            this.clickVisuals.delete(timer);
            if (this.state.metronome)
              this.update({ metronomeBeat: click.beat });
          },
          Math.max(0, click.time - now) * 1000,
        );
        this.clickVisuals.add(timer);
      }
    }
    if (!this.state.playing) return;
    const length = Math.max(1, pattern.bars * pattern.stepsPerBar);
    const duration = secondsPerStep(this.state.bpm, pattern.subdivision);
    if (this.nextStep >= length) this.nextStep = 0;
    while (
      this.nextStepTime <
      audioEngine.currentTime + this.lookAheadSeconds
    ) {
      const scheduledTime = this.nextStepTime;
      const audible =
        !this.gate || this.gate(Math.floor(this.absoluteStep / pattern.stepsPerBar));
      pattern.tracks.forEach((track) => {
        const step = track.steps[this.nextStep];
        if (audible && !track.muted && step && shouldPlayStep(step))
          this.trigger(
            track.padId,
            step.accent ? 1 : step.velocity,
            scheduledTime + step.microtiming / 1000,
          );
      });
      this.update({ currentStep: this.nextStep });
      this.nextStep += 1;
      this.absoluteStep += 1;
      this.nextStepTime +=
        duration *
        (this.nextStep % 2 === 1 ? 1 + this.state.swing : 1 - this.state.swing);
      if (this.nextStep >= length) {
        if (this.state.loop) this.nextStep = 0;
        else {
          this.stop();
          break;
        }
      }
    }
  }

  private stopTimer() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }
  private emit() {
    this.listeners.forEach((listener) => listener(this.state));
  }
}
