import type {
  AnyChartAxis,
  AnyChartInstance,
  AnyChartIterator,
  AnyChartSeries,
} from '@adapters/anychart/types';
import type {
  BarPoint,
  BoxSelector,
  DumbbellData,
  FlowPoint,
  LinePoint,
  MaidrLayer,
  MosaicPoint,
  PiePoint,
  WaterfallPoint,
  WordCloudPoint,
} from '@type/grammar';
import {
  anyChartsToMaidr,
  anyChartToMaidr,
  bindAnyChart,
  bindAnyCharts,
  mapSeriesType,
} from '@adapters/anychart/converters';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

// ---------------------------------------------------------------------------
// DOM globals (jest runs in the node environment; the adapter resolves
// containers and stamps SVGs via DOM globals at call time).
// ---------------------------------------------------------------------------

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  document: dom.window.document,
  window: dom.window,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  Node: dom.window.Node,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
});

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------------------
// AnyChart mocks
// ---------------------------------------------------------------------------

function createIterator(rows: Array<Record<string, unknown>>): AnyChartIterator {
  let index = -1;
  return {
    advance: () => ++index < rows.length,
    get: (field: string) => rows[index]?.[field],
    getIndex: () => index,
    getRowsCount: () => rows.length,
    reset: () => {
      index = -1;
    },
  };
}

function createSeries(
  seriesType: string,
  rows: Array<Record<string, unknown>>,
): AnyChartSeries {
  return {
    id: () => 0,
    name: () => seriesType,
    seriesType: () => seriesType,
    getIterator: () => createIterator(rows),
    getPoint: () => ({ get: () => undefined, getIndex: () => 0, exists: () => false }),
    getStat: () => undefined,
  };
}

function createBarSeries(data: Array<[string, number]>): AnyChartSeries {
  return createSeries('column', data.map(([x, value]) => ({ x, value })));
}

/**
 * A drawn AnyChart pie. A real one exposes NO series API — `getSeriesCount()`
 * and `getSeriesAt()` are absent and its slices live on `chart.data()` — so
 * the mock omits them deliberately: the conversion has to work without them.
 */
function createPieChart(
  title: string,
  slices: Array<[string, number | null]>,
  extra: { container?: HTMLElement } = {},
): AnyChartInstance {
  const rows = slices.map(([x, value]) => ({ x, value }));
  return {
    title: () => title,
    container: () => extra.container ?? '',
    getType: () => 'pie',
    data: () => ({ getIterator: () => createIterator(rows) }),
  } as unknown as AnyChartInstance;
}

/**
 * Append a rendered pie to a container's `<svg>`: one AnyChart layer holding
 * `count` wedge paths plus a straight label connector, which shares the layer
 * but is not a wedge.
 */
function appendPieWedges(
  container: HTMLElement,
  count: number,
  outlines?: 'after' | 'before',
): SVGElement[] {
  const svg = container.querySelector('svg') as unknown as SVGElement;
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.id = 'ac_layer_1';
  svg.appendChild(layer);

  const arc = 'M 100 100 L 150 100 A 50 50 0 0 1 100 150 Z';
  const wedges: SVGElement[] = [];
  for (let i = 0; i < count; i++) {
    const wedge = document.createElementNS(SVG_NS, 'path');
    wedge.id = `ac_path_${i}`;
    wedge.setAttribute('d', arc);
    wedge.setAttribute('fill', '#1f77b4');
    // A real chart draws each slice twice: the fill, then a stroke-only twin
    // over the same arc. `before` emits them the other way round, which
    // AnyChart does not do today — the point is that nothing may depend on
    // that.
    const outline = document.createElementNS(SVG_NS, 'path');
    outline.id = `ac_path_${i}_outline`;
    outline.setAttribute('d', arc);
    outline.setAttribute('fill', 'none');

    if (outlines === 'before')
      layer.appendChild(outline);
    layer.appendChild(wedge);
    if (outlines === 'after')
      layer.appendChild(outline);
    wedges.push(wedge);
  }

  const connector = document.createElementNS(SVG_NS, 'path');
  connector.id = 'ac_path_connector';
  connector.setAttribute('d', 'M 150 100 L 180 90');
  layer.appendChild(connector);

  return wedges;
}

/**
 * A drawn AnyChart funnel or pyramid. Like a pie it exposes NO series API and
 * its stages live on `chart.data()` — and its default data mapping is
 * `name` / `value` rather than the pie's `x` / `value`, which the mock keeps.
 */
function createFunnelChart(
  title: string,
  stages: Array<[string, number | null]>,
  extra: { container?: HTMLElement; type?: 'funnel' | 'pyramid' } = {},
): AnyChartInstance {
  const rows = stages.map(([name, value]) => ({ name, value }));
  return {
    title: () => title,
    container: () => extra.container ?? '',
    getType: () => extra.type ?? 'funnel',
    data: () => ({ getIterator: () => createIterator(rows) }),
  } as unknown as AnyChartInstance;
}

/**
 * Append a rendered funnel to a container's `<svg>`: one AnyChart layer of
 * `count` filled trapezoid segments, each with the stroke-only twin AnyChart
 * draws over it, plus a one-icon legend layer per stage — the decoy the segment
 * lookup separates by density rather than by shape, since a legend icon and a
 * funnel segment are both straight-sided filled paths.
 */
function appendFunnelSegments(container: HTMLElement, count: number): SVGElement[] {
  const svg = container.querySelector('svg') as unknown as SVGElement;
  const segments: SVGElement[] = [];

  // One legend item per stage, each in its own layer, drawn first.
  for (let i = 0; i < count; i++) {
    const legendLayer = document.createElementNS(SVG_NS, 'g');
    legendLayer.id = `ac_layer_legend_${i}`;
    const icon = document.createElementNS(SVG_NS, 'path');
    icon.id = `ac_path_legend_${i}`;
    icon.setAttribute('d', 'M 0 0 L 8 0 L 8 8 L 0 8 Z');
    icon.setAttribute('fill', '#1f77b4');
    legendLayer.appendChild(icon);
    svg.appendChild(legendLayer);
  }

  const layer = document.createElementNS(SVG_NS, 'g');
  layer.id = 'ac_layer_1';
  svg.appendChild(layer);
  for (let i = 0; i < count; i++) {
    const trapezoid = 'M 20 0 L 180 0 L 160 40 L 40 40 Z';
    const segment = document.createElementNS(SVG_NS, 'path');
    segment.id = `ac_path_${i}`;
    segment.setAttribute('d', trapezoid);
    segment.setAttribute('fill', '#1f77b4');
    const outline = document.createElementNS(SVG_NS, 'path');
    outline.id = `ac_path_${i}_outline`;
    outline.setAttribute('d', trapezoid);
    outline.setAttribute('fill', 'none');
    layer.appendChild(segment);
    layer.appendChild(outline);
    segments.push(segment);
  }

  return segments;
}

/**
 * A drawn AnyChart tag cloud. Single-dataset like the pie, mapping
 * `x` / `value`.
 */
function createWordCloudChart(
  title: string,
  terms: Array<[string, number | null]>,
  extra: { container?: HTMLElement } = {},
): AnyChartInstance {
  const rows = terms.map(([x, value]) => ({ x, value }));
  return {
    title: () => title,
    container: () => extra.container ?? '',
    getType: () => 'tag-cloud',
    data: () => ({ getIterator: () => createIterator(rows) }),
  } as unknown as AnyChartInstance;
}

/**
 * Append a rendered tag cloud to a container's `<svg>`: one `<text>` per term,
 * in the order given — which for a real cloud is its packing spiral and not
 * the order the terms were declared in.
 */
function appendCloudWords(container: HTMLElement, terms: string[]): SVGElement[] {
  const svg = container.querySelector('svg') as unknown as SVGElement;
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.id = 'ac_layer_1';
  svg.appendChild(layer);

  return terms.map((term, i) => {
    const text = document.createElementNS(SVG_NS, 'text');
    text.id = `ac_text_${i}`;
    text.textContent = term;
    layer.appendChild(text);
    return text as unknown as SVGElement;
  });
}

/**
 * A drawn AnyChart sankey. Single-dataset like the pie — no series API at all —
 * mapping `from` / `to` / `weight`. A `null` target is AnyChart's "dropoff":
 * the chart draws a ribbon leaving the node and going nowhere, and it names no
 * flow.
 */
function createSankeyChart(
  title: string,
  flows: Array<[string, string | null, number | null]>,
  extra: { container?: HTMLElement } = {},
): AnyChartInstance {
  const rows = flows.map(([from, to, weight]) => ({ from, to, weight }));
  return {
    title: () => title,
    container: () => extra.container ?? '',
    getType: () => 'sankey',
    data: () => ({ getIterator: () => createIterator(rows) }),
  } as unknown as AnyChartInstance;
}

/**
 * Append a rendered sankey to a container's `<svg>`: one layer holding `count`
 * curved ribbons at AnyChart's own `fill-opacity` of 0.3, plus the node
 * rectangles that share the layer — straight-sided paths that would be
 * indistinguishable from the ribbons without the curve test.
 */
function appendSankeyRibbons(container: HTMLElement, count: number): SVGElement[] {
  const svg = container.querySelector('svg') as unknown as SVGElement;
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.id = 'ac_layer_1';
  svg.appendChild(layer);

  const ribbons: SVGElement[] = [];
  for (let i = 0; i < count; i++) {
    const ribbon = document.createElementNS(SVG_NS, 'path');
    ribbon.id = `ac_path_${i}`;
    ribbon.setAttribute('d', 'M 40 10 C 80 10 100 60 140 60 L 140 80 C 100 80 80 30 40 30 Z');
    ribbon.setAttribute('fill', 'grey');
    ribbon.setAttribute('fill-opacity', '0.3');
    layer.appendChild(ribbon);
    ribbons.push(ribbon);
  }

  // The node rectangles the ribbons run between, drawn into the same layer.
  for (let i = 0; i < 2; i++) {
    const node = document.createElementNS(SVG_NS, 'path');
    node.id = `ac_path_node_${i}`;
    node.setAttribute('d', 'M 10 10 L 34 10 L 34 90 L 10 90 Z');
    node.setAttribute('fill', '#64b5f6');
    layer.appendChild(node);
  }

  return ribbons;
}

/**
 * A drawn AnyChart waterfall. Unlike the single-dataset charts it is Cartesian
 * and does expose the series API, with one `waterfall` series per stack level.
 */
function createWaterfallChart(
  title: string,
  steps: Array<[string, number | null, boolean?]>,
  extra: {
    container?: HTMLElement;
    dataMode?: string;
    totalsAsAbsolute?: boolean;
  } = {},
): AnyChartInstance {
  const rows = steps.map(([x, value, isTotal]) => ({
    x,
    value,
    ...(isTotal === undefined ? {} : { isTotal }),
  }));
  return {
    ...createChart({
      title,
      container: extra.container,
      type: 'waterfall',
      series: [createSeries('waterfall', rows)],
    }),
    ...(extra.dataMode ? { dataMode: () => extra.dataMode } : {}),
    ...(extra.totalsAsAbsolute
      ? { drawTotalsAsAbsolute: () => true }
      : {}),
  } as AnyChartInstance;
}

/**
 * Append a rendered waterfall to a container's `<svg>`: one layer of `count`
 * filled bars plus the stroke-only connector AnyChart draws between each pair
 * of steps, which shares the layer and is not a bar.
 */
function appendWaterfallBars(container: HTMLElement, count: number): SVGElement[] {
  const svg = container.querySelector('svg') as unknown as SVGElement;
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.id = 'ac_layer_1';
  layer.setAttribute('clip-path', 'url(#ac_clip_1)');
  svg.appendChild(layer);

  const bars: SVGElement[] = [];
  for (let i = 0; i < count; i++) {
    const bar = document.createElementNS(SVG_NS, 'path');
    bar.id = `ac_path_${i}`;
    bar.setAttribute('d', 'M 10 20 L 40 20 L 40 90 L 10 90 Z');
    bar.setAttribute('fill', '#64b5f6');
    layer.appendChild(bar);
    bars.push(bar);

    if (i < count - 1) {
      const connector = document.createElementNS(SVG_NS, 'path');
      connector.id = `ac_path_connector_${i}`;
      connector.setAttribute('d', 'M 40 20 L 70 20');
      connector.setAttribute('fill', 'none');
      layer.appendChild(connector);
    }
  }

  return bars;
}

/**
 * A drawn AnyChart marimekko: one `mekko` series per level of the stack, each
 * carrying one row per category.
 */
