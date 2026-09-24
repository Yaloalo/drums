'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AudioEngine, audioEngine } from '../audio/AudioEngine';
import type {
  Exercise,
  ExerciseAttempt,
  GuideMode,
  PracticeOptions,
  Strictness,
  TransportState,
} from '../model/types';
import { dbGet, dbGetAll, dbPut } from '../persistence/database';
import { RHYTHM_PRESETS } from '../presets/rhythms';
import { stepsPerBarOf } from '../training/exercises';
import {
  bestScore,
  buildSessionPattern,
  defaultOptions,
  gradeFor,
  insightsFor,
  isSilentBar,
  SessionScorer,
  TOLERANCE_MS,
  type Judgement,
  type JudgementKind,
} from '../training/session';
import { secondsPerStep } from '../transport/timing';
import { useApp } from './AppContext';

export type PracticeMode = 'listen' | 'practice';

export interface PracticeSession {
  /** Changes with every run, so views can reset. */
  key: number;
  exercise: Exercise;
  options: PracticeOptions;
  mode: PracticeMode;
  /** Audible time of the first note of the phrase (after the count-in). */
  start: number;
  countInStart: number;
  /** Audible time the session ends; Infinity when untimed or listening. */
  end: number;
  stepDuration: number;
  stepsPerBar: number;
  phraseSteps: number;
  startedAt: number;
}

export interface LiveState {
  last: Judgement | null;
  hit: number;
  missed: number;
  stray: number;
  streak: number;
  /** Latest judgement per note of the phrase, keyed `pad:step`. */
  marks: Record<string, JudgementKind>;
  /** Recent timing offsets for the meter. */
  offsets: number[];
}

export interface SessionResult {
  attempt: ExerciseAttempt;
  exercise: Exercise;
  previousBest: number | null;
}

export interface PracticePrefs {
  duration: number | null;
  countInBars: number;
  strictness: Strictness;
  guide: GuideMode;
  click: boolean;
  /** Added to how late the player's taps arrive (Bluetooth, touch screens). */
  calibrationMs: number;
  tempos: Record<string, number>;
  backings: Record<string, string | null>;
  favorites: string[];
}

export type Facet =
  | 'skill'
  | 'level'
  | 'meter'
  | 'pads'
  | 'style'
  | 'backing'
  | 'status';

export interface BrowserState {
  query: string;
  filters: Partial<Record<Facet, string[]>>;
  sort: 'recommended' | 'easiest' | 'hardest' | 'best' | 'recent' | 'name';
  selectedId: string | null;
}

interface PracticeValue {
  session: PracticeSession | null;
  live: LiveState;
  results: SessionResult | null;
  attempts: ExerciseAttempt[];
  prefs: PracticePrefs;
  browser: BrowserState;
  setBrowser: (update: (current: BrowserState) => BrowserState) => void;
  setPrefs: (patch: Partial<PracticePrefs>) => void;
  optionsFor: (exercise: Exercise) => PracticeOptions;
  /** Remembers the tempo/backing chosen for one exercise. */
  setExerciseOptions: (
    exercise: Exercise,
    patch: Partial<PracticeOptions>,
  ) => void;
  toggleFavorite: (id: string) => void;
  listen: (exercise: Exercise) => void;
  start: (exercise: Exercise) => void;
  /** Ends a practice run and scores it. */
  finish: () => void;
  /** Stops without scoring. */
  cancel: () => void;
  showResults: (attempt: ExerciseAttempt, exercise: Exercise) => void;
  dismissResults: () => void;
  onCue: (listener: (pad: number, delayMs: number) => void) => () => void;
}

const PracticeContext = createContext<PracticeValue | null>(null);

const EMPTY_LIVE: LiveState = {
  last: null,
  hit: 0,
  missed: 0,
  stray: 0,
  streak: 0,
  marks: {},
  offsets: [],
};

const DEFAULT_PREFS: PracticePrefs = {
  duration: 60,
  countInBars: 1,
  strictness: 'normal',
  guide: 'off',
  click: true,
  calibrationMs: 0,
  tempos: {},
  backings: {},
  favorites: [],
};

