'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import type { DrumKit, Exercise, ExerciseAttempt, ExerciseHit, Pattern, PatternStep, SynthEngineType, SynthPreset, TransportState } from '../model/types';
import { cloneSerializable } from '../model/types';
import { dbGet, dbGetAll, dbPut } from '../persistence/database';
import { cloneKit, clonePreset, FACTORY_KITS, FACTORY_PRESETS } from '../presets/factorySounds';
import { RHYTHM_PRESETS, rhythmById } from '../presets/rhythms';
import { scorePerformance } from '../training/scoring';
import { TransportService } from '../transport/TransportService';
import { resizePattern, secondsPerBeat } from '../transport/timing';

export type Area = 'pads' | 'synth' | 'sequencer' | 'exercises' | 'song';
const AREAS: Area[] = ['pads', 'synth', 'sequencer', 'exercises', 'song'];

interface ActiveExerciseState {
  exercise: Exercise;
  startedAt: number;
  startAudioTime: number;
  hits: ExerciseHit[];
}

interface AppContextValue {
  area: Area;
  setArea: (area: Area) => void;
  kit: DrumKit;
  kits: DrumKit[];
  presets: SynthPreset[];
  selectedPadIndex: number;
  selectedPreset: SynthPreset;
  pattern: Pattern;
  customPatterns: Pattern[];
  transport: TransportState;
  selectedStep: { track: number; step: number } | null;
  activeExercise: ActiveExerciseState | null;
  lastAttempt: ExerciseAttempt | null;
  attempts: ExerciseAttempt[];
  hydrated: boolean;
  triggerPad: (index: number, velocity?: number) => void;
  selectPad: (index: number) => void;
  loadKit: (id: string) => void;
  saveKit: () => void;
  resetKit: () => void;
  updatePad: (index: number, patch: Partial<DrumKit['pads'][number]>) => void;
  movePad: (index: number, direction: -1 | 1) => void;
  assignPreset: (presetId: string) => void;
  updateSelectedPreset: (preset: SynthPreset) => void;
  resetSelectedPreset: () => void;
  saveSelectedPreset: (name?: string) => void;
  duplicateSelectedPreset: () => void;
  switchEngine: (engine: SynthEngineType) => void;
  updateTransport: (patch: Partial<TransportState>) => void;
  toggleTransport: () => void;
  stopTransport: () => void;
  toggleStep: (track: number, step: number, forced?: boolean) => void;
  updateStep: (track: number, step: number, patch: Partial<PatternStep>) => void;
  setSelectedStep: (value: { track: number; step: number } | null) => void;
  clearPattern: () => void;
  setBars: (bars: number) => void;
  duplicateBar: () => void;
  undo: () => void;
  redo: () => void;
  loadRhythm: (id: string) => void;
  savePattern: () => void;
  startExercise: (exercise: Exercise) => void;
  finishExercise: () => void;
  cancelExercise: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function resolvePreset(id: string, custom: SynthPreset[], overrides: Record<string, SynthPreset>) {
  return overrides[id] ?? custom.find((preset) => preset.id === id) ?? FACTORY_PRESETS.find((preset) => preset.id === id) ?? FACTORY_PRESETS[0];
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [area, setAreaState] = useState<Area>('pads');
  const [kit, setKit] = useState<DrumKit>(() => cloneSerializable(FACTORY_KITS[0]));
  const [customPresets, setCustomPresets] = useState<SynthPreset[]>([]);
  const [customKits, setCustomKits] = useState<DrumKit[]>([]);
  const [sessionOverrides, setSessionOverrides] = useState<Record<string, SynthPreset>>({});
  const [pattern, setPattern] = useState<Pattern>(() => cloneSerializable(RHYTHM_PRESETS.find((item) => item.id === 'rhythm-basic-backbeat')!.pattern));
  const [customPatterns, setCustomPatterns] = useState<Pattern[]>([]);
  const [selectedPadIndex, setSelectedPadIndex] = useState(0);
  const [selectedStep, setSelectedStep] = useState<{ track: number; step: number } | null>(null);
  const [transport, setTransport] = useState<TransportState>({ bpm: 112, playing: false, paused: false, loop: true, swing: .06, metronome: false, recording: false, overdub: true, quantize: true, countIn: 0, currentStep: 0 });
  const [activeExercise, setActiveExercise] = useState<ActiveExerciseState | null>(null);
  const [lastAttempt, setLastAttempt] = useState<ExerciseAttempt | null>(null);
  const [attempts, setAttempts] = useState<ExerciseAttempt[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const undoStack = useRef<Pattern[]>([]);
  const redoStack = useRef<Pattern[]>([]);
  const patternRef = useRef(pattern);
  const kitRef = useRef(kit);
  const customPresetsRef = useRef(customPresets);
  const overridesRef = useRef(sessionOverrides);

  useEffect(() => { patternRef.current = pattern; }, [pattern]);
  useEffect(() => { kitRef.current = kit; }, [kit]);
  useEffect(() => { customPresetsRef.current = customPresets; }, [customPresets]);
  useEffect(() => { overridesRef.current = sessionOverrides; }, [sessionOverrides]);

  /* oxlint-disable react/react-compiler -- The transport deliberately reads live refs from its long-lived Web Audio scheduler. */
  const transportService = useMemo(() => new TransportService(
    () => patternRef.current,
    (padId, velocity, time) => {
      const currentKit = kitRef.current;
      const pad = currentKit.pads.find((item) => item.id === padId);
      if (!pad || pad.muted) return;
      audioEngine.trigger(resolvePreset(pad.presetId, customPresetsRef.current, overridesRef.current), { time, velocity, volume: pad.volume, pan: pad.pan, tune: pad.tune });
    },
  ), []);
  /* oxlint-enable react/react-compiler */

  useEffect(() => transportService.subscribe(setTransport), [transportService]);
  useEffect(() => () => transportService.destroy(), [transportService]);

  useEffect(() => {
    Promise.all([
      dbGet<{ id: string; kit?: DrumKit; pattern?: Pattern; bpm?: number; swing?: number; area?: Area }>('session', 'current'),
      dbGetAll<SynthPreset>('customPresets'), dbGetAll<DrumKit>('customKits'), dbGetAll<Pattern>('customPatterns'), dbGetAll<ExerciseAttempt>('attempts'),
    ]).then(([session, savedPresets, savedKits, savedPatterns, savedAttempts]) => {
      setCustomPresets(savedPresets); setCustomKits(savedKits); setCustomPatterns(savedPatterns); setAttempts(savedAttempts);
      if (session?.kit) setKit(session.kit);
      if (session?.pattern) setPattern(session.pattern);
      if (session?.bpm) transportService.update({ bpm: session.bpm, swing: session.swing ?? .06 });
      const requestedArea = new URLSearchParams(window.location.search).get('area');
      if (requestedArea && AREAS.includes(requestedArea as Area)) setAreaState(requestedArea as Area);
      else if (session?.area) setAreaState(session.area);
      setHydrated(true);
    }).catch(() => setHydrated(true));
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, [transportService]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => dbPut('session', { id: 'current', kit, pattern, bpm: transport.bpm, swing: transport.swing, area }).catch(() => undefined), 500);
    return () => window.clearTimeout(timer);
  }, [area, hydrated, kit, pattern, transport.bpm, transport.swing]);

  const setArea = useCallback((next: Area) => setAreaState(next), []);
  const selectedPreset = resolvePreset(kit.pads[selectedPadIndex]?.presetId, customPresets, sessionOverrides);
  const kits = [...FACTORY_KITS, ...customKits];
  const presets = [...FACTORY_PRESETS, ...customPresets];

  const pushPattern = useCallback((next: Pattern) => {
    undoStack.current.push(cloneSerializable(patternRef.current));
    if (undoStack.current.length > 32) undoStack.current.shift();
    redoStack.current = [];
    setPattern(next);
  }, []);

  const triggerPad = useCallback((index: number, velocity = .9) => {
    const pad = kitRef.current.pads[index];
    if (!pad || pad.muted) return;
    void audioEngine.initialize().then(() => {
      const hitTime = audioEngine.currentTime;
      audioEngine.trigger(resolvePreset(pad.presetId, customPresetsRef.current, overridesRef.current), { velocity, volume: pad.volume, pan: pad.pan, tune: pad.tune });
      setActiveExercise((current) => current ? { ...current, hits: [...current.hits, { padIndex: index, time: hitTime, velocity }] } : current);
      const currentTransport = transportService.snapshot;
      if (currentTransport.recording && currentTransport.playing) {
        const step = currentTransport.currentStep;
        setPattern((current) => {
          const next = cloneSerializable(current);
          const trackIndex = next.tracks.findIndex((track) => track.padId === pad.id);
          if (trackIndex >= 0 && next.tracks[trackIndex].steps[step]) next.tracks[trackIndex].steps[step] = { active: true, velocity, accent: velocity > .92, probability: 1, microtiming: currentTransport.quantize ? 0 : 0 };
          return next;
        });
      }
    });
  }, [transportService]);

  const loadKit = useCallback((id: string) => {
    const next = [...FACTORY_KITS, ...customKits].find((item) => item.id === id);
    if (next) { setKit(cloneSerializable(next)); setSelectedPadIndex(0); setSessionOverrides({}); }
  }, [customKits]);

  const saveKit = useCallback(() => {
    const next = cloneKit(kit, `${kit.name.replace(/ Copy$/, '')} Custom`);
    setCustomKits((current) => [...current, next]); setKit(next); void dbPut('customKits', next);
  }, [kit]);

  const resetKit = useCallback(() => {
    const factory = FACTORY_KITS.find((item) => item.id === kit.id) ?? FACTORY_KITS[0];
    setKit(cloneSerializable(factory)); setSessionOverrides({});
  }, [kit.id]);

  const updatePad = useCallback((index: number, patch: Partial<DrumKit['pads'][number]>) => setKit((current) => ({ ...current, pads: current.pads.map((pad, padIndex) => padIndex === index ? { ...pad, ...patch } : pad) })), []);
  const movePad = useCallback((index: number, direction: -1 | 1) => setKit((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.pads.length) return current;
    const pads = [...current.pads]; [pads[index], pads[target]] = [pads[target], pads[index]];
    setSelectedPadIndex(target); return { ...current, pads };
  }), []);
  const assignPreset = useCallback((presetId: string) => updatePad(selectedPadIndex, { presetId }), [selectedPadIndex, updatePad]);
  const updateSelectedPreset = useCallback((preset: SynthPreset) => setSessionOverrides((current) => ({ ...current, [kit.pads[selectedPadIndex].presetId]: { ...preset, id: kit.pads[selectedPadIndex].presetId } })), [kit.pads, selectedPadIndex]);
  const resetSelectedPreset = useCallback(() => setSessionOverrides((current) => { const next = { ...current }; delete next[kit.pads[selectedPadIndex].presetId]; return next; }), [kit.pads, selectedPadIndex]);
  const saveSelectedPreset = useCallback((name?: string) => {
    const next = clonePreset(selectedPreset, name || `${selectedPreset.name} Custom`);
    setCustomPresets((current) => [...current, next]); updatePad(selectedPadIndex, { presetId: next.id }); void dbPut('customPresets', next);
  }, [selectedPadIndex, selectedPreset, updatePad]);
  const duplicateSelectedPreset = useCallback(() => saveSelectedPreset(`${selectedPreset.name} Copy`), [saveSelectedPreset, selectedPreset.name]);
  const switchEngine = useCallback((engine: SynthEngineType) => {
    const source = FACTORY_PRESETS.find((item) => item.engineType === engine)!;
    updateSelectedPreset({ ...cloneSerializable(source), id: selectedPreset.id, name: selectedPreset.name, factory: false });
  }, [selectedPreset, updateSelectedPreset]);

