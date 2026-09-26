import type {
  BarPoint,
  LinePoint,
  Maidr as MaidrData,
  MaidrLayer,
  MaidrSubplot,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  StepDirection,
} from '@type/grammar';
import type { ReactElement, ReactNode } from 'react';
import type { MuiAxisConfig, MuiChartKind, MuiChartProps, MuiSeriesConfig } from './types';
import { isAngle, pieGeometry } from '@adapters/shared/pieGeometry';
import { Orientation, TraceType } from '@type/grammar';
import { Children, cloneElement, isValidElement } from 'react';
import {
  barCellSelector,
  barSeriesSelector,
  lineSeriesSelector,
  pieSeriesSelector,
  scatterSeriesSelector,
} from './selectors';

/**
 * The MUI X chart element found among a wrapper's children, with the kind its
 * component name gives when the name survived the build.
 */
export interface MuiChartElement {
  props: MuiChartProps;
  /** `undefined` when the component's name does not say which chart it is. */
  kind?: MuiChartKind;
}

/**
 * The chart kind a component name says, `BarChart` and its `Pro` and
 * `Premium` variants alike.
 */
const KIND_BY_NAME: Record<string, MuiChartKind> = {
  BarChart: 'bar',
  LineChart: 'line',
  ScatterChart: 'scatter',
  PieChart: 'pie',
};

/** Messages already written to the console, so a re-render does not repeat them. */
const warned = new Set<string>();

/**
 * Warns once per page about something the adapter cannot read faithfully.
 *
 * @param message - What is lost and what to do about it
 */
export function warnOnce(message: string): void {
  if (warned.has(message))
    return;
  warned.add(message);
  console.warn(`[MAIDR] MUI X Charts: ${message}`);
}

/**
 * Reads the chart kind off a React element's component, if its name says.
 *
 * MUI declares each chart as `React.forwardRef(function BarChart(...))`, so
 * the name lives on the forwardRef object's `render` function, and on
 * `displayName` in development builds. A consumer's minifier may rename the
 * function; the kind then comes from the rendered SVG instead.
 */
function kindFromType(type: unknown): MuiChartKind | undefined {
  if (type === null || (typeof type !== 'object' && typeof type !== 'function'))
    return undefined;
  const obj = type as { displayName?: unknown; name?: unknown; render?: { displayName?: unknown; name?: unknown } };
  const names = [obj.displayName, obj.name, obj.render?.displayName, obj.render?.name];
  for (const name of names) {
    if (typeof name !== 'string')
      continue;
    const base = name.replace(/(Pro|Premium)$/, '');
    if (base in KIND_BY_NAME)
      return KIND_BY_NAME[base];
  }
  return undefined;
}

/**
 * Finds the MUI X chart element in `children`: the first element, searched
 * depth-first through plain wrapper elements, that was given a `series` array.
 *
 * @param children - The wrapper component's children
 * @returns The chart's props and, when its name says, its kind
 */
export function findMuiChartElement(children: ReactNode): MuiChartElement | undefined {
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child))
      continue;
    const element = child as ReactElement<Record<string, unknown>>;
    const props = element.props ?? {};
    if (Array.isArray(props.series))
      return { props: props as MuiChartProps, kind: kindFromType(element.type) };
    if (props.children !== undefined) {
      const nested = findMuiChartElement(props.children as ReactNode);
      if (nested)
        return nested;
    }
  }
  return undefined;
}

/**
 * `children` with MUI X's own keyboard navigation turned off on the chart
 * element, unless the consumer set `disableKeyboardNavigation` themselves.
 *
 * MUI X v9 makes every chart a tab stop that moves its own focus ring and
 * speaks its own announcements on the arrow keys. Inside MAIDR's plot that is
 * a second, competing reading of the same chart: two tab stops, and the arrow
 * keys driving both. MAIDR's navigation is the one this wrapper exists for.
 *
 * @param children - The wrapper component's children
 * @returns The same tree, with the chart element cloned where needed
 */