function createMosaicChart(
  title: string,
  levels: Array<[string, Array<[string, number]>]>,
  extra: { container?: HTMLElement; type?: string } = {},
): AnyChartInstance {
  return createChart({
    title,
    container: extra.container,
    type: extra.type ?? 'mosaic',
    series: levels.map(([name, rows]) => ({
      ...createSeries('mekko', rows.map(([x, value]) => ({ x, value }))),
      name: () => name,
    })),
  });
}

/**
 * Append a rendered marimekko to a container's `<svg>`: one layer per series,
 * each holding that series' tiles in category order — series-major document
 * order, which is what the segmented trace pairs its table against.
 */
function appendMosaicTiles(container: HTMLElement, levels: number[]): SVGElement[] {
  const svg = container.querySelector('svg') as unknown as SVGElement;
  const tiles: SVGElement[] = [];

  levels.forEach((count, s) => {
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = `ac_layer_series_${s}`;
    layer.setAttribute('clip-path', 'url(#ac_clip_1)');
    svg.appendChild(layer);
    for (let c = 0; c < count; c++) {
      const tile = document.createElementNS(SVG_NS, 'path');
      tile.id = `ac_path_${s}_${c}`;
      tile.setAttribute('d', 'M 10 20 L 60 20 L 60 90 L 10 90 Z');
      tile.setAttribute('fill', '#64b5f6');
      layer.appendChild(tile);
      tiles.push(tile);
    }
  });

  return tiles;
}

/**
 * A drawn AnyChart chart carrying one `range-column` series: a `low` / `high`
 * pair per category, which AnyChart draws as one floating bar each.
 */
function createRangeChart(
  title: string,
  pairs: Array<[string, number | null, number | null]>,
  extra: { container?: HTMLElement; seriesType?: string } = {},
): AnyChartInstance {
  const rows = pairs.map(([x, low, high]) => ({ x, low, high }));
  return createChart({
    title,
    container: extra.container,
    xScaleType: 'ordinal',
    series: [createSeries(extra.seriesType ?? 'range-column', rows)],
  });
}

/**
 * Append rendered range bars to a container's `<svg>`: one layer of `count`
 * filled bars, plus the unfilled hatch twin AnyChart draws over each one and
 * a stroke-only grid line — neither of which is a bar.
 */
function appendRangeBars(container: HTMLElement, count: number): SVGElement[] {
  const svg = container.querySelector('svg') as unknown as SVGElement;
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.id = 'ac_layer_1';
  layer.setAttribute('clip-path', 'url(#ac_clip_1)');
  svg.appendChild(layer);

  const grid = document.createElementNS(SVG_NS, 'path');
  grid.id = 'ac_path_grid';
  grid.setAttribute('d', 'M 0 40 L 300 40');
  grid.setAttribute('fill', 'none');
  layer.appendChild(grid);

  const bars: SVGElement[] = [];
  for (let i = 0; i < count; i++) {
    const bar = document.createElementNS(SVG_NS, 'path');
    bar.id = `ac_path_${i}`;
    bar.setAttribute('d', 'M 10 20 L 40 20 L 40 90 L 10 90 Z');
    bar.setAttribute('fill', '#64b5f6');
    layer.appendChild(bar);
    bars.push(bar);

    const hatch = document.createElementNS(SVG_NS, 'path');
    hatch.id = `ac_path_${i}_hatch`;
    hatch.setAttribute('d', 'M 10 20 L 40 20 L 40 90 L 10 90 Z');
    hatch.setAttribute('fill', 'none');
    layer.appendChild(hatch);
  }

  return bars;
}

/**
 * A drawn AnyChart radar or polar chart. Both expose the series API, and their
 * series report themselves as plain `line` / `area` / `marker` / `column` —
 * which is exactly why only `getType()` can say the categories are arranged
 * around a circle.
 */
function createRadialChart(
  title: string,
  seriesType: string,
  points: Array<[string, number]>,
  extra: { container?: HTMLElement; type?: 'radar' | 'polar'; series?: number } = {},
): AnyChartInstance {
  const rows = points.map(([x, value]) => ({ x, value }));
  const series = Array.from({ length: extra.series ?? 1 }, () => ({
    ...createSeries(seriesType, rows),
    // A radar's line series carries markers, and the adapter enables them so
    // there is one element per spoke to highlight.
    markers: () => ({ enabled: () => true }),
  }) as AnyChartSeries);
  return createChart({
    title,
    container: extra.container,
    type: extra.type ?? 'radar',
    series,
  });
}

/**
 * Append a rendered radar to a container's `<svg>`: one layer of `count`
 * arc-drawn markers, plus the straight-sided web AnyChart draws behind them and
 * a one-icon legend layer — neither of which may be mistaken for a spoke.
 */
function appendRadarMarks(container: HTMLElement, count: number): SVGElement[] {
  const svg = container.querySelector('svg') as unknown as SVGElement;

  // The grid web: a polygon per ring, stroked and unfilled.
  const grid = document.createElementNS(SVG_NS, 'g');
  grid.id = 'ac_layer_grid';
  svg.appendChild(grid);
  for (let i = 0; i < 4; i++) {
    const ring = document.createElementNS(SVG_NS, 'path');
    ring.id = `ac_path_grid_${i}`;
    ring.setAttribute('d', 'M 100 20 L 170 100 L 100 180 L 30 100 Z');
    ring.setAttribute('fill', 'none');
    grid.appendChild(ring);
  }

  const layer = document.createElementNS(SVG_NS, 'g');
  layer.id = 'ac_layer_1';
  svg.appendChild(layer);
  const marks: SVGElement[] = [];
  for (let i = 0; i < count; i++) {
    const mark = document.createElementNS(SVG_NS, 'path');
    mark.id = `ac_path_${i}`;
    // acgraph draws a circular marker as two arcs.
    mark.setAttribute('d', 'M 96 100 A 4 4 0 1 1 104 100 A 4 4 0 1 1 96 100 Z');
    mark.setAttribute('fill', '#64b5f6');
    layer.appendChild(mark);
    marks.push(mark);
  }

  return marks;
}

/**
 * Append a rendered candlestick series to a container's `<svg>`: `count` candle
 * paths inside an AnyChart layer.
 *
 * A real series layer carries the `clip-path` that bounds it to the plot area,
 * which is how the lookup tells it apart from the axes and background layers.
 * Pass `clipped: false` for a chart whose layers do not carry one, and
 * `layered: false` for an SVG with no AnyChart layer structure at all.
 */
function appendCandlePaths(
  container: HTMLElement,
  count: number,
  options: { clipped?: boolean; layered?: boolean } = {},
): SVGElement[] {
  const svg = container.querySelector('svg') as unknown as SVGElement;
  let parent = svg;
  if (options.layered !== false) {
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = 'ac_layer_1';
    if (options.clipped !== false) {
      layer.setAttribute('clip-path', 'url(#ac_clip_1)');
    }
    svg.appendChild(layer);
    parent = layer as unknown as SVGElement;
  }

  const candles: SVGElement[] = [];
  for (let i = 0; i < count; i++) {
    const candle = document.createElementNS(SVG_NS, 'path');
    candle.id = `ac_path_${i}`;
    // Wick plus body: a real candle always draws more than one command, which
    // is how the stamper rejects single-command clip-boundary sentinels.
    candle.setAttribute('d', 'M 10 0 L 10 40 M 5 10 L 15 10 L 15 30 L 5 30 Z');
    candle.setAttribute('fill', '#00aa00');
    parent.appendChild(candle);
    candles.push(candle);
  }

  return candles;
}

function createCandlestickChart(
  title: string,
  days: string[],
  extra: Omit<MockChartConfig, 'title' | 'series'> = {},
): AnyChartInstance {
  const rows = days.map(x => ({ x, open: 1, high: 4, low: 0.5, close: 3 }));
  return createChart({ title, series: [createSeries('candlestick', rows)], ...extra });
}

function createAxis(titleText: string): AnyChartAxis {
  return {
    title: () => ({ text: () => titleText }),
    labels: () => ({ enabled: () => true }),
  };
}

interface MockChartConfig {
  title?: string;
  container?: HTMLElement | string;
  series?: AnyChartSeries[];
  type?: string;
  xTitle?: string;
  yTitle?: string;
  /** Chart-level data rows (single-dataset charts: heatmap, pie). */
  dataRows?: Array<Record<string, unknown>>;
  /**
   * The y scale's stacking mode. Omit for a chart with no stackable y scale
   * at all, which is how every non-Cartesian chart answers.
   */
  stackMode?: string;
  /**
   * The x scale's kind. Omit for a chart that exposes no x scale, which is how
   * every build the adapter cannot ask answers — a marker series then keeps
   * the scatter reading it has always had.
   */
  xScaleType?: string;
}

function createChart(config: MockChartConfig): AnyChartInstance {
  const series = config.series ?? [];
  const chartType = config.type;
  const dataRows = config.dataRows;
  const xTitle = config.xTitle;
  const yTitle = config.yTitle;
  const stackMode = config.stackMode;
  const xScaleType = config.xScaleType;
  return {
    title: () => config.title ?? '',
    container: () => config.container ?? '',
    getSeriesCount: () => series.length,
    getSeriesAt: (i: number) => series[i] ?? null,
    ...(chartType ? { getType: () => chartType } : {}),
    ...(stackMode ? { yScale: () => ({ stackMode: () => stackMode }) } : {}),
    ...(xScaleType ? { xScale: () => ({ getType: () => xScaleType }) } : {}),
    ...(dataRows
      ? { data: () => ({ getIterator: () => createIterator(dataRows) }) }
      : {}),
    ...(xTitle ? { xAxis: () => createAxis(xTitle) } : {}),
    ...(yTitle ? { yAxis: () => createAxis(yTitle) } : {}),
  };
}

function createBarChart(
  title: string,
  data: Array<[string, number]> = [['A', 1], ['B', 2]],
  extra: Omit<MockChartConfig, 'title' | 'series'> = {},
): AnyChartInstance {
  return createChart({ title, series: [createBarSeries(data)], ...extra });
}

/** Create a container div (attached to body) holding a rendered <svg>. */
function createContainerWithSvg(id: string, parent?: HTMLElement): HTMLElement {
  const container = document.createElement('div');
  container.id = id;
  const svg = document.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);
  (parent ?? document.body).appendChild(container);
  return container;
}

function stubRect(
  el: HTMLElement,
  rect: { top: number; left: number; width?: number; height?: number },
): void {
  const width = rect.width ?? 100;
  const height = rect.height ?? 100;
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      top: rect.top,
      left: rect.left,
      width,
      height,
      right: rect.left + width,
      bottom: rect.top + height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  });
}

function firstLayer(maidr: NonNullable<ReturnType<typeof anyChartsToMaidr>>, r: number, c: number): MaidrLayer {
  return maidr.subplots[r][c].layers[0];
}

// Silence the adapter's diagnostic warnings so test output stays readable.
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Single-panel behavior (must remain EXACTLY as before)
// ---------------------------------------------------------------------------

