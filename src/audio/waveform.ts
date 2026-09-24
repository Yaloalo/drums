export interface WaveformPreview {
  /** Filled min/max envelope of the whole hit, used by the pads. */
  path: string;
  duration: number;
  /** Line traces for the synth's output scope. */
  traces: Record<ScopeZoom, ScopeTrace>;
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

export type ScopeZoom = 'auto' | 'short' | 'medium' | 'full';

export interface ScopeTrace {
  path: string;
  /** Seconds of audio shown across the scope. */
  window: number;
}

/** Seconds shown by each zoom; `auto` fits about six cycles of the pitch. */
export function scopeWindow(
  zoom: ScopeZoom,
  duration: number,
  fundamental: number,
): number {
  const window =
    zoom === 'full'
      ? duration
      : zoom === 'medium'
        ? 0.1
        : zoom === 'short'
          ? 0.02
          : Math.max(0.012, Math.min(0.12, 6 / Math.max(20, fundamental)));
  return Math.max(0.001, Math.min(duration, window));
}

/** Seconds of leading silence (the master compressor's look-ahead, or a slow
 * attack), minus a short margin so the scope starts at the sound. */
export function findOnset(
  channels: Float32Array[],
  sampleRate: number,
  threshold = 0.02,
): number {
  const length = channels[0]?.length ?? 0;
  let peak = 0;
  for (const channel of channels)
    for (const value of channel) peak = Math.max(peak, Math.abs(value));
  if (peak < 0.00001) return 0;
  for (let i = 0; i < length; i++)
    for (const channel of channels)
      if (Math.abs(channel[i]) > peak * threshold)
        return Math.max(0, i / sampleRate - 0.0005);
  return 0;
}

/**
 * An oscilloscope line of `window` seconds from `start`, drawn as one stroke in a
 * 160×64 box. Each point keeps the sample with the largest magnitude in its
 * slice, so transients survive and cycles stay visible when zoomed in.
 */
export function scopeTrace(
  channels: Float32Array[],
  sampleRate: number,
  window: number,
  points = 480,
  start = 0,
): string {
  const offset = Math.max(0, Math.round(start * sampleRate));
  const available = Math.max(0, (channels[0]?.length ?? 0) - offset);
  const length = Math.min(
    available,
    Math.max(2, Math.round(window * sampleRate)),
  );
  if (!channels.length || length < 2) return '';
  const mono = new Float32Array(length);
  for (const channel of channels)
    for (let i = 0; i < length; i++)
      mono[i] += channel[offset + i] / channels.length;
  let peak = 0;
  for (const value of mono) peak = Math.max(peak, Math.abs(value));
  if (peak < 0.00001) return 'M0,32 L160,32';
  const count = Math.min(points, length);
  const coordinates: string[] = [];
  for (let point = 0; point < count; point++) {
    const start = Math.floor((point * length) / count);
    const end = Math.max(start + 1, Math.floor(((point + 1) * length) / count));
    let extreme = mono[start];
    for (let i = start + 1; i < end; i++)
      if (Math.abs(mono[i]) > Math.abs(extreme)) extreme = mono[i];
    const x = ((point * 160) / (count - 1)).toFixed(2);
    coordinates.push(`${x},${(32 - (extreme / peak) * 29).toFixed(2)}`);
  }
  return `M${coordinates.join(' L')}`;
}
