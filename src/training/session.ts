import type {
  AttemptStats,
  Exercise,
  ExerciseAttempt,
  ExercisePart,
  Pattern,
  PatternStep,
  PracticeOptions,
  RhythmPreset,
  Strictness,
} from '../model/types.ts';
import { EXERCISES, stepsPerBarOf } from './exercises.ts';

export const TOLERANCE_MS: Record<Strictness, number> = {
  relaxed: 70,
  normal: 45,
  strict: 28,
};

export const MASTERED_SCORE = 85;

export function defaultOptions(exercise: Exercise): PracticeOptions {
  return {
    bpm: exercise.bpm,
    duration: 60,
    backing: exercise.backing,
    click: true,
    countInBars: 1,
    strictness: 'normal',
    guide: 'off',
  };
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Bars in one loop of the session: the exercise and its backing both repeat. */
export function sessionBars(exercise: Exercise, backing: RhythmPreset | null) {
  const backingBars = backing?.pattern.bars ?? 1;
  return Math.min(
    8,
    (exercise.bars * backingBars) / gcd(exercise.bars, backingBars),
  );
}

export function isSilentBar(gap: Exercise['gap'], bar: number) {
  return Boolean(gap && bar >= 0 && bar % (gap.play + gap.silent) >= gap.play);
}

/**
 * The drum-machine loop for a session: the backing preset with the player's
 * pads muted, plus the exercise itself at `targetVelocity` (0 leaves it out —
 * the player's part; Listen plays it at full level, the guide quietly).
 */
export function buildSessionPattern(
  exercise: Exercise,
  backing: RhythmPreset | null,
  padIds: string[],
  targetVelocity: number,
): Pattern {
  const stepsPerBar = stepsPerBarOf(exercise);
  const bars = sessionBars(exercise, backing);
  const length = bars * stepsPerBar;
  const phrase = exercise.bars * stepsPerBar;
  const targets = new Map(
    exercise.parts.map((part) => [part.pad, new Set(part.steps)]),
  );
  const source =
    backing && backing.pattern.stepsPerBar === stepsPerBar
      ? backing.pattern
      : null;
  const sourceLength = source ? source.bars * source.stepsPerBar : 1;
  const rest = (): PatternStep => ({
    active: false,
    velocity: 0.82,
    accent: false,
    probability: 1,
    microtiming: 0,
  });
  return {
    id: `practice-${exercise.id}`,
    name: exercise.title,
    bars,
    beatsPerBar: exercise.beatsPerBar,
    beatUnit: exercise.beatUnit,
    subdivision: 16,
    stepsPerBar,
    factory: false,
    tracks: padIds.map((padId, pad) => ({
      padId,
      muted: false,
      steps: Array.from({ length }, (_, step) => {
        const target = targets.get(pad);
        if (target) {
          return target.has(step % phrase) && targetVelocity > 0
            ? { ...rest(), active: true, velocity: targetVelocity }
            : rest();
        }
        const from = source?.tracks[pad]?.steps[step % sourceLength];
        return from ? { ...from, probability: 1, microtiming: 0 } : rest();
      }),
    })),
  };
}

export type JudgementKind =
  | 'perfect'
  | 'good'
  | 'ok'
  | 'early'
  | 'late'
  | 'miss'
  | 'extra'
  | 'wrong';

export interface Judgement {
  kind: JudgementKind;
  pad: number;
  /** Positive is late. Null for misses and hits that matched no note. */
  offsetMs: number | null;
  time: number;
  /** Step within the phrase, for the notation. */
  step: number | null;
}

interface Note {
  pad: number;
  time: number;
  step: number;
  bar: number;
  silent: boolean;
  judgement: Judgement | null;
}

export interface ScorerConfig {
  parts: ExercisePart[];
  stepsPerBar: number;
  bars: number;
  /** Audible time of the first step. */
  start: number;
  stepDuration: number;
  /** Audible time after which no more notes are due; Infinity when untimed. */
  end: number;
  toleranceMs: number;
  gap?: Exercise['gap'];
}

const POINTS: Partial<Record<JudgementKind, number>> = {
  perfect: 1,
  good: 0.8,
  ok: 0.55,
  early: 0.15,
  late: 0.15,
};
const HIT: JudgementKind[] = ['perfect', 'good', 'ok'];
const STRAY_PENALTY = 0.3;

export function judge(offsetMs: number, toleranceMs: number): JudgementKind {
  const size = Math.abs(offsetMs);
  if (size <= toleranceMs * 0.35) return 'perfect';
  if (size <= toleranceMs * 0.7) return 'good';
  if (size <= toleranceMs) return 'ok';
  return offsetMs < 0 ? 'early' : 'late';
}

/**
 * Matches hits to the expected notes of a session as they happen. Notes are
 * generated from the start time and tempo, so an early hit is judged even
 * before the scheduler has queued its note.
 */
export class SessionScorer {
  readonly notes: Note[] = [];
  readonly strays: Judgement[] = [];
  private phrases = 0;
  private windows = new Map<number, number>();
  private open = 0;
  streak = 0;
  private readonly phraseSteps: number;
  private readonly config: ScorerConfig;

  constructor(config: ScorerConfig) {
    this.config = config;
    this.phraseSteps = config.stepsPerBar * config.bars;
    const tolerance = config.toleranceMs / 1000;
    for (const part of config.parts) {
      const steps = [...part.steps].sort((a, b) => a - b);
      const gaps = steps.map((step, index) =>
        index
          ? step - steps[index - 1]
          : step + this.phraseSteps - steps.at(-1)!,
      );
      const closest = Math.min(...gaps) * config.stepDuration;
      // Wide enough to judge “too early / too late”, never wide enough to
      // take the neighbouring note.
      this.windows.set(
        part.pad,
        Math.max(tolerance, Math.min(tolerance * 1.8, closest * 0.5)),
      );
    }
  }

  private windowFor(pad: number) {
    return this.windows.get(pad) ?? this.config.toleranceMs / 1000;
  }

  private generate(until: number) {
    const { start, stepDuration, end, stepsPerBar, parts, gap } = this.config;
    const phraseLength = this.phraseSteps * stepDuration;
    while (start + this.phrases * phraseLength <= Math.min(until, end)) {
      const first = this.phrases * this.phraseSteps;
      const phraseNotes: Note[] = [];
      for (const part of parts)
        for (const step of part.steps) {
          const absolute = first + step;
          const time = start + absolute * stepDuration;
          if (time >= end) continue;
          const bar = Math.floor(absolute / stepsPerBar);
          phraseNotes.push({
            pad: part.pad,
            time,
            step,
            bar,
            silent: isSilentBar(gap, bar),
            judgement: null,
          });
        }
      phraseNotes.sort((a, b) => a.time - b.time);
      this.notes.push(...phraseNotes);
      this.phrases += 1;
    }
  }

  /** Judges a hit heard at `time` (audio seconds). Null before the start. */
  hit(pad: number, time: number): Judgement | null {
    const { start, end, toleranceMs } = this.config;
    const reach = (this.config.toleranceMs / 1000) * 1.8;
    if (time < start - reach || time > end + reach) return null;
    this.generate(time + 2);
    const window = this.windowFor(pad);
    let best: Note | null = null;
    for (let i = this.open; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.time > time + window) break;
      if (note.judgement || note.pad !== pad) continue;
      if (
        Math.abs(note.time - time) <= window &&
        (!best || Math.abs(note.time - time) < Math.abs(best.time - time))
      )
        best = note;
    }
    if (best) {
      const offsetMs = (time - best.time) * 1000;
      const kind = judge(offsetMs, toleranceMs);
      best.judgement = { kind, pad, offsetMs, time, step: best.step };
      this.streak = HIT.includes(kind) ? this.streak + 1 : 0;
      return best.judgement;
    }
    const tolerance = toleranceMs / 1000;
    const other = this.notes.some(
      (note) =>
        !note.judgement &&
        note.pad !== pad &&
        Math.abs(note.time - time) <= tolerance,
    );
    const stray: Judgement = {
      kind: other ? 'wrong' : 'extra',
      pad,
      offsetMs: null,
      time,
      step: null,
    };
    this.strays.push(stray);
    return stray;
  }

  /** Marks notes whose window has passed as missed and returns them. */
  advance(now: number): Judgement[] {
    this.generate(now + 2);
    const missed: Judgement[] = [];
    for (let i = this.open; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.time + this.windowFor(note.pad) >= now) break;
      if (note.judgement) continue;
      note.judgement = {
        kind: 'miss',
        pad: note.pad,
        offsetMs: null,
        time: note.time,
        step: note.step,
      };
      missed.push(note.judgement);
      this.streak = 0;
    }
    while (this.open < this.notes.length && this.notes[this.open].judgement)
      this.open += 1;
    return missed;
  }

  /** Upcoming notes in [from, to), for guide lights. */
  upcoming(from: number, to: number) {
    this.generate(to + 1);
    return this.notes.filter((note) => note.time >= from && note.time < to);
  }

  /** Statistics for every note due before `until`. */
  summary(until = Infinity): AttemptStats & { score: number; biasMs: number } {
    const due = this.notes.filter(
      (note) =>
        note.time <= until &&
        (note.judgement || note.time + this.windowFor(note.pad) < until),
    );
    const strays = this.strays.filter((stray) => stray.time <= until);
    const count = (kind: JudgementKind) =>
      due.filter((note) => (note.judgement?.kind ?? 'miss') === kind).length;
    const offsets = due
      .map((note) => note.judgement?.offsetMs)
      .filter((value): value is number => typeof value === 'number');
    const mean = (values: number[]) =>
      values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
    const bias = mean(offsets);
    const meanAbs = mean(offsets.map(Math.abs));
    const spread =
      offsets.length > 1 && bias !== null
        ? Math.sqrt(mean(offsets.map((value) => (value - bias) ** 2))!)
        : 0;
    const points = (notes: Note[]) =>
      notes.reduce(
        (sum, note) => sum + (POINTS[note.judgement?.kind ?? 'miss'] ?? 0),
        0,
      );
    const extra = strays.filter((stray) => stray.kind === 'extra').length;
    const wrongPad = strays.length - extra;
    const score = due.length
      ? Math.round(
          Math.max(
            0,
            Math.min(
              100,
              (100 * (points(due) - STRAY_PENALTY * strays.length)) /
                due.length,
            ),
          ),
        )
      : 0;
    let run = 0;
    let bestStreak = 0;
    for (const note of due) {
      run = HIT.includes(note.judgement?.kind ?? 'miss') ? run + 1 : 0;
      bestStreak = Math.max(bestStreak, run);
    }
    const histogram = Array.from({ length: 16 }, (_, index) => ({
      from: -80 + index * 10,
      to: -70 + index * 10,
      count: 0,
    }));
    for (const offset of offsets)
      histogram[
        Math.max(0, Math.min(15, Math.floor((offset + 80) / 10)))
      ].count += 1;
    const barIndexes = [...new Set(due.map((note) => note.bar))].sort(
      (a, b) => a - b,
    );
    const bars = barIndexes.map((bar) => {
      const notes = due.filter((note) => note.bar === bar);
      const barOffsets = notes
        .map((note) => note.judgement?.offsetMs)
        .filter((value): value is number => typeof value === 'number');
      return {
        bar,
        expected: notes.length,
        score: Math.round((100 * points(notes)) / notes.length),
        offsetMs: barOffsets.length ? Math.round(mean(barOffsets)!) : null,
        silent: notes[0].silent,
      };
    });
    const pads = this.config.parts.map(({ pad }) => {
      const notes = due.filter((note) => note.pad === pad);
      const padOffsets = notes
        .map((note) => note.judgement?.offsetMs)
        .filter((value): value is number => typeof value === 'number');
      const padMean = mean(padOffsets);
      const padAbs = mean(padOffsets.map(Math.abs));
      return {
        pad,
        expected: notes.length,
        hit: notes.filter((note) =>
          HIT.includes(note.judgement?.kind ?? 'miss'),
        ).length,
        offsetMs: padMean === null ? null : Math.round(padMean),
        meanAbsMs: padAbs === null ? null : Math.round(padAbs),
      };
    });
    const hits = count('perfect') + count('good') + count('ok');
    return {
      score,
      biasMs: bias === null ? 0 : Math.round(bias),
      expected: due.length,
      perfect: count('perfect'),
      good: count('good'),
      ok: count('ok'),
      early: count('early'),
      late: count('late'),
      missed: count('miss'),
      extra,
      wrongPad,
      accuracy: due.length ? hits / due.length : 0,
      meanAbsMs: meanAbs === null ? 0 : Math.round(meanAbs),
      spreadMs: Math.round(spread),
      bestStreak,
      toleranceMs: this.config.toleranceMs,
      histogram,
      bars,
      pads,
    };
  }
}