describe('anyChartToMaidr (single panel, unchanged)', () => {
  it('emits a 1x1 grid with un-prefixed selectors and layer ids', () => {
    const chart = createBarChart('Tips', [['Sat', 87], ['Sun', 76]], {
      xTitle: 'Day',
      yTitle: 'Count',
    });

    const result = anyChartToMaidr(chart);

    expect(result).not.toBeNull();
    expect(result?.id).toBe('anychart-maidr');
    expect(result?.title).toBe('Tips');
    expect(result?.subplots).toHaveLength(1);
    expect(result?.subplots[0]).toHaveLength(1);

    const subplot = result!.subplots[0][0];
    // Single-panel subplots carry no panel selector.
    expect(subplot.selector).toBeUndefined();

    const layer = subplot.layers[0];
    expect(layer.id).toBe('0');
    expect(layer.type).toBe(TraceType.BAR);
    // No panel-token scoping in single-panel mode.
    expect(layer.selectors).toBe('[data-maidr-anychart-bar^="0-"]');
    // Layer titles are not set in single-panel mode.
    expect(layer.title).toBeUndefined();
    expect(layer.axes?.x).toEqual({ label: 'Day' });
    expect(layer.axes?.y).toEqual({ label: 'Count' });

    const data = layer.data as BarPoint[];
    expect(data).toEqual([{ x: 'Sat', y: 87 }, { x: 'Sun', y: 76 }]);
  });

  it('returns null for a chart with no convertible series', () => {
    const chart = createChart({ series: [createSeries('funnel', [{ x: 'A', value: 1 }])] });
    expect(anyChartToMaidr(chart)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pie charts (single-dataset, no series API)
// ---------------------------------------------------------------------------

describe('anyChartToMaidr (pie chart)', () => {
  it('emits a flat pie layer from the chart-level data view', () => {
    const chart = createPieChart('Fruit sales', [
      ['Apples', 30],
      ['Bananas', 50],
      ['Cherries', 20],
    ]);

    const result = anyChartToMaidr(chart);

    expect(result?.title).toBe('Fruit sales');
    const layer = result!.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.PIE);
    expect(layer.selectors).toBe('[data-maidr-anychart-pie-slice^="0-"]');
    expect(layer.data as PiePoint[]).toEqual([
      { x: 'Apples', y: 30 },
      { x: 'Bananas', y: 50 },
      { x: 'Cherries', y: 20 },
    ]);
  });

  it('names the two dimensions a pie has no axis to name', () => {
    const chart = createPieChart('Fruit', [['Apples', 30]]);

    const layer = anyChartToMaidr(chart)!.subplots[0][0].layers[0];

    expect(layer.axes).toEqual({ x: { label: 'Label' }, y: { label: 'Value' } });
  });

  it('keeps caller-supplied axis labels', () => {
    const chart = createPieChart('Fruit', [['Apples', 30]]);

    const layer = anyChartToMaidr(chart, { axes: { x: 'Fruit', y: 'Units' } })!
      .subplots[0][0]
      .layers[0];

    expect(layer.axes).toEqual({ x: { label: 'Fruit' }, y: { label: 'Units' } });
  });

  it('drops slices with no numeric value, which AnyChart draws no wedge for', () => {
    const chart = createPieChart('Fruit', [
      ['Apples', 30],
      ['Bananas', null],
      ['Cherries', 20],
    ]);

    const layer = anyChartToMaidr(chart)!.subplots[0][0].layers[0];

    expect(layer.data as PiePoint[]).toEqual([
      { x: 'Apples', y: 30 },
      { x: 'Cherries', y: 20 },
    ]);
  });

  it('scopes pie selectors to the panel token in multi-panel mode', () => {
    const pie = createPieChart('Pie', [['Apples', 30]]);
    const bar = createBarChart('Bar');

    const result = anyChartsToMaidr([[pie, bar]], { id: 'fig' });

    expect(firstLayer(result!, 0, 0).type).toBe(TraceType.PIE);
    expect(firstLayer(result!, 0, 0).selectors).toBe(
      '[data-maidr-anychart-panel="fig-0-0"] '
      + '[data-maidr-anychart-pie-slice^="fig-0-0:0-"]',
    );
  });
});

describe('bindAnyChart (pie stamping)', () => {
  it('stamps one attribute per wedge, in slice order, and skips the connector', () => {
    const container = createContainerWithSvg('pie-bind');
    const wedges = appendPieWedges(container, 3);
    const chart = createPieChart(
      'Fruit',
      [['Apples', 30], ['Bananas', 50], ['Cherries', 20]],
      { container },
    );

    bindAnyChart(chart);

    expect(wedges.map(w => w.getAttribute('data-maidr-anychart-pie-slice')))
      .toEqual(['0-0', '0-1', '0-2']);
    // The straight label connector is not a wedge and must stay unstamped.
    const connector = container.querySelector('#ac_path_connector');
    expect(connector?.getAttribute('data-maidr-anychart-pie-slice')).toBeNull();
    // Every stamped wedge is reachable through the layer's own selector.
    expect(container.querySelectorAll('[data-maidr-anychart-pie-slice^="0-"]'))
      .toHaveLength(3);

    // Binding wraps the container in a host element; drop the pair so the
    // multi-panel bind tests below still find their own host first.
    container.closest('[data-maidr-anychart-host]')?.remove();
  });

  it('counts only the slices the layer emits, so a null row does not warn', () => {
    // AnyChart draws no wedge for a valueless row, so a three-row pie renders
    // two wedges — and the layer emits two slices. Counting the raw rows would
    // report a shortfall on a chart that is in fact perfectly aligned.
    const container = createContainerWithSvg('pie-null');
    const wedges = appendPieWedges(container, 2);
    const chart = createPieChart(
      'Fruit',
      [['Apples', 30], ['Bananas', null], ['Cherries', 20]],
      { container },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(wedges.map(w => w.getAttribute('data-maidr-anychart-pie-slice')))
      .toEqual(['0-0', '0-1']);
    expect(warnSpy.mock.calls.flat().join(' ')).not.toContain('pie wedges');

    container.closest('[data-maidr-anychart-host]')?.remove();
  });

  it.each([
    ['after the fill, as AnyChart emits them', 'after' as const],
    ['before the fill, which nothing may depend on not happening', 'before' as const],
  ])('skips the stroke-only twin drawn %s', (_case, order) => {
    // AnyChart draws every slice twice — once filled, once `fill="none"` for
    // the stroke — so four slices offer eight arc paths and the count guard
    // used to fire on a chart that was working. Taking the first N in DOM
    // order picked the fills only because the fills come first; were that
    // ever to flip, every highlight would land on an invisible path while the
    // announcement carried on naming the right slice.
    const container = createContainerWithSvg(`pie-outline-${order}`);
    const wedges = appendPieWedges(container, 4, order);
    const chart = createPieChart(
      'Fruit',
      [['Apples', 30], ['Bananas', 50], ['Cherries', 20], ['Dates', 10]],
      { container },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(wedges.map(w => w.getAttribute('data-maidr-anychart-pie-slice')))
      .toEqual(['0-0', '0-1', '0-2', '0-3']);
    // Eight candidates, four slices: the guard used to report a mismatch here.
    expect(warnSpy.mock.calls.flat().join(' ')).not.toContain('pie wedges');
    // Nothing invisible was stamped, so a highlight cannot land on an outline.
    expect(container.querySelectorAll('[data-maidr-anychart-pie-slice]'))
      .toHaveLength(4);
    expect(
      container.querySelector('#ac_path_0_outline')
        ?.getAttribute('data-maidr-anychart-pie-slice'),
    ).toBeNull();

    container.closest('[data-maidr-anychart-host]')?.remove();
  });

  it('runs only the pie stamper, so a working pie logs nothing', () => {
    // A pie carries no series API at all, so every XY stamper threw on one and
    // warned before the pie stamper did the real work: two console warnings on
    // a correctly rendered chart, in exactly the place someone debugging a
    // genuine stamping failure would look.
    const container = createContainerWithSvg('pie-quiet');
    appendPieWedges(container, 3, 'after');
    const chart = createPieChart(
      'Fruit',
      [['Apples', 30], ['Bananas', 50], ['Cherries', 20]],
      { container },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(warnSpy).not.toHaveBeenCalled();

    container.closest('[data-maidr-anychart-host]')?.remove();
  });

  it('warns and stamps nothing when no AnyChart layer holds an arc path', () => {
    // The wedge-DOM assumption has failed: the layers are there but nothing in
    // them is arc-drawn. Stamping the first arc-shaped paths found anywhere in
    // the SVG would point slice 0 at a legend marker or a rounded frame, so
    // the highlight is dropped and the reason is reported instead.
    const container = createContainerWithSvg('pie-no-arcs');
    const svg = container.querySelector('svg') as unknown as SVGElement;
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = 'ac_layer_1';
    svg.appendChild(layer);
    const straight = document.createElementNS(SVG_NS, 'path');
    straight.id = 'ac_path_0';
    straight.setAttribute('d', 'M 0 0 L 10 10 Z');
    layer.appendChild(straight);
    // An arc-drawn path outside every layer — exactly what the whole-SVG
    // fallback would have mistaken for slice 0.
    const decoration = document.createElementNS(SVG_NS, 'path');
    decoration.id = 'ac_path_frame';
    decoration.setAttribute('d', 'M 0 0 A 4 4 0 0 1 8 0 Z');
    svg.appendChild(decoration);
    const chart = createPieChart('Fruit', [['Apples', 30]], { container });
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(decoration.getAttribute('data-maidr-anychart-pie-slice')).toBeNull();
    expect(straight.getAttribute('data-maidr-anychart-pie-slice')).toBeNull();
    expect(warnSpy.mock.calls.flat().join(' ')).toContain('no pie wedges to highlight');

    container.closest('[data-maidr-anychart-host]')?.remove();
  });
});

// ---------------------------------------------------------------------------
// Area series (plain, stacked and normalized)
// ---------------------------------------------------------------------------

/** An area series carrying one value per month. */
function createAreaSeries(
  type: 'area' | 'spline-area',
  values: Array<[string, number]>,
): AnyChartSeries {
  return createSeries(type, values.map(([x, value]) => ({ x, value })));
}

describe('anyChartToMaidr (area series)', () => {
  it('reads an unstacked area series as an area trace, not a line one', () => {
    const chart = createChart({
      title: 'Rainfall',
      series: [createAreaSeries('area', [['Jan', 3], ['Feb', 5]])],
    });

    const layer = anyChartToMaidr(chart)!.subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.AREA);
    // An area is a stroked polyline with a fill under it, so its points are
    // the line's markers and it shares the line's stamped selector.
    expect(layer.selectors).toBe('[data-maidr-anychart-line-point^="0-"]');
    expect(layer.data as LinePoint[][]).toEqual([
      [{ x: 'Jan', y: 3 }, { x: 'Feb', y: 5 }],
    ]);
  });

  it('keeps unstacked area series in one layer each', () => {
    const chart = createChart({
      title: 'Rainfall',
      series: [
        createAreaSeries('area', [['Jan', 3]]),
        createAreaSeries('spline-area', [['Jan', 1]]),
      ],
    });

    const layers = anyChartToMaidr(chart)!.subplots[0][0].layers;

    // Unstacked bands are read independently of one another, so nothing is
    // gained by merging them and the per-series layer ids stay meaningful.
    expect(layers.map(l => [l.id, l.type])).toEqual([
      ['0', TraceType.AREA],
      ['1', TraceType.AREA],
    ]);
  });

  it('merges the bands of a stacked chart into one layer', () => {
    // Stacking lives on the y scale, not on a series: AnyChart calls both of
    // these plain area series either way.
    const chart = createChart({
      title: 'Rainfall',
      stackMode: 'value',
      series: [
        createAreaSeries('area', [['Jan', 3], ['Feb', 5]]),
        createAreaSeries('spline-area', [['Jan', 1], ['Feb', 2]]),
      ],
    });

    const layers = anyChartToMaidr(chart)!.subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.STACKED_AREA);
    // Each band carries its OWN value, never the running edge: AreaTrace sums
    // the layer itself, and pre-accumulating here would double-count.
    expect(layers[0].data as LinePoint[][]).toEqual([
      [{ x: 'Jan', y: 3, z: 'area' }, { x: 'Feb', y: 5, z: 'area' }],
      [{ x: 'Jan', y: 1, z: 'spline-area' }, { x: 'Feb', y: 2, z: 'spline-area' }],
    ]);
    // One selector per band, in band order — a shortfall would drop the
    // highlight for the whole layer, not for the one band that went missing.
    expect(layers[0].selectors).toEqual([
      '[data-maidr-anychart-line-point^="0-"]',
      '[data-maidr-anychart-line-point^="1-"]',
    ]);
  });

  it('reads a percent-stacked chart as a normalized area', () => {
    const chart = createChart({
      title: 'Share',
      stackMode: 'percent',
      series: [
        createAreaSeries('area', [['Jan', 3]]),
        createAreaSeries('area', [['Jan', 1]]),
      ],
    });

    const layers = anyChartToMaidr(chart)!.subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.NORMALIZED_AREA);
  });

  it('leaves a non-area series on a stacked chart in its own layer', () => {
    // Only the area family is promoted here; a stacked column is a separate
    // trace type this adapter does not claim to produce yet, and folding one
    // into the area layer would describe it as a band.
    const chart = createChart({
      title: 'Mixed',
      stackMode: 'value',
      series: [
        createAreaSeries('area', [['Jan', 3]]),
        createBarSeries([['Jan', 7]]),
      ],
    });

    const layers = anyChartToMaidr(chart)!.subplots[0][0].layers;

    expect(layers.map(l => l.type)).toEqual([TraceType.BAR, TraceType.STACKED_AREA]);
    expect(layers.map(l => l.id)).toEqual(['1', '0']);
  });

  it('treats a chart with no y scale as unstacked', () => {
    // `yScale()` is absent on every non-Cartesian chart, and asking must not
    // turn a plain area into a stack.
    const chart = createChart({
      title: 'Rainfall',
      series: [createAreaSeries('area', [['Jan', 3]])],
    });

    expect(anyChartToMaidr(chart)!.subplots[0][0].layers[0].type)
      .toBe(TraceType.AREA);
  });
});

// ---------------------------------------------------------------------------
// Funnel / pyramid charts (single-dataset, no series API)
// ---------------------------------------------------------------------------

describe('anyChartToMaidr (funnel chart)', () => {
  it('emits a flat funnel layer from the chart-level data view', () => {
    const chart = createFunnelChart('Signups', [
      ['Visited', 10000],
      ['Signed up', 2400],
      ['Paid', 100],
    ]);

    const result = anyChartToMaidr(chart);

    expect(result?.title).toBe('Signups');
    const layer = result!.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.FUNNEL);
    expect(layer.selectors).toBe('[data-maidr-anychart-funnel-stage^="0-"]');
    // A funnel's default mapping is `name` / `value`, not the pie's `x`.
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Visited', y: 10000 },
      { x: 'Signed up', y: 2400 },
      { x: 'Paid', y: 100 },
    ]);
  });

  it('routes a pyramid through the same path', () => {
    // AnyChart draws both from one class; only which end tapers differs, and
    // the stages are still ordered shares of one another.
    const chart = createFunnelChart('Pyramid', [['Top', 5], ['Base', 20]], {
      type: 'pyramid',
    });

    const layer = anyChartToMaidr(chart)!.subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.FUNNEL);
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Top', y: 5 },
      { x: 'Base', y: 20 },
    ]);
  });

  it('names the two dimensions a funnel has no axis to name', () => {
    const chart = createFunnelChart('Signups', [['Visited', 10]]);

    const layer = anyChartToMaidr(chart)!.subplots[0][0].layers[0];

    expect(layer.axes).toEqual({ x: { label: 'Stage' }, y: { label: 'Count' } });
  });

  it('drops stages with no numeric value, which AnyChart draws no segment for', () => {
    const chart = createFunnelChart('Signups', [
      ['Visited', 10000],
      ['Unknown', null],
      ['Paid', 100],
    ]);

    expect(anyChartToMaidr(chart)!.subplots[0][0].layers[0].data as BarPoint[])
      .toEqual([{ x: 'Visited', y: 10000 }, { x: 'Paid', y: 100 }]);
  });

  it('scopes funnel selectors to the panel token in multi-panel mode', () => {
    const funnel = createFunnelChart('Funnel', [['Visited', 10]]);
    const bar = createBarChart('Bar');

    const result = anyChartsToMaidr([[funnel, bar]], { id: 'fig' });

    expect(firstLayer(result!, 0, 0).selectors).toBe(
      '[data-maidr-anychart-panel="fig-0-0"] '
      + '[data-maidr-anychart-funnel-stage^="fig-0-0:0-"]',
    );
  });
});

