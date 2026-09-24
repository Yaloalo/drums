'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Inline SVG charts need an accessible image role; an img cannot contain reactive SVG geometry. */

import { useEffect, useRef } from 'react';
import type {
  Envelope,
  FMPatch,
  LfoShape,
  SynthPatch,
  SynthPreset,
} from '../model/types';
import { FM_ALGORITHMS } from '../audio/synthTopology';
import { audioEngine } from '../audio/AudioEngine';
import { useSoundPreview } from './PadWaveform';

export function wavePoints(shape: LfoShape, cycles = 2, depth = 1) {
  return Array.from({ length: 241 }, (_, i) => {
    const phase = ((i / 240) * cycles) % 1;
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
    return `${i},${32 - sample * 25 * depth}`;
  }).join(' ');
}

export function EnvelopeCurve({ envelope }: { envelope: Envelope }) {
  const { attack, decay, sustain, release } = envelope;
  const hold = 0.06;
  const scale = 240 / Math.max(0.001, attack + decay + hold + release);
  const peak = attack * scale;
  const decayEnd = (attack + decay) * scale;
  const releaseStart = (attack + decay + hold) * scale;
  return (
    <svg
      viewBox="0 0 240 64"
      preserveAspectRatio="none"
      role="img"
      aria-label="Envelope curve"
    >
      <polyline
        points={`0,59 ${peak},5 ${decayEnd},${59 - sustain * 54} ${releaseStart},${59 - sustain * 54} 240,59`}
      />
    </svg>
  );
}

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
  const head = useRef<HTMLSpanElement>(null);
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
            { left: '100%', opacity: 0 },
          ],
          { duration: Math.max(80, hit.duration), easing: 'linear' },
        );
      }, hit.delay);
      timers.add(timer);
    });
    return () => {
      unsubscribe();
      timers.forEach(window.clearTimeout);
    };
  }, [padId]);
  return (
    <section className="sound-scope" aria-label="Synthesized output waveform">
      <header>
        <span>OUTPUT WAVEFORM</span>
        <small>{pending ? 'Rendering…' : 'PATCH PREVIEW'}</small>
      </header>
      <div className="scope-plot" data-pending={pending}>
        <svg
          viewBox="0 0 160 64"
          preserveAspectRatio="none"
          role="img"
          aria-label="Rendered sound waveform"
          data-ready={!!preview && !pending}
        >
          {[16, 32, 48].map((y) => (
            <line
              key={y}
              className="scope-grid"
              x1="0"
              x2="160"
              y1={y}
              y2={y}
            />
          ))}
          {[40, 80, 120].map((x) => (
            <line key={x} className="scope-grid" x1={x} x2={x} y1="0" y2="64" />
          ))}
          {preview && <path className="waveform-signal" d={preview.path} />}
        </svg>
        <span ref={head} className="scope-playhead" />
      </div>
      <footer>
        <span>0 ms</span>
        <span>VOICE + EFFECTS</span>
        <span>
          {preview ? `${Math.round(preview.duration * 1000)} ms` : '—'}
        </span>
      </footer>
    </section>
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
      aria-label={`Algorithm ${algorithm}: ${topology.links.map(([a, b]) => `operator ${a + 1} modulates ${b + 1}`).join(', ')}; output operators ${topology.carriers.map((i) => i + 1).join(', ')}`}
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

export function EngineVisual({
  patch,
  update,
}: {
  patch: SynthPatch;
  update: (mutator: (patch: SynthPatch) => void) => void;
}) {
  if (patch.engine === 'fm')
    return (
      <div className="engine-visual">
        <FMGraph algorithm={patch.algorithm} />
        <p>
          Numbered operators modulate the pitch of the next operator.
          Highlighted carriers reach the output.
        </p>
      </div>
    );
  if (patch.engine === 'additive')
    return (
      <div className="engine-visual">
        <div className="partial-spectrum" aria-label="Partial amplitude editor">
          {patch.partials.map((partial, index) => (
            <label key={index}>
              <span>{partial.ratio.toFixed(1)}×</span>
              <input
                aria-label={`Partial ${index + 1} amplitude`}
                type="range"
                min="0"
                max="1"
                step=".01"
                value={partial.amplitude}
                onChange={(event) =>
                  update((next) => {
                    if (next.engine === 'additive')
                      next.partials[index].amplitude = Number(
                        event.target.value,
                      );
                  })
                }
              />
              <i style={{ height: `${partial.amplitude * 75}%` }} />
              <small>{index + 1}</small>
            </label>
          ))}
        </div>
        <p>
          Drag a partial to shape its amplitude. Ratios set pitch; tilt and
          spread shape the whole spectrum.
        </p>
      </div>
    );
  return (
    <div className="engine-visual oscillator-visuals">
      {patch.oscillators.map((oscillator, index) => (
        <div key={index}>
          <header>
            <span>OSC {index + 1}</span>
            <small>
              {oscillator.waveform} · {Math.round(oscillator.level * 100)}%
            </small>
          </header>
          <svg
            viewBox="0 0 240 64"
            role="img"
            aria-label={`Oscillator ${index + 1} ${oscillator.waveform}`}
            preserveAspectRatio="none"
          >
            <polyline
              points={wavePoints(
                oscillator.waveform === 'custom' ? 'sine' : oscillator.waveform,
                2,
                oscillator.level,
              )}
            />
          </svg>
        </div>
      ))}
    </div>
  );
}

export function ModulationDock({
  preset,
  onSelect,
}: {
  preset: SynthPreset;
  onSelect: (section: 'envelope' | 'modulation') => void;
}) {
  return (
    <div className="modulation-dock" data-gesture-lock>
      <button className="envelope-source" onClick={() => onSelect('envelope')}>
        <span>
          AMP ENVELOPE<small>VOLUME</small>
        </span>
        <EnvelopeCurve envelope={preset.patch.ampEnvelope} />
      </button>
      {preset.patch.lfos.map((lfo, index) => (
        <button key={index} onClick={() => onSelect('modulation')}>
          <span>
            LFO {index + 1}
            <small>
              {lfo.rate.toFixed(1)} Hz · {lfo.destination}
            </small>
          </span>
          <svg
            viewBox="0 0 240 64"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              points={wavePoints(
                lfo.shape,
                Math.min(6, Math.max(1, lfo.rate)),
                Math.max(0.04, lfo.depth),
              )}
            />
          </svg>
        </button>
      ))}
    </div>
  );
}
