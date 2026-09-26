/**
 * Reads a live uPlot instance into the MAIDR schema.
 *
 * uPlot keeps its data columnar -- `u.data` is `[xs, ys1, ys2, ...]` in the
 * default aligned mode -- and draws every series through an opaque `paths`
 * function, so what a series *is* (line, bars, points) is not written down
 * anywhere on it. What is written down is the path cache uPlot leaves on the
 * series after drawing it, and its builders leave distinguishable ones; see
 * {@link inferSeriesKind}.
 *
 * Series are read into layers of one subplot:
 * - line series (linear, stepped, spline, filled) that share a y scale become
 *   one `line` layer with a row per series, so the reader moves between them
 *   with the up and down arrows as they would in any multi-line chart;
 * - each bar series becomes a `bar` layer;
 * - each points-only series becomes a `scatter` layer, as does every series of
 *   a faceted (`mode: 2`) chart, whose data is a cloud rather than a row.
 */

import type {
  AxisConfig,
  AxisFormat,
  BarPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  ScatterPoint,
} from '../../type/grammar';
import type {
  MaidrUPlotOptions,
  UPlotInstance,
  UPlotSeries,
  UPlotSeriesKind,
  UPlotSeriesMaidrOptions,
} from './types';
import { Orientation, TraceType } from '../../type/grammar';

/**
 * Where each MAIDR layer's marks came from, so a navigation position can be
 * turned back into a uPlot series and data index.
 */
export interface UPlotLayerSource {
  kind: UPlotSeriesKind;
  /** `u.series` index of each MAIDR row (one row except for a line layer). */
  seriesIdxs: number[];
  /**
   * `sourceIdxs[row][col]` is the index into the series' data columns that
   * the MAIDR point at `(row, col)` was read from. For a scatter layer there
   * is one row, indexed by the layer's `data` index.
   */
  sourceIdxs: number[][];
  /** The scale the x values are drawn against. */
  xScale: string;
  /** The scale the y values are drawn against. */
  yScale: string;
}

/** The result of reading a uPlot instance. */
export interface UPlotExtraction {
  /** The figure, without an `onNavigate` callback. */
  maidr: Maidr;
  /** Layer id -> where its marks came from. */
  sources: Map<string, UPlotLayerSource>;
}

/** Path cache flags uPlot's own builders leave; see {@link inferSeriesKind}. */
const BARS_FLAGS = 0;
const POINTS_FLAGS = 3;

/** Timestamps below this read as seconds, above it as milliseconds. */
const SECONDS_CEILING = 1e11;

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/**
 * Reads a uPlot instance into a MAIDR figure.
 *
 * @param u - The uPlot instance, after it has drawn (`ready`)
 * @param id - The MAIDR chart id
 * @param options - Adapter options
 * @returns The figure and each layer's source series. A chart with no data
 *   yet -- a dashboard that fills on its first poll -- reads as a subplot with
 *   no layers, which MAIDR announces as empty until data arrives.
 */
export function extractUPlotData(
  u: UPlotInstance,
  id: string,
  options: MaidrUPlotOptions = {},
): UPlotExtraction {
  const faceted = (u.mode ?? 1) === 2;
  const built = faceted ? readFaceted(u, options) : readAligned(u, options);

  const title = options.title ?? readTitle(u);
  const maidr: Maidr = {
    id,
    ...(title ? { title } : {}),
    ...(options.subtitle ? { subtitle: options.subtitle } : {}),
    ...(options.caption ? { caption: options.caption } : {}),
    ...(options.live === false ? {} : { live: true }),
    subplots: [[{ layers: built.layers }]],
  };
  return { maidr, sources: built.sources };
}

interface BuiltLayers {
  layers: MaidrLayer[];
  sources: Map<string, UPlotLayerSource>;
}

// ---------------------------------------------------------------------------
// Aligned mode: [xs, ys1, ys2, ...]
// ---------------------------------------------------------------------------