export function withMuiKeyboardNavigationDisabled(children: ReactNode): ReactNode {
  let done = false;
  const visit = (nodes: ReactNode): ReactNode => Children.map(nodes, (child) => {
    if (done || !isValidElement(child))
      return child;
    const element = child as ReactElement<Record<string, unknown>>;
    const props = element.props ?? {};
    if (Array.isArray(props.series)) {
      done = true;
      return props.disableKeyboardNavigation === undefined
        ? cloneElement(element, { disableKeyboardNavigation: true })
        : element;
    }
    if (props.children === undefined)
      return element;
    const nested = visit(props.children as ReactNode);
    return done ? cloneElement(element, undefined, nested) : element;
  });
  const result = visit(children);
  // `Children.map` flattens a single child into a one-element array; hand a
  // single child back as it came.
  return Array.isArray(result) && !Array.isArray(children) && result.length === 1 ? result[0] : result;
}

/**
 * The id MUI gives a series, which is what it stamps on the series' marks as
 * `data-series`: the consumer's own `id`, or `auto-generated-id-<index>` where
 * the index is the series' position in the chart's `series` array.
 */
export function muiSeriesId(series: MuiSeriesConfig, index: number): string {
  return series.id !== undefined && series.id !== null ? String(series.id) : `auto-generated-id-${index}`;
}

/**
 * The name a series is announced and listed in the legend by.
 */
function seriesLabel(series: MuiSeriesConfig, index: number): string {
  const { label } = series;
  if (typeof label === 'function') {
    try {
      const text = label('legend');
      if (typeof text === 'string' && text !== '')
        return text;
    } catch {
      // A label callback that throws outside MUI's own render names nothing.
    }
  } else if (typeof label === 'string' && label !== '') {
    return label;
  }
  return `Series ${index + 1}`;
}

/**
 * A finite number, or `null` for anything MUI would leave undrawn.
 */
function toValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '')
    return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * A dataset cell as MUI reads it for a `dataKey`: a number, or nothing. MUI
 * leaves a string such as `'4'` undrawn (and warns), so it is not a reading.
 */
function datasetValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Calls a consumer's `valueGetter` on one row, reading nothing from a getter
 * that throws.
 */
function callGetter(getter: (row: never) => unknown, row: unknown): unknown {
  try {
    return getter(row as never);
  } catch {
    return undefined;
  }
}

/**
 * A bar series' values, in the order MUI's bar processor looks for them:
 * `valueGetter` over the dataset, then its `dataKey` column, then `data`.
 */
function barSeriesValues(series: MuiSeriesConfig, dataset: MuiChartProps['dataset']): (number | null)[] {
  if (series.valueGetter && Array.isArray(dataset))
    return dataset.map(row => toValue(callGetter(series.valueGetter as (row: never) => unknown, row)));
  if (series.dataKey && Array.isArray(dataset))
    return dataset.map(row => datasetValue(row?.[series.dataKey as string]));
  return Array.isArray(series.data) ? series.data.map(toValue) : [];
}

/**
 * A line series' values, in the order MUI's line processor looks for them:
 * its own `data`, then `valueGetter` over the dataset, then its `dataKey`.
 */
function lineSeriesValues(series: MuiSeriesConfig, dataset: MuiChartProps['dataset']): (number | null)[] {
  if (Array.isArray(series.data))
    return series.data.map(toValue);
  if (series.valueGetter && Array.isArray(dataset))
    return dataset.map(row => toValue(callGetter(series.valueGetter as (row: never) => unknown, row)));
  if (series.dataKey && Array.isArray(dataset))
    return dataset.map(row => datasetValue(row?.[series.dataKey as string]));
  return [];
}

/**
 * An axis' values: its own `data`, or its `dataKey` column of the dataset.
 */
function axisValues(axis: MuiAxisConfig | undefined, dataset: MuiChartProps['dataset']): readonly unknown[] | undefined {
  if (!axis)
    return undefined;
  if (Array.isArray(axis.data))
    return axis.data;
  if (axis.dataKey && Array.isArray(dataset))
    return dataset.map(row => row?.[axis.dataKey as string]);
  return undefined;
}

