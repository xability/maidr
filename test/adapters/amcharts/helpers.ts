/**
 * Duck-typed amCharts 5 fakes shared by the amCharts adapter tests.
 *
 * The adapter reads amCharts objects purely through structural typing
 * (`get()`, `series.values`, `children.values`, ...), so plain objects are
 * enough — no amCharts import and no DOM required.
 */

import type {
  AmAxis,
  AmBounds,
  AmChart,
  AmDataItem,
  AmRoot,
  AmXYSeries,
} from '@adapters/amcharts/types';

let nextUid = 1;

export interface FakeSeriesConfig {
  /** amCharts series class name. Defaults to `ColumnSeries`. */
  className?: string;
  /** Series name (used for layer titles / segmented fill). */
  name?: string;
  /** Extra series settings readable via `series.get(key)`. */
  settings?: Record<string, unknown>;
  /** Data-item records readable via `dataItem.get(key)`. */
  data?: Array<Record<string, unknown>>;
}

export function fakeSeries(config: FakeSeriesConfig = {}): AmXYSeries {
  const settings: Record<string, unknown> = {
    ...(config.name != null ? { name: config.name } : {}),
    ...config.settings,
  };
  return {
    className: config.className ?? 'ColumnSeries',
    uid: nextUid++,
    get: (key: string) => settings[key],
    dataItems: (config.data ?? []).map(record => ({
      get: (key: string) => record[key],
    })),
  } as unknown as AmXYSeries;
}

/** A vertical column (bar) series with `categoryX`/`valueY` data items. */
export function fakeBarSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number | null }>,
): AmXYSeries {
  return fakeSeries({
    className: 'ColumnSeries',
    name,
    settings: { categoryXField: 'category' },
    data: points,
  });
}

/**
 * A horizontal column series: categories on the Y axis and values on the X
 * one, which is how amCharts draws a bar chart lying on its side — and the
 * only way it draws a population pyramid.
 */
export function fakeHorizontalBarSeries(
  name: string,
  points: Array<{ categoryY: string; valueX: number | null }>,
): AmXYSeries {
  return fakeSeries({
    className: 'ColumnSeries',
    name,
    settings: { categoryYField: 'category' },
    data: points,
  });
}

/**
 * What amCharts leaves behind when it draws a mark it has no series class for:
 * the styling on the graphics template, and whether bullets were pushed on.
 */
export interface FakeMarkConfig {
  /** `strokes.template.get('strokeOpacity')`, for a dot plot's hidden line. */
  strokeOpacity?: number;
  /** `columns.template.get(width|height)`, for a lollipop's hairline stem. */
  thickness?: number;
  /** Whether any bullet was configured. Defaults to true. */
  bullets?: boolean;
}

/**
 * A `LineSeries` drawn as a Cleveland dot plot: the stroke switched off and
 * bullets pushed on, so what is drawn is the points alone.
 */
export function fakeDotSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number }>,
  config: FakeMarkConfig = {},
): AmXYSeries {
  const strokeSettings: Record<string, unknown> = {
    strokeOpacity: config.strokeOpacity ?? 0,
  };
  const series = fakeSeries({
    className: 'LineSeries',
    name,
    settings: { categoryXField: 'category' },
    data: points,
  });
  const raw = series as unknown as Record<string, unknown>;
  raw.strokes = { values: [], template: { get: (key: string) => strokeSettings[key] } };
  raw.bullets = { values: config.bullets === false ? [] : [{ get: () => undefined }] };
  return series;
}

/**
 * A `ColumnSeries` drawn as a lollipop: columns narrowed to a stem, with a
 * bullet on the end. `graphics` stands in for the column sprite the overlay
 * measures.
 */
export function fakeLollipopSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number; graphics?: unknown }>,
  config: FakeMarkConfig = {},
): AmXYSeries {
  const columnSettings: Record<string, unknown> = { width: config.thickness ?? 2 };
  const series = fakeSeries({
    className: 'ColumnSeries',
    name,
    settings: { categoryXField: 'category' },
    data: points,
  });
  const raw = series as unknown as Record<string, unknown>;
  raw.columns = { values: [], template: { get: (key: string) => columnSettings[key] } };
  raw.bullets = { values: config.bullets === false ? [] : [{ get: () => undefined }] };
  return series;
}

