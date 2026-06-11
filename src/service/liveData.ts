import type { Disposable } from '@type/disposable';
import type {
  BarPoint,
  BoxPoint,
  CandlestickPoint,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  ScatterPoint,
  SegmentedPoint,
  SmoothPoint,
  ViolinKdePoint,
} from '@type/grammar';
import { TraceType } from '@type/grammar';

/**
 * Trace types whose layer data is a nested array of groups
 * (`LiveDataPoint[][]`) rather than a flat point array. Used so appending
 * works even when the outer array starts empty (no shape to inspect).
 */
const NESTED_DATA_TYPES: ReadonlySet<TraceType> = new Set([
  TraceType.LINE,
  TraceType.SMOOTH,
  TraceType.STACKED,
  TraceType.DODGED,
  TraceType.NORMALIZED,
  TraceType.VIOLIN_KDE,
]);

/**
 * A single data point that can be appended to a live chart layer.
 */
export type LiveDataPoint
  = | BarPoint
    | BoxPoint
    | CandlestickPoint
    | HistogramPoint
    | LinePoint
    | ScatterPoint
    | SegmentedPoint
    | SmoothPoint
    | ViolinKdePoint;

/**
 * Options identifying the target layer (and group) for an appended data point.
 */
export interface AppendDataOptions {
  /** Row of the target subplot in the subplot grid. Defaults to 0. */
  subplotRow?: number;
  /** Column of the target subplot in the subplot grid. Defaults to 0. */
  subplotCol?: number;
  /** Id of the target layer. Takes precedence over `layerIndex`. */
  layerId?: string;
  /** Index of the target layer within the subplot. Defaults to 0. */
  layerIndex?: number;
  /** Group (series) index for nested data such as multiline charts. Defaults to 0. */
  groupIndex?: number;
}

/**
 * Location of a newly appended data point, expressed in trace coordinates
 * (`row` = group/series index, `col` = point index within the group).
 */
export interface AppendedPointInfo {
  subplotRow: number;
  subplotCol: number;
  layerIndex: number;
  layerId: string;
  row: number;
  col: number;
  /** Number of points dropped from the front by the `maxWidth` sliding window. */
  trimmed: number;
}

/**
 * Event delivered to a registered chart instance when its data changes.
 */
export interface LiveDataEvent {
  /** The complete updated Maidr config. */
  maidr: Maidr;
  /** Present for `appendData` updates; identifies the new point. */
  appended?: AppendedPointInfo;
}

type LiveDataListener = (event: LiveDataEvent) => void;

/**
 * Result of merging an appended point into a Maidr config.
 */
export interface AppendResult {
  maidr: Maidr;
  appended: AppendedPointInfo;
}

/**
 * Creates a deep copy of a Maidr config that is safe to hand to the model
 * layer (which takes ownership of, and may mutate, the data arrays).
 *
 * `structuredClone` cannot clone functions, so the optional `onNavigate`
 * callback is peeled off, the serializable payload is cloned, and the
 * callback is re-attached.
 *
 * @param maidr - The Maidr config to clone
 * @returns A deep copy sharing only the `onNavigate` function reference
 */
export function cloneMaidrData(maidr: Maidr): Maidr {
  const { onNavigate, ...serializable } = maidr;
  const clone: Maidr = structuredClone(serializable);
  if (onNavigate) {
    clone.onNavigate = onNavigate;
  }
  return clone;
}

/**
 * Trims an array to the sliding window size, dropping the oldest entries.
 *
 * @param points - The points array (newest entry last)
 * @param maxWidth - Maximum number of points to keep; ignored when unset or non-positive
 * @returns The (possibly trimmed) array and the number of dropped points
 */
function applySlidingWindow<T>(
  points: T[],
  maxWidth?: number,
): { points: T[]; trimmed: number } {
  if (!maxWidth || maxWidth <= 0 || points.length <= maxWidth) {
    return { points, trimmed: 0 };
  }
  const trimmed = points.length - maxWidth;
  return { points: points.slice(trimmed), trimmed };
}

