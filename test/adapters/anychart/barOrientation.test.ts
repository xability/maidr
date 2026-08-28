/**
 * An AnyChart bar chart is drawn sideways, and was read as an upright one.
 *
 * AnyChart names the two arrangements as separate chart types rather than as
 * an option on one: `anychart.bar()` runs its categories down the page and
 * `anychart.column()` across it. The adapter knew this — `mapSeriesType` says
 * so in as many words, "MAIDR does not currently distinguish bar orientation
 * at the trace level" — and emitted the same layer for both.
 *
 * Measured in Chromium on anychart 8.13.0, `[['alpha', 10], ['bravo', 20]]`
 * with the axes titled `Day` and `Count`, through `anyChartToMaidr`:
 *
 *   chart               getType()   emitted orientation   data[0]
 *   anychart.column()   'column'    (none) = vert         {x: 'alpha', y: 10}
 *   anychart.bar()      'bar'       (none) = vert         {x: 'alpha', y: 10}
 *
 * The second row is a description of a chart AnyChart did not draw: announced
 * as a vertical bar plot, arrowed left and right through categories that run
 * down the page, and each bar's length announced against the axis title of the
 * axis it does not lie on.
 *
 * The question is the **chart's** rather than the series': a `marker` series
 * inside a bar chart is a Cleveland dot plot and a `stick` is a sideways
 * lollipop, and neither says so in its own name. Measured, all four series
 * inside `anychart.bar()`:
 *
 *   series          seriesType()   read as
 *   bar             'bar'          bar
 *   marker          'marker'       dot
 *   stick           'stick'        lollipop
 *   rangeBar        'range-bar'    dumbbell
 *
 * `bar-3d` is the same chart with depth. `barmekko` is **not** in the set: it
 * is a column chart whose widths vary, drawn upright — measured, `getType()`
 * answers `'barmekko'` for a chart with its categories across the page.
 */

import type { AnyChartInstance, AnyChartIterator, AnyChartSeries } from '@adapters/anychart/types';
import type { BarPoint, DumbbellData, MaidrLayer } from '@type/grammar';
import { anyChartToMaidr } from '@adapters/anychart/converters';
import { describe, expect, it } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  document: dom.window.document,
  window: dom.window,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  Node: dom.window.Node,
});

/** The categories and their magnitudes, as the chart is written. */
const ROWS: Array<[string, number]> = [['alpha', 10], ['bravo', 20]];

/**
 * An iterator over the series' rows, the one API the extraction walks.
 * @param rows - The rows to hand out
 * @returns The iterator
 */
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

/**
 * One series of the given AnyChart type.
 * @param seriesType - The name AnyChart answers for the series
 * @param rows - Its rows
 * @returns The series
 */
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

/**
 * A drawn cartesian chart of one series, with both axes titled.
 *
 * The titles are AnyChart's own: `xAxis()` is the category axis on a bar chart
 * as much as on a column chart — it is the same axis object, drawn down the
 * page instead of across it.
 *
 * @param chartType - What `getType()` answers
 * @param series - The chart's one series
 * @returns The chart
 */
function createChart(chartType: string, series: AnyChartSeries): AnyChartInstance {
  return {
    title: () => 'Tips',
    container: () => '',
    getType: () => chartType,
    getSeriesCount: () => 1,
    getSeriesAt: (i: number) => (i === 0 ? series : null),
    // Named categories rather than measured positions, which is what makes a
    // `marker` series a dot plot rather than a point cloud.
    xScale: () => ({ getType: () => 'ordinal', inverted: () => false }),
    xAxis: () => ({ title: () => ({ text: () => 'Day' }) }),
    yAxis: () => ({ title: () => ({ text: () => 'Count' }) }),
  } as unknown as AnyChartInstance;
}

/**
 * The layer one chart converts to.
 * @param chartType - What `getType()` answers
 * @param seriesType - The series AnyChart drew
 * @param rows - Its rows, defaulting to a category and a magnitude each
 * @returns The emitted layer
 */
