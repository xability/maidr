/**
 * Main adapter that converts an amCharts 5 chart into a MAIDR data object.
 *
 * Supports single charts and multi-panel roots: every `XYChart` found in the
 * root's container tree (including am5stock `StockPanel`s and am5radar
 * `RadarChart`s, which extend `XYChart`) and every am5percent chart — a
 * `PieChart` or a funnel's `SlicedChart` — becomes one MAIDR subplot,
 * arranged in a grid mirroring the on-screen layout with rows emitted
 * bottom-first (see {@link computeChartGrid}) so the core's UPWARD = row+1
 * mapping moves visually up.
 *
 * @example
 * ```ts
 * import { fromAmCharts } from 'maidr/amcharts';
 *
 * const root = am5.Root.new("chartdiv");
 * const chart = root.container.children.push(
 *   am5xy.XYChart.new(root, {})
 * );
 * // ... configure chart, axes, series, data ...
 *
 * const maidrData = fromAmCharts(root);
 * ```
 */

import type {
  BarPoint,
  ChoroplethPoint,
  DumbbellData,
  FlowPoint,
  GanttData,
  GaugePoint,
  HeatmapData,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  NetworkPoint,
  PiePoint,
  SegmentedPoint,
  TreemapPoint,
  WaterfallPoint,
} from '@type/grammar';
import type { AmDeclaredLayer } from './declaration';
import type {
  AmChart,
  AmChartsBinderOptions,
  AmRoot,
  AmXYSeries,
} from './types';
import { toSegmentedShares } from '@adapters/shared/normalize';
import { Orientation, TraceType } from '@type/grammar';
import {
  choroplethFields,
  extractErrorBarSamples,
  extractForestSamples,
  extractScatterPoints,
  extractSurvivalArms,
  extractVolcanoPoints,
  isDeclaredHorizontal,
  planDeclarations,
  readForestOptions,
  readThresholdOptions,
} from './declaration';
import {
  classifySeriesKind,
  extractBarPoints,
  extractChoroplethPoints,
  extractDumbbellPoints,
  extractFlowPoints,
  extractGanttData,
  extractGaugePoint,
  extractHeatmapData,
  extractHierarchyPoints,
  extractHistogramPoints,
  extractLinePoints,
  extractNetworkPoints,
  extractPiePoints,
  extractSegmentedPoints,
  extractWaterfallPoints,
  findGaugeHand,
  hasRankAxis,
  holdsRanks,
  isColumnSeries,
  isDivergingPair,
  readAxisLabel,
  STANDALONE_SERIES_CLASSES,
} from './extractor';
import { computeChartGrid } from './geometry';
import {
  buildColumnSelector,
  buildLineSelector,
} from './selectors';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * A converted panel: the source chart paired with the MAIDR layers built from
 * it. One entry per emitted subplot, in row-major grid order.
 */
export interface AmChartPanel {
  chart: AmChart;
  layers: MaidrLayer[];
}

/**
 * Result of {@link convertCharts}: the MAIDR data object plus the
 * chart-to-subplot mapping the binder needs to route highlights back to the
 * owning panel.
 */
export interface AmChartsConversion {
  maidr: Maidr;
  panels: AmChartPanel[];
}

/**
 * Convert an amCharts 5 {@link AmRoot} into a MAIDR data object.
 *
 * The function walks the root's container tree, collects every XY chart
 * (including am5stock `StockPanel`s) and every am5percent chart, and converts each
 * one into a MAIDR subplot. A single chart produces a 1x1 grid; multiple charts are arranged
 * in a grid mirroring their on-screen layout, rows ordered bottom-first so
 * that pressing Up moves to the visually upper panel.
 *
 * @param root    The amCharts 5 `Root` instance.
 * @param options Optional overrides for title, subtitle, and axis labels.
 * @returns       A {@link Maidr} object ready for `<Maidr data={...}>`.
 *
 * @throws If no supported chart is found inside the root, or if no chart
 *         contains a supported series with data.
 */
export function fromAmCharts(root: AmRoot, options?: AmChartsBinderOptions): Maidr {
  const charts = findCharts(root);
  if (charts.length === 0) {
    throw new Error(
      'maidr amCharts binder: no XYChart or PieChart found in root.container. '
      + 'Ensure the chart is fully initialized before calling fromAmCharts().',
    );
  }

  return convertCharts(charts, root.dom, options).maidr;
}

/**
 * Convert an amCharts 5 {@link AmChart} directly into a MAIDR data object.
 *
 * Use this when you already hold a reference to the chart object.
 *
 * @param chart        The amCharts 5 XY chart instance.
 * @param containerEl  The DOM element that contains the chart's rendered output.
 * @param options      Optional overrides.
 */
export function fromXYChart(
  chart: AmChart,
  containerEl: HTMLElement,
  options?: AmChartsBinderOptions,
): Maidr {
  return convertCharts([chart], containerEl, options).maidr;
}

/**
 * Convert several amCharts 5 {@link AmChart}s (all sharing one root/DOM
 * element) into a single multi-panel MAIDR data object — one subplot per
 * chart, arranged in a grid mirroring the rendered layout.
 *
 * @param charts       The amCharts 5 XY chart instances (same `Root`).
 * @param containerEl  The DOM element that contains the charts' rendered output.
 * @param options      Optional overrides (applied figure-wide).
 */
export function fromXYCharts(
  charts: AmChart[],
  containerEl: HTMLElement,
  options?: AmChartsBinderOptions,
): Maidr {
  return convertCharts(charts, containerEl, options).maidr;
}

/**
 * Core conversion shared by the JSON entry points and the binder.
 *
 * Single chart: identical output to the original single-panel adapter.
 * Multiple charts: one subplot per chart, positioned via {@link computeChartGrid}
 * (falls back to one row in insertion order when geometry is unavailable).
 * Charts yielding no supported layers are dropped — the core model crashes on
 * empty subplots or empty grid rows. When NO chart yields a layer, a
 * descriptive error is thrown instead of emitting the `[[{ layers: [] }]]`
 * shape, which would crash the core model at Controller construction.
 *
 * @throws If no chart contains a supported series with data.
 */
