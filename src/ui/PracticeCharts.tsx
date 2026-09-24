'use client';

import { useState } from 'react';

export interface Column {
  label: string;
  value: number | null;
  /** Value as shown in the tooltip and table. */
  display: string;
  /** Drawn quieter, e.g. bars played without the click. */
  muted?: boolean;
}

/**
 * Single-series columns growing from zero (negative values hang below it).
 * Hover or arrow keys show a tooltip; the same numbers are in a table for
 * screen readers.
 */
export function ColumnChart({
  columns,
  min = 0,
  max,
  height = 120,
  label,
  axis,
  band,
}: {
  columns: Column[];
  min?: number;
  max?: number;
  height?: number;
  label: string;
  /** Labels under the left edge, centre and right edge. */
  axis?: [string, string?, string?];
  /** Column index range shaded behind the marks, e.g. the on-time window. */
  band?: [number, number];
}) {
  const [active, setActive] = useState<number | null>(null);
  const values = columns.map((column) => column.value ?? 0);
  const top = max ?? Math.max(1, ...values);
  const bottom = Math.min(min, ...values);
  const range = top - bottom || 1;
  const zero = Math.max(0, Math.min(1, -bottom / range));
  const count = Math.max(1, columns.length);
  const current = active === null ? null : columns[active];
  return (
    <figure className="column-chart">
      <button
        type="button"
        className="column-plot"
        style={{ height }}
        aria-label={`${label}. Use the arrow keys to read each value.`}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
            return;
          event.preventDefault();
          setActive((index) => {
            if (event.key === 'Home') return 0;
            if (event.key === 'End') return count - 1;
            const step = event.key === 'ArrowLeft' ? -1 : 1;
            return Math.max(
              0,
              Math.min(count - 1, (index ?? (step > 0 ? -1 : count)) + step),
            );
          });
        }}
      >
        {band && (
          <span
            className="column-band"
            style={{
              left: `${(band[0] / count) * 100}%`,
              width: `${((band[1] - band[0] + 1) / count) * 100}%`,
            }}
          />
        )}
        <span className="column-zero" style={{ bottom: `${zero * 100}%` }} />
        {columns.map((column, index) => {
          const value = column.value ?? 0;
          const fraction = (value - bottom) / range;
          return (
            <span
              key={index}
              className={`column-slot ${active === index ? 'active' : ''}`}
              onPointerEnter={() => setActive(index)}
            >
              {column.value !== null && (
                <i
                  className={`column-bar ${value < 0 ? 'down' : 'up'} ${column.muted ? 'muted' : ''}`}
                  style={{
                    bottom: `${Math.min(zero, fraction) * 100}%`,
                    height: `max(${value === 0 ? 0 : 2}px, ${Math.abs(fraction - zero) * 100}%)`,
                  }}
                />
              )}
            </span>
          );
        })}
        {current && (
          <output
            className="column-tooltip"
            style={{
              left: `${((active! + 0.5) / count) * 100}%`,
            }}
          >
            <strong>{current.display}</strong>
            <span>{current.label}</span>
          </output>
        )}
      </button>
      {axis && (
        <figcaption className="column-axis" aria-hidden="true">
          <span>{axis[0]}</span>
          <span>{axis[1] ?? ''}</span>
          <span>{axis[2] ?? ''}</span>
        </figcaption>
      )}
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {columns.map((column, index) => (
            <tr key={index}>
              <th scope="row">{column.label}</th>
              <td>{column.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