function applyJudgements(
  live: LiveState,
  judgements: Judgement[],
  streak: number,
): LiveState {
  const next = {
    ...live,
    marks: { ...live.marks },
    offsets: [...live.offsets],
    streak,
  };
  for (const judgement of judgements) {
    if (['perfect', 'good', 'ok'].includes(judgement.kind)) next.hit += 1;
    else if (['miss', 'early', 'late'].includes(judgement.kind))
      next.missed += 1;
    else next.stray += 1;
    if (judgement.step !== null)
      next.marks[`${judgement.pad}:${judgement.step}`] = judgement.kind;
    if (judgement.offsetMs !== null)
      next.offsets = [...next.offsets, judgement.offsetMs].slice(-12);
    next.last = judgement;
  }
  return next;
}

export function PracticeProvider({ children }: { children: React.ReactNode }) {
  const { kit, setArea, transportService, setPatternOverride, onPadHit } =
    useApp();
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [live, setLive] = useState<LiveState>(EMPTY_LIVE);
  const [results, setResults] = useState<SessionResult | null>(null);
  const [attempts, setAttempts] = useState<ExerciseAttempt[]>([]);
  const [prefs, setPrefsState] = useState<PracticePrefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [browser, setBrowserState] = useState<BrowserState>({
    query: '',
    filters: {},
    sort: 'recommended',
    selectedId: null,
  });
  const sessionRef = useRef<PracticeSession | null>(null);
  const scorer = useRef<SessionScorer | null>(null);
  const restore = useRef<Partial<TransportState> | null>(null);
  const busy = useRef(false);
  const cueListeners = useRef(
    new Set<(pad: number, delayMs: number) => void>(),
  );
  const cued = useRef(new Set<string>());
  const prefsRef = useRef(prefs);
  const attemptsRef = useRef(attempts);
  const kitRef = useRef(kit);
  const runKey = useRef(0);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  useEffect(() => {
    attemptsRef.current = attempts;
  }, [attempts]);
  useEffect(() => {
    kitRef.current = kit;
  }, [kit]);

  useEffect(() => {
    Promise.all([
      dbGetAll<ExerciseAttempt>('attempts'),
      dbGet<Partial<PracticePrefs> & { id: string }>('settings', 'practice'),
    ])
      .then(([saved, stored]) => {
        setAttempts(saved.sort((a, b) => a.completedAt - b.completedAt));
        if (stored) {
          const { id: _id, ...rest } = stored;
          setPrefsState({ ...DEFAULT_PREFS, ...rest });
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(
      () =>
        void dbPut('settings', { id: 'practice', ...prefs }).catch(
          () => undefined,
        ),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [loaded, prefs]);

  const setPrefs = useCallback(
    (patch: Partial<PracticePrefs>) =>
      setPrefsState((current) => ({ ...current, ...patch })),
    [],
  );
  const setBrowser = useCallback(
    (update: (current: BrowserState) => BrowserState) =>
      setBrowserState(update),
    [],
  );
  const optionsFor = useCallback(
    (exercise: Exercise): PracticeOptions => ({
      ...defaultOptions(exercise),
      duration: prefs.duration,
      countInBars: prefs.countInBars,
      strictness: prefs.strictness,
      guide: prefs.guide,
      click: prefs.click,
      bpm: prefs.tempos[exercise.id] ?? exercise.bpm,
      backing:
        exercise.id in prefs.backings
          ? prefs.backings[exercise.id]
          : exercise.backing,
    }),
    [prefs],
  );
  const setExerciseOptions = useCallback(
    (exercise: Exercise, patch: Partial<PracticeOptions>) =>
      setPrefsState((current) => ({
        ...current,
        ...('duration' in patch ? { duration: patch.duration ?? null } : {}),
        ...(patch.countInBars !== undefined
          ? { countInBars: patch.countInBars }
          : {}),
        ...(patch.strictness ? { strictness: patch.strictness } : {}),
        ...(patch.guide ? { guide: patch.guide } : {}),
        ...(patch.click !== undefined ? { click: patch.click } : {}),
        tempos:
          patch.bpm !== undefined
            ? { ...current.tempos, [exercise.id]: patch.bpm }
            : current.tempos,
        backings:
          'backing' in patch
            ? { ...current.backings, [exercise.id]: patch.backing ?? null }
            : current.backings,
      })),
    [],
  );
  const toggleFavorite = useCallback(
    (id: string) =>
      setPrefsState((current) => ({
        ...current,
        favorites: current.favorites.includes(id)
          ? current.favorites.filter((item) => item !== id)
          : [...current.favorites, id],
      })),
    [],
  );

  const endRun = useCallback(() => {
    sessionRef.current = null;
    scorer.current = null;
    transportService.setGate(null);
    transportService.stop();
    setPatternOverride(null);
    if (restore.current) {
      transportService.update(restore.current);
      restore.current = null;
    }
    setSession(null);
  }, [setPatternOverride, transportService]);

  /* oxlint-disable react/react-compiler -- Practice sessions coordinate stable context services with live audio refs. */
  const run = useCallback(
    async (exercise: Exercise, mode: PracticeMode) => {
      busy.current = true;
      try {
        const options = optionsFor(exercise);
        if (!sessionRef.current) {
          const current = transportService.snapshot;
          restore.current = {
            bpm: current.bpm,
            swing: current.swing,
            metronome: current.metronome,
            clickLevels: current.clickLevels,
            loop: current.loop,
          };
        }
        sessionRef.current = null;
        scorer.current = null;
        transportService.setGate(null);
        transportService.stop();
        const backing = options.backing
          ? (RHYTHM_PRESETS.find((rhythm) => rhythm.id === options.backing) ??
            null)
          : null;
        const target =
          mode === 'listen' ? 0.9 : options.guide === 'sound' ? 0.35 : 0;
        setPatternOverride(
          buildSessionPattern(
            exercise,
            backing,
            kitRef.current.pads.map((pad) => pad.id),
            target,
          ),
        );
        transportService.update({
          bpm: options.bpm,
          swing: 0,
          loop: true,
          clickLevels: [],
          metronome: options.click,
        });
        const gap = exercise.gap;
        transportService.setGate(gap ? (bar) => !isSilentBar(gap, bar) : null);
        const countInBars = mode === 'practice' ? options.countInBars : 0;
        await transportService.play({ countInBars });
        const stepsPerBar = stepsPerBarOf(exercise);
        const stepDuration = secondsPerStep(options.bpm, 16);
        const start = transportService.runStartTime + AudioEngine.graphDelay;
        const phrase = stepDuration * stepsPerBar * exercise.bars;
        const end =
          mode === 'practice' && options.duration
            ? start + Math.max(1, Math.ceil(options.duration / phrase)) * phrase
            : Infinity;
        runKey.current += 1;
        const next: PracticeSession = {
          key: runKey.current,
          exercise,
          options,
          mode,
          start,
          countInStart: start - countInBars * stepsPerBar * stepDuration,
          end,
          stepDuration,
          stepsPerBar,
          phraseSteps: stepsPerBar * exercise.bars,
          startedAt: Date.now(),
        };
        scorer.current =
          mode === 'practice'
            ? new SessionScorer({
                parts: exercise.parts,
                stepsPerBar,
                bars: exercise.bars,
                start,
                stepDuration,
                end,
                toleranceMs: TOLERANCE_MS[options.strictness],
                gap,
              })
            : null;
        cued.current.clear();
        sessionRef.current = next;
        setSession(next);
        setLive(EMPTY_LIVE);
        setResults(null);
      } finally {
        busy.current = false;
      }
    },
    [optionsFor, setPatternOverride, transportService],
  );

  const finish = useCallback(() => {
    const current = sessionRef.current;
    const active = scorer.current;
    if (current?.mode === 'practice' && active) {
      const until = Math.min(audioEngine.audibleTime(), current.end + 0.2);
      active.advance(until);
      const stats = active.summary(until);
      if (stats.expected > 0) {
        const pads = kitRef.current.pads;
        const insights = insightsFor(
          stats,
          current.exercise,
          current.options,
          (pad) => pads[pad]?.label ?? `Pad ${pad + 1}`,
        );
        const { score, biasMs, ...rest } = stats;
        const attempt: ExerciseAttempt = {
          id: `attempt-${Date.now()}`,
          exerciseId: current.exercise.id,
          startedAt: current.startedAt,
          completedAt: Date.now(),
          score,
          grade: gradeFor(score),
          averageErrorMs: stats.meanAbsMs,
          consistencyMs: stats.spreadMs,
          biasMs,
          missed: stats.missed,
          extra: stats.extra,
          wrongPad: stats.wrongPad,
          feedback: insights[0] ?? '',
          insights,
          bpm: current.options.bpm,
          durationSec: Math.max(
            1,
            Math.round(Math.min(until, current.end) - current.start),
          ),
          options: current.options,
          stats: rest,
        };
        setResults({
          attempt,
          exercise: current.exercise,
          previousBest: bestScore(current.exercise.id, attemptsRef.current),
        });
        setAttempts((list) => [...list, attempt]);
        void dbPut('attempts', attempt).catch(() => undefined);
      }
    }
    endRun();
  }, [endRun]);
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  // Anything else stopping the transport (the Drum Machine's Stop) ends the run.
  useEffect(
    () =>
      transportService.subscribe((state) => {
        if (!state.playing && sessionRef.current && !busy.current) endRun();
      }),
    [endRun, transportService],
  );

  useEffect(
    () =>
      onPadHit((hit) => {
        const active = scorer.current;
        if (!active) return;
        const judgement = active.hit(
          hit.padIndex,
          hit.time - prefsRef.current.calibrationMs / 1000,
        );
        if (judgement)
          setLive((current) =>
            applyJudgements(current, [judgement], active.streak),
          );
      }),
    [onPadHit],
  );

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      const current = sessionRef.current;
      const active = scorer.current;
      if (!current || !active) return;
      const now = audioEngine.audibleTime();
      const missed = active.advance(now);
      if (missed.length)
        setLive((live) => applyJudgements(live, missed, active.streak));
      if (current.options.guide === 'lights')
        for (const note of active.upcoming(now, now + 0.15)) {
          const key = `${note.pad}:${note.time.toFixed(4)}`;
          if (cued.current.has(key)) continue;
          cued.current.add(key);
          cueListeners.current.forEach((listener) =>
            listener(note.pad, Math.max(0, (note.time - now) * 1000)),
          );
        }
      if (now > current.end + 0.2) finishRef.current();
    }, 40);
    return () => window.clearInterval(timer);
  }, [session]);

  const listen = useCallback(
    (exercise: Exercise) => void run(exercise, 'listen'),
    [run],
  );
  const start = useCallback(
    (exercise: Exercise) => {
      setArea('pads');
      void run(exercise, 'practice');
    },
    [run, setArea],
  );
  const onCue = useCallback(
    (listener: (pad: number, delayMs: number) => void) => {
      cueListeners.current.add(listener);
      return () => {
        cueListeners.current.delete(listener);
      };
    },
    [],
  );
  const showResults = useCallback(
    (attempt: ExerciseAttempt, exercise: Exercise) =>
      setResults({
        attempt,
        exercise,
        previousBest: attemptsRef.current
          .filter(
            (item) =>
              item.exerciseId === exercise.id &&
              item.completedAt < attempt.completedAt,
          )
          .reduce(
            (best, item) => Math.max(best ?? 0, item.score),
            null as number | null,
          ),
      }),
    [],
  );
  const dismissResults = useCallback(() => setResults(null), []);
  /* oxlint-enable react/react-compiler */

  const value = useMemo<PracticeValue>(
    () => ({
      session,
      live,
      results,
      attempts,
      prefs,
      browser,
      setBrowser,
      setPrefs,
      optionsFor,
      setExerciseOptions,
      toggleFavorite,
      listen,
      start,
      finish,
      cancel: endRun,
      showResults,
      dismissResults,
      onCue,
    }),
    [
      attempts,
      browser,
      dismissResults,
      endRun,
      finish,
      listen,
      live,
      onCue,
      optionsFor,
      prefs,
      results,
      session,
      setBrowser,
      setExerciseOptions,
      setPrefs,
      showResults,
      start,
      toggleFavorite,
    ],
  );
  return (
    <PracticeContext.Provider value={value}>
      {children}
    </PracticeContext.Provider>
  );
}

export function usePractice() {
  const value = useContext(PracticeContext);
  if (!value)
    throw new Error('usePractice must be used inside PracticeProvider');
  return value;
}
