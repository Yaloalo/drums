'use client';

import { useMemo, useState } from 'react';
import { ArrowUp, Check, Clock3, Flame, Play, Target } from 'lucide-react';
import { EXERCISES, PROGRESSION } from '../training/exercises';
import type { Exercise } from '../model/types';
import { useApp } from '../state/AppContext';

export function ExercisesScreen() {
  const { setArea, startExercise, lastAttempt, attempts } = useApp();
  const categories = useMemo(
    () => Array.from(new Set(EXERCISES.map((exercise) => exercise.category))),
    [],
  );
  const [category, setCategory] = useState('Pulse');
  const [selected, setSelected] = useState<Exercise>(() => EXERCISES[0]);
  const visible = EXERCISES.filter(
    (exercise) => exercise.category === category,
  );
  const completedIds = new Set(
    attempts
      .filter((attempt) => attempt.score >= 70)
      .map((attempt) => attempt.exerciseId),
  );

  return (
    <section className="screen exercises-screen">
      <header className="screen-header training-header">
        <div className="screen-title">
          <span>RHYTHM LAB · {EXERCISES.length} SESSIONS</span>
          <h1>Practice with purpose.</h1>
        </div>
        <button
          className="back-control vertical"
          aria-label="Return to pads"
          onClick={() => setArea('pads')}
        >
          <ArrowUp />
          <span>PADS</span>
        </button>
      </header>

      {lastAttempt && (
        <aside className="score-card" data-gesture-lock>
          <div
            className="score-ring"
            style={
              {
                '--score': `${lastAttempt.score * 3.6}deg`,
              } as React.CSSProperties
            }
          >
            <strong>{lastAttempt.score}</strong>
            <span>SCORE</span>
          </div>
          <div>
            <span>LAST ATTEMPT</span>
            <h2>{lastAttempt.feedback}</h2>
            <p>
              <b>{lastAttempt.averageErrorMs} ms</b> avg error ·{' '}
              <b>{lastAttempt.consistencyMs} ms</b> consistency ·{' '}
              <b>{lastAttempt.missed}</b> missed · <b>{lastAttempt.extra}</b>{' '}
              extra
            </p>
          </div>
        </aside>
      )}

      <div className="training-layout" data-gesture-lock>
        <aside className="curriculum-rail">
          <span className="rail-label">RECOMMENDED PATH</span>
          {PROGRESSION.map((stage, index) => (
            <button
              key={stage}
              className={
                category
                  .toLowerCase()
                  .includes(stage.split('-')[0].toLowerCase())
                  ? 'active'
                  : ''
              }
              onClick={() => {
                const match = categories.find((item) =>
                  item
                    .toLowerCase()
                    .includes(stage.split('-')[0].toLowerCase()),
                );
                if (match) {
                  setCategory(match);
                  const first = EXERCISES.find(
                    (exercise) => exercise.category === match,
                  );
                  if (first) setSelected(first);
                }
              }}
            >
              <i>{index + 1}</i>
              <span>{stage}</span>
            </button>
          ))}
        </aside>

        <main className="exercise-browser">
          <div className="category-chips">
            {categories.map((item) => (
              <button
                className={category === item ? 'active' : ''}
                aria-pressed={category === item}
                key={item}
                onClick={() => {
                  setCategory(item);
                  setSelected(
                    EXERCISES.find((exercise) => exercise.category === item)!,
                  );
                }}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="exercise-list">
            {visible.map((exercise) => (
              <button
                className={`${selected.id === exercise.id ? 'active' : ''} ${completedIds.has(exercise.id) ? 'complete' : ''}`}
                aria-pressed={selected.id === exercise.id}
                key={exercise.id}
                onClick={() => setSelected(exercise)}
              >
                <span className="exercise-number">
                  {completedIds.has(exercise.id) ? (
                    <Check />
                  ) : (
                    String(exercise.progression.stage).padStart(2, '0')
                  )}
                </span>
                <div>
                  <strong>{exercise.title}</strong>
                  <small>
                    {exercise.bpm} BPM · {exercise.meter} · LEVEL{' '}
                    {exercise.difficulty}
                  </small>
                </div>
                <i>{exercise.interactionMode}</i>
              </button>
            ))}
          </div>
        </main>

        <aside className="exercise-detail">
          <span className="detail-kicker">
            {selected.category} · STAGE {selected.progression.stage}
          </span>
          <h2>{selected.title}</h2>
          <p>{selected.explanation}</p>
          <div className="exercise-facts">
            <span>
              <Clock3 />
              {selected.bpm} BPM
            </span>
            <span>
              <Target />±{selected.toleranceMs} ms
            </span>
            <span>
              <Flame />
              Level {selected.difficulty}
            </span>
          </div>
          <div className="target-notation" aria-label="Target rhythm">
            {Array.from({ length: 16 }, (_, step) => (
              <i
                className={`${selected.targetSteps.includes(step) ? 'hit' : ''} ${step % 4 === 0 ? 'beat' : ''}`}
                key={step}
              />
            ))}
          </div>
          <section className="exercise-setup">
            <h3>THIS EXERCISE WILL</h3>
            <ul>
              <li>
                Load the{' '}
                {selected.kitPresetId.replace('kit-', '').replaceAll('-', ' ')}{' '}
                kit
              </li>
              <li>Start the real Drum Machine backing loop</li>
              <li>
                Highlight pad{selected.targetPads.length > 1 ? 's' : ''}{' '}
                {selected.targetPads.map((pad) => pad + 1).join(', ')}
              </li>
              <li>Measure timing, misses and extra hits</li>
            </ul>
          </section>
          <blockquote>{selected.hints[0]}</blockquote>
          <button
            className="start-exercise"
            onClick={() => startExercise(selected)}
          >
            <Play /> START WITH {selected.countIn}-BEAT COUNT-IN
          </button>
        </aside>
      </div>
    </section>
  );
}
