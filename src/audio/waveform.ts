export interface WaveformPreview {
  path: string;
  duration: number;
}

// Min/max buckets preserve brief transients that decimation would skip.
export function waveformPath(channels: Float32Array[], buckets = 160): string {
  const length = channels[0]?.length ?? 0;
  if (!length || !channels.length) return '';
  let peak = 0;
  for (const channel of channels)
    for (const value of channel) peak = Math.max(peak, Math.abs(value));
  if (peak < 0.00001) return 'M0,32 L160,32';
  const top: string[] = [];
  const bottom: string[] = [];
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = Math.floor((bucket * length) / buckets);
    const end = Math.min(
      length,
      Math.max(start + 1, Math.floor(((bucket + 1) * length) / buckets)),
    );
    let min = 0;
    let max = 0;
    for (const channel of channels)
      for (let i = start; i < end; i++) {
        min = Math.min(min, channel[i]);
        max = Math.max(max, channel[i]);
      }
    const x = ((bucket * 160) / (buckets - 1)).toFixed(2);
    top.push(`${x},${(32 - (max / peak) * 29).toFixed(2)}`);
    bottom.push(`${x},${(32 - (min / peak) * 29).toFixed(2)}`);
  }
  return `M${top.join(' L')} L${bottom.reverse().join(' L')} Z`;
}