export function gradeFor(score: number) {
  return score >= 95
    ? 'S'
    : score >= 85
      ? 'A'
      : score >= 70
        ? 'B'
        : score >= 55
          ? 'C'
          : 'D';
}

/** Up to three concrete observations about a finished session. */
export function insightsFor(
  stats: AttemptStats & { score: number; biasMs: number },
  exercise: Exercise,
  options: PracticeOptions,
  padName: (pad: number) => string = (pad) => `Pad ${pad + 1}`,
): string[] {
  if (!stats.expected)
    return ['No notes were due yet. Play at least one full phrase.'];
  const insights: string[] = [];
  const tolerance = stats.toleranceMs;
  if (Math.abs(stats.biasMs) >= 10)
    insights.push(
      stats.biasMs < 0
        ? `You play ${-stats.biasMs} ms ahead of the beat on average — rushing. Let the click arrive first.`
        : `You play ${stats.biasMs} ms behind the beat on average — dragging. Lean slightly into the next note.`,
    );
  const timed = stats.bars.filter((bar) => bar.offsetMs !== null);
  if (timed.length >= 6) {
    const third = Math.floor(timed.length / 3);
    const avg = (bars: typeof timed) =>
      bars.reduce((sum, bar) => sum + bar.offsetMs!, 0) / bars.length;
    const drift = avg(timed.slice(-third)) - avg(timed.slice(0, third));
    if (Math.abs(drift) >= 12)
      insights.push(
        `You drifted ${Math.round(Math.abs(drift))} ms ${drift < 0 ? 'earlier' : 'later'} from the start to the end of the session.`,
      );
  }
  if (exercise.gap) {
    const silent = timed.filter((bar) => bar.silent);
    const heard = timed.filter((bar) => !bar.silent);
    if (silent.length && heard.length) {
      const avg = (bars: typeof timed) =>
        bars.reduce((sum, bar) => sum + bar.offsetMs!, 0) / bars.length;
      const change = avg(silent) - avg(heard);
      if (Math.abs(change) >= 10)
        insights.push(
          `Without the click you moved ${Math.round(Math.abs(change))} ms ${change < 0 ? 'early' : 'late'} — ${change < 0 ? 'the gaps pull you forward' : 'you wait too long in the gaps'}.`,
        );
    }
  }
  if (stats.spreadMs > tolerance * 0.6)
    insights.push(
      `Your hits spread ±${stats.spreadMs} ms. Drop about 10 BPM and aim for evenness before speed.`,
    );
  if (stats.pads.length > 1) {
    const weakest = [...stats.pads]
      .filter((pad) => pad.expected)
      .sort((a, b) => a.hit / a.expected - b.hit / b.expected)[0];
    if (weakest && weakest.hit / weakest.expected < stats.accuracy - 0.15)
      insights.push(
        `${padName(weakest.pad)} is the weakest part: ${Math.round((100 * weakest.hit) / weakest.expected)}% on time.`,
      );
  }
  if (stats.extra + stats.wrongPad > Math.max(2, stats.expected * 0.1))
    insights.push(
      `${stats.extra + stats.wrongPad} hits matched no note${stats.wrongPad ? ` (${stats.wrongPad} on the wrong pad)` : ''}. Leave the rests empty.`,
    );
  if (stats.score >= 90)
    insights.push(
      `Excellent. Try ${Math.min(exercise.bpmRange[1], options.bpm + 5)} BPM${options.strictness !== 'strict' ? ' or strict timing' : ''}.`,
    );
  else if (stats.accuracy < 0.5)
    insights.push(
      'Use Listen to hear the part, then practise slower with the guide on.',
    );
  else if (!insights.length)
    insights.push('Solid. Another run at this tempo, then speed up by 5 BPM.');
  return insights.slice(0, 3);
}