/**
 * An am5wc `WordCloud`: like a hierarchy layout it is a bare series in a plain
 * container, and like a pie its terms carry a `category`/`value` pair. `label`
 * stands in for the glyph the overlay measures.
 */
export function fakeWordCloudSeries(
  name: string,
  terms: Array<{ category: string; value: number | null; label?: unknown }>,
): AmXYSeries {
  return fakeSeries({
    className: 'WordCloud',
    name,
    settings: { categoryField: 'category', valueField: 'value' },
    data: terms,
  });
}

/** A line series with `categoryX`/`valueY` data items. */
export function fakeLineSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number }>,
): AmXYSeries {
  return fakeSeries({
    className: 'LineSeries',
    name,
    settings: { categoryXField: 'category' },
    data: points,
  });
}

/**
 * A value axis, optionally drawn upside down — the rank axis a bump chart
 * plots on. amCharts keeps the inversion on the axis' renderer rather than on
 * the axis itself, which is where the adapter reads it from.
 */
export function fakeValueAxis(inversed: boolean): AmAxis {
  const renderer = {
    get: (key: string) => (key === 'inversed' ? inversed : undefined),
  };
  return {
    className: 'ValueAxis',
    get: (key: string) => (key === 'renderer' ? renderer : undefined),
    dataItems: [],
  } as unknown as AmAxis;
}

/**
 * One competitor of a bump chart: an ordinary `LineSeries` carrying places
 * rather than magnitudes, bound by default to an inversed value axis.
 */
export function fakeRankSeries(
  name: string,
  places: Array<{ categoryX: string; valueY: number }>,
  config: { inversed?: boolean } = {},
): AmXYSeries {
  return fakeSeries({
    className: 'LineSeries',
    name,
    settings: {
      categoryXField: 'category',
      yAxis: fakeValueAxis(config.inversed !== false),
    },
    data: places,
  });
}

/**
 * How an area series declares its band, mirroring the settings amCharts reads:
 * a visible fill is what makes a `LineSeries` an area at all, and `stacked` /
 * `valueYShow` are what make the bands a stack.
 */
export interface FakeAreaConfig {
  /** `fills.template.get('fillOpacity')`. Defaults to a visible 0.5. */
  fillOpacity?: number;
  /** `fills.template.get('visible')`. */
  fillVisible?: boolean;
  stacked?: boolean;
  /** Set for a 100% stack (`valueYShow: 'valueYTotalPercent'`). */
  normalized?: boolean;
}

/**
 * A `LineSeries` drawn as an area: the same series a line uses, with the fill
 * template amCharts requires before it paints the band.
 */
export function fakeAreaSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number }>,
  config: FakeAreaConfig = {},
): AmXYSeries {
  const fillSettings: Record<string, unknown> = {
    fillOpacity: config.fillOpacity ?? 0.5,
    ...(config.fillVisible != null ? { visible: config.fillVisible } : {}),
  };
  const series = fakeSeries({
    className: 'LineSeries',
    name,
    settings: {
      categoryXField: 'category',
      ...(config.stacked ? { stacked: true } : {}),
      ...(config.normalized ? { valueYShow: 'valueYTotalPercent' } : {}),
    },
    data: points,
  });
  (series as unknown as Record<string, unknown>).fills = {
    template: { get: (key: string) => fillSettings[key] },
  };
  return series;
}

/** An am5radar `RadarLineSeries`: one closed outline over the spokes. */
export function fakeRadarSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number }>,
): AmXYSeries {
  return fakeSeries({
    className: 'RadarLineSeries',
    name,
    settings: { categoryXField: 'category' },
    data: points,
  });
}

/**
 * An am5radar `RadarColumnSeries`: the same spokes drawn as wedges. Its
 * wedges live on each data item's `graphics`, where a plain column series
 * keeps its rectangle.
 */
export function fakePolarSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number; graphics?: unknown }>,
): AmXYSeries {
  return fakeSeries({
    className: 'RadarColumnSeries',
    name,
    settings: { categoryXField: 'category' },
    data: points,
  });
}

