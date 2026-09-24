'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import type { ClickLevel, DrumKit, ExerciseHit, Pattern, PatternStep, SynthEngineType, SynthPreset, TransportState } from '../model/types';
import { cloneSerializable } from '../model/types';
import { dbGet, dbGetAll, dbPut } from '../persistence/database';
import { cloneKit, clonePreset, FACTORY_KITS, FACTORY_PRESETS } from '../presets/factorySounds';
import { RHYTHM_PRESETS, rhythmById } from '../presets/rhythms';
import { TransportService } from '../transport/TransportService';
import { normalizePreset, selectSlotEngine, type LegacySynthPreset } from '../model/voice';
import { resizePattern, setPatternMeter } from '../transport/timing';

export type Area = 'pads' | 'synth' | 'sequencer' | 'exercises' | 'song';
const AREAS: Area[] = ['pads', 'synth', 'sequencer', 'exercises', 'song'];

/** Which sequencer lanes are folded, remembered per pattern. */
export interface LaneView {
  patternId: string;
  collapsed: string[];
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
  hydrated: boolean;
  /** `eventTime` is the DOM event timestamp, used to time the hit as heard. */
  triggerPad: (index: number, velocity?: number, eventTime?: number) => void;
  onPadHit: (listener: (hit: ExerciseHit) => void) => () => void;
  /** Plays this pattern instead of the user's own, e.g. during practice. */
  setPatternOverride: (pattern: Pattern | null) => void;
  transportService: TransportService;
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
  switchSlotEngine: (slot: 0 | 1, engine: SynthEngineType) => void;
  updateTransport: (patch: Partial<TransportState>) => void;
  toggleTransport: () => void;
  stopTransport: () => void;
  toggleStep: (track: number, step: number, forced?: boolean) => void;
  updateStep: (track: number, step: number, patch: Partial<PatternStep>) => void;
  setSelectedStep: (value: { track: number; step: number } | null) => void;
  clearPattern: () => void;
  setBars: (bars: number) => void;
  setMeter: (beatsPerBar: number, beatUnit: number) => void;
  laneView: LaneView | null;
  setLaneView: (view: LaneView) => void;
  duplicateBar: () => void;
  undo: () => void;
  redo: () => void;
  loadRhythm: (id: string) => void;
  savePattern: () => void;
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
  const [transport, setTransport] = useState<TransportState>({ bpm: 112, playing: false, paused: false, loop: true, swing: .06, metronome: false, clickLevels: [], countIn: 0, currentStep: 0 });
  const [laneView, setLaneView] = useState<LaneView | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const undoStack = useRef<Pattern[]>([]);
  const redoStack = useRef<Pattern[]>([]);
  const patternRef = useRef(pattern);
  const patternOverride = useRef<Pattern | null>(null);
  const padHitListeners = useRef(new Set<(hit: ExerciseHit) => void>());
  const kitRef = useRef(kit);
  const customPresetsRef = useRef(customPresets);
  const overridesRef = useRef(sessionOverrides);

  useEffect(() => { patternRef.current = pattern; }, [pattern]);
  useEffect(() => { kitRef.current = kit; }, [kit]);
  useEffect(() => { customPresetsRef.current = customPresets; }, [customPresets]);
  useEffect(() => { overridesRef.current = sessionOverrides; }, [sessionOverrides]);

  /* oxlint-disable react/react-compiler -- The transport deliberately reads live refs from its long-lived Web Audio scheduler. */
  const transportService = useMemo(() => new TransportService(
    () => patternOverride.current ?? patternRef.current,
    (padId, velocity, time) => {
      const currentKit = kitRef.current;
      const pad = currentKit.pads.find((item) => item.id === padId);
      if (!pad || pad.muted) return;
      audioEngine.trigger(resolvePreset(pad.presetId, customPresetsRef.current, overridesRef.current), { padId: pad.id, time, velocity, volume: pad.volume, pan: pad.pan, tune: pad.tune });
    },
  ), []);
  /* oxlint-enable react/react-compiler */

  useEffect(() => transportService.subscribe(setTransport), [transportService]);
  useEffect(() => () => transportService.destroy(), [transportService]);