export function convertCharts(
  charts: AmChart[],
  containerEl: HTMLElement,
  options?: AmChartsBinderOptions,
): AmChartsConversion {
  if (charts.length === 0) {
    throw new Error('maidr amCharts binder: convertCharts requires at least one chart.');
  }

  const id = `amcharts-${containerEl.id || uid()}`;
  const subtitle = options?.subtitle;

  if (charts.length === 1) {
    const chart = charts[0];
    const title = options?.title ?? readChartTitle(chart);
    const layers = buildChartLayers(chart, containerEl, options);
    if (layers.length === 0) {
      throw noSupportedDataError();
    }
    const subplot: MaidrSubplot = { layers };

    return {
      maidr: { id, title, subtitle, subplots: [[subplot]] },
      panels: [{ chart, layers }],
    };
  }

  const grid = computeChartGrid(charts);
  const subplotRows: MaidrSubplot[][] = [];
  const panels: AmChartPanel[] = [];

  for (const chartRow of grid) {
    const subplotRow: MaidrSubplot[] = [];
    for (const chart of chartRow) {
      const layers = buildChartLayers(chart, containerEl, options);
      if (layers.length === 0) {
        // Never emit `layers: []` inside a grid — it crashes the core model.
        continue;
      }
      // MaidrSubplot has no title field; the FIRST layer's title is the
      // panel's display name in subplot summaries.
      const panelTitle = readChartTitle(chart);
      if (panelTitle) {
        layers[0] = { ...layers[0], title: panelTitle };
      }
      subplotRow.push({ layers });
      panels.push({ chart, layers });
    }
    // Never emit empty rows — they crash the core model.
    if (subplotRow.length > 0) {
      subplotRows.push(subplotRow);
    }
  }

  if (panels.length === 0) {
    // Never emit `[[{ layers: [] }]]` — it crashes the core model the moment
    // the Controller is constructed. Fail with an actionable adapter error.
    throw noSupportedDataError();
  }

  return {
    maidr: { id, title: options?.title, subtitle, subplots: subplotRows },
    panels,
  };
}

/**
 * Build the MAIDR layers for one chart. Axis labels come from THAT chart's
 * first x/y axis; `options.axisLabels` acts as a figure-wide override.
 */
function buildChartLayers(
  chart: AmChart,
  containerEl: HTMLElement,
  options?: AmChartsBinderOptions,
): MaidrLayer[] {
  // A pie chart is bound to no axis, so both reads find nothing and fall back;
  // the pie layer names its own dimensions rather than using these.
  const xLabel = options?.axisLabels?.x ?? readAxisLabel(chart.xAxes?.values[0], 'x');
  const yLabel = options?.axisLabels?.y ?? readAxisLabel(chart.yAxes?.values[0], 'y');

  const layers: MaidrLayer[] = [];
  // Line, step, area and radar series each merge into one layer of their own
  // type. The points are extracted identically — amCharts varies only how it
  // draws between them — so they differ here only in which bucket they land in.
  const merged: Record<MergedKind, MergedSeries> = {
    line: emptyMergedSeries(),
    step: emptyMergedSeries(),
    area: emptyMergedSeries(),
    radar: emptyMergedSeries(),
    polar: emptyMergedSeries(),
  };

  // Collect bar series for grouped handling (stacked/dodged/normalized), area
  // series for the stacking their merged layer's type has to report, and line
  // series for the question of whether they carry ranks.
  const barSeriesList: AmXYSeries[] = [];
  const areaSeriesList: AmXYSeries[] = [];
  const lineSeriesList: AmXYSeries[] = [];

  // What the author declared outranks every heuristic below, and a series
  // absorbed into a declared layer — the column drawing an interval, a further
  // arm of one survival figure — never becomes a layer of its own.
  const plan = planDeclarations(chart);

  for (const series of chart.series.values) {
    if (plan.absorbed.has(series)) {
      continue;
    }
    const declared = plan.declared.get(series);
    if (declared) {
      const layer = buildDeclaredLayer(declared, xLabel, yLabel, containerEl, options);
      if (layer) {
        layers.push(layer);
      }
      continue;
    }

    const kind = classifySeriesKind(series);

    switch (kind) {
      case 'bar': {
        barSeriesList.push(series);
        break;
      }
      case 'dot':
      case 'lollipop': {
        // A dot plot and a lollipop hold a bar chart's categories and values;
        // only the mark differs, so only the trace type does. They never join
        // the bar list: a chart drawing both would otherwise have them read as
        // two groups of one segmented chart.
        const data = extractBarPoints(series);
        if (data.length === 0)
          break;
        const type = kind === 'dot' ? TraceType.DOT : TraceType.LOLLIPOP;
        layers.push(buildBarLayer(series, type, data, xLabel, yLabel, containerEl));
        break;
      }
      case 'histogram': {
        const data = extractHistogramPoints(series);
        if (data.length === 0)
          break;
        layers.push(buildHistogramLayer(series, data, xLabel, yLabel, containerEl));
        break;
      }
      case 'heatmap': {
        const data = extractHeatmapData(series);
        if (!data)
          break;
        layers.push(buildHeatmapLayer(data, xLabel, yLabel));
        break;
      }
      case 'line':
      case 'step':
      case 'area':
      case 'radar':
      case 'polar': {
        const points = extractLinePoints(series);
        if (points.length === 0)
          break;
        collectSeries(merged[kind], series, points, containerEl);
        if (kind === 'area')
          areaSeriesList.push(series);
        else if (kind === 'line')
          lineSeriesList.push(series);
        break;
      }
      case 'pie': {
        const data = extractPiePoints(series);
        if (data.length === 0)
          break;
        layers.push(buildPieLayer(series, data, options));
        break;
      }
      case 'funnel': {
        // A funnel stage carries the same category/value pair a pie slice
        // does, so the same extraction serves both.
        const data = extractPiePoints(series);
        if (data.length === 0)
          break;
        layers.push(buildFunnelLayer(series, data, options));
        break;
      }
      case 'waterfall': {
        const data = extractWaterfallPoints(series);
        if (data.length === 0)
          break;
        layers.push(buildWaterfallLayer(series, data, xLabel, yLabel, containerEl));
        break;
      }
      case 'dumbbell': {
        const points = extractDumbbellPoints(series);
        if (points.length === 0)
          break;
        layers.push(buildDumbbellLayer(series, points, xLabel, yLabel, containerEl, options));
        break;
      }
      case 'gantt': {
        const data = extractGanttData(series);
        if (!data)
          break;
        layers.push(buildGanttLayer(series, data, xLabel, yLabel, containerEl));
        break;
      }
      case 'treemap':
      case 'icicle':
      case 'sunburst': {
        const data = extractHierarchyPoints(series);
        if (data.length === 0)
          break;
        layers.push(buildHierarchyLayer(series, kind, data, options));
        break;
      }
      case 'wordcloud': {
        // A term carries the same category/value pair a pie slice does, so the
        // same extraction serves both.
        const data = extractPiePoints(series);
        if (data.length === 0)
          break;
        layers.push(buildWordCloudLayer(series, data, options));
        break;
      }
      case 'sankey':
      case 'chord': {
        // One weighted graph drawn two ways; only the announced type differs.
        // An `ArcDiagram` lands here as a sankey — it carries weights, which a
        // network payload has nowhere to put.
        const data = extractFlowPoints(series);
        if (data.length === 0)
          break;
        const type = kind === 'chord' ? TraceType.CHORD : TraceType.SANKEY;
        layers.push(buildFlowLayer(series, type, data, options));
        break;
      }
      case 'network': {
        const data = extractNetworkPoints(series);
        if (data.length === 0)
          break;
        layers.push(buildNetworkLayer(series, data, options));
        break;
      }
      case 'choropleth': {
        // A polygon series whose regions all missed their join carries no
        // reading at all; the panel is then dropped rather than emitted as a
        // map of nothing.
        const data = extractChoroplethPoints(series);
        if (data.length === 0)
          break;
        layers.push(buildChoroplethLayer(series, data, options));
        break;
      }
      default:
        // Skip unsupported series types.
        break;
    }
  }

  // Process bar series: single → BAR, multiple → STACKED/DODGED/NORMALIZED.
  if (barSeriesList.length === 1) {
    const series = barSeriesList[0];
    const data = extractBarPoints(series);
    if (data.length > 0) {
      layers.push(buildBarLayer(series, TraceType.BAR, data, xLabel, yLabel, containerEl));
    }
  } else if (barSeriesList.length > 1) {
    const layer = buildSegmentedLayer(barSeriesList, xLabel, yLabel, containerEl);
    if (layer) {
      layers.push(layer);
    }
  }

  // Merge each bucket of point series into a single layer of its own type.
  // The area bucket is the one that has to name its stacking, read from the
  // same per-series settings the bar path reads.
  pushMerged(layers, merged.line, lineTraceType(lineSeriesList, options), xLabel, yLabel);
  pushMerged(layers, merged.step, TraceType.STEP, xLabel, yLabel);
  pushMerged(layers, merged.area, areaTraceType(areaSeriesList), xLabel, yLabel);
  pushMerged(layers, merged.radar, TraceType.RADAR, xLabel, yLabel);
  pushMerged(layers, merged.polar, TraceType.POLAR_AREA, xLabel, yLabel);

  // A ClockHand gauge is the one chart whose reading is not in a series at
  // all: the needle is an `AxisBullet` on an *axis* data item, so a gauge
  // commonly carries zero series and the loop above found nothing to convert.
  // Asked last, and only of a chart that produced no layer, which is what
  // keeps an ordinary radar or polar chart — drawn in the same `RadarChart` —
  // from ever reaching this path.
  if (layers.length === 0) {
    const gauge = buildGaugeLayer(chart, options);
    if (gauge) {
      layers.push(gauge);
    }
  }

  return layers;
}