/**
 * An am5percent funnel series: `category`/`value` stages in data order, with
 * `slice` standing in for the stage graphic the overlay measures.
 */
export function fakeFunnelSeries(
  name: string,
  stages: Array<{ category: string; value: number | null; slice?: unknown }>,
  className = 'FunnelSeries',
): AmXYSeries {
  return fakeSeries({
    className,
    name,
    settings: { categoryField: 'category', valueField: 'value' },
    data: stages,
  });
}

/**
 * An am5percent pie series: `category`/`value` data items, no axis fields.
 * `slice` stands in for the wedge graphic the overlay reads geometry from.
 */
export function fakePieSeries(
  name: string,
  slices: Array<{ category: string; value: number | null; slice?: unknown }>,
): AmXYSeries {
  return fakeSeries({
    className: 'PieSeries',
    name,
    settings: { categoryField: 'category', valueField: 'value' },
    data: slices,
  });
}

/**
 * A column series whose bars float between two values on the value axis —
 * the shape amCharts draws both a waterfall and a dumbbell with. `graphics`
 * stands in for the column sprite the overlay measures.
 */
export function fakeFloatingColumnSeries(
  name: string,
  columns: Array<{
    categoryX: string;
    openValueY: number | null;
    valueY: number | null;
    graphics?: unknown;
  }>,
): AmXYSeries {
  return fakeSeries({
    className: 'ColumnSeries',
    name,
    settings: { categoryXField: 'category', openValueYField: 'open' },
    data: columns,
  });
}

/** A category axis, whose data items name the lanes of a schedule. */
export function fakeCategoryAxis(categories: string[]): AmAxis {
  return {
    className: 'CategoryAxis',
    get: () => undefined,
    dataItems: categories.map(category => ({
      get: (key: string) => (key === 'category' ? category : undefined),
    })),
  } as unknown as AmAxis;
}

/**
 * A date axis, which reports the unit its positions are measured in through
 * its base interval. Passing no unit makes it a plain value axis instead.
 */
export function fakeTimeAxis(timeUnit?: string): AmAxis {
  const baseInterval = timeUnit != null ? { timeUnit, count: 1 } : undefined;
  return {
    className: timeUnit != null ? 'DateAxis' : 'ValueAxis',
    get: (key: string) => (key === 'baseInterval' ? baseInterval : undefined),
    dataItems: [],
  } as unknown as AmAxis;
}

/**
 * An amCharts gantt: floating columns on a category axis of lanes and a date
 * axis of time. The axes are settings of the series, which is where the
 * adapter reads the lane names and the unit from.
 */
export function fakeGanttSeries(
  name: string,
  bars: Array<{
    categoryY: string;
    openValueX: number | null;
    valueX: number | null;
    graphics?: unknown;
  }>,
  config: { lanes?: string[]; timeUnit?: string } = {},
): AmXYSeries {
  return fakeSeries({
    className: 'ColumnSeries',
    name,
    settings: {
      categoryYField: 'category',
      openValueXField: 'fromDate',
      xAxis: fakeTimeAxis(config.timeUnit),
      yAxis: fakeCategoryAxis(config.lanes ?? []),
    },
    data: bars,
  });
}

/** One node of a fake am5hierarchy tree. */
export interface FakeNode {
  category: string;
  value?: number;
  children?: FakeNode[];
  /** Stands in for the rectangle sprite the overlay measures. */
  rectangle?: unknown;
}

function fakeHierarchyItem(node: FakeNode): AmDataItem {
  const children = node.children?.map(fakeHierarchyItem);
  const settings: Record<string, unknown> = {
    category: node.category,
    ...(node.value != null ? { value: node.value } : {}),
    ...(children != null ? { children } : {}),
    ...(node.rectangle != null ? { rectangle: node.rectangle } : {}),
  };
  return { get: (key: string) => settings[key] } as unknown as AmDataItem;
}

/**
 * An am5hierarchy series — a `Treemap`, or the `Partition` amCharts draws an
 * icicle with. Unlike every other series here it is not inside a chart: it is
 * pushed straight into a container, and its nodes hang off the single root
 * data item rather than off the series.
 */
