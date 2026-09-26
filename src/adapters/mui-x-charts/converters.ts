import type {
  BarPoint,
  LinePoint,
  Maidr as MaidrData,
  MaidrLayer,
  MaidrSubplot,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
} from '@type/grammar';
import type { ReactElement, ReactNode } from 'react';
import type { MuiAxisConfig, MuiChartKind, MuiChartProps, MuiSeriesConfig } from './types';
import { isAngle, pieGeometry } from '@adapters/shared/pieGeometry';
import { Orientation, TraceType } from '@type/grammar';
import { Children, isValidElement } from 'react';
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
 * The id MUI gives a series, which is what it stamps on the series' marks as
 * `data-series`: the consumer's own `id`, or `auto-generated-id-<index>`.
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
 * A series' values: its own `data`, or its `dataKey` column of the dataset.
 */
function seriesValues(series: MuiSeriesConfig, dataset: MuiChartProps['dataset']): readonly unknown[] {
  if (Array.isArray(series.data))
    return series.data;
  if (series.dataKey && Array.isArray(dataset))
    return dataset.map(row => row?.[series.dataKey as string]);
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

/**
 * The layers and legend of one converted chart.
 */
export interface MuiConvertedChart {
  layers: MaidrLayer[];
  legend?: string[];
}

/**
 * Series grouped by how MUI draws them together: series sharing a `stack` id
 * form one group, every other series is a group of its own. Groups keep the
 * order their first series appears in.
 */
function groupByStack<T extends { series: MuiSeriesConfig }>(entries: T[]): T[][] {
  const groups = new Map<string, T[]>();
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

interface SeriesEntry {
  series: MuiSeriesConfig;
  id: string;
  label: string;
  values: (number | null)[];
}

function seriesEntries(props: MuiChartProps): SeriesEntry[] {
  return (props.series ?? []).map((series, index) => ({
    series,
    id: muiSeriesId(series, index),
    label: seriesLabel(series, index),
    values: seriesValues(series, props.dataset).map(toValue),
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
  const horizontal = props.layout === 'horizontal'
    || (props.series ?? []).some(series => series.layout === 'horizontal');
  const xAxis = props.xAxis?.[0];
  const yAxis = props.yAxis?.[0];
  const bandAxis = horizontal ? yAxis : xAxis;
  const entries = seriesEntries(props);
  const rawCategories = axisValues(bandAxis, props.dataset);
  const count = rawCategories?.length ?? Math.max(0, ...entries.map(entry => entry.values.length));
  const categories = Array.from({ length: count }, (_, i) =>
    rawCategories ? formatAxisValue(rawCategories[i], bandAxis) : i + 1);

  const orientation = horizontal ? { orientation: Orientation.HORIZONTAL } : {};
  const axes: MaidrLayer['axes'] = {
    ...(axisLabel(xAxis) ? { x: { label: axisLabel(xAxis) } } : {}),
    ...(axisLabel(yAxis) ? { y: { label: axisLabel(yAxis) } } : {}),
  };
  const point = (category: string | number, value: number): BarPoint =>
    horizontal ? { x: value, y: category } : { x: category, y: value };

  /** One series as a single-row bar layer. A null bar is not drawn, so it is not a point. */
  const barLayer = (entry: SeriesEntry, layerId: string, title?: string): MaidrLayer => ({
    id: layerId,
    type: TraceType.BAR,
    ...(title ? { title } : {}),
    ...orientation,
    axes,
    selectors: barSeriesSelector(scope, entry.id),
    data: categories.flatMap((category, i) => {
      const value = entry.values[i];
      return value === null || value === undefined ? [] : [point(category, value)];
    }),
  });

  /**
   * Several series as one grid layer. Every category keeps its cell, so the
   * rows stay aligned; a bar MUI did not draw is announced as zero and its
   * selector cell is `null`, which the grammar reads as "no element here".
   */
  const gridLayer = (group: SeriesEntry[], type: TraceType, layerId: string, title?: string): MaidrLayer => {
    const data: SegmentedPoint[][] = [];
    const selectors: (string | null)[][] = [];
    for (const entry of group) {
      let drawn = 0;
      const row: SegmentedPoint[] = [];
      const cells: (string | null)[] = [];
      categories.forEach((category, i) => {
        const value = entry.values[i];
        row.push({ ...point(category, value ?? 0), z: entry.label });
        if (value === null || value === undefined) {
          cells.push(null);
        } else {
          cells.push(barCellSelector(scope, entry.id, drawn));
          drawn += 1;
        }
      });
      data.push(row);
      selectors.push(cells);
    }
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

  if (groups.every(group => group.length === 1)) {
    if (entries.length === 1)
      return { layers: [barLayer(entries[0], '0')] };
    if (entries.length === 0)
      return { layers: [] };
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
 * Converts a `<LineChart>`.
 *
 * Plain series share one `line` layer and unstacked `area` series one `area`
 * layer; series sharing a `stack` become a `stacked_area` layer (normalised
 * when the stack's `stackOffset` is `'expand'`), whether or not they are
 * filled, since MUI draws a stacked line at the running total either way.
 *
 * Every series is highlighted through its line path, never its fill: the fill
 * runs down to the baseline and back, so its vertices are not the samples.
 */
function convertLine(props: MuiChartProps, scope: string): MuiConvertedChart {
  const xAxis = props.xAxis?.[0];
  const yAxis = props.yAxis?.[0];
  const entries = seriesEntries(props);
  const rawX = axisValues(xAxis, props.dataset);
  const axes: MaidrLayer['axes'] = {
    ...(axisLabel(xAxis) ? { x: { label: axisLabel(xAxis) } } : {}),
    ...(axisLabel(yAxis) ? { y: { label: axisLabel(yAxis) } } : {}),
  };

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

  interface Bucket { type: TraceType; entries: SeriesEntry[] }
  const buckets = new Map<string, Bucket>();
  for (const entry of entries) {
    const { stack, area, stackOffset } = entry.series;
    let key: string;
    let type: TraceType;
    if (stack !== undefined && stack !== null) {
      key = `stack:${stack}`;
      type = stackOffset === 'expand' ? TraceType.NORMALIZED_AREA : TraceType.STACKED_AREA;
    } else if (area) {
      key = 'area';
      type = TraceType.AREA;
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
      buckets.set(key, { type, entries: [entry] });
    }
  }

  const titled = buckets.size > 1;
  const layers = [...buckets.values()].map((bucket, index): MaidrLayer => {
    const stacked = bucket.type === TraceType.STACKED_AREA || bucket.type === TraceType.NORMALIZED_AREA;
    return {
      id: String(index),
      type: bucket.type,
      ...(titled ? { title: bucket.entries.map(entry => entry.label).join(', ') } : {}),
      axes,
      selectors: bucket.entries.map(entry => lineSeriesSelector(scope, entry.id)),
      data: bucket.entries.map(entry => points(entry, stacked)),
    };
  });
  const legend = entries.length > 1 ? entries.map(entry => entry.label) : undefined;
  return { layers, legend };
}

/**
 * Converts a `<ScatterChart>`: one `point` layer per series, since each
 * series is its own cloud of points. Points are read from the series' `data`
 * (`{ x, y }` objects) or, with a `dataset`, from its `datasetKeys` columns.
 */
function convertScatter(props: MuiChartProps, scope: string): MuiConvertedChart {
  const xAxis = props.xAxis?.[0];
  const yAxis = props.yAxis?.[0];
  const axes: MaidrLayer['axes'] = {
    ...(axisLabel(xAxis) ? { x: { label: axisLabel(xAxis) } } : {}),
    ...(axisLabel(yAxis) ? { y: { label: axisLabel(yAxis) } } : {}),
  };
  const all = props.series ?? [];
  const titled = all.length > 1;

  const layers = all.map((series, index): MaidrLayer => {
    let raw: { x: unknown; y: unknown }[] = [];
    if (Array.isArray(series.data)) {
      raw = (series.data as unknown[]).map((d) => {
        const datum = (d ?? {}) as Record<string, unknown>;
        return { x: datum.x, y: datum.y };
      });
    } else if (Array.isArray(props.dataset)) {
      const xKey = series.datasetKeys?.x ?? 'x';
      const yKey = series.datasetKeys?.y ?? 'y';
      raw = props.dataset.map(row => ({ x: row?.[xKey], y: row?.[yKey] }));
    }
    const data: ScatterPoint[] = raw.flatMap(({ x, y }) => {
      const px = toValue(x instanceof Date ? x.getTime() : x);
      const py = toValue(y instanceof Date ? y.getTime() : y);
      return px === null || py === null ? [] : [{ x: px, y: py }];
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
 * Converts a `<PieChart>`: one `pie` layer per series, so a nested pie (one
 * ring per series) reads ring by ring. MUI measures `startAngle` and
 * `endAngle` in degrees clockwise from 12 o'clock -- the grammar's own
 * convention -- and sweeps 0 to 360 by default.
 */
function convertPie(props: MuiChartProps, scope: string): MuiConvertedChart {
  const all = props.series ?? [];
  const titled = all.length > 1;

  const layers = all.map((series, index): MaidrLayer => {
    const items = Array.isArray(series.data) ? (series.data as unknown[]) : [];
    const data: PiePoint[] = items.map((item, i) => {
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
    const start = isAngle(series.startAngle) ? series.startAngle : 0;
    const end = isAngle(series.endAngle) ? series.endAngle : start + 360;
    return {
      id: String(index),
      type: TraceType.PIE,
      ...(titled ? { title: seriesLabel(series, index) } : {}),
      ...pieGeometry(start, end >= start),
      // A pie has no axes to read labels off; name what the two positions
      // mean on a pie rather than let the core announce "X" and "Y".
      axes: { x: { label: 'Category' }, y: { label: 'Value' } },
      selectors: pieSeriesSelector(scope, muiSeriesId(series, index)),
      data,
    };
  });
  return { layers };
}

/**
 * Converts the props of one MUI X chart into MAIDR layers.
 *
 * @param kind - Which chart the props belong to
 * @param props - The props the chart element was given
 * @param scope - Selector prefix naming the chart's container, e.g.
 *                `"#chart "` (trailing space included), or `""` for none
 * @returns The layers and, for multi-series charts, the legend
 */
export function convertMuiChart(kind: MuiChartKind, props: MuiChartProps, scope: string): MuiConvertedChart {
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
