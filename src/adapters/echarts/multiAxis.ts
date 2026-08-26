/**
 * The two ECharts series types that own the chart but are read as a *set of
 * series* rather than as one thing per datum.
 *
 * A `themeRiver` is a stacked area whose bands sit on a `singleAxis` instead
 * of a cartesian grid; a `parallel` is one polyline per observation across a
 * `parallelAxis` per variable. Neither sits on the x/y grid the cartesian
 * readings use, so neither can go through `buildLayers()` -- but neither
 * carries a hierarchy or a graph either, which is why they are here rather
 * than in `hierarchy.ts` or `network.ts`.
 *
 * Everything below was measured against **echarts 6.1.0** driven in
 * Chromium, not read off the documentation.
 */

import type { LinePoint, MaidrLayer, SegmentedPoint } from '@type/grammar';
import type {
  EChartsComponentModel,
  EChartsModel,
  EChartsSeriesModel,
} from './types';
import { TraceType } from '@type/grammar';
import { nextId } from '../shared/selectorUtil';

/** The stacked-area series that sits on a `singleAxis`. */
export const THEME_RIVER: ReadonlySet<string> = new Set(['themeRiver']);

/** The one-polyline-per-observation series that sits on `parallelAxis`. */
export const PARALLEL: ReadonlySet<string> = new Set(['parallel']);

/**
 * Reads a `themeRiver` as the stacked area it draws.
 *
 * Measured, the series carries `['time', 'value', 'name']` with **one row
 * per band per instant** -- a flat list, not a row per band:
 *
 *     count=6  A@2020-01-01=10  A@2020-01-02=15  A@2020-01-03=12
 *              B@2020-01-01=5   B@2020-01-02=8   B@2020-01-03=20
 *
 * `getName(i)` answers the band's name rather than a category label, so the
 * grouping this reading does is the only way the bands come apart. They are
 * emitted in first-appearance order, which is the order the chart stacks
 * them in.
 *
 * **`time` is epoch milliseconds.** Announced raw it would read as
 * "1577836800000", so it is turned back into the date it is -- see
 * {@link instant}.
 *
 * **It is read without an outline.** Measured by colour, the drawing paints
 * one filled path per *band*, not one per datum: three instants of two bands
 * gave two marks. `TraceType.STACKED_AREA` is a segmented trace, and a
 * segmented trace's selectors are a row per series *aligned to that series'
 * points* -- which is a pairing the drawing does not offer. Repeating the
 * band's one mark across its instants would resolve, and would light the
 * whole band on every move within it, which is not what the cursor is on.
 * So the outline is left to a follow-up that can verify a shape against a
 * constructed trace rather than against a resolving string.
 *
 * @param seriesModel - The series to read
 * @param model       - The chart's model, for the axis name
 * @returns The layer, or `undefined` when nothing measurable was drawn
 */
export function themeRiverLayer(
  seriesModel: EChartsSeriesModel,
  model: EChartsModel,
): MaidrLayer | undefined {
  const data = seriesModel.getData();
  const dated = axisType(model, 'singleAxis') === 'time';

  // First-appearance order, which is the order the bands are stacked in.
  const order: string[] = [];
  const bands = new Map<string, SegmentedPoint[]>();

  for (let index = 0; index < data.count(); index++) {
    const value = data.get('value', index);
    if (!measured(value)) {
      continue;
    }
    const band = data.getName(index) || `Band ${order.length + 1}`;
    let points = bands.get(band);
    if (!points) {
      points = [];
      bands.set(band, points);
      order.push(band);
    }
    points.push({ x: instant(data.get('time', index), dated), y: value, z: band });
  }

  if (order.length === 0) {
    return undefined;
  }

  const name = text(seriesModel.get('name'));
  const when = axisName(model, 'singleAxis');

  return {
    id: nextId('layer'),
    type: TraceType.STACKED_AREA,
    ...(name ? { name } : {}),
    axes: {
      x: { label: when || undefined },
      // The bands are a magnitude with no axis of its own: a themeRiver
      // draws no value axis, so naming one would be a claim the chart does
      // not make.
      y: {},
    },
    // A row per band. `SegmentedTrace` declines a flat list, and a flat one
    // is what the series hands over.
    data: order.map(band => bands.get(band) ?? []),
  };
}

