/**
 * The ECharts `radar` series: one closed outline per observation, one spoke
 * per indicator.
 *
 * It owns the chart the way a themeRiver or a parallel does -- it sits on a
 * `radar` component rather than on the x/y grid -- but it is neither a set of
 * bands over time nor a polyline across axes, so it gets its own module.
 *
 * Measured against **echarts 6.1.0** driven in Chromium.
 */

import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { EChartsModel, EChartsSeriesModel } from './types';
import { TraceType } from '@type/grammar';
import { nextId } from '../shared/selectorUtil';

/** The series drawn around a `radar` component. */
export const RADAR: ReadonlySet<string> = new Set(['radar']);

/**
 * Reads a `radar` as the multi-series outline it draws.
 *
 * Measured, the series carries one row per **observation** and one dimension
 * per **indicator** -- `['indicator_0', 'indicator_1', 'indicator_2']` for a
 * three-spoke chart -- with `getName(i)` answering the observation's name.
 * The names the spokes are drawn under are not on the series at all; they are
 * the `indicator` array of the `radar` component, which also carries the
 * `min`/`max` ECharts resolved for each.
 *
 * Every point names its own spoke in `x` and its own series in `z`, which is
 * the shape `RadarTrace` is navigated by -- each spoke a column, each series
 * a row.
 *
 * **What made this look unreadable, and why it is not.** The refusal this
 * replaces counted *filled* marks and found seven where six were expected:
 * a two-series radar fills six vertex symbols (three per series) plus its
 * alternating ring backgrounds, one of which (`rgb(234,237,245)`) is neither
 * white nor furniture. But `RadarTrace` wants one selector **per series**,
 * and the filled marks are one per *vertex* -- so they never fitted, ring
 * background or not. What does fit is the series outline: a polyline that is
 * stroked rather than filled, one per series, weighted and in the series
 * colour.
 *
 *     stroked, unfilled, in a two-series radar
 *       #dbdee4          the ring outline    unweighted -> furniture
 *       #cfd2d7 x3       the spokes          unweighted -> furniture
 *       #111199 width=2  series one          <- the mark
 *       #229922 width=2  series two          <- the mark
 *
 * which is exactly the shape `markPerSeries()` already finds for `line`, and
 * the grid furniture is unweighted so the existing filter drops it.
 *
 * @param seriesModel - The series to read
 * @param model       - The chart's model, for the indicator names
 * @param selectors   - One selector per series, when they were found
 * @returns The layer, or `undefined` when nothing measurable was drawn
 */
export function radarLayer(
  seriesModel: EChartsSeriesModel,
  model: EChartsModel,
  selectors: string[] | undefined,
): MaidrLayer | undefined {
  const data = seriesModel.getData();
  const spokes = indicatorNames(model);

  const observations: LinePoint[][] = [];
  for (let index = 0; index < data.count(); index++) {
    const series = data.getName(index) || `Series ${index + 1}`;
    const row: LinePoint[] = [];
    data.dimensions.forEach((dimension, column) => {
      const value = data.get(dimension, index);
      if (!measured(value)) {
        return;
      }
      row.push({ x: spokes[column] || dimension, y: value, z: series });
    });
    if (row.length > 0) {
      observations.push(row);
    }
  }

  if (observations.length === 0) {
    return undefined;
  }

  const name = text(seriesModel.get('name'));

  return {
    id: nextId('layer'),
    type: TraceType.RADAR,
    ...(name ? { name } : {}),
    // One selector per series, which is what `RadarTrace` reads. Withheld
    // unless there is exactly one per series that was read -- a list that
    // does not line up pairs every series with the wrong outline.
    ...(selectors && selectors.length === observations.length
      ? { selectors }
      : {}),
    // No x or y of the chart's own: every spoke is a column, and each point
    // names the one it belongs to.
    data: observations,
  };
}

/**
 * How many outlines the chart drew, which is how many marks to look for.
 *
 * Counted from the series rather than from the drawing, so the count the
 * mark finder is given is the one the reading will use.
 *
 * @param seriesModel - The series to read
 * @returns The number of observations
 */
export function drawnOutlineCount(seriesModel: EChartsSeriesModel): number {
  return seriesModel.getData().count();
}

/**
 * The names the spokes are drawn under.
 *
 * They live on the `radar` component's `indicator` array, in the order the
 * series' dimensions are in. ECharts resolves a `min` and `max` onto each
 * entry, but the name is the author's.
 *
 * @param model - The chart's model
 * @returns One name per spoke, empty where the author wrote none
 */
function indicatorNames(model: EChartsModel): string[] {
  const names: string[] = [];
  model.eachComponent({ mainType: 'radar' }, (component, index) => {
    if (index !== 0) {
      return;
    }
    const indicator = component.get('indicator');
    if (!Array.isArray(indicator)) {
      return;
    }
    indicator.forEach((entry, at) => {
      names[at] = entry !== null && typeof entry === 'object' && 'name' in entry
        ? text((entry as { name?: unknown }).name)
        : '';
    });
  });
  return names;
}

function measured(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
