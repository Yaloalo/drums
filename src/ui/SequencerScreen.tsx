'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Eraser,
  Layers3,
  ListChevronsDownUp,
  ListChevronsUpDown,
  Redo2,
  Save,
  Undo2,
  X,
} from 'lucide-react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { audioEngine } from '../audio/AudioEngine';
import type { PatternTrack } from '../model/types';
import { RHYTHM_PRESETS } from '../presets/rhythms';
import { useApp } from '../state/AppContext';
import { TransportBar } from './TransportBar';

const hasSteps = (track: PatternTrack) =>
  track.steps.some((step) => step.active);

export function SequencerScreen() {
  const {
    pattern,
    kit,
    kits,
    loadKit,
    transport,
    selectedStep,
    setSelectedStep,
    toggleStep,
    updateStep,
    clearPattern,
    setBars,
    duplicateBar,
    undo,
    redo,
    loadRhythm,
    savePattern,
    updateTransport,
    laneView,
    setLaneView,
  } = useApp();
  const [paint, setPaint] = useState<{
    pointer: number;
    active: boolean;
  } | null>(null);
  const lastPainted = useRef('');
  const gridRef = useRef<HTMLDivElement>(null);
  const flashes = useRef(new Map<string, HTMLElement>());
  const totalSteps = pattern.bars * pattern.stepsPerBar;
  const stepsPerBeat = Math.max(1, pattern.subdivision / pattern.beatUnit);

  // Until a lane is folded or opened by hand, empty lanes start folded.
  const anyActive = pattern.tracks.some(hasSteps);
  const emptyLanes = pattern.tracks
    .filter((track) => !hasSteps(track))
    .map((track) => track.padId);
  const collapsed = new Set(
    laneView?.patternId === pattern.id
      ? laneView.collapsed
      : anyActive
        ? emptyLanes
        : [],
  );
  const pinLanes = (next: Set<string>) =>
    setLaneView({ patternId: pattern.id, collapsed: [...next] });
  // Freeze the default before editing, so a lane never folds under a finger.
  const holdLanes = () => {
    if (laneView?.patternId !== pattern.id) pinLanes(collapsed);
  };
  const toggleLane = (padId: string) => {
    const next = new Set(collapsed);
    if (next.has(padId)) next.delete(padId);
    else next.add(padId);
    pinLanes(next);
  };

  useEffect(() => {
    const timers = new Set<number>();
    const unsubscribe = audioEngine.onHit(({ padId, delay }) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        const flash = flashes.current.get(padId);
        if (
          !flash ||
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
        )
          return;
        flash.getAnimations().forEach((animation) => animation.cancel());
        flash.animate([{ opacity: 0.85 }, { opacity: 0 }], {
          duration: 240,
          easing: 'ease-out',
        });
      }, delay);
      timers.add(timer);
    });
    return () => {
      unsubscribe();
      timers.forEach(window.clearTimeout);
    };
  }, []);

  const beginPaint = (
    track: number,
    step: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    holdLanes();
    const active = !pattern.tracks[track].steps[step].active;
    toggleStep(track, step, active);
    setPaint({ pointer: event.pointerId, active });
    lastPainted.current = `${track}:${step}`;
    gridRef.current?.setPointerCapture(event.pointerId);
  };
  const movePaint = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!paint || event.pointerId !== paint.pointer) return;
    const element = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-track][data-step]');
    if (!element) return;
    const track = Number(element.dataset.track);
    const step = Number(element.dataset.step);
    const key = `${track}:${step}`;
    if (key === lastPainted.current) return;
    lastPainted.current = key;
    toggleStep(track, step, paint.active);
  };
  const endPaint = () => setPaint(null);
  const selected = selectedStep
    ? pattern.tracks[selectedStep.track]?.steps[selectedStep.step]
    : null;
  const flashRef = (padId: string) => (element: HTMLElement | null) => {
    if (element) flashes.current.set(padId, element);
    else flashes.current.delete(padId);
  };
  const stepClass = (step: number) =>
    `${step % stepsPerBeat === 0 ? 'beat-start' : ''} ${step > 0 && step % pattern.stepsPerBar === 0 ? 'bar-start' : ''}`;

  return (
    <section className="screen sequencer-screen">
      <header className="screen-header machine-header">
        <div className="screen-title">
          <span>DRUM MACHINE</span>
          <h1>{pattern.name}</h1>
        </div>
        <TransportBar />
      </header>

      <div className="machine-meta" data-gesture-lock>
        <label>
          <span>PATTERN</span>
          <NativeSelect
            value={
              RHYTHM_PRESETS.find((item) => item.pattern.id === pattern.id)
                ?.id ?? ''
            }
            onChange={(event) => loadRhythm(event.target.value)}
          >
            <NativeSelectOption value="" disabled>
              Custom pattern
            </NativeSelectOption>
            {RHYTHM_PRESETS.map((rhythm) => (
              <NativeSelectOption key={rhythm.id} value={rhythm.id}>
                {rhythm.title} · {rhythm.meter}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label>
          <span>KIT</span>
          <NativeSelect
            value={kit.id}
            onChange={(event) => loadKit(event.target.value)}
          >
            {kits.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="swing">
          <span>SWING {Math.round(transport.swing * 100)}%</span>
          <Slider
            aria-label="Swing"
            aria-valuetext={`${Math.round(transport.swing * 100)} percent`}
            value={[transport.swing]}
            min={0}
            max={0.45}
            step={0.01}
            onValueChange={(value) =>
              updateTransport({
                swing: typeof value === 'number' ? value : value[0],
              })
            }
          />
        </label>
      </div>

      <div className="sequence-scroll" data-gesture-lock>
        <div
          className="step-ruler"
          style={{ '--steps': totalSteps } as React.CSSProperties}
        >
          <span className="track-spacer">
            {collapsed.size ? (
              <button onClick={() => pinLanes(new Set())}>
                <ListChevronsUpDown /> Show all
              </button>
            ) : (
              <button
                onClick={() => pinLanes(new Set(emptyLanes))}
                disabled={!anyActive || !emptyLanes.length}
              >
                <ListChevronsDownUp /> Fold empty
              </button>
            )}
          </span>
          {Array.from({ length: totalSteps }, (_, step) => {
            const inBar = step % pattern.stepsPerBar;
            return (
              <i
                className={`${inBar % stepsPerBeat === 0 ? 'beat' : ''} ${inBar === 0 ? 'bar' : ''} ${stepClass(step)}`}
                key={step}
              >
                {inBar % stepsPerBeat === 0
                  ? `${Math.floor(step / pattern.stepsPerBar) + 1}.${inBar / stepsPerBeat + 1}`
                  : '·'}
              </i>
            );
          })}
        </div>
        <div
          className="sequence-grid"
          ref={gridRef}
          onPointerMove={movePaint}
          onPointerUp={endPaint}
          onPointerCancel={endPaint}
          onLostPointerCapture={endPaint}
        >
          {pattern.tracks.map((track, trackIndex) => {
            const label =
              kit.pads[trackIndex]?.label ?? `PAD ${trackIndex + 1}`;
            if (collapsed.has(track.padId))
              return (
                <div
                  className="track-row collapsed"
                  style={{ '--steps': totalSteps } as React.CSSProperties}
                  key={track.padId}
                >
                  <button
                    className="track-label"
                    aria-expanded={false}
                    aria-label={`Show ${label} lane`}
                    onClick={() => toggleLane(track.padId)}
                  >
                    <ChevronRight />
                    <span>{label}</span>
                  </button>
                  <button
                    className="lane-strip"
                    tabIndex={-1}
                    aria-hidden="true"
                    onClick={() => toggleLane(track.padId)}
                  >
                    {track.steps.map((step, stepIndex) => (
                      <i
                        key={stepIndex}
                        className={`${step.active ? (step.accent ? 'on accent' : 'on') : ''} ${stepClass(stepIndex)} ${transport.playing && transport.currentStep === stepIndex ? 'playhead' : ''}`}
                      />
                    ))}
                    <span className="lane-flash" ref={flashRef(track.padId)} />
                  </button>
                </div>
              );
            return (
              <div
                className="track-row"
                style={{ '--steps': totalSteps } as React.CSSProperties}
                key={track.padId}
              >
                <button
                  className="track-label"
                  aria-expanded={true}
                  aria-label={`Fold ${label} lane`}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => toggleLane(track.padId)}
                >
                  <ChevronDown />
                  <span>
                    {label}
                    <small>{trackIndex + 1}</small>
                  </span>
                  <span className="lane-flash" ref={flashRef(track.padId)} />
                </button>
                {track.steps.map((step, stepIndex) => (
                  <button
                    key={stepIndex}
                    data-track={trackIndex}
                    data-step={stepIndex}
                    className={`step-cell ${step.active ? 'active' : ''} ${step.active && step.accent ? 'accent' : ''} ${step.active && !step.accent && step.velocity < 0.5 ? 'soft' : ''} ${transport.playing && transport.currentStep === stepIndex ? 'playhead' : ''} ${selectedStep?.track === trackIndex && selectedStep.step === stepIndex ? 'selected' : ''} ${stepClass(stepIndex)}`}
                    style={
                      {
                        '--fill': step.accent
                          ? '100%'
                          : step.velocity < 0.5
                            ? '26%'
                            : '52%',
                      } as React.CSSProperties
                    }
                    onPointerDown={(event) =>
                      beginPaint(trackIndex, stepIndex, event)
                    }
                    onClick={(event) => {
                      if (event.detail === 0) toggleStep(trackIndex, stepIndex);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      updateStep(trackIndex, stepIndex, {
                        active: true,
                        accent: !step.accent,
                      });
                    }}
                    aria-label={`${label} step ${stepIndex + 1}${step.active ? ' active' : ''}`}
                    aria-pressed={step.active}
                  >
                    <span />
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="machine-tools" data-gesture-lock>
        <button onClick={undo}>
          <Undo2 /> Undo
        </button>
        <button onClick={redo}>
          <Redo2 /> Redo
        </button>
        <button
          onClick={() => {
            holdLanes();
            clearPattern();
          }}
        >
          <Eraser /> Clear
        </button>
        <button onClick={duplicateBar} disabled={pattern.bars >= 4}>
          <Copy /> Bar
        </button>
        <label>
          <Layers3 />
          <span>
            {pattern.bars} BAR{pattern.bars > 1 ? 'S' : ''}
          </span>
          <NativeSelect
            value={pattern.bars}
            onChange={(event) => setBars(Number(event.target.value))}
          >
            {[1, 2, 3, 4].map((bars) => (
              <NativeSelectOption value={bars} key={bars}>
                {bars}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <button onClick={savePattern}>
          <Save /> Save copy
        </button>
      </div>

      {selected?.active && selectedStep && (
        <section className="step-inspector" data-gesture-lock>
          <header>
            <span>STEP {selectedStep.step + 1}</span>
            <strong>{kit.pads[selectedStep.track]?.label}</strong>
          </header>
          <div className="step-params">
            <Parameter
              label="VELOCITY"
              value={selected.velocity}
              min={0.05}
              max={1}
              step={0.01}
              onChange={(velocity) =>
                updateStep(selectedStep.track, selectedStep.step, {
                  velocity,
                })
              }
            />
            <Parameter
              label="PROBABILITY"
              value={selected.probability}
              min={0}
              max={1}
              step={0.01}
              onChange={(probability) =>
                updateStep(selectedStep.track, selectedStep.step, {
                  probability,
                })
              }
            />
            <Parameter
              label="MICRO"
              value={selected.microtiming}
              min={-80}
              max={80}
              step={1}
              suffix=" ms"
              onChange={(microtiming) =>
                updateStep(selectedStep.track, selectedStep.step, {
                  microtiming,
                })
              }
            />
            <div className="accent-switch">
              ACCENT{' '}
              <Switch
                aria-label="Accent this step"
                checked={selected.accent}
                onCheckedChange={(accent) =>
                  updateStep(selectedStep.track, selectedStep.step, {
                    accent,
                    velocity: accent ? 1 : selected.velocity,
                  })
                }
              />
            </div>
          </div>
          <button
            className="step-inspector-close"
            aria-label="Close step editor"
            onClick={() => setSelectedStep(null)}
          >
            <X />
          </button>
        </section>
      )}
    </section>
  );
}

function Parameter({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <Slider
        aria-label={label}
        aria-valuetext={
          step < 1 ? `${Math.round(value * 100)} percent` : `${value}${suffix}`
        }
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) =>
          onChange(typeof next === 'number' ? next : next[0])
        }
      />
      <output>
        {step < 1 ? Math.round(value * 100) : Math.round(value)}
        {step < 1 ? '%' : suffix}
      </output>
    </label>
  );
}
