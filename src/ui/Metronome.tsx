'use client';

import { Popover } from '@base-ui/react/popover';
import {
  ChevronDown,
  Metronome as MetronomeIcon,
  Minus,
  Plus,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { ClickLevel } from '../model/types';
import { useApp } from '../state/AppContext';
import { clickLevelsFor, nextClickLevel } from '../transport/MetronomeClock';

const UNITS = [2, 4, 8, 16] as const;
const COMMON_METERS: [number, number][] = [
  [2, 4],
  [3, 4],
  [4, 4],
  [5, 4],
  [6, 8],
  [7, 8],
  [9, 8],
  [12, 8],
];
const LEVEL_NAMES: Record<ClickLevel, string> = {
  accent: 'accent',
  normal: 'click',
  off: 'silent',
};

/** Metronome toggle with live beat lights, and its meter/beat settings. */
export function MetronomeControl() {
  const { transport, updateTransport, pattern, setMeter } = useApp();
  const beats = pattern.beatsPerBar;
  const unit = pattern.beatUnit;
  const levels = clickLevelsFor(transport.clickLevels, beats);
  const current = transport.metronome ? (transport.metronomeBeat ?? -1) : -1;
  const setLevels = (next: ClickLevel[]) => {
    // Keep choices for beats beyond this meter, so 4/4 → 3/4 → 4/4 restores them.
    const stored = clickLevelsFor(
      transport.clickLevels,
      Math.max(beats, transport.clickLevels.length),
    );
    next.forEach((level, index) => {
      stored[index] = level;
    });
    updateTransport({ clickLevels: stored });
  };
  const presets: [string, (beat: number) => ClickLevel][] = [
    ['Every beat', (beat) => (beat === 0 ? 'accent' : 'normal')],
    ['Beat 1 only', (beat) => (beat === 0 ? 'accent' : 'off')],
    ['Backbeat', (beat) => (beat % 2 ? 'accent' : 'off')],
  ];

  return (
    <div className="metronome-control">
      <button
        className={`metronome-toggle ${transport.metronome ? 'enabled' : ''}`}
        aria-pressed={transport.metronome}
        aria-label="Metronome"
        title="Metronome"
        onClick={() => updateTransport({ metronome: !transport.metronome })}
      >
        <MetronomeIcon />
        {beats <= 8 ? (
          <span className="metronome-dots" aria-hidden="true">
            {levels.map((level, beat) => (
              <i
                key={beat}
                className={`${level} ${current === beat ? 'lit' : ''}`}
              />
            ))}
          </span>
        ) : (
          <output className="metronome-count" aria-hidden="true">
            {current >= 0 ? current + 1 : '–'}
          </output>
        )}
      </button>
      <Popover.Root>
        <Popover.Trigger
          className="metronome-meter-button"
          aria-label={`Metronome settings, ${beats}/${unit}`}
        >
          {beats}/{unit}
          <ChevronDown aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            side="bottom"
            align="end"
            sideOffset={6}
            collisionPadding={12}
            className="search-menu-positioner"
          >
            <Popover.Popup
              className="metronome-panel"
              data-gesture-lock
              data-keyboard-lock
            >
              <header>
                <div>
                  <Popover.Title className="metronome-panel-title">
                    Metronome
                  </Popover.Title>
                  <strong>
                    {beats}/{unit} · {transport.bpm} BPM
                  </strong>
                </div>
                <Switch
                  aria-label="Metronome on"
                  checked={transport.metronome}
                  onCheckedChange={(metronome) =>
                    updateTransport({ metronome })
                  }
                />
              </header>

              <section aria-label="Time signature">
                <h3>Time signature</h3>
                <div className="meter-editor">
                  <div className="meter-stepper">
                    <button
                      aria-label="Fewer beats per bar"
                      disabled={beats <= 1}
                      onClick={() => setMeter(beats - 1, unit)}
                    >
                      <Minus />
                    </button>
                    <output aria-label="Beats per bar">{beats}</output>
                    <button
                      aria-label="More beats per bar"
                      disabled={beats >= 16}
                      onClick={() => setMeter(beats + 1, unit)}
                    >
                      <Plus />
                    </button>
                  </div>
                  <span className="meter-slash" aria-hidden="true">
                    /
                  </span>
                  <fieldset className="meter-units" aria-label="Beat unit">
                    {UNITS.map((value) => (
                      <button
                        key={value}
                        aria-pressed={unit === value}
                        className={unit === value ? 'active' : ''}
                        onClick={() => setMeter(beats, value)}
                      >
                        {value}
                      </button>
                    ))}
                  </fieldset>
                </div>
                <fieldset className="meter-presets" aria-label="Common meters">
                  {COMMON_METERS.map(([b, u]) => (
                    <button
                      key={`${b}/${u}`}
                      aria-pressed={beats === b && unit === u}
                      className={beats === b && unit === u ? 'active' : ''}
                      onClick={() => setMeter(b, u)}
                    >
                      {b}/{u}
                    </button>
                  ))}
                </fieldset>
              </section>

              <section aria-label="Beats">
                <h3>
                  Beats <small>Tap: accent → click → silent</small>
                </h3>
                <div
                  className="click-beats"
                  style={
                    { '--beats': Math.min(beats, 8) } as React.CSSProperties
                  }
                >
                  {levels.map((level, beat) => (
                    <button
                      key={beat}
                      className={`click-beat ${level} ${current === beat ? 'lit' : ''}`}
                      aria-label={`Beat ${beat + 1}: ${LEVEL_NAMES[level]}`}
                      onClick={() => {
                        const next = [...levels];
                        next[beat] = nextClickLevel(level);
                        setLevels(next);
                      }}
                    >
                      <i aria-hidden="true" />
                      <span>{beat + 1}</span>
                    </button>
                  ))}
                </div>
                <div className="click-presets">
                  {presets.map(([name, levelFor]) => {
                    const next = levels.map((_, beat) => levelFor(beat));
                    const active = next.every(
                      (level, beat) => level === levels[beat],
                    );
                    return (
                      <button
                        key={name}
                        aria-pressed={active}
                        className={active ? 'active' : ''}
                        onClick={() => setLevels(next)}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </section>
              <p className="metronome-note">
                The time signature also sets the drum pattern’s bar length.
              </p>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
