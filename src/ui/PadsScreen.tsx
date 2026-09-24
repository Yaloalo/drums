'use client';

import { useEffect, useRef, useState } from 'react';

import { VolumeX } from 'lucide-react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { useApp } from '../state/AppContext';
import { TransportBar } from './TransportBar';
import { PadWaveform } from './PadWaveform';
import { audioEngine } from '../audio/AudioEngine';
import { usePractice } from '../state/PracticeContext';
import { PracticePanel } from './PracticePanel';

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
  } = useApp();
  const { session, onCue } = usePractice();
  const targets = new Set(session?.exercise.parts.map((part) => part.pad));
  const [pressed, setPressed] = useState<Set<number>>(new Set());
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

  // Guide lights: a target pad glows when its note is due.
  useEffect(() => {
    const timers = new Set<number>();
    const unsubscribe = onCue((pad, delay) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        const element =
          document.querySelectorAll<HTMLElement>('.performance-pad')[pad];
        if (
          !element ||
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
        )
          return;
        const color = getComputedStyle(element).getPropertyValue('--accent');
        element.animate(
          [
            {
              boxShadow: `inset 0 0 0 3px ${color}`,
              backgroundColor: 'var(--accent-light)',
            },
            { boxShadow: 'inset 0 0 0 0 transparent' },
          ],
          { duration: 220, easing: 'ease-out' },
        );
      }, delay);
      timers.add(timer);
    });
    return () => {
      unsubscribe();
      timers.forEach(window.clearTimeout);
    };
  }, [onCue]);

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
      event.timeStamp,
    );
  };
  const up = (pointerId: number) => {
    pointers.current.delete(pointerId);
    setPressed(new Set(pointers.current.values()));
  };

  return (
    <section className="screen pads-screen" aria-label="Performance pads">
      <div className="performance-heading">
        <div className="screen-title">
          <span>INSTRUMENT / PERFORMANCE</span>
          <h1>Drum pads</h1>
        </div>
      </div>
      {session ? (
        <PracticePanel />
      ) : (
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
      )}

      <div className="pad-field">
        <div className="performance-pad-grid" data-gesture-lock>
          {kit.pads.map((pad, index) => {
            const preset =
              presets.find((item) => item.id === pad.presetId) ??
              selectedPreset;
            const target = targets.has(index);
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
    </section>
  );
}
