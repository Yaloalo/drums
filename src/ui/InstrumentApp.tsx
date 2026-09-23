'use client';

import { useEffect, useRef, useState } from 'react';
import { AppProvider, type Area, useApp } from '../state/AppContext';
import { ExercisesScreen } from './ExercisesScreen';
import { PadsScreen } from './PadsScreen';
import { SequencerScreen } from './SequencerScreen';
import { SongScreen } from './SongScreen';
import { SynthScreen } from './SynthScreen';

// Horizontal positions follow the physical pull: a left swipe reveals the
// Sequencer from the right; a right swipe reveals Synth from the left.
const coordinates: Record<Area, [number, number]> = { pads: [0, 0], exercises: [0, -1], synth: [-1, 0], sequencer: [1, 0], song: [0, 1] };
const keyboard = ['1', '2', '3', '4', 'q', 'w', 'e', 'r', 'a', 's', 'd', 'f', 'z', 'x', 'c', 'v'];

export function InstrumentApp() { return <AppProvider><Workspace /></AppProvider>; }

function Workspace() {
  const { area, setArea, triggerPad, toggleTransport } = useApp();
  const [transition, setTransition] = useState('from-center');
  const pointer = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  const current = useRef(area);

  const navigate = (next: Area) => {
    if (next === area) return;
    const [fromX, fromY] = coordinates[area]; const [toX, toY] = coordinates[next];
    setTransition(Math.abs(toX - fromX) > Math.abs(toY - fromY) ? (toX > fromX ? 'from-right' : 'from-left') : (toY > fromY ? 'from-bottom' : 'from-top'));
    setArea(next);
  };
  useEffect(() => { current.current = area; }, [area]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || ['INPUT', 'SELECT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)) return;
      const index = keyboard.indexOf(event.key.toLowerCase());
      if (index >= 0) { event.preventDefault(); triggerPad(index); }
      if (event.code === 'Space') { event.preventDefault(); toggleTransport(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleTransport, triggerPad]);

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, input, select, textarea, [data-gesture-lock]')) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
  };
  const pointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    pointer.current = null;
    const dx = event.clientX - start.x; const dy = event.clientY - start.y; const elapsed = performance.now() - start.time;
    if (elapsed > 800 || Math.max(Math.abs(dx), Math.abs(dy)) < 68) return;
    const horizontal = Math.abs(dx) > Math.abs(dy) * 1.25;
    const vertical = Math.abs(dy) > Math.abs(dx) * 1.25;
    if (area === 'pads') {
      if (horizontal && dx > 0) navigate('synth');
      else if (horizontal && dx < 0) navigate('sequencer');
      else if (vertical && dy > 0) navigate('exercises');
      else if (vertical && dy < 0) navigate('song');
    } else if (area === 'exercises' && vertical && dy < 0) navigate('pads');
    else if (area === 'song' && vertical && dy > 0) navigate('pads');
    else if (area === 'synth' && horizontal && dx < 0) navigate('pads');
    else if (area === 'sequencer' && horizontal && dx > 0) navigate('pads');
  };

  return <div className="spatial-workspace" onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={() => { pointer.current = null; }}>
    <div className={`area-stage ${transition}`} key={area}>
      {area === 'pads' && <PadsScreen />}
      {area === 'synth' && <SynthScreen />}
      {area === 'sequencer' && <SequencerScreen />}
      {area === 'exercises' && <ExercisesScreen />}
      {area === 'song' && <SongScreen />}
    </div>
    <div className="spatial-map" aria-hidden="true"><i className={area === 'exercises' ? 'active' : ''} /><i className={area === 'sequencer' ? 'active' : ''} /><i className={area === 'pads' ? 'active' : ''} /><i className={area === 'synth' ? 'active' : ''} /><i className={area === 'song' ? 'active' : ''} /></div>
  </div>;
}
