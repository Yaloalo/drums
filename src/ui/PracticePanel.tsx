'use client';

import { useEffect, useRef } from 'react';
import { Headphones, Play, Square, X } from 'lucide-react';
import { audioEngine } from '../audio/AudioEngine';
import { useApp } from '../state/AppContext';
import { usePractice } from '../state/PracticeContext';
import { describePart, skillName } from '../training/exercises';
import { TOLERANCE_MS } from '../training/session';
import { TargetNotation } from './TargetNotation';

const JUDGEMENT_TEXT = {
  perfect: 'Perfect',
  good: 'Good',
  ok: 'OK',
  early: 'Too early',
  late: 'Too late',
  miss: 'Missed',
  extra: 'Extra hit',
  wrong: 'Wrong pad',
};

const clockText = (seconds: number) => {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/** The running session, shown above the pads. */
export function PracticePanel() {
  const { session, live, finish, cancel, start, listen } = usePractice();
  const { kit } = useApp();
  const clock = useRef<HTMLOutputElement>(null);
  const progress = useRef<HTMLSpanElement>(null);
  const head = useRef<HTMLSpanElement>(null);
  const countIn = useRef<HTMLDivElement>(null);

  // Clock, count-in and playhead follow the audio clock, outside React renders.
  useEffect(() => {
    if (!session) return;
    let frame = 0;
    const beat = session.stepDuration * (16 / session.exercise.beatUnit);
    const phrase = session.stepDuration * session.phraseSteps;
    const tick = () => {
      const now = audioEngine.audibleTime();
      const played = now - session.start;
      if (countIn.current) {
        const waiting = played < 0;
        countIn.current.hidden = !waiting;
        if (waiting)
          countIn.current.textContent = String(Math.ceil(-played / beat));
      }
      if (clock.current)
        clock.current.textContent = Number.isFinite(session.end)
          ? clockText(session.end - Math.max(now, session.start))
          : clockText(Math.max(0, played));
      if (progress.current && Number.isFinite(session.end))
        progress.current.style.width = `${Math.max(0, Math.min(1, played / (session.end - session.start))) * 100}%`;
      if (head.current) {
        head.current.style.setProperty(
          '--progress',
          String(played < 0 ? 0 : (played / phrase) % 1),
        );
        head.current.style.opacity = played < 0 ? '0' : '1';
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [session]);

  if (!session) return null;
  const { exercise, options, mode } = session;
  const tolerance = TOLERANCE_MS[options.strictness];
  const reach = tolerance * 1.8;
  const due = live.hit + live.missed;
  const last = live.last;
  const parts = exercise.parts.map((part) => ({
    pad: kit.pads[part.pad]?.label ?? `PAD ${part.pad + 1}`,
    key: kit.pads[part.pad]?.key.toUpperCase(),
    where: describePart(exercise, part),
  }));

  return (
    <section
      className={`practice-panel ${mode}`}
      aria-label={`${mode === 'listen' ? 'Listening to' : 'Practising'} ${exercise.title}`}
      data-gesture-lock
    >
      <header>
        <div className="practice-title">
          <span>
            {mode === 'listen' ? 'LISTEN' : 'PRACTICE'} ·{' '}
            {skillName(exercise.skill).toUpperCase()} · {options.bpm} BPM
          </span>
          <strong>{exercise.title}</strong>
        </div>
        <div className="practice-clock">
          <output
            ref={clock}
            aria-label={
              Number.isFinite(session.end) ? 'Time left' : 'Time played'
            }
          >
            0:00
          </output>
          {Number.isFinite(session.end) && (
            <span className="practice-progress" aria-hidden="true">
              <i ref={progress} />
            </span>
          )}
        </div>
        <div className="practice-actions">
          {mode === 'listen' ? (
            <>
              <button className="primary" onClick={() => start(exercise)}>
                <Play /> Practice
              </button>
              <button onClick={cancel}>
                <Square /> Stop
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => listen(exercise)}
                title="Hear the part played for you (this run is not scored)"
              >
                <Headphones /> <span>Listen</span>
              </button>
              <button className="primary" onClick={finish}>
                <Square /> End
              </button>
              <button
                className="icon-button"
                onClick={cancel}
                aria-label="Cancel without scoring"
              >
                <X />
              </button>
            </>
          )}
        </div>
      </header>

      <ul className="practice-instructions">
        {parts.map((part) => (
          <li key={part.pad}>
            <b>
              {part.pad} <kbd>{part.key}</kbd>
            </b>{' '}
            {part.where}
          </li>
        ))}
        {mode === 'listen' && (
          <li className="note">
            Listen and watch the pads — nothing is scored.
          </li>
        )}
        {exercise.gap && (
          <li className="note">
            The click drops out for {exercise.gap.silent} bar
            {exercise.gap.silent > 1 ? 's' : ''} after every {exercise.gap.play}
            . Keep going.
          </li>
        )}
      </ul>

      <div className="practice-notation">
        <TargetNotation
          exercise={exercise}
          marks={mode === 'practice' ? live.marks : undefined}
          playhead={head}
        />
        <div
          className="practice-countin"
          ref={countIn}
          hidden
          aria-live="assertive"
        />
      </div>

      {mode === 'practice' && (
        <div className="practice-live">
          <div
            className={`practice-judgement ${last?.kind ?? ''}`}
            key={`${due}-${live.stray}`}
            aria-live="polite"
          >
            <strong>{last ? JUDGEMENT_TEXT[last.kind] : 'Ready'}</strong>
            <small>
              {last?.offsetMs != null
                ? `${last.offsetMs > 0 ? '+' : ''}${Math.round(last.offsetMs)} ms`
                : last
                  ? '—'
                  : 'Starts after the count-in'}
            </small>
          </div>
          <div className="timing-meter" aria-hidden="true">
            <span
              className="timing-zone"
              style={{
                left: `${50 - (tolerance / reach) * 50}%`,
                right: `${50 - (tolerance / reach) * 50}%`,
              }}
            />
            <span className="timing-center" />
            {live.offsets.map((offset, index) => (
              <i
                key={index}
                style={{
                  left: `${50 + (Math.max(-reach, Math.min(reach, offset)) / reach) * 50}%`,
                  opacity: (index + 1) / live.offsets.length,
                }}
                className={index === live.offsets.length - 1 ? 'latest' : ''}
              />
            ))}
            <small className="early">Early</small>
            <small className="late">Late</small>
          </div>
          <dl className="practice-stats">
            <div>
              <dt>On time</dt>
              <dd>{due ? `${Math.round((100 * live.hit) / due)}%` : '—'}</dd>
            </div>
            <div>
              <dt>Streak</dt>
              <dd>{live.streak}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>
                {live.hit}/{due}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
