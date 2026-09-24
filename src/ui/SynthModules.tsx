'use client';

import { ArrowDown, ArrowRight, Plus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type {
  CombineMode,
  EffectDefinition,
  FilterDefinition,
  FilterMode,
  SynthPreset,
  VoiceArchitecture,
} from '../model/types';
import { ENGINE_NAMES } from '../model/voice';
import { Chips, hz, Knob, Panel, percent } from './SynthControls';
import { EnvelopePanel } from './SynthEngines';
import { FilterCurve, VoiceShape } from './SynthVisuals';

type UpdateVoice = (mutator: (voice: VoiceArchitecture) => void) => void;
type UpdatePreset = (mutator: (preset: SynthPreset) => void) => void;

const COMBINE: {
  mode: CombineMode;
  symbol: string;
  name: string;
  formula: string;
  text: string;
}[] = [
  {
    mode: 'layer',
    symbol: '+',
    name: 'Layer',
    formula: 'Engine 1 + Engine 2',
    text: 'Both engines play side by side, each at its own level. Stack a body and a noise snap, or a kick and a click.',
  },
  {
    mode: 'fm',
    symbol: 'FM',
    name: 'FM',
    formula: 'Engine 2 → pitch of Engine 1',
    text: 'Engine 2 bends Engine 1’s pitch at audio rate. Low amounts add growl, higher ones bells and metal. Turn Engine 2’s level down to hear only the result.',
  },
  {
    mode: 'ring',
    symbol: '×',
    name: 'Ring',
    formula: 'Engine 1 × Engine 2',
    text: 'Multiplies the two signals into sum and difference tones: clangs, cowbells and inharmonic hits. Amount blends from dry Engine 1 to fully ringed.',
  },
];

export function CombineEditor({
  preset,
  updateVoice,
  openEngine2,
}: {
  preset: SynthPreset;
  updateVoice: UpdateVoice;
  openEngine2: () => void;
}) {
  const { combine, engines } = preset.voice;
  const [one, two] = engines;
  const current = COMBINE.find((item) => item.mode === combine.mode)!;
  return (
    <div className="module-editor combine-editor">
      <header className="module-header">
        <div>
          <span>COMBINE</span>
          <h2>How Engine 2 joins Engine 1</h2>
        </div>
      </header>
      {!two.enabled && (
        <div className="module-notice">
          <p>Engine 2 is off, so Engine 1 plays alone.</p>
          <button
            className="primary"
            onClick={() => {
              updateVoice((voice) => {
                voice.engines[1].enabled = true;
              });
              openEngine2();
            }}
          >
            <Plus /> Turn on Engine 2
          </button>
        </div>
      )}
      <fieldset className="combine-modes" aria-label="Combine mode">
        {COMBINE.map((item) => (
          <button
            key={item.mode}
            className={combine.mode === item.mode ? 'active' : ''}
            aria-pressed={combine.mode === item.mode}
            onClick={() =>
              updateVoice((voice) => {
                voice.combine.mode = item.mode;
              })
            }
          >
            <CombineDiagram mode={item.mode} />
            <strong>
              <b>{item.symbol}</b> {item.name}
            </strong>
            <small>{item.formula}</small>
          </button>
        ))}
      </fieldset>
      <p className="module-lede">{current.text}</p>
      <div className="module-grid">
        <Panel
          title={combine.mode === 'layer' ? 'Balance' : 'Depth'}
          meta={`${ENGINE_NAMES[one.patch.engine]} ${current.symbol} ${ENGINE_NAMES[two.patch.engine]}`}
        >
          <div className="knob-row">
            {combine.mode !== 'layer' && (
              <Knob
                label={combine.mode === 'fm' ? 'FM DEPTH' : 'RING MIX'}
                value={combine.amount}
                min={0}
                max={1}
                format={percent}
                mod="combine"
                disabled={!two.enabled}
                onChange={(amount) =>
                  updateVoice((voice) => {
                    voice.combine.amount = amount;
                  })
                }
              />
            )}
            <Knob
              label="ENGINE 1"
              value={one.level}
              min={0}
              max={1}
              format={percent}
              mod="engine1"
              onChange={(level) =>
                updateVoice((voice) => {
                  voice.engines[0].level = level;
                })
              }
            />
            <Knob
              label="ENGINE 2"
              value={two.level}
              min={0}
              max={1}
              format={percent}
              mod="engine2"
              disabled={!two.enabled}
              onChange={(level) =>
                updateVoice((voice) => {
                  voice.engines[1].level = level;
                })
              }
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function CombineDiagram({ mode }: { mode: CombineMode }) {
  return (
    <svg className="combine-diagram" viewBox="0 0 120 44" aria-hidden="true">
      <rect x="2" y="4" width="30" height="14" rx="2" />
      <text x="17" y="14">
        E1
      </text>
      <rect x="2" y="26" width="30" height="14" rx="2" />
      <text x="17" y="36">
        E2
      </text>
      {mode === 'layer' && (
        <>
          <path d="M32,11 C52,11 52,22 70,22" />
          <path d="M32,33 C52,33 52,22 70,22" />
        </>
      )}
      {mode === 'fm' && (
        <>
          <path className="mod" d="M17,26 V19" />
          <path d="M32,11 C52,11 52,22 70,22" />
          <path className="faint" d="M32,33 C52,33 52,22 70,22" />
        </>
      )}
      {mode === 'ring' && (
        <>
          <path d="M32,11 C44,11 44,22 52,22" />
          <path d="M32,33 C44,33 44,22 52,22" />
          <circle cx="57" cy="22" r="5" />
          <path d="M62,22 H70" />
        </>
      )}
      <path d="M70,22 H104" />
      <path className="head" d="M100,18 L106,22 L100,26" />
      <text x="113" y="25" className="out">
        OUT
      </text>
    </svg>
  );
}

const FILTER_MODES: { value: FilterMode; label: string }[] = [
  { value: 'lowpass', label: 'LP' },
  { value: 'highpass', label: 'HP' },
  { value: 'bandpass', label: 'BP' },
  { value: 'notch', label: 'Notch' },
];

export function FiltersEditor({
  preset,
  updateVoice,
}: {
  preset: SynthPreset;
  updateVoice: UpdateVoice;
}) {
  const { filters, filterRouting, engines, filterEnvelope } = preset.voice;
  const routing = Math.max(0, Math.min(1, filterRouting));
  return (
    <div className="module-editor filters-editor">
      <header className="module-header">
        <div>
          <span>FILTERS</span>
          <h2>Two filters, in series or parallel</h2>
        </div>
      </header>
      <p className="module-lede">
        {routing <= 0.02
          ? 'Series: Filter 1 feeds Filter 2, so both shape the same signal one after the other.'
          : routing >= 0.98
            ? 'Parallel: each filter shapes its own share of the engines, then the two are mixed.'
            : 'Between series and parallel: part of Filter 1 continues into Filter 2, the rest goes straight to the amp.'}{' '}
        Each engine’s <em>To filter</em> control decides which filter it feeds.
      </p>
      <div className="filters-row">
        {filters.map((filter, index) => (
          <FilterPanel
            key={index}
            index={index as 0 | 1}
            filter={filter}
            update={(mutator) =>
              updateVoice((voice) => mutator(voice.filters[index]))
            }
          />
        ))}
        <Panel
          title="Routing"
          meta="SERIES ↔ PARALLEL"
          className="routing-panel"
        >
          <RoutingDiagram routing={routing} />
          <div className="knob-row">
            <Knob
              label="ROUTING"
              value={routing}
              min={0}
              max={1}
              format={(value) =>
                value <= 0.02
                  ? 'Series'
                  : value >= 0.98
                    ? 'Parallel'
                    : `${Math.round(value * 100)}% par`
              }
              onChange={(value) =>
                updateVoice((voice) => {
                  voice.filterRouting = value;
                })
              }
            />
            {engines.map((slot, index) =>
              slot.enabled ? (
                <Knob
                  key={index}
                  label={`ENGINE ${index + 1}`}
                  value={slot.filterMix}
                  min={0}
                  max={1}
                  bipolar
                  format={(mix) =>
                    mix <= 0.005
                      ? '→ F1'
                      : mix >= 0.995
                        ? '→ F2'
                        : `${Math.round((1 - mix) * 100)}/${Math.round(mix * 100)}`
                  }
                  onChange={(mix) =>
                    updateVoice((voice) => {
                      voice.engines[index].filterMix = mix;
                    })
                  }
                />
              ) : null,
            )}
          </div>
        </Panel>
      </div>
      <div className="module-grid">
        <EnvelopePanel
          title="Filter envelope"
          meta="SHARED · ENV AMOUNT PER FILTER"
          envelope={filterEnvelope}
          onChange={(envelope) =>
            updateVoice((voice) => {
              voice.filterEnvelope = envelope;
            })
          }
        />
      </div>
    </div>
  );
}

function FilterPanel({
  index,
  filter,
  update,
}: {
  index: 0 | 1;
  filter: FilterDefinition;
  update: (mutator: (filter: FilterDefinition) => void) => void;
}) {
  return (
    <Panel
      title={`Filter ${index + 1}`}
      meta={filter.enabled ? filter.mode.toUpperCase() : 'BYPASSED'}
      className={`filter-panel ${filter.enabled ? '' : 'bypassed'}`}
      actions={
        <Switch
          aria-label={`Filter ${index + 1} on`}
          checked={filter.enabled}
          onCheckedChange={(enabled) =>
            update((next) => {
              next.enabled = enabled;
            })
          }
        />
      }
    >
      <Chips
        ariaLabel={`Filter ${index + 1} type`}
        value={filter.mode}
        options={FILTER_MODES}
        onChange={(mode) =>
          update((next) => {
            next.mode = mode;
            next.enabled = true;
          })
        }
      />
      <div className="curve-viz filter-viz">
        <FilterCurve filter={filter} />
        <span className="axis-labels" aria-hidden="true">
          <i>100</i>
          <i>1k</i>
          <i>10k</i>
        </span>
      </div>
      <div className="knob-row">
        <Knob
          label="CUTOFF"
          value={filter.cutoff}
          min={40}
          max={19000}
          step={1}
          scale="log"
          format={(value) => `${hz(value)} Hz`}
          mod={index ? 'cutoff2' : 'cutoff'}
          disabled={!filter.enabled}
          onChange={(cutoff) =>
            update((next) => {
              next.cutoff = cutoff;
            })
          }
        />
        <Knob
          label="RESO"
          value={filter.resonance}
          min={0.1}
          max={18}
          step={0.01}
          scale="log"
          format={(value) => value.toFixed(1)}
          mod={index ? 'resonance2' : 'resonance'}
          disabled={!filter.enabled}
          onChange={(resonance) =>
            update((next) => {
              next.resonance = resonance;
            })
          }
        />
        <Knob
          label="ENV"
          value={filter.envelopeAmount}
          min={-8000}
          max={8000}
          step={10}
          bipolar
          format={(value) => `${value > 0 ? '+' : ''}${hz(value)}`}
          disabled={!filter.enabled}
          onChange={(envelopeAmount) =>
            update((next) => {
              next.envelopeAmount = envelopeAmount;
            })
          }
        />
        <Knob
          label="KEY"
          value={filter.keyTracking}
          min={0}
          max={1}
          format={percent}
          disabled={!filter.enabled}
          onChange={(keyTracking) =>
            update((next) => {
              next.keyTracking = keyTracking;
            })
          }
        />
      </div>
    </Panel>
  );
}

function RoutingDiagram({ routing }: { routing: number }) {
  const series = 1 - routing;
  return (
    <svg className="routing-diagram" viewBox="0 0 160 70" aria-hidden="true">
      <rect x="4" y="6" width="36" height="18" rx="2" />
      <text x="22" y="18">
        F1
      </text>
      <rect x="4" y="46" width="36" height="18" rx="2" />
      <text x="22" y="58">
        F2
      </text>
      <rect x="112" y="26" width="44" height="18" rx="2" />
      <text x="134" y="38">
        AMP
      </text>
      <path
        d="M22,24 V46"
        opacity={0.25 + series * 0.75}
        strokeWidth={1 + series * 1.5}
      />
      <path
        d="M40,15 C80,15 80,35 112,35"
        opacity={0.25 + routing * 0.75}
        strokeWidth={1 + routing * 1.5}
      />
      <path d="M40,55 C80,55 80,35 112,35" strokeWidth={2} />
    </svg>
  );
}

export function AmpEditor({
  preset,
  updateVoice,
}: {
  preset: SynthPreset;
  updateVoice: UpdateVoice;
}) {
  const { amp } = preset.voice;
  return (
    <div className="module-editor amp-editor">
      <header className="module-header">
        <div>
          <span>AMP</span>
          <h2>Level, pan and touch</h2>
        </div>
      </header>
      <p className="module-lede">
        The filtered engines meet here. Velocity sets how much harder hits get
        louder; at 0% every hit plays at full level.
      </p>
      <div className="module-grid">
        <Panel title="Output" meta="AMP">
          <div className="knob-row">
            <Knob
              label="LEVEL"
              value={amp.level}
              min={0}
              max={1.5}
              format={percent}
              mod="amplitude"
              onChange={(level) =>
                updateVoice((voice) => {
                  voice.amp.level = level;
                })
              }
            />
            <Knob
              label="PAN"
              value={amp.pan}
              min={-1}
              max={1}
              bipolar
              format={(pan) =>
                Math.abs(pan) < 0.01
                  ? 'C'
                  : `${pan < 0 ? 'L' : 'R'}${Math.round(Math.abs(pan) * 100)}`
              }
              mod="pan"
              onChange={(pan) =>
                updateVoice((voice) => {
                  voice.amp.pan = pan;
                })
              }
            />
            <Knob
              label="VELOCITY"
              value={amp.velocity}
              min={0}
              max={1}
              format={percent}
              onChange={(velocity) =>
                updateVoice((voice) => {
                  voice.amp.velocity = velocity;
                })
              }
            />
          </div>
        </Panel>
        <Panel title="Voice shape" meta="ENGINE ENVELOPES INTO THE AMP">
          <div className="curve-viz">
            <VoiceShape preset={preset} />
          </div>
          <p className="panel-legend">
            <span className="engine-1">Engine 1</span>
            {preset.voice.engines[1].enabled && (
              <span className="engine-2">Engine 2</span>
            )}
          </p>
        </Panel>
      </div>
    </div>
  );
}

const INSERTS = ['drive', 'bitcrush', 'compressor'] as const;
const SENDS = ['delay', 'reverb'] as const;
const EFFECT_INFO: Record<
  EffectDefinition['type'],
  { name: string; amount: string; text: string }
> = {
  drive: {
    name: 'Drive',
    amount: 'DRIVE',
    text: 'Soft clipping for weight and edge',
  },
  bitcrush: {
    name: 'Crush',
    amount: 'CRUSH',
    text: 'Fewer amplitude steps, lo-fi grit',
  },
  compressor: {
    name: 'Compressor',
    amount: 'SQUASH',
    text: 'Evens out the hit, lifts the tail',
  },
  delay: { name: 'Delay', amount: 'COLOR', text: 'Shared echo send' },
  reverb: { name: 'Reverb', amount: 'COLOR', text: 'Shared room send' },
};

export function EffectsEditor({
  preset,
  updatePreset,
}: {
  preset: SynthPreset;
  updatePreset: UpdatePreset;
}) {
  const effect = (type: EffectDefinition['type']) =>
    preset.effects.find((item) => item.type === type) ?? {
      type,
      enabled: false,
      mix: 0.35,
      amount: 0.4,
    };
  const change = (
    type: EffectDefinition['type'],
    patch: Partial<EffectDefinition>,
  ) =>
    updatePreset((next) => {
      const target = next.effects.find((item) => item.type === type);
      if (target) Object.assign(target, patch);
      else next.effects.push({ ...effect(type), ...patch });
    });
  const card = (type: EffectDefinition['type']) => {
    const current = effect(type);
    const info = EFFECT_INFO[type];
    return (
      <section
        key={type}
        className={`effect-card ${current.enabled ? 'enabled' : ''}`}
      >
        <header>
          <div>
            <strong>{info.name}</strong>
            <small>{info.text}</small>
          </div>
          <Switch
            aria-label={`${info.name} on`}
            checked={current.enabled}
            onCheckedChange={(enabled) => change(type, { enabled })}
          />
        </header>
        <div className="knob-row">
          <Knob
            label={info.amount}
            value={current.amount}
            min={0}
            max={1}
            format={percent}
            disabled={!current.enabled}
            onChange={(amount) => change(type, { amount })}
          />
          <Knob
            label={
              SENDS.includes(type as (typeof SENDS)[number]) ? 'SEND' : 'MIX'
            }
            value={current.mix}
            min={0}
            max={1}
            format={percent}
            disabled={!current.enabled}
            onChange={(mix) => change(type, { mix })}
          />
        </div>
      </section>
    );
  };
  return (
    <div className="module-editor effects-editor">
      <header className="module-header">
        <div>
          <span>FX</span>
          <h2>Insert chain, then sends</h2>
        </div>
      </header>
      <p className="module-lede">
        Inserts process the sound in order, left to right. Delay and reverb are
        sends: they take a copy after the inserts and add it back.
      </p>
      <div className="effect-chain" aria-label="Insert effects, in order">
        <span className="chain-end">AMP</span>
        {INSERTS.map((type) => (
          <div className="chain-step" key={type}>
            <ArrowRight className="chain-arrow horizontal" aria-hidden="true" />
            <ArrowDown className="chain-arrow vertical" aria-hidden="true" />
            {card(type)}
          </div>
        ))}
        <div className="chain-step">
          <ArrowRight className="chain-arrow horizontal" aria-hidden="true" />
          <ArrowDown className="chain-arrow vertical" aria-hidden="true" />
          <span className="chain-end">OUT</span>
        </div>
      </div>
      <div className="effect-sends" aria-label="Send effects">
        <span className="send-label">SENDS</span>
        {SENDS.map((type) => card(type))}
      </div>
    </div>
  );
}
