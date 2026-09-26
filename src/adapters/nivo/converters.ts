import type {
  AxisConfig,
  AxisFormat,
  BarPoint,
  BoxPoint,
  LinePoint,
  Maidr as MaidrData,
  MaidrLayer,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  StepDirection,
} from '@type/grammar';
import type { NivoAdapterConfig, NivoChartType, NivoLayerInfo } from './types';
import { pieGeometry } from '@adapters/shared/pieGeometry';
import { Orientation, TraceType } from '@type/grammar';
import { stampedSelectors } from './selectors';
import { timeAxisFormat, timeReader } from './time';

/** A chart's props, as read off the element. */
type Props = Readonly<Record<string, unknown>>;

/** One datum of a chart's `data`. */
type Datum = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Prop reading
// ---------------------------------------------------------------------------

/**
 * The objects in a prop that should hold an array of them.
 *
 * @param value - The prop as given
 * @returns The object entries, in order; empty when the prop is not an array
 */
function records(value: unknown): Datum[] {
  if (!Array.isArray(value))
    return [];
  return value.filter((entry): entry is Datum => entry !== null && typeof entry === 'object');
}

/**
 * lodash's `rePropName`: one key of a property path — a dotted segment, or a
 * bracketed index or quoted key (`'a[0]'`, `'a["b.c"]'`).
 */
const PATH_SEGMENT = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

/**
 * Splits a property path into its keys the way lodash's `stringToPath` does.
 *
 * @param path - The path, e.g. `'stats.values[0]'`
 * @returns The keys, in order
 */
function pathKeys(path: string): string[] {
  const keys: string[] = path.startsWith('.') ? [''] : [];
  for (const match of path.matchAll(PATH_SEGMENT)) {
    const [whole, index, quote, quoted] = match;
    keys.push(quote ? quoted.replace(/\\(\\)?/g, '$1') : (index ?? whole));
  }
  return keys;
}

/**
 * Builds a reader for an accessor prop the way Nivo's `usePropertyAccessor`
 * does: a function is called with the datum, and a string is read with
 * lodash's `get` — the whole string first, when the datum has a property of
 * that name (`'first.name'`), and otherwise as a path into it, dotted or
 * bracketed for nested fields (`'stats.value'`, `'values[0]'`).
 *
 * @param accessor - The prop as given
 * @param fallback - The path Nivo uses when the prop is omitted
 * @returns A function reading the accessed value off a datum
 */
function propertyAccessor(accessor: unknown, fallback: string): (datum: Datum) => unknown {
  if (typeof accessor === 'function')
    return datum => (accessor as (d: Datum) => unknown)(datum);
  const path = typeof accessor === 'string' ? accessor : fallback;
  const keys = pathKeys(path);
  return (datum) => {
    if (path in datum)
      return datum[path];
    let current: unknown = datum;
    for (const key of keys) {
      if (current === null || typeof current !== 'object')
        return undefined;
      current = (current as Datum)[key];
    }
    return current;
  };
}

/**
 * The `legend` of one of Nivo's axis props (`axisBottom`, `axisLeft`, ...).
 *
 * @param props - The chart's props
 * @param names - The axis props to try, in order
 * @returns The first non-empty legend, or undefined
 */
function axisLegend(props: Props, ...names: string[]): string | undefined {
  for (const name of names) {
    const axis = props[name];
    if (axis !== null && typeof axis === 'object') {
      const legend = (axis as Datum).legend;
      if (typeof legend === 'string' && legend.trim() !== '')
        return legend;
    }
  }
  return undefined;
}

/**
 * The series a chart starts with hidden, which Nivo draws no marks for.
 *
 * @param props - The chart's props
 * @returns The ids listed in `initialHiddenIds`, as strings
 */
function hiddenIds(props: Props): Set<string> {
  const ids = props.initialHiddenIds;
  return new Set(Array.isArray(ids) ? ids.map(String) : []);
}

/**
 * A category value as a label: strings and numbers as they are, anything else
 * the way Nivo's own template strings print it.
 *
 * @param value - The raw value
 * @returns The label
 */
function toLabel(value: unknown): string {
  if (value instanceof Date)
    return value.toISOString();
  return String(value);
}

