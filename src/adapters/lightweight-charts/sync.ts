/**
 * Works out how a data change on the chart reaches MAIDR: as appends, which
 * monitor mode announces, or as a replaced figure, which it does not.
 */

import type { Maidr, MaidrLayer } from '@type/grammar';
import type { LightweightChartsReading, SeriesPoint, SeriesReading } from './converters';
import { TraceType } from '@type/grammar';

/** One layer that grew by exactly one bar, and the bar. */
export interface Append {
  reading: SeriesReading;
  point: SeriesPoint;
}

/**
 * How to bring MAIDR from one reading to the next with the new bars
 * announced.
 */
export interface AppendPlan {
  /** The new bars, one per layer that grew by one at its end. */
  appends: Append[];
  /**
   * The figure to set silently before appending, when bars other than the new
   * ones changed as well -- the forming bar closed in the same task that
   * opened the next. `null` when MAIDR's figure plus the appends is already
   * the new reading.
   */
  base: Maidr | null;
}

/** The label a point is announced by -- its x, or a candle's `value`. */
export function labelOf(point: SeriesPoint): string {
  return 'value' in point ? point.value : String(point.x);
}

function samePoint(a: SeriesPoint, b: SeriesPoint): boolean {
  const left = a as unknown as Record<string, unknown>;
  const right = b as unknown as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => left[key] === right[key]);
}

function samePoints(a: readonly SeriesPoint[], b: readonly SeriesPoint[]): boolean {
  return a.length === b.length && a.every((point, index) => samePoint(point, b[index]));
}

function sameLabels(a: readonly SeriesPoint[], b: readonly SeriesPoint[]): boolean {
  return a.length === b.length && a.every((point, index) => labelOf(point) === labelOf(b[index]));
}

/** A layer carrying other points, in the shape its type keeps them. */
function withPoints(layer: MaidrLayer, points: SeriesPoint[]): MaidrLayer {
  return { ...layer, data: layer.type === TraceType.LINE ? [points] : points } as MaidrLayer;
}

/**
 * What changed between two readings, as appends where every layer that
 * changed grew by one new bar at its end.
 *
 * A layer that grew by one bar is an append even when the bar before it was
 * revised too, as a feed does when it closes one bar and opens the next in
 * the same message; the revision then goes into {@link AppendPlan.base}, set
 * silently first, so the new bar is still the one announced.
 *
 * @param before - The reading MAIDR's figure holds
 * @param after - The chart as it is now
 * @returns The plan; `null` when no layer grew by one bar and something else
 * changed -- a revised bar alone, a reload, a series added -- and the figure
 * is to be replaced
 */
export function planAppends(before: LightweightChartsReading, after: LightweightChartsReading): AppendPlan | null {
  if (before.series.length !== after.series.length) {
    return null;
  }
  const appends: Append[] = [];
  let revised = false;
  // Each layer as MAIDR should hold it before the appends: the bars it had,
  // with the values they have now.
  const baseLayers = new Map<string, SeriesPoint[]>();
  for (let index = 0; index < after.series.length; index++) {
    const old = before.series[index];
    const next = after.series[index];
    if (old.layerId !== next.layerId || old.subplotRow !== next.subplotRow || old.kind !== next.kind) {
      return null;
    }
    if (next.total === old.total) {
      if (!samePoints(old.points, next.points)) {
        revised = true;
        baseLayers.set(next.layerId, next.points);
      }
      continue;
    }
    if (next.total !== old.total + 1) {
      return null;
    }
    // The bars before the new one are the old bars, less any the window drops.
    const kept = next.points.length - 1;
    const start = old.points.length - kept;
    if (start < 0 || !sameLabels(old.points.slice(start), next.points.slice(0, kept))) {
      return null;
    }
    if (!samePoints(old.points.slice(start), next.points.slice(0, kept))) {
      revised = true;
      // The bars the window is about to drop stay, so the append trims them
      // and moves the reader's cursor with the data, as any append does.
      baseLayers.set(next.layerId, [...old.points.slice(0, start), ...next.points.slice(0, kept)]);
    }
    appends.push({ reading: next, point: next.points[kept] });
  }

  if (appends.length === 0) {
    return revised ? null : { appends, base: null };
  }
  if (!revised) {
    return { appends, base: null };
  }
  const base: Maidr = {
    ...before.maidr,
    subplots: before.maidr.subplots.map(row => row.map(subplot => ({
      ...subplot,
      layers: subplot.layers.map((layer) => {
        const points = baseLayers.get(layer.id);
        return points === undefined ? layer : withPoints(layer, points);
      }),
    }))),
  };
  return { appends, base };
}
