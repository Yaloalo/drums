export interface ClickBeat {
  time: number;
  beat: number;
  accent: boolean;
}

/** A straight, unswung musical clock. Times are Web Audio seconds. */
export class MetronomeClock {
  private nextTime = 0;
  private beat = 0;

  reset(time: number, beat = 0) {
    this.nextTime = time;
    this.beat = beat;
  }

  window(
    now: number,
    horizon: number,
    bpm: number,
    beatsPerBar: number,
    beatUnit: number,
  ): ClickBeat[] {
    const duration = (60 / Math.max(30, Math.min(260, bpm))) * (4 / beatUnit);
    const beats = Math.max(1, beatsPerBar);
    // A suspended tab must never release a burst of old clicks on returning.
    if (this.nextTime < now - duration) {
      const skipped = Math.ceil((now - this.nextTime) / duration);
      this.nextTime += skipped * duration;
      this.beat = (this.beat + skipped) % beats;
    }
    const result: ClickBeat[] = [];
    while (this.nextTime < horizon) {
      result.push({
        time: this.nextTime,
        beat: this.beat,
        accent: this.beat === 0,
      });
      this.nextTime += duration;
      this.beat = (this.beat + 1) % beats;
    }
    return result;
  }
}