describe('bindAnyChart (funnel stamping)', () => {
  it('stamps one attribute per segment, in stage order, and skips the legend', () => {
    const container = createContainerWithSvg('funnel-bind');
    const segments = appendFunnelSegments(container, 3);
    const chart = createFunnelChart(
      'Signups',
      [['Visited', 10000], ['Signed up', 2400], ['Paid', 100]],
      { container },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(segments.map(s => s.getAttribute('data-maidr-anychart-funnel-stage')))
      .toEqual(['0-0', '0-1', '0-2']);
    // A legend icon is a filled straight-sided path too — only the density of
    // the segment layer tells the two apart, and it must win.
    expect(container.querySelector('#ac_path_legend_0')
      ?.getAttribute('data-maidr-anychart-funnel-stage')).toBeNull();
    // The stroke-only twin is invisible; a highlight landing on one would look
    // like nothing happened while the announcement carried on.
    expect(container.querySelector('#ac_path_0_outline')
      ?.getAttribute('data-maidr-anychart-funnel-stage')).toBeNull();
    expect(container.querySelectorAll('[data-maidr-anychart-funnel-stage^="0-"]'))
      .toHaveLength(3);
    expect(warnSpy).not.toHaveBeenCalled();

    container.closest('[data-maidr-anychart-host]')?.remove();
  });

  it('warns and stamps nothing when no AnyChart layer holds a filled path', () => {
    // The segment-DOM assumption has failed. Widening the search to the whole
    // SVG would stamp whatever filled path it met first — a background panel,
    // a legend icon — as stage 0, so the highlight is dropped instead.
    const container = createContainerWithSvg('funnel-no-fills');
    const svg = container.querySelector('svg') as unknown as SVGElement;
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = 'ac_layer_1';
    svg.appendChild(layer);
    const outline = document.createElementNS(SVG_NS, 'path');
    outline.id = 'ac_path_0';
    outline.setAttribute('d', 'M 0 0 L 10 0 L 10 10 Z');
    outline.setAttribute('fill', 'none');
    layer.appendChild(outline);
    // A filled path outside every layer — what the whole-SVG fallback would
    // have mistaken for stage 0.
    const panel = document.createElementNS(SVG_NS, 'path');
    panel.id = 'ac_path_panel';
    panel.setAttribute('d', 'M 0 0 L 99 0 L 99 99 Z');
    panel.setAttribute('fill', '#eeeeee');
    svg.appendChild(panel);
    const chart = createFunnelChart('Signups', [['Visited', 10]], { container });
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(panel.getAttribute('data-maidr-anychart-funnel-stage')).toBeNull();
    expect(container.querySelectorAll('[data-maidr-anychart-funnel-stage]'))
      .toHaveLength(0);
    expect(warnSpy.mock.calls.flat().join(' '))
      .toContain('no funnel segments to highlight');

    container.closest('[data-maidr-anychart-host]')?.remove();
  });
});

// ---------------------------------------------------------------------------
// Tag cloud charts (single-dataset, no series API)
// ---------------------------------------------------------------------------

describe('anyChartToMaidr (tag cloud)', () => {
  it('emits a word cloud layer with one selector per term, in data order', () => {
    const chart = createWordCloudChart('Topics', [
      ['maidr', 12],
      ['sonification', 5],
      ['braille', 9],
    ]);

    const result = anyChartToMaidr(chart);

    const layer = result!.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.WORD_CLOUD);
    expect(layer.data as WordCloudPoint[]).toEqual([
      { x: 'maidr', y: 12 },
      { x: 'sonification', y: 5 },
      { x: 'braille', y: 9 },
    ]);
    // A prefix selector would resolve in document order, which for a cloud is
    // its packing spiral; WordCloudTrace indexes by each term's position in
    // the declared data, so the array has to arrive in that order.
    expect(layer.selectors).toEqual([
      '[data-maidr-anychart-word="0-0"]',
      '[data-maidr-anychart-word="0-1"]',
      '[data-maidr-anychart-word="0-2"]',
    ]);
    expect(layer.axes).toEqual({ x: { label: 'Term' }, y: { label: 'Weight' } });
  });

  it('scopes word cloud selectors to the panel token in multi-panel mode', () => {
    const cloud = createWordCloudChart('Topics', [['maidr', 12]]);
    const bar = createBarChart('Bar');

    const result = anyChartsToMaidr([[cloud, bar]], { id: 'fig' });

    expect(firstLayer(result!, 0, 0).selectors).toEqual([
      '[data-maidr-anychart-panel="fig-0-0"] '
      + '[data-maidr-anychart-word="fig-0-0:0-0"]',
    ]);
  });
});

describe('bindAnyChart (tag cloud stamping)', () => {
  it('pairs each term with its own glyph by text, not by document order', () => {
    // A cloud packs its words outwards from the heaviest, so the SVG order has
    // no relation to the data order. Counting glyphs off would announce one
    // term while highlighting another.
    const container = createContainerWithSvg('cloud-bind');
    const [gamma, alpha, beta] = appendCloudWords(container, ['gamma', 'alpha', 'beta']);
    const chart = createWordCloudChart(
      'Topics',
      [['alpha', 12], ['beta', 5], ['gamma', 9]],
      { container },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(alpha.getAttribute('data-maidr-anychart-word')).toBe('0-0');
    expect(beta.getAttribute('data-maidr-anychart-word')).toBe('0-1');
    expect(gamma.getAttribute('data-maidr-anychart-word')).toBe('0-2');
    expect(warnSpy).not.toHaveBeenCalled();

    container.closest('[data-maidr-anychart-host]')?.remove();
  });

  it('stamps nothing when a term cannot be placed on exactly one glyph', () => {
    // `WordCloudTrace` drops the highlight for a partial resolution anyway, so
    // a half-stamped cloud costs the same highlight while looking, in the DOM,
    // like it had worked.
    const container = createContainerWithSvg('cloud-ambiguous');
    appendCloudWords(container, ['alpha', 'alpha']);
    const chart = createWordCloudChart(
      'Topics',
      [['alpha', 12], ['beta', 5]],
      { container },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(container.querySelectorAll('[data-maidr-anychart-word]')).toHaveLength(0);
    expect(warnSpy.mock.calls.flat().join(' '))
      .toContain('Expected exactly one rendered word');

    container.closest('[data-maidr-anychart-host]')?.remove();
  });
});

// ---------------------------------------------------------------------------
// Sankey diagrams (single-dataset, no series API)
// ---------------------------------------------------------------------------

describe('anyChartToMaidr (sankey chart)', () => {
  it('emits the flows, leaving the nodes for the trace to derive', () => {
    const chart = createSankeyChart('Energy', [
      ['Coal', 'Electricity', 34],
      ['Coal', 'Heat', 14],
      ['Gas', 'Electricity', 12],
    ]);

    const result = anyChartToMaidr(chart);

    expect(result?.title).toBe('Energy');
    const layer = result!.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.SANKEY);
    expect(layer.data as FlowPoint[]).toEqual([
      { source: 'Coal', target: 'Electricity', value: 34 },
      { source: 'Coal', target: 'Heat', value: 14 },
      { source: 'Gas', target: 'Electricity', value: 12 },
    ]);
    // One exact-match selector per flow, in declared order: FlowTrace indexes
    // the resolved ribbons by each flow's own position, so a prefix selector
    // resolving in document order would pair a node with the wrong ribbon.
    expect(layer.selectors).toEqual([
      '[data-maidr-anychart-flow="0-0"]',
      '[data-maidr-anychart-flow="0-1"]',
      '[data-maidr-anychart-flow="0-2"]',
    ]);
    expect(layer.axes).toEqual({ x: { label: 'Node' }, y: { label: 'Flow' } });
  });

  it('drops the rows AnyChart draws no ribbon for', () => {
    const chart = createSankeyChart('Energy', [
      ['Coal', 'Electricity', 34],
      // A dropoff: drawn, but it names no target and so is not a flow.
      ['Coal', null, 6],
      // No weight at all, which the chart skips outright.
      ['Gas', 'Heat', null],
      ['Gas', 'Electricity', 12],
    ]);

    expect(anyChartToMaidr(chart)!.subplots[0][0].layers[0].data as FlowPoint[])
      .toEqual([
        { source: 'Coal', target: 'Electricity', value: 34 },
        { source: 'Gas', target: 'Electricity', value: 12 },
      ]);
  });

  it('scopes sankey selectors to the panel token in multi-panel mode', () => {
    const sankey = createSankeyChart('Energy', [['Coal', 'Heat', 14]]);
    const bar = createBarChart('Bar');

    const result = anyChartsToMaidr([[sankey, bar]], { id: 'fig' });

    expect(firstLayer(result!, 0, 0).selectors).toEqual([
      '[data-maidr-anychart-panel="fig-0-0"] '
      + '[data-maidr-anychart-flow="fig-0-0:0-0"]',
    ]);
  });
});

describe('bindAnyChart (sankey stamping)', () => {
  it('stamps one attribute per ribbon, in flow order, and skips the nodes', () => {
    const container = createContainerWithSvg('sankey-bind');
    const ribbons = appendSankeyRibbons(container, 3);
    const chart = createSankeyChart(
      'Energy',
      [['Coal', 'Electricity', 34], ['Coal', 'Heat', 14], ['Gas', 'Heat', 12]],
      { container },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(ribbons.map(r => r.getAttribute('data-maidr-anychart-flow')))
      .toEqual(['0-0', '0-1', '0-2']);
    // A node is a filled straight-sided path in the ribbons' own layer; only
    // the curve test tells the two apart.
    expect(container.querySelector('#ac_path_node_0')
      ?.getAttribute('data-maidr-anychart-flow')).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();

    container.closest('[data-maidr-anychart-host]')?.remove();
  });

  it('stamps nothing when the ribbon count disagrees with the flow count', () => {
    // The extra ribbon is a dropoff, which is drawn but is not a flow. Pairing
    // by position past it would name the wrong flow for every later ribbon, and
    // FlowTrace drops the highlight for a partial resolution anyway.
    const container = createContainerWithSvg('sankey-dropoff');
    appendSankeyRibbons(container, 3);
    const chart = createSankeyChart(
      'Energy',
      [['Coal', 'Electricity', 34], ['Coal', 'Heat', 14]],
      { container },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(container.querySelectorAll('[data-maidr-anychart-flow]')).toHaveLength(0);
    expect(warnSpy.mock.calls.flat().join(' '))
      .toContain('Expected 2 sankey ribbons but found 3');

    container.closest('[data-maidr-anychart-host]')?.remove();
  });
});

// ---------------------------------------------------------------------------
// Waterfall charts (series-backed, read as one bridge)
// ---------------------------------------------------------------------------

describe('anyChartToMaidr (waterfall chart)', () => {
  it('accumulates the running total from a diff-mode series', () => {
    const chart = createWaterfallChart('Budget', [
      ['Opening', 1200],
      ['Marketing', -250],
      ['Sales', 480],
      ['Closing', 0, true],
    ]);

    const layer = anyChartToMaidr(chart)!.subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.WATERFALL);
    expect(layer.data as WaterfallPoint[]).toEqual([
      // The first step is a total whether or not the row says so: nothing is
      // carried into it, so it states the value the bridge opens at.
      { x: 'Opening', start: 0, end: 1200, delta: 1200, kind: 'total' },
      { x: 'Marketing', start: 1200, end: 950, delta: -250, kind: 'decrease' },
      { x: 'Sales', start: 950, end: 1430, delta: 480, kind: 'increase' },
      // A declared total sits on the baseline and restates the running total.
      { x: 'Closing', start: 0, end: 1430, delta: 1430, kind: 'total' },
    ]);
    expect(layer.selectors).toBe('[data-maidr-anychart-waterfall-step^="0-"]');
  });

  it('reads absolute-mode values as the totals they are', () => {
    // In absolute mode a row's value IS the running total, so the contribution
    // is the difference — the reverse of diff mode, and the same numbers.
    const chart = createWaterfallChart(
      'Budget',
      [['Opening', 1200], ['Marketing', 950], ['Sales', 1430]],
      { dataMode: 'absolute' },
    );

    expect(anyChartToMaidr(chart)!.subplots[0][0].layers[0].data as WaterfallPoint[])
      .toEqual([
        { x: 'Opening', start: 0, end: 1200, delta: 1200, kind: 'total' },
        { x: 'Marketing', start: 1200, end: 950, delta: -250, kind: 'decrease' },
        { x: 'Sales', start: 950, end: 1430, delta: 480, kind: 'increase' },
      ]);
  });

  it('leaves the running total alone when totals are drawn at their own value', () => {
    // With `drawTotalsAsAbsolute` the marked total states its own value and the
    // bridge carries on from where it left off. Accumulating it would announce
    // a total the chart never reached — and every later step from it.
    const chart = createWaterfallChart(
      'Budget',
      [['Opening', 100], ['Subtotal', 90, true], ['Q1', 20]],
      { totalsAsAbsolute: true },
    );

    expect(anyChartToMaidr(chart)!.subplots[0][0].layers[0].data as WaterfallPoint[])
      .toEqual([
        { x: 'Opening', start: 0, end: 100, delta: 100, kind: 'total' },
        { x: 'Subtotal', start: 0, end: 90, delta: 90, kind: 'total' },
        { x: 'Q1', start: 100, end: 120, delta: 20, kind: 'increase' },
      ]);
  });

  it('reads a stacked waterfall as the one bridge it draws', () => {
    // Several series stack within each category, and the step's contribution is
    // everything they add there together. Emitting a layer per series would
    // give each its own running total and none of them the chart's.
    const chart = createChart({
      title: 'Budget',
      type: 'waterfall',
      series: [
        createSeries('waterfall', [
          { x: 'Opening', value: 1000 },
          { x: 'Q1', value: 200 },
        ]),
        createSeries('waterfall', [
          { x: 'Opening', value: 200 },
          { x: 'Q1', value: -50 },
        ]),
      ],
    });

    const layers = anyChartToMaidr(chart)!.subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].data as WaterfallPoint[]).toEqual([
      { x: 'Opening', start: 0, end: 1200, delta: 1200, kind: 'total' },
      { x: 'Q1', start: 1200, end: 1350, delta: 150, kind: 'increase' },
    ]);
  });

  it('drops steps with no numeric value, which AnyChart draws no bar for', () => {
    const chart = createWaterfallChart('Budget', [
      ['Opening', 100],
      ['Unknown', null],
      ['Q1', 50],
    ]);

    expect(anyChartToMaidr(chart)!.subplots[0][0].layers[0].data as WaterfallPoint[])
      .toEqual([
        { x: 'Opening', start: 0, end: 100, delta: 100, kind: 'total' },
        { x: 'Q1', start: 100, end: 150, delta: 50, kind: 'increase' },
      ]);
  });
});

