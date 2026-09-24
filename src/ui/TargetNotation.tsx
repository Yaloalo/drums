'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The staff is a labelled musical diagram. */

import type { Exercise } from '../model/types';
import type { JudgementKind } from '../training/session';
import {
  countLabels,
  describePart,
  stepsPerBarOf,
} from '../training/exercises';
import { useApp } from '../state/AppContext';

type Head = 'drum' | 'cymbal' | 'cross';

// Conventional relative drum-set placement: low voices sit low on the staff,
// cymbals use x heads above it, and the snare occupies the middle line.
const VOICES: Record<number, { short: string; y: number; head: Head }> = {
  0: { short: 'Kick', y: 58, head: 'drum' },
  1: { short: 'Snare', y: 42, head: 'drum' },
  2: { short: 'Closed hat', y: 17, head: 'cymbal' },
  3: { short: 'Open hat', y: 17, head: 'cymbal' },
  4: { short: 'Low tom', y: 52, head: 'drum' },
  5: { short: 'High tom', y: 37, head: 'drum' },
  6: { short: 'Rim', y: 42, head: 'cross' },
  7: { short: 'Cowbell', y: 32, head: 'cross' },
  8: { short: 'Clap', y: 42, head: 'cross' },
  9: { short: 'Mallet', y: 37, head: 'drum' },
  10: { short: 'Shaker', y: 22, head: 'cymbal' },
  11: { short: 'Crash', y: 12, head: 'cymbal' },
  12: { short: 'Ride', y: 17, head: 'cymbal' },
  13: { short: 'Clave', y: 32, head: 'cross' },
  14: { short: 'Perc', y: 47, head: 'drum' },
  15: { short: 'Sub', y: 62, head: 'drum' },
};

function NoteHead({ x, y, head }: { x: number; y: number; head: Head }) {
  if (head === 'drum')
    return (
      <ellipse className="staff-notehead" cx={x} cy={y} rx="5.4" ry="3.7" />
    );
  return (
    <g className={`staff-notehead ${head}`}>
      <path d={`M${x - 4.5} ${y - 4.5}L${x + 4.5} ${y + 4.5}`} />
      <path d={`M${x + 4.5} ${y - 4.5}L${x - 4.5} ${y + 4.5}`} />
      {head === 'cross' && <circle cx={x} cy={y} r="6.5" />}
    </g>
  );
}

/** Responsive drum-set staff notation backed by the exercise's timing data. */
export function TargetNotation({
  exercise,
  marks,
  playhead,
  compact = false,
}: {
  exercise: Exercise;
  /** Judgements to show on notes, keyed `pad:step`. */
  marks?: Record<string, JudgementKind>;
  playhead?: React.Ref<HTMLSpanElement>;
  compact?: boolean;
}) {
  const { kit } = useApp();
  const stepsPerBar = stepsPerBarOf(exercise);
  const total = stepsPerBar * exercise.bars;
  const perBeat = Math.max(1, 16 / exercise.beatUnit);
  const labels = countLabels(exercise);
  const unit = compact ? 17 : 19;
  const origin = 38;
  const width = origin + total * unit + 12;
  const voice = (pad: number) =>
    VOICES[pad] ?? {
      short: kit.pads[pad]?.label ?? `Pad ${pad + 1}`,
      y: 42,
      head: 'drum' as Head,
    };

  return (
    <figure
      className={`target-notation ${compact ? 'compact' : ''}`}
      role="img"
      aria-label={exercise.parts
        .map((part) => `${voice(part.pad).short}: ${describePart(exercise, part)}`)
        .join('; ')}
    >
      <div className="staff-legend" aria-hidden="true">
        {exercise.parts.map((part) => {
          const item = voice(part.pad);
          return (
            <span key={part.pad}>
              <i className={`legend-head ${item.head}`} />
              <b>{item.short}</b>
              <kbd>{kit.pads[part.pad]?.key.toUpperCase()}</kbd>
            </span>
          );
        })}
      </div>
      <div className="staff-scroll">
        <div
          className="staff-sheet"
          style={
            {
              width,
              '--staff-travel': `${width - origin - 12}px`,
            } as React.CSSProperties
          }
        >
          <svg
            className="drum-staff"
            width={width}
            height={compact ? 88 : 98}
            viewBox={`0 0 ${width} 98`}
            aria-hidden="true"
          >
            <g className="staff-lines">
              {[22, 32, 42, 52, 62].map((y) => (
                <line key={y} x1={origin} y1={y} x2={width - 8} y2={y} />
              ))}
            </g>
            <g className="percussion-clef">
              <line x1="25" y1="29" x2="25" y2="55" />
              <line x1="30" y1="29" x2="30" y2="55" />
            </g>
            <g className="staff-grid">
              {Array.from({ length: total + 1 }, (_, step) => {
                const bar = step % stepsPerBar === 0;
                const beat = step % perBeat === 0;
                if (!bar && !beat) return null;
                const x = origin + step * unit;
                return (
                  <line
                    key={step}
                    className={bar ? 'barline' : 'beatline'}
                    x1={x}
                    y1="20"
                    x2={x}
                    y2="66"
                  />
                );
              })}
            </g>
            <g className="staff-counts">
              {Array.from({ length: total }, (_, step) => (
                <text
                  key={step}
                  className={step % perBeat === 0 ? 'beat' : ''}
                  x={origin + step * unit + unit / 2}
                  y="84"
                  textAnchor="middle"
                >
                  {labels[step % stepsPerBar]}
                </text>
              ))}
            </g>
            <g className="staff-notes">
              {exercise.parts.flatMap((part) => {
                const item = voice(part.pad);
                return part.steps.map((step, index) => {
                  const x = origin + step * unit + unit / 2;
                  const next = part.steps[index + 1] ?? step + perBeat;
                  const distance = Math.max(1, next - step);
                  const flags = distance < 2 ? 2 : distance < perBeat ? 1 : 0;
                  const mark = marks?.[`${part.pad}:${step}`] ?? '';
                  return (
                    <g
                      key={`${part.pad}:${step}`}
                      className={`staff-note ${mark}`}
                    >
                      <NoteHead x={x} y={item.y} head={item.head} />
                      <line
                        className="staff-stem"
                        x1={x + 5}
                        y1={item.y}
                        x2={x + 5}
                        y2="25"
                      />
                      {Array.from({ length: flags }, (_, flag) => (
                        <path
                          key={flag}
                          className="staff-flag"
                          d={`M${x + 5} ${25 + flag * 5}q8 3 8 10`}
                        />
                      ))}
                      {part.pad === 3 && (
                        <text
                          className="open-mark"
                          x={x}
                          y="8"
                          textAnchor="middle"
                        >
                          o
                        </text>
                      )}
                    </g>
                  );
                });
              })}
            </g>
          </svg>
          {playhead && <span className="notation-playhead" ref={playhead} />}
        </div>
      </div>
      <figcaption className="staff-caption">
        <span>Count</span>
        <b>
          {exercise.beatsPerBar}/{exercise.beatUnit}
        </b>
        <span>
          {exercise.bars} bar{exercise.bars > 1 ? 's' : ''}
        </span>
      </figcaption>
    </figure>
  );
}
