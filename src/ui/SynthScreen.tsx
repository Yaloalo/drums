'use client';

import { useState } from 'react';
import { ArrowLeft, Copy, Play, RotateCcw, Save, Sparkles } from 'lucide-react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type {
  AdditivePatch,
  FMPatch,
  LFO,
  ModulationDestination,
  ModulationSource,
  SubtractivePatch,
  SynthPreset,
} from '../model/types';
import { cloneSerializable } from '../model/types';
import { useApp } from '../state/AppContext';

type Section = 'tone' | 'envelope' | 'modulation' | 'effects' | 'library';

export function SynthScreen() {
  const {
    kit,
    selectedPadIndex,
    selectedPreset,
    presets,
    triggerPad,
    assignPreset,
    updateSelectedPreset,
    resetSelectedPreset,
    saveSelectedPreset,
    duplicateSelectedPreset,
    switchEngine,
    setArea,
  } = useApp();
  const [section, setSection] = useState<Section>('tone');
  const pad = kit.pads[selectedPadIndex];

  const updatePatch = (mutator: (patch: SynthPreset['patch']) => void) => {
    const next = cloneSerializable(selectedPreset);
    mutator(next.patch);
    updateSelectedPreset(next);
  };
  const updatePreset = (mutator: (preset: SynthPreset) => void) => {
    const next = cloneSerializable(selectedPreset);
    mutator(next);
    updateSelectedPreset(next);
  };

  return (
    <section className="screen synth-screen">
      <header className="screen-header synth-header">
        <button
          className="back-control"
          onClick={() => setArea('pads')}
          aria-label="Return to pads"
        >
          <ArrowLeft />
          <span>PADS</span>
        </button>
        <div className="screen-title">
          <span>SOUND DESIGN · PAD {selectedPadIndex + 1}</span>
          <h1>{selectedPreset.name}</h1>
        </div>
        <button
          className="audition-button"
          onPointerDown={(event) => {
            event.preventDefault();
            triggerPad(selectedPadIndex);
          }}
          onClick={(event) => {
            if (event.detail === 0) triggerPad(selectedPadIndex);
          }}
        >
          <Play /> HIT
        </button>
      </header>

      <div className="synth-engine-row" data-gesture-lock>
        {(['subtractive', 'fm', 'additive'] as const).map((engine) => (
          <button
            key={engine}
            className={selectedPreset.engineType === engine ? 'active' : ''}
            aria-pressed={selectedPreset.engineType === engine}
            onClick={() => switchEngine(engine)}
          >
            <i />
            {engine === 'fm' ? 'FM' : engine.toUpperCase()}
          </button>
        ))}
      </div>

      <nav
        className="section-strip"
        aria-label="Synthesizer sections"
        data-gesture-lock
      >
        {(
          ['tone', 'envelope', 'modulation', 'effects', 'library'] as Section[]
        ).map((item) => (
          <button
            className={section === item ? 'active' : ''}
            aria-pressed={section === item}
            key={item}
            onClick={() => setSection(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <div className="synth-workbench" data-gesture-lock>
        {section === 'tone' &&
          selectedPreset.patch.engine === 'subtractive' && (
            <SubtractiveTone
              patch={selectedPreset.patch}
              update={updatePatch}
            />
          )}
        {section === 'tone' && selectedPreset.patch.engine === 'fm' && (
          <FMTone patch={selectedPreset.patch} update={updatePatch} />
        )}
        {section === 'tone' && selectedPreset.patch.engine === 'additive' && (
          <AdditiveTone patch={selectedPreset.patch} update={updatePatch} />
        )}
        {section === 'envelope' && (
          <EnvelopePanel preset={selectedPreset} update={updatePatch} />
        )}
        {section === 'modulation' && (
          <ModulationPanel
            preset={selectedPreset}
            updatePreset={updatePreset}
            updatePatch={updatePatch}
          />
        )}
        {section === 'effects' && (
          <EffectsPanel preset={selectedPreset} updatePreset={updatePreset} />
        )}
        {section === 'library' && (
          <LibraryPanel
            preset={selectedPreset}
            presets={presets}
            padPresetId={pad.presetId}
            assign={assignPreset}
            save={saveSelectedPreset}
            duplicate={duplicateSelectedPreset}
            reset={resetSelectedPreset}
          />
        )}
      </div>

      <footer className="synth-footer">
        <div>
          <span>ENGINE</span>
          <strong>{selectedPreset.engineType.toUpperCase()}</strong>
        </div>
        <div>
          <span>CATEGORY</span>
          <strong>{selectedPreset.category.toUpperCase()}</strong>
        </div>
        <button onClick={() => saveSelectedPreset()}>
          <Save /> SAVE AS NEW
        </button>
      </footer>
    </section>
  );
}

function Knob({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const progress = (value - min) / (max - min);
  return (
    <label className="synth-knob">
      <span
        className="knob-face"
        style={
          { '--turn': `${-135 + progress * 270}deg` } as React.CSSProperties
        }
      >
        <i />
      </span>
      <b>{label}</b>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) =>
          onChange(typeof next === 'number' ? next : next[0])
        }
        aria-label={label}
        aria-valuetext={`${value}${unit}`}
      />
      <output>
        {max > 1000
          ? Math.round(value)
          : Number(value).toFixed(step < 1 ? 2 : 0)}
        {unit}
      </output>
    </label>
  );
}

function SubtractiveTone({
  patch,
  update,
}: {
  patch: SubtractivePatch;
  update: (mutator: (patch: SynthPreset['patch']) => void) => void;
}) {
  return (
    <div className="synth-panel-stack">
      <Panel
        title="Oscillator bank"
        meta={`${patch.oscillators.length} OSC + NOISE`}
      >
        {patch.oscillators.map((oscillator, index) => (
          <div className="operator-row" key={index}>
            <span className="operator-id">O{index + 1}</span>
            <NativeSelect
              value={oscillator.waveform}
              onChange={(event) =>
                update((next) => {
                  if (next.engine === 'subtractive')
                    next.oscillators[index].waveform = event.target
                      .value as OscillatorType;
                })
              }
            >
              {['sine', 'triangle', 'sawtooth', 'square'].map((wave) => (
                <NativeSelectOption key={wave} value={wave}>
                  {wave}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Mini
              label="OCT"
              value={oscillator.octave}
              min={-2}
              max={2}
              step={1}
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'subtractive')
                    next.oscillators[index].octave = value;
                })
              }
            />
            <Mini
              label="SEMI"
              value={oscillator.semitone}
              min={-12}
              max={12}
              step={1}
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'subtractive')
                    next.oscillators[index].semitone = value;
                })
              }
            />
            <Mini
              label="FINE"
              value={oscillator.fine}
              min={-50}
              max={50}
              step={1}
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'subtractive')
                    next.oscillators[index].fine = value;
                })
              }
            />
            <Mini
              label="LEVEL"
              value={oscillator.level}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'subtractive')
                    next.oscillators[index].level = value;
                })
              }
            />
          </div>
        ))}
        <div className="knob-grid five">
          <Knob
            label="BASE"
            value={patch.baseFrequency}
            min={30}
            max={9000}
            step={1}
            unit=" Hz"
            onChange={(value) =>
              update((next) => {
                next.baseFrequency = value;
              })
            }
          />
          <Knob
            label="NOISE"
            value={patch.noise.level}
            min={0}
            max={1}
            onChange={(value) =>
              update((next) => {
                if (next.engine === 'subtractive') next.noise.level = value;
              })
            }
          />
          <Knob
            label="PITCH"
            value={patch.pitchEnvelope.amount}
            min={-72}
            max={96}
            step={1}
            unit=" st"
            onChange={(value) =>
              update((next) => {
                if (next.engine === 'subtractive')
                  next.pitchEnvelope.amount = value;
              })
            }
          />
          <Knob
            label="P DECAY"
            value={patch.pitchEnvelope.decay}
            min={0.01}
            max={1}
            onChange={(value) =>
              update((next) => {
                if (next.engine === 'subtractive')
                  next.pitchEnvelope.decay = value;
              })
            }
          />
        </div>
      </Panel>
      <Panel title="Multimode filter" meta={patch.filter.mode.toUpperCase()}>
        <div className="filter-mode">
          {(['lowpass', 'highpass', 'bandpass'] as const).map((mode) => (
            <button
              className={patch.filter.mode === mode ? 'active' : ''}
              aria-pressed={patch.filter.mode === mode}
              key={mode}
              onClick={() =>
                update((next) => {
                  if (next.engine === 'subtractive') next.filter.mode = mode;
                })
              }
            >
              {mode.replace('pass', '')}
            </button>
          ))}
        </div>
        <div className="knob-grid">
          <Knob
            label="CUTOFF"
            value={patch.filter.cutoff}
            min={40}
            max={19000}
            step={10}
            unit=" Hz"
            onChange={(value) =>
              update((next) => {
                if (next.engine === 'subtractive') next.filter.cutoff = value;
              })
            }
          />
          <Knob
            label="RESO"
            value={patch.filter.resonance}
            min={0}
            max={18}
            onChange={(value) =>
              update((next) => {
                if (next.engine === 'subtractive')
                  next.filter.resonance = value;
              })
            }
          />
          <Knob
            label="ENV"
            value={patch.filter.envelopeAmount}
            min={-8000}
            max={8000}
            step={10}
            onChange={(value) =>
              update((next) => {
                if (next.engine === 'subtractive')
                  next.filter.envelopeAmount = value;
              })
            }
          />
          <Knob
            label="KEY"
            value={patch.filter.keyTracking}
            min={0}
            max={1}
            onChange={(value) =>
              update((next) => {
                if (next.engine === 'subtractive')
                  next.filter.keyTracking = value;
              })
            }
          />
        </div>
      </Panel>
    </div>
  );
}

