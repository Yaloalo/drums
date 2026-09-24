'use client';

import { createContext, useContext, useId, useRef } from 'react';
import { Slider } from '@/components/ui/slider';
import type {
  ModulationDestination,
  ModulationRoute,
  ModulationSource,
} from '../model/types';
import { SOURCE_NAMES, SOURCE_TAGS } from '../model/voice';

/* While a modulation source is armed, knobs with a destination edit that
 * source's depth instead of their value — Pigments' drag-the-ring workflow. */
interface ModAssign {
  armed: ModulationSource | null;
  routes: ModulationRoute[];
  setAmount: (destination: ModulationDestination, amount: number) => void;
}
const ModAssignContext = createContext<ModAssign>({
  armed: null,
  routes: [],
  setAmount: () => undefined,
});
export const ModAssignProvider = ModAssignContext.Provider;
export const useModAssign = () => useContext(ModAssignContext);

export const hz = (value: number) =>
  value >= 1000
    ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
    : `${Math.round(value)}`;
export const seconds = (value: number) =>
  value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(2)} s`;
export const percent = (value: number) => `${Math.round(value * 100)}%`;

const ARC = 270;
const START = -135;
function polar(radius: number, degrees: number) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [28 + radius * Math.cos(radians), 28 + radius * Math.sin(radians)];
}
function arc(radius: number, from: number, to: number) {
  if (Math.abs(to - from) < 0.5) return '';
  const [a, b] = [Math.min(from, to), Math.max(from, to)];
  const [x1, y1] = polar(radius, a);
  const [x2, y2] = polar(radius, b);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${radius},${radius} 0 ${b - a > 180 ? 1 : 0} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  /** Makes the knob a modulation destination. */
  mod?: ModulationDestination;
  /** Frequencies and times feel even on a logarithmic scale. */
  scale?: 'linear' | 'log';
  /** Draws the value from the centre, for pan-like controls. */
  bipolar?: boolean;
  format?: (value: number) => string;
  disabled?: boolean;
}

export function Knob({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit = '',
  onChange,
  mod,
  scale = 'linear',
  bipolar = false,
  format,
  disabled = false,
}: KnobProps) {
  const { armed, routes, setAmount } = useModAssign();
  const drag = useRef<{
    pointer: number;
    y: number;
    x: number;
    start: number;
  } | null>(null);
  const inputId = useId();
  const log = scale === 'log' && min > 0;
  const toPosition = (next: number) =>
    log
      ? Math.log(next / min) / Math.log(max / min)
      : (next - min) / (max - min);
  const fromPosition = (position: number) => {
    const clamped = Math.max(0, Math.min(1, position));
    const raw = log
      ? min * (max / min) ** clamped
      : min + clamped * (max - min);
    const snapped = Math.round(raw / step) * step;
    return Math.max(min, Math.min(max, Number(snapped.toFixed(6))));
  };
  const assigning = Boolean(armed && mod && !disabled);
  const route = assigning
    ? routes.find((item) => item.source === armed && item.destination === mod)
    : undefined;
  const amount = route?.amount ?? 0;
  const modulators = mod
    ? routes.filter((item) => item.destination === mod && item.amount !== 0)
    : [];
  const position = Math.max(0, Math.min(1, toPosition(value)));
  const angle = START + position * ARC;
  const origin = bipolar ? 0 : START;
  const reach = Math.max(START, Math.min(START + ARC, angle + amount * ARC));
  const [px, py] = polar(15, angle);
  const text = format
    ? format(value)
    : `${
        max > 1000 ? Math.round(value) : Number(value).toFixed(step < 1 ? 2 : 0)
      }${unit}`;

  // Keys move 1% of the travel (10% with Page keys) and never less than one step.
  const nudge = (direction: 1 | -1, large: boolean) => {
    if (assigning && mod) {
      const next = amount + direction * (large ? 0.1 : 0.01);
      setAmount(mod, Math.round(Math.max(-1, Math.min(1, next)) * 100) / 100);
      return;
    }
    const target = fromPosition(position + direction * (large ? 0.1 : 0.01));
    onChange(
      target === value
        ? Math.max(min, Math.min(max, value + direction * step))
        : target,
    );
  };
  // In assign mode the drag edits the route depth (−1…1), otherwise the value.
  const commit = (next: number) => {
    if (assigning && mod)
      setAmount(mod, Math.round(Math.max(-1, Math.min(1, next)) * 100) / 100);
    else onChange(fromPosition(next));
  };

  return (
    <div
      className={`synth-knob ${assigning ? 'assigning' : ''} ${route ? 'routed' : ''} ${disabled ? 'disabled' : ''}`}
    >
      <span
        className="knob-face"
        onPointerDown={(event) => {
          if (disabled) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          document.getElementById(inputId)?.focus({ preventScroll: true });
          drag.current = {
            pointer: event.pointerId,
            y: event.clientY,
            x: event.clientX,
            start: assigning ? amount : position,
          };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.pointer !== event.pointerId) return;
          const travel = event.shiftKey ? 600 : 160;
          const delta =
            (current.y - event.clientY + (event.clientX - current.x) * 0.6) /
            travel;
          commit(current.start + delta * (assigning ? 2 : 1));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onDoubleClick={() => {
          if (assigning && mod) setAmount(mod, 0);
        }}
      >
        <svg viewBox="0 0 56 56" aria-hidden="true">
          <path className="knob-track" d={arc(21, START, START + ARC)} />
          <path className="knob-value" d={arc(21, origin, angle)} />
          {(assigning || modulators.length > 0) && (
            <path className="knob-mod-track" d={arc(26, START, START + ARC)} />
          )}
          {(route || (!assigning && modulators[0])) && (
            <path
              className="knob-mod"
              d={arc(
                26,
                angle,
                assigning
                  ? reach
                  : Math.max(
                      START,
                      Math.min(START + ARC, angle + modulators[0].amount * ARC),
                    ),
              )}
            />
          )}
          <line className="knob-pointer" x1="28" y1="28" x2={px} y2={py} />
        </svg>
      </span>
      <label className="knob-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="knob-input"
        type="range"
        min={assigning ? -100 : 0}
        max={assigning ? 100 : 1000}
        step={1}
        disabled={disabled}
        value={
          assigning ? Math.round(amount * 100) : Math.round(position * 1000)
        }
        aria-valuetext={
          assigning && armed
            ? `${SOURCE_NAMES[armed]} amount ${Math.round(amount * 100)} percent`
            : text
        }
        onChange={(event) => {
          const next = Number(event.target.value);
          if (assigning && mod) setAmount(mod, next / 100);
          else onChange(fromPosition(next / 1000));
        }}
        onKeyDown={(event) => {
          const keys: Record<string, [1 | -1, boolean]> = {
            ArrowUp: [1, false],
            ArrowRight: [1, false],
            ArrowDown: [-1, false],
            ArrowLeft: [-1, false],
            PageUp: [1, true],
            PageDown: [-1, true],
          };
          if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            if (assigning && mod) setAmount(mod, event.key === 'Home' ? -1 : 1);
            else onChange(event.key === 'Home' ? min : max);
            return;
          }
          const move = keys[event.key];
          if (!move) return;
          event.preventDefault();
          nudge(...move);
        }}
      />
      <output className="knob-output">
        {assigning && armed
          ? `${SOURCE_TAGS[armed]} ${amount > 0 ? '+' : ''}${Math.round(amount * 100)}%`
          : text}
      </output>
      {!assigning && modulators.length > 0 && (
        <span
          className="knob-mods"
          title={modulators
            .map(
              (item) =>
                `${SOURCE_NAMES[item.source]} ${Math.round(item.amount * 100)}%`,
            )
            .join(', ')}
        >
          {modulators.slice(0, 3).map((item) => (
            <i key={item.source}>{SOURCE_TAGS[item.source]}</i>
          ))}
        </span>
      )}
    </div>
  );
}

/** A labelled horizontal slider for dense rows (operators, partials). */
export function Mini({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mini-control">
      <span>{label}</span>
      <Slider
        aria-label={label}
        aria-valuetext={format ? format(value) : String(value)}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) =>
          onChange(typeof next === 'number' ? next : next[0])
        }
      />
      <output>
        {format ? format(value) : Number(value).toFixed(step < 1 ? 2 : 0)}
      </output>
    </label>
  );
}

export function Chips<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}: {
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <fieldset className={`chips ${className}`} aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          className={option.value === value ? 'active' : ''}
          aria-pressed={option.value === value}
          title={option.title}
          aria-label={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

export function Panel({
  title,
  meta,
  actions,
  className = '',
  children,
}: {
  title: string;
  meta?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`synth-panel ${className}`}>
      <header>
        <h3>{title}</h3>
        {meta && <span>{meta}</span>}
        {actions}
      </header>
      <div className="synth-panel-body">{children}</div>
    </section>
  );
}