/** Append the merged layer for one bucket, unless the bucket stayed empty. */
function pushMerged(
  layers: MaidrLayer[],
  merged: MergedSeries,
  type: MergedTraceType,
  xLabel: string,
  yLabel: string,
): void {
  if (merged.data.length > 0) {
    layers.push(buildLineLayer(merged, type, xLabel, yLabel));
  }
}

/**
 * The trace type a line layer reports: a bump chart when its lines carry ranks
 * rather than magnitudes.
 *
 * A rank is not a magnitude — first place is the smallest number — so a bump
 * chart read as a line chart sonifies the leader as the lowest note it has, and
 * a team climbing the table is heard falling on every move. Getting this right
 * is the whole of what the trace type buys, and getting it wrong inverts a
 * reading that has nothing to say it is upside down, so both halves of the
 * signature must agree: the axis has to be drawn as a rank axis, and the values
 * have to be ranks. See {@link hasRankAxis} and {@link holdsRanks}.
 *
 * {@link AmChartsBinderOptions.bump} settles the case amCharts leaves
 * ambiguous, and is asked in the order the two answers deserve — `false`
 * suppresses the reading outright, while `true` stands in for the axis alone
 * and still requires the data to be ranks. That asymmetry is deliberate: the
 * option is figure-wide, so a `true` meant for one panel must not invert the
 * pitch of a plain line chart in the next one.
 */
function lineTraceType(
  lineSeriesList: AmXYSeries[],
  options?: AmChartsBinderOptions,
): MergedTraceType {
  if (options?.bump === false || !holdsRanks(lineSeriesList))
    return TraceType.LINE;

  return options?.bump === true || hasRankAxis(lineSeriesList)
    ? TraceType.BUMP
    : TraceType.LINE;
}

/**
 * The trace type an area layer reports, from how its bands are stacked.
 *
 * Every area series of one chart merges into a single layer, so the stacking
 * is read across the whole group rather than per series: amCharts commonly
 * sets `stacked` on the bands that sit ON another one and leaves it off the
 * bottom band, and splitting the group by that flag would strand the bottom
 * band in an unstacked layer of its own — announcing the one band a reader
 * would compare the others against as a chart of its own.
 */
function areaTraceType(areaSeriesList: AmXYSeries[]): MergedTraceType {
  switch (detectStackMode(areaSeriesList)) {
    case 'normal':
      return TraceType.STACKED_AREA;
    case '100%':
      return TraceType.NORMALIZED_AREA;
    default:
      return TraceType.AREA;
  }
}

// ---------------------------------------------------------------------------
// Layer builders
// ---------------------------------------------------------------------------

/**
 * Builds the layer one co-located `maidr` declaration describes.
 *
 * These are the readings amCharts leaves no signature for: a survival curve
 * and a step line are one series class, an error bar is a floating column
 * behind another series, and a volcano, a Manhattan and a plain scatter are all
 * a `LineSeries` with the stroke switched off. Nothing here is guessed — every
 * fact the drawing does not carry comes off the author's own rows or off the
 * declaration, and a fact that resolves to nothing is left out rather than
 * filled in. See `declaration.ts` for what each field resolves to.
 *
 * @returns The layer, or `null` when no mark of the series could be read as the
 *   declared type after all — the declaration then costs the chart nothing.
 */
