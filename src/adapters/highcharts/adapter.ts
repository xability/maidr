/**
 * Core adapter that converts a Highcharts chart instance into MAIDR-compatible
 * data. The returned {@link Maidr} object can be passed directly to the
 * `<Maidr data={...}>` React component or serialized as a `maidr-data`
 * HTML attribute.
 *
 * @example
 * ```ts
 * import Highcharts from 'highcharts';
 * import { highchartsToMaidr } from 'maidr/highcharts';
 *
 * const chart = Highcharts.chart('container', { ... });
 * const maidrData = highchartsToMaidr(chart);
 * ```
 */

import type {
  ChoroplethDeclaration,
  FieldRef,
  ForestDeclaration,
  MaidrTraceDeclaration,
  SeriesRef,
  SurvivalDeclaration,
} from '../../type/declaration';
import type {
  AxisConfig,
  BarPoint,
  BoxPoint,
  CandlestickPoint,
  CandlestickTrend,
  ChoroplethPoint,
  DumbbellData,
  DumbbellPoint,
  ErrorBarPoint,
  FlowPoint,
  ForestPoint,
  GanttData,
  GanttPoint,
  GaugeBand,
  GaugePoint,
  HeatmapData,
  HexbinPoint,
  HistogramPoint,
  LinePoint,
  Maidr,
  MaidrLayer,
  MaidrSubplot,
  MosaicPoint,
  NetworkPoint,
  PiePoint,
  ScatterPoint,
  SegmentedPoint,
  StepDirection,
  SurvivalPoint,
  ThresholdOptions,
  TreemapPoint,
  VolcanoPoint,
  WaterfallKind,
  WaterfallPoint,
  WordCloudPoint,
} from '../../type/grammar';
import type { DeclarationContext } from '../shared/traceDeclaration';
import type { HighchartsAdapterOptions, HighchartsAxis, HighchartsChart, HighchartsNode, HighchartsPoint, HighchartsSeries } from './types';
import { Orientation, TraceType } from '../../type/grammar';
import {
  isFlagValue,
  readDeclarationSlot,
  resolveFieldRef,
  warnUnresolvedRef,
} from '../shared/traceDeclaration';
import {
  barPointSelector,
  barSelector,
  boxplotSelectors,
  bulletSelector,
  candlestickSelectors,
  choroplethSelectors,
  dumbbellSelector,
  ensureContainerId,
  errorBarSelector,
  flowSelector,
  funnelSelector,
  ganttSelectors,
  gaugeSelector,
  heatmapSelectors,
  hexbinSelectors,
  histogramSelector,
  lineSelectors,
  lollipopSelector,
  networkSelector,
  pieSelector,
  polarAreaSelectors,
  scatterSelector,
  seriesGroupSelector,
  solidGaugeSelector,
  treemapSelectors,
  volcanoSelector,
  waterfallSelector,
  wordCloudSelector,
} from './selectors';

let chartCounter = 0;

/**
 * Converts a rendered Highcharts chart into a MAIDR data structure.
 *
 * The chart must already be rendered (i.e. the SVG DOM exists) so that
 * CSS selectors can be generated for element highlighting.
 *
 * Supported Highcharts series types:
 * - `bar`, `column` → {@link TraceType.BAR}
 * - `line`, `spline` → {@link TraceType.LINE}, or {@link TraceType.STEP} when
 *   the series sets `step`
 * - `area`, `areaspline` → {@link TraceType.AREA}
 * - `scatter` → {@link TraceType.SCATTER}, or {@link TraceType.DOT} on a
 *   category axis (a Cleveland dot plot)
 * - `lollipop` → {@link TraceType.LOLLIPOP}
 * - `timeline` → {@link TraceType.SCATTER}, each event named on its point
 * - `funnel`, `pyramid` → {@link TraceType.FUNNEL}
 * - `wordcloud` → {@link TraceType.WORD_CLOUD}
 * - `sankey`, `arcdiagram` → {@link TraceType.SANKEY}
 * - `dependencywheel` → {@link TraceType.CHORD}
 * - `networkgraph` → {@link TraceType.NETWORK}
 * - `treemap` → {@link TraceType.TREEMAP}
 * - `sunburst` → {@link TraceType.SUNBURST}
 * - `gauge`, `solidgauge`, `bullet` → {@link TraceType.GAUGE}
 * - `waterfall` → {@link TraceType.WATERFALL}
 * - `errorbar` → {@link TraceType.ERROR_BAR}, taking its estimates from the
 *   series it is linked to
 * - `dumbbell` → {@link TraceType.DUMBBELL}
 * - `gantt`, `xrange` → {@link TraceType.GANTT}
 * - `boxplot` → {@link TraceType.BOX}
 * - `heatmap` → {@link TraceType.HEATMAP}
 * - `map` (Highmaps) → {@link TraceType.CHOROPLETH}
 * - `mapbubble` → {@link TraceType.CHOROPLETH}, taking its value from the
 *   marker size Highcharts names `z`
 * - `mappoint` → {@link TraceType.SCATTER} of degrees east against degrees
 *   north, each place on {@link ScatterPoint.label}
 * - `tilemap` → {@link TraceType.HEXBIN}, or {@link TraceType.HEATMAP} when
 *   its `tileShape` is `square` (an aligned grid rather than a stagger)
 * - `histogram` → {@link TraceType.HISTOGRAM}
 * - `candlestick`, `ohlc`, `hlc` → {@link TraceType.CANDLESTICK}, the last
 *   without an opening price and so without a body, a trend or a pattern
 * - `pie` (including doughnuts, which are a pie with an `innerSize`) →
 *   {@link TraceType.PIE}
 * - Stacked `column`/`bar` → {@link TraceType.STACKED}
 * - Grouped (dodged) `column`/`bar` → {@link TraceType.DODGED}
 * - Percent-stacked `column`/`bar` → {@link TraceType.NORMALIZED}
 * - Stacked `area`/`areaspline` → {@link TraceType.STACKED_AREA}
 * - Percent-stacked `area`/`areaspline` → {@link TraceType.NORMALIZED_AREA}
 * - Two stacked `column`/`bar` series growing opposite ways →
 *   {@link TraceType.DIVERGING}
 *
 * Two chart-wide drawing modes override the series types above, because they
 * change what a series means without changing what it is called:
 * - `chart.polar` → {@link TraceType.RADAR} for `line`/`spline`/`area`
 *   series, {@link TraceType.POLAR_AREA} for `column`/`bar` ones
 * - `chart.parallelCoordinates` → {@link TraceType.PARALLEL}
 *
 * Two more are read from the data or declared by the caller, because
 * Highcharts draws them with a series type it shares with something else:
 * - `line`/`spline` series carrying a rank permutation on a reversed axis →
 *   {@link TraceType.BUMP}, forced or suppressed with `options.bump`
 * - `scatter` series named by `options.significancePlot` →
 *   {@link TraceType.VOLCANO} or {@link TraceType.MANHATTAN}, merged into one
 *   layer
 *
 * Two more are declared on the series itself, in the `maidr` block of
 * Highcharts' reserved `custom` subspace, because nothing in the chart object
 * says what the drawing means:
 * - `custom.maidr = { type: 'survival' }` on a stepped `line` series →
 *   {@link TraceType.SURVIVAL}, absorbing a linked `scatter` as its censoring
 *   ticks and a linked `arearange` as its confidence band
 * - `custom.maidr = { type: 'forest', … }` on the estimate series →
 *   {@link TraceType.FOREST}, taking its interval from the `errorbar` linked
 *   over it and its weights, pooled row and null line from the declaration
 *
 * Multi-pane charts (multiple `yAxis`/`xAxis` entries laid out as separate
 * bands, e.g. the Highstock price + volume pattern) are detected from the
 * rendered axis geometry and emitted as a MAIDR subplot grid — one subplot
 * per pane, navigable with arrow keys. Ambiguous layouts (overlapping bands,
 * dual-axis overlays) fall back to today's single-subplot output.
 *
 * @param chart - A Highcharts chart instance (the return value of `Highcharts.chart()`).
 * @param options - Optional overrides for ID, title, or series filtering.
 * @returns A {@link Maidr} object ready for use with the MAIDR library.
 */
export function highchartsToMaidr(
  chart: HighchartsChart,
  options?: HighchartsAdapterOptions,
): Maidr {
  const id = options?.id ?? `highcharts-${chartCounter++}`;
  const title = options?.title ?? chart.title?.textStr ?? '';
  const subtitle = chart.subtitle?.textStr;
  const caption = chart.caption?.textStr;

  const containerId = ensureContainerId(chart);

  const seriesToConvert = collectUsableSeries(chart, options?.seriesIndices);

  return {
    id,
    title,
    subtitle,
    caption,
    subplots: buildSubplotGrid(seriesToConvert, chart, containerId, options),
  };
}

/**
 * Builds the subplot grid for one chart: a multi-pane chart becomes one
 * subplot per detected pane; everything else keeps the single-subplot path.
 *
 * @internal
 */
export function buildSubplotGrid(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
  options?: HighchartsAdapterOptions,
): MaidrSubplot[][] {
  // One conversion, one reading of every declaration. See declarationCache.
  resetDeclarationCache();

  const paneGrid = detectPaneGrid(seriesList);

  if (paneGrid) {
    // Never emit `{ layers: [] }` cells or empty rows — the MAIDR model
    // crashes on both — so compact ragged rows instead.
    const rows = paneGrid
      .map(row => row
        .map((group) => {
          const subplot = buildSubplot(group, chart, containerId, options);
          applyPaneTitleFallback(subplot, group);
          return subplot;
        })
        .filter(subplot => subplot.layers.length > 0))
      .filter(row => row.length > 0);

    const total = rows.reduce((count, row) => count + row.length, 0);
    if (total > 1) {
      return rows;
    }
    // Fewer than two usable panes survived conversion — fall through to the
    // single-subplot path so the output matches a plain chart exactly.
  }

  return [[buildSubplot(seriesList, chart, containerId, options)]];
}

/**
 * Converts a list of Highcharts series into one MAIDR subplot.
 *
 * Bar/column series are grouped into a single stacked/dodged/normalized
 * layer, area series into a single (optionally stacked) area layer, line-like
 * series merge into one multi-line layer, and every other supported series
 * becomes its own layer.
 *
 * @internal
 */
export function buildSubplot(
  seriesToConvert: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
  options?: HighchartsAdapterOptions,
): MaidrSubplot {
  // A radial chart is drawn from the same series types as a cartesian one:
  // a radar's spokes are `line` series, a wind rose's wedges are `column`
  // ones, and a parallel coordinates plot's observations are `line` series
  // too. Only the chart-wide flag says which chart was drawn, so it is read
  // here — a series that reached the buckets below would be merged into an
  // ordinary line or bar layer announcing the wrong chart.
  const radialType = radialLineType(chart);
  const isPolar = chart.options.chart?.polar === true;

  // A series that says what it means is read that way, ahead of everything
  // else: the buckets below decide from how a series is drawn, and the whole
  // point of a declaration is that the drawing does not say. It also runs
  // before the error bar pass, since a forest plot's estimate series is
  // exactly the parent that pass would otherwise absorb.
  const declared = convertDeclaredSeries(seriesToConvert, chart, containerId);
  const undeclared = seriesToConvert.filter(series => !declared.consumed.has(series));

  // An error bar carries only the interval; its estimate lives in the series
  // it is linked to. That series is therefore read THROUGH the error bar
  // layer rather than as a bar of its own, so it is dropped here.
  const absorbed = seriesReadAsErrorBars(undeclared, chart);
  const convertible = undeclared.filter(series => !absorbed.has(series));

  // A volcano or Manhattan plot is drawn as plain `scatter` series, so only
  // the caller can say that is what it is. They are pulled out ahead of the
  // buckets because they become ONE layer: a Manhattan is one series per
  // chromosome and one cloud, and its threshold spans all of them.
  const significanceSeries = significancePlotSeries(convertible, chart, options);

  // Categorize series by how they need to be converted. Areas are their own
  // bucket rather than part of the line one: a filled band is a different
  // chart to announce, and a stacked band draws a second magnitude that a
  // line layer has nowhere to carry. Under a radial mode that distinction
  // disappears — an area series is one more outline around the spokes, with
  // no baseline to fill down to — so the two buckets become one.
  const lineTypes = new Set(radialType
    ? ['line', 'spline', 'area', 'areaspline']
    : ['line', 'spline']);
  // A streamgraph is a stacked area floated off the baseline: Highcharts
  // registers it as its own series type, so it fell into no bucket at all and
  // the chart came out with no layers (#1046). It reads as one of these --
  // `point.y` is each band's own value, the same field `convertAreaSeries`
  // already takes, and the centred offsets live on `stackY` where nothing
  // needs them. No radial variant exists, so `radialType` keeps its empty set.
  const areaTypes = new Set(radialType ? [] : ['area', 'areaspline', 'streamgraph']);
  // `columnpyramid` and `pictorial` are a column drawn differently -- a
  // tapered outline, and a repeated icon -- and carry the same `point.y` per
  // category that `column` does. Highcharts registers each as its own series
  // type, so both fell past every bucket and their charts came out with no
  // layers at all, the same way `streamgraph` did (#1138).
  const barTypes = new Set([
    'bar',
    'column',
    'columnpyramid',
    'pictorial',
  ]);

  const lineSeries = convertible.filter(s => lineTypes.has(resolveSeriesType(s, chart)));
  const areaSeries = convertible.filter(s => areaTypes.has(resolveSeriesType(s, chart)));
  const barSeries = convertible.filter(s => barTypes.has(resolveSeriesType(s, chart)));
  const otherSeries = convertible.filter((s) => {
    const type = resolveSeriesType(s, chart);
    return !significanceSeries.includes(s)
      && !lineTypes.has(type) && !areaTypes.has(type) && !barTypes.has(type);
  });

  const layers: MaidrLayer[] = [...declared.layers];

  // Convert bar/column series — may be stacked, dodged, normalized or, on a
  // polar chart, the wedges of a wind rose.
  if (barSeries.length > 0) {
    if (isPolar) {
      const layer = convertRadialSeries(barSeries, chart, containerId, TraceType.POLAR_AREA);
      if (layer) {
        layers.push(layer);
      }
    } else {
      layers.push(...convertBarGroup(barSeries, chart, containerId));
    }
  }

  // Convert area series as one layer. Stacking is why they cannot be split:
  // a band's running total only exists when every band is in the same layer.
  if (areaSeries.length > 0) {
    const layer = convertAreaSeries(areaSeries, chart, containerId);
    if (layer) {
      layers.push(layer);
    }
  }

  // Convert non-line/non-area/non-bar series individually.
  for (const series of otherSeries) {
    const layer = convertSeries(series, chart, containerId, options);
    if (layer) {
      layers.push(layer);
    }
  }

  // Convert the scatter series the caller declared as one threshold-read
  // cloud.
  if (significanceSeries.length > 0 && options?.significancePlot) {
    const layer = convertSignificanceSeries(
      significanceSeries,
      chart,
      containerId,
      options.significancePlot,
    );
    if (layer) {
      layers.push(layer);
    }
  }

  // Under a radial mode the whole line bucket is one layer — one outline per
  // series around the shared spokes — and `step` has no meaning there, since
  // there is no interpolation to make piecewise constant.
  if (radialType) {
    const layer = radialType === TraceType.PARALLEL
      ? convertParallelSeries(lineSeries, chart, containerId)
      : convertRadialSeries(lineSeries, chart, containerId, TraceType.RADAR);
    if (layer) {
      layers.push(layer);
    }
    return finishSubplot(layers, seriesToConvert, containerId);
  }

  // A bump chart is drawn from ordinary line series too — what makes it one
  // is that the numbers are ranks, which is a fact about the data rather than
  // about the series type. It has to be decided before the step split, since
  // a rank table is one layer whatever the lines are drawn like.
  if (lineSeries.length > 0 && readsAsBump(lineSeries, options)) {
    const layer = convertBumpSeries(lineSeries, containerId);
    if (layer) {
      layers.push(layer);
      return finishSubplot(layers, seriesToConvert, containerId);
    }
  }

  // Convert line series together as a single multi-line layer (MAIDR expects
  // LinePoint[][]). A series drawn with `step` is piecewise constant rather
  // than interpolated, so it becomes a step layer instead — one per convention,
  // since a layer carries a single `stepDirection` for all of its series.
  const stepSeries = new Map<StepDirection, HighchartsSeries[]>();
  const plainLineSeries: HighchartsSeries[] = [];
  for (const series of lineSeries) {
    const direction = stepDirectionOf(series);
    if (direction === undefined) {
      plainLineSeries.push(series);
      continue;
    }
    const bucket = stepSeries.get(direction);
    if (bucket) {
      bucket.push(series);
    } else {
      stepSeries.set(direction, [series]);
    }
  }

  if (plainLineSeries.length > 0) {
    const layer = convertLineSeries(plainLineSeries, chart, containerId);
    if (layer) {
      layers.push(layer);
    }
  }

  for (const [direction, series] of stepSeries) {
    const layer = convertLineSeries(series, chart, containerId, direction);
    if (layer) {
      layers.push(layer);
    }
  }

  return finishSubplot(layers, seriesToConvert, containerId);
}

/**
 * Wraps a converted subplot's layers with the panel geometry and the legend
 * MAIDR reads them through.
 *
 * @param layers - The layers converted for this panel
 * @param seriesToConvert - The panel's series, for the geometry selector
 * @param containerId - The chart's render-target id
 * @returns The finished subplot
 */
function finishSubplot(
  layers: MaidrLayer[],
  seriesToConvert: HighchartsSeries[],
  containerId: string,
): MaidrSubplot {
  const subplot: MaidrSubplot = { layers };

  // Point the subplot at its own panel geometry (the first series' rendered
  // group). Highcharts SVG has no `g[id^="axes_"]` groups, so MAIDR's layout
  // pass relies on this element to compute the panels' visual order and the
  // vertical arrow-key direction for multi-row grids. The first layer's
  // selectors cannot serve as a fallback for every trace type (box,
  // candlestick, and heatmap layers carry structured selector objects).
  if (layers.length > 0 && seriesToConvert.length > 0) {
    subplot.selector = seriesGroupSelector(containerId, seriesToConvert[0].index);
  }

  // Add legend labels when multiple layers are present, aligned to layers.
  if (layers.length > 1) {
    subplot.legend = layers.map(l => l.title ?? `Series ${l.id}`);
  }

  return subplot;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the chart's convertible series: visible (optionally restricted to
 * `indices`) and not internal. Highstock injects internal helper series (the
 * navigator preview, marked via `isInternal` / the `highcharts-navigator-series`
 * class) that mirror real data and must never become their own layers.
 *
 * @internal
 */
export function collectUsableSeries(
  chart: HighchartsChart,
  indices?: number[],
): HighchartsSeries[] {
  return filterSeries(chart, indices).filter(series => !isInternalSeries(series));
}

function isInternalSeries(series: HighchartsSeries): boolean {
  // Highcharts reliably marks the real Highstock navigator series with both
  // `isInternal` and the `highcharts-navigator-series` class. Do NOT match on
  // the series name — a legitimate user series named "Navigator" must convert.
  const { isInternal, className } = series.options;
  return isInternal === true
    || (typeof className === 'string' && className.includes('highcharts-navigator-series'));
}

function filterSeries(
  chart: HighchartsChart,
  indices?: number[],
): HighchartsSeries[] {
  if (!indices) {
    return chart.series.filter(s => s.visible);
  }

  const result: HighchartsSeries[] = [];
  for (const i of indices) {
    const series = chart.series[i];
    if (!series) {
      console.warn(`[MAIDR Highcharts] Series index ${i} does not exist; skipping.`);
      continue;
    }
    if (!series.visible) {
      console.warn(`[MAIDR Highcharts] Series index ${i} ("${series.name}") is hidden; skipping.`);
      continue;
    }
    result.push(series);
  }
  return result;
}

function resolveSeriesType(series: HighchartsSeries, chart: HighchartsChart): string {
  return series.type || series.options.type || chart.options.chart?.type || 'line';
}

/**
 * How a chart's line-family series should be read, when a chart-wide drawing
 * mode overrides the series type.
 *
 * Highcharts expresses both of these modes as a flag on the chart rather than
 * as a series type: a radar and a parallel coordinates plot are alike made of
 * plain `line` series, and only the flag distinguishes them from an ordinary
 * line chart. Parallel coordinates wins when a chart declares both — a star
 * plot is parallel coordinates bent around a circle, and every column is still
 * a different quantity, which is the fact that decides how it has to be
 * pitched.
 *
 * @param chart - The chart to inspect
 * @returns The trace type its line series carry, or undefined for a plain
 * cartesian chart
 */
function radialLineType(
  chart: HighchartsChart,
): TraceType.RADAR | TraceType.PARALLEL | undefined {
  if (chart.options.chart?.parallelCoordinates === true) {
    return TraceType.PARALLEL;
  }
  if (chart.options.chart?.polar === true) {
    return TraceType.RADAR;
  }
  return undefined;
}

function getAxisLabel(series: HighchartsSeries, axis: 'x' | 'y'): AxisConfig {
  const axisObj = axis === 'x' ? series.xAxis : series.yAxis;
  const label = axisObj?.options?.title?.text ?? (axis === 'x' ? 'X' : 'Y');
  return { label };
}

/**
 * The labels an axis calls its slots by, from wherever Highcharts put them.
 *
 * There are two places, and which one is filled depends only on how the
 * author spelled the axis. Measured on Highcharts 11.4.8 in Chromium, the
 * same two-bar chart drawn twice:
 *
 *     declaration                  axis.categories   axis.names   drawn ticks
 *     xAxis: { categories: [...] } ['A', 'B']        []           A, B
 *     xAxis: { type: 'category' }  []                ['A', 'B']   A, B
 *
 * The second is the spelling Highcharts' own documentation uses for a chart
 * of named tuples, and `categories` is an **empty array** there -- truthy,
 * so `axis.categories?.[i]` reads as `undefined` rather than falling through
 * a nullish check, and every label was lost (#1146).
 *
 * @param axis - The axis to ask, if there is one
 * @returns Its category labels, or an empty array when it has none
 */
function declaredCategories(axis: HighchartsAxis | undefined): string[] {
  const declared = axis?.categories;
  if (declared !== undefined && declared.length > 0) {
    return declared;
  }
  return axis?.names ?? [];
}

/**
 * What an axis calls one of its slots.
 *
 * @param axis - The axis to ask, if there is one
 * @param index - Which slot
 * @returns The label, or undefined when the axis names no such slot
 */
function axisCategoryAt(
  axis: HighchartsAxis | undefined,
  index: number,
): string | undefined {
  const label = declaredCategories(axis)[Math.round(index)];
  // A blank label names nothing, and announcing it would replace a position
  // a reader can at least count with silence.
  return typeof label === 'string' && label !== '' ? label : undefined;
}

/**
 * What a point is called.
 *
 * The axis is asked first, because a category axis' labels are what the
 * chart prints under the marks -- and because `point.category` is the label
 * only on one of the two spellings. On the other it holds the point's
 * **index**, which `??` will not fall through: `0` is neither null nor
 * undefined, so the fallbacks below it were unreachable and every category
 * came out as its own subscript (#1146).
 *
 * @param point - The point to name
 * @returns Its label, or its `x` when nothing names it
 */
function pointLabel(point: HighchartsPoint): string | number {
  return axisCategoryAt(point.series?.xAxis, point.x)
    ?? point.category
    ?? point.name
    ?? point.x;
}

/**
 * The `plotOptions` keys a stacking mode can be declared under, per series
 * type. Highcharts merges `plotOptions[type]` into `series.options` before it
 * renders, so these only matter for the partially built chart objects the
 * adapter is sometimes handed — but a stacked chart read as unstacked
 * announces one magnitude where two are drawn, so they are checked anyway.
 */
const STACKABLE_PLOT_OPTIONS = ['column', 'bar', 'area', 'areaspline'] as const;

/**
 * Determines the stacking mode for a series by checking series-level then chart-level options.
 */
function getStackingMode(series: HighchartsSeries, chart: HighchartsChart): string | undefined {
  // Series-level stacking takes precedence.
  if (series.options.stacking) {
    return series.options.stacking;
  }

  // Chart-level plotOptions, keyed by the series' own type then by `series`.
  const plotOptions = chart.options.plotOptions;
  const seriesType = resolveSeriesType(series, chart);
  const typeKey = STACKABLE_PLOT_OPTIONS.find(key => key === seriesType);
  return (typeKey && plotOptions?.[typeKey]?.stacking) || plotOptions?.series?.stacking;
}

/**
 * The stacking mode a group of series is drawn with.
 *
 * A layer carries one stacking mode for all of its series, so a group whose
 * series disagree has to settle on one: the first series' mode is used and the
 * disagreement is reported rather than resolved silently.
 */
function resolveGroupStacking(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
): string | undefined {
  const stackingModes = seriesList.map(s => getStackingMode(s, chart));
  const uniqueModes = [...new Set(stackingModes)];
  if (uniqueModes.length > 1) {
    console.warn(
      `[MAIDR Highcharts] Inconsistent stacking modes across series: ${
        JSON.stringify(uniqueModes)}. Using mode from first series.`,
    );
  }
  return stackingModes[0];
}

