/**
 * The ECharts series that carry one magnitude per named thing.
 *
 * A pie, a funnel and a gauge share a shape the cartesian series do not: no
 * axes, one series to a chart, and a datum that is a name and a number rather
 * than a position and a magnitude. `data.dimensions` is `['value']` for all
 * three -- measured on echarts 6.1.0 -- and `getName(i)` carries the label,
 * so the whole reading is that pair.
 *
 * Tier 2a of #1195. The statistical and grid shapes -- `boxplot`,
 * `candlestick`, `heatmap`, `radar` -- are the same measurement exercise with
 * a different summary at the end of it, and each wants its selector shape
 * established against the trace that reads it before it claims to be
 * highlightable, which is what tier 1 learned the hard way (#1196).
 */

import type { BarPoint, GaugePoint, MaidrLayer, PiePoint } from '@type/grammar';
import type { EChartsSeriesModel } from './types';
import { Orientation, TraceType } from '@type/grammar';
import { nextId } from '../shared/selectorUtil';
import { markPerDatum } from './selectors';

/** One datum: what it is called, and what it measures. */
interface Reading {
  name: string;
  value: number;
}

/** The series types this module reads. */
export const SINGLE_VALUE: ReadonlySet<string> = new Set([
  'pie',
  'funnel',
  'gauge',
]);

/**
 * What the label and value of one datum are.
 *
 * @param seriesModel - The series to read
 * @returns One `{ name, value }` per datum that carries a number
 */
function readValues(seriesModel: EChartsSeriesModel): Reading[] {
  const data = seriesModel.getData();
  const dimension = data.dimensions[0] ?? 'value';
  const read: Reading[] = [];

  for (let index = 0; index < data.count(); index++) {
    const value = data.get(dimension, index);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    read.push({ name: data.getName(index), value });
  }
  return read;
}

/**
 * Builds the layers for one pie, funnel or gauge series.
 *
 * A pie and a funnel are one layer each; a gauge is one **per pointer**.
 * ECharts draws a pointer for every entry in a gauge's `data` -- measured, a
 * two-entry gauge reports `count() === 2` and puts two needles on one dial --
 * and `GaugePoint` is a single reading, so two of them are two layers rather
 * than one reading and one silently dropped. What that loses is that they
 * share a dial; nothing in the grammar carries it, and both min and max come
 * out the same on each, which is as close as it gets.
 *
 * @param seriesModel - The series to read
 * @param container   - The element the chart was rendered into
 * @returns The layers, empty when the series drew no reading
 */
export function singleValueLayers(
  seriesModel: EChartsSeriesModel,
  container: HTMLElement,
): MaidrLayer[] {
  const read = readValues(seriesModel);
  if (read.length === 0) {
    return [];
  }

  if (seriesModel.subType === 'gauge') {
    return read.map(one => gaugeLayer(seriesModel, one));
  }

  // A pie and a funnel each draw exactly one filled mark per datum --
  // measured: three slices are three filled paths, and the three unfilled
  // ones beside them are the label guides, which the paint filter already
  // declines.
  const marks = markPerDatum(container, [read.length]);

  return [
    seriesModel.subType === 'pie'
      ? pieLayer(seriesModel, read, marks?.series[0])
      : funnelLayer(seriesModel, read, marks?.points[0]),
  ];
}

/**
 * A pie, whose slices are named and measured.
 *
 * `PieTrace` reads `layer.selectors` as a single string, so the slices are
 * named together rather than one at a time -- the shape a scatter needs for
 * the same reason (#1196).
 *
 * @param seriesModel - The series to read
 * @param read        - Its labelled values
 * @param selectors   - One selector naming every slice, when they were found
 * @returns The layer
 */
function pieLayer(
  seriesModel: EChartsSeriesModel,
  read: Reading[],
  selectors: string | undefined,
): MaidrLayer {
  const data: PiePoint[] = read.map(({ name, value }, index) => ({
    x: name || `Slice ${index + 1}`,
    y: value,
  }));
  const name = authored(seriesModel);

  return {
    id: nextId('layer'),
    type: TraceType.PIE,
    ...(name ? { name } : {}),
    ...(selectors ? { selectors } : {}),
    data,
  };
}

/**
 * A funnel, whose stages stay in the order the chart drew them.
 *
 * The order is the reading: MAIDR pitches each stage against the one before
 * it, so retention is what a listener hears. `FunnelTrace` extends
 * `BarTrace`, which takes one selector per mark.
 *
 * @param seriesModel - The series to read
 * @param read        - Its labelled values
 * @param selectors   - One selector per stage, when the marks were found
 * @returns The layer
 */