/**
 * Reads a `parallel` as the parallel-coordinates plot it draws.
 *
 * Measured, the series carries one row per **observation** and one dimension
 * per **variable** -- `['dim0', 'dim1', 'dim2']` for a three-axis chart --
 * and the names those columns are drawn under live on the `parallelAxis`
 * components rather than on the series:
 *
 *     parallelAxis: [{dim:0,name:'p'}, {dim:1,name:'q'}, {dim:2,name:'r'}]
 *
 * so the axis names are read from there, in `dim` order, and fall back to
 * the dimension's own name when the author wrote none (measured: `name`
 * comes back as the empty string, not `undefined`).
 *
 * Every point names its own axis in `x`, which is what `ParallelTrace`
 * requires: it keys each axis's extent by name rather than by column
 * position, so a value is pitched against its own variable's range even when
 * an observation is short a reading (#1182).
 *
 * **It is read without an outline, and that is measured rather than
 * conceded.** The polylines are *stroked*, not filled, so the mark finder --
 * which pairs filled marks with data -- finds none at all: zero marks for a
 * two-observation chart. Reading without one is what `gauge`, `sankey` and
 * `graph` already do here.
 *
 * @param seriesModel - The series to read
 * @param model       - The chart's model, for the axis names
 * @returns The layer, or `undefined` when nothing measurable was drawn
 */
export function parallelLayer(
  seriesModel: EChartsSeriesModel,
  model: EChartsModel,
): MaidrLayer | undefined {
  const data = seriesModel.getData();
  const names = parallelAxisNames(model);

  const observations: LinePoint[][] = [];
  for (let index = 0; index < data.count(); index++) {
    const row: LinePoint[] = [];
    data.dimensions.forEach((dimension, column) => {
      const value = data.get(dimension, index);
      if (!measured(value)) {
        return;
      }
      row.push({ x: names[column] || dimension, y: value });
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
    type: TraceType.PARALLEL,
    ...(name ? { name } : {}),
    // No x or y of the chart's own: every axis is a column, and each point
    // names the one it belongs to.
    data: observations,
  };
}

/**
 * The `parallelAxis` names, in the order the chart draws them.
 *
 * Placed by each component's own `dim` rather than by the order they were
 * declared in: `dim` is what ties an axis to a column of the series, and an
 * author may write them in any order.
 *
 * @param model - The chart's model
 * @returns One name per column, empty where the author wrote none
 */
function parallelAxisNames(model: EChartsModel): string[] {
  const names: string[] = [];
  model.eachComponent({ mainType: 'parallelAxis' }, (component, index) => {
    const dim = component.get('dim');
    const at = typeof dim === 'number' && Number.isInteger(dim) && dim >= 0
      ? dim
      : index;
    names[at] = text(component.get('name'));
  });
  return names;
}

/**
 * One instant of a themeRiver's axis, in terms a reader can hear.
 *
 * ECharts hands over epoch milliseconds. A date is announced as the day it
 * is when the instant lands exactly on a UTC midnight -- which is what daily
 * data does -- and as the full timestamp otherwise, so nothing is rounded
 * away from a chart that carries a time of day.
 *
 * A non-time axis is left as the number it is.
 *
 * @param value - The raw value of the `time` column
 * @param dated - Whether the axis was declared `type: 'time'`
 * @returns The value to announce
 */
function instant(value: number | null | undefined, dated: boolean): string | number {
  if (!measured(value)) {
    return 0;
  }
  if (!dated) {
    return value;
  }
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) {
    return value;
  }
  const iso = when.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
}

function axisType(model: EChartsModel, mainType: string): string {
  return text(firstOf(model, mainType)?.get('type'));
}

function axisName(model: EChartsModel, mainType: string): string {
  return text(firstOf(model, mainType)?.get('name'));
}

function firstOf(
  model: EChartsModel,
  mainType: string,
): EChartsComponentModel | undefined {
  let first: EChartsComponentModel | undefined;
  model.eachComponent({ mainType }, (component, index) => {
    if (index === 0) {
      first = component;
    }
  });
  return first;
}

function measured(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
