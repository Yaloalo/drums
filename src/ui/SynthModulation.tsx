'use client';

import { Check, X } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import type {
  LfoShape,
  ModulationDestination,
  ModulationSource,
  SynthPreset,
  VoiceArchitecture,
} from '../model/types';
import {
  availableDestinations,
  DESTINATION_NAMES,
  MODULATION_SOURCES,
  SOURCE_NAMES,
  SOURCE_TAGS,
} from '../model/voice';
import { SearchMenu } from './SearchMenu';
import { Chips, Knob } from './SynthControls';
import type { ModuleId } from './SynthFlow';
import { EnvelopeCurve, WaveGlyph, wavePoints } from './SynthVisuals';

const SOURCE_TEXT: Record<ModulationSource, string> = {
  lfo1: 'A repeating wave, restarted on every hit.',
  lfo2: 'A second repeating wave, restarted on every hit.',
  modEnv: 'The filter envelope. Edit its shape in Filters.',
  ampEnv: 'Engine 1’s amp envelope. Edit its shape in Engine 1.',
  velocity: 'How hard the pad was hit. Soft hits pull the target down.',
  random: 'A new random offset on every hit, for natural variation.',
};

function SourceGlyph({
  source,
  voice,
}: {
  source: ModulationSource;
  voice: VoiceArchitecture;
}) {
  if (source === 'lfo1' || source === 'lfo2') {
    const lfo = voice.lfos[source === 'lfo1' ? 0 : 1];
    return (
      <svg viewBox="0 0 96 24" preserveAspectRatio="none" aria-hidden="true">
        <polyline
          points={wavePoints(
            lfo.shape,
            Math.min(6, Math.max(1, lfo.rate / 2)),
            1,
            96,
            24,
          )}
        />
      </svg>
    );
  }
  if (source === 'modEnv' || source === 'ampEnv')
    return (
      <EnvelopeCurve
        envelope={
          source === 'modEnv'
            ? voice.filterEnvelope
            : voice.engines[0].patch.ampEnvelope
        }
      />
    );
  if (source === 'velocity')
    return (
      <svg viewBox="0 0 96 24" preserveAspectRatio="none" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <line
            key={index}
            x1={8 + index * 16}
            x2={8 + index * 16}
            y1={22}
            y2={20 - index * 3.4}
          />
        ))}
      </svg>
    );
  return (
    <svg viewBox="0 0 96 24" preserveAspectRatio="none" aria-hidden="true">
      {[14, 5, 18, 9, 20, 3, 12, 16].map((height, index) => (
        <circle key={index} cx={6 + index * 12} cy={22 - height} r={1.6} />
      ))}
    </svg>
  );
}