describe('bindAnyChart (waterfall stamping)', () => {
  it('stamps one attribute per step, in category order, and skips the connectors', () => {
    const container = createContainerWithSvg('waterfall-bind');
    const bars = appendWaterfallBars(container, 3);
    const chart = createWaterfallChart(
      'Budget',
      [['Opening', 1200], ['Marketing', -250], ['Sales', 480]],
      { container },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(bars.map(b => b.getAttribute('data-maidr-anychart-waterfall-step')))
      .toEqual(['0-0', '0-1', '0-2']);
    // The connector between two steps is stroke-only; a highlight landing on
    // one would look like nothing happened.
    expect(container.querySelector('#ac_path_connector_0')
      ?.getAttribute('data-maidr-anychart-waterfall-step')).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();

    container.closest('[data-maidr-anychart-host]')?.remove();
  });

  it('stamps nothing when the bar count disagrees with the step count', () => {
    // What a stacked waterfall looks like from the DOM: one bar per series per
    // category, and no single bar to point a step at.
    const container = createContainerWithSvg('waterfall-stacked');
    appendWaterfallBars(container, 4);
    const chart = createWaterfallChart(
      'Budget',
      [['Opening', 1200], ['Marketing', -250]],
      { container },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(container.querySelectorAll('[data-maidr-anychart-waterfall-step]'))
      .toHaveLength(0);
    expect(warnSpy.mock.calls.flat().join(' '))
      .toContain('Expected 2 waterfall bars but found 4');

    container.closest('[data-maidr-anychart-host]')?.remove();
  });
});

// ---------------------------------------------------------------------------
// Marimekko charts (series-backed, read as one table)
// ---------------------------------------------------------------------------

describe('anyChartToMaidr (marimekko chart)', () => {
  it('emits one table and carries each column\'s share on all of its cells', () => {
    // Column totals 30 and 70, so the widths are the shares of 100 the chart
    // draws each column at — the second magnitude a mosaic exists to show, and
    // the one number the rows do not hold.
    const chart = createMosaicChart('Survival', [
      ['Survived', [['First', 20], ['Third', 25]]],
      ['Died', [['First', 10], ['Third', 45]]],
    ]);

    const layers = anyChartToMaidr(chart)!.subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.MOSAIC);
    expect(layers[0].data as MosaicPoint[][]).toEqual([
      [
        { x: 'First', y: 20, z: 'Survived', width: 0.3 },
        { x: 'Third', y: 25, z: 'Survived', width: 0.7 },
      ],
      [
        { x: 'First', y: 10, z: 'Died', width: 0.3 },
        { x: 'Third', y: 45, z: 'Died', width: 0.7 },
      ],
    ]);
    expect(layers[0].selectors).toBe('[data-maidr-anychart-tile]');
    // Series-major, which is both what the stamper writes and what the
    // segmented trace reads.
    expect(layers[0].domMapping).toEqual({ order: 'row' });
  });

  it('squares off a category a series does not carry', () => {
    // The trace navigates a grid, so every series needs a value at every
    // column. AnyChart draws no tile for the missing one and adds nothing to
    // the column's total, which is what a zero says.
    const chart = createMosaicChart('Survival', [
      ['Survived', [['First', 20], ['Third', 30]]],
      ['Died', [['Third', 50]]],
    ]);

    const data = anyChartToMaidr(chart)!.subplots[0][0].layers[0].data as MosaicPoint[][];

    expect(data[1][0]).toEqual({ x: 'First', y: 0, z: 'Died', width: 0.2 });
  });

  it('routes barmekko and mekko through the same path', () => {
    const chart = createMosaicChart('Revenue', [['Sales', [['Q1', 4], ['Q2', 6]]]], {
      type: 'barmekko',
    });

    expect(anyChartToMaidr(chart)!.subplots[0][0].layers[0].type)
      .toBe(TraceType.MOSAIC);
  });
});

describe('bindAnyChart (marimekko stamping)', () => {
  it('stamps one attribute per tile, series-major', () => {
    const container = createContainerWithSvg('mosaic-bind');
    const tiles = appendMosaicTiles(container, [2, 2]);
    const chart = createMosaicChart(
      'Survival',
      [
        ['Survived', [['First', 20], ['Third', 25]]],
        ['Died', [['First', 10], ['Third', 45]]],
      ],
      { container },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(tiles.map(t => t.getAttribute('data-maidr-anychart-tile')))
      .toEqual(['0-0', '0-1', '1-0', '1-1']);
    expect(warnSpy).not.toHaveBeenCalled();

    container.closest('[data-maidr-anychart-host]')?.remove();
  });

  it('stamps only the cells the chart draws a tile for', () => {
    // A mekko draws nothing for a cell with no positive value, which is the
    // same accommodation the segmented trace makes when it finds fewer
    // elements than cells.
    const container = createContainerWithSvg('mosaic-gap');
    const tiles = appendMosaicTiles(container, [2, 1]);
    const chart = createMosaicChart(
      'Survival',
      [
        ['Survived', [['First', 20], ['Third', 25]]],
        ['Died', [['Third', 45]]],
      ],
      { container },
    );

    bindAnyChart(chart);

    expect(tiles.map(t => t.getAttribute('data-maidr-anychart-tile')))
      .toEqual(['0-0', '0-1', '1-1']);

    container.closest('[data-maidr-anychart-host]')?.remove();
  });

  it('stamps nothing when the tile count disagrees with the table', () => {
    const container = createContainerWithSvg('mosaic-mismatch');
    appendMosaicTiles(container, [2, 3]);
    const chart = createMosaicChart(
      'Survival',
      [
        ['Survived', [['First', 20], ['Third', 25]]],
        ['Died', [['First', 10], ['Third', 45]]],
      ],
      { container },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(container.querySelectorAll('[data-maidr-anychart-tile]')).toHaveLength(0);
    expect(warnSpy.mock.calls.flat().join(' '))
      .toContain('Expected 4 marimekko tiles but found 5');

    container.closest('[data-maidr-anychart-host]')?.remove();
  });
});

// ---------------------------------------------------------------------------
// Radar / polar charts (series-backed, discriminated only by chart type)
// ---------------------------------------------------------------------------

describe('anyChartToMaidr (radial charts)', () => {
  it('reads a radar chart as spokes, not as the line series it reports', () => {
    const chart = createRadialChart('Skills', 'line', [
      ['Speed', 7],
      ['Power', 4],
      ['Range', 9],
    ]);

    const layer = anyChartToMaidr(chart)!.subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.RADAR);
    expect(layer.data as LinePoint[][]).toEqual([[
      { x: 'Speed', y: 7 },
      { x: 'Power', y: 4 },
      { x: 'Range', y: 9 },
    ]]);
    // The line attribute is one the radar stamper never writes: its stamper
    // pairs marks with spokes by shape, because on a circle the line
    // stamper's left-to-right order is not data order.
    expect(layer.selectors).toBe('[data-maidr-anychart-spoke^="0-"]');
  });

  it('reads a polar column series as the wedges it draws', () => {
    const chart = createRadialChart('Wind', 'column', [['N', 12], ['E', 5]], {
      type: 'polar',
    });

    expect(anyChartToMaidr(chart)!.subplots[0][0].layers[0].type)
      .toBe(TraceType.POLAR_AREA);
  });

  it('reads a polar line series as a radar, since it draws the same outline', () => {
    const chart = createRadialChart('Wind', 'line', [['N', 12], ['E', 5]], {
      type: 'polar',
    });

    expect(anyChartToMaidr(chart)!.subplots[0][0].layers[0].type)
      .toBe(TraceType.RADAR);
  });

  it('skips a radial series whose rows carry no value', () => {
    // A polar rangeColumn carries `low` / `high`; read as a radar every spoke
    // would be announced as zero.
    const chart = createRadialChart('Wind', 'rangeColumn', [['N', 12]], {
      type: 'polar',
    });

    expect(anyChartToMaidr(chart)).toBeNull();
  });

  it('scopes radial selectors to the panel token in multi-panel mode', () => {
    const radar = createRadialChart('Skills', 'line', [['Speed', 7]]);
    const bar = createBarChart('Bar');

    const result = anyChartsToMaidr([[radar, bar]], { id: 'fig' });

    expect(firstLayer(result!, 0, 0).selectors).toBe(
      '[data-maidr-anychart-panel="fig-0-0"] '
      + '[data-maidr-anychart-spoke^="fig-0-0:0-"]',
    );
  });
});

describe('bindAnyChart (radar stamping)', () => {
  it('stamps one attribute per mark, in spoke order, and skips the web', () => {
    const container = createContainerWithSvg('radar-bind');
    const marks = appendRadarMarks(container, 3);
    const chart = createRadialChart(
      'Skills',
      'line',
      [['Speed', 7], ['Power', 4], ['Range', 9]],
      { container },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(marks.map(m => m.getAttribute('data-maidr-anychart-spoke')))
      .toEqual(['0-0', '0-1', '0-2']);
    expect(container.querySelector('#ac_path_grid_0')
      ?.getAttribute('data-maidr-anychart-spoke')).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();

    container.closest('[data-maidr-anychart-host]')?.remove();
  });

  it('stamps nothing for a multi-series radar and says why', () => {
    // AnyChart draws the second series' markers as diamonds, in a layer of
    // their own: there is no shape test that finds both series and no ordering
    // that spans them, so a stamp here would highlight one series while the
    // reader navigated the other.
    const container = createContainerWithSvg('radar-multi');
    appendRadarMarks(container, 3);
    const chart = createRadialChart(
      'Skills',
      'line',
      [['Speed', 7], ['Power', 4], ['Range', 9]],
      { container, series: 2 },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(container.querySelectorAll('[data-maidr-anychart-spoke]')).toHaveLength(0);
    expect(warnSpy.mock.calls.flat().join(' '))
      .toContain('it draws 2 series');

    container.closest('[data-maidr-anychart-host]')?.remove();
  });
});

// ---------------------------------------------------------------------------
// Dot plots and lollipops (a bar's reading, drawn as a point)
// ---------------------------------------------------------------------------

describe('anyChartToMaidr (dot plot)', () => {
  it('reads a marker series against named categories as a dot plot', () => {
    // The labels used to be coerced to 0 by the scatter builder, which turned
    // a dot plot into a chart whose x axis was a single repeated value.
    const chart = createChart({
      title: 'Sales per rep',
      xScaleType: 'ordinal',
      series: [createSeries('marker', [
        { x: 'Ada', value: 12 },
        { x: 'Grace', value: 19 },
      ])],
    });

    const layer = anyChartToMaidr(chart)!.subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.DOT);
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Ada', y: 12 },
      { x: 'Grace', y: 19 },
    ]);
    // A dot plot IS a marker series, stamped by the same pass a scatter is.
    expect(layer.selectors).toBe('[data-maidr-anychart-point^="0-"]');
  });

  it('leaves a marker series on a measured x axis a scatter', () => {
    // The x value is half the datum on one of these, and reading it as a
    // category would throw it away.
    const chart = createChart({
      title: 'Height against weight',
      xScaleType: 'linear',
      series: [createSeries('marker', [{ x: 3, value: 12 }, { x: 5, value: 19 }])],
    });

    const layer = anyChartToMaidr(chart)!.subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.SCATTER);
    expect(layer.data).toEqual([{ x: 3, y: 12 }, { x: 5, y: 19 }]);
  });

  it('keeps the scatter reading for a build that exposes no x scale', () => {
    const chart = createChart({
      title: 'Height against weight',
      series: [createSeries('marker', [{ x: 3, value: 12 }])],
    });

    expect(anyChartToMaidr(chart)!.subplots[0][0].layers[0].type)
      .toBe(TraceType.SCATTER);
  });

  it('leaves a bubble series alone on an ordinal axis', () => {
    // Its rows carry a size as well, and a dot plot has nowhere to put one.
    const chart = createChart({
      title: 'Sales',
      xScaleType: 'ordinal',
      series: [createSeries('bubble', [{ x: 'Ada', value: 12 }])],
    });

    expect(anyChartToMaidr(chart)!.subplots[0][0].layers[0].type)
      .toBe(TraceType.SCATTER);
  });
});

