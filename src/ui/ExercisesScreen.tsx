'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Difficulty is a five-bar inline graphic with an explicit accessible label. */

import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import {
  ArrowLeft,
  Headphones,
  ListFilter,
  Play,
  Search,
  Square,
  Star,
  X,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type {
  Exercise,
  ExerciseAttempt,
  PracticeOptions,
} from '../model/types';
import { RHYTHM_PRESETS } from '../presets/rhythms';
import { useApp } from '../state/AppContext';
import {
  usePractice,
  type BrowserState,
  type Facet,
} from '../state/PracticeContext';
import {
  compatibleBackings,
  describePart,
  EXERCISES,
  exerciseById,
  LEVELS,
  levelName,
  meterOf,
  SKILLS,
  skillName,
  STYLES,
  styleName,
} from '../training/exercises';
import {
  attemptsFor,
  bestScore,
  MASTERED_SCORE,
  practiceSummary,
  TOLERANCE_MS,
} from '../training/session';
import { ColumnChart } from './PracticeCharts';
import { PracticeCalibration } from './PracticeCalibration';
import { SearchMenu } from './SearchMenu';
import { Chips } from './SynthControls';
import { TargetNotation } from './TargetNotation';

const METERS = ['4/4', '3/4', '6/8', '12/8', '5/4', '7/8'];
const SKILL_ORDER = new Map(SKILLS.map((skill, index) => [skill.id, index]));

interface FacetConfig {
  id: Facet;
  name: string;
  options: { value: string; label: string }[];
  values: (exercise: Exercise) => string[];
}

function statusOf(exercise: Exercise, attempts: ExerciseAttempt[]) {
  const best = bestScore(exercise.id, attempts);
  return best === null
    ? 'new'
    : best >= MASTERED_SCORE
      ? 'mastered'
      : 'practiced';
}

function facetsFor(
  attempts: ExerciseAttempt[],
  favorites: string[],
): FacetConfig[] {
  return [
    {
      id: 'skill',
      name: 'Focus',
      options: SKILLS.map((skill) => ({ value: skill.id, label: skill.name })),
      values: (exercise) => [exercise.skill],
    },
    {
      id: 'level',
      name: 'Level',
      options: LEVELS.map((name, index) => ({
        value: String(index + 1),
        label: `${index + 1} · ${name}`,
      })),
      values: (exercise) => [String(exercise.difficulty)],
    },
    {
      id: 'meter',
      name: 'Meter',
      options: METERS.map((meter) => ({ value: meter, label: meter })),
      values: (exercise) => [meterOf(exercise)],
    },
    {
      id: 'pads',
      name: 'Pads at once',
      options: [
        { value: '1', label: 'One' },
        { value: '2', label: 'Two' },
        { value: '3', label: 'Three or more' },
      ],
      values: (exercise) => [String(Math.min(3, exercise.parts.length))],
    },
    {
      id: 'style',
      name: 'Style',
      options: STYLES.map((style) => ({ value: style.id, label: style.name })),
      values: (exercise) => [exercise.style],
    },
    {
      id: 'backing',
      name: 'Plays with',
      options: [
        { value: 'groove', label: 'A drum groove' },
        { value: 'click', label: 'The click only' },
      ],
      values: (exercise) => [exercise.backing ? 'groove' : 'click'],
    },
    {
      id: 'status',
      name: 'Progress',
      options: [
        { value: 'new', label: 'Not tried' },
        { value: 'practiced', label: 'In progress' },
        { value: 'mastered', label: 'Mastered' },
        { value: 'favorite', label: 'Favourites' },
      ],
      values: (exercise) => [
        statusOf(exercise, attempts),
        ...(favorites.includes(exercise.id) ? ['favorite'] : []),
      ],
    },
  ];
}

function matchesQuery(exercise: Exercise, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text =
    `${exercise.title} ${exercise.summary} ${skillName(exercise.skill)} ${styleName(exercise.style)} ${meterOf(exercise)} ${levelName(exercise.difficulty)}`.toLowerCase();
  return words.every((word) => text.includes(word));
}

function filterExercises(
  browser: BrowserState,
  facets: FacetConfig[],
  except?: Facet,
) {
  return EXERCISES.filter(
    (exercise) =>
      matchesQuery(exercise, browser.query) &&
      facets.every((facet) => {
        const selected = browser.filters[facet.id];
        if (facet.id === except || !selected?.length) return true;
        return facet.values(exercise).some((value) => selected.includes(value));
      }),
  );
}

const SORTS: { value: BrowserState['sort']; label: string }[] = [
  { value: 'recommended', label: 'Recommended order' },
  { value: 'easiest', label: 'Easiest first' },
  { value: 'hardest', label: 'Hardest first' },
  { value: 'best', label: 'Best score' },
  { value: 'recent', label: 'Recently practised' },
  { value: 'name', label: 'Name' },
];

function sortExercises(
  list: Exercise[],
  sort: BrowserState['sort'],
  attempts: ExerciseAttempt[],
) {
  const skill = (exercise: Exercise) => SKILL_ORDER.get(exercise.skill) ?? 0;
  const last = (exercise: Exercise) =>
    attempts.reduce(
      (latest, attempt) =>
        attempt.exerciseId === exercise.id
          ? Math.max(latest, attempt.completedAt)
          : latest,
      0,
    );
  const compare: Record<
    BrowserState['sort'],
    (a: Exercise, b: Exercise) => number
  > = {
    recommended: (a, b) => skill(a) - skill(b) || a.difficulty - b.difficulty,
    easiest: (a, b) => a.difficulty - b.difficulty || skill(a) - skill(b),
    hardest: (a, b) => b.difficulty - a.difficulty || skill(a) - skill(b),
    best: (a, b) =>
      (bestScore(b.id, attempts) ?? -1) - (bestScore(a.id, attempts) ?? -1),
    recent: (a, b) => last(b) - last(a),
    name: (a, b) => a.title.localeCompare(b.title),
  };
  return [...list].sort(compare[sort]);
}

function LevelBars({ level }: { level: number }) {
  return (
    <span
      className="level-bars"
      role="img"
      aria-label={`Level ${level}, ${levelName(level)}`}
    >
      {[1, 2, 3, 4, 5].map((step) => (
        <i key={step} className={step <= level ? 'on' : ''} />
      ))}
    </span>
  );
}

function FilterGroups({
  facets,
  browser,
}: {
  facets: FacetConfig[];
  browser: BrowserState;
}) {
  const { setBrowser } = usePractice();
  const toggle = (facet: Facet, value: string) =>
    setBrowser((current) => {
      const selected = current.filters[facet] ?? [];
      return {
        ...current,
        filters: {
          ...current.filters,
          [facet]: selected.includes(value)
            ? selected.filter((item) => item !== value)
            : [...selected, value],
        },
      };
    });
  return (
    <div className="filter-groups">
      {facets.map((facet) => {
        const pool = filterExercises(browser, facets, facet.id);
        return (
          <fieldset key={facet.id} className="filter-group">
            <legend>{facet.name}</legend>
            {facet.options.map((option) => {
              const count = pool.filter((exercise) =>
                facet.values(exercise).includes(option.value),
              ).length;
              const selected =
                browser.filters[facet.id]?.includes(option.value) ?? false;
              if (!count && !selected) return null;
              return (
                <button
                  key={option.value}
                  className={selected ? 'active' : ''}
                  aria-pressed={selected}
                  onClick={() => toggle(facet.id, option.value)}
                >
                  <span>{option.label}</span>
                  <small>{count}</small>
                </button>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}

export function ExercisesScreen() {
  const { attempts, prefs, browser, setBrowser } = usePractice();
  const [view, setView] = useState<'list' | 'detail'>(
    browser.selectedId ? 'detail' : 'list',
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const facets = facetsFor(attempts, prefs.favorites);
  const visible = sortExercises(
    filterExercises(browser, facets),
    browser.sort,
    attempts,
  );
  const selected =
    (browser.selectedId ? exerciseById(browser.selectedId) : undefined) ??
    visible[0] ??
    EXERCISES[0];
  const summary = practiceSummary(attempts);
  const chips = facets.flatMap((facet) =>
    (browser.filters[facet.id] ?? []).map((value) => ({
      facet: facet.id,
      value,
      label:
        facet.options.find((option) => option.value === value)?.label ?? value,
    })),
  );
  const clearFilter = (facet: Facet, value: string) =>
    setBrowser((current) => ({
      ...current,
      filters: {
        ...current.filters,
        [facet]: (current.filters[facet] ?? []).filter(
          (item) => item !== value,
        ),
      },
    }));

  return (
    <section className="screen exercises-screen" data-view={view}>
      <header className="screen-header exercises-header">
        <div className="screen-title">
          <span>RHYTHM TRAINING · {EXERCISES.length} EXERCISES</span>
          <h1>Exercises</h1>
        </div>
        <dl className="practice-summary">
          <div>
            <dt>Sessions</dt>
            <dd>{summary.sessions}</dd>
          </div>
          <div>
            <dt>Minutes</dt>
            <dd>{summary.minutes}</dd>
          </div>
          <div>
            <dt>Mastered</dt>
            <dd>
              {summary.mastered}
              <small>/{EXERCISES.length}</small>
            </dd>
          </div>
          <div>
            <dt>Day streak</dt>
            <dd>{summary.streak}</dd>
          </div>
        </dl>
        <PracticeCalibration />
      </header>

      <div className="exercises-layout" data-gesture-lock>
        <aside className="exercise-filters" aria-label="Filters">
          <FilterGroups facets={facets} browser={browser} />
        </aside>

        <main className="exercise-browser">
          <div className="browser-toolbar">
            <label className="browser-search">
              <Search aria-hidden="true" />
              <input
                type="search"
                aria-label="Search exercises"
                placeholder="Search exercises…"
                value={browser.query}
                onChange={(event) =>
                  setBrowser((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
              />
            </label>
            <button
              className="filters-toggle"
              onClick={() => setFiltersOpen(true)}
            >
              <ListFilter /> Filters{chips.length ? ` · ${chips.length}` : ''}
            </button>
            <SearchMenu
              ariaLabel="Sort"
              className="sort-menu"
              value={browser.sort}
              options={SORTS}
              searchable={false}
              align="end"
              onChange={(sort) =>
                setBrowser((current) => ({ ...current, sort }))
              }
            />
          </div>
          {chips.length > 0 && (
            <div className="active-filters">
              {chips.map((chip) => (
                <button
                  key={`${chip.facet}-${chip.value}`}
                  onClick={() => clearFilter(chip.facet, chip.value)}
                >
                  {chip.label} <X aria-label="Remove filter" />
                </button>
              ))}
              <button
                className="text-link"
                onClick={() =>
                  setBrowser((current) => ({ ...current, filters: {} }))
                }
              >
                Clear all
              </button>
            </div>
          )}
          <p className="browser-count" aria-live="polite">
            {visible.length} exercise{visible.length === 1 ? '' : 's'}
          </p>
          <div className="exercise-list">
            {visible.map((exercise) => {
              const best = bestScore(exercise.id, attempts);
              const status = statusOf(exercise, attempts);
              return (
                <button
                  key={exercise.id}
                  className={`exercise-card ${selected.id === exercise.id ? 'active' : ''}`}
                  aria-pressed={selected.id === exercise.id}
                  onClick={() => {
                    setBrowser((current) => ({
                      ...current,
                      selectedId: exercise.id,
                    }));
                    setView('detail');
                  }}
                >
                  <span className="card-main">
                    <span className="card-title">
                      <strong>{exercise.title}</strong>
                      {prefs.favorites.includes(exercise.id) && (
                        <Star
                          className="card-favorite"
                          aria-label="Favourite"
                        />
                      )}
                    </span>
                    <small>{exercise.summary}</small>
                    <span className="card-tags">
                      <LevelBars level={exercise.difficulty} />
                      <i>{skillName(exercise.skill)}</i>
                      <i>{meterOf(exercise)}</i>
                      <i>
                        {exercise.parts.length} pad
                        {exercise.parts.length > 1 ? 's' : ''}
                      </i>
                      {exercise.backing && <i>groove</i>}
                    </span>
                  </span>
                  <span className={`card-score ${status}`}>
                    {best === null ? 'New' : best}
                    <small>
                      {best === null
                        ? ''
                        : status === 'mastered'
                          ? 'mastered'
                          : 'best'}
                    </small>
                  </span>
                </button>
              );
            })}
            {!visible.length && (
              <div className="browser-empty">
                <p>No exercise matches these filters.</p>
                <button
                  onClick={() =>
                    setBrowser((current) => ({
                      ...current,
                      filters: {},
                      query: '',
                    }))
                  }
                >
                  Show all exercises
                </button>
              </div>
            )}
          </div>
        </main>

        <ExerciseDetail
          key={selected.id}
          exercise={selected}
          onBack={() => setView('list')}
        />
      </div>

      <Dialog.Root open={filtersOpen} onOpenChange={setFiltersOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="results-backdrop" />
          <Dialog.Popup
            className="filters-sheet"
            data-gesture-lock
            data-keyboard-lock
          >
            <header>
              <Dialog.Title className="results-title">Filters</Dialog.Title>
              <Dialog.Close className="icon-button" aria-label="Close filters">
                <X />
              </Dialog.Close>
            </header>
            <FilterGroups facets={facets} browser={browser} />
            <footer className="results-actions">
              <button
                onClick={() =>
                  setBrowser((current) => ({ ...current, filters: {} }))
                }
              >
                Clear all
              </button>
              <Dialog.Close className="primary">
                Show {visible.length}
              </Dialog.Close>
            </footer>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

const LENGTHS: { value: string; label: string }[] = [
  { value: '30', label: '30 s' },
  { value: '60', label: '1 min' },
  { value: '120', label: '2 min' },
  { value: '300', label: '5 min' },
  { value: '600', label: '10 min' },
  { value: 'free', label: 'No limit' },
];

function ExerciseDetail({
  exercise,
  onBack,
}: {
  exercise: Exercise;
  onBack: () => void;
}) {
  const {
    optionsFor,
    setExerciseOptions,
    listen,
    start,
    cancel,
    session,
    attempts,
    prefs,
    toggleFavorite,
    showResults,
  } = usePractice();
  const { kit } = useApp();
  const options = optionsFor(exercise);
  const history = attemptsFor(exercise.id, attempts);
  const best = bestScore(exercise.id, attempts);
  const listening =
    session?.mode === 'listen' && session.exercise.id === exercise.id;
  const set = (patch: Partial<PracticeOptions>) =>
    setExerciseOptions(exercise, patch);
  const backingName = (id: string | null) =>
    id
      ? (RHYTHM_PRESETS.find((rhythm) => rhythm.id === id)?.title ?? id)
      : 'Click only';
  const favorite = prefs.favorites.includes(exercise.id);

  // While listening, changes to what is heard restart the demo at once.
  const heard = `${options.bpm}|${options.backing}|${options.click}`;
  const lastHeard = useRef(heard);
  useEffect(() => {
    if (lastHeard.current === heard) return;
    lastHeard.current = heard;
    if (listening) listen(exercise);
  }, [exercise, heard, listen, listening]);

  const minutes = Math.round(
    history.reduce((sum, attempt) => sum + (attempt.durationSec ?? 0), 0) / 60,
  );

  return (
    <aside className="exercise-detail" aria-label={exercise.title}>
      <button className="detail-back text-link" onClick={onBack}>
        <ArrowLeft /> All exercises
      </button>
      <header className="detail-header">
        <div>
          <span className="detail-kicker">
            {skillName(exercise.skill)} · {styleName(exercise.style)}
          </span>
          <h2>{exercise.title}</h2>
        </div>
        <button
          className={`icon-button favorite-toggle ${favorite ? 'active' : ''}`}
          aria-pressed={favorite}
          aria-label={favorite ? 'Remove from favourites' : 'Add to favourites'}
          onClick={() => toggleFavorite(exercise.id)}
        >
          <Star />
        </button>
      </header>
      <p className="detail-summary">{exercise.summary}</p>
      <ul className="detail-facts">
        <li>
          <LevelBars level={exercise.difficulty} />{' '}
          {levelName(exercise.difficulty)}
        </li>
        <li>
          {meterOf(exercise)} · {exercise.bars} bar
          {exercise.bars > 1 ? 's' : ''}
        </li>
        <li>
          {exercise.bpmRange[0]}–{exercise.bpmRange[1]} BPM
        </li>
        <li>
          {exercise.backing
            ? `Plays with ${backingName(exercise.backing)}`
            : 'Click only'}
        </li>
        {exercise.gap && (
          <li>
            Click {exercise.gap.play} on, {exercise.gap.silent} off
          </li>
        )}
      </ul>

      <TargetNotation exercise={exercise} />

      <section className="detail-how">
        <h3>How to play</h3>
        <ol>
          {exercise.instructions.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        <ul className="detail-parts">
          {exercise.parts.map((part) => (
            <li key={part.pad}>
              <b>{kit.pads[part.pad]?.label}</b>{' '}
              <kbd>{kit.pads[part.pad]?.key.toUpperCase()}</kbd>{' '}
              {describePart(exercise, part)}
            </li>
          ))}
        </ul>
        {exercise.tip && <p className="detail-tip">{exercise.tip}</p>}
      </section>

      <section className="detail-setup" aria-label="Setup">
        <h3>Setup</h3>
        <div className="setup-row tempo-row">
          <span>Tempo</span>
          <Slider
            aria-label="Tempo"
            aria-valuetext={`${options.bpm} BPM`}
            value={[options.bpm]}
            min={exercise.bpmRange[0]}
            max={exercise.bpmRange[1]}
            step={1}
            onValueChange={(value) =>
              set({ bpm: typeof value === 'number' ? value : value[0] })
            }
          />
          <output>{options.bpm} BPM</output>
          {options.bpm !== exercise.bpm && (
            <button
              className="text-link"
              onClick={() => set({ bpm: exercise.bpm })}
            >
              Reset to {exercise.bpm}
            </button>
          )}
        </div>
        <div className="setup-row">
          <span>Length</span>
          <Chips
            ariaLabel="Length"
            value={
              options.duration === null ? 'free' : String(options.duration)
            }
            options={LENGTHS}
            onChange={(value) =>
              set({ duration: value === 'free' ? null : Number(value) })
            }
          />
        </div>
        <div className="setup-row">
          <span>Backing</span>
          <SearchMenu
            ariaLabel="Backing groove"
            className="backing-menu"
            value={options.backing ?? 'none'}
            options={[
              ...compatibleBackings(exercise).map((rhythm) => ({
                value: rhythm.id,
                label: rhythm.title,
                detail:
                  rhythm.id === exercise.backing
                    ? 'Recommended'
                    : rhythm.tags.join(' · '),
                group:
                  rhythm.id === exercise.backing
                    ? 'For this exercise'
                    : `Other ${meterOf(exercise)} grooves`,
              })),
              {
                value: 'none',
                label: 'Click only',
                detail: 'No drum groove',
                group: 'None',
              },
            ].sort(
              (a, b) =>
                Number(b.group === 'For this exercise') -
                Number(a.group === 'For this exercise'),
            )}
            onChange={(value) =>
              set({ backing: value === 'none' ? null : value })
            }
          />
        </div>
        <div className="setup-row">
          <span>Click</span>
          <Switch
            aria-label="Click"
            checked={options.click}
            onCheckedChange={(click) => set({ click })}
          />
          <span className="setup-sub">Count-in</span>
          <Chips
            ariaLabel="Count-in"
            value={String(options.countInBars)}
            options={[
              { value: '0', label: 'Off' },
              { value: '1', label: '1 bar' },
              { value: '2', label: '2 bars' },
            ]}
            onChange={(value) => set({ countInBars: Number(value) })}
          />
        </div>
        <div className="setup-row">
          <span>Timing</span>
          <Chips
            ariaLabel="Timing strictness"
            value={options.strictness}
            options={(['relaxed', 'normal', 'strict'] as const).map(
              (value) => ({
                value,
                label: `${value[0].toUpperCase()}${value.slice(1)} ±${TOLERANCE_MS[value]}`,
              }),
            )}
            onChange={(strictness) => set({ strictness })}
          />
        </div>
        <div className="setup-row">
          <span>Guide</span>
          <Chips
            ariaLabel="Guide"
            value={options.guide}
            options={[
              {
                value: 'off',
                label: 'Off',
                title: 'Play from the notation only',
              },
              {
                value: 'lights',
                label: 'Lights',
                title: 'Target pads light up when a note is due',
              },
              {
                value: 'sound',
                label: 'Sound',
                title: 'The part plays quietly along with you',
              },
            ]}
            onChange={(guide) => set({ guide })}
          />
        </div>
      </section>

      <div className="detail-actions">
        <button
          onClick={() => (listening ? cancel() : listen(exercise))}
          aria-pressed={listening}
        >
          {listening ? <Square /> : <Headphones />}{' '}
          {listening ? 'Stop' : 'Listen'}
        </button>
        <button className="primary" onClick={() => start(exercise)}>
          <Play /> Start practice
        </button>
      </div>

      <section className="detail-history">
        <h3>Your progress</h3>
        {history.length ? (
          <>
            <dl className="history-tiles">
              <div>
                <dt>Best</dt>
                <dd>{best}</dd>
              </div>
              <div>
                <dt>Last</dt>
                <dd>{history.at(-1)!.score}</dd>
              </div>
              <div>
                <dt>Sessions</dt>
                <dd>{history.length}</dd>
              </div>
              <div>
                <dt>Minutes</dt>
                <dd>{minutes}</dd>
              </div>
            </dl>
            {history.length > 1 && (
              <ColumnChart
                label="Score per session"
                max={100}
                height={72}
                columns={history.slice(-16).map((attempt) => ({
                  label: `${new Date(attempt.completedAt).toLocaleDateString()} · ${attempt.bpm ?? exercise.bpm} BPM`,
                  value: attempt.score,
                  display: `Score ${attempt.score}`,
                }))}
                axis={['Earlier', '', 'Latest']}
              />
            )}
            <ul className="history-list">
              {history
                .slice(-4)
                .reverse()
                .map((attempt) => (
                  <li key={attempt.id}>
                    <button onClick={() => showResults(attempt, exercise)}>
                      <strong>{attempt.score}</strong>
                      <span>
                        {new Date(attempt.completedAt).toLocaleDateString(
                          undefined,
                          { month: 'short', day: 'numeric' },
                        )}{' '}
                        · {attempt.bpm ?? exercise.bpm} BPM
                        {attempt.biasMs
                          ? ` · ${Math.abs(attempt.biasMs)} ms ${attempt.biasMs < 0 ? 'early' : 'late'}`
                          : ''}
                      </span>
                      <small>Details</small>
                    </button>
                  </li>
                ))}
            </ul>
          </>
        ) : (
          <p className="history-empty">
            No sessions yet. Listen first, then start at the default tempo.
          </p>
        )}
      </section>
    </aside>
  );
}
