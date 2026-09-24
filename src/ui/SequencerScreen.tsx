'use client';

import { useRef, useState } from 'react';
import { Copy, Eraser, Layers3, Redo2, Save, Undo2 } from 'lucide-react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { RHYTHM_PRESETS } from '../presets/rhythms';
import { useApp } from '../state/AppContext';
import { TransportBar } from './TransportBar';
import { Metronome } from './Metronome';

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
  } = useApp();
  const [paint, setPaint] = useState<{
    pointer: number;
    active: boolean;
  } | null>(null);
  const lastPainted = useRef('');
  const gridRef = useRef<HTMLDivElement>(null);
  const totalSteps = pattern.bars * pattern.stepsPerBar;

  const beginPaint = (
    track: number,
    step: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
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

  return (
    <section className="screen sequencer-screen">
      <header className="screen-header machine-header">
        <div className="screen-title">
          <span>DRUM MACHINE</span>
          <h1>{pattern.name}</h1>
        </div>
        <TransportBar />
      </header>

      <div className="sequence-practice-tools" data-gesture-lock>
        <Metronome />
        <button
          className={transport.recording ? 'recording-enabled' : ''}
          aria-pressed={transport.recording}
          onClick={() => updateTransport({ recording: !transport.recording })}
        >
          {transport.recording ? 'Recording armed' : 'Record pads'}
        </button>
      </div>

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
          <span className="track-spacer">TRACK</span>
          {Array.from({ length: totalSteps }, (_, step) => (
            <i className={step % 4 === 0 ? 'beat' : ''} key={step}>
              {step % 4 === 0 ? Math.floor(step / 4) + 1 : '·'}
            </i>
          ))}
        </div>
        <div
          className="sequence-grid"
          ref={gridRef}
          onPointerMove={movePaint}
          onPointerUp={endPaint}
          onPointerCancel={endPaint}
          onLostPointerCapture={endPaint}
        >
          {pattern.tracks.map((track, trackIndex) => (
            <div
              className="track-row"
              style={{ '--steps': totalSteps } as React.CSSProperties}
              key={track.padId}
            >
              <button
                className="track-label"
                onPointerDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() =>
                  setSelectedStep({
                    track: trackIndex,
                    step: selectedStep?.step ?? 0,
                  })
                }
              >
                <span>
                  {kit.pads[trackIndex]?.label ?? `PAD ${trackIndex + 1}`}
                  <small>{trackIndex + 1}</small>
                </span>
              </button>
              {track.steps.map((step, stepIndex) => (
                <button
                  key={stepIndex}
                  data-track={trackIndex}
                  data-step={stepIndex}
                  className={`step-cell ${step.active ? 'active' : ''} ${step.active && step.accent ? 'accent' : ''} ${step.active && !step.accent && step.velocity < 0.5 ? 'soft' : ''} ${transport.playing && transport.currentStep === stepIndex ? 'playhead' : ''} ${selectedStep?.track === trackIndex && selectedStep.step === stepIndex ? 'selected' : ''} ${stepIndex % 4 === 0 ? 'beat-start' : ''}`}
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
                  aria-label={`${kit.pads[trackIndex]?.label} step ${stepIndex + 1}${step.active ? ' active' : ''}`}
                  aria-pressed={step.active}
                >
                  <span />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="machine-tools" data-gesture-lock>
        <button onClick={undo}>
          <Undo2 /> Undo
        </button>
        <button onClick={redo}>
          <Redo2 /> Redo
        </button>
        <button onClick={clearPattern}>
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

      <section
        className={`step-inspector ${selected ? 'visible' : ''}`}
        data-gesture-lock
      >
        {selected && selectedStep ? (
          <>
            <header>
              <div>
                <span>STEP {selectedStep.step + 1}</span>
                <strong>{kit.pads[selectedStep.track]?.label}</strong>
              </div>
              <button onClick={() => setSelectedStep(null)}>×</button>
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
          </>
        ) : (
          <div className="step-empty">
            Tap a step to edit velocity, probability, accent and microtiming.
          </div>
        )}
      </section>
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