/** An axis bound as a number, dates included; `undefined` when not set. */
function axisBound(value: unknown): number | undefined {
  if (value instanceof Date)
    return value.getTime();
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * A `Date` in the shortest ISO form that loses nothing: the day alone when it
 * falls on a UTC midnight, the full timestamp otherwise.
 */
function formatDate(date: Date): string {
  if (Number.isNaN(date.getTime()))
    return String(date);
  const iso = date.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
}

/**
 * How a position on an axis is announced.
 *
 * The axis' own `valueFormatter` is preferred, since it is what the chart
 * prints on its ticks; numbers otherwise stay numbers so a numeric x axis
 * keeps sounding as one.
 */
function formatAxisValue(value: unknown, axis: MuiAxisConfig | undefined): string | number {
  if (axis?.valueFormatter) {
    try {
      const text = (axis.valueFormatter as (v: unknown, c: unknown) => unknown)(value, { location: 'tick' });
      if (typeof text === 'string' && text !== '')
        return text;
    } catch {
      // Fall through to the raw value: a formatter that needs MUI's own
      // context (a scale, a tick count) cannot be called outside a render.
    }
  }
  if (value instanceof Date)
    return formatDate(value);
  if (typeof value === 'number')
    return value;
  return value === null || value === undefined ? '' : String(value);
}

/** The label of an axis, if the chart set one. */
function axisLabel(axis: MuiAxisConfig | undefined): string | undefined {
  return typeof axis?.label === 'string' && axis.label !== '' ? axis.label : undefined;
}

/** The `axes` of a layer, from the chart's first x and y axis. */
function layerAxes(props: MuiChartProps): MaidrLayer['axes'] {
  const x = axisLabel(props.xAxis?.[0]);
  const y = axisLabel(props.yAxis?.[0]);
  return {
    ...(x ? { x: { label: x } } : {}),
    ...(y ? { y: { label: y } } : {}),
  };
}

/**
 * Says so when the chart draws its marks in a way the selectors cannot name.
 *
 * `renderer="svg-batch"` (and, for a scatter, `"svg-progressive"`) draws a
 * series as batched `<path>`s with no element per bar or marker, so there is
 * nothing to outline. Audio, text and braille are unaffected.
 */
function warnOnBatchRenderer(kind: MuiChartKind, props: MuiChartProps): void {
  if (props.renderer === undefined || props.renderer === 'svg-single')
    return;
  warnOnce(
    `a ${kind} chart with renderer="${props.renderer}" draws no element per mark, so MAIDR `
    + 'cannot outline the one being read. Audio, text and braille are unaffected; '
    + 'use the default renderer="svg-single" for highlighting.',
  );
}

/**
 * The layers and legend of one converted chart.
 */
export interface MuiConvertedChart {
  layers: MaidrLayer[];
  legend?: string[];
}

interface SeriesEntry {
  series: MuiSeriesConfig;
  id: string;
  label: string;
  values: (number | null)[];
}

/**
 * Series grouped by how MUI draws them together: series sharing a `stack` id
 * form one group, every other series is a group of its own. Groups keep the
 * order their first series appears in.
 */
function groupByStack(entries: SeriesEntry[]): SeriesEntry[][] {
  const groups = new Map<string, SeriesEntry[]>();
  entries.forEach((entry, index) => {
    const key = entry.series.stack !== undefined && entry.series.stack !== null
      ? `stack:${entry.series.stack}`
      : `solo:${index}`;
    const group = groups.get(key);
    if (group)
      group.push(entry);
    else
      groups.set(key, [entry]);
  });
  return [...groups.values()];
}

/**
 * Which bars of a stack group MUI draws, `[series][category]`.
 *
 * A bar with no value is never drawn. With an explicit `min`/`max` on the
 * value axis, a bar lying wholly outside it is culled as well -- MUI renders
 * no element for it -- so the grid's n-th-drawn-bar selectors must skip it
 * too. The bar spans from its stack base to base plus value; bases follow
 * MUI's default `'diverging'` offset (positives on positives, negatives on
 * negatives) or `'none'`. An `'expand'` stack is drawn in shares, which the
 * axis bounds are not written in, so it is taken as drawn.
 */
function drawnBars(group: SeriesEntry[], categories: number, valueAxis: MuiAxisConfig | undefined): boolean[][] {
  const min = axisBound(valueAxis?.min);
  const max = axisBound(valueAxis?.max);
  const offset = group.find(entry => entry.series.stackOffset !== undefined)?.series.stackOffset ?? 'diverging';
  const bounded = (min !== undefined || max !== undefined) && offset !== 'expand';
  const positive = Array.from<number>({ length: categories }).fill(0);
  const negative = Array.from<number>({ length: categories }).fill(0);

  return group.map(entry => Array.from({ length: categories }, (_, i) => {
    const value = entry.values[i];
    if (value === null || value === undefined)
      return false;
    let base: number;
    if (group.length === 1) {
      base = 0;
    } else if (offset === 'none') {
      base = positive[i];
      positive[i] += value;
    } else if (value >= 0) {
      base = positive[i];
      positive[i] += value;
    } else {
      base = negative[i];
      negative[i] += value;
    }
    if (!bounded)
      return true;
    const low = Math.min(base, base + value);
    const high = Math.max(base, base + value);
    return !((max !== undefined && low > max) || (min !== undefined && high < min));
  }));
}

/**
 * Converts a `<BarChart>`.
 *
 * - one series → `bar`
 * - several series, none stacked → `dodged_bar`
 * - series sharing a `stack` → `stacked_bar` (`stacked_normalized_bar` when
 *   the stack's `stackOffset` is `'expand'`)
 *
 * A chart mixing stacks with unstacked series, or holding two stacks, has no
 * single MAIDR equivalent; each stack group becomes its own layer.
 *
 * `layout="horizontal"` moves the categories to the y axis. The payload is
 * then written the way the core reads a horizontal bar -- `x` the magnitude,
 * `y` the category -- and MUI's axes already name the horizontal and vertical
 * axis, so their labels need no swapping.
 */
function convertBar(props: MuiChartProps, scope: string): MuiConvertedChart {
  // MUI's own rule: the chart's `layout` decides, and only when it is left
  // unset does a series' `layout` turn the chart on its side.
  const horizontal = props.layout === 'horizontal'
    || (props.layout === undefined && (props.series ?? []).some(series => series.layout === 'horizontal'));
  const xAxis = props.xAxis?.[0];
  const yAxis = props.yAxis?.[0];
  const bandAxis = horizontal ? yAxis : xAxis;
  const valueAxis = horizontal ? xAxis : yAxis;
  const entries: SeriesEntry[] = (props.series ?? []).map((series, index) => ({
    series,
    id: muiSeriesId(series, index),
    label: seriesLabel(series, index),
    values: barSeriesValues(series, props.dataset),
  }));
  const rawCategories = axisValues(bandAxis, props.dataset);
  const count = rawCategories?.length ?? Math.max(0, ...entries.map(entry => entry.values.length));
  // Without band data MUI numbers the categories from 0, and so does its axis.
  const categories = Array.from({ length: count }, (_, i) =>
    rawCategories ? formatAxisValue(rawCategories[i], bandAxis) : i);

  const orientation = horizontal ? { orientation: Orientation.HORIZONTAL } : {};
  const axes = layerAxes(props);
  const point = (category: string | number, value: number): BarPoint =>
    horizontal ? { x: value, y: category } : { x: category, y: value };

  /**
   * One series as a single-row bar layer. A bar MUI does not draw is not a
   * point, so every remaining point has exactly one rect, in order.
   */
  const barLayer = (entry: SeriesEntry, layerId: string, title?: string): MaidrLayer => {
    const [drawn] = drawnBars([entry], count, valueAxis);
    return {
      id: layerId,
      type: TraceType.BAR,
      ...(title ? { title } : {}),
      ...orientation,
      axes,
      selectors: barSeriesSelector(scope, entry.id),
      data: categories.flatMap((category, i) =>
        drawn[i] ? [point(category, entry.values[i] as number)] : []),
    };
  };

  /**
   * Several series as one grid layer. Every category keeps its cell, so the
   * rows stay aligned. A bar with no value is announced as a gap (`NaN`, which
   * the bar family reads as a missing reading) and a bar MUI did not draw has
   * a `null` selector cell, which the grammar reads as "no element here".
   */
  const gridLayer = (group: SeriesEntry[], type: TraceType, layerId: string, title?: string): MaidrLayer => {
    // Side by side, every bar starts at zero; only a stack builds on the
    // series before it.
    const drawn = type === TraceType.DODGED
      ? group.map(entry => drawnBars([entry], count, valueAxis)[0])
      : drawnBars(group, count, valueAxis);
    const data: SegmentedPoint[][] = [];
    const selectors: (string | null)[][] = [];
    group.forEach((entry, row) => {
      let position = 0;
      data.push(categories.map((category, i) =>
        ({ ...point(category, entry.values[i] ?? Number.NaN), z: entry.label })));
      selectors.push(categories.map((_, i) => {
        if (!drawn[row][i])
          return null;
        const selector = barCellSelector(scope, entry.id, position);
        position += 1;
        return selector;
      }));
    });
    return {
      id: layerId,
      type,
      ...(title ? { title } : {}),
      ...orientation,
      axes,
      selectors,
      data,
    };
  };

  const groups = groupByStack(entries);
  const legend = entries.length > 1 ? entries.map(entry => entry.label) : undefined;

  if (entries.length === 0)
    return { layers: [] };
  if (groups.every(group => group.length === 1)) {
    if (entries.length === 1)
      return { layers: [barLayer(entries[0], '0')] };
    return { layers: [gridLayer(entries, TraceType.DODGED, '0')], legend };
  }

  const titled = groups.length > 1;
  const layers = groups.map((group, index) => {
    const layerId = String(index);
    if (group.length === 1)
      return barLayer(group[0], layerId, titled ? group[0].label : undefined);
    const normalized = group.some(entry => entry.series.stackOffset === 'expand');
    const title = titled ? group.map(entry => entry.label).join(', ') : undefined;
    return gridLayer(group, normalized ? TraceType.NORMALIZED : TraceType.STACKED, layerId, title);
  });
  return { layers, legend };
}

/**
 * Where a d3 step curve jumps, in the grammar's terms: `stepAfter` holds each
 * value until the next x (`hv`), `stepBefore` jumps first (`vh`), and `step`
 * jumps halfway (`mid`). `undefined` for any curve that is not a staircase.
 */
function stepDirection(curve: string | undefined): StepDirection | undefined {
  switch (curve) {
    case 'stepAfter':
      return 'hv';
    case 'stepBefore':
      return 'vh';
    case 'step':
      return 'mid';
    default:
      return undefined;
  }
}

/**
 * Converts a `<LineChart>`.
 *
 * Plain series share one `line` layer and unstacked `area` series one `area`
 * layer; series sharing a `stack` become a `stacked_area` layer (normalised
 * when the stack's `stackOffset` is `'expand'`), whether or not they are
 * filled, since MUI draws a stacked line at the running total either way. A
 * plain series drawn with a step `curve` is a `step` layer, one per
 * direction, since its path has a corner between every two samples.
 *
 * Every series is highlighted through its line path, never its fill: the fill
 * runs down to the baseline and back, so its vertices are not the samples.
 */
function convertLine(props: MuiChartProps, scope: string): MuiConvertedChart {
  const xAxis = props.xAxis?.[0];
  const entries: SeriesEntry[] = (props.series ?? []).map((series, index) => ({
    series,
    id: muiSeriesId(series, index),
    label: seriesLabel(series, index),
    values: lineSeriesValues(series, props.dataset),
  }));
  const rawX = axisValues(xAxis, props.dataset);
  const axes = layerAxes(props);

  const points = (entry: SeriesEntry, stacked: boolean): LinePoint[] => {
    const length = rawX ? Math.min(rawX.length, entry.values.length) : entry.values.length;
    return Array.from({ length }, (_, i) => {
      const value = entry.values[i];
      return {
        x: rawX ? formatAxisValue(rawX[i], xAxis) : i,
        // A stack adds a missing value in as nothing; a lone line has a gap.
        y: stacked ? (value ?? 0) : value,
        z: entry.label,
      };
    });
  };

  interface Bucket { type: TraceType; entries: SeriesEntry[]; step?: StepDirection }
  const buckets = new Map<string, Bucket>();
  for (const entry of entries) {
    const { stack, area, stackOffset, curve } = entry.series;
    const step = stepDirection(curve);
    let key: string;
    let type: TraceType;
    if (stack !== undefined && stack !== null) {
      key = `stack:${stack}`;
      type = stackOffset === 'expand' ? TraceType.NORMALIZED_AREA : TraceType.STACKED_AREA;
    } else if (area) {
      key = 'area';
      type = TraceType.AREA;
    } else if (step) {
      key = `step:${step}`;
      type = TraceType.STEP;
    } else {
      key = 'line';
      type = TraceType.LINE;
    }
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.entries.push(entry);
      if (type === TraceType.NORMALIZED_AREA)
        bucket.type = type;
    } else {
      buckets.set(key, { type, entries: [entry], ...(type === TraceType.STEP ? { step } : {}) });
    }
  }

  const titled = buckets.size > 1;
  const layers = [...buckets.values()].map((bucket, index): MaidrLayer => {
    const stacked = bucket.type === TraceType.STACKED_AREA || bucket.type === TraceType.NORMALIZED_AREA;
    return {
      id: String(index),
      type: bucket.type,
      ...(titled ? { title: bucket.entries.map(entry => entry.label).join(', ') } : {}),
      ...(bucket.step ? { stepDirection: bucket.step } : {}),
      axes,
      selectors: bucket.entries.map(entry => lineSeriesSelector(scope, entry.id)),
      data: bucket.entries.map(entry => points(entry, stacked)),
    };
  });
  const legend = entries.length > 1 ? entries.map(entry => entry.label) : undefined;
  return { layers, legend };
}