export function ModStrip({
  preset,
  armed,
  setArmed,
  updatePreset,
  openModule,
}: {
  preset: SynthPreset;
  armed: ModulationSource | null;
  setArmed: (source: ModulationSource | null) => void;
  updatePreset: (mutator: (preset: SynthPreset) => void) => void;
  openModule: (module: ModuleId) => void;
}) {
  const { voice, modulation } = preset;
  const available = availableDestinations(voice);
  const routes = armed
    ? modulation
        .map((route, index) => ({ route, index }))
        .filter(({ route }) => route.source === armed)
    : [];
  const unused = available.filter(
    (destination) =>
      !routes.some(({ route }) => route.destination === destination) &&
      destination !== 'level',
  );
  const setLfo = (index: 0 | 1, patch: Partial<VoiceArchitecture['lfos'][0]>) =>
    updatePreset((next) => {
      Object.assign(next.voice.lfos[index], patch);
    });

  return (
    <section
      className={`mod-strip ${armed ? 'armed' : ''}`}
      aria-label="Modulation"
      data-gesture-lock
    >
      <header>
        <h2>MODULATION</h2>
        <p>
          {armed ? (
            <>
              Drag the ringed knobs to set how much <b>{SOURCE_NAMES[armed]}</b>{' '}
              moves them.
            </>
          ) : (
            'Pick a source, then drag any ringed knob.'
          )}
        </p>
        {armed && (
          <button className="mod-done" onClick={() => setArmed(null)}>
            <Check /> Done
          </button>
        )}
      </header>
      <fieldset className="mod-sources" aria-label="Modulation sources">
        {MODULATION_SOURCES.map((source) => {
          const count = modulation.filter(
            (route) => route.source === source && route.amount !== 0,
          ).length;
          return (
            <button
              key={source}
              className={armed === source ? 'active' : ''}
              aria-pressed={armed === source}
              onClick={() => setArmed(armed === source ? null : source)}
            >
              <span>
                <i className="mod-tag">{SOURCE_TAGS[source]}</i>
                <strong>{SOURCE_NAMES[source]}</strong>
                <small>
                  {count ? `${count} target${count > 1 ? 's' : ''}` : '—'}
                </small>
              </span>
              <SourceGlyph source={source} voice={voice} />
            </button>
          );
        })}
      </fieldset>

      {armed && (
        <div className="mod-panel">
          <div className="mod-settings">
            <p>{SOURCE_TEXT[armed]}</p>
            {(armed === 'lfo1' || armed === 'lfo2') && (
              <div className="lfo-settings">
                <Chips
                  ariaLabel={`${SOURCE_NAMES[armed]} shape`}
                  className="wave-chips"
                  value={voice.lfos[armed === 'lfo1' ? 0 : 1].shape}
                  options={(
                    ['sine', 'triangle', 'sawtooth', 'square'] as LfoShape[]
                  ).map((shape) => ({
                    value: shape,
                    title: shape,
                    label: <WaveGlyph shape={shape} />,
                  }))}
                  onChange={(shape) =>
                    setLfo(armed === 'lfo1' ? 0 : 1, { shape })
                  }
                />
                <Knob
                  label="RATE"
                  value={voice.lfos[armed === 'lfo1' ? 0 : 1].rate}
                  min={0.05}
                  max={40}
                  step={0.01}
                  scale="log"
                  format={(rate) =>
                    `${rate < 10 ? rate.toFixed(2) : rate.toFixed(1)} Hz`
                  }
                  onChange={(rate) =>
                    setLfo(armed === 'lfo1' ? 0 : 1, { rate })
                  }
                />
              </div>
            )}
            {(armed === 'modEnv' || armed === 'ampEnv') && (
              <button
                onClick={() =>
                  openModule(armed === 'modEnv' ? 'filters' : 'engine1')
                }
              >
                Edit the envelope in{' '}
                {armed === 'modEnv' ? 'Filters' : 'Engine 1'}
              </button>
            )}
          </div>
          <div className="mod-targets">
            <h3>{SOURCE_NAMES[armed]} moves</h3>
            {!routes.length && (
              <p className="mod-empty">
                Nothing yet. Drag a ringed knob or add a target.
              </p>
            )}
            {routes.map(({ route, index }) => (
              <div
                className={`mod-target ${available.includes(route.destination) ? '' : 'inactive'}`}
                key={`${route.destination}-${index}`}
              >
                <span>
                  {DESTINATION_NAMES[route.destination]}
                  {!available.includes(route.destination) && (
                    <small> · not in this voice</small>
                  )}
                </span>
                <Slider
                  aria-label={`${SOURCE_NAMES[armed]} to ${DESTINATION_NAMES[route.destination]}`}
                  aria-valuetext={`${Math.round(route.amount * 100)} percent`}
                  value={[route.amount]}
                  min={-1}
                  max={1}
                  step={0.01}
                  onValueChange={(value) =>
                    updatePreset((next) => {
                      next.modulation[index].amount =
                        typeof value === 'number' ? value : value[0];
                    })
                  }
                />
                <output>
                  {route.amount > 0 ? '+' : ''}
                  {Math.round(route.amount * 100)}%
                </output>
                <button
                  className="icon-button"
                  aria-label={`Remove ${DESTINATION_NAMES[route.destination]}`}
                  onClick={() =>
                    updatePreset((next) => {
                      next.modulation.splice(index, 1);
                    })
                  }
                >
                  <X />
                </button>
              </div>
            ))}
            {unused.length > 0 && (
              <SearchMenu<ModulationDestination | ''>
                ariaLabel="Add a target"
                className="mod-add"
                value=""
                emptyValue="Add a target"
                searchable={false}
                options={unused.map((destination) => ({
                  value: destination,
                  label: DESTINATION_NAMES[destination],
                }))}
                onChange={(destination) => {
                  if (!destination) return;
                  updatePreset((next) => {
                    next.modulation.push({
                      source: armed,
                      destination,
                      amount: 0.25,
                    });
                  });
                }}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