/**
 * What a funnel's two dimensions are called. A funnel series sits on no axis,
 * so there is no axis name to read and the core's `X` / `Y` fallback would
 * name the stage and its count after coordinates the chart does not have.
 */
const FUNNEL_STAGE_AXIS = 'Stage';
const FUNNEL_COUNT_AXIS = 'Count';

function funnelLayer(
  seriesModel: EChartsSeriesModel,
  read: Reading[],
  selectors: string[] | undefined,
): MaidrLayer {
  // ECharts' `orient` and MAIDR's `orientation` name two different directions,
  // and on a funnel they are opposites -- deliberately, and this is the whole
  // reason the mapping is spelled out here.
  //
  // ECharts names the direction the STAGES progress. MAIDR names the direction
  // the MAGNITUDE runs, which is the convention a "horizontal bar chart" is
  // named by and the one `MaidrLayer.orientation` is written against: `horz`
  // means the value is in `x`. Measured in Chromium on echarts 5, values
  // 100/60/20:
  //
  //   orient: 'vertical' (default)   heights 80, 80, 80   widths 360, 216, 72
  //   orient: 'horizontal'           widths 120,120,120   heights 240,144,48
  //
  // The default stacks its stages down the page with uniform band heights and
  // encodes the value as the band's WIDTH, so the magnitude runs horizontally
  // and the layer is `horz`. `orient: 'horizontal'` is the transpose of that,
  // and is the one MAIDR calls vertical.
  const horizontal = seriesModel.get('orient') !== 'horizontal';

  const data: BarPoint[] = read.map(({ name, value }, index) => {
    const stage = name || `Stage ${index + 1}`;
    // `FunnelTrace` extends `BarTrace`, so a horizontal layer carries its
    // magnitude in `x` -- the exchange the grammar's table calls for.
    return horizontal ? { x: value, y: stage } : { x: stage, y: value };
  });
  const name = authored(seriesModel);

  return {
    id: nextId('layer'),
    type: TraceType.FUNNEL,
    ...(name ? { name } : {}),
    ...(horizontal ? { orientation: Orientation.HORIZONTAL } : {}),
    ...(selectors ? { selectors } : {}),
    // A funnel is bound to no axis, so without these the reader is told the
    // stage's count is "X". Named in the order the payload puts them, so
    // `axes.x` is whichever axis the point's `x` lies on.
    axes: horizontal
      ? { x: { label: FUNNEL_COUNT_AXIS }, y: { label: FUNNEL_STAGE_AXIS } }
      : { x: { label: FUNNEL_STAGE_AXIS }, y: { label: FUNNEL_COUNT_AXIS } },
    data,
  };
}

/**
 * A gauge, which is one reading against the dial it sits on.
 *
 * `min` and `max` are asked of the series rather than defaulted here:
 * `getModel()` resolves ECharts' own `0` and `100` when the author wrote
 * neither, measured, so the dial the reader is told about is the dial that
 * was drawn.
 *
 * **No selectors.** A gauge draws two filled marks for its one datum -- the
 * track and the progress arc, measured as `#e8ebf0` and the series colour --
 * so the count check that every other reading here relies on has nothing to
 * check: there is no arrangement in which one datum and two marks agree.
 * Naming either one would be a guess about which the reader should be shown.
 *
 * @param seriesModel - The series to read
 * @param read        - Its one labelled value
 * @returns The layer
 */
function gaugeLayer(
  seriesModel: EChartsSeriesModel,
  read: Reading,
): MaidrLayer {
  const point: GaugePoint = {
    value: read.value,
    min: numeric(seriesModel.get('min'), 0),
    max: numeric(seriesModel.get('max'), 100),
    ...(read.name ? { label: read.name } : {}),
  };
  const name = authored(seriesModel);

  return {
    id: nextId('layer'),
    type: TraceType.GAUGE,
    ...(name ? { name } : {}),
    data: point,
  };
}

/**
 * The series' name, when the author wrote one.
 *
 * The option rather than `seriesModel.name`, which ECharts always resolves --
 * it invents one for a series declared without a name, so emitting it would
 * name a layer after an internal counter (#1195).
 *
 * @param seriesModel - The series to read
 * @returns The authored name, or the empty string
 */
function authored(seriesModel: EChartsSeriesModel): string {
  const name = seriesModel.get('name');
  return typeof name === 'string' ? name : '';
}

function numeric(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