/**
 * One scatter series' points, in the order MUI's scatter processor looks for
 * them: `valueGetter` over the dataset, then its `datasetKeys`, then `data`.
 */
function scatterRawPoints(series: MuiSeriesConfig, dataset: MuiChartProps['dataset']): { x: unknown; y: unknown }[] {
  const fromDatum = (d: unknown): { x: unknown; y: unknown } => {
    const datum = (d ?? {}) as Record<string, unknown>;
    return { x: datum.x, y: datum.y };
  };
  if (series.valueGetter && Array.isArray(dataset))
    return dataset.map(row => fromDatum(callGetter(series.valueGetter as (row: never) => unknown, row)));
  if (series.datasetKeys && Array.isArray(dataset)) {
    const { x, y } = series.datasetKeys;
    if (typeof x !== 'string' || typeof y !== 'string')
      return [];
    return dataset.map(row => ({ x: row?.[x], y: row?.[y] }));
  }
  return Array.isArray(series.data) ? (series.data as unknown[]).map(fromDatum) : [];
}

/**
 * Converts a `<ScatterChart>`: one `point` layer per series, since each
 * series is its own cloud of points.
 *
 * MUI draws no marker for a point outside an explicit axis `min`/`max`, so
 * such a point is left out: the reader hears what the chart shows, and every
 * point announced has a marker to outline.
 */
