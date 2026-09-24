'use client';

import { Pause, Play } from 'lucide-react';
import { useApp } from '../state/AppContext';

export function TransportBar({ compact = false }: { compact?: boolean }) {
  const { transport, toggleTransport, stopTransport, updateTransport } =
    useApp();
  return (
    <div
      className={`transport-bar ${compact ? 'compact' : ''}`}
      data-gesture-lock
    >
      <button
        className={`transport-play ${transport.playing ? 'is-playing' : ''}`}
        onClick={toggleTransport}
        aria-label={transport.playing ? 'Pause sequence' : 'Play sequence'}
      >
        {transport.playing ? <Pause /> : <Play />}
        {transport.playing ? 'Pause' : 'Play'}
      </button>
      {!compact && (
        <button onClick={stopTransport} aria-label="Stop sequence">
          Stop
        </button>
      )}
      <label className="tempo-control">
        <input
          aria-label="Tempo"
          inputMode="numeric"
          type="number"
          min="30"
          max="260"
          value={transport.bpm}
          onChange={(event) =>
            updateTransport({
              bpm: Math.max(30, Math.min(260, Number(event.target.value))),
            })
          }
        />
        <span>BPM</span>
      </label>
    </div>
  );
}