/**
 * Immutably appends a data point to a layer of a Maidr config.
 *
 * Supports flat point arrays (bar, histogram, scatter, candlestick, box) and
 * nested group arrays (line, smooth, segmented, violin) via `groupIndex`.
 * For nested layers, a `groupIndex` equal to the current group count creates
 * a new group, which also makes appending into an initially empty layer
 * (`data: []`) work. Heatmap layers (object data) are not supported.
 *
 * The returned config shares all untouched structures with the input; the
 * input is never mutated.
 *
 * @param maidr - The current Maidr config
 * @param point - The data point to append
 * @param options - Target subplot/layer/group; all default to the first
 * @returns The updated config and appended-point info, or `null` when the
 *          target cannot be resolved or the layer shape is unsupported
 */
export function appendPointToMaidr(
  maidr: Maidr,
  point: LiveDataPoint,
  options: AppendDataOptions = {},
): AppendResult | null {
  const subplotRow = options.subplotRow ?? 0;
  const subplotCol = options.subplotCol ?? 0;
  const subplot = maidr.subplots[subplotRow]?.[subplotCol];
  if (!subplot) {
    console.warn(`[maidr] appendData: no subplot at (${subplotRow}, ${subplotCol})`);
    return null;
  }

  const layerIndex = options.layerId !== undefined
    ? subplot.layers.findIndex(layer => layer.id === options.layerId)
    : options.layerIndex ?? 0;
  const layer = subplot.layers[layerIndex];
  if (!layer) {
    console.warn(`[maidr] appendData: no layer for ${options.layerId ?? `index ${layerIndex}`}`);
    return null;
  }

  if (!Array.isArray(layer.data)) {
    console.warn(`[maidr] appendData: layer type "${layer.type}" does not support appending`);
    return null;
  }

  let newData: MaidrLayer['data'];
  let row: number;
  let col: number;
  let trimmed: number;

  // Nested layers are detected by trace type so that an initially empty
  // outer array (`data: []`) still gets the correct `LiveDataPoint[][]`
  // shape; the data-shape check covers any remaining cases.
  const isNested = NESTED_DATA_TYPES.has(layer.type) || Array.isArray(layer.data[0]);

  if (isNested) {
    // Nested group data (e.g. multiline): append within the target group.
    // A groupIndex equal to the group count starts a new group.
    const groups = layer.data as LiveDataPoint[][];
    const groupIndex = options.groupIndex ?? 0;
    if (groupIndex < 0 || groupIndex > groups.length) {
      console.warn(`[maidr] appendData: no group at index ${groupIndex}`);
      return null;
    }
    const isNewGroup = groupIndex === groups.length;
    const targetGroup = isNewGroup ? [] : groups[groupIndex];
    const result = applySlidingWindow([...targetGroup, point], maidr.maxWidth);
    newData = (
      isNewGroup
        ? [...groups, result.points]
        : groups.map((group, i) => (i === groupIndex ? result.points : group))
    ) as MaidrLayer['data'];
    row = groupIndex;
    col = result.points.length - 1;
    trimmed = result.trimmed;
  } else {
    // Flat point data (e.g. bar, scatter): traces store these as a single row.
    const points = layer.data as LiveDataPoint[];
    const result = applySlidingWindow([...points, point], maidr.maxWidth);
    newData = result.points as MaidrLayer['data'];
    row = 0;
    col = result.points.length - 1;
    trimmed = result.trimmed;
  }

  const newMaidr: Maidr = {
    ...maidr,
    subplots: maidr.subplots.map((rowOfSubplots, r) =>
      r !== subplotRow
        ? rowOfSubplots
        : rowOfSubplots.map((sp, c) =>
            c !== subplotCol
              ? sp
              : {
                  ...sp,
                  layers: sp.layers.map((ly, i) =>
                    i !== layerIndex ? ly : { ...ly, data: newData },
                  ),
                },
          )),
  };

  return {
    maidr: newMaidr,
    appended: {
      subplotRow,
      subplotCol,
      layerIndex,
      layerId: layer.id,
      row,
      col,
      trimmed,
    },
  };
}

interface LiveDataInstance {
  data: Maidr;
  listener: LiveDataListener;
}

/**
 * Global registry that routes realtime data updates to mounted chart instances.
 *
 * Each `<Maidr>` instance registers itself by chart id. External producers
 * (script-tag consumers via `window.maidrLive`, or React consumers via the
 * `data` prop) push updates through {@link setData} / {@link appendData};
 * the manager merges them and notifies the owning instance, which refreshes
 * its model in place.
 */
