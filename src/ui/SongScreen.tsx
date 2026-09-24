'use client';

import { Construction } from 'lucide-react';

export function SongScreen() {
  return (
    <section className="screen song-screen">
      <div className="song-placeholder">
        <Construction />
        <span>SONG MODE</span>
        <h1>Arrangement comes next.</h1>
        <p>
          This space is intentionally empty — the instrument, sound design,
          sequencing and training systems are ready below it.
        </p>
      </div>
    </section>
  );
}
