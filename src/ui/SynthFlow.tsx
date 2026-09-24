'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import type { ModulationDestination, SynthPreset } from '../model/types';
import { ENGINE_NAMES } from '../model/voice';
import { hz, percent } from './SynthControls';
import { EngineThumb, FilterCurve, SoundScope } from './SynthVisuals';

export type ModuleId =
  | 'engine1'
  | 'combine'
  | 'engine2'
  | 'filters'
  | 'amp'
  | 'fx';

type NodeId =
  | 'engine1'
  | 'combine'
  | 'engine2'
  | 'filter1'
  | 'routing'
  | 'filter2'
  | 'amp'
  | 'fx'
  | 'out';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Geometry {
  width: number;
  height: number;
  boxes: Partial<Record<NodeId, Box>>;
}
interface Edge {
  from: NodeId;
  to: NodeId;
  /** 0–1: how much signal takes this path. */
  weight: number;
  kind?: 'combine';
}

const MODULE_OF: Record<NodeId, ModuleId | null> = {
  engine1: 'engine1',
  combine: 'combine',
  engine2: 'engine2',
  filter1: 'filters',
  routing: 'filters',
  filter2: 'filters',
  amp: 'amp',
  fx: 'fx',
  out: null,
};
const STAGE: Record<NodeId, number> = {
  engine1: 0,
  combine: 0,
  engine2: 0,
  filter1: 1,
  routing: 1,
  filter2: 1,
  amp: 2,
  fx: 3,
  out: 4,
};
const DESTINATIONS: Partial<Record<NodeId, ModulationDestination[]>> = {
  engine1: ['pitch', 'pitch1', 'engine1'],
  engine2: ['pitch', 'pitch2', 'engine2'],
  combine: ['combine'],
  filter1: ['cutoff', 'resonance'],
  filter2: ['cutoff2', 'resonance2'],
  amp: ['amplitude', 'level', 'pan'],
};

/*
 * Arrows leave and enter along the flow direction (left→right on wide
 * screens, top→down on phones) unless the two blocks share that axis, as
 * the combine link and the series link do; then they run across it.
 */
function edgePath(a: Box, b: Box, horizontal: boolean) {
  const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
  const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
  const alongX = horizontal ? !overlapX : overlapY;
  if (alongX) {
    const forward = b.x >= a.x;
    const sx = forward ? a.x + a.w : a.x;
    const ex = forward ? b.x - 3 : b.x + b.w + 3;
    const sy = a.y + a.h / 2;
    const ey = b.y + b.h / 2;
    const c = (ex - sx) / 2;
    return {
      d: `M${sx},${sy} C${sx + c},${sy} ${ex - c},${ey} ${ex},${ey}`,
      x: (sx + ex) / 2,
      y: (sy + ey) / 2,
    };
  }
  const down = b.y >= a.y;
  const sy = down ? a.y + a.h : a.y;
  const ey = down ? b.y - 3 : b.y + b.h + 3;
  const sx = a.x + a.w / 2;
  const ex = b.x + b.w / 2;
  const c = (ey - sy) / 2;
  return {
    d: `M${sx},${sy} C${sx},${sy + c} ${ex},${ey - c} ${ex},${ey}`,
    x: (sx + ex) / 2,
    y: (sy + ey) / 2,
  };
}