function layerFor(
  chartType: string,
  seriesType = chartType,
  rows: Array<Record<string, unknown>> = ROWS.map(([x, value]) => ({ x, value })),
): MaidrLayer {
  const chart = createChart(chartType, createSeries(seriesType, rows));
  const maidr = anyChartToMaidr(chart, { id: 'chart' });
  const layer = maidr?.subplots[0][0].layers[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer;
}

describe('an upright AnyChart column chart', () => {
  it('says nothing about orientation, which is `vert`', () => {
    expect(layerFor('column').orientation).toBeUndefined();
  });

  it('puts the category on x and the magnitude on y', () => {
    expect(layerFor('column').data as BarPoint[]).toEqual([
      { x: 'alpha', y: 10 },
      { x: 'bravo', y: 20 },
    ]);
  });

  it('names the category axis x and the magnitude axis y', () => {
    expect(layerFor('column').axes).toEqual({
      x: { label: 'Day' },
      y: { label: 'Count' },
    });
  });
});

describe('a sideways AnyChart bar chart', () => {
  it('says it is drawn sideways', () => {
    expect(layerFor('bar').orientation).toBe(Orientation.HORIZONTAL);
  });

  it('puts the magnitude where the orientation says it is', () => {
    // Not cosmetic: `BarTrace` reads the magnitude off `x` when the layer is
    // horizontal, so declaring the key over AnyChart's own arrangement would
    // hand it the string 'alpha' and every bar would go silent.
    //
    // Read bottom-first, because that is how the chart is drawn: an
    // un-inverted `anychart.bar()` puts its first category at the foot of the
    // axis, which #1021 already turns the reading and the selectors round
    // for. The exchange is what this checks; the order is that fix's.
    expect(layerFor('bar').data as BarPoint[]).toEqual([
      { x: 20, y: 'bravo' },
      { x: 10, y: 'alpha' },
    ]);
  });

  it('swaps the axis titles with the pair they name', () => {
    expect(layerFor('bar').axes).toEqual({
      x: { label: 'Count' },
      y: { label: 'Day' },
    });
  });

  it('reads a 3D bar chart the same way', () => {
    expect(layerFor('bar-3d', 'bar').orientation).toBe(Orientation.HORIZONTAL);
  });

  it('leaves a bar mekko upright, which is how it is drawn', () => {
    // AnyChart's bar mekko is a column chart whose widths vary. The name is
    // the only sideways thing about it.
    expect(layerFor('barmekko', 'column').orientation).toBeUndefined();
  });
});

describe('the marks a sideways bar chart draws instead of bars', () => {
  it('reads a marker series as a horizontal dot plot', () => {
    const layer = layerFor('bar', 'marker');

    expect(layer.type).toBe(TraceType.DOT);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect((layer.data as BarPoint[])[0]).toEqual({ x: 10, y: 'alpha' });
    // A dot is not in `REVERSIBLE_ON_INVERSION`, so its rows stay as written
    // -- left where #1021 left them, and not this fix's to move.
  });

  it('reads a stick series as a horizontal lollipop', () => {
    const layer = layerFor('bar', 'stick');

    expect(layer.type).toBe(TraceType.LOLLIPOP);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect((layer.data as BarPoint[])[0]).toEqual({ x: 10, y: 'alpha' });
  });

  it('leaves the same marks upright in a column chart', () => {
    expect(layerFor('column', 'marker').orientation).toBeUndefined();
    expect(layerFor('column', 'stick').orientation).toBeUndefined();
  });

  it('says a range bar runs sideways without moving its ends', () => {
    // A dumbbell carries no `x`/`y` pair to exchange — the grammar's table
    // says so — and `DumbbellTrace` keeps its grid either way. What the key
    // changes is which axis names the subject, and where each end is panned.
    const layer = layerFor('bar', 'range-bar', [
      { x: 'alpha', low: 1, high: 5 },
      { x: 'bravo', low: 2, high: 8 },
    ]);

    expect(layer.type).toBe(TraceType.DUMBBELL);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect((layer.data as DumbbellData).points[0]).toEqual({
      x: 'alpha',
      start: 1,
      end: 5,
    });
  });
});
