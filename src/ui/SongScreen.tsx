'use client';

import { ArrowDown, Construction } from 'lucide-react';
import { useApp } from '../state/AppContext';

export function SongScreen() {
  const { setArea } = useApp();
  return <section className="screen song-screen"><button className="back-control song-back" onClick={() => setArea('pads')}><ArrowDown /><span>PADS</span></button><div className="song-placeholder"><Construction /><span>SONG MODE</span><h1>Arrangement comes next.</h1><p>This space is intentionally empty — the instrument, sound design, sequencing and training systems are ready below it.</p><button onClick={() => setArea('pads')}>RETURN TO PADS</button></div></section>;
}