describe('anyChartToMaidr (lollipop)', () => {
  it('reads a stick series as a lollipop and highlights its marker', () => {
    const chart = createChart({
      title: 'Votes',
      series: [createSeries('stick', [
        { x: 'Yes', value: 42 },
        { x: 'No', value: 17 },
      ])],
    });

    const layer = anyChartToMaidr(chart)!.subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.LOLLIPOP);
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Yes', y: 42 },
      { x: 'No', y: 17 },
    ]);
    // The stick itself is a tall thin stroke the marker filter rejects, so the
    // marker on its end is the element it highlights — the line's attribute.
    expect(layer.selectors).toBe('[data-maidr-anychart-line-point^="0-"]');
  });

  it('enables the markers a lollipop has nothing else to highlight', () => {
    const container = createContainerWithSvg('lollipop-markers');
    const enabled = jest.fn();
    const series = {
      ...createSeries('stick', [{ x: 'Yes', value: 42 }]),
      markers: () => ({ enabled: (...args: [boolean?]) => {
        enabled(...args);
        return false as never;
      } }),
    } as unknown as AnyChartSeries;
    const chart = createChart({ title: 'Votes', container, series: [series] });

    bindAnyChart(chart);

    expect(enabled).toHaveBeenCalledWith(true);

    container.closest('[data-maidr-anychart-host]')?.remove();
  });
});

// ---------------------------------------------------------------------------
// Dumbbells (a range series' two ends, read as a pair)
// ---------------------------------------------------------------------------

describe('anyChartToMaidr (dumbbell chart)', () => {
  it('reads a range series as pairs named by the fields they came from', () => {
    const chart = createRangeChart('Temperature', [
      ['Mon', 4, 12],
      ['Tue', 6, 15],
    ]);

    const layer = anyChartToMaidr(chart)!.subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.DUMBBELL);
    // An object, not an array: the two ends belong to the chart rather than to
    // any one row.
    expect(layer.data).toEqual({
      points: [
        { x: 'Mon', start: 4, end: 12 },
        { x: 'Tue', start: 6, end: 15 },
      ],
      startLabel: 'Low',
      endLabel: 'High',
    });
    expect(layer.selectors).toBe('[data-maidr-anychart-pair^="0-"]');
  });

  it('reads a range-bar series the same way', () => {
    const chart = createRangeChart('Temperature', [['Mon', 4, 12]], {
      seriesType: 'range-bar',
    });

    expect(anyChartToMaidr(chart)!.subplots[0][0].layers[0].type)
      .toBe(TraceType.DUMBBELL);
  });

  it('reads a hilo series the same way, and names no mark of it', () => {
    // Measured on the real library: a `hilo` carries the same `low` / `high`
    // pair and produces a byte-identical payload, but AnyChart draws it as one
    // bare stroke per category with no marker at either end -- the marker is
    // what makes a `stick` highlightable, and there is none here. The layer is
    // emitted without selectors rather than with a stamped-attribute selector
    // that matches nothing, because from inside the model a selector resolving
    // to nothing and one resolving to the wrong thing look the same (#1051).
    const chart = createRangeChart('Temperature', [
      ['Mon', 4, 12],
      ['Tue', 6, 15],
    ], { seriesType: 'hilo' });

    const layer = anyChartToMaidr(chart)!.subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.DUMBBELL);
    expect(layer.data).toEqual({
      points: [
        { x: 'Mon', start: 4, end: 12 },
        { x: 'Tue', start: 6, end: 15 },
      ],
      startLabel: 'Low',
      endLabel: 'High',
    });
    expect(layer.selectors).toBeUndefined();
  });

  it('keeps a caller\'s own selectors for a hilo series', () => {
    // Withholding is about what this adapter can see. A caller who named the
    // marks themselves is describing their own chart and is not overruled.
    const chart = createRangeChart('Temperature', [['Mon', 4, 12]], {
      seriesType: 'hilo',
    });

    const layer = anyChartToMaidr(chart, {
      selectors: ['g.my-hilo path'],
    })!.subplots[0][0].layers[0];

    expect(layer.selectors).toBe('g.my-hilo path');
  });

  it('drops a row missing one of its two ends', () => {
    // AnyChart draws no bar for one, and keeping it would slide every later
    // row's highlight onto its neighbour.
    const chart = createRangeChart('Temperature', [
      ['Mon', 4, 12],
      ['Tue', null, 15],
      ['Wed', 6, 14],
    ]);

    const data = anyChartToMaidr(chart)!.subplots[0][0].layers[0].data as DumbbellData;

    expect(data.points).toEqual([
      { x: 'Mon', start: 4, end: 12 },
      { x: 'Wed', start: 6, end: 14 },
    ]);
  });
});