function FMTone({
  patch,
  update,
}: {
  patch: FMPatch;
  update: (mutator: (patch: SynthPreset['patch']) => void) => void;
}) {
  return (
    <div className="synth-panel-stack">
      <Panel title="FM algorithm" meta={`4 OPERATORS · ALG ${patch.algorithm}`}>
        <div className="algorithm-picker">
          {([1, 2, 3, 4, 5, 6] as const).map((algorithm) => (
            <button
              key={algorithm}
              className={patch.algorithm === algorithm ? 'active' : ''}
              aria-pressed={patch.algorithm === algorithm}
              onClick={() =>
                update((next) => {
                  if (next.engine === 'fm') next.algorithm = algorithm;
                })
              }
            >
              <span>
                {algorithm === 6
                  ? '••••'
                  : algorithm < 4
                    ? '●—●—●'
                    : '●—●  ●—●'}
              </span>
              ALG {algorithm}
            </button>
          ))}
        </div>
      </Panel>
      <Panel
        title="Operators"
        meta={`${Math.round(patch.baseFrequency)} HZ FUNDAMENTAL`}
      >
        <div className="knob-grid five">
          <Knob
            label="BASE"
            value={patch.baseFrequency}
            min={35}
            max={2400}
            step={1}
            unit=" Hz"
            onChange={(value) =>
              update((next) => {
                next.baseFrequency = value;
              })
            }
          />
        </div>
        {patch.operators.map((operator, index) => (
          <div className={`operator-row fm-op op-${index}`} key={index}>
            <span className="operator-id">OP{index + 1}</span>
            <Mini
              label="RATIO"
              value={operator.ratio}
              min={0.1}
              max={12}
              step={0.01}
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'fm') next.operators[index].ratio = value;
                })
              }
            />
            <Mini
              label="LEVEL"
              value={operator.level}
              min={0}
              max={1.5}
              step={0.01}
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'fm') next.operators[index].level = value;
                })
              }
            />
            <Mini
              label="FINE"
              value={operator.fine}
              min={-100}
              max={100}
              step={1}
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'fm') next.operators[index].fine = value;
                })
              }
            />
            <Mini
              label="DECAY"
              value={operator.envelope.decay}
              min={0.02}
              max={3}
              step={0.01}
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'fm')
                    next.operators[index].envelope.decay = value;
                })
              }
            />
            <Mini
              label="FEED"
              value={operator.feedback}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'fm')
                    next.operators[index].feedback = value;
                })
              }
            />
          </div>
        ))}
      </Panel>
    </div>
  );
}

