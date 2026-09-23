import type { Exercise } from '../model/types.ts';
import { deepFreeze } from '../model/types.ts';

const families = [
  { category: 'Pulse', stage: 1, base: 'Quarter Pulse', explanation: 'Place one clean hit on each beat and keep the distance even.', rhythm: 'rhythm-quarter-pulse', mode: 'perform' as const, steps: [0, 4, 8, 12], pads: [1] },
  { category: 'Subdivision', stage: 2, base: 'Eighth Notes', explanation: 'Divide each beat into equal parts without speeding up.', rhythm: 'rhythm-eighth-pulse', mode: 'perform' as const, steps: [0, 2, 4, 6, 8, 10, 12, 14], pads: [2] },
  { category: 'Subdivision', stage: 3, base: 'Sixteenth Grid', explanation: 'Keep four small, even spaces inside each beat.', rhythm: 'rhythm-sixteenth-pulse', mode: 'perform' as const, steps: Array.from({ length: 16 }, (_, i) => i), pads: [2] },
  { category: 'Coordination', stage: 4, base: 'Two-Layer Coordination', explanation: 'Hold a steady layer while another finger changes pattern.', rhythm: 'rhythm-basic-backbeat', mode: 'perform' as const, steps: [0, 4, 8, 12], pads: [0, 1] },
  { category: 'Rests', stage: 5, base: 'Silent Spaces', explanation: 'Feel the missing notes as clearly as the played notes.', rhythm: 'rhythm-quarter-pulse', mode: 'perform' as const, steps: [0, 6, 8, 14], pads: [1] },
  { category: 'Accents', stage: 6, base: 'Moving Accents', explanation: 'Keep the grid even while the emphasis moves.', rhythm: 'rhythm-accent-cycle', mode: 'perform' as const, steps: [0, 5, 10, 15], pads: [1] },
  { category: 'Syncopation', stage: 7, base: 'Offbeat Placement', explanation: 'Land confidently between the main beats.', rhythm: 'rhythm-offbeat-hats', mode: 'perform' as const, steps: [2, 6, 10, 14], pads: [1] },
  { category: 'Sequencer Reconstruction', stage: 8, base: 'Groove Builder', explanation: 'Rebuild the target directly in the real step sequencer.', rhythm: 'rhythm-basic-backbeat', mode: 'reconstruct' as const, steps: [0, 4, 8, 12], pads: [0, 1, 2] },
  { category: 'Subdivision', stage: 9, base: 'Triplet Feel', explanation: 'Hear three equal notes across each beat.', rhythm: 'rhythm-six-eight', mode: 'imitate' as const, steps: [0, 2, 4, 6, 8, 10], pads: [9] },
  { category: 'Pulse', stage: 10, base: 'Shuffle Pocket', explanation: 'Let the middle triplet space create the lilt.', rhythm: 'rhythm-shuffle', mode: 'perform' as const, steps: [0, 3, 4, 7, 8, 11, 12, 15], pads: [2] },
  { category: 'Timing Accuracy', stage: 11, base: 'Precision Window', explanation: 'Center each hit, then notice your early or late tendency.', rhythm: 'rhythm-basic-backbeat', mode: 'perform' as const, steps: [4, 12], pads: [1] },
  { category: 'Odd Meter', stage: 12, base: 'Five and Seven', explanation: 'Follow the grouping instead of counting a long string.', rhythm: 'rhythm-five-four', mode: 'perform' as const, steps: [0, 6, 10], pads: [13] },
  { category: 'Polyrhythm', stage: 13, base: 'Cross-Rhythm', explanation: 'Hear each cycle as its own stable loop before layering.', rhythm: 'rhythm-three-two-polyrhythm', mode: 'polyrhythm' as const, steps: [0, 5, 10], pads: [9, 13] },
  { category: 'Imitation', stage: 14, base: 'Rhythmic Memory', explanation: 'Listen once, hold the shape, then reproduce it.', rhythm: 'rhythm-syncopation-study', mode: 'imitate' as const, steps: [3, 6, 10, 15], pads: [1] },
  { category: 'Coordination', stage: 15, base: 'Independent Layers', explanation: 'Keep one layer automatic while the other moves.', rhythm: 'rhythm-funk-pocket', mode: 'perform' as const, steps: [0, 3, 7, 10, 14], pads: [0, 1, 2] },
  { category: 'Tempo Stability', stage: 11, base: 'Gap Click', explanation: 'Keep the tempo internally while the reference disappears.', rhythm: 'rhythm-gap-click', mode: 'perform' as const, steps: [0, 4, 8, 12], pads: [1] },
  { category: 'Rhythm Recognition', stage: 9, base: 'Name the Shape', explanation: 'Identify the subdivision, accent, or meter you hear.', rhythm: 'rhythm-six-eight', mode: 'recognize' as const, steps: [0, 6], pads: [9] },
];