  const updateTransport = useCallback((patch: Partial<TransportState>) => transportService.update(patch), [transportService]);
  const toggleTransport = useCallback(() => { void transportService.toggle(); }, [transportService]);
  const stopTransport = useCallback(() => transportService.stop(), [transportService]);
  const toggleStep = useCallback((track: number, step: number, forced?: boolean) => {
    const next = cloneSerializable(patternRef.current); const target = next.tracks[track]?.steps[step]; if (!target) return;
    target.active = forced ?? !target.active; pushPattern(next); setSelectedStep({ track, step });
  }, [pushPattern]);
  const updateStep = useCallback((track: number, step: number, patch: Partial<PatternStep>) => {
    const next = cloneSerializable(patternRef.current); if (!next.tracks[track]?.steps[step]) return;
    next.tracks[track].steps[step] = { ...next.tracks[track].steps[step], ...patch }; pushPattern(next);
  }, [pushPattern]);
  const clearPattern = useCallback(() => { const next = cloneSerializable(patternRef.current); next.tracks.forEach((track) => track.steps.forEach((step) => { step.active = false; })); pushPattern(next); }, [pushPattern]);
  const setBars = useCallback((bars: number) => pushPattern(resizePattern(patternRef.current, bars)), [pushPattern]);
  const duplicateBar = useCallback(() => { const current = patternRef.current; if (current.bars >= 4) return; const next = resizePattern(current, current.bars + 1); next.tracks.forEach((track, index) => { for (let step = 0; step < current.stepsPerBar; step += 1) track.steps[current.bars * current.stepsPerBar + step] = cloneSerializable(current.tracks[index].steps[step]); }); pushPattern(next); }, [pushPattern]);
  const undo = useCallback(() => { const previous = undoStack.current.pop(); if (!previous) return; redoStack.current.push(cloneSerializable(patternRef.current)); setPattern(previous); }, []);
  const redo = useCallback(() => { const next = redoStack.current.pop(); if (!next) return; undoStack.current.push(cloneSerializable(patternRef.current)); setPattern(next); }, []);
  const loadRhythm = useCallback((id: string) => { const rhythm = rhythmById(id); setPattern(cloneSerializable(rhythm.pattern)); transportService.update({ bpm: rhythm.bpm }); }, [transportService]);
  const savePattern = useCallback(() => { const next = { ...cloneSerializable(pattern), id: `custom-pattern-${Date.now()}`, name: `${pattern.name} Copy`, factory: false }; setCustomPatterns((current) => [...current, next]); setPattern(next); void dbPut('customPatterns', next); }, [pattern]);