describe('bindAnyChart (dumbbell stamping)', () => {
  it('stamps one attribute per pair, skipping the hatch twin and the grid', () => {
    const container = createContainerWithSvg('dumbbell-bind');
    const bars = appendRangeBars(container, 3);
    const chart = createRangeChart(
      'Temperature',
      [['Mon', 4, 12], ['Tue', 6, 15], ['Wed', 5, 13]],
      { container },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(bars.map(b => b.getAttribute('data-maidr-anychart-pair')))
      .toEqual(['0-0', '0-1', '0-2']);
    expect(container.querySelector('#ac_path_0_hatch')
      ?.getAttribute('data-maidr-anychart-pair')).toBeNull();
    expect(container.querySelector('#ac_path_grid')
      ?.getAttribute('data-maidr-anychart-pair')).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();

    container.closest('[data-maidr-anychart-host]')?.remove();
  });

  it('counts the drawn pairs, not the declared rows', () => {
    // A row missing an end is dropped from the layer, so counting raw rows
    // here would report a disagreement and lose the highlight for all of it.
    const container = createContainerWithSvg('dumbbell-gap');
    const bars = appendRangeBars(container, 2);
    const chart = createRangeChart(
      'Temperature',
      [['Mon', 4, 12], ['Tue', null, 15], ['Wed', 5, 13]],
      { container },
    );

    bindAnyChart(chart);

    expect(bars.map(b => b.getAttribute('data-maidr-anychart-pair')))
      .toEqual(['0-0', '0-1']);

    container.closest('[data-maidr-anychart-host]')?.remove();
  });

  it('stamps nothing when the bar count disagrees with the pair count', () => {
    const container = createContainerWithSvg('dumbbell-mismatch');
    appendRangeBars(container, 4);
    const chart = createRangeChart(
      'Temperature',
      [['Mon', 4, 12], ['Tue', 6, 15]],
      { container },
    );
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(container.querySelectorAll('[data-maidr-anychart-pair]')).toHaveLength(0);
    expect(warnSpy.mock.calls.flat().join(' '))
      .toContain('Expected 2 range bars but found 4');

    container.closest('[data-maidr-anychart-host]')?.remove();
  });
});

// ---------------------------------------------------------------------------
// Diverging bars (declared, never inferred)
// ---------------------------------------------------------------------------

describe('anyChartToMaidr (diverging chart)', () => {
  /**
   * A stacked bar chart whose two series straddle zero — AnyChart's own
   * tornado / population-pyramid idiom, and indistinguishable from an ordinary
   * stacked bar chart that happens to carry negative values.
   * @returns A mock chart instance carrying both sides
   */
  function createTornadoChart(): AnyChartInstance {
    return createChart({
      title: 'Population',
      stackMode: 'value',
      series: [
        { ...createSeries('bar', [{ x: '0-9', value: -120 }, { x: '10-19', value: -90 }]), name: () => 'Male' },
        { ...createSeries('bar', [{ x: '0-9', value: 115 }, { x: '10-19', value: 95 }]), name: () => 'Female' },
      ],
    });
  }

  it('merges both sides into one signed layer when asked', () => {
    const layer = anyChartToMaidr(createTornadoChart(), { diverging: true })!
      .subplots[0][0]
      .layers[0];

    expect(layer.type).toBe(TraceType.DIVERGING);
    // Signed as the chart draws them: MAIDR takes the magnitude for the pitch
    // and the sign for the side.
    expect(layer.data).toEqual([
      [{ x: '0-9', y: -120, z: 'Male' }, { x: '10-19', y: -90, z: 'Male' }],
      [{ x: '0-9', y: 115, z: 'Female' }, { x: '10-19', y: 95, z: 'Female' }],
    ]);
    expect(layer.selectors).toBe('[data-maidr-anychart-bar]');
    expect(layer.domMapping).toEqual({ order: 'row', groupDirection: 'forward' });
  });

  it('emits one layer, not one per side', () => {
    // The balance is read down a column of one grid; split across layers there
    // is no column to compute it from.
    expect(anyChartToMaidr(createTornadoChart(), { diverging: true })!
      .subplots[0][0].layers).toHaveLength(1);
  });

  it('reads the same chart as ordinary bars when nothing asks otherwise', () => {
    // There is no library-level flag for this, so a chart that is not declared
    // diverging must never be renamed one.
    const layers = anyChartToMaidr(createTornadoChart())!.subplots[0][0].layers;

    expect(layers).toHaveLength(2);
    expect(layers.map(l => l.type)).toEqual([TraceType.BAR, TraceType.BAR]);
  });

  it('declines a chart with only one side, and says why', () => {
    const chart = createChart({
      title: 'Population',
      series: [createSeries('bar', [{ x: '0-9', value: -120 }])],
    });
    const warnSpy = jest.spyOn(console, 'warn');

    const layers = anyChartToMaidr(chart, { diverging: true })!
      .subplots[0][0]
      .layers;

    expect(layers.map(l => l.type)).toEqual([TraceType.BAR]);
    expect(warnSpy.mock.calls.flat().join(' '))
      .toContain('this chart draws 1 bar series');
  });
});

describe('bindAnyChart (candlestick stamping)', () => {
  it('stamps one attribute per candle, in point order', () => {
    const container = createContainerWithSvg('candle-bind');
    const candles = appendCandlePaths(container, 3);
    const chart = createCandlestickChart('Prices', ['Mon', 'Tue', 'Wed'], { container });

    bindAnyChart(chart);

    expect(candles.map(c => c.getAttribute('data-maidr-anychart-candlestick-cell')))
      .toEqual(['0-0', '0-1', '0-2']);

    container.closest('[data-maidr-anychart-host]')?.remove();
  });

  it('falls back to the whole SVG when there is no AnyChart layer structure', () => {
    // No `ac_layer_*` group anywhere: the lookup's assumption has not failed,
    // there is simply nothing to scope to, and whole-SVG querying is the only
    // way to reach the candles. This fallback must survive.
    const container = createContainerWithSvg('candle-unlayered');
    const candles = appendCandlePaths(container, 2, { layered: false });
    const chart = createCandlestickChart('Prices', ['Mon', 'Tue'], { container });

    bindAnyChart(chart);

    expect(candles.map(c => c.getAttribute('data-maidr-anychart-candlestick-cell')))
      .toEqual(['0-0', '0-1']);

    container.closest('[data-maidr-anychart-host]')?.remove();
  });

  it('warns and stamps nothing when no AnyChart layer is clipped to the plot area', () => {
    // The candle-DOM assumption has failed: the layers are there but none of
    // them is a clipped series layer. Stamping the first `ac_path_*` elements
    // found anywhere in the SVG would label a legend marker or a decorative
    // frame as candle 0, so the highlight is dropped and the reason reported.
    const container = createContainerWithSvg('candle-unclipped');
    appendCandlePaths(container, 1, { clipped: false });
    const svg = container.querySelector('svg') as unknown as SVGElement;
    // A multi-command path outside every layer — exactly what the whole-SVG
    // fallback would have mistaken for candle 0.
    const decoration = document.createElementNS(SVG_NS, 'path');
    decoration.id = 'ac_path_frame';
    decoration.setAttribute('d', 'M 0 0 L 10 0 L 10 10 Z');
    decoration.setAttribute('stroke', '#000000');
    svg.appendChild(decoration);
    const chart = createCandlestickChart('Prices', ['Mon'], { container });
    const warnSpy = jest.spyOn(console, 'warn');

    bindAnyChart(chart);

    expect(decoration.getAttribute('data-maidr-anychart-candlestick-cell')).toBeNull();
    expect(container.querySelectorAll('[data-maidr-anychart-candlestick-cell]'))
      .toHaveLength(0);
    expect(warnSpy.mock.calls.flat().join(' '))
      .toContain('no candlestick paths to highlight');

    container.closest('[data-maidr-anychart-host]')?.remove();
  });
});

// ---------------------------------------------------------------------------
// Multi-panel conversion
// ---------------------------------------------------------------------------

describe('anyChartsToMaidr', () => {
  it('maps an explicit 2D grid 1:1 onto subplots (ragged rows allowed)', () => {
    const a = createBarChart('Panel A');
    const b = createBarChart('Panel B');
    const c = createBarChart('Panel C');

    const result = anyChartsToMaidr([[a, b], [c]], { id: 'fig', title: 'Figure' });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('fig');
    expect(result?.title).toBe('Figure');
    expect(result?.subplots).toHaveLength(2);
    expect(result?.subplots[0]).toHaveLength(2);
    expect(result?.subplots[1]).toHaveLength(1);

    // First layer's title is the panel display name.
    expect(firstLayer(result!, 0, 0).title).toBe('Panel A');
    expect(firstLayer(result!, 0, 1).title).toBe('Panel B');
    expect(firstLayer(result!, 1, 0).title).toBe('Panel C');

    // Layer ids are unique across the whole figure.
    const ids = result!.subplots.flat().flatMap(s => s.layers.map(l => l.id));
    expect(ids).toEqual(['0_0_0', '0_1_0', '1_0_0']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('scopes every selector to its own panel token', () => {
    const a = createBarChart('A');
    const b = createBarChart('B');

    const result = anyChartsToMaidr([[a, b]], { id: 'fig' });

    expect(result?.subplots[0][0].selector).toBe(
      'svg[data-maidr-anychart-panel="fig-0-0"]',
    );
    expect(result?.subplots[0][1].selector).toBe(
      'svg[data-maidr-anychart-panel="fig-0-1"]',
    );
    expect(firstLayer(result!, 0, 0).selectors).toBe(
      '[data-maidr-anychart-panel="fig-0-0"] [data-maidr-anychart-bar^="fig-0-0:0-"]',
    );
    expect(firstLayer(result!, 0, 1).selectors).toBe(
      '[data-maidr-anychart-panel="fig-0-1"] [data-maidr-anychart-bar^="fig-0-1:0-"]',
    );
  });

  it('scopes BoxSelector entries and candlestick defaults to the panel', () => {
    const box = createChart({
      title: 'Box',
      series: [
        createSeries('box', [
          { x: 'A', lowest: 1, q1: 2, median: 3, q3: 4, highest: 5 },
        ]),
      ],
    });
    const candle = createChart({
      title: 'Candle',
      series: [
        createSeries('candlestick', [
          { x: 'Mon', open: 1, high: 4, low: 0.5, close: 3 },
        ]),
      ],
    });

    const result = anyChartsToMaidr([[box, candle]], { id: 'fig' });

    const boxSelectors = firstLayer(result!, 0, 0).selectors as BoxSelector[];
    expect(boxSelectors).toHaveLength(1);
    expect(boxSelectors[0].iq).toBe(
      '[data-maidr-anychart-panel="fig-0-0"] '
      + '[data-maidr-anychart-box="fig-0-0:0-0"][data-maidr-anychart-box-part="iq"]',
    );
    expect(boxSelectors[0].q2).toBe(
      '[data-maidr-anychart-panel="fig-0-0"] '
      + '[data-maidr-anychart-box="fig-0-0:0-0"][data-maidr-anychart-box-part="q2"]',
    );

    expect(firstLayer(result!, 0, 1).type).toBe(TraceType.CANDLESTICK);
    expect(firstLayer(result!, 0, 1).selectors).toBe(
      '[data-maidr-anychart-panel="fig-0-1"] '
      + '[data-maidr-anychart-candlestick-cell^="fig-0-1:0-"]',
    );
  });

  it('scopes heatmap panels to the panel token', () => {
    const heat = createChart({
      title: 'Heat',
      type: 'heat-map',
      dataRows: [
        { x: 'X1', y: 'Y1', heat: 1 },
        { x: 'X2', y: 'Y1', heat: 2 },
      ],
    });
    const bar = createBarChart('Bar');

    const result = anyChartsToMaidr([[heat, bar]], { id: 'fig' });

    const heatLayer = firstLayer(result!, 0, 0);
    expect(heatLayer.type).toBe(TraceType.HEATMAP);
    expect(heatLayer.id).toBe('0_0_0');
    expect(heatLayer.title).toBe('Heat');
    expect(heatLayer.selectors).toBe(
      '[data-maidr-anychart-panel="fig-0-0"] [data-maidr-anychart-heatmap-cell]',
    );
  });

  it('applies figure-level axes overrides but keeps per-panel extraction otherwise', () => {
    const a = createBarChart('A', [['x', 1]], { xTitle: 'AX', yTitle: 'AY' });
    const b = createBarChart('B', [['x', 1]], { xTitle: 'BX', yTitle: 'BY' });

    const extracted = anyChartsToMaidr([[a, b]], { id: 'fig' });
    expect(firstLayer(extracted!, 0, 0).axes?.x).toEqual({ label: 'AX' });
    expect(firstLayer(extracted!, 0, 1).axes?.x).toEqual({ label: 'BX' });

    const overridden = anyChartsToMaidr([[a, b]], {
      id: 'fig2',
      axes: { x: 'Shared X', y: 'Shared Y' },
    });
    expect(firstLayer(overridden!, 0, 0).axes?.x).toEqual({ label: 'Shared X' });
    expect(firstLayer(overridden!, 0, 1).axes?.y).toEqual({ label: 'Shared Y' });
  });

  it('sanitizes CSS-hostile figure ids in panel tokens but not in the figure id', () => {
    const result = anyChartsToMaidr([[createBarChart('A')]], { id: 'my "fig" 1' });
    expect(result?.id).toBe('my "fig" 1');
    expect(result?.subplots[0][0].selector).toBe(
      'svg[data-maidr-anychart-panel="my__fig__1-0-0"]',
    );
  });

  it('drops panels with no convertible series, keeping original tokens', () => {
    const bad = createChart({ series: [createSeries('funnel', [{ x: 'A', value: 1 }])] });
    const good = createBarChart('Good');

    const result = anyChartsToMaidr([[bad, good]], { id: 'fig' });

    expect(result?.subplots).toHaveLength(1);
    expect(result?.subplots[0]).toHaveLength(1);
    // Token still reflects the ORIGINAL grid position (0, 1).
    expect(result?.subplots[0][0].selector).toBe(
      'svg[data-maidr-anychart-panel="fig-0-1"]',
    );
  });

  it('returns null when no panel is convertible', () => {
    const bad = createChart({ series: [createSeries('funnel', [{ x: 'A', value: 1 }])] });
    expect(anyChartsToMaidr([[bad]], { id: 'fig' })).toBeNull();
  });

  describe('input validation', () => {
    it('rejects an empty charts array', () => {
      expect(anyChartsToMaidr([], { id: 'fig' })).toBeNull();
    });

    it('rejects grids containing an empty row', () => {
      expect(anyChartsToMaidr([[createBarChart('A')], []], { id: 'fig' })).toBeNull();
    });

    it('rejects mixed flat/2D input', () => {
      const a = createBarChart('A');
      const b = createBarChart('B');
      expect(
        anyChartsToMaidr([a, [b]] as unknown as AnyChartInstance[][], { id: 'fig' }),
      ).toBeNull();
    });
  });

  describe('flat-array layouts', () => {
    it('defaults to a single row when no layout is given', () => {
      const charts = [createBarChart('A'), createBarChart('B'), createBarChart('C')];
      const result = anyChartsToMaidr(charts, { id: 'fig' });
      expect(result?.subplots).toHaveLength(1);
      expect(result?.subplots[0]).toHaveLength(3);
    });

    it('chunks row-major by columns', () => {
      const charts = [createBarChart('A'), createBarChart('B'), createBarChart('C')];
      const result = anyChartsToMaidr(charts, { id: 'fig', layout: { columns: 2 } });
      expect(result?.subplots).toHaveLength(2);
      expect(result?.subplots[0]).toHaveLength(2);
      expect(result?.subplots[1]).toHaveLength(1);
      expect(firstLayer(result!, 0, 0).title).toBe('A');
      expect(firstLayer(result!, 0, 1).title).toBe('B');
      expect(firstLayer(result!, 1, 0).title).toBe('C');
    });

    it('derives columns from rows when only rows is given', () => {
      const charts = [
        createBarChart('A'),
        createBarChart('B'),
        createBarChart('C'),
        createBarChart('D'),
      ];
      const result = anyChartsToMaidr(charts, { id: 'fig', layout: { rows: 2 } });
      expect(result?.subplots).toHaveLength(2);
      expect(result?.subplots[0]).toHaveLength(2);
      expect(result?.subplots[1]).toHaveLength(2);
    });

    it('arranges layout "auto" by container position (rows by top, columns by left)', () => {
      const wrapper = document.createElement('div');
      document.body.appendChild(wrapper);
      const topLeft = createContainerWithSvg('auto-tl', wrapper);
      const topRight = createContainerWithSvg('auto-tr', wrapper);
      const bottomLeft = createContainerWithSvg('auto-bl', wrapper);
      stubRect(topLeft, { top: 0, left: 0 });
      stubRect(topRight, { top: 3, left: 200 }); // within row tolerance of top: 0
      stubRect(bottomLeft, { top: 300, left: 0 });

      // Pass charts in shuffled order; 'auto' must sort them visually.
      const charts = [
        createBarChart('BottomLeft', [['x', 1]], { container: bottomLeft }),
        createBarChart('TopRight', [['x', 1]], { container: topRight }),
        createBarChart('TopLeft', [['x', 1]], { container: topLeft }),
      ];

      const result = anyChartsToMaidr(charts, { id: 'fig', layout: 'auto' });

      expect(result?.subplots).toHaveLength(2);
      expect(result?.subplots[0]).toHaveLength(2);
      expect(result?.subplots[1]).toHaveLength(1);
      expect(firstLayer(result!, 0, 0).title).toBe('TopLeft');
      expect(firstLayer(result!, 0, 1).title).toBe('TopRight');
      expect(firstLayer(result!, 1, 0).title).toBe('BottomLeft');
      wrapper.remove();
    });

    it('fails layout "auto" when a chart has no resolvable container', () => {
      const charts = [createBarChart('A'), createBarChart('B')];
      expect(anyChartsToMaidr(charts, { id: 'fig', layout: 'auto' })).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// bindAnyCharts (DOM integration)
// ---------------------------------------------------------------------------

describe('bindAnyCharts', () => {
  it('stamps panel tokens, wraps the panels in one host, and binds once', () => {
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    const container1 = createContainerWithSvg('bind-p1', wrapper);
    const container2 = createContainerWithSvg('bind-p2', wrapper);

    const chartA = createBarChart('A', [['x', 1]], { container: container1 });
    const chartB = createBarChart('B', [['x', 2]], { container: container2 });

    const events: unknown[] = [];
    const listener = (e: Event): void => {
      events.push((e as CustomEvent).detail);
    };
    document.addEventListener('maidr:bindchart', listener);

    const maidr = bindAnyCharts([[chartA, chartB]], { id: 'fig', title: 'Fig' });

    expect(maidr).not.toBeNull();
    expect(maidr?.subplots[0]).toHaveLength(2);

    // Each panel's own SVG carries its token.
    expect(container1.querySelector('svg')?.getAttribute('data-maidr-anychart-panel'))
      .toBe('fig-0-0');
    expect(container2.querySelector('svg')?.getAttribute('data-maidr-anychart-panel'))
      .toBe('fig-0-1');

    // One host wraps BOTH panel containers and carries the combined data.
    const host = document.querySelector<HTMLElement>('[data-maidr-anychart-host]');
    expect(host).not.toBeNull();
    expect(host?.contains(container1)).toBe(true);
    expect(host?.contains(container2)).toBe(true);
    const parsed = JSON.parse(host?.getAttribute('maidr-data') ?? 'null');
    expect(parsed?.id).toBe('fig');
    expect(parsed?.subplots?.[0]).toHaveLength(2);

    // Exactly one bind event for the whole figure.
    expect(events).toHaveLength(1);

    // Re-binding is a no-op that returns the data again.
    const again = bindAnyCharts([[chartA, chartB]], { id: 'fig' });
    expect(again).not.toBeNull();
    expect(events).toHaveLength(1);

    document.removeEventListener('maidr:bindchart', listener);
    host?.remove();
  });

  it('resolves every emitted subplot selector to its own panel SVG (visual-layout contract)', () => {
    // The MAIDR core computes visual panel order and vertical arrow
    // direction (resolveSubplotLayout's panel-geometry pass) by measuring
    // the element matched by each subplot's `selector`. This asserts the
    // adapter's multi-ROW output satisfies that contract: every subplot
    // carries a selector that resolves to that panel's own, distinct SVG.
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    const containers = [
      createContainerWithSvg('layout-p00', wrapper),
      createContainerWithSvg('layout-p01', wrapper),
      createContainerWithSvg('layout-p10', wrapper),
      createContainerWithSvg('layout-p11', wrapper),
    ];
    const charts = containers.map(
      (container, i) => createBarChart(`P${i}`, [['x', i + 1]], { container }),
    );

    const maidr = bindAnyCharts(
      [[charts[0], charts[1]], [charts[2], charts[3]]],
      { id: 'layout-fig' },
    );

    expect(maidr).not.toBeNull();
    expect(maidr?.subplots).toHaveLength(2);

    const resolved: Element[] = [];
    maidr!.subplots.forEach((row, r) => {
      row.forEach((subplot, c) => {
        expect(subplot.selector).toBe(
          `svg[data-maidr-anychart-panel="layout-fig-${r}-${c}"]`,
        );
        const el = document.querySelector(subplot.selector!);
        expect(el).toBe(containers[r * 2 + c].querySelector('svg'));
        resolved.push(el!);
        // The first layer's selector is scoped inside the same panel, so the
        // core's layer-selector fallback also stays within the panel.
        expect(subplot.layers[0].selectors).toBe(
          `[data-maidr-anychart-panel="layout-fig-${r}-${c}"] `
          + `[data-maidr-anychart-bar^="layout-fig-${r}-${c}:0-"]`,
        );
      });
    });
    // Four panels, four DISTINCT elements to measure.
    expect(new Set(resolved).size).toBe(4);

    document.querySelector('[data-maidr-anychart-host]')?.remove();
  });

  it('preserves page order when other content is interleaved between panels', () => {
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    const container1 = createContainerWithSvg('inter-p1', wrapper);
    const heading = document.createElement('h3');
    heading.textContent = 'Q2 sales';
    wrapper.appendChild(heading);
    const container2 = createContainerWithSvg('inter-p2', wrapper);

    const chartA = createBarChart('A', [['x', 1]], { container: container1 });
    const chartB = createBarChart('B', [['x', 2]], { container: container2 });

    const maidr = bindAnyCharts([[chartA, chartB]], { id: 'inter-fig' });

    expect(maidr).not.toBeNull();

    // Non-contiguous same-parent panels must NOT be pulled together past the
    // heading; the shared parent is wrapped in place instead.
    expect(Array.from(wrapper.children)).toEqual([container1, heading, container2]);
    const host = wrapper.parentElement;
    expect(host?.hasAttribute('data-maidr-anychart-host')).toBe(true);
    expect(host?.contains(container1)).toBe(true);
    expect(host?.contains(container2)).toBe(true);
    expect(host?.getAttribute('maidr-data')).toBeTruthy();

    host?.remove();
  });

  it('returns the originally bound Maidr on re-bind without an explicit id', () => {
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    const container1 = createContainerWithSvg('rebind-p1', wrapper);
    const container2 = createContainerWithSvg('rebind-p2', wrapper);

    const chartA = createBarChart('A', [['x', 1]], { container: container1 });
    const chartB = createBarChart('B', [['x', 2]], { container: container2 });

    const first = bindAnyCharts([[chartA, chartB]]);
    expect(first).not.toBeNull();

    // Second call without options.id would mint a fresh generated id whose
    // panel tokens were never stamped; the reuse path must return the
    // Maidr the DOM was actually bound with.
    const again = bindAnyCharts([[chartA, chartB]]);
    expect(again).toBe(first);

    // The returned object's selectors resolve against the stamped DOM.
    expect(document.querySelector(again!.subplots[0][0].selector!))
      .toBe(container1.querySelector('svg'));
    expect(document.querySelector(again!.subplots[0][1].selector!))
      .toBe(container2.querySelector('svg'));

    document.querySelector('[data-maidr-anychart-host]')?.remove();
  });

  it('refuses charts sharing one container (shared-Stage dashboards)', () => {
    const container = createContainerWithSvg('bind-shared');
    const chartA = createBarChart('A', [['x', 1]], { container });
    const chartB = createBarChart('B', [['x', 2]], { container });

    expect(bindAnyCharts([[chartA, chartB]], { id: 'fig' })).toBeNull();
    container.remove();
  });

  it('fails when a chart has no container', () => {
    const container = createContainerWithSvg('bind-solo');
    const chartA = createBarChart('A', [['x', 1]], { container });
    const chartB = createBarChart('B');

    expect(bindAnyCharts([[chartA, chartB]], { id: 'fig' })).toBeNull();
    container.remove();
  });
});

describe('mapSeriesType', () => {
  let warnSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('maps the step-drawn series to a step trace, not a line one', () => {
    // AnyChart draws these as staircases, so announcing and navigating them as
    // interpolated lines misdescribes the data.
    expect(mapSeriesType('step-line')).toBe(TraceType.STEP);
    expect(mapSeriesType('step-area')).toBe(TraceType.STEP);
  });

  it('leaves the unfilled interpolated series as line traces', () => {
    expect(mapSeriesType('line')).toBe(TraceType.LINE);
    expect(mapSeriesType('spline')).toBe(TraceType.LINE);
  });

  it('reads the filled interpolated series as the areas they are drawn as', () => {
    // These used to be downgraded to LINE, which announced an area chart as a
    // line chart — the fill is the whole visual difference between the two.
    expect(mapSeriesType('area')).toBe(TraceType.AREA);
    expect(mapSeriesType('spline-area')).toBe(TraceType.AREA);
  });

  it('reads the point-drawn bar series as the marks they are', () => {
    // Both share MAIDR's bar trace: a reader navigates one category and one
    // magnitude whichever mark the chart draws.
    expect(mapSeriesType('stick')).toBe(TraceType.LOLLIPOP);
  });

  it('reads the two-ended range series as dumbbells', () => {
    expect(mapSeriesType('range-column')).toBe(TraceType.DUMBBELL);
    expect(mapSeriesType('range-bar')).toBe(TraceType.DUMBBELL);
    // `hilo` carries the same two fields and is read the same way. It is
    // drawn as a bare stroke that no stamper here can tell from a grid line,
    // so it announces correctly and never highlights — which is the trade this
    // now makes deliberately, rather than skipping the chart and dropping the
    // announcement, the braille and the keyboard path along with the outline
    // (#1051). Its selectors are withheld; see the dumbbell suite.
    expect(mapSeriesType('hilo')).toBe(TraceType.DUMBBELL);
  });

  it('normalises the series name before looking it up', () => {
    expect(mapSeriesType('Step_Line')).toBe(TraceType.STEP);
    expect(mapSeriesType('STEP LINE')).toBe(TraceType.STEP);
  });

  it('warns for the one area series that still loses its fill', () => {
    // MAIDR has no stepped area trace, so `step-area` keeps its staircase and
    // gives up its fill — and says so.
    mapSeriesType('step-area');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('step-area'));

    // `area` and `spline-area` keep theirs now, so warning about them would be
    // reporting a loss that no longer happens.
    for (const type of ['area', 'spline-area', 'step-line']) {
      warnSpy.mockClear();
      mapSeriesType(type);
      expect(warnSpy).not.toHaveBeenCalled();
    }
  });

  it('returns null for a series type the adapter cannot represent', () => {
    expect(mapSeriesType('funnel')).toBeNull();
  });
});

describe('selector resolution per trace type', () => {
  /**
   * Build a single-series chart of an arbitrary AnyChart series type.
   * @param seriesType The AnyChart series type string
   * @returns A mock chart instance carrying one series of that type
   */
  function chartOf(seriesType: string): AnyChartInstance {
    return createChart({
      title: seriesType,
      series: [createSeries(seriesType, [
        { x: 'A', value: 1 },
        { x: 'B', value: 2 },
      ])],
    });
  }

  it('gives a step series the same stamped selector a line series gets', () => {
    // stampLineAttributes writes data-maidr-anychart-line-point onto step
    // series too — they are in LINE_LIKE_SERIES_TYPES — so a step layer that
    // resolved to no selector would leave those stamped elements unreachable
    // and the chart would announce correctly while never highlighting.
    const line = anyChartToMaidr(chartOf('line'), { id: 'l' });
    const step = anyChartToMaidr(chartOf('step-line'), { id: 's' });

    const lineLayer = line?.subplots[0][0].layers[0];
    const stepLayer = step?.subplots[0][0].layers[0];

    expect(lineLayer?.type).toBe(TraceType.LINE);
    expect(stepLayer?.type).toBe(TraceType.STEP);
    expect(stepLayer?.selectors).toBeDefined();
    expect(stepLayer?.selectors).toEqual(lineLayer?.selectors);
  });

  it('gives a step-area series a selector too', () => {
    const stepArea = anyChartToMaidr(chartOf('step-area'), { id: 'sa' });
    const layer = stepArea?.subplots[0][0].layers[0];

    expect(layer?.type).toBe(TraceType.STEP);
    expect(layer?.selectors).toBeDefined();
  });
});
