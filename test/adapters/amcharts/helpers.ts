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
  AmRoot,
  AmXYChart,
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

export function fakeChart(config: FakeChartConfig = {}): AmXYChart {
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
  return chart as unknown as AmXYChart;
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
