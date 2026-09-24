'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Gauge, X } from 'lucide-react';
import { AudioEngine, audioEngine } from '../audio/AudioEngine';
import { usePractice } from '../state/PracticeContext';

const CLICKS = 16;
const WARMUP = 4;
const INTERVAL = 0.6;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Measures how late taps register (touch screen, Bluetooth audio) against clicks. */
export function PracticeCalibration() {
  const { prefs, setPrefs, session } = usePractice();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [taps, setTaps] = useState<number[]>([]);
  const clicks = useRef<number[]>([]);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const begin = async () => {
    await audioEngine.initialize();
    const first = audioEngine.currentTime + 0.6;
    clicks.current = Array.from(
      { length: CLICKS },
      (_, index) => first + index * INTERVAL,
    );
    clicks.current.forEach((time, index) =>
      audioEngine.click(time, index % 4 === 0),
    );
    setTaps([]);
    setPhase('running');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setPhase('done'),
      (first - audioEngine.currentTime + CLICKS * INTERVAL + 0.3) * 1000,
    );
  };
  const tap = (eventTime: number) => {
    if (phase !== 'running') return;
    const heard = audioEngine.audibleTime(eventTime);
    const nearest = clicks.current.reduce(
      (best, time, index) =>
        Math.abs(time + AudioEngine.graphDelay - heard) <
        Math.abs(best.time + AudioEngine.graphDelay - heard)
          ? { time, index }
          : best,
      { time: Infinity, index: -1 },
    );
    const offset = (heard - nearest.time - AudioEngine.graphDelay) * 1000;
    if (nearest.index >= WARMUP && Math.abs(offset) < 250)
      setTaps((current) => [...current, offset]);
  };
  const measured = taps.length >= 6 ? Math.round(median(taps)) : null;

  return (
    <>
      <button
        className="calibration-button"
        onClick={() => {
          setOpen(true);
          setPhase('idle');
        }}
        disabled={Boolean(session)}
      >
        <Gauge /> Timing offset {prefs.calibrationMs > 0 ? '+' : ''}
        {prefs.calibrationMs} ms
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="results-backdrop" />
          <Dialog.Popup
            className="calibration-panel"
            data-gesture-lock
            data-keyboard-lock
            onKeyDown={(event) => {
              if (event.code !== 'Space' || event.repeat) return;
              event.preventDefault();
              tap(event.timeStamp);
            }}
          >
            <header>
              <Dialog.Title className="results-title">
                Timing calibration
              </Dialog.Title>
              <Dialog.Close
                className="icon-button"
                aria-label="Close calibration"
              >
                <X />
              </Dialog.Close>
            </header>
            <p>
              Touch screens and wireless headphones add delay, so a hit that
              feels on time can register late. Tap along with 16 clicks; the
              first four are a warm-up. The measured delay is subtracted from
              every hit you play in exercises.
            </p>
            <button
              className={`calibration-pad ${phase}`}
              onPointerDown={(event) => {
                event.preventDefault();
                if (phase === 'running') tap(event.timeStamp);
                else void begin();
              }}
            >
              {phase === 'running' ? (
                <>
                  <strong>Tap</strong>
                  <small>{taps.length} taps counted · or press Space</small>
                </>
              ) : (
                <>
                  <strong>{phase === 'done' ? 'Try again' : 'Start'}</strong>
                  <small>Clicks at 100 BPM</small>
                </>
              )}
            </button>
            {phase === 'done' && (
              <output className="calibration-result">
                {measured === null ? (
                  <p>
                    Not enough taps landed near the clicks. Try again and tap on
                    every click.
                  </p>
                ) : (
                  <p>
                    Your taps register{' '}
                    <b>
                      {Math.abs(measured)} ms {measured >= 0 ? 'late' : 'early'}
                    </b>{' '}
                    (median of {taps.length} taps, spread ±
                    {Math.round(
                      Math.sqrt(
                        taps.reduce(
                          (sum, value) => sum + (value - measured) ** 2,
                          0,
                        ) / taps.length,
                      ),
                    )}{' '}
                    ms).
                  </p>
                )}
              </output>
            )}
            <footer className="results-actions">
              <button onClick={() => setPrefs({ calibrationMs: 0 })}>
                Reset to 0 ms
              </button>
              <button
                className="primary"
                disabled={measured === null}
                onClick={() => {
                  if (measured !== null) setPrefs({ calibrationMs: measured });
                  setOpen(false);
                }}
              >
                Use {measured ?? '—'} ms
              </button>
            </footer>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