export class LiveDataManager {
  private readonly instances = new Map<string, LiveDataInstance>();

  /**
   * Registers a chart instance for live updates.
   *
   * @param initial - The chart's current Maidr config (keyed by `initial.id`)
   * @param listener - Invoked whenever the chart's data changes
   * @returns A disposable that unregisters the instance
   */
  public register(initial: Maidr, listener: LiveDataListener): Disposable {
    const id = initial.id;
    this.instances.set(id, { data: initial, listener });
    return {
      dispose: () => {
        // Guard against a newer registration for the same id.
        if (this.instances.get(id)?.listener === listener) {
          this.instances.delete(id);
        }
      },
    };
  }

  /**
   * Replaces all data for a registered chart and notifies it.
   *
   * @param maidr - The full replacement config; the target chart is `maidr.id`
   * @returns True when a registered chart was updated
   */
  public setData(maidr: Maidr): boolean {
    const instance = this.instances.get(maidr.id);
    if (!instance) {
      console.warn(`[maidr] setData: no live chart registered with id "${maidr.id}"`);
      return false;
    }
    instance.data = maidr;
    instance.listener({ maidr });
    return true;
  }

  /**
   * Replaces the stored data for a chart without notifying it.
   * Used to keep the registry in sync with externally-driven updates
   * (e.g. React prop changes on non-live charts).
   *
   * @param maidr - The replacement config
   */
  public updateStoredData(maidr: Maidr): void {
    const instance = this.instances.get(maidr.id);
    if (instance) {
      instance.data = maidr;
    }
  }

  /**
   * Appends a single data point to a registered chart and notifies it.
   *
   * @param point - The data point to append
   * @param options - Target chart (`id`) and layer/group; `id` may be omitted
   *                  when exactly one chart is registered
   * @returns True when the point was merged and the chart notified
   */
  public appendData(
    point: LiveDataPoint,
    options: AppendDataOptions & { id?: string } = {},
  ): boolean {
    const id = this.resolveId(options.id);
    if (id === null) {
      return false;
    }
    const instance = this.instances.get(id);
    if (!instance) {
      console.warn(`[maidr] appendData: no live chart registered with id "${id}"`);
      return false;
    }

    const result = appendPointToMaidr(instance.data, point, options);
    if (!result) {
      return false;
    }

    instance.data = result.maidr;
    instance.listener({ maidr: result.maidr, appended: result.appended });
    return true;
  }

  /**
   * Returns the current data for a registered chart.
   *
   * @param id - The chart id
   * @returns The stored Maidr config, or undefined when not registered
   */
  public getData(id: string): Maidr | undefined {
    return this.instances.get(id)?.data;
  }

  /**
   * Resolves the target chart id, defaulting to the sole registered chart.
   *
   * @param id - The explicitly requested id, if any
   * @returns The resolved id, or null when ambiguous or empty
   */
  private resolveId(id?: string): string | null {
    if (id !== undefined) {
      return id;
    }
    if (this.instances.size === 1) {
      return this.instances.keys().next().value!;
    }
    console.warn(
      `[maidr] appendData: chart id is required when ${this.instances.size} charts are registered`,
    );
    return null;
  }
}

/**
 * Shared singleton routing live data updates across all chart instances.
 *
 * Tests should construct their own `new LiveDataManager()` instead of using
 * this instance, since state registered here is shared module-wide.
 */
export const liveDataManager = new LiveDataManager();

/**
 * Replaces all data for the chart identified by `maidr.id`.
 * Convenience wrapper around {@link liveDataManager}.
 *
 * @param maidr - The full replacement config
 * @returns True when a registered chart was updated
 */
export function setMaidrData(maidr: Maidr): boolean {
  return liveDataManager.setData(maidr);
}

/**
 * Appends a single data point to a chart layer (streaming).
 * Convenience wrapper around {@link liveDataManager}.
 *
 * @param point - The data point to append
 * @param options - Target chart (`id`), layer, and group
 * @returns True when the point was merged and the chart notified
 */
export function appendMaidrData(
  point: LiveDataPoint,
  options?: AppendDataOptions & { id?: string },
): boolean {
  return liveDataManager.appendData(point, options);
}