function AdditiveTone({
  patch,
  update,
}: {
  patch: AdditivePatch;
  update: (mutator: (patch: SynthPreset['patch']) => void) => void;
}) {
  return (
    <div className="synth-panel-stack">
      <Panel title="Spectral macros" meta={`${patch.partials.length} PARTIALS`}>
        <div className="knob-grid">
          <Knob
            label="FUND"
            value={patch.baseFrequency}
            min={35}
            max={2200}
            step={1}
            unit=" Hz"
            onChange={(value) =>
              update((next) => {
                next.baseFrequency = value;
              })
            }
          />
          <Knob
            label="TILT"
            value={patch.spectralTilt}
            min={0}
            max={1}
            onChange={(value) =>
              update((next) => {
                if (next.engine === 'additive') next.spectralTilt = value;
              })
            }
          />
          <Knob
            label="INHARM"
            value={patch.inharmonicity}
            min={0}
            max={0.25}
            step={0.001}
            onChange={(value) =>
              update((next) => {
                if (next.engine === 'additive') next.inharmonicity = value;
              })
            }
          />
          <Knob
            label="SPREAD"
            value={patch.spread}
            min={0}
            max={1}
            onChange={(value) =>
              update((next) => {
                if (next.engine === 'additive') next.spread = value;
              })
            }
          />
        </div>
      </Panel>
      <Panel title="Partials" meta="RATIO · AMP · DECAY">
        {patch.partials.map((partial, index) => (
          <div className="partial-row" key={index}>
            <span>P{index + 1}</span>
            <Mini
              label="RATIO"
              value={partial.ratio}
              min={0.1}
              max={16}
              step={0.01}
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'additive')
                    next.partials[index].ratio = value;
                })
              }
            />
            <Mini
              label="AMP"
              value={partial.amplitude}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'additive')
                    next.partials[index].amplitude = value;
                })
              }
            />
            <Mini
              label="DECAY"
              value={partial.decay}
              min={0.02}
              max={4}
              step={0.01}
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'additive')
                    next.partials[index].decay = value;
                })
              }
            />
            <Mini
              label="DETUNE"
              value={partial.detune}
              min={-50}
              max={50}
              step={1}
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'additive')
                    next.partials[index].detune = value;
                })
              }
            />
          </div>
        ))}
      </Panel>
    </div>
  );
}