/**
 * A magnitude the way Nivo coerces one (`Number(value)`), with every value
 * that is not a finite number read as a gap.
 *
 * @param value - The raw value
 * @returns The number, or NaN for a gap
 */
function toMagnitude(value: unknown): number {
  if (value === null || value === undefined || value === '')
    return Number.NaN;
  const number = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

/**
 * A position on a continuous axis: a number, a date as its timestamp, or a
 * numeric string.
 *
 * @param value - The raw value
 * @returns The coordinate, or undefined when the value is not one
 */
function toCoordinate(value: unknown): number | undefined {
  const number = toMagnitude(value);
  return Number.isNaN(number) ? undefined : number;
}

// ---------------------------------------------------------------------------
// @nivo/bar
// ---------------------------------------------------------------------------

/**
 * Converts `@nivo/bar` props.
 *
 * - One visible key is a plain bar chart, whatever `groupMode` says.
 * - Several keys stack by default — Nivo's `groupMode` defaults to
 *   `'stacked'` — and sit side by side with `groupMode="grouped"`.
 * - `layout="horizontal"` runs the bars across the page. Nivo keeps its data
 *   `indexBy = category` either way, so the payload is swapped into the
 *   arrangement the core reads a horizontal bar in (`x` the magnitude).
 *
 * Nivo's band scale draws index 0 at the left of a vertical chart and at the
 * **bottom** of a horizontal one, and has no `reverse` option (measured on
 * 0.99: `indexScale: { reverse: true }` moves no bar), which are the orders
 * the core reads a bar layer in. So the payload stays in data order.
 *
 * A bar whose value is `null` or missing is not drawn (Nivo filters it out
 * of its bars), so a single series leaves it out of the payload, and a
 * stacked or grouped series keeps the cell as a gap with no element.
 *
 * @param props - The chart's props
 * @returns The layer, or none when no key is visible
 */
function barLayers(props: Props): NivoLayerInfo[] {
  const rows = records(props.data);
  const getIndex = propertyAccessor(props.indexBy, 'id');
  const hidden = hiddenIds(props);
  const allKeys = Array.isArray(props.keys) ? props.keys.map(String) : ['value'];
  const keys = allKeys.filter(key => !hidden.has(key));
  if (keys.length === 0 || rows.length === 0)
    return [];

  const horizontal = props.layout === 'horizontal';
  const orientation = horizontal ? Orientation.HORIZONTAL : undefined;
  const categoryName = typeof props.indexBy === 'string' ? props.indexBy : 'id';
  const categoryLabel = horizontal
    ? axisLegend(props, 'axisLeft', 'axisRight')
    : axisLegend(props, 'axisBottom', 'axisTop');
  const valueLabel = horizontal
    ? axisLegend(props, 'axisBottom', 'axisTop')
    : axisLegend(props, 'axisLeft', 'axisRight');

  // The drawn axes, whichever of them holds the categories. A horizontal
  // layer reads its magnitude off `x`, and Nivo draws it along the bottom, so
  // nothing is swapped here that the payload does not swap too.
  const fallbackCategory = typeof props.indexBy === 'function' ? undefined : categoryName;
  const labels = (valueFallback?: string): Pick<NivoLayerInfo, 'xAxisLabel' | 'yAxisLabel'> => {
    const category = categoryLabel ?? fallbackCategory;
    const value = valueLabel ?? valueFallback;
    return horizontal
      ? { xAxisLabel: value, yAxisLabel: category }
      : { xAxisLabel: category, yAxisLabel: value };
  };

  const isDrawn = (value: unknown): boolean => value !== null && value !== undefined;

  if (keys.length === 1) {
    const [key] = keys;
    const points: BarPoint[] = [];
    const testIds: string[] = [];
    rows.forEach((row, index) => {
      if (!isDrawn(row[key]))
        return;
      const category = toLabel(getIndex(row));
      const value = toMagnitude(row[key]);
      points.push(horizontal ? { x: value, y: category } : { x: category, y: value });
      testIds.push(`bar.item.${key}.${index}`);
    });
    if (points.length === 0)
      return [];
    return [{
      id: '0',
      data: { kind: 'bar', points },
      ...labels(key),
      orientation,
      marks: { kind: 'bar', testIds },
    }];
  }

  // `[series][category]`, the series in the order Up walks them: from the
  // baseline or the lowest bar up. d3's stack puts the first key at the
  // baseline, and Nivo's grouped layout draws it leftmost on a vertical chart
  // — but at the **top** of each band on a horizontal one (its y is
  // `yScale(index) + barHeight * keyIndex`, and SVG y grows downwards), so a
  // grouped horizontal chart lists its keys last first.
  const grouped = props.groupMode === 'grouped';
  const series = grouped && horizontal ? [...keys].reverse() : keys;
  const points: SegmentedPoint[][] = series.map(key => rows.map((row) => {
    const category = toLabel(getIndex(row));
    const value = isDrawn(row[key]) ? toMagnitude(row[key]) : Number.NaN;
    return horizontal ? { x: value, y: category, z: key } : { x: category, y: value, z: key };
  }));
  const testIds = series.map(key => rows.map((row, index) =>
    isDrawn(row[key]) ? `bar.item.${key}.${index}` : null));

  return [{
    id: '0',
    data: grouped
      ? { kind: 'dodged', points }
      : { kind: 'stacked', points },
    ...labels(),
    orientation,
    legend: series,
    marks: { kind: 'barGrid', testIds },
  }];
}

// ---------------------------------------------------------------------------
// @nivo/line
// ---------------------------------------------------------------------------

/**
 * What each of Nivo's step curves means for the step convention. Nivo hands
 * `curve` straight to d3-shape, so these are d3's `curveStep` (risers
 * halfway), `curveStepAfter` and `curveStepBefore` — the same three names
 * Recharts uses, with the same meaning.
 */
const STEP_DIRECTIONS: Readonly<Record<string, StepDirection>> = {
  step: 'mid',
  stepAfter: 'hv',
  stepBefore: 'vh',
};

/**
 * Whether Nivo draws a marker per point: `enablePoints` is on by default, and
 * a custom `layers` list can leave the points layer out.
 *
 * @param props - The chart's props
 * @returns True when the point markers exist in the SVG
 */
function drawsPoints(props: Props): boolean {
  if (props.enablePoints === false)
    return false;
  return !Array.isArray(props.layers) || props.layers.includes('points');
}

/**
 * Converts `@nivo/line` props into one line layer, one row per series; Up
 * and Down move between the series.
 *
 * A datum with a `null` `x` or `y` is where Nivo breaks the line and draws no
 * point, so it is left out of the payload rather than announced as a
 * reading: the point markers Nivo draws are then one per payload point, which
 * is what lets the highlight name each of them.
 *
 * @param props - The chart's props
 * @returns The layer, or none when no series has a point
 */
function lineLayers(props: Props): NivoLayerInfo[] {
  const hidden = hiddenIds(props);
  // Nivo draws no series whose id is falsy (`0`, `''`): `useLine` filters its
  // series on `Boolean(id)`.
  const series = records(props.data).filter(entry => Boolean(entry.id) && !hidden.has(String(entry.id)));

  const points: LinePoint[][] = [];
  const markerIds: string[][] = [];
  for (const entry of series) {
    const name = String(entry.id);
    const defined = records(entry.data).filter(datum =>
      datum.x !== null && datum.x !== undefined && datum.y !== null && datum.y !== undefined);
    points.push(defined.map(datum => ({
      x: typeof datum.x === 'number' ? datum.x : toLabel(datum.x),
      y: toMagnitude(datum.y),
      z: name,
    })));
    // Nivo numbers a series' point markers among its drawn points only.
    markerIds.push(defined.map((_, index) => `line.point.${name}.${index}`));
  }
  if (points.every(row => row.length === 0))
    return [];

  const stepDirection = typeof props.curve === 'string' ? STEP_DIRECTIONS[props.curve] : undefined;

  return [{
    id: '0',
    data: { kind: 'line', points, stepDirection },
    xAxisLabel: axisLegend(props, 'axisBottom', 'axisTop'),
    yAxisLabel: axisLegend(props, 'axisLeft', 'axisRight'),
    legend: series.map(entry => String(entry.id)),
    marks: {
      kind: 'lines',
      points: drawsPoints(props) ? markerIds : null,
      seriesCount: series.length,
    },
  }];
}

// ---------------------------------------------------------------------------
// @nivo/scatterplot
// ---------------------------------------------------------------------------

/**
 * Converts `@nivo/scatterplot` props into one scatter layer per series, each
 * named after its series so a layer switch says which group is being read.
 *
 * Nivo draws a node for every datum of every visible series, series by
 * series, so the marks are located by that running position. A datum whose
 * `x` or `y` is not a number (or a date) cannot be placed by the scatter
 * trace and is left out of the payload; its node is skipped when tagging.
 *
 * On a time scale (`xScale: { type: 'time' }`, or `yScale`) a value is read
 * as Nivo reads it: a `Date` as is, and a string parsed with the scale's
 * `format` (`'%Y-%m-%d'`, ...) in UTC unless `useUTC` is off. It travels as
 * its timestamp, and the axis announces it as a date.
 *
 * @param props - The chart's props
 * @returns One layer per series that has a point
 */
function scatterLayers(props: Props): NivoLayerInfo[] {
  const hidden = hiddenIds(props);
  const series = records(props.data).filter(entry => !hidden.has(String(entry.id)));
  const drawn = series.reduce((sum, entry) => sum + records(entry.data).length, 0);
  const legend = series.map(entry => String(entry.id));
  const xAxisLabel = axisLegend(props, 'axisBottom', 'axisTop');
  const yAxisLabel = axisLegend(props, 'axisLeft', 'axisRight');
  const xScale = timeScale(props.xScale);
  const yScale = timeScale(props.yScale);
  const readX = xScale ? timeReader(xScale) : toCoordinate;
  const readY = yScale ? timeReader(yScale) : toCoordinate;

  const layers: NivoLayerInfo[] = [];
  let offset = 0;
  for (const entry of series) {
    const data = records(entry.data);
    const points: ScatterPoint[] = [];
    const kept: number[] = [];
    data.forEach((datum, index) => {
      const x = readX(datum.x);
      const y = readY(datum.y);
      if (x === undefined || y === undefined)
        return;
      points.push({ x, y });
      kept.push(index);
    });
    if (points.length > 0) {
      layers.push({
        id: String(layers.length),
        name: String(entry.id),
        data: { kind: 'scatter', points },
        xAxisLabel,
        yAxisLabel,
        legend,
        marks: { kind: 'nodes', drawn, offset, kept },
      });
    } else if (data.length > 0) {
      console.warn(
        `MAIDR: none of the ${data.length} points of Nivo scatter series "${String(entry.id)}" `
        + 'has an x and a y the adapter can place, so the series is left out.',
      );
    }
    offset += data.length;
  }

  const allPoints = layers.flatMap(layer => (layer.data.kind === 'scatter' ? layer.data.points : []));
  for (const layer of layers) {
    if (xScale)
      layer.xAxisFormat = timeAxisFormat(xScale, allPoints.map(point => point.x));
    if (yScale)
      layer.yAxisFormat = timeAxisFormat(yScale, allPoints.map(point => point.y));
  }
  return layers;
}

/**
 * A scale prop, when it is a time scale.
 *
 * @param scale - `xScale` or `yScale` as given
 * @returns The scale, or undefined when it is not `type: 'time'`
 */
function timeScale(scale: unknown): Datum | undefined {
  return scale !== null && typeof scale === 'object' && (scale as Datum).type === 'time'
    ? scale as Datum
    : undefined;
}

// ---------------------------------------------------------------------------
// @nivo/pie
// ---------------------------------------------------------------------------

/**
 * d3's `descending` comparator, which is what d3-shape's `pie()` sorts by
 * unless told not to — and Nivo only tells it not to when `sortByValue` is
 * off.
 *
 * @param a - One slice's value
 * @param b - Another slice's value
 * @returns The sort order
 */
function descending(a: number, b: number): number {
  if (b < a)
    return -1;
  if (b > a)
    return 1;
  return b >= a ? 0 : Number.NaN;
}

/**
 * Converts `@nivo/pie` props.
 *
 * Nivo hands `startAngle` and `endAngle` to d3-shape's `pie()`, whose angles
 * are the grammar's own — degrees clockwise from 12 o'clock — so the start
 * carries over unchanged, and an `endAngle` short of the start draws the ring
 * counterclockwise. `innerRadius` makes a doughnut, which is the same layer.
 *
 * `sortByValue` lays the slices out largest first while Nivo keeps drawing
 * the `<path>`s in data order. The payload follows the ring, since that is
 * what a reader walks; the marks then no longer run in document order, and a
 * pie's selector can only pair them that way, so such a chart is read
 * without the highlight rather than with the wrong slice outlined.
 *
 * @param props - The chart's props
 * @returns The layer, or none when there is no slice
 */
function pieLayers(props: Props): NivoLayerInfo[] {
  const getId = propertyAccessor(props.id, 'id');
  const getValue = propertyAccessor(props.value, 'value');
  const slices = records(props.data).map((datum) => {
    const id = getId(datum);
    const label = datum.label ?? id;
    return { id: toLabel(id), label: toLabel(label), value: toMagnitude(getValue(datum)) };
  });
  if (slices.length === 0)
    return [];

  const order = slices.map((_, index) => index);
  if (props.sortByValue === true)
    order.sort((i, j) => descending(slices[i].value, slices[j].value));
  const ordered = order.every((drawn, index) => drawn === index);

  const points: PiePoint[] = order.map(index => ({ x: slices[index].label, y: slices[index].value }));
  const startAngle = typeof props.startAngle === 'number' && Number.isFinite(props.startAngle) ? props.startAngle : 0;
  const endAngle = typeof props.endAngle === 'number' && Number.isFinite(props.endAngle) ? props.endAngle : 360;

  return [{
    id: '0',
    data: { kind: 'pie', points, dial: pieGeometry(startAngle, endAngle >= startAngle) },
    marks: { kind: 'arcs', testIds: slices.map(slice => `arc.${slice.id}`), ordered },
  }];
}

// ---------------------------------------------------------------------------
// @nivo/heatmap
// ---------------------------------------------------------------------------

/**
 * Converts `@nivo/heatmap` props.
 *
 * Rows are the series, in data order, which Nivo draws from the top down —
 * the order the grammar's `y` and `points` take. Columns are every `x` value
 * the rows name, in the order they first appear, which is how Nivo builds its
 * x domain. A `null` value is drawn in Nivo's `emptyColor`, so it keeps its
 * cell element and becomes a `null` reading; an `x` a row does not list has
 * neither.
 *
 * @param props - The chart's props
 * @returns The layer, or none when the grid is empty
 */
function heatmapLayers(props: Props): NivoLayerInfo[] {
  const rows = records(props.data);
  const columns: string[] = [];
  for (const row of rows) {
    for (const datum of records(row.data)) {
      const x = toLabel(datum.x);
      if (!columns.includes(x))
        columns.push(x);
    }
  }
  if (rows.length === 0 || columns.length === 0)
    return [];

  const values: (number | null)[][] = [];
  const testIds: (string | null)[][] = [];
  for (const row of rows) {
    const valueRow: (number | null)[] = columns.map(() => null);
    const idRow: (string | null)[] = columns.map(() => null);
    for (const datum of records(row.data)) {
      const column = columns.indexOf(toLabel(datum.x));
      const value = toMagnitude(datum.y);
      valueRow[column] = Number.isNaN(value) ? null : value;
      // Nivo concatenates the id and `x` as strings (`id + '.' + x`), so a
      // Date `x` is its `toString()` here, not the ISO label read aloud.
      idRow[column] = `cell.${String(row.id)}.${String(datum.x)}`;
    }
    values.push(valueRow);
    testIds.push(idRow);
  }

  return [{
    id: '0',
    data: {
      kind: 'heatmap',
      points: { x: columns, y: rows.map(row => toLabel(row.id)), points: values },
    },
    xAxisLabel: axisLegend(props, 'axisTop', 'axisBottom'),
    yAxisLabel: axisLegend(props, 'axisLeft', 'axisRight'),
    marks: { kind: 'cells', testIds },
  }];
}

// ---------------------------------------------------------------------------
// @nivo/boxplot
// ---------------------------------------------------------------------------

/** Nivo's default `quantiles`: whiskers at the 10th and 90th percentiles. */
export const NIVO_BOXPLOT_QUANTILES: readonly number[] = [0.1, 0.25, 0.5, 0.75, 0.9];

/**
 * One quantile of sorted values, interpolated linearly between the two
 * closest ranks — a transcription of `getQuantile` in `@nivo/boxplot`, so the
 * summary read aloud is the one Nivo draws.
 *
 * @param values - The observations, sorted ascending
 * @param quantile - The quantile, clamped to [0, 1]
 * @returns The quantile's value
 */
export function nivoQuantile(values: readonly number[], quantile = 0.5): number {
  const realIndex = (values.length - 1) * Math.max(0, Math.min(1, quantile));
  const intIndex = Math.floor(realIndex);
  if (realIndex === intIndex)
    return values[intIndex];
  const v1 = values[intIndex];
  const v2 = values[intIndex + 1];
  return v1 + (v2 - v1) * (realIndex - intIndex);
}

/** The keys that make a datum a summary Nivo draws as given. */
const PRECOMPUTED_KEYS = ['values', 'extrema', 'mean', 'quantiles', 'group', 'subGroup', 'n'];

/**
 * The levels of a grouping, as Nivo's `useLevels` resolves them: the listed
 * ones when given, otherwise every distinct value in first-seen order, and
 * none at all when there is no grouping.
 *
 * @param levels - The `groups` or `subGroups` prop
 * @param data - The observations
 * @param by - The `groupBy` or `subGroupBy` prop
 * @returns The levels, or null
 */
function boxLevels(levels: unknown, data: Datum[], by: unknown): string[] | null {
  if (Array.isArray(levels))
    return levels.map(String);
  if (by === null || by === undefined)
    return null;
  const get = propertyAccessor(by, 'id');
  return Array.from(new Set(data.map(datum => String(get(datum)))));
}

/**
 * Converts `@nivo/boxplot` props.
 *
 * Nivo takes raw observations and computes each box itself, from its
 * `quantiles` prop — by default `[0.1, 0.25, 0.5, 0.75, 0.9]`, so the
 * whiskers end at the **10th and 90th percentiles**, not at 1.5 IQR. The
 * summary is recomputed here exactly as Nivo does (stratification, sort,
 * interpolation), so the numbers read are the ones drawn. Nivo draws no
 * points beyond the whiskers, so no outliers are emitted.
 *
 * With `subGroupBy`, Nivo draws the sub-groups side by side within each
 * group; each sub-group becomes its own layer, named after it, holding one
 * box per group.
 *
 * `layout="horizontal"` stacks the groups down the page with group 0 at the
 * bottom (measured on 0.99). The core reads a horizontal box layer
 * top-first — `BoxTrace` turns it round so its first row is the lowest box —
 * so the boxes are listed in reverse.
 *
 * @param props - The chart's props
 * @returns One layer per sub-group (one in all when there are none)
 */
function boxLayers(props: Props): NivoLayerInfo[] {
  const data = records(props.data);
  if (data.length === 0)
    return [];

  const groupBy = props.groupBy === undefined ? 'group' : props.groupBy;
  const subGroupBy = props.subGroupBy === undefined ? null : props.subGroupBy;
  const groups = boxLevels(props.groups, data, groupBy);
  const subGroups = boxLevels(props.subGroups, data, subGroupBy);
  const getGroup = propertyAccessor(groupBy, 'group');
  const getSubGroup = propertyAccessor(subGroupBy, 'subGroup');
  const getValue = propertyAccessor(props.value, 'value');
  const quantiles = Array.isArray(props.quantiles)
    ? props.quantiles.map(Number)
    : [...NIVO_BOXPLOT_QUANTILES];
  if (quantiles.length < 5) {
    console.warn(
      `MAIDR: a Nivo box plot needs five quantiles to draw a box and its whiskers; `
      + `got ${quantiles.length}. The chart is not made accessible.`,
    );
    return [];
  }

  // `stratifyData`: one stratum per (group, sub-group), group-major.
  const nGroups = Math.max(1, groups ? groups.length : 1);
  const nSubGroups = Math.max(1, subGroups ? subGroups.length : 1);
  const strata: Datum[][] = Array.from({ length: nGroups * nSubGroups }, () => []);
  for (const datum of data) {
    // With no groups Nivo's lookup answers NaN for every datum and drops it,
    // so such a chart draws no box at all; -1 drops it here the same way.
    const groupIndex = groups ? groups.indexOf(String(getGroup(datum))) : -1;
    const subGroupIndex = subGroups ? Math.max(0, subGroups.indexOf(String(getSubGroup(datum)))) : 0;
    if (groupIndex >= 0)
      strata[groupIndex * nSubGroups + subGroupIndex].push(datum);
  }

  const horizontal = props.layout === 'horizontal';
  const groupLabel = horizontal
    ? axisLegend(props, 'axisLeft', 'axisRight')
    : axisLegend(props, 'axisBottom', 'axisTop');
  const valueLabel = horizontal
    ? axisLegend(props, 'axisBottom', 'axisTop')
    : axisLegend(props, 'axisLeft', 'axisRight');
  const category = groupLabel ?? (typeof groupBy === 'string' ? groupBy : undefined);
  const labels = horizontal
    ? { xAxisLabel: valueLabel, yAxisLabel: category }
    : { xAxisLabel: category, yAxisLabel: valueLabel };

  const layers: NivoLayerInfo[] = [];
  for (let subGroupIndex = 0; subGroupIndex < nSubGroups; subGroupIndex++) {
    const boxes: BoxPoint[] = [];
    const keys: string[] = [];
    for (let groupIndex = 0; groupIndex < nGroups; groupIndex++) {
      const stratum = strata[groupIndex * nSubGroups + subGroupIndex];
      const summary = summarize(stratum, getValue, quantiles);
      // Nivo draws no box for an empty stratum.
      if (summary.n <= 0)
        continue;
      boxes.push({
        z: groups ? groups[groupIndex] : '',
        lowerOutliers: [],
        min: summary.values[0],
        q1: summary.values[1],
        q2: summary.values[2],
        q3: summary.values[3],
        max: summary.values[4],
        upperOutliers: [],
      });
      keys.push(`boxplot.${groupIndex}.${subGroupIndex}`);
    }
    if (boxes.length === 0)
      continue;
    if (horizontal) {
      boxes.reverse();
      keys.reverse();
    }
    layers.push({
      id: String(layers.length),
      ...(subGroups ? { name: subGroups[subGroupIndex] } : {}),
      data: { kind: 'box', points: boxes },
      ...labels,
      orientation: horizontal ? Orientation.HORIZONTAL : undefined,
      marks: {
        kind: 'boxes',
        keys,
        whiskerCaps: typeof props.whiskerEndSize !== 'number' || props.whiskerEndSize > 0,
        horizontal,
      },
    });
  }

  if (subGroups && layers.length > 0) {
    for (const layer of layers)
      layer.legend = subGroups;
  }
  return layers;
}

/**
 * One stratum's summary, as `summarizeDistribution` in `@nivo/boxplot`
 * computes it: a single datum carrying a whole summary is drawn as given,
 * and anything else is a list of observations.
 *
 * @param stratum - The observations of one (group, sub-group)
 * @param getValue - Reads an observation's value
 * @param quantiles - The quantiles to draw
 * @returns How many observations there were, and the quantile values
 */
function summarize(
  stratum: Datum[],
  getValue: (datum: Datum) => unknown,
  quantiles: number[],
): { n: number; values: number[] } {
  if (stratum.length === 1 && PRECOMPUTED_KEYS.every(key => key in stratum[0])) {
    const given = stratum[0];
    const values = Array.isArray(given.values) ? given.values.map(Number) : [];
    return { n: Number(given.n), values };
  }
  const values = stratum.map(datum => Number(getValue(datum)));
  values.sort((a, b) => a - b);
  return { n: values.length, values: quantiles.map(q => nivoQuantile(values, q)) };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Reads a Nivo chart's props into the layers MAIDR navigates.
 *
 * Pure: nothing here touches the DOM. How each layer's marks are found is
 * carried alongside it in `marks`, for the selector pass to resolve.
 *
 * @param type - Which Nivo chart the props belong to
 * @param props - The chart's props
 * @returns The layers, in the order they are navigated; empty when the
 *          props hold no data
 */
export function extractNivoLayers(type: NivoChartType, props: Props): NivoLayerInfo[] {
  switch (type) {
    case 'bar':
      return barLayers(props);
    case 'line':
      return lineLayers(props);
    case 'scatterplot':
      return scatterLayers(props);
    case 'pie':
      return pieLayers(props);
    case 'heatmap':
      return heatmapLayers(props);
    case 'boxplot':
      return boxLayers(props);
    default:
      console.warn(`MAIDR: unsupported Nivo chart type "${String(type)}".`);
      return [];
  }
}

/**
 * Converts a {@link NivoLayerInfo} into the MAIDR {@link MaidrLayer} schema.
 *
 * @param layer - The extracted layer
 * @param selectors - What names the layer's marks, when they were found
 * @returns The layer
 */
export function toMaidrLayer(layer: NivoLayerInfo, selectors?: MaidrLayer['selectors']): MaidrLayer {
  const axis = (label?: string, format?: AxisFormat): AxisConfig | undefined =>
    label || format
      ? { ...(label ? { label } : {}), ...(format ? { format } : {}) }
      : undefined;
  const x = axis(layer.xAxisLabel, layer.xAxisFormat);
  const y = axis(layer.yAxisLabel, layer.yAxisFormat);
  const axes: MaidrLayer['axes'] = {
    ...(x ? { x } : {}),
    ...(y ? { y } : {}),
  };
  const base = {
    id: layer.id,
    ...(layer.name ? { name: layer.name } : {}),
    ...(layer.orientation ? { orientation: layer.orientation } : {}),
    ...(selectors ? { selectors } : {}),
  };
  const { data } = layer;

  switch (data.kind) {
    case 'bar':
      return { ...base, type: TraceType.BAR, axes, data: data.points };
    case 'stacked':
      return { ...base, type: TraceType.STACKED, axes, data: data.points };
    case 'dodged':
      return { ...base, type: TraceType.DODGED, axes, data: data.points };
    case 'line':
      return {
        ...base,
        type: data.stepDirection ? TraceType.STEP : TraceType.LINE,
        ...(data.stepDirection ? { stepDirection: data.stepDirection } : {}),
        axes,
        data: data.points,
      };
    case 'scatter':
      return { ...base, type: TraceType.SCATTER, axes, data: data.points };
    case 'pie':
      return {
        ...base,
        type: TraceType.PIE,
        ...data.dial,
        // A pie has no drawn axis to take a label from, and the core's "X"/"Y"
        // fallback would name neither position; say what the two mean.
        axes: { x: { label: 'Category' }, y: { label: 'Value' } },
        data: data.points,
      };
    case 'heatmap':
      return { ...base, type: TraceType.HEATMAP, axes, data: data.points };
    case 'box':
      return { ...base, type: TraceType.BOX, axes, data: data.points };
  }
}

/**
 * Assembles the figure from converted layers.
 *
 * @param config - The chart's metadata
 * @param layers - The extracted layers
 * @param layerSelectors - The selectors for each layer, by index
 * @returns MaidrData ready to pass to `<Maidr data={...}>`
 */
export function assembleNivoFigure(
  config: Pick<NivoAdapterConfig, 'id' | 'title' | 'subtitle' | 'caption'>,
  layers: NivoLayerInfo[],
  layerSelectors: (MaidrLayer['selectors'] | undefined)[] = [],
): MaidrData {
  const { id, title, subtitle, caption } = config;
  const legend = layers.find(layer => layer.legend)?.legend;
  return {
    id,
    ...(title !== undefined ? { title } : {}),
    ...(subtitle !== undefined ? { subtitle } : {}),
    ...(caption !== undefined ? { caption } : {}),
    subplots: [[{
      layers: layers.map((layer, index) => toMaidrLayer(layer, layerSelectors[index])),
      ...(legend ? { legend } : {}),
    }]],
  };
}

/**
 * Converts a Nivo chart's props into MAIDR data, without a DOM.
 *
 * With a `scope` — a CSS selector prefix naming the element the chart is
 * rendered in, such as `'#sales-chart '` — the layers whose marks Nivo stamps
 * with an attribute of its own (bars, pie arcs, heat map cells, boxes) name
 * them. Lines and scatter nodes carry no such attribute and are only
 * highlighted through `useNivoAdapter` / `<MaidrNivo>`, which tag them after
 * render.
 *
 * @param config - The chart's metadata, type and props
 * @param scope - Selector prefix scoping the emitted selectors to one chart
 * @returns MaidrData ready to pass to `<Maidr data={...}>`
 */
export function nivoToMaidr(config: NivoAdapterConfig, scope?: string): MaidrData {
  const layers = extractNivoLayers(config.type, config.props);
  const selectors = scope === undefined
    ? []
    : layers.map(layer => stampedSelectors(layer.marks, scope));
  return assembleNivoFigure(config, layers, selectors);
}