function readAligned(u: UPlotInstance, options: MaidrUPlotOptions): BuiltLayers {
  const data = u.data as ReadonlyArray<ArrayLike<number | null | undefined> | undefined>;
  const xs = data[0];
  const layers: MaidrLayer[] = [];
  const sources = new Map<string, UPlotLayerSource>();
  if (!xs || xs.length === 0) {
    return { layers, sources };
  }

  const xScale = u.series[0]?.scale ?? 'x';
  const toX = xReader(u, xScale, Array.from(xs, v => toFinite(v)), options);
  const horizontal = u.scales[xScale]?.ori === 1;

  // Line series are gathered per y scale and emitted where the first of them
  // sat, so layer order follows series order.
  const lineGroups = new Map<string, { layer: MaidrLayer; source: UPlotLayerSource }>();

  for (let i = 1; i < u.series.length; i++) {
    const series = u.series[i];
    const ys = data[i];
    const kind = resolveKind(u, i, options);
    if (!series || !ys || kind === null) {
      continue;
    }
    const yScale = series.scale ?? 'y';
    const name = seriesName(series, i);

    if (kind === 'line') {
      let group = lineGroups.get(yScale);
      if (!group) {
        const layerId = `line-${yScale}`;
        group = {
          layer: {
            id: layerId,
            type: TraceType.LINE,
            axes: layerAxes(u, toX.axis, yScale, series, options),
            data: [] as LinePoint[][],
          },
          source: { kind, seriesIdxs: [], sourceIdxs: [], xScale, yScale },
        };
        lineGroups.set(yScale, group);
        layers.push(group.layer);
        sources.set(layerId, group.source);
      } else {
        // A second series on the scale: the axis names the scale, not either
        // series, unless the author labelled the axis.
        group.layer.axes = layerAxes(u, toX.axis, yScale, null, options);
      }
      const row: LinePoint[] = [];
      const idxs: number[] = [];
      for (let k = 0; k < xs.length; k++) {
        const x = toX.value(k);
        if (x === null) {
          continue;
        }
        row.push({ x, y: toFinite(ys[k]), z: name });
        idxs.push(k);
      }
      (group.layer.data as LinePoint[][]).push(row);
      group.source.seriesIdxs.push(i);
      group.source.sourceIdxs.push(idxs);
      continue;
    }

    const points: (BarPoint | ScatterPoint)[] = [];
    const idxs: number[] = [];
    for (let k = 0; k < xs.length; k++) {
      const x = toX.value(k);
      const y = toFinite(ys[k]);
      if (x === null || y === null) {
        continue;
      }
      if (kind === 'bar') {
        points.push(horizontal ? { x: y, y: x } : { x, y });
      } else {
        points.push({ x, y });
      }
      idxs.push(k);
    }
    // A series with no readings in the window -- a host that stopped
    // reporting -- has nothing to navigate; its layer returns with its data.
    if (points.length === 0) {
      continue;
    }
    const layerId = `${kind}-${i}`;
    const axes = layerAxes(u, toX.axis, yScale, series, options);
    layers.push({
      id: layerId,
      type: kind === 'bar' ? TraceType.BAR : TraceType.SCATTER,
      title: name,
      ...(kind === 'bar' && horizontal ? { orientation: Orientation.HORIZONTAL } : {}),
      axes: kind === 'bar' && horizontal ? { x: axes.y, y: axes.x } : axes,
      data: points as BarPoint[] | ScatterPoint[],
    });
    sources.set(layerId, { kind, seriesIdxs: [i], sourceIdxs: [idxs], xScale, yScale });
  }

  return { layers, sources };
}

// ---------------------------------------------------------------------------
// Faceted mode: [null, [xs, ys], [xs, ys], ...]
// ---------------------------------------------------------------------------

