'use client';

import { memo, useEffect, useState } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import { waveformPath, type WaveformPreview } from '../audio/waveform';
import type { SynthPreset } from '../model/types';

const cache = new Map<string, Promise<WaveformPreview>>();
let queue: Promise<unknown> = Promise.resolve();

function getPreview(key: string): Promise<WaveformPreview> {
  const existing = cache.get(key);
  if (existing) return existing;
  // One offline render at a time leaves the live instrument responsive.
  const next = queue.then(async () => {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 12));
    const { preset, tune } = JSON.parse(key) as {
      preset: SynthPreset;
      tune: number;
    };
    const buffer = await AudioEngine.renderPreview(preset, tune);
    const channels = Array.from(
      { length: buffer.numberOfChannels },
      (_, index) => buffer.getChannelData(index),
    );
    return { path: waveformPath(channels), duration: buffer.duration };
  });
  queue = next.catch(() => undefined);
  cache.set(key, next);
  if (cache.size > 96) cache.delete(cache.keys().next().value!);
  return next;
}

export function useSoundPreview(preset: SynthPreset, tune: number) {
  const key = JSON.stringify({ preset, tune });
  const [rendered, setRendered] = useState<{
    key: string;
    preview: WaveformPreview;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void getPreview(key)
        .then((preview) => {
          if (!cancelled) setRendered({ key, preview });
        })
        .catch(() => undefined);
    }, 90);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);
  return { preview: rendered?.preview ?? null, pending: rendered?.key !== key };
}

export const PadWaveform = memo(function PadWaveform({
  preset,
  tune,
}: {
  preset: SynthPreset;
  tune: number;
}) {
  const { preview, pending } = useSoundPreview(preset, tune);
  return (
    <svg
      className="pad-waveform"
      viewBox="0 0 160 64"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-ready={!!preview && !pending}
    >
      <line className="waveform-axis" x1="0" y1="32" x2="160" y2="32" />
      {preview && <path className="waveform-signal" d={preview.path} />}
    </svg>
  );
});
