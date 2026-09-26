/**
 * Keeps MAIDR in step with `u.setData(...)`.
 *
 * uPlot has one way to change data -- replace all of it -- and a streaming
 * dashboard calls it for every tick, usually with the window slid along by a
 * point or two. Handing each of those to MAIDR as a full replacement would
 * keep the reading correct but silent: monitor mode (`M`) announces appended
 * points, and a replacement appends nothing.
 *
 * So each update is compared with the last one. When every series is the old
 * one with points added at the end -- and perhaps the same number dropped from
 * the front, the sliding window a streaming chart keeps -- the new points are
 * appended through the live data manager, with `maxWidth` set before each
 * append so its sliding window drops exactly what uPlot dropped from that
 * row. Anything else (a revised value, a new series, a window that shrank) is
 * a silent in-place replacement.
 */

import type { LiveDataPoint } from '../../service/liveData';
import type { Maidr, MaidrLayer } from '../../type/grammar';
import { liveDataManager } from '../../service/liveData';

/** One point to append, and where. */
export interface PlannedAppend {
  point: LiveDataPoint;
  layerId: string;
  groupIndex: number;
  /**
   * The sliding window that reproduces uPlot's trim of this row, or
   * `undefined` when the row keeps every point. Rows differ: a bar or scatter
   * row leaves out the gaps a line row keeps, so one window for the figure
   * would not fit them all.
   */
  maxWidth: number | undefined;
}

/** How to turn the previous figure into the next by appending. */
export interface StreamPlan {
  appends: PlannedAppend[];
  /** Points dropped from the front of each row, by layer id then row. */
  trims: Map<string, number[]>;
}

/** A layer's data as rows of points, whatever its trace type nests. */
function rowsOf(layer: MaidrLayer): unknown[][] | null {
  if (!Array.isArray(layer.data)) {
    return null;
  }
  const data = layer.data as unknown[];
  if (data.length > 0 && Array.isArray(data[0])) {
    return data as unknown[][];
  }
  return [data];
}

function isNested(layer: MaidrLayer): boolean {
  const data = layer.data as unknown[];
  return Array.isArray(data) && data.length > 0 && Array.isArray(data[0]);
}