export function SynthFlow({
  preset,
  selected,
  onSelect,
  tune,
  padId,
}: {
  preset: SynthPreset;
  selected: ModuleId;
  onSelect: (module: ModuleId) => void;
  tune: number;
  padId: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const { voice, effects, modulation } = preset;
  const [one, two] = voice.engines;
  const combining = two.enabled && voice.combine.mode !== 'layer';
  const routing = Math.max(0, Math.min(1, voice.filterRouting));

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    let last = '';
    const measure = () => {
      const base = element.getBoundingClientRect();
      const boxes: Geometry['boxes'] = {};
      element.querySelectorAll<HTMLElement>('[data-node]').forEach((node) => {
        const rect = node.getBoundingClientRect();
        boxes[node.dataset.node as NodeId] = {
          x: rect.left - base.left,
          y: rect.top - base.top,
          w: rect.width,
          h: rect.height,
        };
      });
      const next = { width: base.width, height: base.height, boxes };
      const key = JSON.stringify(next);
      if (key === last) return;
      last = key;
      setGeometry(next);
    };
    // The observer reports every block once when observation starts.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element
      .querySelectorAll('[data-node]')
      .forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  // Each hit lights the path stage by stage: what happens after what.
  useEffect(() => {
    const timers = new Set<number>();
    const unsubscribe = audioEngine.onHit((hit) => {
      if (hit.padId !== padId) return;
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        const element = root.current;
        if (
          !element ||
          window.matchMedia('(prefers-reduced-motion: reduce)').matches
        )
          return;
        const color = getComputedStyle(element).getPropertyValue('--chord');
        element
          .querySelectorAll<HTMLElement>('[data-node]:not(.off)')
          .forEach((block) => {
            const stage = STAGE[block.dataset.node as NodeId];
            block.animate(
              [
                { boxShadow: `inset 0 0 0 2px ${color}` },
                { boxShadow: `inset 0 0 0 0 transparent` },
              ],
              { duration: 320, delay: stage * 60, easing: 'ease-out' },
            );
          });
      }, hit.delay);
      timers.add(timer);
    });
    return () => {
      unsubscribe();
      timers.forEach(window.clearTimeout);
    };
  }, [padId]);

  const edges: Edge[] = [];
  voice.engines.forEach((slot, index) => {
    if (!slot.enabled) return;
    const from = index ? 'engine2' : 'engine1';
    edges.push(
      { from, to: 'filter1', weight: 1 - slot.filterMix },
      { from, to: 'filter2', weight: slot.filterMix },
    );
  });
  if (combining)
    edges.push(
      { from: 'engine2', to: 'combine', weight: 1, kind: 'combine' },
      { from: 'combine', to: 'engine1', weight: 1, kind: 'combine' },
    );
  edges.push(
    { from: 'filter1', to: 'filter2', weight: 1 - routing },
    { from: 'filter1', to: 'amp', weight: routing },
    { from: 'filter2', to: 'amp', weight: 1 },
    { from: 'amp', to: 'fx', weight: 1 },
    { from: 'fx', to: 'out', weight: 1 },
  );
  const boxes = geometry?.boxes;
  const horizontal = Boolean(
    boxes?.engine1 &&
    boxes.filter1 &&
    boxes.filter1.x >= boxes.engine1.x + boxes.engine1.w,
  );
  const modulated = (id: NodeId) => {
    const slot = id === 'engine1' ? one : id === 'engine2' ? two : null;
    if (slot && !slot.enabled) return false;
    const engineSpecific: ModulationDestination[] =
      slot?.patch.engine === 'fm'
        ? ['fmIndex']
        : slot?.patch.engine === 'additive'
          ? ['spectralTilt']
          : [];
    return [...(DESTINATIONS[id] ?? []), ...engineSpecific].some(
      (destination) =>
        modulation.some(
          (route) => route.destination === destination && route.amount !== 0,
        ),
    );
  };
  const node = (
    id: NodeId,
    className: string,
    children: React.ReactNode,
    label: string,
  ) => {
    const target = MODULE_OF[id];
    return (
      <button
        key={id}
        data-node={id}
        className={`flow-node ${className} ${target === selected ? 'selected' : ''} ${modulated(id) ? 'modulated' : ''}`}
        style={{ gridArea: id }}
        aria-pressed={target === selected}
        aria-label={label}
        onClick={() => target && onSelect(target)}
      >
        {children}
      </button>
    );
  };
  const inserts = effects.filter(
    (effect) =>
      effect.enabled &&
      ['drive', 'bitcrush', 'compressor'].includes(effect.type),
  );
  const sends = effects.filter(
    (effect) => effect.enabled && ['delay', 'reverb'].includes(effect.type),
  );
  const fxNames: Record<string, string> = {
    drive: 'Drive',
    bitcrush: 'Crush',
    compressor: 'Comp',
    delay: 'Delay',
    reverb: 'Reverb',
  };
  const filterName = {
    lowpass: 'Low-pass',
    highpass: 'High-pass',
    bandpass: 'Band-pass',
    notch: 'Notch',
  };
  const combineSymbol = !two.enabled
    ? '·'
    : voice.combine.mode === 'fm'
      ? 'FM'
      : voice.combine.mode === 'ring'
        ? '×'
        : '+';

  return (
    <div
      className="synth-flow"
      ref={root}
      data-orientation={horizontal ? 'horizontal' : 'vertical'}
    >
      {geometry && boxes && (
        <svg
          className="flow-edges"
          width={geometry.width}
          height={geometry.height}
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          aria-hidden="true"
        >
          <defs>
            <marker
              id="flow-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L8,4 L0,8 z" className="flow-arrowhead" />
            </marker>
            <marker
              id="flow-arrow-combine"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L8,4 L0,8 z" className="flow-arrowhead combine" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const a = boxes[edge.from];
            const b = boxes[edge.to];
            if (!a || !b || edge.weight <= 0.001) return null;
            const path = edgePath(a, b, horizontal);
            return (
              <g
                key={`${edge.from}-${edge.to}`}
                className={`flow-edge ${edge.kind ?? ''}`}
              >
                <path
                  d={path.d}
                  strokeWidth={1 + edge.weight * 1.5}
                  opacity={0.3 + edge.weight * 0.7}
                  markerEnd={`url(#${edge.kind ? 'flow-arrow-combine' : 'flow-arrow'})`}
                />
              </g>
            );
          })}
        </svg>
      )}

      {node(
        'engine1',
        'engine',
        <>
          <span className="flow-kicker">ENGINE 1</span>
          <strong>{ENGINE_NAMES[one.patch.engine]}</strong>
          <EngineThumb patch={one.patch} />
          <span className="flow-meter" aria-hidden="true">
            <i style={{ width: percent(one.level) }} />
          </span>
        </>,
        `Engine 1, ${ENGINE_NAMES[one.patch.engine]}, level ${percent(one.level)}`,
      )}
      {node(
        'combine',
        `combine ${two.enabled ? voice.combine.mode : 'off'}`,
        <>
          <b>{combineSymbol}</b>
          <small>
            {!two.enabled
              ? 'Solo'
              : voice.combine.mode === 'layer'
                ? 'Layer'
                : `${voice.combine.mode === 'fm' ? 'FM' : 'Ring'} ${percent(voice.combine.amount)}`}
          </small>
        </>,
        two.enabled
          ? `Combine: ${voice.combine.mode === 'layer' ? 'layered' : `${voice.combine.mode} ${percent(voice.combine.amount)}`}`
          : 'Combine: Engine 2 is off',
      )}
      {node(
        'engine2',
        `engine ${two.enabled ? '' : 'off'}`,
        two.enabled ? (
          <>
            <span className="flow-kicker">ENGINE 2</span>
            <strong>{ENGINE_NAMES[two.patch.engine]}</strong>
            <EngineThumb patch={two.patch} />
            <span className="flow-meter" aria-hidden="true">
              <i style={{ width: percent(two.level) }} />
            </span>
          </>
        ) : (
          <>
            <span className="flow-kicker">ENGINE 2</span>
            <strong>Off</strong>
            <small>+ Add a layer</small>
          </>
        ),
        two.enabled
          ? `Engine 2, ${ENGINE_NAMES[two.patch.engine]}, level ${percent(two.level)}`
          : 'Engine 2, off. Open to add a second layer',
      )}
      {voice.filters.map((filter, index) =>
        node(
          index ? 'filter2' : 'filter1',
          `filter ${filter.enabled ? '' : 'bypassed'}`,
          <>
            <span className="flow-kicker">FILTER {index + 1}</span>
            <strong>
              {filter.enabled ? filterName[filter.mode] : 'Bypass'}
            </strong>
            <FilterCurve filter={filter} compact />
            <small>
              {filter.enabled
                ? `${hz(filter.cutoff)} Hz · Q ${filter.resonance.toFixed(1)}`
                : 'Signal passes through'}
            </small>
          </>,
          `Filter ${index + 1}, ${filter.enabled ? `${filterName[filter.mode]} at ${Math.round(filter.cutoff)} hertz` : 'bypassed'}`,
        ),
      )}
      {node(
        'routing',
        'routing',
        <>
          <b>
            {routing <= 0.02
              ? 'Series'
              : routing >= 0.98
                ? 'Parallel'
                : `${percent(routing)} par`}
          </b>
        </>,
        `Filter routing: ${routing <= 0.02 ? 'series' : routing >= 0.98 ? 'parallel' : `${percent(routing)} parallel`}`,
      )}
      {node(
        'amp',
        'amp',
        <>
          <span className="flow-kicker">AMP</span>
          <strong>{percent(voice.amp.level)}</strong>
          <span className="flow-meter" aria-hidden="true">
            <i style={{ width: percent(voice.amp.level) }} />
          </span>
          <small>
            Vel {percent(voice.amp.velocity)} ·{' '}
            {voice.amp.pan === 0
              ? 'C'
              : voice.amp.pan < 0
                ? `L${Math.round(-voice.amp.pan * 100)}`
                : `R${Math.round(voice.amp.pan * 100)}`}
          </small>
        </>,
        `Amp, level ${percent(voice.amp.level)}`,
      )}
      {node(
        'fx',
        'fx',
        <>
          <span className="flow-kicker">FX</span>
          <strong>
            {inserts.length + sends.length
              ? `${inserts.length + sends.length} active`
              : 'Dry'}
          </strong>
          <small>
            {[...inserts, ...sends]
              .map((effect) => fxNames[effect.type])
              .join(' → ') || 'No effects'}
          </small>
        </>,
        `Effects: ${[...inserts, ...sends].map((effect) => fxNames[effect.type]).join(', ') || 'none'}`,
      )}
      <div
        className="flow-node out"
        data-node="out"
        style={{ gridArea: 'out' }}
      >
        <SoundScope preset={preset} tune={tune} padId={padId} />
      </div>
    </div>
  );
}