function buildDeclaredLayer(
  declared: AmDeclaredLayer,
  xLabel: string,
  yLabel: string,
  containerEl: HTMLElement,
  options?: AmChartsBinderOptions,
): MaidrLayer | null {
  const declaration = declared.declaration;
  const axes = { x: { label: xLabel }, y: { label: yLabel } };
  const named = {
    id: layerId(declared.series),
    ...(declaration.name ? { name: declaration.name } : {}),
  };

  switch (declaration.type) {
    // The one declared type whose payload is a graph rather than a series of
    // marks — and the one the chart already carries whole. An alluvial IS an
    // `am5flow.Sankey`; what the author declared is which of the two readings
    // the drawing stands for, so nothing beyond the type is taken from the
    // block. Bound to no axis, so it names its own dimensions rather than
    // taking the chart's — and it emits no selectors, exactly as an undeclared
    // sankey does; the overlay outlines its ribbons instead.
    case TraceType.ALLUVIAL: {
      const data = extractFlowPoints(declared.series);
      if (data.length === 0) {
        return null;
      }
      return {
        ...named,
        type: TraceType.ALLUVIAL,
        title: declaration.title ?? seriesName(declared.series),
        axes: flowAxes(options),
        data,
      };
    }
    // A map amCharts already draws as regions, declared so the author can say
    // which of their own columns each fact lives in. Bound to no axis, so it
    // names its own dimensions; no selectors, because the polygons are painted
    // into a canvas and the overlay outlines them instead.
    case TraceType.CHOROPLETH: {
      const data = extractChoroplethPoints(declared.series, choroplethFields(declaration));
      if (data.length === 0) {
        return null;
      }
      return {
        ...named,
        type: TraceType.CHOROPLETH,
        title: declaration.title ?? seriesName(declared.series),
        axes: choroplethAxes(options),
        data,
      };
    }
    case TraceType.SURVIVAL: {
      const { data } = extractSurvivalArms(declared);
      if (data.length === 0) {
        return null;
      }
      const arms = [declared.series, ...declared.arms];
      const selectors = arms
        .map(series => buildLineSelector(series, containerEl))
        .filter((selector): selector is string => selector !== undefined);

      return {
        ...named,
        type: TraceType.SURVIVAL,
        title: declaration.title ?? armTitle(arms),
        ...(selectors.length > 0 ? { selectors } : {}),
        ...(declaration.stepDirection ? { stepDirection: declaration.stepDirection } : {}),
        axes,
        data,
      };
    }
    case TraceType.ERROR_BAR: {
      const { data } = extractErrorBarSamples(declared);
      if (data.length === 0) {
        return null;
      }
      return {
        ...named,
        type: TraceType.ERROR_BAR,
        title: declaration.title ?? seriesName(declared.series),
        ...declaredMarkSelector(declared.series, containerEl),
        ...declaredOrientation(declared),
        axes,
        data,
      };
    }
    case TraceType.FOREST: {
      const { data } = extractForestSamples(declared);
      if (data.length === 0) {
        return null;
      }
      const forestOptions = readForestOptions(declaration);
      return {
        ...named,
        type: TraceType.FOREST,
        title: declaration.title ?? seriesName(declared.series),
        ...declaredMarkSelector(declared.series, containerEl),
        ...declaredOrientation(declared),
        ...(forestOptions ? { forestOptions } : {}),
        axes,
        data,
      };
    }
    case TraceType.MANHATTAN:
    case TraceType.VOLCANO: {
      const data = extractVolcanoPoints(declared);
      if (data.length === 0) {
        return null;
      }
      const thresholdOptions = readThresholdOptions(declaration);
      return {
        ...named,
        type: declaration.type,
        title: declaration.title ?? seriesName(declared.series),
        ...cloudSelector(declared, containerEl),
        ...(thresholdOptions ? { thresholdOptions } : {}),
        axes,
        data,
      };
    }
    // Named rather than defaulted, so that a further member of `AmDeclaration`
    // fails to compile here instead of being read out as a plain scatter.
    case TraceType.SCATTER: {
      const data = extractScatterPoints(declared);
      if (data.length === 0) {
        return null;
      }
      return {
        ...named,
        type: TraceType.SCATTER,
        title: declaration.title ?? seriesName(declared.series),
        ...cloudSelector(declared, containerEl),
        axes,
        data,
      };
    }
  }
}

/** What a survival layer is called: every arm that has a name, in draw order. */
function armTitle(arms: AmXYSeries[]): string | undefined {
  const names = arms
    .map(series => seriesName(series))
    .filter((name): name is string => name !== undefined);
  return names.length > 0 ? names.join(', ') : undefined;
}

/**
 * The selector for a declared layer's own marks.
 *
 * An estimate is drawn either as a column or as a bullet on a line, and the two
 * live in different places — so the series' own class decides which to ask for,
 * exactly as {@link classifySeriesKind} would have.
 */
function declaredMarkSelector(
  series: AmXYSeries,
  containerEl: HTMLElement,
): { selectors?: string } {
  const selector = isColumnSeries(series)
    ? buildColumnSelector(series, containerEl)
    : buildLineSelector(series, containerEl);
  return selector ? { selectors: selector } : {};
}

/** The selector for a cloud, whose marks are the bullets of every merged arm. */
function cloudSelector(
  declared: AmDeclaredLayer,
  containerEl: HTMLElement,
): { selectors?: string } {
  const parts = [declared.series, ...declared.arms]
    .map(series => buildLineSelector(series, containerEl))
    .filter((selector): selector is string => selector !== undefined);
  return parts.length > 0 ? { selectors: parts.join(', ') } : {};
}

/** Which way a declared interval layer runs, when it is not the default. */
function declaredOrientation(declared: AmDeclaredLayer): { orientation?: Orientation } {
  return isDeclaredHorizontal(declared) ? { orientation: Orientation.HORIZONTAL } : {};
}

/**
 * The trace types a bar chart's reading serves: the bar itself, and the two
 * marks that hold one category and one value while drawing them differently.
 */
type MarkTraceType = TraceType.BAR | TraceType.DOT | TraceType.LOLLIPOP;

/**
 * Builds the layer for one bar-shaped series — a bar chart, a Cleveland dot
 * plot, or a lollipop.
 *
 * All three carry one category and one value per mark and are navigated
 * identically; the type names the chart the author drew, which is the whole of
 * what a reader gains from the distinction.
 */