const tempoSteps = [64, 72, 80, 88, 96, 108, 120];
const variations = ['Foundation', 'Steady', 'With rests', 'Accented', 'Quiet click', 'Faster', 'Challenge'];

export const EXERCISES: readonly Exercise[] = deepFreeze(families.flatMap((family, familyIndex) => variations.map((variation, index) => {
  const bpm = tempoSteps[index] + (familyIndex % 3) * 2;
  const toleranceMs = Math.max(42, 115 - index * 10 - Math.floor(bpm / 30));
  return {
    id: `exercise-${family.stage}-${familyIndex}-${index}`,
    title: `${family.base} · ${variation}`,
    explanation: family.explanation,
    category: family.category,
    difficulty: Math.min(5, 1 + Math.floor(index / 2) + (family.stage > 10 ? 1 : 0)),
    bpm,
    bpmRange: [Math.max(40, bpm - 12), Math.min(220, bpm + 20)] as [number, number],
    meter: family.category === 'Odd Meter' ? (index % 2 ? '7/8' : '5/4') : family.rhythm.includes('six-eight') ? '6/8' : '4/4',
    bars: index > 4 ? 4 : 2,
    kitPresetId: family.stage === 12 ? 'kit-latin-percussion' : 'kit-neutral-practice-kit',
    rhythmPresetId: family.category === 'Odd Meter' && index % 2 ? 'rhythm-seven-eight-223' : family.rhythm,
    targetPads: family.pads,
    targetSteps: index === 2 ? family.steps.filter((_, step) => step % 3 !== 1) : family.steps,
    interactionMode: family.mode,
    countIn: index < 2 ? 2 : 1,
    metronome: { enabled: true, gapEvery: index >= 4 ? 4 : undefined, silentBars: family.category === 'Tempo Stability' ? Math.max(1, index - 2) : undefined },
    toleranceMs,
    hints: [
      'Listen through a full cycle before joining.',
      index > 3 ? 'Use smaller movements and stay relaxed.' : 'Count the large beat out loud first.',
    ],
    progression: { stage: family.stage, prerequisite: family.stage > 1 ? `stage-${family.stage - 1}` : undefined },
  };
})));

export const PROGRESSION = [
  'Pulse', 'Eighth-note subdivisions', 'Sixteenth-note subdivisions', 'Simple coordination', 'Rests', 'Accents', 'Syncopation', 'Groove construction', 'Triplets', 'Shuffle', 'Timing precision', 'Odd meters', 'Polyrhythm', 'Rhythmic memory', 'Advanced coordination',
];

export function validateExercise(exercise: Exercise): string[] {
  const errors: string[] = [];
  if (!exercise.id || !exercise.title) errors.push('Exercise requires an id and title.');
  if (exercise.bpm < 20 || exercise.bpm > 300) errors.push('BPM is outside the supported range.');
  if (!exercise.targetPads.length) errors.push('At least one target pad is required.');
  if (!exercise.targetSteps.length && exercise.interactionMode !== 'recognize') errors.push('Performance exercises need target steps.');
  if (exercise.toleranceMs <= 0) errors.push('Tolerance must be positive.');
  return errors;
}