  const startExercise = useCallback((exercise: Exercise) => {
    const exerciseKit = FACTORY_KITS.find((item) => item.id === exercise.kitPresetId) ?? FACTORY_KITS.at(-1)!;
    const rhythm = rhythmById(exercise.rhythmPresetId);
    setKit(cloneSerializable(exerciseKit)); setPattern(cloneSerializable(rhythm.pattern)); setSelectedPadIndex(exercise.targetPads[0] ?? 0);
    transportService.update({ bpm: exercise.bpm, metronome: exercise.metronome.enabled, loop: true });
    void audioEngine.initialize().then(() => {
      const startAudioTime = audioEngine.currentTime + exercise.countIn * secondsPerBeat(exercise.bpm);
      setActiveExercise({ exercise, startedAt: Date.now(), startAudioTime, hits: [] });
      setAreaState('pads'); void transportService.play();
    });
  }, [transportService]);

  const finishExercise = useCallback(() => {
    if (!activeExercise) return;
    const { exercise, startAudioTime, hits, startedAt } = activeExercise;
    const stepDuration = secondsPerBeat(exercise.bpm) / 4;
    const expected = Array.from({ length: exercise.bars }, (_, bar) => exercise.targetSteps.map((step, index) => ({ time: startAudioTime + (bar * 16 + step) * stepDuration, padIndex: exercise.targetPads[index % exercise.targetPads.length] }))).flat();
    const attempt = scorePerformance({ exerciseId: exercise.id, expected, actual: hits, toleranceMs: exercise.toleranceMs, startedAt });
    setLastAttempt(attempt); setAttempts((current) => [attempt, ...current]); setActiveExercise(null); setAreaState('exercises'); transportService.stop(); void dbPut('attempts', attempt);
  }, [activeExercise, transportService]);
  const cancelExercise = useCallback(() => { setActiveExercise(null); transportService.stop(); setAreaState('exercises'); }, [transportService]);

  const value: AppContextValue = {
    area, setArea, kit, kits, presets, selectedPadIndex, selectedPreset, pattern, customPatterns, transport, selectedStep, activeExercise, lastAttempt, attempts, hydrated,
    triggerPad, selectPad: setSelectedPadIndex, loadKit, saveKit, resetKit, updatePad, movePad, assignPreset, updateSelectedPreset, resetSelectedPreset, saveSelectedPreset, duplicateSelectedPreset, switchEngine,
    updateTransport, toggleTransport, stopTransport, toggleStep, updateStep, setSelectedStep, clearPattern, setBars, duplicateBar, undo, redo, loadRhythm, savePattern,
    startExercise, finishExercise, cancelExercise,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
