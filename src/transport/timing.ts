import type { Pattern, PatternStep } from '../model/types.ts';

export function secondsPerBeat(bpm: number): number {
  return 60 / Math.max(20, Math.min(300, bpm));
}

export function secondsPerStep(bpm: number, subdivision = 4): number {
  return secondsPerBeat(bpm) * (4 / subdivision);
}

export function swingOffset(stepIndex: number, stepDuration: number, swing: number): number {
  if (stepIndex % 2 === 0) return 0;
  return stepDuration * Math.max(0, Math.min(0.45, swing));
}

export function stepTime(startTime: number, stepIndex: number, bpm: number, subdivision: number, swing: number, microtimingMs = 0): number {
  const duration = secondsPerStep(bpm, subdivision);
  return startTime + stepIndex * duration + swingOffset(stepIndex, duration, swing) + microtimingMs / 1000;
}

export function nearestStep(time: number, startTime: number, bpm: number, subdivision: number, totalSteps: number): { index: number; offsetMs: number } {
  const duration = secondsPerStep(bpm, subdivision);
  const raw = (time - startTime) / duration;
  const rounded = Math.round(raw);
  const index = ((rounded % totalSteps) + totalSteps) % totalSteps;
  return { index, offsetMs: (raw - rounded) * duration * 1000 };
}

export function createPattern(id: string, name: string, padIds: string[], bars = 1, stepsPerBar = 16): Pattern {
  const stepCount = bars * stepsPerBar;
  return {
    id,
    name,
    bars,
    beatsPerBar: 4,
    beatUnit: 4,
    subdivision: 16,
    stepsPerBar,
    factory: false,
    tracks: padIds.map((padId) => ({ padId, muted: false, steps: Array.from({ length: stepCount }, () => ({ active: false, velocity: 0.82, accent: false, probability: 1, microtiming: 0 })) })),
  };
}

export function resizePattern(pattern: Pattern, bars: number): Pattern {
  const length = Math.max(1, Math.min(4, bars)) * pattern.stepsPerBar;
  return {
    ...pattern,
    bars: Math.max(1, Math.min(4, bars)),
    tracks: pattern.tracks.map((track) => ({
      ...track,
      steps: Array.from({ length }, (_, index) => track.steps[index] ? { ...track.steps[index] } : { active: false, velocity: 0.82, accent: false, probability: 1, microtiming: 0 }),
    })),
  };
}

export function shouldPlayStep(step: PatternStep, random = Math.random()): boolean {
  return step.active && random <= step.probability;
}

export function quantizeHit(time: number, startTime: number, pattern: Pattern, bpm: number): { step: number; microtiming: number } {
  const result = nearestStep(time, startTime, bpm, pattern.subdivision, pattern.bars * pattern.stepsPerBar);
  return { step: result.index, microtiming: Math.max(-80, Math.min(80, result.offsetMs)) };
}
