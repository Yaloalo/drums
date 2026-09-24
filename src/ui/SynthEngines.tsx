'use client';

import { Fragment } from 'react';
import { Plus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type {
  AdditivePatch,
  EngineSlot,
  Envelope,
  FMPatch,
  LfoShape,
  SubtractivePatch,
  SynthEngineType,
  SynthPatch,
  SynthPreset,
  VoiceArchitecture,
} from '../model/types';
import { ENGINE_DETAILS, ENGINE_NAMES } from '../model/voice';
import {
  Chips,
  hz,
  Knob,
  Mini,
  Panel,
  percent,
  seconds,
} from './SynthControls';
import {
  EnvelopeCurve,
  FMGraph,
  PitchSweepCurve,
  WaveGlyph,
  wavePoints,
} from './SynthVisuals';

type UpdateVoice = (mutator: (voice: VoiceArchitecture) => void) => void;

const ENGINE_LEDES: Record<SynthEngineType, string> = {
  subtractive:
    'Oscillators and noise: the classic drum-machine source. Shape the tone afterwards with the filters.',
  fm: 'Four sine operators modulate each other’s pitch for bells, metal and hard clicks.',
  additive:
    'Individually tuned sine partials: build mallets, bowls and tonal percussion from harmonics.',
};

export function EngineEditor({
  preset,
  slotIndex,
  updateVoice,
  switchEngine,
}: {
  preset: SynthPreset;
  slotIndex: 0 | 1;
  updateVoice: UpdateVoice;
  switchEngine: (slot: 0 | 1, engine: SynthEngineType) => void;
}) {
  const slot = preset.voice.engines[slotIndex];
  const number = slotIndex + 1;
  const update = (mutator: (slot: EngineSlot) => void) =>
    updateVoice((voice) => mutator(voice.engines[slotIndex]));
  const updatePatch = (mutator: (patch: SynthPatch) => void) =>
    update((next) => mutator(next.patch));
  const pitch = slotIndex ? 'pitch2' : 'pitch1';

  if (!slot.enabled)
    return (
      <div className="module-editor engine-off">
        <header className="module-header">
          <div>
            <span>ENGINE 2</span>
            <h2>Add a second engine</h2>
          </div>
        </header>
        <p className="module-lede">
          Engine 2 runs beside Engine 1. Choose how they meet in Combine:
        </p>
        <ul className="combine-summary">
          <li>
            <b>+</b> <strong>Layer</strong> both play: a body plus a noise snap,
            a kick plus a click.
          </li>
          <li>
            <b>FM</b> <strong>FM</strong> Engine 2 bends Engine 1’s pitch at
            audio rate: bells, metal, growl.
          </li>
          <li>
            <b>×</b> <strong>Ring</strong> the two are multiplied: clangy sum
            and difference tones.
          </li>
        </ul>
        <button
          className="primary"
          onClick={() =>
            update((next) => {
              next.enabled = true;
            })
          }
        >
          <Plus /> Turn on Engine 2
        </button>
      </div>
    );

  return (
    <div className="module-editor engine-editor">
      <header className="module-header">
        <div>
          <span>ENGINE {number}</span>
          <h2>{ENGINE_NAMES[slot.patch.engine]}</h2>
        </div>
        <Chips
          ariaLabel={`Engine ${number} type`}
          className="engine-types"
          value={slot.patch.engine}
          options={(['subtractive', 'fm', 'additive'] as const).map(
            (engine) => ({
              value: engine,
              label: (
                <>
                  <strong>{ENGINE_NAMES[engine]}</strong>
                  <small>{ENGINE_DETAILS[engine]}</small>
                </>
              ),
            }),
          )}
          onChange={(engine) => switchEngine(slotIndex, engine)}
        />
        {slotIndex === 1 && (
          <div className="engine-power">
            On
            <Switch
              aria-label="Engine 2 on"
              checked={slot.enabled}
              onCheckedChange={(enabled) =>
                update((next) => {
                  next.enabled = enabled;
                })
              }
            />
          </div>
        )}
      </header>
      <p className="module-lede">
        {ENGINE_LEDES[slot.patch.engine]} Switching type keeps your edits for
        each type.
      </p>

      <div className="module-grid">
        <Panel
          title="Output"
          meta="LEVEL · PITCH · FILTER SEND"
          className="span-all"
        >
          <div className="knob-row">
            <Knob
              label="LEVEL"
              value={slot.level}
              min={0}
              max={1}
              format={percent}
              mod={slotIndex ? 'engine2' : 'engine1'}
              onChange={(level) =>
                update((next) => {
                  next.level = level;
                })
              }
            />
            <Knob
              label="PITCH"
              value={slot.patch.baseFrequency}
              min={20}
              max={9000}
              step={1}
              scale="log"
              format={(value) => `${hz(value)} Hz`}
              mod={pitch}
              onChange={(value) =>
                updatePatch((next) => {
                  next.baseFrequency = value;
                })
              }
            />
            <Knob
              label="TO FILTER"
              value={slot.filterMix}
              min={0}
              max={1}
              format={(mix) =>
                mix <= 0.005
                  ? 'F1'
                  : mix >= 0.995
                    ? 'F2'
                    : `F1 ${Math.round((1 - mix) * 100)} · F2 ${Math.round(mix * 100)}`
              }
              bipolar
              onChange={(mix) =>
                update((next) => {
                  next.filterMix = mix;
                })
              }
            />
          </div>
        </Panel>
        {slot.patch.engine === 'subtractive' && (
          <AnalogSource patch={slot.patch} update={updatePatch} />
        )}
        {slot.patch.engine === 'fm' && (
          <FMSource patch={slot.patch} update={updatePatch} />
        )}
        {slot.patch.engine === 'additive' && (
          <HarmonicSource patch={slot.patch} update={updatePatch} />
        )}
        <EnvelopePanel
          title="Amp envelope"
          meta={`ENGINE ${number} · ADSR`}
          envelope={slot.patch.ampEnvelope}
          onChange={(envelope) =>
            updatePatch((next) => {
              next.ampEnvelope = envelope;
            })
          }
        />
        <Panel title="Pitch sweep" meta="DROP INTO THE PITCH">
          <div className="curve-viz">
            <PitchSweepCurve sweep={slot.patch.pitchEnvelope} />
          </div>
          <div className="knob-row">
            <Knob
              label="AMOUNT"
              value={slot.patch.pitchEnvelope.amount}
              min={-48}
              max={96}
              step={1}
              unit=" st"
              onChange={(amount) =>
                updatePatch((next) => {
                  next.pitchEnvelope.amount = amount;
                })
              }
            />
            <Knob
              label="TIME"
              value={slot.patch.pitchEnvelope.decay}
              min={0.005}
              max={1.5}
              step={0.001}
              scale="log"
              format={seconds}
              onChange={(decay) =>
                updatePatch((next) => {
                  next.pitchEnvelope.decay = decay;
                })
              }
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function EnvelopePanel({
  title,
  meta,
  envelope,
  onChange,
}: {
  title: string;
  meta: string;
  envelope: Envelope;
  onChange: (envelope: Envelope) => void;
}) {
  const set = (key: keyof Envelope, value: number) =>
    onChange({ ...envelope, [key]: value });
  return (
    <Panel title={title} meta={meta}>
      <div className="curve-viz">
        <EnvelopeCurve envelope={envelope} />
      </div>
      <div className="knob-row">
        <Knob
          label="ATTACK"
          value={envelope.attack}
          min={0.001}
          max={2}
          step={0.001}
          scale="log"
          format={seconds}
          onChange={(value) => set('attack', value)}
        />
        <Knob
          label="DECAY"
          value={envelope.decay}
          min={0.005}
          max={4}
          step={0.001}
          scale="log"
          format={seconds}
          onChange={(value) => set('decay', value)}
        />
        <Knob
          label="SUSTAIN"
          value={envelope.sustain}
          min={0}
          max={1}
          format={percent}
          onChange={(value) => set('sustain', value)}
        />
        <Knob
          label="RELEASE"
          value={envelope.release}
          min={0.005}
          max={3}
          step={0.001}
          scale="log"
          format={seconds}
          onChange={(value) => set('release', value)}
        />
      </div>
    </Panel>
  );
}

const WAVES: LfoShape[] = ['sine', 'triangle', 'sawtooth', 'square'];

function AnalogSource({
  patch,
  update,
}: {
  patch: SubtractivePatch;
  update: (mutator: (patch: SynthPatch) => void) => void;
}) {
  const analog = (mutator: (patch: SubtractivePatch) => void) =>
    update((next) => {
      if (next.engine === 'subtractive') mutator(next);
    });
  return (
    <Panel
      title="Oscillators + noise"
      meta={`${patch.oscillators.length} OSC + NOISE`}
      className="span-all"
    >
      {patch.oscillators.map((oscillator, index) => (
        <div className="source-row" key={index}>
          <span className="operator-id">OSC {index + 1}</span>
          <svg className="source-wave" viewBox="0 0 96 28" aria-hidden="true">
            <polyline
              points={wavePoints(
                oscillator.waveform === 'custom' ? 'sine' : oscillator.waveform,
                2,
                Math.max(0.08, oscillator.level),
                96,
                28,
              )}
            />
          </svg>
          <Chips
            ariaLabel={`Oscillator ${index + 1} waveform`}
            className="wave-chips"
            value={oscillator.waveform}
            options={WAVES.map((wave) => ({
              value: wave,
              title: wave,
              label: <WaveGlyph shape={wave} />,
            }))}
            onChange={(waveform) =>
              analog((next) => {
                next.oscillators[index].waveform = waveform;
              })
            }
          />
          <Mini
            label="OCT"
            value={oscillator.octave}
            min={-2}
            max={2}
            step={1}
            onChange={(value) =>
              analog((next) => {
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
              analog((next) => {
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
              analog((next) => {
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
            format={percent}
            onChange={(value) =>
              analog((next) => {
                next.oscillators[index].level = value;
              })
            }
          />
        </div>
      ))}
      <div className="source-row noise-row">
        <span className="operator-id">NOISE</span>
        <Chips
          ariaLabel="Noise colour"
          value={patch.noise.type}
          options={(['white', 'pink', 'metal'] as const).map((type) => ({
            value: type,
            label: type,
          }))}
          onChange={(type) =>
            analog((next) => {
              next.noise.type = type;
            })
          }
        />
        <Mini
          label="LEVEL"
          value={patch.noise.level}
          min={0}
          max={1}
          step={0.01}
          format={percent}
          onChange={(value) =>
            analog((next) => {
              next.noise.level = value;
            })
          }
        />
      </div>
    </Panel>
  );
}

function FMSource({
  patch,
  update,
}: {
  patch: FMPatch;
  update: (mutator: (patch: SynthPatch) => void) => void;
}) {
  const fm = (mutator: (patch: FMPatch) => void) =>
    update((next) => {
      if (next.engine === 'fm') mutator(next);
    });
  return (
    <>
      <Panel
        title="Algorithm"
        meta={`ALG ${patch.algorithm} · WHO MODULATES WHOM`}
        className="span-all"
      >
        <div className="fm-overview">
          <div className="fm-diagram">
            <FMGraph algorithm={patch.algorithm} />
            <p>
              Arrows show which operator bends which. Highlighted carriers are
              what you hear; the others only shape the tone.
            </p>
          </div>
          <div className="algorithm-picker">
            {([1, 2, 3, 4, 5, 6] as const).map((algorithm) => (
              <button
                key={algorithm}
                className={patch.algorithm === algorithm ? 'active' : ''}
                aria-pressed={patch.algorithm === algorithm}
                onClick={() =>
                  fm((next) => {
                    next.algorithm = algorithm;
                  })
                }
              >
                <FMGraph algorithm={algorithm} />
                ALG {algorithm}
              </button>
            ))}
          </div>
        </div>
      </Panel>
      <Panel
        title="Operators"
        meta="RATIO · LEVEL · DECAY"
        className="span-all"
      >
        {patch.operators.map((operator, index) => (
          <Fragment key={index}>
            <div className="source-row fm-op">
              <span className="operator-id">OP {index + 1}</span>
              <Mini
                label="RATIO"
                value={operator.ratio}
                min={0.1}
                max={12}
                step={0.01}
                onChange={(value) =>
                  fm((next) => {
                    next.operators[index].ratio = value;
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
                  fm((next) => {
                    next.operators[index].level = value;
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
                  fm((next) => {
                    next.operators[index].fine = value;
                  })
                }
              />
              <Mini
                label="DECAY"
                value={operator.envelope.decay}
                min={0.02}
                max={3}
                step={0.01}
                format={seconds}
                onChange={(value) =>
                  fm((next) => {
                    next.operators[index].envelope.decay = value;
                  })
                }
              />
              <Mini
                label="FEEDBACK"
                value={operator.feedback}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) =>
                  fm((next) => {
                    next.operators[index].feedback = value;
                  })
                }
              />
            </div>
            <details className="operator-detail">
              <summary>Operator {index + 1} · octave and full envelope</summary>
              <Mini
                label="COARSE (OCT)"
                value={operator.coarse}
                min={-3}
                max={3}
                step={1}
                onChange={(value) =>
                  fm((next) => {
                    next.operators[index].coarse = value;
                  })
                }
              />
              <EnvelopePanel
                title={`Operator ${index + 1} envelope`}
                meta="ADSR"
                envelope={operator.envelope}
                onChange={(envelope) =>
                  fm((next) => {
                    next.operators[index].envelope = envelope;
                  })
                }
              />
            </details>
          </Fragment>
        ))}
      </Panel>
    </>
  );
}

function HarmonicSource({
  patch,
  update,
}: {
  patch: AdditivePatch;
  update: (mutator: (patch: SynthPatch) => void) => void;
}) {
  const harmonic = (mutator: (patch: AdditivePatch) => void) =>
    update((next) => {
      if (next.engine === 'additive') mutator(next);
    });
  return (
    <>
      <Panel
        title="Spectrum"
        meta={`${patch.partials.length} PARTIALS`}
        className="span-all"
      >
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
                  harmonic((next) => {
                    next.partials[index].amplitude = Number(event.target.value);
                  })
                }
              />
              <i style={{ height: `${partial.amplitude * 75}%` }} />
              <small>{index + 1}</small>
            </label>
          ))}
        </div>
        <p className="panel-note">
          Drag a bar to set a partial’s level. Ratios set its pitch; tilt and
          inharmonicity reshape the whole spectrum.
        </p>
        <div className="knob-row">
          <Knob
            label="TILT"
            value={patch.spectralTilt}
            min={0}
            max={1}
            format={percent}
            mod="spectralTilt"
            onChange={(value) =>
              harmonic((next) => {
                next.spectralTilt = value;
              })
            }
          />
          <Knob
            label="INHARM"
            value={patch.inharmonicity}
            min={0}
            max={0.25}
            step={0.001}
            format={(value) => value.toFixed(3)}
            onChange={(value) =>
              harmonic((next) => {
                next.inharmonicity = value;
              })
            }
          />
          <Knob
            label="SPREAD"
            value={patch.spread}
            min={0}
            max={1}
            format={percent}
            onChange={(value) =>
              harmonic((next) => {
                next.spread = value;
              })
            }
          />
        </div>
      </Panel>
      <Panel title="Partials" meta="RATIO · LEVEL · DECAY" className="span-all">
        {patch.partials.map((partial, index) => (
          <div className="source-row partial-row" key={index}>
            <span className="operator-id">P{index + 1}</span>
            <Mini
              label="RATIO"
              value={partial.ratio}
              min={0.1}
              max={16}
              step={0.01}
              onChange={(value) =>
                harmonic((next) => {
                  next.partials[index].ratio = value;
                })
              }
            />
            <Mini
              label="LEVEL"
              value={partial.amplitude}
              min={0}
              max={1}
              step={0.01}
              format={percent}
              onChange={(value) =>
                harmonic((next) => {
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
              format={seconds}
              onChange={(value) =>
                harmonic((next) => {
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
                harmonic((next) => {
                  next.partials[index].detune = value;
                })
              }
            />
          </div>
        ))}
      </Panel>
    </>
  );
}