function samePoint(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * How many points to drop from the front of `previous` so that what is left
 * starts `next`, or `null` when no such trim exists.
 */
function trimOf(previous: readonly unknown[], next: readonly unknown[]): number | null {
  if (previous.length === 0) {
    return 0;
  }
  if (next.length === 0) {
    return null;
  }
  const head = JSON.stringify(next[0]);
  for (let t = 0; t < previous.length; t++) {
    if (JSON.stringify(previous[t]) !== head) {
      continue;
    }
    const kept = previous.length - t;
    if (kept > next.length) {
      continue;
    }
    let matches = true;
    for (let k = 1; k < kept; k++) {
      if (!samePoint(previous[t + k], next[k])) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return t;
    }
  }
  return null;
}

/**
 * Plans the update from `previous` to `next` as appends, when it is one.
 *
 * @param previous - The figure MAIDR holds
 * @param next - The figure just read from the chart
 * @returns The appends, or `null` when the update is not a pure append (with
 *   an optional matching trim from the front) and must replace the data
 */
export function planStream(previous: Maidr, next: Maidr): StreamPlan | null {
  const before = previous.subplots.flat().flatMap(subplot => subplot.layers);
  const after = next.subplots.flat().flatMap(subplot => subplot.layers);
  if (before.length !== after.length || previous.subplots.length !== next.subplots.length) {
    return null;
  }

  interface RowPlan { layerId: string; groupIndex: number; added: unknown[]; trimmed: number; length: number }
  const rows: RowPlan[] = [];
  const trims = new Map<string, number[]>();

  for (let l = 0; l < after.length; l++) {
    const was = before[l];
    const now = after[l];
    if (was.id !== now.id || was.type !== now.type) {
      return null;
    }
    const oldRows = rowsOf(was);
    const newRows = rowsOf(now);
    if (oldRows === null || newRows === null || oldRows.length !== newRows.length) {
      return null;
    }
    // An empty nested layer reads as one row here and as none to the append
    // path, which would start a new group; leave that shape to a replacement.
    if (isNested(was) !== isNested(now)) {
      return null;
    }
    for (let r = 0; r < newRows.length; r++) {
      const trimmed = trimOf(oldRows[r], newRows[r]);
      if (trimmed === null) {
        return null;
      }
      const kept = oldRows[r].length - trimmed;
      const added = newRows[r].slice(kept);
      // A trim is reproduced by the sliding window, which only runs when a
      // point is appended.
      if (trimmed > 0 && added.length === 0) {
        return null;
      }
      rows.push({ layerId: now.id, groupIndex: r, added, trimmed, length: newRows[r].length });
      trims.set(now.id, [...(trims.get(now.id) ?? []), trimmed]);
    }
  }

  // Interleave by arrival, so each tick's points land together across series.
  const appends: PlannedAppend[] = [];
  const longest = Math.max(0, ...rows.map(row => row.added.length));
  for (let step = 0; step < longest; step++) {
    for (const row of rows) {
      const point = row.added[step];
      if (point !== undefined) {
        appends.push({
          point: point as LiveDataPoint,
          layerId: row.layerId,
          groupIndex: row.groupIndex,
          maxWidth: row.trimmed > 0 ? row.length : undefined,
        });
      }
    }
  }
  return { appends, trims };
}

/** The figure without its callback, for comparing two figures. */
function serialized(maidr: Maidr): string {
  const { onNavigate: _onNavigate, maxWidth: _maxWidth, ...rest } = maidr;
  return JSON.stringify(rest);
}

/** Sets or clears the sliding window on a figure, without notifying it. */
function withWindow(maidr: Maidr, maxWidth: number | undefined): Maidr {
  const { maxWidth: _previous, ...rest } = maidr;
  return maxWidth === undefined ? rest : { ...rest, maxWidth };
}

/** What {@link pushUpdate} did. */
export interface PushResult {
  /** Whether any point was streamed. */
  streamed: boolean;
  /**
   * Points dropped from the front of each row by a streamed update, by layer
   * id then row -- how far the reader's column moved to stay on their point.
   * Empty when nothing was streamed.
   */
  trims: Map<string, number[]>;
}

/**
 * Hands the figure just read from the chart to MAIDR: appended points are
 * streamed when the update is an append, and anything left over replaces the
 * data in place.
 *
 * @param next - The new figure, carrying the chart's `onNavigate`
 * @returns What was streamed, and how far each row slid
 */
export function pushUpdate(next: Maidr): PushResult {
  const stored = liveDataManager.getData(next.id);
  if (stored === undefined) {
    return { streamed: false, trims: new Map() };
  }
  const plan = next.live === true ? planStream(stored, next) : null;
  let streamed = false;
  if (plan !== null && plan.appends.length > 0) {
    for (const append of plan.appends) {
      const current = liveDataManager.getData(next.id);
      if (current === undefined) {
        break;
      }
      liveDataManager.updateStoredData(withWindow(current, append.maxWidth));
      streamed = liveDataManager.appendData(append.point, {
        id: next.id,
        layerId: append.layerId,
        groupIndex: append.groupIndex,
      }) || streamed;
    }
    const current = liveDataManager.getData(next.id);
    if (current !== undefined) {
      liveDataManager.updateStoredData(withWindow(current, undefined));
    }
  }
  const current = liveDataManager.getData(next.id);
  if (current === undefined || serialized(current) !== serialized(next)) {
    liveDataManager.setData(next);
  }
  // A replacement after the appends restores the position the appends left,
  // so the rows slid either way.
  return { streamed, trims: streamed && plan !== null ? plan.trims : new Map() };
}
