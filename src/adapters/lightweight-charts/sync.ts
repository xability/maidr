/**
 * Works out how a data change on the chart reaches MAIDR: as appends, which
 * monitor mode announces, or as a replaced figure, which it does not.
 */

import type { LightweightChartsReading, SeriesReading } from './converters';

/** One layer that grew by exactly one bar, and the bar. */
export interface Append {
  reading: SeriesReading;
  point: SeriesReading['points'][number];
}

/** The label a point is announced by -- its x, or a candle's `value`. */
export function labelOf(point: SeriesReading['points'][number]): string {
  return 'value' in point ? point.value : String(point.x);
}

function samePoint(a: SeriesReading['points'][number], b: SeriesReading['points'][number]): boolean {
  const left = a as unknown as Record<string, unknown>;
  const right = b as unknown as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => left[key] === right[key]);
}

function samePoints(a: readonly SeriesReading['points'][number][], b: readonly SeriesReading['points'][number][]): boolean {
  return a.length === b.length && a.every((point, index) => samePoint(point, b[index]));
}

/**
 * What changed between two readings, as appends where every change is one
 * new bar at the end of a layer.
 *
 * @returns The appends, empty when nothing changed, or `null` when something
 * other than an append did -- a revised bar, a reload, a series added -- and
 * the figure has to be replaced.
 */
export function planAppends(before: LightweightChartsReading, after: LightweightChartsReading): Append[] | null {
  if (before.series.length !== after.series.length) {
    return null;
  }
  const appends: Append[] = [];
  for (let index = 0; index < after.series.length; index++) {
    const old = before.series[index];
    const next = after.series[index];
    if (old.layerId !== next.layerId || old.subplotRow !== next.subplotRow || old.kind !== next.kind) {
      return null;
    }
    if (next.total === old.total) {
      if (!samePoints(old.points, next.points)) {
        return null;
      }
      continue;
    }
    if (next.total !== old.total + 1) {
      return null;
    }
    // The bars before the new one are the old bars, less any the window drops.
    const kept = next.points.length - 1;
    const start = old.points.length - kept;
    if (start < 0 || !samePoints(old.points.slice(start), next.points.slice(0, kept))) {
      return null;
    }
    appends.push({ reading: next, point: next.points[kept] });
  }
  return appends;
}
