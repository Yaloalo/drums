'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The notation grid is a picture of the rhythm; its accessible name spells the parts out. */

import type { Exercise } from '../model/types';
import type { JudgementKind } from '../training/session';
import {
  countLabels,
  describePart,
  stepsPerBarOf,
} from '../training/exercises';
import { useApp } from '../state/AppContext';

/** One lane per pad the player plays, on the exercise's sixteenth grid. */
export function TargetNotation({
  exercise,
  marks,
  playhead,
  compact = false,
}: {
  exercise: Exercise;
  /** Judgements to show on the notes, keyed `pad:step`. */
  marks?: Record<string, JudgementKind>;
  playhead?: React.Ref<HTMLSpanElement>;
  compact?: boolean;
}) {
  const { kit } = useApp();
  const stepsPerBar = stepsPerBarOf(exercise);
  const total = stepsPerBar * exercise.bars;
  const perBeat = Math.max(1, 16 / exercise.beatUnit);
  const labels = countLabels(exercise);
  const name = (pad: number) => kit.pads[pad]?.label ?? `PAD ${pad + 1}`;
  const cellClass = (step: number) => {
    const within = step % stepsPerBar;
    return `${within % perBeat === 0 ? 'beat' : ''} ${step > 0 && within === 0 ? 'bar' : ''}`;
  };
  return (
    <div
      className={`target-notation ${compact ? 'compact' : ''}`}
      style={{ '--steps': total } as React.CSSProperties}
      role="img"
      aria-label={exercise.parts
        .map((part) => `${name(part.pad)}: ${describePart(exercise, part)}`)
        .join('; ')}
    >
      <div className="notation-row notation-count" aria-hidden="true">
        <span className="notation-pad" />
        {Array.from({ length: total }, (_, step) => (
          <i key={step} className={cellClass(step)}>
            {labels[step % stepsPerBar]}
          </i>
        ))}
      </div>
      {exercise.parts.map((part) => {
        const notes = new Set(part.steps);
        return (
          <div className="notation-row" key={part.pad} aria-hidden="true">
            <span className="notation-pad">
              {name(part.pad)}
              <kbd>{kit.pads[part.pad]?.key.toUpperCase()}</kbd>
            </span>
            {Array.from({ length: total }, (_, step) => (
              <i
                key={step}
                className={`${cellClass(step)} ${notes.has(step) ? 'note' : ''} ${
                  notes.has(step) ? (marks?.[`${part.pad}:${step}`] ?? '') : ''
                }`}
              />
            ))}
          </div>
        );
      })}
      {playhead && <span className="notation-playhead" ref={playhead} />}
    </div>
  );
}