function convertScatter(props: MuiChartProps, scope: string): MuiConvertedChart {
  const axes = layerAxes(props);
  const xMin = axisBound(props.xAxis?.[0]?.min);
  const xMax = axisBound(props.xAxis?.[0]?.max);
  const yMin = axisBound(props.yAxis?.[0]?.min);
  const yMax = axisBound(props.yAxis?.[0]?.max);
  const inside = (value: number, min?: number, max?: number): boolean =>
    (min === undefined || value >= min) && (max === undefined || value <= max);
  const all = props.series ?? [];
  const titled = all.length > 1;

  const layers = all.map((series, index): MaidrLayer => {
    const data: ScatterPoint[] = scatterRawPoints(series, props.dataset).flatMap(({ x, y }) => {
      const px = toValue(x instanceof Date ? x.getTime() : x);
      const py = toValue(y instanceof Date ? y.getTime() : y);
      if (px === null || py === null || !inside(px, xMin, xMax) || !inside(py, yMin, yMax))
        return [];
      return [{ x: px, y: py }];
    });
    return {
      id: String(index),
      type: TraceType.SCATTER,
      ...(titled ? { title: seriesLabel(series, index) } : {}),
      axes,
      selectors: scatterSeriesSelector(scope, muiSeriesId(series, index)),
      data,
    };
  });
  const legend = titled ? all.map(seriesLabel) : undefined;
  return { layers, legend };
}