// ---------------------------------------------------------------------------
// Pane detection (multi-axis charts → subplot grid)
// ---------------------------------------------------------------------------

/**
 * Pixel tolerance when clustering axis positions into pane bands. Axes whose
 * `top` (or `left`) differ by no more than this are treated as the same band.
 */
const PANE_BAND_TOLERANCE_PX = 4;

/**
 * Detects a pane grid within a single chart from the rendered axis geometry.
 *
 * Highcharts expresses panes as multiple `yAxis` entries stacked via
 * `top`/`height` (rows) and/or multiple `xAxis` entries split via
 * `left`/`width` (columns); each series is pinned to one axis pair. There is
 * no per-pane DOM group, so pane membership is derived purely from the
 * series → axis assignment.
 *
 * Returns series grouped as `grid[row][col]` in visual reading order
 * (top-left first), with empty cells/rows already compacted away, or `null`
 * when the chart is single-pane or the layout is ambiguous (missing axis
 * geometry, overlapping bands, or coinciding dual-axis overlays) — callers
 * must then fall back to the single-subplot path.
 */
function detectPaneGrid(seriesList: HighchartsSeries[]): HighchartsSeries[][][] | null {
  if (seriesList.length < 2) {
    return null;
  }
  if (seriesList.some(series => !series.xAxis || !series.yAxis)) {
    return null;
  }

  const yAxes = [...new Set(seriesList.map(series => series.yAxis))];
  const xAxes = [...new Set(seriesList.map(series => series.xAxis))];
  if (yAxes.length <= 1 && xAxes.length <= 1) {
    return null;
  }

  const rowByAxis = yAxes.length > 1
    ? assignAxisBands(yAxes, axis => axis.top, axis => axis.height)
    : new Map<HighchartsAxis, number>(yAxes.map(axis => [axis, 0]));
  const colByAxis = xAxes.length > 1
    ? assignAxisBands(xAxes, axis => axis.left, axis => axis.width)
    : new Map<HighchartsAxis, number>(xAxes.map(axis => [axis, 0]));
  if (!rowByAxis || !colByAxis) {
    return null;
  }

  const rowCount = Math.max(...rowByAxis.values()) + 1;
  const colCount = Math.max(...colByAxis.values()) + 1;

  // Group series by (row, col) cell, preserving series order within a cell.
  const cells: (HighchartsSeries[] | undefined)[][] = Array.from(
    { length: rowCount },
    () => Array.from({ length: colCount }, () => undefined),
  );
  let cellCount = 0;
  for (const series of seriesList) {
    const row = rowByAxis.get(series.yAxis) ?? 0;
    const col = colByAxis.get(series.xAxis) ?? 0;
    if (!cells[row][col]) {
      cells[row][col] = [];
      cellCount++;
    }
    cells[row][col]?.push(series);
  }

  // A single occupied cell means every series shares one geometry band
  // (e.g. a dual-axis overlay) — that is not a multi-pane chart.
  if (cellCount <= 1) {
    return null;
  }

  // Compact ragged rows: drop unoccupied cells and rows entirely.
  const grid: HighchartsSeries[][][] = [];
  for (const row of cells) {
    const compacted = row.filter((cell): cell is HighchartsSeries[] => cell !== undefined);
    if (compacted.length > 0) {
      grid.push(compacted);
    }
  }
  return grid;
}

/**
 * Clusters axes into position bands along one dimension and assigns each
 * axis its band index (0 = topmost/leftmost).
 *
 * Returns `null` when any axis lacks rendered geometry or when two distinct
 * bands overlap beyond the tolerance — pane membership would be ambiguous
 * and the caller must fall back to single-subplot output.
 */
function assignAxisBands(
  axes: HighchartsAxis[],
  getStart: (axis: HighchartsAxis) => number | undefined,
  getLength: (axis: HighchartsAxis) => number | undefined,
): Map<HighchartsAxis, number> | null {
  const measured: { axis: HighchartsAxis; start: number; end: number }[] = [];
  for (const axis of axes) {
    const start = getStart(axis);
    const length = getLength(axis);
    if (typeof start !== 'number' || !Number.isFinite(start)
      || typeof length !== 'number' || !Number.isFinite(length)) {
      return null;
    }
    measured.push({ axis, start, end: start + length });
  }
  measured.sort((a, b) => a.start - b.start);

  const bands: { start: number; end: number }[] = [];
  const bandByAxis = new Map<HighchartsAxis, number>();
  for (const { axis, start, end } of measured) {
    const current = bands[bands.length - 1];
    if (current && start - current.start <= PANE_BAND_TOLERANCE_PX) {
      current.end = Math.max(current.end, end);
    } else {
      bands.push({ start, end });
    }
    bandByAxis.set(axis, bands.length - 1);
  }

  // Distinct bands that overlap (beyond tolerance) make membership ambiguous.
  for (let i = 1; i < bands.length; i++) {
    if (bands[i - 1].end > bands[i].start + PANE_BAND_TOLERANCE_PX) {
      return null;
    }
  }

  return bandByAxis;
}

/**
 * MAIDR has no subplot-title field: the FIRST layer's `title` is the panel's
 * display name in subplot summaries. Panes have no native titles either, so
 * when the first layer ended up untitled (unnamed series), fall back to the
 * pane's own y-axis title.
 */
function applyPaneTitleFallback(subplot: MaidrSubplot, group: HighchartsSeries[]): void {
  const firstLayer = subplot.layers[0];
  if (!firstLayer || firstLayer.title !== undefined) {
    return;
  }
  const axisTitle = group[0]?.yAxis?.options?.title?.text;
  if (axisTitle) {
    firstLayer.title = axisTitle;
  }
}

// ---------------------------------------------------------------------------
// Bar / Column group handler (stacked, dodged, normalized)
// ---------------------------------------------------------------------------