function EnvelopePanel({
  preset,
  update,
}: {
  preset: SynthPreset;
  update: (mutator: (patch: SynthPreset['patch']) => void) => void;
}) {
  const amp = preset.patch.ampEnvelope;
  return (
    <div className="synth-panel-stack">
      <Panel title="Amplitude envelope" meta="ADSR">
        <div className="envelope-viz">
          <svg viewBox="0 0 300 85" aria-label="Amplitude envelope">
            <polyline
              points={`0,80 ${10 + amp.attack * 65},5 ${30 + (amp.attack + amp.decay) * 60},${80 - amp.sustain * 65} 240,${80 - amp.sustain * 65} 300,80`}
            />
          </svg>
        </div>
        <div className="knob-grid">
          <Knob
            label="ATTACK"
            value={amp.attack}
            min={0.001}
            max={2}
            step={0.001}
            unit="s"
            onChange={(value) =>
              update((next) => {
                next.ampEnvelope.attack = value;
              })
            }
          />
          <Knob
            label="DECAY"
            value={amp.decay}
            min={0.01}
            max={4}
            step={0.01}
            unit="s"
            onChange={(value) =>
              update((next) => {
                next.ampEnvelope.decay = value;
              })
            }
          />
          <Knob
            label="SUSTAIN"
            value={amp.sustain}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) =>
              update((next) => {
                next.ampEnvelope.sustain = value;
              })
            }
          />
          <Knob
            label="RELEASE"
            value={amp.release}
            min={0.01}
            max={3}
            step={0.01}
            unit="s"
            onChange={(value) =>
              update((next) => {
                next.ampEnvelope.release = value;
              })
            }
          />
        </div>
      </Panel>
      {preset.patch.engine === 'subtractive' && (
        <Panel title="Filter envelope" meta="ADSR">
          <div className="knob-grid">
            <Knob
              label="ATTACK"
              value={preset.patch.filterEnvelope.attack}
              min={0.001}
              max={2}
              step={0.001}
              unit="s"
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'subtractive')
                    next.filterEnvelope.attack = value;
                })
              }
            />
            <Knob
              label="DECAY"
              value={preset.patch.filterEnvelope.decay}
              min={0.01}
              max={3}
              step={0.01}
              unit="s"
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'subtractive')
                    next.filterEnvelope.decay = value;
                })
              }
            />
            <Knob
              label="SUSTAIN"
              value={preset.patch.filterEnvelope.sustain}
              min={0}
              max={1}
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'subtractive')
                    next.filterEnvelope.sustain = value;
                })
              }
            />
            <Knob
              label="RELEASE"
              value={preset.patch.filterEnvelope.release}
              min={0.01}
              max={3}
              onChange={(value) =>
                update((next) => {
                  if (next.engine === 'subtractive')
                    next.filterEnvelope.release = value;
                })
              }
            />
          </div>
        </Panel>
      )}
    </div>
  );
}