/**
 * The comparator MUI sorts a pie's slices with, or `null` to keep data order.
 */
function pieComparator(sorting: MuiSeriesConfig['sortingValues']): ((a: number, b: number) => number) | null {
  if (typeof sorting === 'function')
    return sorting;
  if (sorting === 'asc')
    return (a, b) => a - b;
  if (sorting === 'desc')
    return (a, b) => b - a;
  return null;
}

/**
 * Converts a `<PieChart>`: one `pie` layer per series, so a nested pie (one
 * ring per series) reads ring by ring.
 *
 * MUI measures `startAngle` and `endAngle` in degrees clockwise from 12
 * o'clock -- the grammar's own convention -- and draws from `startAngle ?? 0`
 * to `endAngle ?? 360`. An end before the start runs counterclockwise. The
 * grammar has no sweep, so a pie that does not go all the way round is laid
 * out by the reader as if it did.
 *
 * A pie with `sortingValues` draws its slices round the dial in value order
 * while its arcs stay in data order in the document. The payload is written
 * in dial order, which is what the walk, the clock positions and the pan
 * follow, and it carries no selectors: the one string a pie layer reads pairs
 * arcs in document order, which is no longer the payload's.
 */
function convertPie(props: MuiChartProps, scope: string): MuiConvertedChart {
  const all = props.series ?? [];
  const titled = all.length > 1;

  const layers = all.map((series, index): MaidrLayer => {
    const items = Array.isArray(series.data) ? (series.data as unknown[]) : [];
    let data: PiePoint[] = items.map((item, i) => {
      const datum = (item ?? {}) as Record<string, unknown>;
      let label: unknown = datum.label;
      if (typeof label === 'function') {
        try {
          label = (label as (location: string) => unknown)('legend');
        } catch {
          label = undefined;
        }
      }
      const name = typeof label === 'string' && label !== ''
        ? label
        : String(datum.id ?? `Slice ${i + 1}`);
      return { x: name, y: toValue(datum.value) ?? 0 };
    });

    const comparator = pieComparator(series.sortingValues);
    if (comparator) {
      // `Array.prototype.sort` is stable, as d3's `pie` relies on too.
      data = data
        .map((slice, i) => ({ slice, i }))
        .sort((a, b) => comparator(a.slice.y, b.slice.y) || a.i - b.i)
        .map(({ slice }) => slice);
      warnOnce(
        'a pie with sortingValues draws its slices in a different order from its arcs in the '
        + 'document, so MAIDR reads it in the drawn order without outlining the slice.',
      );
    }

    const start = isAngle(series.startAngle) ? series.startAngle : 0;
    const end = isAngle(series.endAngle) ? series.endAngle : 360;
    return {
      id: String(index),
      type: TraceType.PIE,
      ...(titled ? { title: seriesLabel(series, index) } : {}),
      ...pieGeometry(start, end >= start),
      // A pie has no axes to read labels off; name what the two positions
      // mean on a pie rather than let the core announce "X" and "Y".
      axes: { x: { label: 'Category' }, y: { label: 'Value' } },
      ...(comparator ? {} : { selectors: pieSeriesSelector(scope, muiSeriesId(series, index)) }),
      data,
    };
  });
  return { layers };
}

