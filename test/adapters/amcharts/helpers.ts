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
