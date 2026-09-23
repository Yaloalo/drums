import type { ExerciseAttempt, ExerciseHit } from '../model/types.ts';

export interface ScoreInput {
  exerciseId: string;
  expected: Array<{ time: number; padIndex: number }>;
  actual: ExerciseHit[];
  toleranceMs: number;
  startedAt?: number;
}

export function scorePerformance(input: ScoreInput): ExerciseAttempt {
  const remaining = [...input.actual];
  const errors: number[] = [];
  let missed = 0;
  let wrongPad = 0;

  for (const expected of input.expected) {
    let bestIndex = -1;
    let bestDistance = Infinity;
    remaining.forEach((hit, index) => {
      const distance = Math.abs((hit.time - expected.time) * 1000);
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    });
    if (bestIndex < 0 || bestDistance > input.toleranceMs) { missed += 1; continue; }
    const hit = remaining.splice(bestIndex, 1)[0];
    if (hit.padIndex !== expected.padIndex) wrongPad += 1;
    errors.push((hit.time - expected.time) * 1000);
  }

  const extra = remaining.length;
  const averageErrorMs = errors.length ? errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length : input.toleranceMs * 2;
  const biasMs = errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : 0;
  const consistencyMs = errors.length > 1 ? Math.sqrt(errors.reduce((sum, value) => sum + (value - biasMs) ** 2, 0) / errors.length) : averageErrorMs;
  const hitScore = input.expected.length ? ((input.expected.length - missed) / input.expected.length) * 55 : 0;
  const timingScore = Math.max(0, 35 * (1 - averageErrorMs / Math.max(input.toleranceMs, 1)));
  const penalty = extra * 3 + wrongPad * 4;
  const score = Math.round(Math.max(0, Math.min(100, hitScore + timingScore + 10 - penalty)));

  let feedback = 'Lock the target pulse first, then add detail.';
  if (score >= 90) feedback = Math.abs(biasMs) < 8 ? 'Excellent pocket — accurate and balanced.' : `Very consistent, but around ${Math.round(Math.abs(biasMs))} ms ${biasMs < 0 ? 'early' : 'late'}.`;
  else if (score >= 75) feedback = consistencyMs < 25 ? `Solid and consistent. Aim ${Math.round(Math.abs(biasMs))} ms ${biasMs < 0 ? 'later' : 'earlier'}.` : 'Good pulse. Relax the gaps between hits for more consistency.';
  else if (missed > extra) feedback = 'Keep the pulse through the rests; a few target hits were missed.';
  else if (extra > missed) feedback = 'Good energy. Leave more space between the target notes.';

  const now = Date.now();
  return {
    id: `attempt-${now}`,
    exerciseId: input.exerciseId,
    startedAt: input.startedAt ?? now,
    completedAt: now,
    score,
    averageErrorMs: Math.round(averageErrorMs),
    consistencyMs: Math.round(consistencyMs),
    biasMs: Math.round(biasMs),
    missed,
    extra,
    wrongPad,
    feedback,
  };
}