  useEffect(() => {
    Promise.all([
      dbGet<{ id: string; kit?: DrumKit; pattern?: Pattern; bpm?: number; swing?: number; clickLevels?: ClickLevel[]; area?: Area }>('session', 'current'),
      dbGetAll<SynthPreset | LegacySynthPreset>('customPresets'), dbGetAll<DrumKit>('customKits'), dbGetAll<Pattern>('customPatterns'),
    ]).then(([session, savedPresets, savedKits, savedPatterns]) => {
      setCustomPresets(savedPresets.map(normalizePreset)); setCustomKits(savedKits); setCustomPatterns(savedPatterns);
      if (session?.kit) setKit(session.kit);
      if (session?.pattern) setPattern(session.pattern);
      if (session?.bpm) transportService.update({ bpm: session.bpm, swing: session.swing ?? .06 });
      if (session?.clickLevels) transportService.update({ clickLevels: session.clickLevels });
      const requestedArea = new URLSearchParams(window.location.search).get('area');
      if (requestedArea && AREAS.includes(requestedArea as Area)) setAreaState(requestedArea as Area);
      else if (session?.area) setAreaState(session.area);
      setHydrated(true);
    }).catch(() => setHydrated(true));
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, [transportService]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => dbPut('session', { id: 'current', kit, pattern, bpm: transport.bpm, swing: transport.swing, clickLevels: transport.clickLevels, area }).catch(() => undefined), 500);
    return () => window.clearTimeout(timer);
  }, [area, hydrated, kit, pattern, transport.bpm, transport.swing, transport.clickLevels]);

  const setArea = useCallback((next: Area) => setAreaState(next), []);
  const selectedPreset = resolvePreset(kit.pads[selectedPadIndex]?.presetId, customPresets, sessionOverrides);
  const kits = [...FACTORY_KITS, ...customKits];
  const presets = [...FACTORY_PRESETS, ...customPresets].map((preset) => sessionOverrides[preset.id] ?? preset);

  const pushPattern = useCallback((next: Pattern) => {
    undoStack.current.push(cloneSerializable(patternRef.current));
    if (undoStack.current.length > 32) undoStack.current.shift();
    redoStack.current = [];
    setPattern(next);
  }, []);

  const triggerPad = useCallback((index: number, velocity = .9, eventTime = performance.now()) => {
    const pad = kitRef.current.pads[index];
    if (!pad) return;
    void audioEngine.initialize().then(() => {
      // A tap counts for practice even on a muted pad.
      const hit = { padIndex: index, time: audioEngine.audibleTime(eventTime), velocity };
      padHitListeners.current.forEach((listener) => listener(hit));
      if (!pad.muted) audioEngine.trigger(resolvePreset(pad.presetId, customPresetsRef.current, overridesRef.current), { padId: pad.id, velocity, volume: pad.volume, pan: pad.pan, tune: pad.tune });
    });
  }, []);
  const onPadHit = useCallback((listener: (hit: ExerciseHit) => void) => {
    padHitListeners.current.add(listener);
    return () => { padHitListeners.current.delete(listener); };
  }, []);
  const setPatternOverride = useCallback((next: Pattern | null) => {
    patternOverride.current = next;
  }, []);

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
  const switchSlotEngine = useCallback((slot: 0 | 1, engine: SynthEngineType) => updateSelectedPreset(selectSlotEngine(selectedPreset, slot, engine)), [selectedPreset, updateSelectedPreset]);

  /* oxlint-disable react/react-compiler -- These callbacks intentionally expose stable access to the long-lived transport service and mutable scheduler refs. */
  const updateTransport = useCallback((patch: Partial<TransportState>) => transportService.update(patch), [transportService]);
  const toggleTransport = useCallback(() => { void transportService.toggle(); }, [transportService]);
  const stopTransport = useCallback(() => transportService.stop(), [transportService]);
  const toggleStep = useCallback((track: number, step: number, forced?: boolean) => {
    const next = cloneSerializable(patternRef.current); const target = next.tracks[track]?.steps[step]; if (!target) return;
    target.active = forced ?? !target.active; pushPattern(next); setSelectedStep(target.active ? { track, step } : null);
  }, [pushPattern]);
  const updateStep = useCallback((track: number, step: number, patch: Partial<PatternStep>) => {
    const next = cloneSerializable(patternRef.current); if (!next.tracks[track]?.steps[step]) return;
    next.tracks[track].steps[step] = { ...next.tracks[track].steps[step], ...patch }; pushPattern(next);
  }, [pushPattern]);
  const clearPattern = useCallback(() => { const next = cloneSerializable(patternRef.current); next.tracks.forEach((track) => track.steps.forEach((step) => { step.active = false; })); pushPattern(next); }, [pushPattern]);
  const setBars = useCallback((bars: number) => pushPattern(resizePattern(patternRef.current, bars)), [pushPattern]);
  const setMeter = useCallback((beatsPerBar: number, beatUnit: number) => {
    const current = patternRef.current;
    if (current.beatsPerBar === beatsPerBar && current.beatUnit === beatUnit) return;
    const next = setPatternMeter(current, beatsPerBar, beatUnit);
    pushPattern(next);
    // The scheduler reads this ref; update it now so the click realigns to the new bar.
    patternRef.current = next;
    transportService.realign();
  }, [pushPattern, transportService]);
  const duplicateBar = useCallback(() => { const current = patternRef.current; if (current.bars >= 4) return; const next = resizePattern(current, current.bars + 1); next.tracks.forEach((track, index) => { for (let step = 0; step < current.stepsPerBar; step += 1) track.steps[current.bars * current.stepsPerBar + step] = cloneSerializable(current.tracks[index].steps[step]); }); pushPattern(next); }, [pushPattern]);
  const undo = useCallback(() => { const previous = undoStack.current.pop(); if (!previous) return; redoStack.current.push(cloneSerializable(patternRef.current)); setPattern(previous); }, []);
  const redo = useCallback(() => { const next = redoStack.current.pop(); if (!next) return; undoStack.current.push(cloneSerializable(patternRef.current)); setPattern(next); }, []);
  const loadRhythm = useCallback((id: string) => { const rhythm = rhythmById(id); setPattern(cloneSerializable(rhythm.pattern)); transportService.update({ bpm: rhythm.bpm }); }, [transportService]);
  const savePattern = useCallback(() => { const next = { ...cloneSerializable(pattern), id: `custom-pattern-${Date.now()}`, name: `${pattern.name} Copy`, factory: false }; setCustomPatterns((current) => [...current, next]); setPattern(next); void dbPut('customPatterns', next); }, [pattern]);
  /* oxlint-enable react/react-compiler */

  const value: AppContextValue = {
    area, setArea, kit, kits, presets, selectedPadIndex, selectedPreset, pattern, customPatterns, transport, selectedStep, hydrated,
    triggerPad, onPadHit, setPatternOverride, transportService, selectPad: setSelectedPadIndex, loadKit, saveKit, resetKit, updatePad, movePad, assignPreset, updateSelectedPreset, resetSelectedPreset, saveSelectedPreset, duplicateSelectedPreset, switchSlotEngine,
    updateTransport, toggleTransport, stopTransport, toggleStep, updateStep, setSelectedStep, clearPattern, setBars, setMeter, laneView, setLaneView, duplicateBar, undo, redo, loadRhythm, savePattern,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
