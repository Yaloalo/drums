'use client';

import { Dialog } from '@base-ui/react/dialog';
import {
  ArrowRight,
  Check,
  Headphones,
  RotateCcw,
  Trophy,
  X,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { usePractice } from '../state/PracticeContext';
import { levelName, skillName } from '../training/exercises';
import { gradeFor, recommendNext } from '../training/session';
import { ColumnChart } from './PracticeCharts';

const signed = (ms: number) => `${ms > 0 ? '+' : ''}${ms} ms`;
const duration = (seconds = 0) =>
  seconds >= 60
    ? `${Math.floor(seconds / 60)} min ${seconds % 60 ? `${seconds % 60} s` : ''}`
    : `${seconds} s`;

/** Statistics for a finished session, over whichever screen is showing. */
export function PracticeResults() {
  const { results, dismissResults, start, listen, attempts, setBrowser } =
    usePractice();
  const { kit, setArea } = useApp();
  if (!results) return null;
  const { attempt, exercise, previousBest } = results;
  const stats = attempt.stats;
  const grade = attempt.grade ?? gradeFor(attempt.score);
  const personalBest = previousBest === null || attempt.score > previousBest;
  const next = recommendNext(exercise, attempts);
  const padName = (pad: number) => kit.pads[pad]?.label ?? `Pad ${pad + 1}`;
  const select = (id: string) =>
    setBrowser((current) => ({ ...current, selectedId: id }));
  const tolerance = stats?.toleranceMs ?? 45;
  const bandStart = Math.max(0, Math.floor((80 - tolerance) / 10));
  const bandEnd = Math.min(15, Math.floor((80 + tolerance - 1) / 10));
  const offsets =
    stats?.bars
      .map((bar) => bar.offsetMs)
      .filter((value): value is number => value !== null) ?? [];
  const offsetReach = Math.max(20, ...offsets.map(Math.abs));
  const tendency =
    Math.abs(attempt.biasMs) < 5
      ? 'Centred'
      : `${Math.abs(attempt.biasMs)} ms ${attempt.biasMs < 0 ? 'early' : 'late'}`;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && dismissResults()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="results-backdrop" />
        <Dialog.Popup
          className="results-panel"
          data-gesture-lock
          data-keyboard-lock
        >
          <header className="results-header">
            <div>
              <span>
                RESULTS · {skillName(exercise.skill).toUpperCase()} ·{' '}
                {levelName(exercise.difficulty).toUpperCase()}
              </span>
              <Dialog.Title className="results-title">
                {exercise.title}
              </Dialog.Title>
              <small>
                {attempt.bpm ?? exercise.bpm} BPM ·{' '}
                {duration(attempt.durationSec)}
                {attempt.options
                  ? ` · ${attempt.options.strictness} timing`
                  : ''}{' '}
                ·{' '}
                {new Date(attempt.completedAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </small>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close results">
              <X />
            </Dialog.Close>
          </header>

          <section className="results-hero">
            <div
              className={`results-grade grade-${grade.toLowerCase()}`}
              aria-label={`Grade ${grade}`}
            >
              {grade}
            </div>
            <div>
              <strong className="results-score">{attempt.score}</strong>
              <span className="results-score-label">score</span>
            </div>
            <p className={`results-best ${personalBest ? 'new' : ''}`}>
              {personalBest ? (
                <>
                  <Trophy />{' '}
                  {previousBest === null
                    ? 'First score for this exercise'
                    : `New personal best (was ${previousBest})`}
                </>
              ) : (
                `Personal best ${previousBest}`
              )}
            </p>
          </section>

          {stats && (
            <dl className="results-tiles">
              <div>
                <dt>On time</dt>
                <dd>{Math.round(stats.accuracy * 100)}%</dd>
                <small>
                  {stats.perfect + stats.good + stats.ok} of {stats.expected}{' '}
                  notes
                </small>
              </div>
              <div>
                <dt>Timing error</dt>
                <dd>{stats.meanAbsMs} ms</dd>
                <small>average distance from the note</small>
              </div>
              <div>
                <dt>Tendency</dt>
                <dd>{tendency}</dd>
                <small>
                  {Math.abs(attempt.biasMs) < 5
                    ? 'no rushing or dragging'
                    : attempt.biasMs < 0
                      ? 'rushing'
                      : 'dragging'}
                </small>
              </div>
              <div>
                <dt>Spread</dt>
                <dd>±{stats.spreadMs} ms</dd>
                <small>how even your hits are</small>
              </div>
              <div>
                <dt>Best streak</dt>
                <dd>{stats.bestStreak}</dd>
                <small>notes in a row on time</small>
              </div>
              <div>
                <dt>Missed · stray</dt>
                <dd>
                  {stats.missed + stats.early + stats.late} ·{' '}
                  {stats.extra + stats.wrongPad}
                </dd>
                <small>
                  {stats.early + stats.late
                    ? `${stats.early} too early, ${stats.late} too late`
                    : 'notes missed · hits off the part'}
                </small>
              </div>
            </dl>
          )}

          {(attempt.insights ?? [attempt.feedback]).filter(Boolean).length >
            0 && (
            <ul className="results-insights">
              {(attempt.insights ?? [attempt.feedback]).map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>
          )}

          {stats && (
            <div className="results-charts">
              <section>
                <h3>Where your hits landed</h3>
                <p>
                  Hits per 10 ms, shaded where they count as on time (±
                  {tolerance} ms).
                </p>
                <ColumnChart
                  label="Hits by timing offset"
                  columns={stats.histogram.map((bin) => ({
                    label: `${bin.from} to ${bin.to} ms${bin.from === -80 ? ' or earlier' : bin.to === 80 ? ' or later' : ''}`,
                    value: bin.count,
                    display: `${bin.count} hit${bin.count === 1 ? '' : 's'}`,
                  }))}
                  band={[bandStart, bandEnd]}
                  axis={['Early', 'On the beat', 'Late']}
                />
              </section>
              {stats.bars.length > 1 && (
                <section>
                  <h3>Score, bar by bar</h3>
                  <p>
                    {exercise.gap
                      ? 'Lighter columns are bars without the click.'
                      : 'Look for dips where the part got harder or you lost focus.'}
                  </p>
                  <ColumnChart
                    label="Score per bar"
                    max={100}
                    columns={stats.bars.map((bar) => ({
                      label: `Bar ${bar.bar + 1}${bar.silent ? ', without click' : ''}`,
                      value: bar.score,
                      display: `${bar.score}%`,
                      muted: bar.silent,
                    }))}
                    axis={['Bar 1', '', `Bar ${stats.bars.at(-1)!.bar + 1}`]}
                  />
                </section>
              )}
              {offsets.length > 1 && (
                <section>
                  <h3>Early or late, bar by bar</h3>
                  <p>
                    Average offset per bar. Above the line is late, below is
                    early.
                  </p>
                  <ColumnChart
                    label="Average timing offset per bar"
                    min={-offsetReach}
                    max={offsetReach}
                    columns={stats.bars.map((bar) => ({
                      label: `Bar ${bar.bar + 1}${bar.silent ? ', without click' : ''}`,
                      value: bar.offsetMs,
                      display:
                        bar.offsetMs === null
                          ? 'no hits'
                          : signed(bar.offsetMs),
                      muted: bar.silent,
                    }))}
                    axis={[
                      `Bar 1`,
                      `±${Math.round(offsetReach)} ms`,
                      `Bar ${stats.bars.at(-1)!.bar + 1}`,
                    ]}
                  />
                </section>
              )}
            </div>
          )}

          {stats && stats.pads.length > 1 && (
            <table className="results-table">
              <caption>By pad</caption>
              <thead>
                <tr>
                  <th scope="col">Pad</th>
                  <th scope="col">On time</th>
                  <th scope="col">Tendency</th>
                  <th scope="col">Avg error</th>
                </tr>
              </thead>
              <tbody>
                {stats.pads.map((pad) => (
                  <tr key={pad.pad}>
                    <th scope="row">{padName(pad.pad)}</th>
                    <td>
                      {pad.expected
                        ? `${Math.round((100 * pad.hit) / pad.expected)}%`
                        : '—'}
                    </td>
                    <td>
                      {pad.offsetMs === null ? '—' : signed(pad.offsetMs)}
                    </td>
                    <td>
                      {pad.meanAbsMs === null ? '—' : `${pad.meanAbsMs} ms`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {stats && stats.bars.length > 1 && (
            <details className="results-details">
              <summary>Every bar as a table</summary>
              <table className="results-table">
                <thead>
                  <tr>
                    <th scope="col">Bar</th>
                    <th scope="col">Notes</th>
                    <th scope="col">Score</th>
                    <th scope="col">Offset</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.bars.map((bar) => (
                    <tr key={bar.bar}>
                      <th scope="row">
                        {bar.bar + 1}
                        {bar.silent ? ' (no click)' : ''}
                      </th>
                      <td>{bar.expected}</td>
                      <td>{bar.score}%</td>
                      <td>
                        {bar.offsetMs === null ? '—' : signed(bar.offsetMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          <footer className="results-actions">
            <button
              className="primary"
              onClick={() => {
                dismissResults();
                start(exercise);
              }}
            >
              <RotateCcw /> Again
            </button>
            <button
              onClick={() => {
                dismissResults();
                listen(exercise);
              }}
            >
              <Headphones /> Listen
            </button>
            {next && (
              <button
                onClick={() => {
                  dismissResults();
                  select(next.id);
                  setArea('exercises');
                }}
              >
                Next: {next.title} <ArrowRight />
              </button>
            )}
            <button
              className="results-done"
              onClick={() => {
                dismissResults();
                select(exercise.id);
                setArea('exercises');
              }}
            >
              <Check /> Done
            </button>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