function ModulationPanel({
  preset,
  updatePreset,
  updatePatch,
}: {
  preset: SynthPreset;
  updatePreset: (mutator: (preset: SynthPreset) => void) => void;
  updatePatch: (mutator: (patch: SynthPreset['patch']) => void) => void;
}) {
  return (
    <div className="synth-panel-stack">
      <Panel title="LFOs" meta="2 MODULATORS">
        {preset.patch.lfos.map((lfo, index) => (
          <div className="mod-route" key={index}>
            <span>LFO {index + 1}</span>
            <NativeSelect
              value={lfo.shape}
              onChange={(event) =>
                updatePatch((next) => {
                  next.lfos[index].shape = event.target.value as LFO['shape'];
                })
              }
            >
              {['sine', 'triangle', 'sawtooth', 'square'].map((shape) => (
                <NativeSelectOption key={shape}>{shape}</NativeSelectOption>
              ))}
            </NativeSelect>
            <Mini
              label="RATE"
              value={lfo.rate}
              min={0.05}
              max={30}
              step={0.05}
              onChange={(value) =>
                updatePatch((next) => {
                  next.lfos[index].rate = value;
                })
              }
            />
            <Mini
              label="DEPTH"
              value={lfo.depth}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                updatePatch((next) => {
                  next.lfos[index].depth = value;
                })
              }
            />
            <NativeSelect
              value={lfo.destination}
              onChange={(event) =>
                updatePatch((next) => {
                  next.lfos[index].destination = event.target
                    .value as ModulationDestination;
                })
              }
            >
              {[
                'pitch',
                'amplitude',
                'cutoff',
                'resonance',
                'pan',
                'fmIndex',
                'spectralTilt',
              ].map((destination) => (
                <NativeSelectOption key={destination}>
                  {destination}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ))}
      </Panel>
      <Panel title="Modulation matrix" meta="SOURCE → DESTINATION">
        {preset.modulation.map((route, index) => (
          <div className="mod-route" key={index}>
            <NativeSelect
              value={route.source}
              onChange={(event) =>
                updatePreset((next) => {
                  next.modulation[index].source = event.target
                    .value as ModulationSource;
                })
              }
            >
              {['lfo1', 'lfo2', 'ampEnv', 'modEnv', 'velocity', 'random'].map(
                (source) => (
                  <NativeSelectOption key={source}>{source}</NativeSelectOption>
                ),
              )}
            </NativeSelect>
            <span className="route-arrow">→</span>
            <NativeSelect
              value={route.destination}
              onChange={(event) =>
                updatePreset((next) => {
                  next.modulation[index].destination = event.target
                    .value as ModulationDestination;
                })
              }
            >
              {[
                'pitch',
                'level',
                'cutoff',
                'resonance',
                'pan',
                'amplitude',
                'fmIndex',
                'spectralTilt',
              ].map((destination) => (
                <NativeSelectOption key={destination}>
                  {destination}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Mini
              label="AMOUNT"
              value={route.amount}
              min={-1}
              max={1}
              step={0.01}
              onChange={(value) =>
                updatePreset((next) => {
                  next.modulation[index].amount = value;
                })
              }
            />
          </div>
        ))}
      </Panel>
    </div>
  );
}

function EffectsPanel({
  preset,
  updatePreset,
}: {
  preset: SynthPreset;
  updatePreset: (mutator: (preset: SynthPreset) => void) => void;
}) {
  const types = ['drive', 'bitcrush', 'compressor', 'delay', 'reverb'] as const;
  return (
    <div className="effect-rack">
      {types.map((type) => {
        const index = preset.effects.findIndex(
          (effect) => effect.type === type,
        );
        const effect = preset.effects[index] ?? {
          type,
          enabled: false,
          mix: 0,
          amount: 0,
        };
        return (
          <Panel
            title={type}
            meta={effect.enabled ? 'ACTIVE' : 'BYPASSED'}
            key={type}
          >
            <div className="effect-row">
              <Switch
                aria-label={`Enable ${type}`}
                checked={effect.enabled}
                onCheckedChange={(checked) =>
                  updatePreset((next) => {
                    if (index >= 0) next.effects[index].enabled = checked;
                    else next.effects.push({ ...effect, enabled: checked });
                  })
                }
              />
              <Knob
                label="AMOUNT"
                value={effect.amount}
                min={0}
                max={1}
                onChange={(value) =>
                  updatePreset((next) => {
                    const target = next.effects.find(
                      (item) => item.type === type,
                    );
                    if (target) target.amount = value;
                  })
                }
              />
              <Knob
                label="MIX"
                value={effect.mix}
                min={0}
                max={1}
                onChange={(value) =>
                  updatePreset((next) => {
                    const target = next.effects.find(
                      (item) => item.type === type,
                    );
                    if (target) target.mix = value;
                  })
                }
              />
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function LibraryPanel({
  preset,
  presets,
  padPresetId,
  assign,
  save,
  duplicate,
  reset,
}: {
  preset: SynthPreset;
  presets: SynthPreset[];
  padPresetId: string;
  assign: (id: string) => void;
  save: (name?: string) => void;
  duplicate: () => void;
  reset: () => void;
}) {
  const [query, setQuery] = useState('');
  const visible = presets.filter((item) =>
    `${item.name} ${item.category} ${item.tags.join(' ')}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="library-panel">
      <Panel
        title="Preset actions"
        meta={preset.factory ? 'FACTORY · TEMP EDITS' : 'CUSTOM'}
      >
        <div className="large-action-grid">
          <button onClick={() => save()}>
            <Save /> Save as new
          </button>
          <button onClick={duplicate}>
            <Copy /> Duplicate
          </button>
          <button onClick={reset}>
            <RotateCcw /> Reset
          </button>
          <button onClick={() => save(`New ${preset.engineType} sound`)}>
            <Sparkles /> New sound
          </button>
        </div>
      </Panel>
      <Panel title="Sound library" meta={`${presets.length} PRESETS`}>
        <input
          className="library-search"
          placeholder="Search sounds…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="preset-list">
          {visible.map((item) => (
            <button
              className={padPresetId === item.id ? 'active' : ''}
              aria-pressed={padPresetId === item.id}
              key={item.id}
              onClick={() => assign(item.id)}
            >
              <span>
                {item.category}
                <i>{item.engineType}</i>
              </span>
              <strong>{item.name}</strong>
              <small>{item.tags.join(' · ')}</small>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <section className="synth-panel">
      <header>
        <h2>{title}</h2>
        <span>{meta}</span>
      </header>
      <div className="synth-panel-body">{children}</div>
    </section>
  );
}
function Mini({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mini-control">
      <span>{label}</span>
      <Slider
        aria-label={label}
        aria-valuetext={String(value)}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) =>
          onChange(typeof next === 'number' ? next : next[0])
        }
      />
      <output>{Number(value).toFixed(step < 1 ? 2 : 0)}</output>
    </label>
  );
}
