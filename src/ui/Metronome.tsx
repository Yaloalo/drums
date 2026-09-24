'use client';

import { useApp } from '../state/AppContext';

export function Metronome() {
  const { transport, updateTransport, pattern } = useApp();
  return (
    <div className="metronome-control" data-gesture-lock>
      <button
        className={transport.metronome ? 'enabled' : ''}
        aria-label="Metronome"
        aria-pressed={transport.metronome}
        onClick={() => updateTransport({ metronome: !transport.metronome })}
      >
        <span className="metronome-led" /> Metronome
        <small>{transport.metronome ? 'ON' : 'OFF'}</small>
      </button>
      <div className="metronome-beats" aria-hidden="true">
        {Array.from({ length: pattern.beatsPerBar }, (_, beat) => (
          <i
            key={beat}
            className={
              transport.metronome && (transport.metronomeBeat ?? 0) === beat
                ? 'lit'
                : ''
            }
          >
            {beat + 1}
          </i>
        ))}
      </div>
      <span className="metronome-meter">
        {pattern.beatsPerBar}/{pattern.beatUnit}
      </span>
    </div>
  );
}