export function fakeHierarchySeries(
  name: string,
  root: FakeNode,
  className = 'Treemap',
): AmXYSeries {
  const settings: Record<string, unknown> = { name };
  return {
    className,
    uid: nextUid++,
    get: (key: string) => settings[key],
    dataItems: [fakeHierarchyItem(root)],
  } as unknown as AmXYSeries;
}

/** A step-line series, drawn as a staircase rather than an interpolated line. */
export function fakeStepSeries(
  name: string,
  points: Array<{ categoryX: string; valueY: number }>,
): AmXYSeries {
  return fakeSeries({
    className: 'StepLineSeries',
    name,
    settings: { categoryXField: 'category' },
    data: points,
  });
}

function fakeAxis(label?: string): AmAxis {
  const title = label != null
    ? { get: (key: string) => (key === 'text' ? label : undefined) }
    : undefined;
  return {
    get: (key: string) => (key === 'title' ? title : undefined),
    dataItems: [],
  } as unknown as AmAxis;
}

export interface FakeChartConfig {
  series?: AmXYSeries[];
  /** X axis title (readable via `axis.get('title').get('text')`). */
  xLabel?: string;
  /** Y axis title. */
  yLabel?: string;
  /** Chart title, exposed as a `Label` child like amCharts does. */
  title?: string;
  /** Plot-area bounds returned by `plotContainer.globalBounds()`. */
  bounds?: AmBounds;
  className?: string;
}

export function fakeChart(config: FakeChartConfig = {}): AmChart {
  const chart: Record<string, unknown> = {
    className: config.className ?? 'XYChart',
    uid: nextUid++,
    get: () => undefined,
    series: { values: config.series ?? [] },
    xAxes: { values: [fakeAxis(config.xLabel)] },
    yAxes: { values: [fakeAxis(config.yLabel)] },
  };
  if (config.bounds) {
    const bounds = config.bounds;
    chart.plotContainer = { globalBounds: () => bounds };
  }
  if (config.title != null) {
    const title = config.title;
    chart.children = {
      values: [{
        className: 'Label',
        get: (key: string) => (key === 'text' ? title : undefined),
      }],
    };
  }
  return chart as unknown as AmChart;
}

/**
 * An am5percent `PieChart`: a series list and a class name, but no axes and no
 * plot container — the shape the adapter has to recognise without them.
 */
export function fakePieChart(config: { series?: AmXYSeries[]; title?: string } = {}): AmChart {
  const chart: Record<string, unknown> = {
    className: 'PieChart',
    uid: nextUid++,
    get: () => undefined,
    series: { values: config.series ?? [] },
  };
  if (config.title != null) {
    const title = config.title;
    chart.children = {
      values: [{
        className: 'Label',
        get: (key: string) => (key === 'text' ? title : undefined),
      }],
    };
  }
  return chart as unknown as AmChart;
}

/**
 * An am5percent `SlicedChart` — the funnel/pyramid counterpart of a
 * `PieChart`: a series list and a class name, no axes and no plot container.
 */
export function fakeSlicedChart(
  config: { series?: AmXYSeries[]; title?: string } = {},
): AmChart {
  const chart = fakePieChart(config) as unknown as Record<string, unknown>;
  chart.className = 'SlicedChart';
  return chart as unknown as AmChart;
}

/**
 * A container-like node (e.g. a StockChart, a panels/tools container, or an
 * `XYChartScrollbar` when given that `className` — a real scrollbar is a plain
 * container, NOT chart-like, whose child is a preview `XYChart`).
 */
export function fakeContainer(children: unknown[], className?: string): unknown {
  return {
    ...(className != null ? { className } : {}),
    get: () => undefined,
    children: { values: children },
  };
}

/**
 * A minimal `HTMLElement` stand-in for the chart container. The adapter only
 * reads `id` and calls `querySelector` (selector probing), so no DOM needed.
 */
export function fakeContainerEl(id = 'chartdiv'): HTMLElement {
  return {
    id,
    querySelector: () => null,
  } as unknown as HTMLElement;
}

export function fakeRoot(children: unknown[], domId = 'chartdiv'): AmRoot {
  return {
    dom: fakeContainerEl(domId),
    container: fakeContainer(children),
  } as unknown as AmRoot;
}
