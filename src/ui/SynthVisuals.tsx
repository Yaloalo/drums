'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Inline SVG charts need an accessible image role; an img cannot contain reactive SVG geometry. */

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Envelope,
  FilterDefinition,
  FMPatch,
  LfoShape,
  PitchSweep,
  SynthPatch,
  SynthPreset,
} from '../model/types';
import { FM_ALGORITHMS } from '../audio/synthTopology';
import { audioEngine } from '../audio/AudioEngine';
import type { ScopeZoom } from '../audio/waveform';
import { envelopeLength } from '../model/voice';
import { useSoundPreview } from './PadWaveform';
import { Chips } from './SynthControls';

export function wavePoints(
  shape: LfoShape,
  cycles = 2,
  depth = 1,
  width = 240,
  height = 64,
) {
  const middle = height / 2;
  return Array.from({ length: 121 }, (_, i) => {
    const phase = ((i / 120) * cycles) % 1;
    const sample =
      shape === 'square'
        ? phase < 0.5
          ? 1
          : -1
        : shape === 'sawtooth'
          ? 2 * phase - 1
          : shape === 'triangle'
            ? 1 - 4 * Math.abs(phase - 0.5)
            : Math.sin(phase * Math.PI * 2);
    return `${((i / 120) * width).toFixed(1)},${(middle - sample * middle * 0.8 * depth).toFixed(1)}`;
  }).join(' ');
}

/** A tiny waveform icon for waveform and LFO shape choices. */
export function WaveGlyph({ shape }: { shape: LfoShape }) {
  return (
    <svg className="wave-glyph" viewBox="0 0 24 12" aria-hidden="true">
      <polyline points={wavePoints(shape, 1, 1, 24, 12)} />
    </svg>
  );
}

function envelopePoints(envelope: Envelope, span: number, width: number) {
  const { attack, decay, sustain, release } = envelope;
  const hold = sustain > 0 ? 0.08 : 0;
  const x = (time: number) =>
    ((Math.min(time, span) / span) * width).toFixed(1);
  const top = 5;
  const bottom = 59;
  const level = bottom - sustain * (bottom - top);
  return `0,${bottom} ${x(attack)},${top} ${x(attack + decay)},${level} ${x(attack + decay + hold)},${level} ${x(attack + decay + hold + release)},${bottom} ${width},${bottom}`;
}

export function EnvelopeCurve({
  envelope,
  span,
}: {
  envelope: Envelope;
  /** Seconds across the width; defaults to the envelope's own length. */
  span?: number;
}) {
  return (
    <svg
      viewBox="0 0 240 64"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Envelope: attack ${Math.round(envelope.attack * 1000)} ms, decay ${Math.round(envelope.decay * 1000)} ms, sustain ${Math.round(envelope.sustain * 100)} percent, release ${Math.round(envelope.release * 1000)} ms`}
    >
      <polyline
        points={envelopePoints(
          envelope,
          span ?? Math.max(0.001, envelopeLength(envelope)),
          240,
        )}
      />
    </svg>
  );
}

/** Both engine envelopes on one time axis: what the amp receives. */
export function VoiceShape({ preset }: { preset: SynthPreset }) {
  const engines = preset.voice.engines.filter((slot) => slot.enabled);
  const span = Math.max(
    0.05,
    ...engines.map((slot) => envelopeLength(slot.patch.ampEnvelope)),
  );
  return (
    <svg
      className="voice-shape"
      viewBox="0 0 240 64"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Voice envelope over ${Math.round(span * 1000)} ms`}
    >
      {preset.voice.engines.map((slot, index) =>
        slot.enabled ? (
          <polyline
            key={index}
            className={`engine-${index + 1}`}
            points={envelopePoints(slot.patch.ampEnvelope, span, 240)}
          />
        ) : null,
      )}
    </svg>
  );
}

export function PitchSweepCurve({ sweep }: { sweep: PitchSweep }) {
  const top = sweep.amount >= 0 ? 6 : 58;
  const span = Math.max(0.05, sweep.decay * 2.2);
  const points = Array.from({ length: 41 }, (_, i) => {
    const time = (i / 40) * span;
    const progress = Math.min(1, time / Math.max(0.008, sweep.decay));
    // Exponential approach, as Web Audio's exponential ramp in semitones is linear.
    const offset = (1 - progress) * Math.min(1, Math.abs(sweep.amount) / 48);
    const y = 32 + (top - 32) * offset;
    return `${((i / 40) * 240).toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg
      viewBox="0 0 240 64"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Pitch sweep ${sweep.amount} semitones over ${Math.round(sweep.decay * 1000)} ms`}
    >
      <line className="axis" x1="0" x2="240" y1="32" y2="32" />
      <polyline points={points} />
    </svg>
  );
}

