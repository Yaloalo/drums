'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  SlidersHorizontal,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  exportUserData,
  importUserData,
  parseUserData,
  serializeUserData,
} from '../persistence/database';
import { useApp } from '../state/AppContext';
import { TransportBar } from './TransportBar';
import { PadWaveform } from './PadWaveform';
import { audioEngine } from '../audio/AudioEngine';

export function PadsScreen() {
  const {
    kit,
    kits,
    presets,
    loadKit,
    selectedPadIndex,
    selectPad,
    selectedPreset,
    triggerPad,
    updatePad,
    movePad,
    assignPreset,
    saveKit,
    resetKit,
    setArea,
    activeExercise,
    finishExercise,
    cancelExercise,
    hydrated,
  } = useApp();
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const padElements = useRef(new Map<string, HTMLButtonElement>());
  const pointers = useRef(new Map<number, number>());

  useEffect(() => {
    const timers = new Set<number>();
    const unsubscribe = audioEngine.onHit(({ padId, delay, duration }) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        const element = padElements.current.get(padId);
        if (!element) return;
        const color = getComputedStyle(element).getPropertyValue('--chord');
        element.getAnimations().forEach((animation) => animation.cancel());
        element.animate(
          [
            { borderColor: color, boxShadow: `inset 0 0 0 1px ${color}` },
            { borderColor: color, offset: 0.45 },
            { boxShadow: 'none' },
          ],
          { duration: 160 },
        );
        const playhead = element.querySelector('.pad-playhead');
        playhead?.getAnimations().forEach((animation) => animation.cancel());
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
          playhead?.animate(
            [
              { left: '8%', opacity: 1 },
              { left: '92%', opacity: 0 },
            ],
            { duration: Math.max(80, duration), easing: 'linear' },
          );
      }, delay);
      timers.add(timer);
    });
    return () => {
      unsubscribe();
      timers.forEach(window.clearTimeout);
    };
  }, []);

  const down = (
    index: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, index);
    setPressed((current) => new Set(current).add(index));
    selectPad(index);
    triggerPad(
      index,
      event.pointerType === 'pen' ? Math.max(0.3, event.pressure) : 0.88,
    );
  };
  const up = (pointerId: number) => {
    pointers.current.delete(pointerId);
    setPressed(new Set(pointers.current.values()));
  };

  const downloadData = async () => {
    const blob = new Blob([serializeUserData(await exportUserData())], {
      type: 'application/json',
    });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `pulse-foundry-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };
  const importData = async (file?: File) => {
    if (!file) return;
    await importUserData(parseUserData(await file.text()));
    window.location.reload();
  };

  return (
    <section className="screen pads-screen" aria-label="Performance pads">
      <div className="performance-heading">
        <div className="screen-title">
          <span>INSTRUMENT / PERFORMANCE</span>
          <h1>Drum pads</h1>
        </div>
        <button className="text-link" onClick={() => setArea('exercises')}>
          <ArrowDown /> Exercises
        </button>
      </div>
      <header className="performance-header">
        <label className="kit-picker">
          <span>CURRENT KIT</span>
          <NativeSelect
            value={kit.id}
            onChange={(event) => loadKit(event.target.value)}
            aria-label="Current kit"
          >
            {kits.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <TransportBar compact />
      </header>

      {activeExercise && (
        <aside className="exercise-performance-strip" data-gesture-lock>
          <div>
            <span>TRAINING · {activeExercise.exercise.category}</span>
            <strong>{activeExercise.exercise.title}</strong>
          </div>
          <div className="exercise-strip-actions">
            <span>{activeExercise.hits.length} hits</span>
            <button onClick={cancelExercise}>Exit</button>
            <button className="accent" onClick={finishExercise}>
              Score
            </button>
          </div>
        </aside>
      )}

      <div className="pad-field">
        <div className="performance-pad-grid" data-gesture-lock>
          {kit.pads.map((pad, index) => {
            const preset =
              presets.find((item) => item.id === pad.presetId) ??
              selectedPreset;
            const target = activeExercise?.exercise.targetPads.includes(index);
            return (
              <button
                key={`${pad.id}-${index}`}
                ref={(element) => {
                  if (element) padElements.current.set(pad.id, element);
                  else padElements.current.delete(pad.id);
                }}
                className={`performance-pad ${pressed.has(index) ? 'pressed' : ''} ${selectedPadIndex === index ? 'selected' : ''} ${target ? 'exercise-target' : ''} ${pad.muted ? 'muted' : ''}`}
                onPointerDown={(event) => down(index, event)}
                onPointerUp={(event) => up(event.pointerId)}
                onPointerCancel={(event) => up(event.pointerId)}
                onLostPointerCapture={(event) => up(event.pointerId)}
                onClick={(event) => {
                  if (event.detail === 0) {
                    selectPad(index);
                    triggerPad(index);
                  }
                }}
                aria-pressed={pressed.has(index)}
                aria-label={`${pad.label}, ${preset.name}, key ${pad.key}`}
              >
                <span className="pad-type">
                  {String(index + 1).padStart(2, '0')}
                  <span>{preset.category}</span>
                </span>
                <span className="pad-key">{pad.key.toUpperCase()}</span>
                <PadWaveform preset={preset} tune={pad.tune} />
                <span className="pad-playhead" aria-hidden="true" />
                <strong>{pad.label}</strong>
                <small>{preset.name}</small>
                {pad.muted && <VolumeX className="pad-muted-icon" />}
              </button>
            );
          })}
        </div>
      </div>

      <footer className="pads-footer">
        <button className="selected-edit" onClick={() => setEditing(true)}>
          <Edit3 />{' '}
          <span>
            <small>
              SELECTED {String(selectedPadIndex + 1).padStart(2, '0')}
            </small>
            <strong>{kit.pads[selectedPadIndex].label}</strong>
          </span>
        </button>
        <button className="open-synth" onClick={() => setArea('synth')}>
          <SlidersHorizontal />
          <span>SHAPE SOUND</span>
        </button>
        <button
          className="utility-button"
          onClick={() => setLibraryOpen(true)}
          aria-label="Kit and data tools"
        >
          •••
        </button>
        <span className="audio-status">
          <i />
          {hydrated ? 'READY' : 'LOADING'}
        </span>
      </footer>

      <div
        className="workspace-directions"
        aria-label="Surrounding instrument screens"
      >
        <button onClick={() => setArea('synth')}>
          <ArrowRight />
          <span>Synthesizer</span>
        </button>
        <span className="swipe-hint">Swipe to explore</span>
        <button onClick={() => setArea('sequencer')}>
          <span>Drum Machine</span>
          <ArrowLeft />
        </button>
        <button className="song-direction" onClick={() => setArea('song')}>
          <ArrowUp /> Song mode
        </button>
      </div>

      {editing && (
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent
            className="bottom-panel"
            showCloseButton={false}
            aria-describedby={undefined}
            data-gesture-lock
          >
            <div className="panel-handle" />
            <header>
              <div>
                <span>PAD {selectedPadIndex + 1}</span>
                <DialogTitle>{selectedPreset.name}</DialogTitle>
              </div>
              <button
                onClick={() => setEditing(false)}
                aria-label="Close pad editor"
              >
                <X />
              </button>
            </header>
            <label className="field-row">
              <span>Label</span>
              <input
                value={kit.pads[selectedPadIndex].label}
                onChange={(event) =>
                  updatePad(selectedPadIndex, {
                    label: event.target.value.toUpperCase().slice(0, 14),
                  })
                }
              />
            </label>
            <label className="field-row">
              <span>Sound</span>
              <NativeSelect
                value={kit.pads[selectedPadIndex].presetId}
                onChange={(event) => assignPreset(event.target.value)}
              >
                {presets.map((preset) => (
                  <NativeSelectOption key={preset.id} value={preset.id}>
                    {preset.category} · {preset.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <Parameter
              label="Volume"
              value={kit.pads[selectedPadIndex].volume}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                updatePad(selectedPadIndex, { volume: value })
              }
            />
            <Parameter
              label="Pan"
              value={kit.pads[selectedPadIndex].pan}
              min={-1}
              max={1}
              step={0.01}
              onChange={(value) => updatePad(selectedPadIndex, { pan: value })}
            />
            <Parameter
              label="Tune"
              value={kit.pads[selectedPadIndex].tune}
              min={-24}
              max={24}
              step={1}
              suffix=" st"
              onChange={(value) => updatePad(selectedPadIndex, { tune: value })}
            />
            <div className="panel-actions">
              <button
                onClick={() => movePad(selectedPadIndex, -1)}
                disabled={selectedPadIndex === 0}
              >
                <ChevronLeft /> Move
              </button>
              <label className="mute-switch">
                {kit.pads[selectedPadIndex].muted ? <VolumeX /> : <Volume2 />}{' '}
                Mute{' '}
                <Switch
                  aria-label="Mute pad"
                  checked={kit.pads[selectedPadIndex].muted}
                  onCheckedChange={(checked) =>
                    updatePad(selectedPadIndex, { muted: checked })
                  }
                />
              </label>
              <button
                onClick={() => movePad(selectedPadIndex, 1)}
                disabled={selectedPadIndex === 15}
              >
                Move <ChevronRight />
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {libraryOpen && (
        <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
          <DialogContent
            className="bottom-panel compact-panel"
            showCloseButton={false}
            aria-describedby={undefined}
            data-gesture-lock
          >
            <header>
              <div>
                <span>KIT & DATA</span>
                <DialogTitle>{kit.name}</DialogTitle>
              </div>
              <button
                onClick={() => setLibraryOpen(false)}
                aria-label="Close kit and data tools"
              >
                <X />
              </button>
            </header>
            <div className="large-action-grid">
              <button onClick={saveKit}>Save custom kit</button>
              <button onClick={resetKit}>Reset factory kit</button>
              <button onClick={downloadData}>
                <Download /> Export JSON
              </button>
              <button onClick={() => importRef.current?.click()}>
                <Upload /> Import JSON
              </button>
            </div>
            <input
              ref={importRef}
              hidden
              type="file"
              accept="application/json"
              onChange={(event) => void importData(event.target.files?.[0])}
            />
          </DialogContent>
        </Dialog>
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
    <label className="parameter-row">
      <span>{label}</span>
      <Slider
        aria-label={label}
        aria-valuetext={`${value}${suffix}`}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) =>
          onChange(typeof next === 'number' ? next : next[0])
        }
      />
      <output>
        {Number(value).toFixed(step < 1 ? 2 : 0)}
        {suffix}
      </output>
    </label>
  );
}