function readFaceted(u: UPlotInstance, options: MaidrUPlotOptions): BuiltLayers {
  const data = u.data as ReadonlyArray<ReadonlyArray<ArrayLike<number | null | undefined>> | null | undefined>;
  const layers: MaidrLayer[] = [];
  const sources = new Map<string, UPlotLayerSource>();

  for (let i = 1; i < u.series.length; i++) {
    const series = u.series[i];
    const columns = data[i];
    if (!series || !columns || isExcluded(series, i, options)) {
      continue;
    }
    const xs = columns[0];
    const ys = columns[1];
    if (!xs || !ys) {
      continue;
    }
    const xScale = series.facets?.[0]?.scale ?? 'x';
    const yScale = series.facets?.[1]?.scale ?? 'y';
    const toX = xReader(u, xScale, Array.from(xs, v => toFinite(v)), options);
    const name = seriesName(series, i);

    const points: ScatterPoint[] = [];
    const idxs: number[] = [];
    for (let k = 0; k < xs.length; k++) {
      const x = toX.value(k);
      const y = toFinite(ys[k]);
      if (x === null || y === null) {
        continue;
      }
      points.push({ x, y });
      idxs.push(k);
    }
    if (points.length === 0) {
      continue;
    }
    const layerId = `scatter-${i}`;
    layers.push({
      id: layerId,
      type: TraceType.SCATTER,
      title: name,
      axes: layerAxes(u, toX.axis, yScale, series, options, xScale),
      data: points,
    });
    sources.set(layerId, { kind: 'scatter', seriesIdxs: [i], sourceIdxs: [idxs], xScale, yScale });
  }

  return { layers, sources };
}

// ---------------------------------------------------------------------------
// Series kind
// ---------------------------------------------------------------------------

/**
 * The per-series options for series `i`: the adapter option wins over a
 * `maidr` key on the series itself.
 */
function seriesOptions(series: UPlotSeries, i: number, options: MaidrUPlotOptions): UPlotSeriesMaidrOptions | false {
  const fromOptions = options.series?.[i];
  if (fromOptions) {
    return fromOptions;
  }
  if (series.maidr === false) {
    return false;
  }
  return typeof series.maidr === 'object' && series.maidr !== null ? series.maidr : {};
}

function isExcluded(series: UPlotSeries, i: number, options: MaidrUPlotOptions): boolean {
  const own = seriesOptions(series, i, options);
  return own === false || own.exclude === true;
}

/**
 * What series `i` of an aligned chart is read as, or `null` to leave it out.
 */
function resolveKind(u: UPlotInstance, i: number, options: MaidrUPlotOptions): UPlotSeriesKind | null {
  const series = u.series[i];
  if (!series) {
    return null;
  }
  const own = seriesOptions(series, i, options);
  if (own === false || own.exclude === true) {
    return null;
  }
  return own.kind ?? inferSeriesKind(u, series);
}

/**
 * The kind each series was last seen drawing. uPlot clears every path cache
 * in `setData` and rebuilds it only for the series it shows, so without this
 * a bar series hidden from the legend would be re-read as a line on the next
 * update, and its layer would change type under the reader.
 */
const seenKinds = new WeakMap<UPlotSeries, UPlotSeriesKind>();

/**
 * Infers what a series draws from the path cache uPlot left on it.
 *
 * uPlot's builders each return a path object whose `flags` say how a band
 * fill is clipped against it, and they differ in exactly the way needed:
 * `uPlot.paths.bars` leaves `0`, `uPlot.paths.points` leaves `3`, and the
 * linear, stepped and spline builders leave `1`. A series whose `paths`
 * returns nothing -- the documented way to draw points only -- leaves `null`.
 *
 * The cache exists only once the series has been drawn, so a series that is
 * hidden, or a chart that has not drawn yet, reads as a line: the default a
 * uPlot series is drawn as.
 *
 * @param u - The instance
 * @param series - One of its y series
 * @returns The inferred kind
 */
export function inferSeriesKind(u: UPlotInstance, series: UPlotSeries): UPlotSeriesKind {
  const drawn = u.status === 1 && series.show !== false;
  const cache = series._paths;
  if (!drawn || cache === undefined) {
    // Hidden from the legend, or not drawn since the last `setData` cleared
    // the cache: what it was last seen drawing still stands.
    return seenKinds.get(series) ?? 'line';
  }
  let kind: UPlotSeriesKind = 'line';
  if (cache === null || cache.flags === POINTS_FLAGS) {
    kind = 'scatter';
  } else if (cache.flags === BARS_FLAGS) {
    kind = 'bar';
  }
  seenKinds.set(series, kind);
  return kind;
}

// ---------------------------------------------------------------------------
// X values
// ---------------------------------------------------------------------------

interface XReader {
  /** The MAIDR x value of data index `k`, or `null` where it has none. */
  value: (k: number) => number | null;
  /** The x axis config, with a date format on a time scale. */
  axis: AxisConfig;
}