function buildBarLayer(
  series: AmXYSeries,
  type: MarkTraceType,
  data: BarPoint[],
  xLabel: string,
  yLabel: string,
  containerEl: HTMLElement,
): MaidrLayer {
  const isHorizontal = typeof series.get('categoryYField') === 'string';
  const selector = buildColumnSelector(series, containerEl);

  return {
    id: layerId(series),
    type,
    title: seriesName(series),
    ...(selector ? { selectors: selector } : {}),
    ...(isHorizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    axes: { x: { label: xLabel }, y: { label: yLabel } },
    data,
  };
}

function buildSegmentedLayer(
  barSeriesList: AmXYSeries[],
  xLabel: string,
  yLabel: string,
  containerEl: HTMLElement,
): MaidrLayer | null {
  const stackMode = detectStackMode(barSeriesList);

  let traceType: TraceType;
  switch (stackMode) {
    case 'normal':
      traceType = TraceType.STACKED;
      break;
    case '100%':
      traceType = TraceType.NORMALIZED;
      break;
    default:
      // Two series drawn back to back rather than side by side. Asked only of
      // an unstacked group, because the two sides of a pyramid sit either side
      // of the baseline rather than on top of one another — a stack that says
      // it is stacked is taken at its word.
      traceType = isDivergingPair(barSeriesList) ? TraceType.DIVERGING : TraceType.DODGED;
  }

  // Each series becomes one group (row) in the SegmentedPoint[][] grid.
  const data: SegmentedPoint[][] = [];
  const selectorParts: string[] = [];

  for (const series of barSeriesList) {
    const points = extractSegmentedPoints(series);
    if (points.length > 0) {
      data.push(points);
      const sel = buildColumnSelector(series, containerEl);
      if (sel)
        selectorParts.push(sel);
    }
  }

  if (data.length === 0)
    return null;

  const isHorizontal = typeof barSeriesList[0].get('categoryYField') === 'string';
  const combinedSelector = selectorParts.length > 0
    ? selectorParts.join(', ')
    : undefined;

  return {
    id: `segmented-${uid()}`,
    type: traceType,
    ...(combinedSelector ? { selectors: combinedSelector } : {}),
    ...(isHorizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    axes: { x: { label: xLabel }, y: { label: yLabel } },
    // `valueYShow: 'valueYTotalPercent'` is amCharts' instruction to itself to
    // draw the percent of total; the data items keep the raw value, and
    // `detectStackMode` above already reads that setting. The core divides
    // nothing itself, so without this the reader is pitched the counts across
    // a chart whose columns are all the same height (#967).
    data: traceType === TraceType.NORMALIZED
      ? toSegmentedShares(data, isHorizontal)
      : data,
  };
}

/**
 * Builds the layer for one waterfall series.
 *
 * The columns keep the order amCharts drew them in, which is what the reading
 * depends on: a bridge is a sequence, and each step is announced against the
 * running total the step before it produced.
 */
function buildWaterfallLayer(
  series: AmXYSeries,
  data: WaterfallPoint[],
  xLabel: string,
  yLabel: string,
  containerEl: HTMLElement,
): MaidrLayer {
  const selector = buildColumnSelector(series, containerEl);

  return {
    id: layerId(series),
    type: TraceType.WATERFALL,
    title: seriesName(series),
    ...(selector ? { selectors: selector } : {}),
    axes: { x: { label: xLabel }, y: { label: yLabel } },
    data,
  };
}

/**
 * Builds the layer for one dumbbell series.
 *
 * The two ends are named from the binder options when they were supplied —
 * see {@link AmChartsBinderOptions.dumbbellLabels} for why they cannot come
 * off the chart.
 */
function buildDumbbellLayer(
  series: AmXYSeries,
  points: DumbbellData['points'],
  xLabel: string,
  yLabel: string,
  containerEl: HTMLElement,
  options?: AmChartsBinderOptions,
): MaidrLayer {
  const selector = buildColumnSelector(series, containerEl);
  const labels = options?.dumbbellLabels;

  return {
    id: layerId(series),
    type: TraceType.DUMBBELL,
    title: seriesName(series),
    ...(selector ? { selectors: selector } : {}),
    axes: { x: { label: xLabel }, y: { label: yLabel } },
    data: {
      points,
      ...(labels?.start ? { startLabel: labels.start } : {}),
      ...(labels?.end ? { endLabel: labels.end } : {}),
    },
  };
}

/**
 * Builds the layer for one gantt series.
 *
 * Always horizontal: amCharts draws a schedule with the lanes on the category
 * Y axis and time running left to right, which is what the detection matched
 * on, so the announcement puts the lane on the main axis and the interval on
 * the cross one.
 */
function buildGanttLayer(
  series: AmXYSeries,
  data: GanttData,
  xLabel: string,
  yLabel: string,
  containerEl: HTMLElement,
): MaidrLayer {
  const selector = buildColumnSelector(series, containerEl);

  return {
    id: layerId(series),
    type: TraceType.GANTT,
    title: seriesName(series),
    ...(selector ? { selectors: selector } : {}),
    orientation: Orientation.HORIZONTAL,
    axes: { x: { label: xLabel }, y: { label: yLabel } },
    data,
  };
}

/**
 * What a hierarchy's two dimensions are called. A treemap is bound to no axis,
 * so the chart-level fallback would name them `x` and `y` — after coordinates
 * a tree does not have.
 */
const HIERARCHY_NODE_AXIS = 'Node';
const HIERARCHY_VALUE_AXIS = 'Value';

/** The trace type each hierarchy layout is announced as. */
const HIERARCHY_TRACE_TYPES = {
  treemap: TraceType.TREEMAP,
  icicle: TraceType.ICICLE,
  sunburst: TraceType.SUNBURST,
} as const;

/**
 * Builds the layer for one am5hierarchy series — a treemap, the icicle
 * amCharts calls a `Partition`, or the `Sunburst` that bends that icicle into
 * a ring.
 *
 * The three draw the same tree with different marks, so they differ here only
 * in which trace type they name; MAIDR navigates all three as a tree either
 * way. What the mark does change is the highlight: a treemap block and an
 * icicle bar are rectangles, and a sunburst node is a wedge, which the overlay
 * has to measure differently — see `buildHierarchyResolver`.
 *
 * No `selectors`, for the reason a pie emits none — amCharts paints the nodes
 * into a canvas. The binder's overlay highlights the active node's mark.
 */
function buildHierarchyLayer(
  series: AmXYSeries,
  kind: 'treemap' | 'icicle' | 'sunburst',
  data: TreemapPoint[],
  options?: AmChartsBinderOptions,
): MaidrLayer {
  return {
    id: layerId(series),
    type: HIERARCHY_TRACE_TYPES[kind],
    title: seriesName(series),
    axes: {
      x: { label: options?.axisLabels?.x ?? HIERARCHY_NODE_AXIS },
      y: { label: options?.axisLabels?.y ?? HIERARCHY_VALUE_AXIS },
    },
    data,
  };
}

/**
 * What a flow diagram's two dimensions are called. A sankey, an alluvial, a
 * chord and an arc diagram are all bound to no axis, and what a reader is
 * after at a node is how much moves through it.
 */
const FLOW_NODE_AXIS = 'Node';
const FLOW_WEIGHT_AXIS = 'Weight';

/** The axes every flow layer names, with the figure-wide override applied. */
function flowAxes(options?: AmChartsBinderOptions): MaidrLayer['axes'] {
  return {
    x: { label: options?.axisLabels?.x ?? FLOW_NODE_AXIS },
    y: { label: options?.axisLabels?.y ?? FLOW_WEIGHT_AXIS },
  };
}

/**
 * Builds the layer for one am5flow series — a `Sankey`, one of the three
 * `Chord` variants, or the `ArcDiagram` that draws the same weighted links
 * along a line.
 *
 * All of them are one weighted graph declared as one point per link, so they
 * differ here only in which trace type they announce; MAIDR reads all of them
 * with the same `FlowTrace`. The arc diagram is announced as a sankey because
 * it carries weights, and MAIDR's network payload has nowhere to put one.
 *
 * No `selectors`, for the reason a pie and a treemap emit none — amCharts
 * paints the ribbons into a canvas, so the binder's overlay outlines the active
 * one instead. It can, because `FlowTrace` publishes the ribbon it highlighted
 * as an index into this `data`: the position MAIDR hands back for a flow trace
 * is otherwise a braille one, `(stage, index within stage)`, and turning that
 * into a node would have meant reimplementing the model's node ordering and
 * stage layering here. See `navmap.ts`'s `buildFlowResolver`.
 */
function buildFlowLayer(
  series: AmXYSeries,
  type: TraceType.SANKEY | TraceType.CHORD,
  data: FlowPoint[],
  options?: AmChartsBinderOptions,
): MaidrLayer {
  return {
    id: layerId(series),
    type,
    ...(seriesName(series) ? { title: seriesName(series) } : {}),
    axes: flowAxes(options),
    data,
  };
}

/**
 * What a choropleth's two dimensions are called. A map is bound to no axis a
 * title could be read from — the value runs along a colour ramp and the
 * regions along nothing at all — so the chart-level fallback would name them
 * after coordinates the chart does not have. The same two names the Highcharts
 * adapter gives a `map` series.
 */
const CHOROPLETH_REGION_AXIS = 'Region';
const CHOROPLETH_VALUE_AXIS = 'Value';

/** The axes every choropleth layer names, with the figure-wide override applied. */
function choroplethAxes(options?: AmChartsBinderOptions): MaidrLayer['axes'] {
  return {
    x: { label: options?.axisLabels?.x ?? CHOROPLETH_REGION_AXIS },
    y: { label: options?.axisLabels?.y ?? CHOROPLETH_VALUE_AXIS },
  };
}

/**
 * Builds the layer for one am5map `MapPolygonSeries` shaded by a value.
 *
 * No `selectors`, for the reason a pie emits none — amCharts paints the
 * polygons into a canvas. The binder's overlay outlines the active region
 * instead, from the box the drawn polygon reports.
 */
function buildChoroplethLayer(
  series: AmXYSeries,
  data: ChoroplethPoint[],
  options?: AmChartsBinderOptions,
): MaidrLayer {
  return {
    id: layerId(series),
    type: TraceType.CHOROPLETH,
    ...(seriesName(series) ? { title: seriesName(series) } : {}),
    axes: choroplethAxes(options),
    data,
  };
}

/**
 * What a network's two dimensions are called. A force-directed graph is bound
 * to no axis either, and what a reader is after at a node is its degree.
 */
const NETWORK_NODE_AXIS = 'Node';
const NETWORK_LINK_AXIS = 'Links';

/**
 * Builds the layer for one `am5hierarchy.ForceDirected` series.
 *
 * Nothing about where the solver put the nodes is carried: the position is a
 * fact about its seed rather than about the data. No selectors either, for the
 * reason the flow layer emits none — and the overlay outlines the active link
 * the same way, from what `NetworkTrace` publishes.
 */
function buildNetworkLayer(
  series: AmXYSeries,
  data: NetworkPoint[],
  options?: AmChartsBinderOptions,
): MaidrLayer {
  return {
    id: layerId(series),
    type: TraceType.NETWORK,
    ...(seriesName(series) ? { title: seriesName(series) } : {}),
    axes: {
      x: { label: options?.axisLabels?.x ?? NETWORK_NODE_AXIS },
      y: { label: options?.axisLabels?.y ?? NETWORK_LINK_AXIS },
    },
    data,
  };
}

/**
 * What a gauge's two dimensions are called.
 *
 * A gauge is bound to an axis, but the axis is the *dial* — the range the
 * reading sits in — and the thing being measured is named nowhere on it. The
 * same split Highcharts' gauge converter makes.
 */
const GAUGE_MEASURE_AXIS = 'Measure';
const GAUGE_DIAL_AXIS = 'Value';

/**
 * Builds the layer for an am5radar gauge, or `null` for any other chart.
 *
 * The only layer in this adapter built from a chart rather than from a series.
 * amCharts draws a gauge's needle as an `AxisBullet` on an axis data item, so
 * a ClockHand gauge carries no series at all and there is nothing for the
 * series loop to find; `buildChartLayers` therefore asks this last, of a chart
 * that produced no layer.
 *
 * `null` rather than a layer of `NaN`s when the dial has no finite ends: the
 * caller drops a chart with no layers, which is the right degradation for a
 * dial whose range cannot be read.
 */
function buildGaugeLayer(
  chart: AmChart,
  options?: AmChartsBinderOptions,
): MaidrLayer | null {
  const hand = findGaugeHand(chart);
  if (!hand) {
    return null;
  }

  const title = readChartTitle(chart);
  const data: GaugePoint | null = extractGaugePoint(hand, title);
  if (!data) {
    return null;
  }

  return {
    id: `amcharts-gauge-${chart.uid ?? counter()}`,
    type: TraceType.GAUGE,
    ...(title ? { title } : {}),
    axes: {
      x: { label: options?.axisLabels?.x ?? GAUGE_MEASURE_AXIS },
      y: { label: options?.axisLabels?.y ?? readAxisLabel(hand.axis, GAUGE_DIAL_AXIS) },
    },
    data,
  };
}

function buildHistogramLayer(
  series: AmXYSeries,
  data: HistogramPoint[],
  xLabel: string,
  yLabel: string,
  containerEl: HTMLElement,
): MaidrLayer {
  const selector = buildColumnSelector(series, containerEl);

  return {
    id: layerId(series),
    type: TraceType.HISTOGRAM,
    title: seriesName(series),
    ...(selector ? { selectors: selector } : {}),
    axes: { x: { label: xLabel }, y: { label: yLabel } },
    data,
  };
}

/**
 * What a pie's two dimensions are called. A pie series is bound to no axis, so
 * the chart-level `readAxisLabel` fallback would name them `x` and `y` — after
 * coordinates a pie does not have. These name what each one actually holds.
 */
const PIE_LABEL_AXIS = 'Label';
const PIE_VALUE_AXIS = 'Value';

/**
 * Builds the layer for one pie series. A `PieChart` normally holds exactly
 * one, but amCharts allows several (concentric rings), and each becomes its
 * own layer — navigable with PageUp / PageDown like any other stack of layers.
 *
 * No `selectors` are emitted: amCharts renders to canvas, so there is no SVG
 * wedge to address. The binder's overlay highlights the active slice instead.
 */
function buildPieLayer(
  series: AmXYSeries,
  data: PiePoint[],
  options?: AmChartsBinderOptions,
): MaidrLayer {
  return {
    id: layerId(series),
    type: TraceType.PIE,
    title: seriesName(series),
    axes: {
      x: { label: options?.axisLabels?.x ?? PIE_LABEL_AXIS },
      y: { label: options?.axisLabels?.y ?? PIE_VALUE_AXIS },
    },
    data,
  };
}

/**
 * What a funnel's two dimensions are called. Like a pie, a sliced chart is
 * bound to no axis, so the chart-level fallback would name them `x` and `y`.
 */
const FUNNEL_STAGE_AXIS = 'Stage';
const FUNNEL_VALUE_AXIS = 'Value';

/**
 * Builds the layer for one am5percent funnel (or pyramid, or pictorial stack)
 * series. The stages stay in data order, which is what the funnel's retention
 * reading depends on: MAIDR pitches each stage against the one before it.
 *
 * No `selectors`, for the same reason a pie emits none — amCharts paints the
 * stages into a canvas. The binder's overlay highlights the active stage.
 */
function buildFunnelLayer(
  series: AmXYSeries,
  data: BarPoint[],
  options?: AmChartsBinderOptions,
): MaidrLayer {
  return {
    id: layerId(series),
    type: TraceType.FUNNEL,
    title: seriesName(series),
    axes: {
      x: { label: options?.axisLabels?.x ?? FUNNEL_STAGE_AXIS },
      y: { label: options?.axisLabels?.y ?? FUNNEL_VALUE_AXIS },
    },
    data,
  };
}

/**
 * What a word cloud's two dimensions are called. A cloud is bound to no axis —
 * its layout is chosen to pack glyphs and encodes nothing — so the chart-level
 * fallback would name them after coordinates that carry no meaning at all.
 */
const WORD_CLOUD_TERM_AXIS = 'Term';
const WORD_CLOUD_WEIGHT_AXIS = 'Weight';

/**
 * Builds the layer for one am5wc word cloud series.
 *
 * The terms stay in data order. MAIDR walks them heaviest first — the order a
 * cloud is read for, since its arrangement carries nothing — and derives that
 * from the weights themselves, so the layer declares what the chart declared.
 *
 * No `selectors`, for the reason a pie emits none — amCharts paints the glyphs
 * into a canvas. The binder's overlay highlights the active term's label.
 */
function buildWordCloudLayer(
  series: AmXYSeries,
  data: PiePoint[],
  options?: AmChartsBinderOptions,
): MaidrLayer {
  return {
    id: layerId(series),
    type: TraceType.WORD_CLOUD,
    title: seriesName(series),
    axes: {
      x: { label: options?.axisLabels?.x ?? WORD_CLOUD_TERM_AXIS },
      y: { label: options?.axisLabels?.y ?? WORD_CLOUD_WEIGHT_AXIS },
    },
    data,
  };
}

function buildHeatmapLayer(
  data: HeatmapData,
  xLabel: string,
  yLabel: string,
): MaidrLayer {
  return {
    id: `heatmap-${uid()}`,
    type: TraceType.HEATMAP,
    axes: { x: { label: xLabel }, y: { label: yLabel } },
    data,
  };
}

/**
 * Series kinds whose points are extracted identically and merged into one
 * layer per kind — everything MAIDR reads as a grid of series by samples.
 */
type MergedKind = 'line' | 'step' | 'area' | 'radar' | 'polar';

/** The trace types those merged layers are emitted as. */
type MergedTraceType
  = | TraceType.LINE
    | TraceType.BUMP
    | TraceType.STEP
    | TraceType.AREA
    | TraceType.STACKED_AREA
    | TraceType.NORMALIZED_AREA
    | TraceType.RADAR
    | TraceType.POLAR_AREA;

/** Layer-id prefix per merged type, so an id still names what it holds. */
const MERGED_ID_PREFIX: Record<MergedTraceType, string> = {
  [TraceType.LINE]: 'line',
  [TraceType.BUMP]: 'bump',
  [TraceType.STEP]: 'step',
  [TraceType.AREA]: 'area',
  [TraceType.STACKED_AREA]: 'area',
  [TraceType.NORMALIZED_AREA]: 'area',
  [TraceType.RADAR]: 'radar',
  [TraceType.POLAR_AREA]: 'polar',
};

/**
 * Series that merge into one layer, gathered as the chart is walked.
 */
interface MergedSeries {
  /** One entry per series, in chart order. */
  data: LinePoint[][];
  /** Names of the series that have one, joined into the layer title. */
  names: string[];
  /** Highlight selectors, for the series whose path could be resolved. */
  selectors?: string[];
}

function emptyMergedSeries(): MergedSeries {
  return { data: [], names: [] };
}

/**
 * Adds one series' points, name and selector to the layer it will merge into.
 */
function collectSeries(
  merged: MergedSeries,
  series: AmXYSeries,
  points: LinePoint[],
  containerEl: HTMLElement,
): void {
  merged.data.push(points);

  const name = seriesName(series);
  if (name)
    merged.names.push(name);

  const sel = buildLineSelector(series, containerEl);
  if (sel) {
    merged.selectors ??= [];
    merged.selectors.push(sel);
  }
}

/**
 * Builds the merged line or step layer.
 *
 * `stepDirection` is deliberately not emitted for a step layer: amCharts
 * positions the staircase from the axis cell rather than reporting a
 * convention, so naming one here would be a guess. MAIDR then stays silent
 * about it rather than describing a chart amCharts did not draw.
 */
function buildLineLayer(
  merged: MergedSeries,
  type: MergedTraceType,
  xLabel: string,
  yLabel: string,
): MaidrLayer {
  const title = merged.names.length > 0 ? merged.names.join(', ') : undefined;
  const selectors = merged.selectors;

  return {
    id: `${MERGED_ID_PREFIX[type]}-${uid()}`,
    type,
    ...(title ? { title } : {}),
    ...(selectors && selectors.length > 0 ? { selectors } : {}),
    axes: { x: { label: xLabel }, y: { label: yLabel } },
    data: merged.data,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Error thrown when no chart yields a supported series with data. */
function noSupportedDataError(): Error {
  return new Error(
    'maidr amCharts binder: no supported series with data found in any chart. '
    + 'Ensure series data is set before calling fromAmCharts()/bindAmCharts().',
  );
}

/**
 * Collect every convertible chart in the root's container tree, in depth-first
 * (insertion) order.
 *
 * Recursion reaches charts nested inside intermediate containers — notably
 * am5stock `StockPanel`s (which extend `XYChart`) inside a `StockChart`'s
 * panels container. `XYChartScrollbar` subtrees are pruned before recursion:
 * a real scrollbar is a plain `Scrollbar` container (NOT chart-like itself)
 * whose child is a preview `XYChart` — descending into it would surface that
 * preview as a phantom panel (e.g. a scrollbar mounted in a StockChart's
 * toolsContainer, the standard am5stock pattern). Found charts are also not
 * descended into, so an in-chart scrollbar preview is never visited either.
 */
export function findCharts(root: AmRoot): AmChart[] {
  const found: AmChart[] = [];
  collectCharts(root.container, found);
  return found;
}

/**
 * Collect only the XY charts in the root's container tree.
 *
 * The narrower counterpart of {@link findCharts}, kept because it is part of
 * the adapter's public API and because "every XY chart" is still a question
 * worth asking of a mixed root.
 */
export function findXYCharts(root: AmRoot): AmChart[] {
  return findCharts(root).filter(isXYChartLike);
}

function collectCharts(node: unknown, found: AmChart[]): void {
  for (const child of childValues(node)) {
    const cls = (child as { className?: string } | null)?.className;
    if (cls === 'XYChartScrollbar') {
      // Never a panel; its child preview XYChart must not be found either.
      continue;
    }
    if (isXYChartLike(child) || isPercentChartLike(child)) {
      found.push(child);
      continue;
    }
    const map = asMapPanel(child);
    if (map) {
      found.push(map);
      continue;
    }
    const standalone = asStandalonePanel(child);
    if (standalone) {
      found.push(standalone);
      continue;
    }
    collectCharts(child, found);
  }
}

/** Read a container-like entity's `children.values`, or `[]` if absent. */
function childValues(node: unknown): unknown[] {
  if (node == null || typeof node !== 'object')
    return [];
  const children = (node as { children?: { values?: unknown[] } }).children;
  const values = children?.values;
  return Array.isArray(values) ? values : [];
}

/** Duck-type check: an XYChart has series, xAxes, and yAxes. */
function isXYChartLike(candidate: unknown): candidate is AmChart {
  if (candidate == null || typeof candidate !== 'object')
    return false;
  const c = candidate as Partial<AmChart>;
  return Boolean(c.series && c.xAxes && c.yAxes);
}

/**
 * Charts of the am5percent module: a `PieChart` and the `SlicedChart` that
 * carries funnels, pyramids and pictorial stacks. Both are `SerialChart`s with
 * a series list and no axes.
 */
const PERCENT_CHART_CLASSES = new Set([
  'PieChart',
  'SlicedChart',
]);

/**
 * Duck-type check for an am5percent chart.
 *
 * These charts have a series list but no axes, which on its own is too weak a
 * signature — plenty of am5 containers carry a `series` property of some kind.
 * The class name is what makes it specific, and am5 sets it on every entity.
 */
function isPercentChartLike(candidate: unknown): candidate is AmChart {
  if (candidate == null || typeof candidate !== 'object')
    return false;
  const c = candidate as Partial<AmChart>;
  return typeof c.className === 'string'
    && PERCENT_CHART_CLASSES.has(c.className)
    && Boolean(c.series);
}

/**
 * The am5map chart class a choropleth is drawn in.
 *
 * A `MapChart` is a `SerialChart`: it has a series list and no axes, which is
 * the same signature an am5percent chart carries — so the class name is what
 * separates them, exactly as it does there.
 */
const MAP_CHART_CLASSES = new Set([
  'MapChart',
]);

/**
 * Wrap an am5map `MapChart` as a panel.
 *
 * The one chart in the library that discovery could not see. It answers to
 * neither {@link isXYChartLike} (no axes) nor {@link isPercentChartLike} (a
 * class name of its own), so `collectCharts` used to recurse straight past it
 * into its own containers and surface nothing.
 *
 * The wrapper exists for one read: `plotContainer`. A `MapChart` has none —
 * that is an `XYChart` notion — but it IS a `Container`, so pointing the slot
 * at the chart itself answers `globalBounds()` / `toGlobal()` / `width()` /
 * `height()`, which is all {@link readPlotBounds} asks for. That keeps
 * multi-panel highlight clipping and {@link computeChartGrid} working on the
 * same reads every other panel uses; without it a map beside another chart
 * would have its highlight suppressed outright.
 *
 * The same trick {@link asStandalonePanel} uses to give a bare series the
 * shape of a chart, and the `children` list is carried across so the panel
 * keeps its title.
 *
 * @returns The wrapped panel, or `null` for anything that is not one.
 */
function asMapPanel(candidate: unknown): AmChart | null {
  if (candidate == null || typeof candidate !== 'object')
    return null;

  const chart = candidate as AmChart;
  if (typeof chart.className !== 'string' || !MAP_CHART_CLASSES.has(chart.className))
    return null;
  if (!Array.isArray(chart.series?.values))
    return null;

  const children = (candidate as { children?: unknown }).children;
  return {
    className: chart.className,
    uid: chart.uid,
    get: key => chart.get(key),
    series: chart.series,
    ...(children != null ? { children } : {}),
    plotContainer: chart as AmChart['plotContainer'],
  } as AmChart;
}

/**
 * Wrap a standalone am5 series as the one-series panel it is.
 *
 * An am5hierarchy layout and an am5wc word cloud are not charts: each is an
 * `am5.Series` pushed straight into a container, with no `series` list, no
 * axes and no plot area, so discovery would recurse past it into its own
 * nodes. Recognising it by class name and wrapping it gives the rest of the
 * adapter the shape it works in — one panel, one series — without widening the
 * chart type for a chart that does not exist.
 *
 * The series stands in as its own plot container, which is exactly what it is:
 * an am5 series IS a `Container`, so the panel it occupies is the box the
 * series reports. That keeps highlight clipping and multi-panel grid layout
 * working for it on the same reads every other panel uses.
 *
 * @returns The wrapped panel, or `null` for anything that is not one.
 */
function asStandalonePanel(candidate: unknown): AmChart | null {
  if (candidate == null || typeof candidate !== 'object')
    return null;

  const series = candidate as AmXYSeries;
  if (typeof series.className !== 'string' || !STANDALONE_SERIES_CLASSES.has(series.className))
    return null;
  if (!Array.isArray(series.dataItems))
    return null;

  return {
    className: series.className,
    uid: series.uid,
    get: key => series.get(key),
    series: { values: [series] },
    plotContainer: series,
  };
}

/**
 * Detect the stacking mode from a list of series that share a layer.
 *
 * In amCharts 5, stacking is a per-series setting, not an axis setting:
 * `series.get('stacked')` is `true` for a stacked column or area band, and a
 * 100% (normalized) stack additionally sets `valueYShow` (or `valueXShow` for
 * horizontal columns) to `'valueYTotalPercent'` / `'valueXTotalPercent'`.
 * Columns with no `stacked` flag render side-by-side (dodged); area bands with
 * none are independent overlapping bands.
 */
function detectStackMode(seriesList: AmXYSeries[]): 'none' | 'normal' | '100%' {
  let anyStacked = false;
  for (const series of seriesList) {
    if (series.get('stacked') !== true)
      continue;
    anyStacked = true;
    const show = series.get('valueYShow') ?? series.get('valueXShow');
    if (show === 'valueYTotalPercent' || show === 'valueXTotalPercent')
      return '100%';
  }
  return anyStacked ? 'normal' : 'none';
}

function readChartTitle(chart: AmChart): string | undefined {
  // amCharts 5 titles are typically children of the chart.
  // A title entity has className "Label" or "Title" and a text property.
  if (!('children' in chart))
    return undefined;

  const children = (chart as unknown as Record<string, unknown>).children;
  if (children == null || typeof children !== 'object')
    return undefined;

  const values = (children as Record<string, unknown>).values;
  if (!Array.isArray(values))
    return undefined;

  for (const child of values) {
    if (child == null || typeof child !== 'object')
      continue;
    const c = child as Record<string, unknown>;
    if (c.className === 'Label' || c.className === 'Title') {
      if (typeof c.get === 'function') {
        const text = (c as { get: (k: string) => unknown }).get('text');
        if (typeof text === 'string' && text.length > 0)
          return text;
      }
    }
  }
  return undefined;
}

function seriesName(series: AmXYSeries): string | undefined {
  const name = series.get('name');
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}

function layerId(series: AmXYSeries): string {
  return `amcharts-series-${series.uid ?? counter()}`;
}

/**
 * Monotonically increasing counter used as a fallback when no deterministic
 * ID (e.g. container id, series uid) is available.
 *
 * IDs produced by this counter are ephemeral — they are not stable across
 * page loads or hot reloads and must not be persisted.
 */
let _counter = 0;
function counter(): string {
  return String(++_counter);
}

/**
 * Produce a short identifier for a generated layer.
 * Prefers the container's DOM `id`; falls back to the monotonic counter.
 */
function uid(): string {
  return counter();
}