export function attemptsFor(exerciseId: string, attempts: ExerciseAttempt[]) {
  return attempts
    .filter((attempt) => attempt.exerciseId === exerciseId)
    .sort((a, b) => a.completedAt - b.completedAt);
}

export function bestScore(exerciseId: string, attempts: ExerciseAttempt[]) {
  return attempts.reduce(
    (best, attempt) =>
      attempt.exerciseId === exerciseId
        ? Math.max(best ?? 0, attempt.score)
        : best,
    null as number | null,
  );
}

/** The next exercise to suggest: harder in the same skill, then the next skill. */
export function recommendNext(exercise: Exercise, attempts: ExerciseAttempt[]) {
  const unmastered = (candidate: Exercise) =>
    candidate.id !== exercise.id &&
    (bestScore(candidate.id, attempts) ?? 0) < MASTERED_SCORE;
  const sameSkill = EXERCISES.filter(
    (candidate) =>
      candidate.skill === exercise.skill &&
      candidate.difficulty >= exercise.difficulty,
  ).sort((a, b) => a.difficulty - b.difficulty);
  return (
    sameSkill.find(unmastered) ??
    [...EXERCISES]
      .sort((a, b) => a.difficulty - b.difficulty)
      .find(
        (candidate) =>
          unmastered(candidate) &&
          candidate.difficulty <= exercise.difficulty + 1,
      ) ??
    null
  );
}

/** Totals across all sessions for the exercise browser. */
export function practiceSummary(attempts: ExerciseAttempt[], now = Date.now()) {
  const best = new Map<string, number>();
  for (const attempt of attempts)
    best.set(
      attempt.exerciseId,
      Math.max(best.get(attempt.exerciseId) ?? 0, attempt.score),
    );
  const day = (time: number) => {
    const date = new Date(time);
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ).getTime();
  };
  const days = new Set(attempts.map((attempt) => day(attempt.completedAt)));
  let streak = 0;
  let cursor = day(now);
  // Half a day back, then to midnight: one calendar day even across DST.
  if (!days.has(cursor)) cursor = day(cursor - 43200000);
  while (days.has(cursor)) {
    streak += 1;
    cursor = day(cursor - 43200000);
  }
  return {
    sessions: attempts.length,
    minutes: Math.round(
      attempts.reduce((sum, attempt) => sum + (attempt.durationSec ?? 0), 0) /
        60,
    ),
    mastered: [...best.values()].filter((score) => score >= MASTERED_SCORE)
      .length,
    streak,
  };
}