/**
 * Reads x values, converting timestamps to milliseconds on a time scale so
 * MAIDR's date formatter can announce them.
 */
function xReader(
  u: UPlotInstance,
  xScale: string,
  xs: readonly (number | null)[],
  options: MaidrUPlotOptions,
): XReader {
  const time = u.scales[xScale]?.time === true && (u.mode ?? 1) !== 2;
  const label = options.xLabel ?? axisLabel(u, xScale) ?? authoredLabel(u.series[0]?.label, time) ?? (time ? 'Time' : 'X');
  if (!time) {
    return { value: k => xs[k] ?? null, axis: { label } };
  }
  const scale = options.msPerUnit ?? msPerUnit(xs);
  const ms = xs.map(v => (v === null ? null : v * scale));
  return {
    value: k => ms[k] ?? null,
    axis: { label, format: timeFormat(ms) },
  };
}

/**
 * uPlot's time scale defaults to seconds (`ms: 1e-3` in its options) and the
 * instance does not keep the setting, so the unit is read off the values: a
 * timestamp in seconds stays below 1e11 until the year 5138, while one in
 * milliseconds passes it in 1973.
 */
function msPerUnit(xs: readonly (number | null)[]): number {
  let largest = 0;
  for (const v of xs) {
    if (v !== null && Math.abs(v) > largest) {
      largest = Math.abs(v);
    }
  }
  return largest >= SECONDS_CEILING ? 1 : 1000;
}

/**
 * A date format fine enough to tell neighbouring points apart: a day-level
 * series announces dates, a minute-level one times of day, a finer one seconds.
 */
function timeFormat(ms: readonly (number | null)[]): AxisFormat {
  let step = Number.POSITIVE_INFINITY;
  let previous: number | null = null;
  for (const v of ms) {
    if (v === null) {
      continue;
    }
    if (previous !== null && v !== previous) {
      step = Math.min(step, Math.abs(v - previous));
    }
    previous = v;
  }
  if (step >= DAY_MS) {
    return { type: 'date', dateOptions: { year: 'numeric', month: 'short', day: 'numeric' } };
  }
  if (step >= MINUTE_MS) {
    return { type: 'date', dateOptions: { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } };
  }
  return { type: 'date', dateOptions: { hour: 'numeric', minute: '2-digit', second: '2-digit' } };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

function layerAxes(
  u: UPlotInstance,
  x: AxisConfig,
  yScale: string,
  series: UPlotSeries | null,
  options: MaidrUPlotOptions,
  xScale?: string,
): { x: AxisConfig; y: AxisConfig } {
  const xAxis = xScale === undefined ? x : { ...x, label: options.xLabel ?? axisLabel(u, xScale) ?? x.label };
  const yLabel = options.yLabel
    ?? axisLabel(u, yScale)
    ?? (series ? authoredLabel(series.label, false) : undefined)
    ?? 'Value';
  return { x: xAxis, y: { label: yLabel } };
}

/** The label of the first axis drawn against `scale`, when it has one. */
function axisLabel(u: UPlotInstance, scale: string): string | undefined {
  for (const axis of u.axes) {
    if (axis.scale === scale) {
      const label = stringLabel(axis.label);
      if (label) {
        return label;
      }
    }
  }
  return undefined;
}

function seriesName(series: UPlotSeries, i: number): string {
  return authoredLabel(series.label, false) ?? `Series ${i}`;
}

/**
 * A series label the author wrote. uPlot fills an unlabelled series in with
 * 'Value' ('Time' for the x series of a time scale), so taken at face value
 * every unlabelled series and axis would be announced by the same word and a
 * reader moving between two lines could not tell them apart.
 */
function authoredLabel(label: unknown, time: boolean): string | undefined {
  const text = stringLabel(label);
  return text === 'Value' || (time && text === 'Time') ? undefined : text;
}

function stringLabel(label: unknown): string | undefined {
  if (typeof label !== 'string') {
    return undefined;
  }
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** uPlot writes its `title` option into a `.u-title` div and keeps it nowhere else. */
function readTitle(u: UPlotInstance): string | undefined {
  const text = u.root.querySelector('.u-title')?.textContent ?? '';
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toFinite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