/**
 * Converts the props of one MUI X chart into MAIDR layers.
 *
 * A chart whose series declare a `type` other than `kind` -- the composition
 * API (`<ChartsContainer>` with bar and line plots together) -- is not read:
 * each series would be taken for the wrong mark. It converts to no layers,
 * with a console warning, rather than to a misleading reading.
 *
 * @param kind - Which chart the props belong to
 * @param props - The props the chart element was given
 * @param scope - Selector prefix naming the chart's container, e.g.
 *                `"#chart "` (trailing space included), or `""` for none
 * @returns The layers and, for multi-series charts, the legend
 */
export function convertMuiChart(kind: MuiChartKind, props: MuiChartProps, scope: string): MuiConvertedChart {
  const mixed = (props.series ?? []).some(series => series.type !== undefined && series.type !== kind);
  if (mixed) {
    warnOnce(
      'a chart whose series mix types (the ChartsContainer composition API) is not supported yet; '
      + 'it is left unread.',
    );
    return { layers: [] };
  }
  warnOnBatchRenderer(kind, props);
  switch (kind) {
    case 'bar':
      return convertBar(props, scope);
    case 'line':
      return convertLine(props, scope);
    case 'scatter':
      return convertScatter(props, scope);
    case 'pie':
      return convertPie(props, scope);
  }
}

/**
 * Builds the complete MAIDR payload for one MUI X chart.
 *
 * @param meta - Chart id, title, subtitle and caption
 * @param kind - Which chart the props belong to, or `undefined` if unknown
 * @param props - The props the chart element was given, or `undefined`
 * @param scope - Selector prefix naming the chart's container
 * @returns MAIDR data with a single subplot
 */
export function convertMuiChartsToMaidr(
  meta: Pick<MaidrData, 'id' | 'title' | 'subtitle' | 'caption'>,
  kind: MuiChartKind | undefined,
  props: MuiChartProps | undefined,
  scope: string,
): MaidrData {
  const { id, title, subtitle, caption } = meta;
  const converted = kind && props ? convertMuiChart(kind, props, scope) : { layers: [] };
  const subplot: MaidrSubplot = { layers: converted.layers };
  if (converted.legend)
    subplot.legend = converted.legend;
  return { id, title, subtitle, caption, subplots: [[subplot]] };
}