function convertBarGroup(
  barSeries: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer[] {
  if (barSeries.length === 0)
    return [];

  const first = barSeries[0];
  const stacking = resolveGroupStacking(barSeries, chart);

  // `inverted` is not a modifier on the series type, so the two combine with
  // `or` rather than flipping each other: Highcharts' `type: 'bar'` *is*
  // `column` with `inverted` set, and setting both does not turn the chart
  // back upright. Measured on Highcharts 12, `bar`, `column + inverted` and
  // `bar + inverted` render to identical coordinates; only the last was read
  // as vertical, and the payload followed it into the transposed chart —
  // category and magnitude in each other's fields, and the axis labels with
  // them (#997).
  const seriesType = resolveSeriesType(first, chart);
  const orientation
    = seriesType === 'bar' || chart.options.chart?.inverted === true
      ? Orientation.HORIZONTAL
      : Orientation.VERTICAL;

  // Single series: always a plain bar chart.
  if (barSeries.length === 1) {
    return [convertSingleBar(first, containerId, orientation)];
  }

  // Multiple series with stacking.
  if (stacking === 'normal') {
    // Two stacked series that never share a side of the baseline are drawn
    // back to back rather than on top of one another — a population pyramid,
    // or a Likert scale split around a neutral midpoint.
    return [isDivergingPair(barSeries)
      ? convertDivergingBar(barSeries, containerId, orientation)
      : convertStackedBar(barSeries, containerId, orientation, TraceType.STACKED)];
  }
  if (stacking === 'percent') {
    return [convertStackedBar(barSeries, containerId, orientation, TraceType.NORMALIZED)];
  }

  // Multiple series without stacking → dodged (grouped).
  return [convertDodgedBar(barSeries, containerId, orientation)];
}

function convertSingleBar(
  series: HighchartsSeries,
  containerId: string,
  orientation: Orientation,
): MaidrLayer {
  // Highcharts always stores the bar value in `p.y` (even for horizontal 'bar'
  // charts, where `p.x` is the category). AbstractBarPlot reads the value from
  // `point.x` when HORIZONTAL, so emit the value in `x` and category in `y`,
  // and swap the axis labels so `axes.x` names the value axis.
  const isHorizontal = orientation === Orientation.HORIZONTAL;
  // Highcharts draws no element for a null point, so dropping them here is
  // also what keeps `data[i]` and the i-th drawn bar the same bar.
  const data: BarPoint[] = series.data
    .filter(p => p.y !== null)
    .map(p => (isHorizontal
      ? { x: p.y as number, y: pointLabel(p) }
      : { x: pointLabel(p), y: p.y as number }));

  // A reversed category axis draws the first category at the right-hand end,
  // so the reading runs backwards over a chart that is otherwise correct. The
  // DOM does not move with the axis, so naming the bars one by one is what
  // stops the reversed data from outlining somebody else's bar (#995).
  const reversed = isReversedCategoryAxis(series, orientation) && data.length > 0;
  const selectors: MaidrLayer['selectors'] = reversed
    ? data
        .map((_, drawnIndex) =>
          barPointSelector(containerId, series.index, drawnIndex))
        .reverse()
    : barSelector(containerId, series.index);

  return {
    id: String(series.index),
    type: TraceType.BAR,
    title: series.name || undefined,
    orientation,
    selectors,
    axes: barAxes(series, isHorizontal),
    data: reversed ? [...data].reverse() : data,
  };
}

/**
 * Resolves the `{ x, y }` axis labels for a bar layer. For horizontal bars the
 * Highcharts value axis is `yAxis` and the category axis is `xAxis`, so they are
 * swapped to keep `axes.x` on the value axis (matching AbstractBarPlot).
 */
function barAxes(
  series: HighchartsSeries,
  isHorizontal: boolean,
): { x: AxisConfig; y: AxisConfig } {
  return isHorizontal
    ? { x: getAxisLabel(series, 'y'), y: getAxisLabel(series, 'x') }
    : { x: getAxisLabel(series, 'x'), y: getAxisLabel(series, 'y') };
}

/**
 * Which row of a segmented group a point belongs to, by its `x`.
 *
 * A category axis indexes its points 0..n-1, so `x` doubles as the row index.
 * A numeric axis carries raw values (years, say), which are mapped to dense
 * indices instead — indexing rows by `Math.round(1990)` would fabricate some
 * two thousand zero cells.
 *
 * Shared so that the rows and the DOM positions {@link drawnCellIndices}
 * computes for them cannot drift apart: a cell addressed under one rule and
 * filled under another would highlight a bar belonging to a different
 * category.
 *
 * @param seriesList - The series of one bar group
 * @returns A function from a point's `x` to its category index, or -1
 */
function categoryIndexer(seriesList: HighchartsSeries[]): (x: number) => number {
  if (declaredCategories(seriesList[0]?.xAxis).length > 0) {
    return (x: number) => Math.round(x);
  }

  const xToIndex = new Map<number, number>();
  const uniqueXs = [...new Set(
    seriesList.flatMap(series => series.data.map(p => Math.round(p.x))),
  )].sort((a, b) => a - b);
  uniqueXs.forEach((x, i) => xToIndex.set(x, i));
  return (x: number) => xToIndex.get(Math.round(x)) ?? -1;
}

/**
 * Builds aligned `SegmentedPoint[][]` rows for stacked/dodged/normalized bar
 * groups. Each row (one per series/group) is padded to a fixed length keyed by
 * category index so all rows share equal length — `SegmentedTrace` sums across
 * rows and would produce `NaN` on ragged input. `null`/missing cells become `0`
 * (never dropped), which keeps DOM alignment via the model's `skipZeros` path
 * since Highcharts renders no `.highcharts-point` graphic for null points.
 */
function buildSegmentedRows(
  seriesList: HighchartsSeries[],
  orientation: Orientation,
  traceType: TraceType,
): SegmentedPoint[][] {
  const isHorizontal = orientation === Orientation.HORIZONTAL;
  const isNormalized = traceType === TraceType.NORMALIZED;

  // Build the shared category-label list (index → label), preferring the axis
  // categories, then per-point category/name, then the x value itself.
  const axisCategories = declaredCategories(seriesList[0]?.xAxis);
  const indexForX = categoryIndexer(seriesList);

  const categoryLabels: (string | number)[] = [];
  for (const series of seriesList) {
    for (const p of series.data) {
      const index = indexForX(p.x);
      if (index < 0)
        continue;
      if (categoryLabels[index] === undefined) {
        categoryLabels[index]
          = axisCategoryAt(seriesList[0]?.xAxis, index)
            ?? p.category ?? p.name ?? Math.round(p.x);
      }
    }
  }
  const categoryCount = Math.max(axisCategories.length, categoryLabels.length);
  for (let j = 0; j < categoryCount; j++) {
    if (categoryLabels[j] === undefined) {
      categoryLabels[j] = axisCategoryAt(seriesList[0]?.xAxis, j) ?? j;
    }
  }

  return seriesList.map((series) => {
    // Initialize a full-length row of zero-valued cells keyed by category index.
    const row: SegmentedPoint[] = Array.from({ length: categoryCount }, (_, j) =>
      (isHorizontal
        ? { x: 0, y: categoryLabels[j], z: series.name }
        : { x: categoryLabels[j], y: 0, z: series.name }));

    // Overlay each rendered point at its category index.
    for (const p of series.data) {
      const index = indexForX(p.x);
      if (index < 0 || index >= categoryCount)
        continue;
      const value = isNormalized ? (p.percentage ?? p.y ?? 0) : (p.y ?? 0);
      row[index] = isHorizontal
        ? { x: value, y: categoryLabels[index], z: series.name }
        : { x: categoryLabels[index], y: value, z: series.name };
    }

    return row;
  });
}

/**
 * Whether the category axis of an upright bar group runs the other way.
 *
 * Scoped to a vertical layer on purpose. Every chart Highcharts draws sideways
 * has `xAxis.reversed` set — by the author on a reversed column chart, and by
 * Highcharts itself on an inverted one — so the flag alone cannot tell the two
 * apart. What separates them is the resolved orientation, which since #997
 * answers `horz` for all four of the sideways combinations. Which end of a
 * horizontal* bar's category axis `data[0]` should sit at is a convention
 * `MaidrLayer.orientation` does not fix, and is deliberately left alone.
 *
 * @param series - Any series of the group, read for its category axis
 * @param orientation - The orientation the group resolved to
 * @returns True when the drawn order is the reverse of the data's
 */
function isReversedCategoryAxis(
  series: HighchartsSeries | undefined,
  orientation: Orientation,
): boolean {
  return orientation === Orientation.VERTICAL && isReversedAxis(series?.xAxis);
}

/**
 * The DOM position of every cell of a segmented group, or -1 for a cell the
 * chart never drew.
 *
 * Highcharts draws no `.highcharts-point` for a `null` point — but it does
 * draw one for a genuine `0` — so a series' elements run one per *non-null*
 * point while {@link buildSegmentedRows} pads its row out to one cell per
 * category, turning both a gap and a real zero into `0`. Counting the drawn
 * points is what bridges the two, and it is the only thing that can: by the
 * time the rows exist, a bar measured at zero and a bar that was never there
 * look alike (#1002).
 *
 * @param seriesList - The series of one bar group
 * @param categoryCount - The number of cells each row was padded to
 * @returns One DOM position per cell, -1 where nothing was drawn
 */
function drawnCellIndices(
  seriesList: HighchartsSeries[],
  categoryCount: number,
): number[][] {
  const indexForX = categoryIndexer(seriesList);
  const rows = new Array<number[]>();

  for (const series of seriesList) {
    const row = Array.from({ length: categoryCount }, () => -1);
    let drawn = 0;
    for (const point of series.data) {
      if (point.y === null || point.y === undefined) {
        continue;
      }
      const index = indexForX(point.x);
      if (index >= 0 && index < categoryCount) {
        row[index] = drawn;
      }
      // Counted even when the point falls outside the group's categories: it
      // still took a place in the DOM, and every later position shifts by it.
      drawn += 1;
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Names the element of every cell of a segmented group, in the order the
 * chart draws its categories.
 *
 * Two things are settled here, and they are settled together because neither
 * can be got right on its own.
 *
 * **The order.** The rows already carry each value under its own category —
 * that is what makes Highcharts immune to the data-order bug plotly (#987)
 * and Vega-Lite (#994) have — but the categories are the axis', and a
 * reversed axis draws `categories[0]` at the right-hand end, so the reading
 * runs backwards over a chart that is otherwise correct. Reversing the rows
 * alone would make it worse: the DOM does *not* move with the axis, so a
 * reversed row paired against document order announces one category and
 * outlines another (#988). Both halves move together.
 *
 * **The pairing.** Naming each cell outright is also what stops a bar
 * measured at zero from being mistaken for one that was never drawn.
 * `SegmentedTrace` infers which cells the chart omitted from the values,
 * counting a zero as possibly-omitted; Highcharts omits only `null`, and
 * draws a zero-height bar for a real `0`. Every cell after such a zero was
 * paired one bar early (#1002). A grid says outright which element each cell
 * has, and `null` says a cell has none, so nothing is left to infer — which
 * also takes the layer out of reach of the branch asymmetry in #1003.
 *
 * @param seriesList - The series of one bar group
 * @param containerId - The id of the element the chart is rendered into
 * @param orientation - The orientation the group resolved to
 * @param data - The rows {@link buildSegmentedRows} produced
 * @returns The rows and the per-cell selectors to emit
 */
function nameSegmentedCells(
  seriesList: HighchartsSeries[],
  containerId: string,
  orientation: Orientation,
  data: SegmentedPoint[][],
): { data: SegmentedPoint[][]; selectors: MaidrLayer['selectors'] } {
  const categoryCount = data[0]?.length ?? 0;
  if (categoryCount === 0) {
    return {
      data,
      selectors: seriesList
        .map(series => barSelector(containerId, series.index))
        .join(', '),
    };
  }

  const reversed = isReversedCategoryAxis(seriesList[0], orientation);
  const order = Array.from(
    { length: categoryCount },
    (_, position) => (reversed ? categoryCount - 1 - position : position),
  );

  const drawn = drawnCellIndices(seriesList, categoryCount);

  return {
    data: reversed
      ? data.map(row => order.map(category => row[category]))
      : data,
    selectors: drawn.map((row, series) => order.map((category) => {
      const drawnIndex = row[category];
      return drawnIndex < 0
        ? null
        : barPointSelector(containerId, seriesList[series].index, drawnIndex);
    })),
  };
}

/**
 * Converts multiple bar/column series with `stacking: 'normal'` or `'percent'`
 * into a MAIDR segmented (stacked/normalized) layer.
 *
 * MAIDR expects `SegmentedPoint[][]` where each inner array is one group
 * (one fill/category level) and points within share x-axis categories.
 */
function convertStackedBar(
  seriesList: HighchartsSeries[],
  containerId: string,
  orientation: Orientation,
  traceType: TraceType.STACKED | TraceType.NORMALIZED,
): MaidrLayer {
  // Each series is one "group" (fill level). Points within share x-categories.
  const rows = buildSegmentedRows(seriesList, orientation, traceType);
  const { data, selectors }
    = nameSegmentedCells(seriesList, containerId, orientation, rows);

  const first = seriesList[0];

  return {
    id: String(first.index),
    type: traceType,
    title: first.name || undefined,
    orientation,
    selectors,
    axes: barAxes(first, orientation === Orientation.HORIZONTAL),
    data,
  };
}

/**
 * Converts multiple bar/column series without stacking into a MAIDR dodged layer.
 *
 * Dodged bars share x-categories but are placed side by side. MAIDR expects
 * `SegmentedPoint[][]` (same as stacked, but with `TraceType.DODGED`).
 */
function convertDodgedBar(
  seriesList: HighchartsSeries[],
  containerId: string,
  orientation: Orientation,
): MaidrLayer {
  const rows = buildSegmentedRows(seriesList, orientation, TraceType.DODGED);
  const { data, selectors }
    = nameSegmentedCells(seriesList, containerId, orientation, rows);

  const first = seriesList[0];

  return {
    id: String(first.index),
    type: TraceType.DODGED,
    title: first.name || undefined,
    orientation,
    selectors,
    axes: barAxes(first, orientation === Orientation.HORIZONTAL),
    data,
  };
}

/**
 * Which side of the baseline a series is drawn on, or `mixed` when it crosses.
 *
 * Zeros and gaps count for neither side: a category a series does not reach is
 * not evidence about which way it grows, and a pyramid whose top age band is
 * empty on one side is still a pyramid.
 *
 * @param series - The series to inspect
 * @returns The side it stays on, or `mixed`
 */
function baselineSideOf(series: HighchartsSeries): 'positive' | 'negative' | 'mixed' {
  let positive = false;
  let negative = false;
  for (const point of series.data) {
    if (typeof point.y !== 'number' || point.y === 0) {
      continue;
    }
    if (point.y > 0) {
      positive = true;
    } else {
      negative = true;
    }
  }
  if (positive && !negative) {
    return 'positive';
  }
  if (negative && !positive) {
    return 'negative';
  }
  return 'mixed';
}

/**
 * Whether a stacked bar group is really two sides of a shared baseline.
 *
 * Highcharts has no diverging series type — a population pyramid is two
 * stacked `bar` series with one side's values negated — so the chart has to be
 * recognised from the data. Two series, one entirely at or below zero and the
 * other entirely at or above it, is the shape, and it is a narrow one: a
 * genuine stack puts its segments on the same side of the baseline so they
 * accumulate, which is exactly what this rules out.
 *
 * The reading it selects is also the safer one where the two overlap. A
 * segmented layer pitches a signed value directly, so a two-million cohort
 * drawn to the left would sound smaller than a ten-thousand cohort drawn to
 * the right; a diverging layer pitches the magnitude and names the side.
 *
 * @param barSeries - The stacked group
 * @returns True when the group is two-sided
 */
function isDivergingPair(barSeries: HighchartsSeries[]): boolean {
  if (barSeries.length !== 2) {
    return false;
  }
  const [first, second] = barSeries.map(baselineSideOf);
  return (first === 'positive' && second === 'negative')
    || (first === 'negative' && second === 'positive');
}

/**
 * Converts two back-to-back bar/column series into a MAIDR diverging layer.
 *
 * The payload is the segmented bar's — `DivergingTrace` extends
 * `SegmentedTrace`, and the category navigation is the same — with the one
 * difference that decides whether it reads correctly: the values keep their
 * SIGN. The sign is what tells the trace which side a bar points to, and it is
 * also what it deliberately does not announce, pitching the magnitude instead.
 */
function convertDivergingBar(
  seriesList: HighchartsSeries[],
  containerId: string,
  orientation: Orientation,
): MaidrLayer {
  const rows = buildSegmentedRows(seriesList, orientation, TraceType.DIVERGING);
  const { data, selectors }
    = nameSegmentedCells(seriesList, containerId, orientation, rows);

  const first = seriesList[0];

  return {
    id: String(first.index),
    type: TraceType.DIVERGING,
    title: first.name || undefined,
    orientation,
    selectors,
    // Inert while `nameSegmentedCells` names every cell: `mapToSvgElements`
    // routes a grid before it ever looks at a mark's tag, so nothing here
    // reaches the branch this answers. It stays because it is the right answer
    // if that changes -- Highcharts lays one series group out after another,
    // which `SegmentedTrace` assumes only for `<path>` marks. On the `<rect>`
    // marks Highcharts drew through v10, an undeclared order means the
    // opposite, and each side's announcements would land on alternating bars
    // (#1003). `test/adapters/highcharts/segmentedMarkTag.test.ts` measures
    // both branches, with and without this line.
    domMapping: { order: 'row' },
    axes: barAxes(first, orientation === Orientation.HORIZONTAL),
    data,
  };
}

// ---------------------------------------------------------------------------
// The co-located `maidr` declaration
// ---------------------------------------------------------------------------

/** How this adapter names itself in the warnings a declaration raises. */
const ADAPTER = 'Highcharts';

/**
 * Declarations already read off a series during the conversion in progress,
 * so one binding warns once.
 *
 * `validateDeclaration` holds no state of its own, and a series is read more
 * than once per conversion: {@link buildSubplotGrid} converts a pane grid and
 * then falls back to the single-subplot path when too few panes survive, so
 * an author with a typo would hear about it twice.
 *
 * The map lives no longer than that. `Series#update` rewrites a series'
 * options in place rather than replacing the series, so an author who
 * corrects a `custom.maidr` block that way keeps the same object identity: a
 * cache that outlived the conversion would answer the next one with the
 * superseded declaration, and silently — the correction would never be
 * re-validated. {@link buildSubplotGrid} replaces it on entry, which is the
 * exact scope the double read happens in and the only path into
 * {@link buildSubplot}.
 */
let declarationCache = new WeakMap<HighchartsSeries, MaidrTraceDeclaration | null>();

/**
 * Starts a fresh conversion's worth of declaration readings.
 *
 * @internal
 */
function resetDeclarationCache(): void {
  declarationCache = new WeakMap<HighchartsSeries, MaidrTraceDeclaration | null>();
}

/**
 * How a series is named in a warning.
 *
 * The `id` first, because that is what a declaration's own companion fields
 * name a series by; failing that the index and the legend name, which is what
 * an author looking at the chart has.
 *
 * @param series - The series to name
 * @returns A locating phrase, e.g. `series 2 ("Treated")`
 */
function seriesRef(series: HighchartsSeries): string {
  const id = series.options.id;
  if (typeof id === 'string' && id !== '') {
    return `series "${id}"`;
  }
  return series.name
    ? `series ${series.index} ("${series.name}")`
    : `series ${series.index}`;
}

/**
 * Who is reading a declaration, and off what.
 *
 * @param series - The series carrying the block
 * @returns The context the shared reader locates its warnings from
 */
function declarationContext(series: HighchartsSeries): DeclarationContext {
  return { adapter: ADAPTER, seriesRef: seriesRef(series) };
}

/**
 * The validated `maidr` block a series carries, or null when it carries none.
 *
 * Highcharts documents `series.custom` as "a reserved subspace to store
 * options and values for customized functionality", which is why the block
 * rides there rather than on a key of MAIDR's own invention: a bare `maidr`
 * option would be competing for a name Highcharts may one day want.
 *
 * @param series - The series to read
 * @returns The declaration, or null
 */
function declarationOf(series: HighchartsSeries): MaidrTraceDeclaration | null {
  const cached = declarationCache.get(series);
  if (cached !== undefined) {
    return cached;
  }
  const declaration = readDeclarationSlot(
    series.options.custom,
    declarationContext(series),
  );
  declarationCache.set(series, declaration);
  return declaration;
}

/**
 * Reads one declared fact off every point of a series.
 *
 * The row is `point.options` — the object the author wrote, which Highcharts
 * keeps whole alongside the properties it resolves out of it. A field name the
 * author gave that no row carries is reported once for the series rather than
 * per point: {@link resolveFieldRef} answers per row and cannot tell a typo
 * from a row that legitimately lacks the field.
 *
 * @param series - The series whose rows are read
 * @param ref - The field the author named, or undefined to default
 * @param canonical - The grammar field being filled, e.g. `'yMin'`
 * @returns One reading per point, aligned with `series.data`
 */
function readSeriesField(
  series: HighchartsSeries,
  ref: FieldRef | undefined,
  canonical: string,
): unknown[] {
  const values = series.data.map(point =>
    resolveFieldRef<unknown>(point.options, ref, canonical));
  if (ref !== undefined && values.length > 0 && values.every(value => value === undefined)) {
    warnUnresolvedRef(declarationContext(series), ref, canonical);
  }
  return values;
}

/**
 * A value, when it is a number MAIDR can announce.
 *
 * @param value - Whatever was resolved
 * @returns The number, or undefined
 */
function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Reports a declaration the series it sits on cannot back.
 *
 * The reading falls through to the undeclared chart rather than being forced:
 * a survival curve read off a pie is not a degraded announcement, it is a
 * wrong one.
 *
 * @param series - The declaring series
 * @param type - The declared type
 * @param chart - The chart, for resolving what the series actually is
 * @param needs - What the type needs, phrased to follow "needs"
 */
function warnWrongConstruct(
  series: HighchartsSeries,
  type: string,
  chart: HighchartsChart,
  needs: string,
): void {
  console.warn(
    `[MAIDR ${ADAPTER}] maidr declaration for "${type}" on ${seriesRef(series)} needs `
    + `${needs}, and this is a "${resolveSeriesType(series, chart)}" series; `
    + `reading it as the undeclared chart.`,
  );
}

/**
 * The series drawing one half of a declared layer.
 *
 * Two ways in, and Highcharts' own is preferred: a series whose `linkedTo`
 * resolves to the declaring one is absorbed with its role taken from its own
 * type, which is the pairing the chart already states and the adapter already
 * follows for error bars. The parent's role field — `censoredSeries`,
 * `bandSeries`, `intervalSeries` — is for charts that do not link, and names
 * the companion by its `id` rather than by position, since an index into a
 * series list goes stale the moment a series is filtered or reordered.
 *
 * An absorbed companion is added to `consumed`, which is what stops it
 * becoming a second layer announcing half a chart.
 *
 * @param parent - The declaring series
 * @param ref - The `id` the role field names, when it names one
 * @param drawnAs - The series type the linked form infers this role from, or
 * undefined for a role that must be named outright
 * @param seriesList - The panel's series
 * @param chart - The chart, for resolving types and links
 * @param consumed - The series the declared layers already announce
 * @param type - The declared type, for the warning
 * @returns The companion, or undefined
 */
function companionSeries(
  parent: HighchartsSeries,
  ref: SeriesRef | undefined,
  drawnAs: string | undefined,
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  consumed: Set<HighchartsSeries>,
  type: string,
): HighchartsSeries | undefined {
  if (ref === undefined && drawnAs === undefined) {
    return undefined;
  }

  const found = ref === undefined
    ? seriesList.find(candidate => candidate !== parent
      && resolveSeriesType(candidate, chart) === drawnAs
      && linkedParentOf(candidate, chart) === parent)
    : seriesList.find(candidate => candidate.options.id === ref);

  if (found === undefined) {
    if (ref !== undefined) {
      console.warn(
        `[MAIDR ${ADAPTER}] maidr declaration for "${type}" on ${seriesRef(parent)} names `
        + `series "${ref}", which this chart does not have; emitting the layer without it.`,
      );
    }
    return undefined;
  }

  consumed.add(found);
  return found;
}

/** The layers a panel's declared series produce, and the series they cover. */
interface DeclaredSeries {
  /** One layer per declaration that could be read. */
  layers: MaidrLayer[];
  /** The series those layers already announce, companions included. */
  consumed: Set<HighchartsSeries>;
}

/**
 * Converts the panel's series that declare what they mean.
 *
 * Run before every other bucket, because a declaration wins over the type
 * dispatch and over the heuristics: a stepped `line` series that says it is a
 * survival curve must not be merged into the step layer it would otherwise
 * become, and a `scatter` that says it is a forest plot must not be read as a
 * cloud of two variables. What a declaration cannot do is invent a drawing —
 * a type its series cannot back is warned about and dropped back to the
 * undeclared reading.
 *
 * @param seriesList - The panel's series
 * @param chart - The chart being converted
 * @param containerId - The chart's render-target id
 * @returns The declared layers and the series they cover
 */
function convertDeclaredSeries(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
): DeclaredSeries {
  const layers: MaidrLayer[] = [];
  const consumed = new Set<HighchartsSeries>();

  for (const series of seriesList) {
    const declaration = declarationOf(series);
    if (declaration === null || consumed.has(series)) {
      continue;
    }

    let layer: MaidrLayer | null = null;
    switch (declaration.type) {
      case TraceType.SURVIVAL:
        layer = convertSurvivalSeries(
          series,
          declaration,
          seriesList,
          chart,
          containerId,
          consumed,
        );
        break;
      case TraceType.FOREST:
        layer = convertForestSeries(
          series,
          declaration,
          seriesList,
          chart,
          containerId,
          consumed,
        );
        break;
      case TraceType.CHOROPLETH:
        // A Highmaps `map` series names itself, so a choropleth is read
        // without any declaration at all and this one only renames its
        // fields — which the map converter does for itself, further down the
        // ordinary dispatch. Nothing else in Highcharts draws regions.
        if (resolveSeriesType(series, chart) !== 'map') {
          warnWrongConstruct(series, declaration.type, chart, 'a "map" series');
        }
        break;
      default:
        console.warn(
          `[MAIDR ${ADAPTER}] maidr declaration on ${seriesRef(series)} declares `
          + `"${declaration.type}", which this adapter does not read yet; `
          + `reading it as the undeclared chart.`,
        );
    }

    if (layer) {
      layers.push(layer);
    }
  }

  return { layers, consumed };
}

// ---------------------------------------------------------------------------
// Individual series converters
// ---------------------------------------------------------------------------

function convertSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
  options?: HighchartsAdapterOptions,
): MaidrLayer | null {
  const seriesType = resolveSeriesType(series, chart);

  switch (seriesType) {
    case 'scatter':
      // A scatter pinned to category ticks is a dot plot, and reads as one.
      return isCategoryScatter(series)
        ? convertDotSeries(series, containerId)
        : convertScatterSeries(series, containerId);
    // A scatter whose markers carry a third quantity in their size.
    // `ScatterPoint.z` already holds it and already drives `zIntensityFor()`,
    // so the trace side needed nothing -- this adapter simply never reached
    // it, and a bubble chart came out silent (#1138). The same gap Chart.js
    // had in #826, one step worse.
    //
    // Read as a scatter even on a category axis, where a plain scatter reads
    // as a dot plot instead. That branch exists because a scatter pinned to
    // ticks really is one value per category -- which a bubble is not: it has
    // two, and `convertDotSeries` emits `BarPoint`s, which have nowhere to
    // put the second. The category name is not lost either way; it travels as
    // `xLabel`.
    case 'bubble':
      return convertScatterSeries(series, containerId);
    case 'lollipop':
      return convertLollipopSeries(series, containerId);
    // A column chart whose widths carry a second quantity -- the one shape in
    // this family a bar layer has nowhere to put.
    case 'variwide':
      return convertVariwideSeries(series, chart, containerId);
    // A fitted normal curve, evaluated wherever the renderer chose to.
    case 'bellcurve':
      return convertBellCurveSeries(series, chart, containerId);
    // The cumulative percentage drawn over a bar chart's columns.
    case 'pareto':
      return convertParetoSeries(series, chart, containerId);
    // A row of named events along one axis, with no magnitude to them.
    case 'timeline':
      return convertTimelineSeries(series, containerId);
    case 'funnel':
    case 'pyramid':
      return convertFunnelSeries(series, containerId);
    case 'wordcloud':
      return convertWordCloudSeries(series, containerId);
    // An arc diagram is a sankey laid along one axis rather than across
    // stages, and a dependency wheel is the same weighted graph bent into a
    // circle — one converter for all three, differing only in what the chart
    // announces itself as.
    case 'sankey':
    case 'arcdiagram':
      return convertFlowSeries(series, containerId, TraceType.SANKEY);
    case 'dependencywheel':
      return convertFlowSeries(series, containerId, TraceType.CHORD);
    case 'networkgraph':
      return convertNetworkSeries(series, containerId);
    // A sunburst is a treemap's tree drawn as rings, declared with the same
    // `id`/`parent`/`value` points, so it shares the converter.
    case 'treemap':
      return convertTreeSeries(series, containerId, TraceType.TREEMAP);
    case 'sunburst':
      return convertTreeSeries(series, containerId, TraceType.SUNBURST);
    // A treegraph is the same `id`/`parent` hierarchy drawn as nodes and
    // links rather than nested rectangles, and a packed bubble is the same
    // points drawn as circles packed together. Both are hierarchies MAIDR
    // now has names for, and the naming argument is #1140's: the trace type
    // is what the reader is *told* is on the page, so a node-link diagram is
    // a `tree` and a cluster of circles is a `pack`, not a treemap.
    case 'treegraph':
      return convertTreeGraphSeries(series, containerId);
    case 'packedbubble':
      return convertTreeSeries(series, containerId, TraceType.PACK);
    // An organization chart is a hierarchy with no magnitude on it at all,
    // which the treemap trace could not express until #1153.
    case 'organization':
      return convertOrganizationSeries(series, containerId);
    case 'gauge':
    case 'solidgauge':
    case 'bullet':
      return convertGaugeSeries(series, containerId, seriesType);
    case 'waterfall':
      return convertWaterfallSeries(series, containerId);
    case 'errorbar':
      return convertErrorBarSeries(series, chart, containerId);
    // A band with two bounds and nothing between them. Same `low`/`high`
    // shape as an error bar and the same trace, minus the estimate -- which
    // is why these emitted no layer at all until `ErrorBarPoint.y` became
    // optional (#1047). `areasplinerange` is `arearange` with a smoothed
    // outline; the curve between the samples is drawing, not data.
    //
    // `columnrange` draws the same band as bars rather than as a filled
    // ribbon, and carries the same two fields, so it reads through the same
    // converter. It was silent for the same reason the other two were, and
    // stayed silent after #1047 only because nothing dispatched it (#1138).
    case 'arearange':
    case 'areasplinerange':
    case 'columnrange':
      return convertRangeSeries(series, chart, containerId);
    case 'dumbbell':
      return convertDumbbellSeries(series, containerId, options);
    // A gantt series is an xrange with dates and lanes — `GanttSeries` extends
    // `XRangeSeries` and aliases `start`/`end` onto the `x`/`x2` an xrange
    // already carries — so both read as the same schedule of intervals.
    case 'gantt':
    case 'xrange':
      return convertGanttSeries(series, containerId);
    case 'boxplot':
      return convertBoxSeries(series, chart, containerId);
    case 'heatmap':
      return convertHeatmapSeries(series, containerId);
    // The Highmaps choropleth. It is the one deferred trace type that needs no
    // declaration at all: `map` is a series type of its own.
    case 'map':
      return convertChoroplethSeries(series, chart, containerId);
    // A map bubble is a named place with a magnitude and a position, which is
    // `ChoroplethPoint` exactly. It was declined until now on the grounds
    // that announcing its bubbles as shaded regions "would report a magnitude
    // the chart draws nowhere" -- which is backwards twice over. The
    // magnitude *is* drawn, as the bubble's area, and it is the same `z` the
    // cartesian `bubble` case two branches up reads for that very reason
    // (#1138). And the Chart.js adapter already reads `chartjs-chart-geo`'s
    // `bubbleMap` as a choropleth, so the two adapters disagreed about one
    // chart. `CHOROPLETH` is a *spatial walk over named places*, which is
    // what both are.
    case 'mapbubble':
      return convertChoroplethSeries(series, chart, containerId, true);
    // A map point is that chart with the magnitude taken away, which is why
    // it reads as a scatter of degrees instead; see `convertMapPointSeries`.
    case 'mappoint':
      return convertMapPointSeries(series, containerId);
    // A tilemap is a heatmap with a configurable tile shape, and the shape
    // decides which it reads as: `square` tiles are the aligned grid a heatmap
    // already is, while every other shape staggers alternate columns by half a
    // row so the tiles tessellate — a lattice, which is what a hexbin is.
    case 'tilemap':
      return series.options.tileShape === 'square'
        ? convertHeatmapSeries(series, containerId)
        : convertHexbinSeries(series, containerId);
    case 'histogram':
      return convertHistogramSeries(series, chart, containerId);
    // `hlc` is the third of Highcharts' price series and reads through the
    // same converter as its two siblings: it draws the same high, low and
    // close, and only the opening price -- and so the body, the trend and
    // the patterns that are statements about a body -- is missing (#1188).
    case 'candlestick':
    case 'ohlc':
    case 'hlc':
      return convertCandlestickSeries(series, chart, containerId);
    // An `item` chart is a pie drawn as discrete symbols -- a parliament
    // diagram is the canonical one, each seat a dot. Highcharts registers it
    // as its own series type and documents it as inheriting from `pie`, and
    // its points carry the same `name` and `y` a pie's do, so it reads
    // through the same converter. Without this it fell to the `default:`
    // below and the chart came out with no layers at all (#1138) -- the same
    // gap `columnpyramid` and `pictorial` had against `column`, and the same
    // answer: the drawing differs, the data does not.
    case 'item':
    case 'pie':
      return convertPieSeries(series, containerId);
    // Reached deliberately by four series types, each for its own reason
    // (xability/maidr#1186), and recorded here so the decline is a decision
    // rather than an omission:
    //
    // - `vector` and `windbarb` carry a **length and a direction** at each
    //   position. MAIDR has no directional quantity, so a reading would drop
    //   `direction` and announce half the datum with full confidence.
    // - `polygon` carries vertices and nothing else. Its canonical use is a
    //   hull drawn over a scatter that is already read, so the shape is
    //   drawing rather than data.
    // - `mapline` is geometry for the same reason.
    // - `venn` and `euler` carry a declared size per set combination but no
    //   set-membership navigation to ask what a Venn diagram is drawn to
    //   ask. Left to a maintainer; the Chart.js side is declined too.
    default:
      console.warn(`[MAIDR Highcharts] Unsupported series type: "${seriesType}"; skipping.`);
      return null;
  }
}

/**
 * Where each Highcharts `step` value puts the riser, in {@link StepDirection}
 * terms. Highcharts names the side the horizontal segment sits on: `left`
 * holds the current value until the next x and jumps there (`hv`), `right`
 * jumps at the current x and holds the new value across (`vh`), and `center`
 * jumps midway between the two (`mid`).
 */
const STEP_DIRECTION_BY_OPTION: Partial<Record<string, StepDirection>> = {
  left: 'hv',
  center: 'mid',
  right: 'vh',
};

/**
 * The step convention a line series draws, or `undefined` when it draws an
 * ordinary interpolated line.
 */
function stepDirectionOf(series: HighchartsSeries): StepDirection | undefined {
  const step = series.options.step;
  if (step === undefined || step === false) {
    return undefined;
  }
  // Highcharts' legacy boolean is its 'left' default.
  return step === true ? 'hv' : STEP_DIRECTION_BY_OPTION[step];
}

/**
 * Converts line-family series into one merged layer.
 *
 * Step series reuse this because their points are identical — Highcharts
 * varies only how it draws between them.
 */
function convertLineSeries(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
  stepDirection?: StepDirection,
): MaidrLayer | null {
  if (seriesList.length === 0)
    return null;

  const first = seriesList[0];

  // A reversed axis draws the series from its far end while `series.data`
  // stays in the order it was written, so the written order reads the chart
  // as its own mirror image (#1007). Reversing the payload is only half of
  // it: the path's vertices still come out in the library's order, so the
  // trace is told to pair them back up.
  const reversed = drawsSeriesReversed(first, chart);
  const data: LinePoint[][] = seriesList.map((series) => {
    const points = series.data
      .filter(p => p.y !== null)
      .map(p => ({
        x: pointLabel(p),
        y: p.y as number,
        z: series.name || undefined,
      }));
    return reversed ? points.reverse() : points;
  });

  const selectors = lineSelectors(containerId, seriesList.map(s => s.index));

  // Use a combined title for multi-line layers so all series are represented.
  const layerTitle = seriesList.length === 1
    ? first.name || undefined
    : seriesList.map(s => s.name).filter(Boolean).join(', ') || undefined;

  return {
    id: seriesList.map(s => String(s.index)).join('-'),
    type: stepDirection ? TraceType.STEP : TraceType.LINE,
    title: layerTitle,
    selectors,
    axes: {
      x: getAxisLabel(first, 'x'),
      y: getAxisLabel(first, 'y'),
    },
    ...(stepDirection ? { stepDirection } : {}),
    ...(reversed ? { domMapping: { pointOrder: 'reverse' as const } } : {}),
    data,
  };
}

/**
 * Whether a line-family group is drawn from the far end of its x axis.
 *
 * Separate from {@link isReversedCategoryAxis}, which answers the same
 * question for a bar group and is scoped to a vertical layer because a bar's
 * orientation decides which field of a point holds the magnitude. A line
 * swaps nothing, so what has to be excluded here instead is the *inverted*
 * chart: Highcharts sets `xAxis.reversed` by itself when it turns a chart
 * sideways, so the flag alone would report every inverted line as reversed.
 * Which end of a sideways line's axis `data[0]` belongs at was not measured
 * (#1007) and is left alone rather than guessed at.
 *
 * @param series - Any series of the group, read for its x axis
 * @param chart - The chart, read for whether it is drawn sideways
 * @returns True when the drawn order is the reverse of the data's
 */
function drawsSeriesReversed(
  series: HighchartsSeries | undefined,
  chart: HighchartsChart,
): boolean {
  if (chart.options.chart?.inverted === true)
    return false;
  return isReversedAxis(series?.xAxis);
}

/**
 * The series types a survival curve's arms are drawn with.
 *
 * A Kaplan-Meier curve is a `line` series with `step` set — the estimate holds
 * until an event drops it — and nothing else in Highcharts draws one. The
 * `step` itself is not required here: an author who drew the curve
 * interpolated has drawn it slightly wrong, but the times and probabilities
 * announced are the same ones either way, and refusing the reading would cost
 * the median and the censoring for a cosmetic difference.
 */
const SURVIVAL_ARM_TYPES = new Set(['line', 'spline']);

/**
 * Converts a declared Kaplan-Meier curve into a survival layer.
 *
 * A survival curve is indistinguishable from any other step chart by
 * inspection, which is why this one is declared: without the declaration the
 * same series becomes a {@link TraceType.STEP} layer, correct about every
 * number and silent about the median survival and the censoring that are what
 * the figure is read for.
 *
 * The figure is drawn as up to three Highcharts series and read as one layer.
 * The curve carries the estimates; a linked `scatter` draws the censoring
 * ticks, whose times are a *separate data join* rather than a column of the
 * curve; a linked `arearange` draws the confidence band. Both are matched to
 * the curve by x and suppressed from becoming layers of their own — a band
 * read as its own area layer would announce the interval as if it were the
 * estimate.
 *
 * Sibling curves merge into further arms by default, because a survival
 * figure is one figure: treated and control are read against each other, and
 * splitting them across layers makes the comparison the chart exists for a
 * layer switch away. `SurvivalTrace` keeps an arm per row, so each stays
 * individually navigable.
 *
 * @param series - The declaring series
 * @param declaration - What the author said the series means
 * @param seriesList - The panel's series, for companions and further arms
 * @param chart - The chart being converted
 * @param containerId - The chart's render-target id
 * @param consumed - The series the declared layers already announce
 * @returns The survival layer, or null when the series cannot back it
 */
function convertSurvivalSeries(
  series: HighchartsSeries,
  declaration: SurvivalDeclaration,
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
  consumed: Set<HighchartsSeries>,
): MaidrLayer | null {
  if (!SURVIVAL_ARM_TYPES.has(resolveSeriesType(series, chart))) {
    warnWrongConstruct(series, declaration.type, chart, 'a "line" or "spline" series');
    return null;
  }

  const arms = survivalArms(series, declaration, seriesList, chart, consumed);
  const data: SurvivalPoint[][] = arms.map(arm =>
    survivalCurve(arm, declaration, seriesList, chart, consumed));

  // Highcharts states the convention on the series; the declaration is how a
  // curve drawn interpolated still says which way its steps go.
  const stepDirection = declaration.stepDirection ?? stepDirectionOf(series);
  const armNames = arms.map(arm => arm.name).filter(Boolean);

  return {
    id: arms.map(arm => String(arm.index)).join('-'),
    type: TraceType.SURVIVAL,
    title: declaration.title ?? (armNames.join(', ') || undefined),
    ...(declaration.name ? { name: declaration.name } : {}),
    selectors: lineSelectors(containerId, arms.map(arm => arm.index)),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    ...(stepDirection ? { stepDirection } : {}),
    data,
  };
}

/**
 * The curves this layer covers — the declaring one, and the arms merged into
 * it.
 *
 * A merged arm is a *following* line series that declares nothing of its own
 * and is linked to nothing: a series with its own block is its own layer, and
 * a linked one is somebody's companion. Marked consumed here rather than by
 * the caller, so an arm cannot also be picked up by the line bucket.
 *
 * @param series - The declaring series
 * @param declaration - What the author said, including whether to merge
 * @param seriesList - The panel's series
 * @param chart - The chart, for resolving types and links
 * @param consumed - The series the declared layers already announce
 * @returns The arms, declaring series first
 */
function survivalArms(
  series: HighchartsSeries,
  declaration: SurvivalDeclaration,
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  consumed: Set<HighchartsSeries>,
): HighchartsSeries[] {
  consumed.add(series);
  const arms = [series];
  if (declaration.merge === false) {
    return arms;
  }

  for (const candidate of seriesList.slice(seriesList.indexOf(series) + 1)) {
    if (consumed.has(candidate)
      || declarationOf(candidate) !== null
      || !SURVIVAL_ARM_TYPES.has(resolveSeriesType(candidate, chart))
      || linkedParentOf(candidate, chart) !== undefined) {
      continue;
    }
    consumed.add(candidate);
    arms.push(candidate);
  }
  return arms;
}

/**
 * Reads one arm's times, with whatever the chart says about each of them.
 *
 * Censoring is read from the curve's own rows first and from the companion
 * ticks second, because a row that carries the flag has said so for that time
 * exactly, while a tick series says it by drawing a mark at the same x.
 *
 * @param arm - The curve to read
 * @param declaration - The field names and companion refs the author gave
 * @param seriesList - The panel's series, for companions
 * @param chart - The chart, for resolving links
 * @param consumed - The series the declared layers already announce
 * @returns The arm's points
 */
function survivalCurve(
  arm: HighchartsSeries,
  declaration: SurvivalDeclaration,
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  consumed: Set<HighchartsSeries>,
): SurvivalPoint[] {
  const ticks = companionSeries(
    arm,
    declaration.censoredSeries,
    'scatter',
    seriesList,
    chart,
    consumed,
    declaration.type,
  );
  const band = companionSeries(
    arm,
    declaration.bandSeries,
    'arearange',
    seriesList,
    chart,
    consumed,
    declaration.type,
  );

  const tickTimes = new Set((ticks?.data ?? []).map(point => point.x));
  const bandAt = new Map<number, { low?: number; high?: number }>();
  for (const point of band?.data ?? []) {
    bandAt.set(point.x, { low: finiteNumber(point.low), high: finiteNumber(point.high) });
  }

  const censored = readSeriesField(arm, declaration.censored, 'censored');
  const lower = readSeriesField(arm, declaration.yMin, 'yMin');
  const upper = readSeriesField(arm, declaration.yMax, 'yMax');

  const curve: SurvivalPoint[] = [];
  arm.data.forEach((point, index) => {
    const y = finiteNumber(point.y);
    if (y === undefined) {
      return;
    }
    const flag = censored[index];
    const isCensored = flag === undefined ? tickTimes.has(point.x) : isFlagValue(flag);
    const yMin = finiteNumber(lower[index]) ?? bandAt.get(point.x)?.low;
    const yMax = finiteNumber(upper[index]) ?? bandAt.get(point.x)?.high;

    curve.push({
      x: pointLabel(point),
      y,
      ...(arm.name ? { z: arm.name } : {}),
      ...(isCensored ? { censored: true } : {}),
      ...(yMin === undefined ? {} : { yMin }),
      ...(yMax === undefined ? {} : { yMax }),
    });
  });
  return curve;
}

/**
 * Whether an axis runs the other way.
 *
 * Highcharts resolves `options.reversed` onto the axis itself (and sets it by
 * itself on an inverted chart's x axis), so the resolved flag is read first
 * and the declared option serves the partially built chart objects the
 * adapter is sometimes handed.
 *
 * @param axis - The axis to inspect
 * @returns True when the axis is reversed
 */
function isReversedAxis(axis: HighchartsAxis | undefined): boolean {
  return axis?.reversed === true || axis?.options?.reversed === true;
}

/**
 * Whether a chart's line series carry **ranks** rather than values — a bump
 * chart.
 *
 * Highcharts has no bump series. A bump chart is its own line-chart demo
 * pattern: one line per competitor over a `yAxis.reversed` axis, so that rank
 * 1 is drawn at the top. That leaves the adapter deciding from the data, and
 * deciding wrongly is not a degraded reading — {@link TraceType.BUMP} inverts
 * the pitch, so an ordinary line chart read as one sonifies every value
 * upside down.
 *
 * So the test is deliberately narrow, and both halves have to hold: the value
 * axis is reversed, **and** at every period the values across the series are
 * exactly 1..k with no duplicates. A chart of measurements that happens to sit
 * on a reversed axis — a depth profile, a golf scorecard — fails the second
 * half unless its numbers really are a standings table.
 *
 * `options.bump` overrides both, in either direction: a rank chart the
 * heuristic declines (ties, or ranks that skip) can declare itself, and a
 * genuine permutation that is not a standings table can opt out.
 *
 * @param seriesList - The chart's line-family series
 * @param options - The adapter options, which may decide this outright
 * @returns True when the layer should be read as ranks
 */
function readsAsBump(
  seriesList: HighchartsSeries[],
  options?: HighchartsAdapterOptions,
): boolean {
  if (options?.bump !== undefined) {
    return options.bump;
  }

  // One line is a sequence of positions, not a table of them: with nothing to
  // be ranked against, every value is trivially rank 1.
  if (seriesList.length < 2) {
    return false;
  }
  if (!seriesList.every(series => isReversedAxis(series.yAxis))) {
    return false;
  }
  return ranksPermuteEveryPeriod(seriesList);
}

/**
 * Whether the series' values are a rank permutation at every period.
 *
 * Ranks are keyed by the period's label rather than by column index, so a
 * competitor that joined late is compared against the others in the periods it
 * actually ran — the ragged table {@link BumpTrace} already reads correctly.
 * A period with fewer competitors is still a permutation, of 1..k for the k
 * that were there.
 *
 * @param seriesList - The series to inspect
 * @returns True when every period holds 1..k exactly once each, and at least
 * one period actually ranks two competitors against each other
 */
function ranksPermuteEveryPeriod(seriesList: HighchartsSeries[]): boolean {
  const ranksByPeriod = new Map<string, number[]>();
  for (const series of seriesList) {
    for (const point of series.data) {
      if (typeof point.y !== 'number') {
        continue;
      }
      const period = String(pointLabel(point));
      const ranks = ranksByPeriod.get(period);
      if (ranks) {
        ranks.push(point.y);
      } else {
        ranksByPeriod.set(period, [point.y]);
      }
    }
  }

  // A single period cannot be a bump chart: with nothing to move between,
  // there is no overtake to read, and any column of distinct ranks would
  // qualify.
  if (ranksByPeriod.size < 2) {
    return false;
  }

  for (const ranks of ranksByPeriod.values()) {
    const sorted = [...ranks].sort((a, b) => a - b);
    if (sorted.some((rank, position) => rank !== position + 1)) {
      return false;
    }
  }

  // Somewhere, two competitors have to be ranked against each other. A table
  // of one-competitor periods satisfies 1..k trivially at every column, so
  // two series drawn over disjoint x categories would pass the test above
  // without a single rank ever being contested. Reading that as a bump chart
  // is not a degraded reading -- MAIDR inverts the pitch for a bump -- so an
  // ordinary line chart admitted here sonifies upside down.
  return [...ranksByPeriod.values()].some(ranks => ranks.length >= 2);
}

/**
 * Converts line-family series carrying ranks into one bump layer.
 *
 * The payload is a multi-line layer's, because that is what the chart is:
 * `BumpTrace` extends `LineTrace` and navigates it identically. What the rank
 * adds — the inverted pitch and the places gained or lost between periods —
 * the trace derives from the ranks themselves, so the adapter has nothing
 * extra to supply.
 *
 * `step` is not carried through: a rank table is one layer whatever its lines
 * are drawn like, and splitting it by drawing convention would compare
 * competitors against different tables.
 */
function convertBumpSeries(
  seriesList: HighchartsSeries[],
  containerId: string,
): MaidrLayer | null {
  if (seriesList.length === 0)
    return null;

  const data: LinePoint[][] = seriesList.map(series =>
    series.data
      .filter(p => p.y !== null)
      .map(p => ({
        x: pointLabel(p),
        y: p.y as number,
        z: series.name || undefined,
      })),
  );

  const first = seriesList[0];
  const indices = seriesList.map(s => s.index);

  return {
    id: indices.map(String).join('-'),
    type: TraceType.BUMP,
    title: seriesList.map(s => s.name).filter(Boolean).join(', ') || undefined,
    // One path per competitor, as any line layer has.
    selectors: lineSelectors(containerId, indices),
    axes: {
      x: getAxisLabel(first, 'x'),
      y: getAxisLabel(first, 'y'),
    },
    data,
  };
}

/**
 * Converts area-family series into one layer.
 *
 * An unstacked area is a line whose region down to the baseline is filled, so
 * the payload is the line's own — one row per series, read independently of
 * one another. Stacking is what makes this a converter of its own: stacked
 * bands draw TWO magnitudes per sample (a band's own height and the running
 * total at that x), and `AreaTrace` recovers the second only when the layer
 * declares it is stacked, and only when every band shares the layer.
 *
 * Rows are emitted as each series authored them rather than padded to a common
 * length. `AreaTrace` keys its column totals by the x value, so a band that
 * starts late contributes nothing to the columns it does not cover — whereas
 * padding it with zeros would announce a sample the chart never drew.
 *
 * `step` is deliberately not carried through. A layer holds one trace type,
 * and the fill is the more consequential half of a stepped area: reading a
 * stacked one as a step layer would drop the totals entirely.
 */
/**
 * The stacking modes that pile bands on one another.
 *
 * `'normal'` is the ordinary stacked area. `'stream'` is the same stack with
 * its baseline floated so the shape is centred, which is a fact about where
 * the bands are drawn rather than about what they say -- `AreaTrace`
 * announces each band's own value and the column's total, and both hold at any
 * baseline (#1046).
 */
const STACKING_MODES = new Set<string | undefined>(['normal', 'stream']);

function convertAreaSeries(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer | null {
  if (seriesList.length === 0)
    return null;

  // A lone band has nothing to stack on, so it reads as a plain area whatever
  // the chart's stacking option says — the same call `convertBarGroup` makes
  // for a single bar series.
  const stacking = seriesList.length === 1
    ? undefined
    : resolveGroupStacking(seriesList, chart);
  const isNormalized = stacking === 'percent';
  // `'stream'` is what the streamgraph module sets, and it stacks: the bands
  // sit on one another and only the baseline they start from is moved. Not
  // normalized -- a stream is not rescaled to a constant total, so announcing
  // shares of 100% would be a different chart.
  const traceType = isNormalized
    ? TraceType.NORMALIZED_AREA
    : (STACKING_MODES.has(stacking) ? TraceType.STACKED_AREA : TraceType.AREA);

  const data: LinePoint[][] = seriesList.map(series =>
    series.data
      .filter(p => p.y !== null)
      .map(p => ({
        x: pointLabel(p),
        // A band's OWN value, never the accumulated edge — `AreaTrace` sums
        // the rows itself. On a percent stack Highcharts has already reduced
        // each point to its share, which is the magnitude the chart draws.
        y: (isNormalized ? p.percentage ?? p.y : p.y) as number,
        z: series.name || undefined,
      })),
  );

  const first = seriesList[0];

  // Use a combined title for multi-band layers so all series are represented.
  const layerTitle = seriesList.length === 1
    ? first.name || undefined
    : seriesList.map(s => s.name).filter(Boolean).join(', ') || undefined;

  return {
    id: seriesList.map(s => String(s.index)).join('-'),
    type: traceType,
    title: layerTitle,
    // An area series still renders the `path.highcharts-graph` its top edge
    // traces, alongside the `path.highcharts-area` fill; `AreaTrace` inherits
    // `LineTrace`'s path parsing, so the graph is what it needs.
    selectors: lineSelectors(containerId, seriesList.map(s => s.index)),
    axes: {
      x: getAxisLabel(first, 'x'),
      y: getAxisLabel(first, 'y'),
    },
    data,
  };
}

/**
 * Converts a polar chart's series into one radar or polar area layer.
 *
 * The payload is a multi-line layer's — a row per series, a column per spoke —
 * because that is what the chart is: `RadarTrace` extends `LineTrace` and
 * navigates it identically. What the circle adds is where each spoke sits, and
 * the trace derives that from the column count rather than from the data, so
 * the adapter has nothing extra to supply.
 *
 * The two trace types differ only in the mark. A radar joins the values into a
 * closed outline (`line`, `spline`, or an `area` whose fill is one more way of
 * drawing the same outline); a polar area draws each as a wedge whose radius
 * is the value. That difference is entirely in the selectors — an outline is
 * one path per series, a wind rose one arc per spoke — and in what the chart
 * announces itself as.
 */
function convertRadialSeries(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
  traceType: TraceType.RADAR | TraceType.POLAR_AREA,
): MaidrLayer | null {
  if (seriesList.length === 0)
    return null;

  const data: LinePoint[][] = seriesList.map(series =>
    series.data
      .filter(p => p.y !== null)
      .map(p => ({
        x: pointLabel(p),
        y: p.y as number,
        z: series.name || undefined,
      })),
  );

  const first = seriesList[0];
  const indices = seriesList.map(s => s.index);

  const layerTitle = seriesList.length === 1
    ? first.name || undefined
    : seriesList.map(s => s.name).filter(Boolean).join(', ') || undefined;

  return {
    id: indices.map(String).join('-'),
    type: traceType,
    title: layerTitle,
    selectors: traceType === TraceType.POLAR_AREA
      ? polarAreaSelectors(containerId, indices)
      : lineSelectors(containerId, indices),
    axes: {
      x: getAxisLabel(first, 'x'),
      y: getAxisLabel(first, 'y'),
    },
    data,
  };
}

/**
 * What a parallel coordinates plot's two dimensions are called.
 *
 * Neither is an axis of the chart. The columns ARE the axes — one per variable
 * — so `axes.x` names what a column is rather than naming one of them, and
 * there is no single value axis to read `axes.y` from: every column is
 * measured in its own units, which is the whole point of the chart.
 */
const PARALLEL_AXIS_AXIS = 'Axis';
const PARALLEL_VALUE_AXIS = 'Value';

/**
 * What a parallel coordinates column is called.
 *
 * Highcharts draws these names as the x axis' category labels — its own
 * documentation says so: "visually the parallel coordinates titles are done
 * through `xAxis.categories`" — so the label is already on the point, and the
 * per-axis `title.text` defaults to the empty string. An author who titled the
 * axes instead is honoured through the fallback, and a chart that named them
 * nowhere falls back to the column's position.
 *
 * @param point - The value being named
 * @param chart - The chart, for its per-variable y axes
 * @returns The column's name
 */
function parallelColumnLabel(
  point: HighchartsPoint,
  chart: HighchartsChart,
): string | number {
  const declared = axisCategoryAt(point.series?.xAxis, point.x) ?? point.category;
  if (declared !== undefined) {
    return declared;
  }
  const axisTitle = chart.yAxis?.[Math.round(point.x)]?.options?.title?.text;
  return axisTitle || pointLabel(point);
}

/**
 * Converts a parallel coordinates chart's series into one layer.
 *
 * In this mode Highcharts binds every series to the same axis pair and plots
 * each point against `chart.yAxis[i]` instead — one axis per variable, one
 * series per observation. So the payload is the multi-line one again, a row
 * per observation and a column per variable, and `ParallelTrace` (a
 * `LineTrace` too) navigates it the same way.
 *
 * Nothing is normalised here. The trace computes each column's extent itself
 * and pitches a value against its OWN axis, which is what makes the chart
 * audible: scaled against one range for the layer, a reader would hear which
 * variable uses bigger numbers rather than where an observation sits.
 */
function convertParallelSeries(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer | null {
  if (seriesList.length === 0)
    return null;

  const data: LinePoint[][] = seriesList.map(series =>
    series.data
      .filter(p => p.y !== null)
      .map(p => ({
        x: parallelColumnLabel(p, chart),
        y: p.y as number,
        z: series.name || undefined,
      })),
  );

  const first = seriesList[0];
  const indices = seriesList.map(s => s.index);

  const layerTitle = seriesList.length === 1
    ? first.name || undefined
    : seriesList.map(s => s.name).filter(Boolean).join(', ') || undefined;

  return {
    id: indices.map(String).join('-'),
    type: TraceType.PARALLEL,
    title: layerTitle,
    selectors: lineSelectors(containerId, indices),
    axes: {
      x: { label: PARALLEL_AXIS_AXIS },
      y: { label: PARALLEL_VALUE_AXIS },
    },
    data,
  };
}

/**
 * Whether a scatter series is plotted against category ticks — a Cleveland dot
 * plot rather than a scatter of two continuous variables.
 *
 * The distinction decides which trace type reads it honestly. A
 * {@link ScatterPoint} carries a strictly numeric `x`, so a category-axis
 * scatter converted as SCATTER announces the tick INDEX and drops the label
 * the chart prints beneath it; {@link TraceType.DOT} carries
 * {@link BarPoint}s, whose `x` is that label.
 */
function isCategoryScatter(series: HighchartsSeries): boolean {
  return declaredCategories(series.xAxis).length > 0;
}

/**
 * Converts a category-axis `scatter` series into a dot-plot layer.
 *
 * A dot plot is a bar chart drawn with a point where the bar would end, so the
 * payload is the {@link BarPoint}s {@link convertSingleBar} builds — the
 * category and its value — and MAIDR reads it with the same trace.
 */
function convertDotSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: BarPoint[] = series.data
    .filter(p => p.y !== null)
    .map(p => ({
      x: pointLabel(p),
      y: p.y as number,
    }));

  return {
    id: String(series.index),
    type: TraceType.DOT,
    title: series.name || undefined,
    // The marks are ordinary scatter markers, hidden tracker twins included.
    selectors: scatterSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Converts a `lollipop` series into a lollipop layer.
 *
 * A lollipop is a bar thinned to a stem with a marker at its value, so the
 * payload is again {@link convertSingleBar}'s: the stem is what the mark looks
 * like, not a second magnitude.
 */
function convertLollipopSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: BarPoint[] = series.data
    .filter(p => p.y !== null)
    .map(p => ({
      x: pointLabel(p),
      y: p.y as number,
    }));

  return {
    id: String(series.index),
    type: TraceType.LOLLIPOP,
    title: series.name || undefined,
    selectors: lollipopSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Converts a `pareto` series into a line layer.
 *
 * A Pareto chart is a bar chart with a cumulative curve drawn over it, and
 * Highcharts draws the curve as its own series -- so it reads as a second
 * layer beside the bar layer the columns already produce, which is what the
 * chart is.
 *
 * **The curve's numbers are percentages, not a running total.** That is the
 * part worth pinning, and it is measured rather than assumed. Highcharts
 * 11.4.8 in Chromium, over a base whose total is not 100 so that the two
 * candidate readings differ:
 *
 *     base column counts   80, 60, 40, 20    (total 200)
 *     pareto series.data   40, 70, 90, 100
 *     a running total would be   80, 140, 180, 200
 *
 * So nothing here may convert the values back into counts: the chart does
 * not draw counts. The axis they are bound to is the secondary one the
 * author titled -- "Cumulative %" by convention -- which `getAxisLabel`
 * reads off `series.yAxis` without needing to be told.
 *
 * The handle is the `highcharts-graph` path, which is what every
 * line-family layer takes and what `LineTrace` parses for its vertices.
 * The curve draws markers too -- measured at four, five and twenty points,
 * always one marker per step -- in a `highcharts-markers` group that is a
 * sibling of the series group rather than inside it. They are the same
 * decoration an ordinary `line` series draws and `convertLineSeries`
 * likewise does not address.
 *
 * `series.linkedParent` is null and the columns are reached through
 * `series.baseSeries`, which the adapter reads on its own terms -- so a
 * chart drawing both gets both.
 *
 * **A reversed axis is re-paired the same way a line's is** (#1007). The
 * curve is generated, but nothing about being generated exempts it: measured
 * on the base above with `xAxis.reversed`, Highcharts still computes the
 * cumulative in declared order and still lays the path's vertices down in
 * that order, so the curve runs 100 -> 40 from left to right while the bar
 * layer beneath it -- which *is* re-paired -- reads D, C, B, A. Left alone,
 * one chart's two layers announce its categories in opposite orders.
 *
 * @param series - The pareto series to convert
 * @param chart - The chart, read for whether its axis is drawn reversed
 * @param containerId - The chart container's id, for the selectors
 * @returns The line layer
 */
function convertParetoSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer {
  const reversed = drawsSeriesReversed(series, chart);
  const points = series.data
    .filter(p => p.y !== null)
    .map(p => ({
      x: pointLabel(p),
      y: p.y as number,
      z: series.name || undefined,
    }));
  const data: LinePoint[][] = [reversed ? points.reverse() : points];

  return {
    id: String(series.index),
    type: TraceType.LINE,
    title: series.name || undefined,
    selectors: lineSelectors(containerId, [series.index]),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    ...(reversed ? { domMapping: { pointOrder: 'reverse' as const } } : {}),
    data,
  };
}

/**
 * The text a timeline's event box draws, as one string.
 *
 * Highcharts draws two: `name` on the first line and `label` on the second --
 * measured as `"\u25CF First artificial satellite\u200B1957 Sputnik 1"` on a
 * box declaring both. Neither alone is the box. On the ordinary timeline the
 * x axis is hidden and `x` is a bare 0, 1, 2, 3, so `label` is the only place
 * the *date* appears at all; on a `datetime` axis `x` carries it and `label`
 * usually restates it. Joining them keeps the first case whole and costs the
 * second a repetition.
 *
 * `description` is not drawn on the chart -- it is the tooltip's text -- and
 * the grammar has one string per point, so it is not folded in here.
 *
 * @param point - The event to name
 * @returns The drawn text, or undefined for an event declaring neither
 */
function timelineEventLabel(point: HighchartsPoint): string | undefined {
  const parts = [point.name, point.label]
    .filter((part): part is string => typeof part === 'string' && part !== '');
  const unique = parts.filter((part, i) => parts.indexOf(part) === i);
  return unique.length > 0 ? unique.join(', ') : undefined;
}

/**
 * Converts a `timeline` series into a labelled scatter layer.
 *
 * A timeline is a row of events along one axis: each is drawn as a marker on
 * a connecting line, with a box naming it. What it is *not* is a chart of
 * magnitudes, and that is the whole design question here.
 *
 * **`y` is a constant.** Measured on every timeline built for this: four
 * events, three events, dated and undated alike, `point.y` came back `1`
 * each time. So the layer is emitted with the 1 the chart drew, and
 * sonifying it plays one pitch for the whole row -- which is what a chart
 * with no magnitude sounds like. Pitching by `x` instead would announce a
 * magnitude the chart does not draw, and pitching by nothing would leave the
 * layer silent. What the reader is actually given is the sequence, through
 * `ScatterTrace`'s stereo pan over distinct x values, and the identity of
 * each event, through {@link ScatterPoint.label}.
 *
 * `x` is whatever the author declared: a bare index -- 0, 1, 2, 3 -- on the
 * ordinary timeline, whose x axis is usually hidden, or the real timestamp
 * on a `datetime` axis. Nothing is invented for the first case; the dates
 * live in the event's own text, which is where the chart draws them.
 *
 * The handle is the marker, and it needed nothing new: a timeline's markers
 * carry `highcharts-point` in a `highcharts-markers` group that is a sibling
 * of the series group but carries the same `highcharts-series-N` class, so
 * {@link scatterSelector} reaches exactly them -- measured as one element per
 * point, in point order, each identical to that point's own `graphic`.
 *
 * @param series - The timeline series to convert
 * @param containerId - The chart container's id, for the selectors
 * @returns The scatter layer
 */
function convertTimelineSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: ScatterPoint[] = series.data
    .filter(p => p.y !== null)
    .map((point) => {
      const label = timelineEventLabel(point);
      return {
        x: point.x,
        y: point.y as number,
        ...(label !== undefined ? { label } : {}),
      };
    });

  return {
    id: String(series.index),
    type: TraceType.SCATTER,
    title: series.name || undefined,
    selectors: scatterSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Converts a `bellcurve` series into a smooth layer.
 *
 * A bell curve is not a series of observations. It fits a normal
 * distribution to another series and evaluates it at points the *renderer*
 * chooses, so the sample count is a drawing parameter rather than a fact
 * about the data. Measured on Highcharts 11.4.8 in Chromium, the same nine
 * observations:
 *
 *     options                  points in series.data
 *     (default)                19
 *     pointsInInterval: 5      31
 *     intervals: 5             31
 *
 * That is what `smooth` is for, and the same reading `stat_function` gets in
 * r-maidr (xability/r-maidr#202): the trace announces a fitted curve, and
 * nothing presents nineteen renderer-chosen samples as data.
 *
 * The observations are a **separate series** -- reachable as
 * `series.baseSeries`, and the adapter already reads it on its own terms, so
 * a chart drawing both gets both. `zIndex: -1` and a hidden base series are
 * drawing choices this does not follow: a hidden series is declined by
 * `buildSubplot` for every type alike.
 *
 * The curve draws one `highcharts-graph` path and no point marks (measured:
 * zero `.highcharts-point`), so the graph is the handle -- the same one every
 * line-family layer takes. `SmoothTrace` reads plain `{x, y}` points;
 * `svg_x`/`svg_y` belong to the producers that read a fit back off the page,
 * and this one has the curve's own coordinates.
 *
 * The axes are the curve's own, which is where a bell curve is conventionally
 * drawn: `getAxisLabel` reads `series.xAxis`, so a curve bound to a secondary
 * pair is named by that pair's titles rather than by the base series'.
 *
 * **A reversed axis is re-paired the same way a line's is** (#1007, #1151).
 * Nothing about the curve being *generated* exempts it: measured on a
 * fifteen-value sample with `xAxis.reversed`, the payload came back
 * 2.46 -> 4.18 while the chart drew it 4.18 -> 2.46, so a reader sweeping
 * left to right was handed the curve back to front. `SmoothTrace` extends
 * `LineTrace`, so it consumes `domMapping.pointOrder` unchanged.
 *
 * @param series - The bellcurve series to convert
 * @param chart - The chart, read for whether its axis is drawn reversed
 * @param containerId - The chart container's id, for the selectors
 * @returns The smooth layer
 */
function convertBellCurveSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer {
  const reversed = drawsSeriesReversed(series, chart);
  const points = series.data
    .filter(p => p.y !== null)
    .map(p => ({ x: p.x, y: p.y as number }));
  const data: LinePoint[][] = [reversed ? points.reverse() : points];

  return {
    id: String(series.index),
    type: TraceType.SMOOTH,
    title: series.name || undefined,
    selectors: lineSelectors(containerId, [series.index]),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    ...(reversed ? { domMapping: { pointOrder: 'reverse' as const } } : {}),
    data,
  };
}

/**
 * Converts a `variwide` series into a mosaic layer.
 *
 * A variwide is a column chart whose **widths carry a second quantity**:
 * `point.y` is how tall a column is drawn and `point.z` is how wide, so the
 * chart shows a measure against the size of the group it was measured over.
 * That is the mosaic reading exactly -- a magnitude per category plus the
 * category's share of the whole -- and it is why `bar` is the wrong home:
 * `BarPoint` has nowhere to put `z`, so half the chart would be dropped
 * silently, which is how it reached #1138 in the first place (the type is in
 * no bucket at all today, so a variwide chart emits **zero layers** and is
 * not navigable).
 *
 * The share is computed rather than read, because Highcharts computes it too.
 * Measured on Highcharts 11.4.8 in Chromium, four columns over a 726px plot:
 *
 *     point      z      z / sum(z)   drawn width
 *     Norway     5.4    0.0393       28px
 *     Germany   83.2    0.6060       440px
 *     Poland    38.0    0.2768       201px
 *     Greece    10.7    0.0779       57px
 *
 * -- so `z / sum(z)` is the fraction each column is drawn at, to the pixel,
 * and that is the number `MosaicPoint.width` is defined to hold.
 *
 * `count` is deliberately not emitted. A mosaic is usually drawn from a
 * contingency table, but a variwide's `z` is any measure at all -- population,
 * revenue, hours -- and declaring one would put "Count 83.2" in the
 * announcement for a chart of millions of people.
 *
 * One layer per series rather than one table per chart: two variwide series on
 * one chart are drawn side by side, each sizing its own columns from its own
 * `z` total (measured: series totals of 4 and 6 gave each series its own
 * widths), so folding them into shared mosaic columns would report shares of
 * a total no column was drawn against.
 *
 * @param series - The variwide series to convert
 * @param chart - The owning chart, for its `inverted` flag
 * @param containerId - The chart container's id, for the selectors
 * @returns The mosaic layer
 */
function convertVariwideSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer {
  // A variwide honours `chart.inverted` -- measured, the same four columns
  // laid across the page -- and a horizontal layer carries its category on
  // `y` and its magnitude on `x`, which `MosaicTrace` already reads either
  // way.
  const isHorizontal = chart.options.chart?.inverted === true;
  const orientation = isHorizontal ? Orientation.HORIZONTAL : Orientation.VERTICAL;

  // A point with no value draws no column at all (measured: `point.graphic`
  // is absent), so keeping it would slide every later highlight onto its
  // neighbour's column.
  const points = series.data.filter(p => p.y !== null);

  // The shares are taken over EVERY declared point, including the ones with
  // no value. Measured: dropping the middle of z = 4, 6, 10 left the two
  // survivors at 145px and 363px of a 726px plot -- exactly the widths they
  // had when all three were drawn. Highcharts keeps a valueless column's
  // slice of the axis and simply draws nothing in it, so a share taken over
  // the survivors alone would report 4/14 for a column drawn at 4/20.
  const magnitudes = series.data.map(p => p.z);
  // And a share is reported only when Highcharts sized the columns, which it
  // does only when every point carries a width. Measured: one point declared
  // without `z` collapses the whole series -- all three columns rendered at
  // 0x0, not just the one -- so shares over the rest would describe a chart
  // nobody was shown. A total of zero is the same case arrived at
  // differently: every column drew at 0x0, and 0/0 would announce each of
  // them as NaN% of the chart.
  const sized = magnitudes.every(z => typeof z === 'number' && Number.isFinite(z));
  const total = sized
    ? magnitudes.reduce<number>((sum, z) => sum + (z as number), 0)
    : 0;
  const name = series.name || 'Series 1';

  const data: MosaicPoint[][] = [points.map((point) => {
    const label = pointLabel(point);
    const value = point.y as number;
    const share = total > 0 ? { width: (point.z as number) / total } : {};
    return isHorizontal
      ? { x: value, y: label, z: name, ...share }
      : { x: label, y: value, z: name, ...share };
  })];

  return {
    id: String(series.index),
    type: TraceType.MOSAIC,
    title: series.name || undefined,
    orientation,
    selectors: barSelector(containerId, series.index),
    axes: barAxes(series, isHorizontal),
    data,
  };
}

/**
 * What a funnel's two dimensions are called. Like a pie, a funnel series is
 * bound to no axis, so {@link getAxisLabel}'s `'X'` / `'Y'` fallback would
 * name them after coordinates the chart does not have.
 */
const FUNNEL_STAGE_AXIS = 'Stage';
const FUNNEL_COUNT_AXIS = 'Count';

/**
 * Converts a `funnel` or `pyramid` series into a funnel layer.
 *
 * A pyramid is the same series drawn without a neck and flipped, so it carries
 * the same stages in the same declared order and reads the same way.
 *
 * The adapter supplies stage/count pairs and nothing else: the retention
 * between adjacent stages — the number a funnel is actually read for — is
 * arithmetic `FunnelTrace` does itself, so declared order is the whole of what
 * it needs from here. Highcharts draws the segments in `series.data` order,
 * so stage *k* is segment *k*; a valueless point is dropped rather than kept
 * as a gap, because no segment is drawn for it and keeping it would slide
 * every later stage's highlight onto its neighbour.
 */
function convertFunnelSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: BarPoint[] = series.data
    .filter(p => p.y != null)
    .map(p => ({
      x: pointLabel(p),
      y: p.y as number,
    }));

  return {
    id: String(series.index),
    type: TraceType.FUNNEL,
    title: series.name || undefined,
    selectors: funnelSelector(containerId, series.index),
    axes: {
      x: { label: FUNNEL_STAGE_AXIS },
      y: { label: FUNNEL_COUNT_AXIS },
    },
    data,
  };
}

/**
 * What a word cloud's two dimensions are called — it is bound to no axis
 * either, and `weight` is the option Highcharts names the magnitude with.
 */
const WORD_CLOUD_TERM_AXIS = 'Term';
const WORD_CLOUD_WEIGHT_AXIS = 'Weight';

/**
 * Converts a `wordcloud` series into a word cloud layer.
 *
 * Terms are emitted heaviest first, and that ordering is load-bearing rather
 * than cosmetic. `WordcloudSeries#drawPoints` sorts a copy of its points by
 * descending weight before drawing, so the glyphs land in the DOM in weight
 * order — while `WordCloudTrace` pairs the glyph at document position *i* with
 * the term authored at index *i*. Emitting the terms as the chart declared
 * them would therefore announce one word and highlight another, with the
 * audio, text and braille all still correct. Sorting here with the comparator
 * Highcharts uses (both sorts are stable, so ties agree too) makes the two
 * orders the same one.
 *
 * The weight lives in `point.weight` because the series declares
 * `pointArrayMap: ['weight']`; `y` is the fallback for a hand-built point.
 */
function convertWordCloudSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: WordCloudPoint[] = series.data
    .filter(p => (p.weight ?? p.y) !== null)
    .map(p => ({
      x: String(pointLabel(p)),
      y: (p.weight ?? p.y) as number,
    }))
    .sort((a, b) => Number(b.y) - Number(a.y));

  return {
    id: String(series.index),
    type: TraceType.WORD_CLOUD,
    title: series.name || undefined,
    selectors: wordCloudSelector(containerId, series.index),
    axes: {
      x: { label: WORD_CLOUD_TERM_AXIS },
      y: { label: WORD_CLOUD_WEIGHT_AXIS },
    },
    data,
  };
}

/**
 * What a flow diagram's two dimensions are called. A sankey, a dependency
 * wheel and an arc diagram are all bound to no axis, and `weight` is the
 * option Highcharts declares a link's magnitude with.
 */
const FLOW_NODE_AXIS = 'Node';
const FLOW_WEIGHT_AXIS = 'Weight';

/**
 * Converts a `sankey`, `dependencywheel` or `arcdiagram` series into a flow
 * layer.
 *
 * All three are the same weighted graph — `DependencyWheelSeries` and
 * `ArcDiagramSeries` both extend `SankeySeries` — declared as one point per
 * link carrying `from`, `to` and `weight`. Only the emitted trace type
 * differs, so the chart announces itself as the form the author drew; MAIDR
 * reads all of them with `FlowTrace`.
 *
 * The nodes are deliberately not read off `series.nodes`. MAIDR derives them
 * from the links by design, and a second list would be a second source of
 * truth for something the links already say.
 *
 * A link Highcharts draws no ribbon for is dropped rather than carried as a
 * gap, the same call the pie and funnel converters make: `SankeySeries#translate`
 * skips a link whose weight is zero or falsy (#12453), so keeping it would
 * slide every later ribbon's highlight onto its neighbour.
 */
function convertFlowSeries(
  series: HighchartsSeries,
  containerId: string,
  traceType: TraceType.SANKEY | TraceType.CHORD,
): MaidrLayer {
  const data: FlowPoint[] = series.data
    .filter(p => p.from != null && p.to != null && Boolean(p.weight))
    .map(p => ({
      source: p.from as string | number,
      target: p.to as string | number,
      value: p.weight as number,
    }));

  return {
    id: String(series.index),
    type: traceType,
    title: series.name || undefined,
    selectors: flowSelector(containerId, series.index),
    axes: {
      x: { label: FLOW_NODE_AXIS },
      y: { label: FLOW_WEIGHT_AXIS },
    },
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
 * Converts a `networkgraph` series into a network layer.
 *
 * A network graph declares its links exactly as a sankey does minus the
 * weight — `pointArrayMap: ['from', 'to']` — and that pair is the whole
 * payload. Where the force solver dropped each node is deliberately not
 * carried: the position is a fact about the solver's seed rather than about
 * the data, and MAIDR's `NetworkPoint` has nowhere to put it for that reason.
 *
 * A link naming a node that was never declared is still a link: Highcharts
 * creates the missing node from the reference, so only a link missing an end
 * entirely is dropped.
 */
function convertNetworkSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: NetworkPoint[] = series.data
    .filter(p => p.from != null && p.to != null)
    .map(p => ({
      source: p.from as string | number,
      target: p.to as string | number,
    }));

  return {
    id: String(series.index),
    type: TraceType.NETWORK,
    title: series.name || undefined,
    selectors: networkSelector(containerId, series.index),
    axes: {
      x: { label: NETWORK_NODE_AXIS },
      y: { label: NETWORK_LINK_AXIS },
    },
    data,
  };
}

/**
 * What a hierarchy's two dimensions are called — a treemap and a sunburst are
 * bound to no axis, so `getAxisLabel`'s `'X'` / `'Y'` fallback would name them
 * after coordinates neither chart has.
 */
const TREE_NODE_AXIS = 'Node';
const TREE_VALUE_AXIS = 'Value';

/**
 * What a treemap or sunburst node is called.
 *
 * Highcharts separates identity (`id`, referenced by a child's `parent`) from
 * display (`name`), and MAIDR's tree is addressed by the displayed name, so
 * that is what is emitted — falling back to the id, then to the point's
 * position, for a leaf declared with neither.
 */
function treeNodeLabel(point: HighchartsPoint): string | number {
  return point.name ?? point.id ?? point.index;
}

/**
 * Converts a `treegraph` series into a node-link hierarchy layer.
 *
 * A treegraph declares exactly what a treemap does -- `id`, `parent`, `name`
 * -- and draws it as boxes joined by links instead of nested rectangles. The
 * walk up the `parent` chain is therefore the treemap's, and this delegates to
 * it for everything except the one thing that differs: whether the chart has a
 * magnitude at all.
 *
 * `point.value` cannot answer that here. A treegraph's layout does not size
 * anything by value, and Highcharts fills the field in regardless: measured on
 * a five-node chart in Highcharts 13 with `modules/treegraph.js`, every node
 * came back with `value === 0` and `options.value === undefined`. Reading
 * `point.value` would emit `y: 0` on every node and announce a magnitude of
 * zero for a chart that has none -- which is #1153's defect, and the reason
 * `convertOrganizationSeries` exists rather than reusing the treemap path.
 *
 * `point.options.value` is what the author wrote, so it separates the two:
 *
 *     treegraph, no values      options.value undefined   value 0
 *     treegraph, values 1..5    options.value 1..5        value 1..5
 *
 * A treemap keeps reading `point.value` and is untouched by this. There the
 * computed field is not an artefact: an interior node with no declared value
 * comes back carrying the sum of its children (measured, 12 and 8 on a
 * leaves-only tree), which is a real total the rectangles are sized by. And a
 * treemap with no values anywhere draws nothing at all -- measured, zero
 * rendered nodes -- so the case this guards against cannot arise there.
 *
 * @param series - The treegraph series to read
 * @param containerId - The chart container's DOM id, for the selectors
 * @returns The layer
 */
function convertTreeGraphSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const layer = convertTreeSeries(series, containerId, TraceType.TREE);
  const declared = series.data.map(point => point.options?.value);
  const anyDeclared = declared.some(value => typeof value === 'number');

  const data = (layer.data as TreemapPoint[]).map((node, index) => {
    const value = declared[index];
    // An undeclared node carries no `y` at all rather than Highcharts' zero.
    // Beside declared siblings that is the treemap's own behaviour --
    // `TreemapTrace` derives the total from the children the paths give it --
    // and with nothing declared anywhere it leaves the whole layer valueless,
    // which is what the chart is.
    const { y: _computed, ...rest } = node;
    return typeof value === 'number' ? { ...rest, y: value } : rest;
  });

  return {
    ...layer,
    // No magnitude anywhere means no value axis either: naming one would
    // claim an axis the chart does not draw, the same answer an organization
    // chart already gets.
    axes: anyDeclared ? layer.axes : { x: { label: TREE_NODE_AXIS } },
    data,
  };
}

/**
 * Converts a `treemap`, `sunburst` or `packedbubble` series into a hierarchy
 * layer.
 *
 * Highcharts declares the tree with `id` / `parent` pointers on each node,
 * while MAIDR declares it as a path — a node's ancestors, root first, itself
 * excluded — so the converter walks each node's `parent` chain upward and
 * materialises it. The walk stops at a parent id that was never declared,
 * which Highcharts tolerates by attaching the node to the root, and refuses to
 * revisit a node it has already passed so a cyclic `parent` cannot loop.
 *
 * Interior nodes are emitted with whatever value they declared, or with none
 * at all: `TreemapTrace` derives an undeclared interior total from the
 * children the paths give it, and keeps a declared one that disagrees, since a
 * parent may carry mass no child accounts for.
 *
 * A `packedbubble` series declares no `parent` on anything -- the grouping is
 * which *series* a bubble is in, and the adapter already gives each series its
 * own layer named after it. So every bubble walks back to an empty path and
 * the layer is a flat pack of circles sized by value, which is what the chart
 * draws. Nothing else about the walk changes, which is why it shares this
 * converter rather than getting one of its own.
 */
function convertTreeSeries(
  series: HighchartsSeries,
  containerId: string,
  traceType: TraceType.TREEMAP | TraceType.SUNBURST | TraceType.PACK | TraceType.TREE,
): MaidrLayer {
  const byId = new Map<string, HighchartsPoint>();
  for (const point of series.data) {
    if (point.id !== undefined) {
      byId.set(point.id, point);
    }
  }

  const data: TreemapPoint[] = series.data.map(point => ({
    x: treeNodeLabel(point),
    ...(typeof point.value === 'number' ? { y: point.value } : {}),
    path: ancestorsOf(point, byId, series.name),
  }));

  // Stamp each rendered node so the per-node selectors can address it. The
  // rectangles are filed into one group per depth, ordered by z-index rather
  // than by declaration, so document order cannot be indexed into.
  stampTreeIndices(series);

  return {
    id: String(series.index),
    type: traceType,
    title: series.name || undefined,
    selectors: treemapSelectors(containerId, series.index, data.length),
    axes: {
      x: { label: TREE_NODE_AXIS },
      y: { label: TREE_VALUE_AXIS },
    },
    data,
  };
}

/**
 * Converts an `organization` series into a valueless treemap layer.
 *
 * An organization chart is a hierarchy and nothing else. Measured on a
 * six-node chart in Highcharts 11 plus `modules/sankey.js` and
 * `modules/organization.js`, every node came back with **no `value` field at
 * all** and with Highcharts' own internal `sum` at `1` for every node alike,
 * because the layout assigns one unit per link. There is no magnitude in the
 * declaration and none in the drawing.
 *
 * That is why this was declined until now, and #1153 recorded why the two
 * available spellings were both wrong: omitting `y` announced `0` on every
 * node over a `freq { min: 0, max: 0 }`, and declaring the layout's `1`
 * announced two siblings as 100% of their parent each. `TreemapTrace` now
 * recognises a tree that declares no magnitude anywhere and reads it for what
 * it has -- the navigation, the ancestry, and how many people report to
 * whoever the cursor is on -- so the payload here declares no `y` and means
 * it.
 *
 * The structure comes from `series.nodes` rather than from the links. An
 * organization series is declared as `from`/`to` pairs, and Highcharts
 * resolves them into node objects carrying `linksTo`, `linksFrom`, the
 * display `name` and the `title` -- which is also the only place the drawn
 * box can be reached from, for the selectors.
 *
 * **A node with two parents declines the whole series.** A tree cannot say
 * that someone reports to two managers, and reading it as a tree would drop
 * one of the two links from a chart that plainly draws both. A silently
 * missing edge is worse than the fallback, which at least says what it is --
 * the same line `qqline` is held to in xability/r-maidr#251.
 *
 * @param series - The organization series
 * @param containerId - The chart container's DOM id
 * @returns The layer, or null when the hierarchy is not a tree
 */
function convertOrganizationSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer | null {
  const nodes = series.nodes ?? [];
  if (nodes.length === 0) {
    return null;
  }

  // Keyed by the id as a string. A chart declaring its links as `[[1, 2]]`
  // gives numeric ids, draws correctly, and would otherwise have every path
  // come back empty -- the whole hierarchy silently gone, announced as a
  // flat list of roots.
  const byId = new Map<string, HighchartsNode>();
  for (const node of nodes) {
    byId.set(String(node.id), node);
  }

  const multiParent = nodes.find(node => (node.linksTo ?? []).length > 1);
  if (multiParent !== undefined) {
    console.warn(
      `[MAIDR Highcharts] "${series.name}" has a node with more than one `
      + `parent ("${multiParent.id}"); a tree cannot carry that, so the `
      + `series is skipped rather than read with an edge missing.`,
    );
    return null;
  }

  const data: TreemapPoint[] = nodes.map(node => ({
    x: organizationNodeLabel(node),
    path: organizationAncestors(node, byId, series.name),
  }));

  // The same stamping the treemap uses, over the nodes rather than the
  // points: an organization series' `data` is its links, and what a reader
  // navigates is the boxes.
  stampPointIndices([nodes], 'data-maidr-node-index');

  return {
    id: String(series.index),
    // `TREE` rather than `TREEMAP`: the same trace reads both, and the name
    // is what the reader is told the chart is. An org chart announced as a
    // treemap names a painting nobody drew.
    type: TraceType.TREE,
    title: series.name || undefined,
    selectors: treemapSelectors(containerId, series.index, data.length),
    // No `y` axis. The chart has no second dimension to name, and
    // `TreemapTrace` never reads the label on a tree that declares no
    // magnitude, so naming one would claim an axis that is not drawn.
    axes: { x: { label: TREE_NODE_AXIS } },
    data,
  };
}

/**
 * What an organization box says, as one string.
 *
 * The box draws the node's name and, under it, the `title` the node option
 * carries -- measured, a role such as "CEO". Both are joined because either
 * alone loses half of what a sighted reader is given, and duplicates are
 * dropped because Highcharts falls `name` back to `id`, so a node declared
 * with neither would otherwise repeat itself.
 *
 * @param node - The node to name
 * @returns The label, never empty
 */
function organizationNodeLabel(node: HighchartsNode): string {
  const parts = [node.name, node.options?.title]
    .filter((part): part is string => typeof part === 'string' && part !== '');
  const unique = parts.filter((part, i) => parts.indexOf(part) === i);
  return unique.length > 0 ? unique.join(', ') : String(node.id);
}

/**
 * The labels of a node's ancestors, root first and the node itself excluded.
 *
 * Walks the single incoming link up to the root. A cycle -- which an
 * organization chart can declare, since nothing stops a link pointing back up
 * -- would otherwise loop forever, so a node already passed ends the walk and
 * says so once.
 *
 * @param node - The node to trace back from
 * @param byId - Every node of the series, keyed by id
 * @param seriesName - The owning series, for the cycle warning
 * @returns The path MAIDR addresses the node by, empty at the root
 */
function organizationAncestors(
  node: HighchartsNode,
  byId: Map<string, HighchartsNode>,
  seriesName: string,
): string[] {
  const path: string[] = [];
  const seen = new Set<string>([String(node.id)]);
  let at: HighchartsNode | undefined = node;

  while (at !== undefined) {
    const parentId = at.linksTo?.[0]?.from;
    if (parentId === undefined || parentId === null) {
      break;
    }
    // As a string, matching how `byId` is keyed: a numerically declared id
    // is a real id, and treating it as "no parent" would flatten the tree.
    const key = String(parentId);
    if (seen.has(key)) {
      console.warn(
        `[MAIDR Highcharts] "${seriesName}" reports a cycle through `
        + `"${key}"; the path is cut there.`,
      );
      break;
    }
    seen.add(key);
    const parent = byId.get(key);
    if (parent === undefined) {
      break;
    }
    path.unshift(organizationNodeLabel(parent));
    at = parent;
  }

  return path;
}

/**
 * The names of a node's ancestors, root first and the node itself excluded.
 *
 * @param point - The node to trace back from
 * @param byId - Every declared node, keyed by its Highcharts id
 * @param seriesName - The owning series, for the cycle warning
 * @returns The path MAIDR addresses the node by, empty at the top level
 */
function ancestorsOf(
  point: HighchartsPoint,
  byId: Map<string, HighchartsPoint>,
  seriesName: string,
): (string | number)[] {
  const path: (string | number)[] = [];
  // Seeded with the node itself so a point declaring itself as its own parent
  // stops here rather than naming itself as its own ancestor.
  const seen = new Set<string>(point.id === undefined ? [] : [point.id]);

  let at = point;
  while (at.parent) {
    if (seen.has(at.parent)) {
      console.warn(
        `[MAIDR Highcharts] Series "${seriesName}": node "${treeNodeLabel(point)}" `
        + `has a cyclic parent chain; its path stops at "${at.parent}".`,
      );
      break;
    }
    seen.add(at.parent);
    const parent = byId.get(at.parent);
    if (!parent) {
      // Highcharts attaches a node whose parent was never declared to the
      // root, so the path ends here rather than naming a node that does not
      // exist.
      break;
    }
    path.unshift(treeNodeLabel(parent));
    at = parent;
  }

  return path;
}

/**
 * Stamps each rendered treemap or sunburst node with `data-maidr-node-index`,
 * the node's position in `series.data`.
 *
 * `TreemapSeries#drawPoints` files every rectangle into a `level-group-N`
 * container whose `zIndex` is the negated depth, so the DOM is grouped by
 * depth with the deepest level first — document order carries no information
 * about declaration order, which is what the selectors have to be indexed by.
 *
 * Nodes without a rendered `graphic` (hidden below the current root, or drawn
 * away by a drilldown) are skipped; `TreemapTrace` then finds fewer elements
 * than nodes and withdraws the layer's highlighting rather than pairing
 * announcements with the wrong rectangles.
 *
 * Idempotent: re-stamping overwrites existing attributes.
 */
function stampTreeIndices(series: HighchartsSeries): void {
  stampPointIndices([series.data], 'data-maidr-node-index');
}

/**
 * Stamps a running index onto each point's rendered element, counted across
 * the groups in order.
 *
 * Several trace types need this — a treemap, a gantt, a hexbin — for the same
 * reason: MAIDR indexes their selector lists by the order it reads the data
 * in, and Highcharts draws in an order of its own. What differs between them
 * is only the order the groups arrive in and the attribute name, so the walk
 * itself lives here.
 *
 * A point Highcharts did not draw carries no `graphic` and is skipped rather
 * than shifting the indices, so the missing element makes its own selector
 * match nothing instead of pairing every later point with a neighbour's mark.
 *
 * The parameter is narrowed to the one field this touches rather than taking
 * a `HighchartsPoint`, because an organization series stamps its **nodes**:
 * its points are the links, and what a reader navigates is the boxes. A cast
 * between the two would have compiled only for as long as their `graphic`
 * fields happened to agree.
 *
 * @param groups - The elements to stamp, in the order MAIDR reads them
 * @param attribute - The data attribute the selectors address
 */
function stampPointIndices(
  groups: { graphic?: { element: SVGElement } }[][],
  attribute: string,
): void {
  let index = 0;
  for (const group of groups) {
    for (const point of group) {
      point.graphic?.element.setAttribute(attribute, String(index));
      index++;
    }
  }
}

/**
 * What a gauge's category dimension is called. The measure has a value axis
 * and reads its title from there, but the name of the thing being measured is
 * the series' own and belongs to no axis.
 */
const GAUGE_MEASURE_AXIS = 'Measure';

/**
 * Converts a `gauge`, `solidgauge` or `bullet` series into a gauge layer.
 *
 * The payload is a single object rather than an array, because the chart draws
 * exactly one measure. The reading alone is not the announcement: the dial's
 * ends come from the value axis' extremes, a bullet's target marker from the
 * point, and the qualitative bands from the axis' plot bands — none of which
 * a reader can recover from the number.
 *
 * A series carrying several dials is read as its first: MAIDR's gauge is one
 * measure against one range, and there is no shape here for a second.
 */
function convertGaugeSeries(
  series: HighchartsSeries,
  containerId: string,
  seriesType: string,
): MaidrLayer | null {
  const readings = series.data.filter(p => typeof p.y === 'number');
  const point = readings[0];
  if (!point) {
    console.warn(
      `[MAIDR Highcharts] Gauge series "${series.name}" has no numeric value; skipping.`,
    );
    return null;
  }
  if (readings.length > 1) {
    console.warn(
      `[MAIDR Highcharts] Gauge series "${series.name}" declares ${readings.length} `
      + `dials; reading the first. A gauge layer carries one measure.`,
    );
  }

  const { min, max } = series.yAxis?.getExtremes() ?? { min: 0, max: 0 };
  const bands = gaugeBands(series.yAxis);

  const data: GaugePoint = {
    value: point.y as number,
    min,
    max,
    ...(series.name ? { label: series.name } : {}),
    ...(typeof point.target === 'number' ? { target: point.target } : {}),
    ...(bands.length > 0 ? { bands } : {}),
  };

  return {
    id: String(series.index),
    type: TraceType.GAUGE,
    title: series.name || undefined,
    selectors: gaugeSelectorFor(seriesType, containerId, series.index),
    axes: {
      x: { label: GAUGE_MEASURE_AXIS },
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * The selector for a gauge's own mark, which differs by how the chart draws
 * the reading: a needle, a filled arc, or a bar beside a target.
 */
function gaugeSelectorFor(
  seriesType: string,
  containerId: string,
  seriesIndex: number,
): string {
  if (seriesType === 'solidgauge') {
    return solidGaugeSelector(containerId, seriesIndex);
  }
  if (seriesType === 'bullet') {
    return bulletSelector(containerId, seriesIndex);
  }
  return gaugeSelector(containerId, seriesIndex);
}

/**
 * Reads a value axis' plot bands as MAIDR's qualitative gauge bands.
 *
 * MAIDR carries only each band's upper edge, so the bands are sorted
 * ascending: a band starts where the previous one ended, and an unsorted list
 * would describe a partition the chart does not draw. A band Highcharts leaves
 * open-ended has no edge to carry and is dropped.
 *
 * Highcharts bands are usually drawn in colour and named nowhere, so a band
 * with neither a label nor a styled-mode class name is numbered by its
 * position. That says where in the partition the reading landed, which is what
 * the band is read for, without inventing a meaning the chart never gave it.
 */
function gaugeBands(axis: HighchartsAxis | undefined): GaugeBand[] {
  const plotBands = axis?.options?.plotBands ?? [];
  return plotBands
    .filter(band => typeof band.to === 'number')
    .sort((a, b) => (a.to as number) - (b.to as number))
    .map((band, index) => ({
      to: band.to as number,
      label: band.label?.text ?? band.className ?? `Band ${index + 1}`,
    }));
}

/**
 * Converts a `waterfall` series into a waterfall layer.
 *
 * Highcharts declares only what each step contributes; MAIDR's step carries
 * the absolute positions the bar floats between as well, so the converter
 * accumulates the running total as it walks the series — the same job
 * `WaterfallSeries#processData` does to place the bars.
 *
 * The two kinds of restating bar are placed the way Highcharts draws them
 * rather than uniformly. A `isSum` step is drawn from the baseline up to the
 * running total, so that is its span; an `isIntermediateSum` step is drawn
 * from the previous subtotal's edge to the current running total, which is why
 * the converter tracks that edge separately. Both are `total` steps: they
 * restate a number rather than contribute one, and `WaterfallTrace` leaves
 * them out of "largest contribution" for that reason.
 *
 * A step Highcharts draws no bar for — neither a number nor a sum — is dropped
 * rather than carried as a gap, since keeping it would slide every later
 * step's highlight onto its neighbour.
 */
function convertWaterfallSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: WaterfallPoint[] = [];

  // Where the chart has got to, and where the last subtotal bar's far edge
  // sits — the two baselines a waterfall's bars are drawn from.
  let running = 0;
  let subtotalEdge = 0;

  for (const p of series.data) {
    const isTotal = p.isSum === true || p.isIntermediateSum === true;
    if (!isTotal && typeof p.y !== 'number') {
      continue;
    }

    let start: number;
    let kind: WaterfallKind;
    if (p.isSum === true) {
      start = 0;
      kind = 'total';
    } else if (p.isIntermediateSum === true) {
      start = subtotalEdge;
      subtotalEdge = running;
      kind = 'total';
    } else {
      start = running;
      running += p.y as number;
      kind = (p.y as number) >= 0 ? 'increase' : 'decrease';
    }

    data.push({
      x: pointLabel(p),
      start,
      end: running,
      delta: running - start,
      kind,
    });
  }

  return {
    id: String(series.index),
    type: TraceType.WATERFALL,
    title: series.name || undefined,
    selectors: waterfallSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * The series an error bar takes its estimates from, when it names one.
 *
 * Highcharts resolves `linkedTo` into `series.linkedParent` before it renders,
 * so that is read first; the option itself is the fallback for the partially
 * built chart objects the adapter is sometimes handed, and supports both forms
 * Highcharts accepts — `':previous'` and another series' `id`.
 *
 * @param series - The error bar series
 * @param chart - The chart holding the candidates
 * @returns The parent series, or undefined for an unlinked error bar
 */
function linkedParentOf(
  series: HighchartsSeries,
  chart: HighchartsChart,
): HighchartsSeries | undefined {
  if (series.linkedParent) {
    return series.linkedParent;
  }
  const linkedTo = series.options.linkedTo;
  if (typeof linkedTo !== 'string') {
    return undefined;
  }
  return linkedTo === ':previous'
    ? chart.series[series.index - 1]
    : chart.series.find(candidate => candidate.options.id === linkedTo);
}

/**
 * The series whose values an error bar layer already announces.
 *
 * A linked error bar and its parent draw one thing between them: the parent
 * places the estimate and the error bar draws the interval around it, and
 * MAIDR's `ErrorBarPoint` carries both. Emitting the parent as a bar layer as
 * well would announce the same estimates twice, in a layer that has lost the
 * interval — so it is dropped, but ONLY when the error bar covers every sample
 * it drew. A parent with samples the error bar skips keeps its own layer, so
 * that no sample goes unannounced.
 *
 * @param seriesList - The panel's series
 * @param chart - The chart, for resolving `linkedTo`
 * @returns The parents to leave out of the other buckets
 */
function seriesReadAsErrorBars(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
): Set<HighchartsSeries> {
  const parents = new Set<HighchartsSeries>();
  for (const series of seriesList) {
    if (resolveSeriesType(series, chart) !== 'errorbar') {
      continue;
    }
    const parent = linkedParentOf(series, chart);
    if (!parent) {
      continue;
    }
    const measured = new Set(series.data.filter(isDrawnErrorBar).map(p => p.x));
    const covered = parent.data.every(p => typeof p.y !== 'number' || measured.has(p.x));
    if (covered) {
      parents.add(parent);
    }
  }
  return parents;
}

/**
 * Whether Highcharts draws a whip for an error bar point.
 *
 * `ErrorBarSeries` declares `pointValKey: 'high'`, so the upper bound is what
 * places the point: without it there is no `plotY`, `BoxPlotSeries#drawPoints`
 * skips the point entirely, and no element is rendered.
 *
 * @param point - The error bar point
 * @returns True when the chart drew it
 */
function isDrawnErrorBar(point: HighchartsPoint): boolean {
  return typeof point.high === 'number';
}

/**
 * Converts an `errorbar` series into an error bar layer.
 *
 * The two halves of the reading come from two different series. Highcharts
 * puts the interval on the error bar (`low` and `high`, absolute positions on
 * the value axis, which is the form MAIDR wants) and leaves the ESTIMATE in
 * the series the error bar is linked to — normally the column or scatter it is
 * drawn over. So the converter resolves that parent and zips the two together
 * by `x`, which is what makes one layer carrying all three magnitudes.
 *
 * An unlinked error bar still reads: the midpoint of the interval is where the
 * chart puts the estimate visually, so that is what is announced, and a reader
 * hears the same three numbers the chart drew. What is lost is only an
 * estimate placed off-centre, which an unlinked series never showed.
 *
 * A point Highcharts drew no whip for is dropped rather than carried as a gap,
 * for the reason the pie and funnel converters drop one: keeping it would
 * slide every later whip's highlight onto its neighbour.
 */
function convertErrorBarSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer {
  const parent = linkedParentOf(series, chart);
  const estimates = new Map<number, number>();
  for (const point of parent?.data ?? []) {
    if (typeof point.y === 'number') {
      estimates.set(point.x, point.y);
    }
  }

  const data: ErrorBarPoint[] = series.data
    .filter(isDrawnErrorBar)
    .map((p) => {
      const high = p.high as number;
      const low = typeof p.low === 'number' ? p.low : undefined;
      return {
        x: pointLabel(p),
        y: estimates.get(p.x) ?? (low === undefined ? high : (low + high) / 2),
        ...(low === undefined ? {} : { yMin: low }),
        yMax: high,
      };
    });

  return {
    id: String(series.index),
    type: TraceType.ERROR_BAR,
    title: series.name || parent?.name || undefined,
    ...(chart.options.chart?.inverted === true
      ? { orientation: Orientation.HORIZONTAL }
      : {}),
    selectors: errorBarSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Converts an `arearange` or `areasplinerange` series into an error bar layer.
 *
 * A band, not an interval around an estimate: Highcharts gives each point a
 * `low` and a `high` and draws the region between them, with nothing in the
 * middle. So the layer carries the two bounds and **no** `y`, and the trace
 * walks `lower` then `upper` at each sample, pitching each by its own
 * magnitude.
 *
 * Deliberately not the midpoint {@link convertErrorBarSeries} falls back to
 * for an unlinked whip. That fallback is defensible there because an error
 * bar *is* drawn about a centre, so the midpoint is where the chart put the
 * estimate visually. A band is drawn about nothing, and `(low + high) / 2`
 * would be a number the chart never shows -- a reader told "10" at a region
 * spanning 5 to 15 has been told something false, which is worse than being
 * told only the two numbers that are true (#1047).
 *
 * A point Highcharts drew no band segment for is dropped rather than carried
 * as a gap, for the reason {@link convertErrorBarSeries} drops one: keeping
 * it would slide every later highlight onto its neighbour.
 */
function convertRangeSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer {
  const data: ErrorBarPoint[] = series.data
    .filter(point => typeof point.low === 'number' || typeof point.high === 'number')
    .map((p) => {
      const low = typeof p.low === 'number' ? p.low : undefined;
      const high = typeof p.high === 'number' ? p.high : undefined;
      return {
        x: pointLabel(p),
        ...(low === undefined ? {} : { yMin: low }),
        ...(high === undefined ? {} : { yMax: high }),
      };
    });

  return {
    id: String(series.index),
    type: TraceType.ERROR_BAR,
    title: series.name || undefined,
    ...(chart.options.chart?.inverted === true
      ? { orientation: Orientation.HORIZONTAL }
      : {}),
    selectors: errorBarSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * The series types a forest plot's rows are drawn with.
 *
 * A meta-analysis draws each study as one mark on a categorical row axis, and
 * Highcharts has no series that means "a study" — which of these an author
 * reached for is a drawing decision. The declaration may equally sit on the
 * `errorbar` itself, for the common figure whose only series is the whip.
 */
const FOREST_ROW_TYPES = new Set([
  'scatter',
  'column',
  'bar',
  'lollipop',
  'line',
  'spline',
  'errorbar',
]);

/**
 * The selector for the marks a forest row is highlighted through.
 *
 * @param series - The series drawing the marks
 * @param chart - The chart, for resolving the series type
 * @param containerId - The chart's render-target id
 * @returns The selector
 */
function forestMarkSelector(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): string {
  const drawnAs = resolveSeriesType(series, chart);
  if (drawnAs === 'errorbar') {
    return errorBarSelector(containerId, series.index);
  }
  return drawnAs === 'column' || drawnAs === 'bar'
    ? barSelector(containerId, series.index)
    : scatterSelector(containerId, series.index);
}

/**
 * Converts a declared meta-analysis into a forest layer.
 *
 * A forest plot is an error bar chart laid out on a categorical row axis, and
 * that much the adapter already reads. What is declared is everything else,
 * because none of it is in the chart object at all:
 *
 * - **The weight.** A forest plot encodes it as marker *area*, so it exists in
 *   the drawing as a radius and nowhere else. Inverting it back out of
 *   `point.marker.radius` is not attempted: the arithmetic depends on how the
 *   author scaled the markers, and it yields a confident number for every
 *   figure whose author never varied them at all. It comes from a column of
 *   the author's own rows or not at all.
 * - **Which row is the summary.** The pooled result is not evidence, it is
 *   what the evidence came to, and nothing distinguishes its point from a
 *   study's. Named by a flag column, by `pooledIndex` for data that carries
 *   none, or by the companion series that draws its diamond.
 * - **The null line.** `nullValue` comes from the declaration only. The
 *   chart's `xAxis.plotLines` are deliberately *not* read for it: this
 *   adapter's existing plot-line fallback belongs to a volcano's threshold,
 *   and a forest plot's axis carries reference lines for other reasons too.
 *   Guessed wrong, every study is reported as not crossing — a wrong answer
 *   handed to every row — so a layer that declares none makes no claim.
 *
 * The interval comes from the `errorbar` series linked over the estimates,
 * which is how Highcharts draws one, or from the rows themselves.
 *
 * @param series - The declaring series
 * @param declaration - What the author said the series means
 * @param seriesList - The panel's series, for the companions
 * @param chart - The chart being converted
 * @param containerId - The chart's render-target id
 * @param consumed - The series the declared layers already announce
 * @returns The forest layer, or null when the series cannot back it
 */
function convertForestSeries(
  series: HighchartsSeries,
  declaration: ForestDeclaration,
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
  consumed: Set<HighchartsSeries>,
): MaidrLayer | null {
  const drawnAs = resolveSeriesType(series, chart);
  if (!FOREST_ROW_TYPES.has(drawnAs)) {
    warnWrongConstruct(series, declaration.type, chart, 'a series drawing one mark per study');
    return null;
  }
  consumed.add(series);

  // The whip may be this series or the one linked over it. Either way it is
  // where the interval lives, since Highcharts puts `low` and `high` there as
  // absolute positions — the form MAIDR wants.
  const interval = drawnAs === 'errorbar'
    ? series
    : companionSeries(
        series,
        declaration.intervalSeries,
        'errorbar',
        seriesList,
        chart,
        consumed,
        declaration.type,
      );
  // A declaration on the whip leaves the estimates in the series it is linked
  // to, which the adapter already drops from the other buckets — but only when
  // the whip covers every sample that series drew.
  if (interval === series) {
    for (const parent of seriesReadAsErrorBars([series], chart)) {
      consumed.add(parent);
    }
  }
  const summary = companionSeries(
    series,
    declaration.pooledSeries,
    undefined,
    seriesList,
    chart,
    consumed,
    declaration.type,
  );

  const data: ForestPoint[] = [
    ...forestRows(series, declaration, chart, interval, false),
    // The summary's own mark is drawn last, at the foot of the figure, which
    // is where its rows belong so the selector lists stay aligned.
    ...(summary ? forestRows(summary, declaration, chart, summary, true) : []),
  ];

  const marks = forestMarkSelector(interval ?? series, chart, containerId);
  const orientation = declaration.orientation
    ?? (chart.options.chart?.inverted === true ? Orientation.HORIZONTAL : undefined);

  return {
    id: String(series.index),
    type: TraceType.FOREST,
    title: declaration.title ?? (series.name || undefined),
    ...(declaration.name ? { name: declaration.name } : {}),
    ...(orientation ? { orientation } : {}),
    selectors: summary
      ? [marks, forestMarkSelector(summary, chart, containerId)]
      : marks,
    ...(declaration.nullValue === undefined
      ? {}
      : { forestOptions: { nullValue: declaration.nullValue } }),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Reads one series' rows as studies.
 *
 * The bounds are taken from the author's own columns first and from the drawn
 * whip second: a row that names its interval has said what it is, while a whip
 * only says where it was drawn. `error` — an interval given as a positive
 * offset from the estimate, the form a Recharts `<ErrorBar>` or a matplotlib
 * `yerr` carries — is normalised into absolute bounds and loses to both, since
 * those need no arithmetic.
 *
 * @param source - The series carrying the rows
 * @param declaration - The field names the author gave
 * @param chart - The chart, for resolving the series type
 * @param interval - The series drawing this one's whips, when one does
 * @param pooledDefault - True when every row of this series is the summary
 * @returns The rows, in the order the series declared them
 */
function forestRows(
  source: HighchartsSeries,
  declaration: ForestDeclaration,
  chart: HighchartsChart,
  interval: HighchartsSeries | undefined,
  pooledDefault: boolean,
): ForestPoint[] {
  const bounds = new Map<number, { low?: number; high?: number }>();
  for (const point of interval?.data ?? []) {
    bounds.set(point.x, { low: finiteNumber(point.low), high: finiteNumber(point.high) });
  }
  // An error bar carries no estimate of its own: `pointValKey` is `high`, so
  // whatever `y` it has is the top of the whip rather than the middle of it.
  const drawsEstimate = resolveSeriesType(source, chart) !== 'errorbar';
  const estimates = new Map<number, number>();
  if (!drawsEstimate) {
    for (const point of linkedParentOf(source, chart)?.data ?? []) {
      const y = finiteNumber(point.y);
      if (y !== undefined) {
        estimates.set(point.x, y);
      }
    }
  }

  const lower = readSeriesField(source, declaration.yMin, 'yMin');
  const upper = readSeriesField(source, declaration.yMax, 'yMax');
  const offsets = declaration.error === undefined
    ? []
    : readSeriesField(source, declaration.error, 'error');
  const weights = readSeriesField(source, declaration.weight, 'weight');
  const flags = readSeriesField(source, declaration.pooled, 'pooled');

  let rescaled = false;
  const rows: ForestPoint[] = [];
  source.data.forEach((point, index) => {
    const offset = errorOffset(offsets[index]);
    const drawn = bounds.get(point.x);
    const estimate = estimates.get(point.x)
      ?? (drawsEstimate ? finiteNumber(point.y) : undefined);

    const yMin = finiteNumber(lower[index])
      ?? drawn?.low
      ?? (estimate === undefined || offset === undefined ? undefined : estimate - offset[0]);
    const yMax = finiteNumber(upper[index])
      ?? drawn?.high
      ?? (estimate === undefined || offset === undefined ? undefined : estimate + offset[1]);

    // An unlinked whip draws its estimate at the centre of the interval, which
    // is the honest reading of where such a chart put it.
    const y = estimate
      ?? (yMin === undefined || yMax === undefined ? undefined : (yMin + yMax) / 2);
    if (y === undefined) {
      return;
    }

    // A fraction of one, never a percentage. Meta-analysis software reports
    // this column as `12.5` for one study in eight, and dividing by a hundred
    // would guess that the column sums to one — while announcing it untouched
    // says the study weighs 1250%.
    const weight = finiteNumber(weights[index]);
    const usable = weight !== undefined && weight >= 0 && weight <= 1;
    rescaled ||= weight !== undefined && !usable;

    // `pooledIndex` counts the declaring series' rows as authored, dropped
    // ones included, since that is the only sequence an author can see.
    const pooled = pooledDefault
      || isFlagValue(flags[index])
      || index === declaration.pooledIndex;

    rows.push({
      x: pointLabel(point),
      y,
      ...(yMin === undefined ? {} : { yMin }),
      ...(yMax === undefined ? {} : { yMax }),
      ...(usable ? { weight } : {}),
      ...(pooled ? { pooled: true } : {}),
    });
  });

  if (rescaled) {
    console.warn(
      `[MAIDR ${ADAPTER}] maidr declaration for "${declaration.type}" on ${seriesRef(source)} `
      + `reads weights outside 0 to 1, which are percentages rather than shares; `
      + `those rows are emitted without a weight.`,
    );
  }
  return rows;
}

/**
 * An interval declared as an offset from the estimate, as a lower and upper
 * magnitude.
 *
 * Both are **positive magnitudes**, which is the form every producer that
 * hands out offsets rather than bounds uses: an interval given as `[0.2, 0.3]`
 * around 1.4 is 1.2 to 1.7. A negative entry is left out rather than flipped,
 * since read the other way the same pair would give 1.6 to 1.7 and nothing
 * downstream could tell the two readings apart.
 *
 * @param value - Whatever the `error` field resolved to
 * @returns The lower and upper magnitudes, or undefined
 */
function errorOffset(value: unknown): [number, number] | undefined {
  if (Array.isArray(value)) {
    const low = finiteNumber(value[0]);
    const high = finiteNumber(value[1]);
    return low === undefined || high === undefined || low < 0 || high < 0
      ? undefined
      : [low, high];
  }
  const symmetric = finiteNumber(value);
  return symmetric === undefined || symmetric < 0 ? undefined : [symmetric, symmetric];
}

/**
 * Converts a `dumbbell` series into a dumbbell layer.
 *
 * The payload is a single object rather than an array, because the names of
 * the two ends belong to the chart and not to any one row. Highcharts names
 * them nowhere — a dumbbell point declares a `low` and a `high` and nothing
 * that says what either one is — so they come from the adapter's own options,
 * and MAIDR falls back to "start" and "end" when they are not supplied.
 *
 * `low` is the start: it is the first value in a dumbbell's `[x, low, high]`
 * tuple, and the reference end a chart of change is read from. Which of the
 * two is larger is not fixed and is not assumed anywhere — a dumbbell showing
 * a decline draws its end below its start.
 *
 * The change between the two ends is deliberately not computed here.
 * `DumbbellTrace` derives it from the pair, so an authored one would be a
 * second source of truth for a number the segment already draws.
 *
 * A row missing either end is dropped, since neither `start` nor `end` has
 * anywhere to be absent. Highcharts still draws that row's connector — it
 * creates one per declared point, with or without a path — so MAIDR then finds
 * more connectors than rows and withdraws the layer's highlighting rather than
 * pairing announcements with the wrong segments.
 */
function convertDumbbellSeries(
  series: HighchartsSeries,
  containerId: string,
  options?: HighchartsAdapterOptions,
): MaidrLayer {
  const points: DumbbellPoint[] = series.data
    .filter(p => typeof p.low === 'number' && typeof p.high === 'number')
    .map(p => ({
      x: pointLabel(p),
      start: p.low as number,
      end: p.high as number,
    }));

  const { start, end } = options?.dumbbellLabels ?? {};
  const data: DumbbellData = {
    points,
    ...(start ? { startLabel: start } : {}),
    ...(end ? { endLabel: end } : {}),
  };

  return {
    id: String(series.index),
    type: TraceType.DUMBBELL,
    title: series.name || undefined,
    selectors: dumbbellSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * What MAIDR calls a unit of a datetime axis.
 *
 * A Highcharts datetime axis counts milliseconds, and an interval's length is
 * a difference along it, so that is the unit — announced rather than converted
 * because `start` and `end` have to stay in the axis' own numbers for the
 * panning to place them where the chart draws them.
 */
const GANTT_DATETIME_UNIT = 'ms';

/**
 * Converts a `gantt` or `xrange` series into a gantt layer.
 *
 * The payload is nested by lane, and that nesting is the reason the shape is
 * an object rather than a flat list: a lane with nothing booked is a real
 * statement about a schedule, and only a nested list can make it. Highcharts
 * draws the intervals in `series.data` order, which interleaves lanes freely,
 * so the converter regroups them — and stamps the DOM in the regrouped order,
 * since MAIDR slices its selector list lane by lane.
 *
 * The lanes come from the y axis' categories, which both series types supply:
 * an xrange declares them outright, and a Gantt chart's tree grid axis builds
 * them from the tasks. Failing that they are numbered, so a chart drawn
 * against a bare numeric axis still navigates.
 *
 * A milestone has no end — Highcharts draws it as a diamond rather than a bar
 * — so it becomes a zero-length interval at its own instant, which is what the
 * chart shows.
 */
function convertGanttSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const categories = series.yAxis?.categories ?? [];

  // Group the intervals by lane, keeping the order each lane declared them in.
  const laneSources: HighchartsPoint[][] = [];
  const laneOf = (point: HighchartsPoint): number =>
    (typeof point.y === 'number' ? Math.round(point.y) : -1);
  // Reduced rather than spread into Math.max: a long enough series would
  // overflow the argument list and throw before the chart could be read.
  const laneCount = series.data.reduce(
    (highest, point) => Math.max(highest, laneOf(point) + 1),
    categories.length,
  );
  for (let lane = 0; lane < laneCount; lane++) {
    laneSources.push(series.data.filter(point => laneOf(point) === lane));
  }

  const lanes: (string | number)[] = Array.from(
    { length: laneCount },
    (_, lane) => categories[lane] ?? lane,
  );

  const data: GanttData = {
    points: laneSources.map((lane, index) => lane.map(point => ({
      x: lanes[index],
      start: point.x,
      end: point.x2 ?? point.x,
      ...(point.name ? { label: point.name } : {}),
    } satisfies GanttPoint))),
    lanes,
    ...(isDatetimeAxis(series.xAxis) ? { unit: GANTT_DATETIME_UNIT } : {}),
  };

  stampGanttIndices(laneSources);

  return {
    id: String(series.index),
    type: TraceType.GANTT,
    title: series.name || undefined,
    // A gantt runs its bars along x with its lanes down y, which is the
    // opposite of MAIDR's default, so the axis labels have to be swapped back.
    orientation: Orientation.HORIZONTAL,
    selectors: ganttSelectors(containerId, series.index, laneSources.flat().length),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Whether an axis counts time rather than plain numbers.
 *
 * Highcharts Gantt forces `type: 'datetime'` onto its x axes; an xrange may or
 * may not, so both the runtime flag and the declared option are read.
 *
 * @param axis - The axis to inspect
 * @returns True when its values are timestamps
 */
function isDatetimeAxis(axis: HighchartsAxis | undefined): boolean {
  return axis?.isDatetimeAxis === true || axis?.options?.type === 'datetime';
}

/**
 * Stamps each rendered gantt or xrange interval with `data-maidr-task-index`,
 * its position in the lane-major order MAIDR reads the lanes in.
 *
 * Highcharts draws the intervals in `series.data` order, so a chart whose
 * tasks were declared by date rather than by lane puts them in the DOM
 * interleaved — and `GanttTrace` slices its elements lane by lane. Document
 * order therefore cannot be indexed into, exactly as it cannot for a treemap.
 *
 * Stamping the point's own `graphic` also spans the two shapes the series draw
 * with: an ordinary task is a `<g>` wrapping a `<rect>` that repeats its
 * class, a milestone is a bare `<path>`, and the `graphic` is the outermost
 * element in both cases.
 *
 * An interval Highcharts did not draw has no element to stamp, so its selector
 * matches nothing and the layer's highlighting is withdrawn rather than
 * shifted onto its neighbours.
 *
 * Idempotent: re-stamping overwrites existing attributes.
 *
 * @param laneSources - The Highcharts points, grouped by lane
 */
function stampGanttIndices(laneSources: HighchartsPoint[][]): void {
  stampPointIndices(laneSources, 'data-maidr-task-index');
}

/**
 * A scatter, or a bubble chart -- a scatter whose markers carry a size.
 *
 * `z` is kept where the series has one, because it is a third measured
 * quantity and not decoration: `ScatterTrace` reads it through
 * `zIntensityFor()`, so the size becomes audible as well as readable. Dropping
 * it is what #826 fixed for Chart.js, and what this adapter did to every
 * `bubble` series until #1138 -- though there the size was the lesser loss,
 * since the series reached no converter at all and the chart was silent.
 *
 * A `bubble` point without a `z` is still a point: it is filtered on `y`
 * alone, so a series that mixes sized and unsized markers keeps both, and the
 * unsized ones simply carry no third quantity.
 *
 * @param series - The scatter or bubble series
 * @param containerId - The chart's container, for the selector
 * @returns The layer
 */
function convertScatterSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  // A category axis names the slot each point sits in, and `xLabel` is the
  // field for that -- "this position on x is called Norway", as against
  // `label`, which names the point itself. A continuous axis has no such name,
  // so nothing is invented where there is none.
  const named = isCategoryScatter(series);
  const data: ScatterPoint[] = series.data
    .filter(p => p.y !== null)
    .map(p => ({
      x: p.x,
      y: p.y as number,
      ...(typeof p.z === 'number' ? { z: p.z } : {}),
      ...(named ? { xLabel: String(pointLabel(p)) } : {}),
    }));

  return {
    id: String(series.index),
    type: TraceType.SCATTER,
    title: series.name || undefined,
    selectors: scatterSelector(containerId, series.index),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * The scatter series a caller declared as one volcano or Manhattan plot.
 *
 * Named by Highcharts series index, since that is what the rest of the
 * adapter's options are keyed by, and defaulting to every scatter series in
 * the panel — a Manhattan is drawn as one series per chromosome and read as
 * one cloud.
 *
 * @param seriesList - The panel's convertible series
 * @param chart - The chart, for resolving each series' type
 * @param options - The adapter options carrying the declaration
 * @returns The series to merge into a threshold layer, empty when none
 */
function significancePlotSeries(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  options?: HighchartsAdapterOptions,
): HighchartsSeries[] {
  const declared = options?.significancePlot;
  if (!declared) {
    return [];
  }

  const scatters = seriesList.filter(s => resolveSeriesType(s, chart) === 'scatter');
  if (scatters.length === 0) {
    return [];
  }
  if (!declared.seriesIndices) {
    return scatters;
  }

  const chosen = scatters.filter(s => declared.seriesIndices?.includes(s.index));
  if (chosen.length === 0) {
    console.warn(
      `[MAIDR Highcharts] significancePlot names series ${
        JSON.stringify(declared.seriesIndices)}, none of which is a scatter `
        + `series here; reading this panel's scatters as scatters.`,
    );
  }
  return chosen;
}

/**
 * The thresholds a volcano or Manhattan layer declares.
 *
 * What the caller states wins. Failing that the cutoffs are read from the
 * plot lines the chart already draws across itself, which is the only place
 * either chart says where its threshold is: the significance line runs across
 * the y axis, and a volcano's effect-size pair across the x axis, symmetric
 * about zero — so the magnitude of the first non-zero one is the cutoff.
 *
 * The x-axis reading is a **volcano's only**. A volcano's x is fold change and
 * a line across it is a cutoff, but a Manhattan's x is genomic position, where
 * the plot lines a chart draws are chromosome dividers. Inferring an effect
 * from one would compare every point's position against a divider's coordinate
 * and reject nearly all of them, emptying the significance summary and the
 * rotor filter — the silent failure this whole design exists to avoid. A
 * Manhattan can still carry an `effect`, but only by stating it.
 *
 * A layer that ends up declaring nothing gets no `thresholdOptions` at all,
 * and MAIDR then reads the cloud without making any claim about significance.
 * The direction is passed through only when it was stated: MAIDR reads
 * `above` by default, which suits a -log10(p) axis, and guessing it for a raw
 * p axis would select exactly the points that failed to reach significance.
 *
 * @param series - The series whose axes carry the plot lines
 * @param declared - What the caller stated
 * @returns The threshold options, or undefined when nothing is known
 */
function significanceThresholds(
  series: HighchartsSeries,
  declared: NonNullable<HighchartsAdapterOptions['significancePlot']>,
): ThresholdOptions | undefined {
  const significance = declared.significance
    ?? plotLineValues(series.yAxis).find(value => Number.isFinite(value));
  const effect = declared.effect
    ?? (declared.type === 'volcano'
      ? plotLineValues(series.xAxis).map(Math.abs).find(value => value > 0)
      : undefined);

  const thresholds: ThresholdOptions = {
    ...(typeof significance === 'number' ? { significance } : {}),
    ...(declared.significanceDirection
      ? { significanceDirection: declared.significanceDirection }
      : {}),
    ...(typeof effect === 'number' ? { effect } : {}),
  };
  return Object.keys(thresholds).length > 0 ? thresholds : undefined;
}

/**
 * The numeric values of an axis' plot lines, in declaration order.
 *
 * @param axis - The axis to read
 * @returns Every plot line value that is a finite number
 */
function plotLineValues(axis: HighchartsAxis | undefined): number[] {
  return (axis?.options?.plotLines ?? [])
    .map(line => line.value)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

/**
 * Converts the declared `scatter` series into one volcano or Manhattan layer.
 *
 * Both charts are scatters read through a threshold, so the payload is the
 * scatter's coordinates plus the two things a scatter has nowhere to carry:
 * what each point **is**, and which region it belongs to. Identity is the
 * payload on these charts — a reader told "x is 2.3, y is 14.1" has been given
 * the two numbers the axes already describe and withheld the gene — so the
 * point's name travels as the label, and the series name as the group, which
 * on a Manhattan is the chromosome.
 *
 * The series are merged rather than layered because the threshold spans all of
 * them: a Manhattan is one cloud drawn as twenty-two series, and a volcano
 * split into up- and down-regulated series is one cloud too. A merged layer
 * takes no title from a single series, since none of them names the whole.
 *
 * A point with no y is dropped: Highcharts draws no marker for it, so keeping
 * it would slide every later point's highlight onto its neighbour.
 */
function convertSignificanceSeries(
  seriesList: HighchartsSeries[],
  chart: HighchartsChart,
  containerId: string,
  declared: NonNullable<HighchartsAdapterOptions['significancePlot']>,
): MaidrLayer | null {
  if (seriesList.length === 0)
    return null;

  const data: VolcanoPoint[] = seriesList.flatMap((series) => {
    // The series is the region: on a Manhattan it is the chromosome, on a
    // volcano the regulation class the points were split into.
    const group = series.name || undefined;
    return series.data
      .filter(p => typeof p.y === 'number')
      .map(p => ({
        x: p.x,
        y: p.y as number,
        ...(p.name ? { label: p.name } : {}),
        ...(group ? { group } : {}),
      }));
  });

  const first = seriesList[0];
  const thresholds = significanceThresholds(first, declared);

  return {
    id: seriesList.map(s => String(s.index)).join('-'),
    type: declared.type === 'manhattan' ? TraceType.MANHATTAN : TraceType.VOLCANO,
    title: seriesList.length === 1 ? first.name || undefined : undefined,
    selectors: volcanoSelector(containerId, seriesList.map(s => s.index)),
    ...(thresholds ? { thresholdOptions: thresholds } : {}),
    axes: {
      x: getAxisLabel(first, 'x'),
      y: getAxisLabel(first, 'y'),
    },
    data,
  };
}

/**
 * What a pie's two dimensions are called. A pie series is bound to no axis, so
 * {@link getAxisLabel}'s `'X'` / `'Y'` fallback would name them after
 * coordinates a pie does not have; these name what each one actually holds.
 */
const PIE_LABEL_AXIS = 'Label';
const PIE_VALUE_AXIS = 'Value';

/**
 * Converts a `pie` series — a doughnut is the same series type with an
 * `innerSize`, and reads identically — into a pie layer.
 *
 * Highcharts draws the wedges in `series.data` order, so slice k is wedge k
 * with no reordering to undo. A point with no value is dropped rather than
 * carried through as a gap, because Highcharts draws no wedge for it: keeping
 * it would slide every later slice's highlight onto its neighbour.
 */
function convertPieSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const data: PiePoint[] = series.data
    .filter(p => p.y != null)
    .map(p => ({
      x: pointLabel(p),
      y: p.y as number,
    }));

  return {
    id: String(series.index),
    type: TraceType.PIE,
    title: series.name || undefined,
    selectors: pieSelector(containerId, series.index),
    axes: {
      x: { label: PIE_LABEL_AXIS },
      y: { label: PIE_VALUE_AXIS },
    },
    data,
  };
}

function convertBoxSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer {
  const data: BoxPoint[] = series.data.map((p, i) => {
    const missing: string[] = [];
    if (p.low == null)
      missing.push('low');
    if (p.q1 == null)
      missing.push('q1');
    if (p.median == null)
      missing.push('median');
    if (p.q3 == null)
      missing.push('q3');
    if (p.high == null)
      missing.push('high');

    if (missing.length > 0) {
      console.warn(
        `[MAIDR Highcharts] Boxplot series "${series.name}" point ${i}: missing ${missing.join(', ')}; defaulting to 0.`,
      );
    }

    return {
      z: p.category ?? p.name ?? String(p.x),
      lowerOutliers: [],
      min: p.low ?? 0,
      q1: p.q1 ?? 0,
      q2: p.median ?? 0,
      q3: p.q3 ?? 0,
      max: p.high ?? 0,
      upperOutliers: [],
    };
  });

  // Stamp each rendered `g.highcharts-point` group with a stable index so
  // per-box selectors (returned by `boxplotSelectors`) can disambiguate them.
  // BoxTrace expects `selectors.length === data.length`; a mismatch here makes
  // it bail out with `highlightValues = null` and silently disable highlight.
  stampBoxIndices(chart, containerId, series.index, data.length);

  return {
    id: String(series.index),
    type: TraceType.BOX,
    title: series.name || undefined,
    selectors: boxplotSelectors(containerId, series.index, data.length),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Adds `data-maidr-box-index="N"` to each rendered box group in a Highcharts
 * boxplot series. Idempotent: re-running overwrites existing attributes,
 * which is important because Highcharts may re-render on updates.
 *
 * If the rendered group count doesn't match `expectedCount`, a warning is
 * emitted and stamping continues for whichever groups exist; downstream
 * `BoxTrace.mapToSvgElements` will then return null and disable highlight.
 */
function stampBoxIndices(
  chart: HighchartsChart,
  containerId: string,
  seriesIndex: number,
  expectedCount: number,
): void {
  const container = chart.renderTo ?? document.getElementById(containerId);
  if (!container) {
    console.warn(`[MAIDR Highcharts] Boxplot stamping: container "${containerId}" not found.`);
    return;
  }

  const selector = `.highcharts-series-group .highcharts-series-${seriesIndex} g.highcharts-point`;
  const groups = container.querySelectorAll<SVGGElement>(selector);

  if (groups.length !== expectedCount) {
    console.warn(
      `[MAIDR Highcharts] Boxplot series ${seriesIndex}: expected ${expectedCount} `
      + `box groups but found ${groups.length} in DOM. Highlight may not work.`,
    );
  }

  groups.forEach((group, i) => {
    group.removeAttribute('data-maidr-box-index');
    group.setAttribute('data-maidr-box-index', String(i));
    splitWhiskerPath(group, i);
  });
}

/**
 * Splits a Highcharts whisker `<path>` element into two separate `<path>`
 * elements (one per cap) so MAIDR can highlight `min` and `max` independently.
 *
 * Highcharts renders both whisker caps inside a single `<path>` with two
 * subpaths in the `d` attribute, e.g.:
 *   - Vertical:   `M x1 y_high L x2 y_high M x1 y_low L x2 y_low`
 *   - Horizontal: `M x_high y1 L x_high y2 M x_low y1 L x_low y2`
 *
 * After splitting:
 *   - Two new `<path>` siblings are inserted after the original, each carrying
 *     `data-maidr-box-part="upper-whisker"` or `"lower-whisker"`.
 *   - The original loses its `highcharts-boxplot-whisker` class (so future
 *     class-based queries skip it) and is marked `data-maidr-split-original`.
 *
 * Orientation is inferred from the relative midpoint offsets between the two
 * subpaths, matching the D3 box binder's classification logic.
 *
 * Idempotent: re-running on an already-split group is a no-op.
 */
function splitWhiskerPath(group: SVGGElement, boxIndex: number): void {
  const original = group.querySelector<SVGPathElement>('path.highcharts-boxplot-whisker');
  if (!original) {
    // Some box configs (e.g. no whisker rendering) legitimately omit it.
    return;
  }
  if (original.hasAttribute('data-maidr-split-original')) {
    // Already split (re-stamp on same DOM).
    return;
  }

  const d = original.getAttribute('d');
  if (!d) {
    console.warn(`[MAIDR Highcharts] Whisker path in box ${boxIndex} has no 'd' attribute; skipping split.`);
    return;
  }

  const parts = computeWhiskerParts(d);
  if (!parts) {
    console.warn(
      `[MAIDR Highcharts] Whisker path in box ${boxIndex} could not be split `
      + `(expected 2 subpaths with valid midpoints); skipping split.`,
    );
    return;
  }

  const upperPath = original.cloneNode(true) as SVGPathElement;
  upperPath.setAttribute('d', parts.upper);
  upperPath.setAttribute('data-maidr-box-part', 'upper-whisker');
  // Strip the identifying class from the clone so re-running `splitWhiskerPath`
  // never matches it (keeping stamping idempotent); the attribute selector still
  // targets it via `data-maidr-box-part`.
  upperPath.classList.remove('highcharts-boxplot-whisker');

  const lowerPath = original.cloneNode(true) as SVGPathElement;
  lowerPath.setAttribute('d', parts.lower);
  lowerPath.setAttribute('data-maidr-box-part', 'lower-whisker');
  lowerPath.classList.remove('highcharts-boxplot-whisker');

  // Insert after original so the visual stacking order is preserved. Note:
  // afterend insertions go in reverse, so insert lower first then upper to
  // end up with [original, upper, lower] which keeps the natural order.
  original.insertAdjacentElement('afterend', lowerPath);
  original.insertAdjacentElement('afterend', upperPath);

  // Strip the original's identifying class so attribute-only selectors (and
  // any future `.highcharts-boxplot-whisker` queries) skip it. We keep it in
  // the DOM rather than hiding so Highcharts' own internal references stay
  // valid; the new paths render the same caps on top.
  original.classList.remove('highcharts-boxplot-whisker');
  original.setAttribute('data-maidr-split-original', 'true');

  // Highcharts redraws (resize/reflow/update) rewrite the ORIGINAL path's `d`
  // in place but never touch our clones, leaving them stale. Mirror the
  // original's `d` back onto the clones whenever it changes.
  observeSplitRedraw(original, () => {
    const currentD = original.getAttribute('d');
    if (!currentD)
      return;
    const next = computeWhiskerParts(currentD);
    if (!next)
      return;
    upperPath.setAttribute('d', next.upper);
    lowerPath.setAttribute('d', next.lower);
  });
}

/**
 * Classifies a Highcharts whisker path's two cap subpaths into `upper` and
 * `lower` cap `d` strings. Returns `null` when the path does not contain
 * exactly two subpaths with computable midpoints.
 */
function computeWhiskerParts(d: string): { upper: string; lower: string } | null {
  // Highcharts uses uppercase commands; each cap starts with a fresh M.
  const subpaths = d.match(/M[^M]*/g);
  if (!subpaths || subpaths.length !== 2) {
    return null;
  }

  const m0 = subpathMidpoint(subpaths[0]);
  const m1 = subpathMidpoint(subpaths[1]);
  if (!m0 || !m1) {
    return null;
  }

  // Pick the dominant axis to classify: whichever differs more between
  // the two cap midpoints is the orientation axis.
  const dx = Math.abs(m0.x - m1.x);
  const dy = Math.abs(m0.y - m1.y);

  let upperIdx: number;
  if (dy >= dx) {
    // Vertical boxplot: SVG y grows downward → smaller y is visually upper.
    upperIdx = m0.y < m1.y ? 0 : 1;
  } else {
    // Horizontal boxplot: larger x is the "max" (high-value) side.
    upperIdx = m0.x > m1.x ? 0 : 1;
  }
  const lowerIdx = 1 - upperIdx;

  return { upper: subpaths[upperIdx].trim(), lower: subpaths[lowerIdx].trim() };
}

/**
 * Watches a split-original `<path>` for `d` attribute changes and invokes
 * `resync` so its cloned sub-part siblings can be kept in sync on Highcharts
 * redraws. The observer is captured only by the observed node (and its
 * callback closure), so it is garbage-collected together with the chart DOM;
 * it does not need explicit teardown.
 */
function observeSplitRedraw(original: SVGPathElement, resync: () => void): void {
  const observer = new MutationObserver(resync);
  observer.observe(original, { attributes: true, attributeFilter: ['d'] });
}

/**
 * Returns the (x, y) midpoint of an SVG path subpath by averaging all
 * coordinate pairs found in the substring. Robust to optional whitespace,
 * negative values, and decimals.
 */
function subpathMidpoint(subpath: string): { x: number; y: number } | null {
  const nums = subpath.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length < 2) {
    return null;
  }
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    sumX += nums[i];
    sumY += nums[i + 1];
    count++;
  }
  return count > 0 ? { x: sumX / count, y: sumY / count } : null;
}

function convertHeatmapSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  // Read categories from the series' OWN axes (not chart.xAxis[0]/yAxis[0])
  // so heatmaps bound to secondary/pane axes get the right labels.
  const xCategories = series.xAxis?.categories ?? [];
  const yCategories = series.yAxis?.categories ?? [];

  // Determine grid dimensions. If numeric axes are used, infer from data.
  let rows = yCategories.length;
  let cols = xCategories.length;

  if (rows === 0 || cols === 0) {
    // Numeric axes — determine grid size from actual data indices.
    let maxX = 0;
    let maxY = 0;
    for (const p of series.data) {
      if (p.y !== null) {
        maxX = Math.max(maxX, Math.round(p.x));
        maxY = Math.max(maxY, Math.round(p.y));
      }
    }
    if (cols === 0)
      cols = maxX + 1;
    if (rows === 0)
      rows = maxY + 1;
  }

  // Build 2D points grid: points[y][x]. Every cell starts absent rather than
  // zero — the grid is a rectangle and the series need not fill it, and a hole
  // left as 0 is announced as a reading the chart never drew (#1191).
  const points: (number | null)[][] = Array.from({ length: rows }, () =>
    Array.from<number | null>({ length: cols }).fill(null));

  for (const p of series.data) {
    if (p.y === null)
      continue;

    const xIdx = Math.round(p.x);
    const yIdx = Math.round(p.y);
    if (yIdx < 0 || yIdx >= rows || xIdx < 0 || xIdx >= cols)
      continue;

    // Heatmap cell value lives in `point.options.value` (colorAxis metric).
    // Falls back to the point's `value` property if available.
    const opts = p.options ?? {};
    const cellValue = typeof opts.value === 'number'
      ? opts.value
      : (typeof opts.colorValue === 'number' ? opts.colorValue : null);

    // A point whose colour metric is missing is still a drawn cell, so it
    // stays absent rather than becoming a zero — the same distinction the
    // grid is initialised with.
    points[yIdx][xIdx] = cellValue;
  }

  // {@link HeatmapData} runs top-first and left-first, so each axis is asked
  // the same question: does Highcharts already draw its index 0 at that end?
  //
  // The two answers are opposite for the *same* chart, because Highcharts
  // numbers a y axis from the bottom and an x axis from the left. So an
  // unreversed y has to be turned over — `points[0]`, the row it calls y index
  // 0, is the bottom one (#973) — while an unreversed x is already the way
  // round the payload wants, and it is the *reversed* x that has to move
  // (#1008). Asking both here rather than one at each site is what stops the
  // second axis being forgotten, which is how #1008 outlived #973.
  const topFirst = isReversedAxis(series.yAxis);
  const leftFirst = !isReversedAxis(series.xAxis);

  const xLabels = xCategories.length > 0
    ? xCategories
    : Array.from({ length: cols }, (_, i) => String(i));
  const yLabels = yCategories.length > 0
    ? yCategories
    : Array.from({ length: rows }, (_, i) => String(i));

  const byRow: (number | null)[][] = topFirst ? points : [...points].reverse();

  const data: HeatmapData = {
    x: leftFirst ? xLabels : [...xLabels].reverse(),
    y: topFirst ? yLabels : [...yLabels].reverse(),
    points: leftFirst ? byRow : byRow.map(row => [...row].reverse()),
  };

  // Stamp `data-maidr-row` / `data-maidr-col` onto each rendered cell using
  // the user-supplied (x, y) grid indices. This makes the selector→cell
  // mapping independent of Highcharts' DOM insertion order (which may be
  // row- or column-major depending on how `series.data` was provided).
  stampHeatmapIndices(series);

  return {
    id: String(series.index),
    type: TraceType.HEATMAP,
    title: series.name || undefined,
    selectors: heatmapSelectors(containerId, series.index, rows, cols, topFirst, leftFirst),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Stamps each rendered heatmap cell with `data-maidr-row` / `data-maidr-col`
 * attributes derived from its (x, y) grid indices.
 *
 * Highcharts emits heatmap cells in `series.data` order, which depends on
 * how the user supplied the data (row-major, column-major, or arbitrary).
 * Rather than rely on positional DOM ordering, we use each point's `.graphic`
 * reference (set by Highcharts during render) to attach unambiguous
 * coordinate attributes that selectors can target directly.
 *
 * Cells without a rendered `graphic` (e.g. null data points) are skipped.
 *
 * Idempotent: re-stamping overwrites existing attributes.
 */
function stampHeatmapIndices(series: HighchartsSeries): void {
  for (const point of series.data) {
    const element = point.graphic?.element;
    if (!element) {
      continue;
    }
    const xIdx = Math.round(point.x);
    const yIdx = typeof point.y === 'number' ? Math.round(point.y) : null;
    if (yIdx === null) {
      continue;
    }
    element.setAttribute('data-maidr-col', String(xIdx));
    element.setAttribute('data-maidr-row', String(yIdx));
  }
}

/**
 * What a hexbin's third dimension is called. A tile's magnitude is bound to
 * the colour axis rather than to x or y, so {@link getAxisLabel} has nothing
 * to read it from, and MAIDR's own fallback names it "Level".
 */
const HEXBIN_COUNT_AXIS = 'Count';

/**
 * Converts a `tilemap` series into a hexbin layer.
 *
 * A tilemap is a heatmap whose tiles tessellate, and every shape but `square`
 * staggers: `TilemapShapes.hexagon.translate` shifts every odd **column** by
 * half a row so the hexagons interlock. That stagger is what separates this
 * from a heatmap — a lattice row is not a straight line of cells — and it is
 * what {@link TraceType.HEXBIN} is navigated by.
 *
 * Two things this reading is honest about.
 *
 * **Highcharts never binned anything.** The tiles are supplied pre-binned, so
 * a bin's "count" is whatever magnitude the author gave the tile. A tile with
 * no value counts as zero, which is what an empty bin is; Highcharts still
 * draws it, so dropping it would slide every later bin's highlight onto its
 * neighbour.
 *
 * **The centres are the authored ones.** The half-row shift is applied in
 * pixel space during `translate` and never reaches the point, so the tile at
 * `(3, 2)` still belongs to row 2 in every other reading of the chart — the
 * tooltip's included. Announcing a shifted 1.5 would put the bin at a
 * coordinate nothing else on the page agrees with.
 *
 * The bins are grouped into rows by their y and ordered along x within each,
 * because that is the lattice MAIDR walks; rows run in drawn order, so
 * "up" is up on a reversed axis too. `x` stays numeric even where the axis
 * carries categories: `HexbinTrace` resolves a vertical move by x distance,
 * and a category label would make every one of them land on the first bin of
 * the row.
 */
function convertHexbinSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer {
  const yCategories = series.yAxis?.categories ?? [];

  // Group the tiles into lattice rows, then order each row along x. Highcharts
  // draws them in `series.data` order, which a tilemap is routinely authored
  // in some other order entirely — a honeycomb map is declared country by
  // country.
  const byRow = new Map<number, HighchartsPoint[]>();
  for (const point of series.data) {
    if (typeof point.y !== 'number') {
      continue;
    }
    const row = Math.round(point.y);
    const tiles = byRow.get(row);
    if (tiles) {
      tiles.push(point);
    } else {
      byRow.set(row, [point]);
    }
  }

  // Row 0 is the bottom of the lattice, which is where MAIDR's "up" moves away
  // from — so a reversed y axis, the way a honeycomb map is usually drawn,
  // orders the rows the other way.
  const ascending = !isReversedAxis(series.yAxis);
  const rows = [...byRow.keys()]
    .sort((a, b) => (ascending ? a - b : b - a))
    .map(row => (byRow.get(row) ?? []).slice().sort((a, b) => a.x - b.x));

  const data: HexbinPoint[][] = rows.map(tiles => tiles.map(point => ({
    x: point.x,
    y: yCategories[Math.round(point.y as number)] ?? (point.y as number),
    count: tileValue(point),
  })));

  stampHexbinIndices(rows);

  return {
    id: String(series.index),
    type: TraceType.HEXBIN,
    title: series.name || undefined,
    selectors: hexbinSelectors(containerId, series.index, rows.flat().length),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
      z: { label: HEXBIN_COUNT_AXIS },
    },
    data,
  };
}

/**
 * The magnitude a tilemap tile carries.
 *
 * A tilemap declares `value` in its `pointArrayMap` rather than using `y`, so
 * Highcharts resolves it onto the point; the options are read as a fallback
 * for the partially built chart objects the adapter is sometimes handed.
 *
 * @param point - The tile to read
 * @returns Its value, or zero when it declares none
 */
function tileValue(point: HighchartsPoint): number {
  if (typeof point.value === 'number') {
    return point.value;
  }
  const options = point.options ?? {};
  if (typeof options.value === 'number') {
    return options.value;
  }
  return typeof options.colorValue === 'number' ? options.colorValue : 0;
}

/**
 * Stamps each rendered tile with `data-maidr-bin-index`, its position in the
 * lattice order MAIDR slices its selectors by.
 *
 * `TilemapSeries#drawPoints` runs the column point-drawing pass over
 * `series.points`, so the DOM follows declaration order — which for a tilemap
 * is whatever order the author listed the tiles in, and not the row-by-row
 * order `HexbinTrace` reads. A tile Highcharts did not draw has no element to
 * stamp, so its selector matches nothing and the layer's highlighting is
 * withdrawn rather than shifted onto its neighbours.
 *
 * Idempotent: re-stamping overwrites existing attributes.
 *
 * @param rows - The Highcharts points, grouped into lattice rows
 */
function stampHexbinIndices(rows: HighchartsPoint[][]): void {
  stampPointIndices(rows, 'data-maidr-bin-index');
}

/**
 * What a choropleth's two dimensions are called. A `map` series is bound to no
 * axis a title could be read from — the value runs along a colour axis and the
 * regions along nothing at all — so {@link getAxisLabel}'s `'X'` / `'Y'`
 * fallback would name them after coordinates the chart does not have.
 */
/** What a map marker's own coordinates are called when it has no other axis. */
const MAP_LONGITUDE_AXIS = 'Longitude';
const MAP_LATITUDE_AXIS = 'Latitude';

/**
 * Converts a `mappoint` series into a layer of named places.
 *
 * A map point is a marker put on a map at a stated position and given a name,
 * and that is the whole of its data: measured on Highcharts 13.0.1, a point
 * declared `{name, lat, lon}` comes back carrying exactly those three and an
 * `x` that is its index in the series -- **no `y` at all**, because nothing
 * about it is a magnitude.
 *
 * That is why it is a scatter rather than the choropleth its `mapbubble`
 * sibling reads as. `ChoroplethPoint.y` is the value the region is shaded by
 * and is required; a map point has none, and the only ways to give it one are
 * to invent a constant or to promote its index, both of which announce a
 * measurement the chart never made. Read as a scatter of degrees, every
 * number announced is one the chart states, and the place name travels on
 * `ScatterPoint.label` -- the field whose whole purpose is "this point is
 * Norway" rather than "this slot is called Norway".
 *
 * @param series - The `mappoint` series
 * @param containerId - The chart container's id, for the selector
 * @returns The layer, or null when no marker states a position
 */
function convertMapPointSeries(
  series: HighchartsSeries,
  containerId: string,
): MaidrLayer | null {
  const data: ScatterPoint[] = [];
  series.data.forEach((point) => {
    const placed = degreesPair(point.lon, point.lat);
    if (!placed) {
      return;
    }
    const name = mapRegionName(point);
    data.push({
      x: placed.lon,
      y: placed.lat,
      ...(typeof name === 'string' && name !== '' ? { label: name } : {}),
    });
  });

  // A series whose markers are placed in projected units rather than in
  // degrees states nothing this can announce, and a layer of no points is the
  // phantom row #421 describes -- one the reader can navigate into and which
  // can say nothing. Declining leaves the rest of the chart readable, and it
  // says so: a silent decline is indistinguishable from a bug to whoever
  // drew the chart.
  if (data.length === 0) {
    console.warn(
      '[MAIDR Highcharts] A "mappoint" series placed no marker by `lat`/`lon`; '
      + 'its positions are in the map\'s projected units, which are not degrees. '
      + 'Skipping the series rather than announcing them as coordinates.',
    );
    return null;
  }

  return {
    id: String(series.index),
    type: TraceType.SCATTER,
    title: series.name || undefined,
    selectors: scatterSelector(containerId, series.index),
    axes: {
      x: { label: MAP_LONGITUDE_AXIS },
      y: { label: MAP_LATITUDE_AXIS },
    },
    data,
  };
}

const CHOROPLETH_REGION_AXIS = 'Region';
const CHOROPLETH_VALUE_AXIS = 'Value';

/**
 * Converts a `map` series into a choropleth layer.
 *
 * This one needs no declaration. `map` is the Highmaps choropleth series and
 * nothing else wears its name: `mapbubble` and `mappoint` are different charts
 * under different names, and are deliberately not routed here.
 *
 * **The centroids are what make it a map rather than a bar chart whose
 * categories happen to be places.** `ChoroplethTrace` walks north, south, east
 * and west out of a longitude and a latitude in **degrees**, and the grammar
 * takes nothing else: a projected or normalised coordinate announced as a
 * degree is a wrong compass direction, which is worse than the region list the
 * grammar explicitly sanctions when the pair is missing. So they are read from
 * the three places that state them in degrees and from nowhere else —
 * see {@link mapCentroid} — and omitted otherwise.
 *
 * `neighbors` is not emitted at all. Adjacency is not derivable from a
 * rendered map: Highcharts knows which shapes it drew, not which of them share
 * a border, and centroids do not answer it either. The trace keeps its spatial
 * walk and is told nothing about borders rather than something guessed.
 *
 * A region Highcharts drew but gave no value is left out — the layer's value
 * is a number and a null region has none — so the announced regions are
 * stamped with their own index and the selectors address the stamp, rather
 * than counting on the drawn shapes and the announced regions being the same
 * list.
 *
 * @param series - The `map` series
 * @param chart - The chart being converted, for the map view
 * @param containerId - The chart's render-target id
 * @returns The choropleth layer
 */
function convertChoroplethSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
  sizeIsValue = false,
): MaidrLayer {
  const declared = declarationOf(series);
  const declaration: ChoroplethDeclaration | undefined
    = declared?.type === TraceType.CHOROPLETH ? declared : undefined;

  // The name and the value are read off the point Highcharts already resolved
  // them onto, and the declaration only renames them. The default fallback
  // chain is not walked for either: a `map` series states both for itself, and
  // a chain consulted over the top of that could only disagree with what
  // Highcharts drew.
  const names = declaration?.region === undefined
    ? undefined
    : readSeriesField(series, declaration.region, 'region');
  const values = declaration?.value === undefined
    ? undefined
    : readSeriesField(series, declaration.value, 'value');
  const lons = readSeriesField(series, declaration?.lon, 'lon');
  const lats = readSeriesField(series, declaration?.lat, 'lat');

  const announced: HighchartsPoint[] = [];
  const data: ChoroplethPoint[] = [];
  series.data.forEach((point, index) => {
    const y = finiteNumber(values?.[index]) ?? mapValue(point, sizeIsValue);
    if (y === undefined) {
      return;
    }

    const centroid = mapCentroid(point, chart);
    const lon = degrees(lons[index], 180) ?? centroid?.lon;
    const lat = degrees(lats[index], 90) ?? centroid?.lat;

    announced.push(point);
    data.push({
      x: regionName(names?.[index]) ?? mapRegionName(point),
      y,
      ...(lon === undefined ? {} : { lon }),
      ...(lat === undefined ? {} : { lat }),
    });
  });

  stampPointIndices([announced], 'data-maidr-region-index');

  return {
    id: String(series.index),
    type: TraceType.CHOROPLETH,
    title: declaration?.title ?? (series.name || undefined),
    ...(declaration?.name ? { name: declaration.name } : {}),
    selectors: choroplethSelectors(containerId, series.index, data.length),
    axes: {
      x: { label: CHOROPLETH_REGION_AXIS },
      y: { label: CHOROPLETH_VALUE_AXIS },
    },
    data,
  };
}

/**
 * The value a map region is shaded by.
 *
 * A `map` series declares `value` in its `pointArrayMap` rather than using
 * `y`, so Highcharts resolves it onto the point; `y` and the raw options are
 * read as fallbacks for the partially built chart objects the adapter is
 * sometimes handed.
 *
 * @param point - The region to read
 * @returns Its value, or undefined for a region the chart shades as null
 */
function mapValue(point: HighchartsPoint, sizeIsValue: boolean): number | undefined {
  // A map bubble's magnitude is its marker size, which Highcharts names `z`.
  // First rather than last, and only for that series: a bubble placed by
  // `lat`/`lon` carries no `y` at all, but one placed in the map's projected
  // units carries `y` as a **position** -- measured, `{name: 'A', x: 10,
  // y: 20, z: 3}` announced 20 where the chart sizes the bubble by 3. A
  // position read as a measurement is the failure #814 names, and the field
  // order is the whole of what prevents it.
  if (sizeIsValue) {
    const size = finiteNumber(point.z);
    if (size !== undefined) {
      return size;
    }
  }
  return finiteNumber(point.value)
    ?? finiteNumber(point.y)
    ?? finiteNumber(point.options?.value);
}

/**
 * What a map region is called.
 *
 * `name` first, because that is where Highcharts puts the label it joined the
 * point to its map feature by; the category and the bare x are the fallbacks
 * for a series that supplied neither.
 *
 * @param point - The region to read
 * @returns Its name
 */
function mapRegionName(point: HighchartsPoint): string | number {
  return point.name ?? point.category ?? point.x;
}

/**
 * A declared region name, when the field held one MAIDR can announce.
 *
 * @param value - Whatever the `region` field resolved to
 * @returns The name, or undefined
 */
function regionName(value: unknown): string | number | undefined {
  if (typeof value === 'string' && value !== '') {
    return value;
  }
  return finiteNumber(value);
}

/**
 * A value, when it is a coordinate in degrees.
 *
 * The bound is what makes this more than a number check: it is the one test
 * that separates degrees from the projected units the same fields could be
 * carrying, and a coordinate that fails it is dropped rather than converted by
 * guesswork.
 *
 * @param value - Whatever was resolved
 * @param limit - 180 for a longitude, 90 for a latitude
 * @returns The coordinate, or undefined
 */
/**
 * A longitude and latitude, when both are present and both are degrees.
 *
 * Both or neither: half a coordinate places nothing, and a point carrying one
 * of the two is better read as having none than as sitting on the prime
 * meridian.
 *
 * @param lon - Whatever the longitude field held
 * @param lat - Whatever the latitude field held
 * @returns The pair, or undefined
 */
function degreesPair(
  lon: unknown,
  lat: unknown,
): { lon: number; lat: number } | undefined {
  const east = degrees(lon, 180);
  const north = degrees(lat, 90);
  if (east === undefined || north === undefined) {
    return undefined;
  }
  return { lon: east, lat: north };
}

function degrees(value: unknown, limit: number): number | undefined {
  const coordinate = finiteNumber(value);
  return coordinate === undefined || Math.abs(coordinate) > limit ? undefined : coordinate;
}

/**
 * Where a map region sits, in degrees.
 *
 * Two sources, both of which state degrees outright:
 *
 * 1. The map feature's own `hc-middle-lon` / `hc-middle-lat`, which some of
 *    the Highcharts map collections carry alongside the shape.
 * 2. The map view's `projectedUnitsToLonLat`, applied to the anchor Highcharts
 *    placed the shape's label at. This is the documented way back through the
 *    projection, and it answers with nothing on a map that has no geographic
 *    projection — which is the answer MAIDR wants there, since a pre-projected
 *    map's units are not degrees.
 *
 * Both readings go through {@link degrees}, so a number arriving from either
 * that could not be a coordinate is dropped instead of announced. A region
 * with no centroid simply has none: `ChoroplethTrace` keeps the declared order
 * unless *every* region is placed, which is the reading the data supports.
 *
 * @param point - The region to place
 * @param chart - The chart holding the map view
 * @returns The centroid, or undefined
 */
function mapCentroid(
  point: HighchartsPoint,
  chart: HighchartsChart,
): { lon: number; lat: number } | undefined {
  // A marker that states its own position is already in degrees, and it is
  // the only thing that knows: `mappoint` and `mapbubble` join to no map
  // feature, so `properties` is empty and `bounds` unset, and both fall
  // through everything below to `undefined`.
  const declared = degreesPair(point.lon, point.lat);
  if (declared) {
    return declared;
  }

  const properties = point.properties;
  if (properties) {
    const lon = degrees(properties['hc-middle-lon'], 180);
    const lat = degrees(properties['hc-middle-lat'], 90);
    if (lon !== undefined && lat !== undefined) {
      return { lon, lat };
    }
  }

  const bounds = point.bounds;
  const toLonLat = chart.mapView?.projectedUnitsToLonLat;
  if (!bounds || !toLonLat) {
    return undefined;
  }
  const projected = toLonLat({
    x: bounds.midX ?? (bounds.x1 + bounds.x2) / 2,
    y: bounds.midY ?? (bounds.y1 + bounds.y2) / 2,
  });
  if (!projected) {
    return undefined;
  }

  const [lon, lat] = Array.isArray(projected)
    ? projected
    : [projected.lon, projected.lat];
  const east = degrees(lon, 180);
  const north = degrees(lat, 90);
  return east === undefined || north === undefined ? undefined : { lon: east, lat: north };
}

function convertHistogramSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer {
  // A histogram has no sideways series type of its own the way a column has
  // `bar`, so `inverted` is the whole of the question here -- and it is the
  // same question `convertBarGroup` asks. Highcharts keeps the bin on `x` and
  // the count on `y` whichever way it draws them, so the payload has to be
  // transposed for the horizontal reading rather than merely labelled as one:
  // `Histogram` takes the bin bounds from `yMin`/`yMax` and the count from
  // `x` when the layer says `horz` (#997 did this for the bar family).
  const isHorizontal = chart.options.chart?.inverted === true;

  const data: HistogramPoint[] = series.data
    .filter(p => p.y !== null)
    .map((p) => {
      const opts = p.options ?? {};
      // Highcharts histogram points have `x` (bin start) and `x2` (bin end).
      const binStart = typeof opts.x === 'number' ? opts.x : p.x;
      const binEnd = typeof opts.x2 === 'number' ? opts.x2 : binStart;
      const count = p.y as number;
      return isHorizontal
        ? {
            x: count,
            y: pointLabel(p),
            xMin: 0,
            xMax: count,
            yMin: binStart as number,
            yMax: binEnd as number,
          }
        : {
            x: pointLabel(p),
            y: count,
            xMin: binStart as number,
            xMax: binEnd as number,
            yMin: 0,
            yMax: count,
          };
    });

  return {
    id: String(series.index),
    type: TraceType.HISTOGRAM,
    title: series.name || undefined,
    ...(isHorizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    selectors: histogramSelector(containerId, series.index),
    // The value axis is `yAxis` in both orientations, so the labels are
    // swapped with the pair they name -- the same swap `barAxes` makes.
    axes: barAxes(series, isHorizontal),
    data,
  };
}

/**
 * Converts a Highcharts candlestick or OHLC series into MAIDR CandlestickPoint data.
 */
function convertCandlestickSeries(
  series: HighchartsSeries,
  chart: HighchartsChart,
  containerId: string,
): MaidrLayer {
  // The close is what every price series in this family carries; the open is
  // not. `hlc` draws the same high, low and close without one -- measured,
  // `{"x":0,"y":3,"low":1,"high":5,"close":3}` and no `open` at all -- so
  // filtering on the open declined a real chart, and defaulting it would have
  // announced an opening price the series never recorded. `CandlestickPoint`
  // declares it optional for exactly this (#1188).
  const data: CandlestickPoint[] = series.data
    .filter(p => p.close != null)
    .map((p) => {
      const open = p.open ?? undefined;
      const close = p.close!;
      const high = p.high ?? Math.max(open ?? close, close);
      const low = p.low ?? Math.min(open ?? close, close);

      let trend: CandlestickTrend | undefined;
      if (open !== undefined) {
        trend = close > open ? 'Bull' : close < open ? 'Bear' : 'Neutral';
      }

      return {
        value: p.category ?? p.name ?? String(p.x),
        ...(open === undefined ? {} : { open }),
        high,
        low,
        close,
        volume: typeof p.options?.volume === 'number' ? p.options.volume : 0,
        trend,
        volatility: high - low,
      };
    });

  // Stamp each rendered `<path class="highcharts-point">` with a stable index
  // and split its three internal subpaths into separate body/upper-wick/
  // lower-wick `<path>` siblings so per-section selectors can target them.
  stampCandlestickIndices(chart, containerId, series.index, data.length);

  return {
    id: String(series.index),
    type: TraceType.CANDLESTICK,
    title: series.name || undefined,
    selectors: candlestickSelectors(containerId, series.index, data.length),
    axes: {
      x: getAxisLabel(series, 'x'),
      y: getAxisLabel(series, 'y'),
    },
    data,
  };
}

/**
 * Adds `data-maidr-candle-index="N"` to each rendered candlestick path and
 * splits its compound `d` attribute into three separate `<path>` siblings
 * (body, upper-wick, lower-wick) so MAIDR can highlight each section
 * independently.
 *
 * Idempotent: re-running overwrites existing index attributes; the split
 * step bails out if it detects the original was already processed.
 */
function stampCandlestickIndices(
  chart: HighchartsChart,
  containerId: string,
  seriesIndex: number,
  expectedCount: number,
): void {
  const container = chart.renderTo ?? document.getElementById(containerId);
  if (!container) {
    console.warn(`[MAIDR Highcharts] Candlestick stamping: container "${containerId}" not found.`);
    return;
  }

  // Highcharts emits each candle as a `<path class="highcharts-point">`
  // directly under the series group (no wrapping `<g>` like boxplot).
  const selector = `.highcharts-series-group .highcharts-series-${seriesIndex} path.highcharts-point`;
  const paths = container.querySelectorAll<SVGPathElement>(selector);

  if (paths.length !== expectedCount) {
    console.warn(
      `[MAIDR Highcharts] Candlestick series ${seriesIndex}: expected ${expectedCount} `
      + `candle paths but found ${paths.length} in DOM. Highlight may not work.`,
    );
  }

  paths.forEach((path, i) => {
    path.removeAttribute('data-maidr-candle-index');
    path.setAttribute('data-maidr-candle-index', String(i));
    splitCandlestickPath(path, i);
  });
}

/**
 * Splits a Highcharts candlestick `<path>` element into three separate `<path>`
 * siblings (one per visual section) so MAIDR can highlight `body`, `wickHigh`,
 * and `wickLow` independently.
 *
 * Highcharts renders a single candle as one `<path>` with three subpaths in
 * the `d` attribute:
 *   - Body: a rectangle traced with four `L` commands and closed by `Z`.
 *   - Upper wick: short vertical line above the body (one M + one L, no Z).
 *   - Lower wick: short vertical line below the body (one M + one L, no Z).
 *
 * The body is identified by the presence of `Z` (closepath). The remaining
 * two subpaths are classified by midpoint Y (smaller Y = upper, since SVG
 * Y grows downward).
 *
 * After splitting:
 *   - Three new `<path>` siblings are inserted after the original, each
 *     carrying `data-maidr-candle-part="body" | "upper-wick" | "lower-wick"`
 *     (plus the inherited `data-maidr-candle-index`).
 *   - The original loses its `highcharts-point` class and is marked
 *     `data-maidr-split-original` so future class-only queries skip it.
 *
 * Idempotent: re-running on an already-split path is a no-op.
 */
function splitCandlestickPath(original: SVGPathElement, candleIndex: number): void {
  if (original.hasAttribute('data-maidr-split-original')) {
    return;
  }

  const d = original.getAttribute('d');
  if (!d) {
    console.warn(`[MAIDR Highcharts] Candlestick path ${candleIndex} has no 'd' attribute; skipping split.`);
    return;
  }

  const parts = computeCandlestickParts(d);
  if (!parts) {
    console.warn(
      `[MAIDR Highcharts] Candlestick path ${candleIndex} could not be split `
      + `(expected 3 subpaths with a body and computable wick midpoints); skipping split.`,
    );
    return;
  }

  const cloneSubpath = (dValue: string, part: 'body' | 'upper-wick' | 'lower-wick'): SVGPathElement => {
    const clone = original.cloneNode(true) as SVGPathElement;
    clone.setAttribute('d', dValue);
    clone.setAttribute('data-maidr-candle-part', part);
    // Strip the identifying class from the clone so re-running
    // `stampCandlestickIndices` never matches or renumbers it; the attribute
    // selector still targets it via `data-maidr-candle-part`.
    clone.classList.remove('highcharts-point');
    return clone;
  };

  const bodyPath = cloneSubpath(parts.body, 'body');
  const upperPath = cloneSubpath(parts.upper, 'upper-wick');
  const lowerPath = cloneSubpath(parts.lower, 'lower-wick');

  // afterend inserts in reverse, so insert lower → upper → body to end with
  // [original, body, upper, lower] (visual stacking preserved).
  original.insertAdjacentElement('afterend', lowerPath);
  original.insertAdjacentElement('afterend', upperPath);
  original.insertAdjacentElement('afterend', bodyPath);

  // Strip the identifying class so subsequent `.highcharts-point` queries
  // skip the now-superseded original. Keep it in the DOM (and visible) so
  // Highcharts' internal references stay valid; the new paths render the
  // same shapes on top.
  original.classList.remove('highcharts-point');
  original.setAttribute('data-maidr-split-original', 'true');

  // Keep the cloned sections in sync when Highcharts rewrites the original's
  // `d` on redraw (resize/reflow/update), otherwise the clones go stale.
  observeSplitRedraw(original, () => {
    const currentD = original.getAttribute('d');
    if (!currentD)
      return;
    const next = computeCandlestickParts(currentD);
    if (!next)
      return;
    bodyPath.setAttribute('d', next.body);
    upperPath.setAttribute('d', next.upper);
    lowerPath.setAttribute('d', next.lower);
  });
}

/**
 * Classifies a Highcharts candlestick path's three subpaths into `body`,
 * `upper` wick, and `lower` wick `d` strings. The body is the only subpath with
 * a closepath (`Z`) command; the remaining two are ordered by midpoint Y
 * (smaller Y = upper, since SVG Y grows downward). Returns `null` when the path
 * does not contain exactly three subpaths with a body and computable midpoints.
 */
function computeCandlestickParts(
  d: string,
): { body: string; upper: string; lower: string } | null {
  // Highcharts uses uppercase commands; each subpath starts with a fresh M.
  const subpaths = d.match(/M[^M]*/g);
  if (!subpaths || subpaths.length !== 3) {
    return null;
  }

  // The body is the only subpath with a closepath command.
  const bodyIdx = subpaths.findIndex(sp => /z/i.test(sp));
  if (bodyIdx === -1) {
    return null;
  }

  const wickIndices = [0, 1, 2].filter(i => i !== bodyIdx);
  const m0 = subpathMidpoint(subpaths[wickIndices[0]]);
  const m1 = subpathMidpoint(subpaths[wickIndices[1]]);
  if (!m0 || !m1) {
    return null;
  }

  // SVG y grows downward → smaller y is visually upper.
  const upperWickIdx = m0.y < m1.y ? wickIndices[0] : wickIndices[1];
  const lowerWickIdx = upperWickIdx === wickIndices[0] ? wickIndices[1] : wickIndices[0];

  return {
    body: subpaths[bodyIdx].trim(),
    upper: subpaths[upperWickIdx].trim(),
    lower: subpaths[lowerWickIdx].trim(),
  };
}