let responseContext: OfflineAudioContext | null = null;
const FREQUENCIES = Float32Array.from(
  { length: 96 },
  (_, i) => 20 * 1000 ** (i / 95),
);

/** The filter's magnitude response, measured from a real BiquadFilterNode. */
export function FilterCurve({
  filter,
  compact = false,
}: {
  filter: FilterDefinition;
  compact?: boolean;
}) {
  const path = useMemo(() => {
    if (!filter.enabled) return 'M0,32 L240,32';
    if (typeof OfflineAudioContext === 'undefined') return '';
    responseContext ??= new OfflineAudioContext(1, 128, 44100);
    const node = responseContext.createBiquadFilter();
    node.type = filter.mode;
    node.frequency.value = filter.cutoff;
    node.Q.value = filter.resonance;
    const magnitude = new Float32Array(FREQUENCIES.length);
    node.getFrequencyResponse(
      FREQUENCIES,
      magnitude,
      new Float32Array(FREQUENCIES.length),
    );
    return Array.from(magnitude, (value, i) => {
      const db = Math.max(
        -36,
        Math.min(24, 20 * Math.log10(Math.max(1e-6, value))),
      );
      const x = (i / (FREQUENCIES.length - 1)) * 240;
      const y = 20 - (db / 36) * 40;
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${Math.max(1, Math.min(63, y)).toFixed(1)}`;
    }).join(' ');
  }, [filter.enabled, filter.mode, filter.cutoff, filter.resonance]);
  return (
    <svg
      className={`filter-curve ${filter.enabled ? '' : 'bypassed'} ${compact ? 'compact' : ''}`}
      viewBox="0 0 240 64"
      preserveAspectRatio="none"
      role="img"
      aria-label={
        filter.enabled
          ? `${filter.mode} response at ${Math.round(filter.cutoff)} hertz`
          : 'Filter bypassed'
      }
    >
      {!compact && (
        <>
          <line className="axis" x1="0" x2="240" y1="20" y2="20" />
          {[100, 1000, 10000].map((frequency) => {
            const x = (Math.log(frequency / 20) / Math.log(1000)) * 240;
            return (
              <line
                key={frequency}
                className="grid"
                x1={x}
                x2={x}
                y1="0"
                y2="64"
              />
            );
          })}
        </>
      )}
      {path && <path d={path} />}
    </svg>
  );
}

export function FMGraph({ algorithm }: { algorithm: FMPatch['algorithm'] }) {
  const topology = FM_ALGORITHMS[algorithm];
  const positions = [
    [30, 24],
    [90, 24],
    [150, 24],
    [210, 24],
  ];
  return (
    <svg
      className="fm-graph"
      viewBox="0 0 240 105"
      role="img"
      aria-label={`Algorithm ${algorithm}: ${topology.links.map(([a, b]) => `operator ${a + 1} modulates ${b + 1}`).join(', ') || 'no modulation'}; output operators ${topology.carriers.map((i) => i + 1).join(', ')}`}
    >
      {topology.links.map(([from, to], index) => {
        const x1 = positions[from][0];
        const x2 = positions[to][0];
        const y = 46 + index * 11;
        return (
          <g key={`${from}-${to}`} className="fm-link">
            <path d={`M${x1},36 V${y} H${x2} V36`} />
            <path d={`M${x2 - 3},41 L${x2},36 L${x2 + 3},41`} />
          </g>
        );
      })}
      {topology.carriers.map((index) => (
        <path
          className="fm-carrier"
          key={index}
          d={`M${positions[index][0]},12 V4 H238 V91 H120`}
        />
      ))}
      {positions.map(([x, y], index) => (
        <g
          key={index}
          className={topology.carriers.includes(index) ? 'carrier' : ''}
        >
          <rect x={x - 16} y={y - 12} width="32" height="24" rx="3" />
          <text x={x} y={y + 4}>
            {index + 1}
          </text>
        </g>
      ))}
      <text x="120" y="99" className="fm-output">
        OUT
      </text>
    </svg>
  );
}

/** A small picture of an engine's source for the signal-flow blocks. */
export function EngineThumb({ patch }: { patch: SynthPatch }) {
  if (patch.engine === 'fm')
    return (
      <svg className="engine-thumb" viewBox="0 0 96 28" aria-hidden="true">
        {FM_ALGORITHMS[patch.algorithm].links.map(([from, to]) => (
          <path
            key={`${from}-${to}`}
            className="thumb-link"
            d={`M${12 + from * 24},18 C${12 + from * 24},27 ${12 + to * 24},27 ${12 + to * 24},18`}
          />
        ))}
        {patch.operators.map((operator, index) => (
          <rect
            key={index}
            className={
              FM_ALGORITHMS[patch.algorithm].carriers.includes(index)
                ? 'carrier'
                : ''
            }
            x={4 + index * 24}
            y={4}
            width={16}
            height={14}
            rx={2}
            opacity={0.35 + Math.min(1, operator.level) * 0.65}
          />
        ))}
      </svg>
    );
  if (patch.engine === 'additive')
    return (
      <svg className="engine-thumb" viewBox="0 0 96 28" aria-hidden="true">
        {patch.partials.map((partial, index) => {
          const x = 4 + (Math.log2(Math.max(0.5, partial.ratio)) / 4) * 84;
          return (
            <line
              key={index}
              x1={x}
              x2={x}
              y1={26}
              y2={26 - Math.min(1, partial.amplitude) * 22}
            />
          );
        })}
      </svg>
    );
  const loudest = [...patch.oscillators].sort((a, b) => b.level - a.level)[0];
  return (
    <svg className="engine-thumb" viewBox="0 0 96 28" aria-hidden="true">
      {loudest && loudest.level > 0 && (
        <polyline
          points={wavePoints(
            loudest.waveform === 'custom' ? 'sine' : loudest.waveform,
            3,
            1,
            96,
            28,
          )}
        />
      )}
      {patch.noise.level > 0 &&
        Array.from({ length: 24 }, (_, i) => {
          const height = (((i * 7919) % 13) / 13) * 18 * patch.noise.level + 2;
          return (
            <line
              key={i}
              className="thumb-noise"
              x1={2 + i * 4}
              x2={2 + i * 4}
              y1={14 - height / 2}
              y2={14 + height / 2}
            />
          );
        })}
    </svg>
  );
}

const ZOOMS: { value: ScopeZoom; label: string; title: string }[] = [
  { value: 'auto', label: 'Wave', title: 'About six cycles of the pitch' },
  { value: 'short', label: '20 ms', title: 'First 20 milliseconds' },
  { value: 'medium', label: '100 ms', title: 'First 100 milliseconds' },
  { value: 'full', label: 'Hit', title: 'The whole hit' },
];

/** The rendered patch as an oscilloscope line, zoomable from cycles to the whole hit. */
export function SoundScope({
  preset,
  tune,
  padId,
}: {
  preset: SynthPreset;
  tune: number;
  padId: string;
}) {
  const { preview, pending } = useSoundPreview(preset, tune);
  const [zoom, setZoom] = useState<ScopeZoom>('auto');
  const head = useRef<HTMLSpanElement>(null);
  const trace = preview?.traces[zoom];
  const shown = trace?.window ?? 0;
  useEffect(() => {
    const timers = new Set<number>();
    const unsubscribe = audioEngine.onHit((hit) => {
      if (hit.padId !== padId) return;
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        if (
          !head.current ||
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
        )
          return;
        head.current.getAnimations().forEach((animation) => animation.cancel());
        head.current.animate(
          [
            { left: '0%', opacity: 1 },
            { left: '100%', opacity: 0.4 },
          ],
          { duration: Math.max(120, shown * 1000), easing: 'linear' },
        );
      }, hit.delay);
      timers.add(timer);
    });
    return () => {
      unsubscribe();
      timers.forEach(window.clearTimeout);
    };
  }, [padId, shown]);
  const label = (time: number) =>
    time >= 1 ? `${time.toFixed(2)} s` : `${Math.round(time * 1000)} ms`;
  return (
    <section className="sound-scope" aria-label="Synthesized output waveform">
      <header>
        <span>OUTPUT</span>
        <Chips
          ariaLabel="Scope zoom"
          className="scope-zoom"
          value={zoom}
          options={ZOOMS.map((item) => ({
            value: item.value,
            label: item.label,
            title: item.title,
          }))}
          onChange={setZoom}
        />
      </header>
      <div className="scope-plot" data-pending={pending}>
        <svg
          viewBox="0 0 160 64"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Output waveform, first ${label(shown)}`}
          data-ready={!!trace && !pending}
        >
          {[16, 48].map((y) => (
            <line
              key={y}
              className="scope-grid"
              x1="0"
              x2="160"
              y1={y}
              y2={y}
            />
          ))}
          <line className="scope-axis" x1="0" x2="160" y1="32" y2="32" />
          {[40, 80, 120].map((x) => (
            <line key={x} className="scope-grid" x1={x} x2={x} y1="0" y2="64" />
          ))}
          {trace && <path className="scope-signal" d={trace.path} />}
        </svg>
        <span ref={head} className="scope-playhead" />
      </div>
      <footer>
        <span>0</span>
        <span>{pending ? 'Rendering…' : 'VOICE + EFFECTS'}</span>
        <span>{trace ? label(shown) : '—'}</span>
      </footer>
    </section>
  );
}
