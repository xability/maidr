/**
 * @jest-environment jsdom
 */

/**
 * The ECharts series that hand over a summary already computed (#1195, tier 2b).
 *
 * A heat grid and a price chart sit on the same cartesian axes the bar family
 * uses and differ from it the same way: a datum is a set of magnitudes rather
 * than one, and ECharts has already worked them out. Measured on echarts
 * 6.1.0 the model names them outright -- `['x', 'y', 'value']` and
 * `['base', 'open', 'close', 'lowest', 'highest']` -- so nothing here is
 * recovered from the drawing.
 *
 * The selectors are checked by building the trace that consumes them, not by
 * resolving the strings. Tier 1 shipped two layers whose selectors were
 * individually right and collectively the wrong shape, and they resolved
 * nothing at all in silence (#1196); a heat grid is the shape most likely to
 * repeat it, because its rows are turned over between the payload and the
 * model.
 */

import type { EChartsInstance, EChartsList, EChartsSeriesModel } from '@adapters/echarts/types';
import type { CandlestickPoint, HeatmapData, MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { createMaidrFromEChart } from '@adapters/echarts/converters';
import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Candlestick } from '@model/candlestick';
import { Heatmap } from '@model/heatmap';
import { TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface FakeSeries {
  type: string;
  /** `[x, y, value]` for a heat grid. */
  cells?: [number, number, number | null][];
  /** `[open, close, lowest, highest]` for a price chart, `null` for a gap. */
  candles?: ([number, number, number, number] | null)[];
  /** The period names a candlestick's category axis carries. */
  periods?: string[];
  name?: string;
}

function fakeList(series: FakeSeries): EChartsList {
  if (series.cells) {
    const cells = series.cells;
    return {
      dimensions: ['x', 'y', 'value'],
      count: () => cells.length,
      getName: index => String(cells[index][0]),
      get: (dimension, index) => {
        const cell = cells[index];
        if (dimension === 'x') {
          return cell[0];
        }
        return dimension === 'y' ? cell[1] : cell[2];
      },
    };
  }

  const candles = series.candles ?? [];
  const order = ['base', 'open', 'close', 'lowest', 'highest'];
  return {
    dimensions: order,
    count: () => candles.length,
    getName: index => series.periods?.[index] ?? '',
    get: (dimension, index) => {
      const candle = candles[index];
      if (dimension === 'base') {
        return index;
      }
      if (!candle) {
        return null;
      }
      return candle[order.indexOf(dimension) - 1];
    },
  };
}

function fakeSeriesModel(series: FakeSeries): EChartsSeriesModel {
  const options: Record<string, unknown> = { name: series.name };
  return {
    subType: series.type,
    name: series.name ?? 'series 0',
    getData: () => fakeList(series),
    get: key => options[key],
  };
}

interface FakeChart {
  series: FakeSeries[];
  xData?: string[];
  yData?: string[];
  xName?: string;
  yName?: string;
}

function fakeInstance(chart: FakeChart): EChartsInstance {
  const components: Record<string, Record<string, unknown>[]> = {
    xAxis: [{
      name: chart.xName,
      type: chart.xData ? 'category' : 'value',
      data: chart.xData,
    }],
    yAxis: [{
      name: chart.yName,
      type: chart.yData ? 'category' : 'value',
      data: chart.yData,
    }],
    title: [],
  };

  return {
    getModel: () => ({
      eachSeries: (callback) => {
        chart.series.forEach((one, index) => callback(fakeSeriesModel(one), index));
      },
      eachComponent: (query, callback) => {
        (components[query.mainType] ?? []).forEach((options, index) =>
          callback({ get: key => options[key] }, index));
      },
    }),
  };
}

/**
 * The document ECharts drew: one filled mark per datum, plus the gradient
 * bands a `visualMap` legend paints beside a heat grid.
 *
 * @param marks    - How many data marks the chart drew
 * @param gradient - Whether to draw the legend's two `url(#…)` bands
 * @returns The container the chart was rendered into
 */
function drawnChart(marks: number, gradient = false): HTMLElement {
  document.body.innerHTML = '<div id="chart"></div>';
  // jsdom implements no layout, so `getBBox` is missing and `Candlestick`
  // reaches it while deriving an open and a close from a body it was given no
  // separate element for. A unit box is enough: nothing here asserts on
  // geometry, only on which element came back.
  (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox
    = () => ({ x: 0, y: 0, width: 1, height: 1 } as DOMRect);
  const container = document.getElementById('chart') as HTMLElement;
  const svg = document.createElementNS(SVG_NS, 'svg');

  const add = (id: string, attributes: Record<string, string>): void => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('id', id);
    Object.entries(attributes).forEach(([key, value]) => path.setAttribute(key, value));
    svg.appendChild(path);
  };

  for (let index = 0; index < marks; index++) {
    add(`mark-${index}`, { fill: 'rgb(80,112,221)' });
  }
  if (gradient) {
    // The `visualMap` legend, measured beside a real heat grid: two bands
    // filled with a gradient reference, which is neither `none` nor a
    // furniture colour and would otherwise be counted as a cell.
    add('legend-0', { fill: 'url(#zr6-g0)' });
    add('legend-1', { fill: 'url(#zr6-g1)' });
  }

  container.appendChild(svg);
  return container;
}

function layersOf(chart: FakeChart, container: HTMLElement): MaidrLayer[] {
  return createMaidrFromEChart(fakeInstance(chart), container).subplots[0][0].layers;
}

/** As much of a trace as navigating one costs. */
interface Cursor {
  moveToIndex: (row: number, col: number) => void;
  state: TraceState;
}

/**
 * The ids of the marks a trace resolves at one position.
 *
 * @param cursor - The trace to navigate
 * @param row    - Which row to move to
 * @param col    - Which column to move to
 * @returns The resolved elements' ids, empty when nothing resolved
 */
function highlighted(cursor: Cursor, row: number, col: number): string[] {
  cursor.moveToIndex(row, col);
  const state = cursor.state as Extract<TraceState, { empty: false }>;
  const highlight = state.highlight as { empty?: boolean; elements?: unknown };
  if (highlight.empty || !highlight.elements) {
    return [];
  }
  const elements = Array.isArray(highlight.elements)
    ? highlight.elements
    : [highlight.elements];
  return (elements as { id?: string }[]).map(element => element.id ?? '(unnamed)');
}

const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterEach(() => {
  document.body.innerHTML = '';
});

afterAll(() => {
  warnSpy.mockRestore();
});

describe('an eCharts heat grid', () => {
  const GRID: FakeChart = {
    xData: ['c0', 'c1', 'c2'],
    yData: ['r0', 'r1'],
    xName: 'Col',
    yName: 'Row',
    series: [{
      type: 'heatmap',
      // value = 10 * row + column, so a cell names its own place.
      cells: [[0, 0, 0], [1, 0, 1], [2, 0, 2], [0, 1, 10], [1, 1, 11], [2, 1, 12]],
    }],
  };

  it('turns the rows over, because a category y axis runs bottom-up', () => {
    // ECharts numbers a cell by axis index and `y = 0` is the bottom row --
    // measured. `HeatmapData.y` and `points` are top-first, so `r1` leads and
    // the row of tens is the first one a reader meets.
    const [layer] = layersOf(GRID, drawnChart(6, true));

    expect(layer.type).toBe(TraceType.HEATMAP);
    expect(layer.data as HeatmapData).toEqual({
      x: ['c0', 'c1', 'c2'],
      y: ['r1', 'r0'],
      points: [[10, 11, 12], [0, 1, 2]],
    });
  });

  it('names both axes after the titles the chart carries', () => {
    const [layer] = layersOf(GRID, drawnChart(6, true));

    expect(layer.axes?.x?.label).toBe('Col');
    expect(layer.axes?.y?.label).toBe('Row');
  });

  it('outlines the cell the reader is on, rows and all', () => {
    // The one thing the payload cannot show: `Heatmap` reverses the rows
    // again on construction, so a selector grid is indexed by the model's own
    // bottom-first row -- the reverse of `points`. Getting it backwards would
    // outline the top row while announcing the bottom one.
    const [layer] = layersOf(GRID, drawnChart(6, true));
    const trace = new Heatmap(layer);

    // Row 0 of the model is the bottom of the grid, which is `r0` --
    // the cells drawn first, `mark-0` through `mark-2`.
    expect(highlighted(trace, 0, 0)).toEqual(['mark-0']);
    expect(highlighted(trace, 0, 2)).toEqual(['mark-2']);
    expect(highlighted(trace, 1, 0)).toEqual(['mark-3']);
    expect(highlighted(trace, 1, 2)).toEqual(['mark-5']);
  });

  const GAPPY: FakeChart = {
    xData: ['c0', 'c1'],
    yData: ['r0', 'r1'],
    // Measured: ECharts keeps an empty cell in its data and reports the
    // value as `null`, whether the author wrote `null` or the `'-'` its
    // options accept. So the count is four and the drawing holds two.
    series: [{
      type: 'heatmap',
      cells: [[0, 0, 1], [0, 1, null], [1, 0, null], [1, 1, 4]],
    }],
  };

  it('leaves a cell the chart drew nothing at empty, not zero', () => {
    // A grid is a rectangle and the data need not fill it. Announcing `0`
    // there would be a value the chart never drew (#1191).
    const [layer] = layersOf(GAPPY, drawnChart(2, true));

    expect((layer.data as HeatmapData).points).toEqual([[null, 4], [1, null]]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('counts the cells that were drawn, not the cells that were named', () => {
    // The count check is what earns the highlighting, so it has to ask the
    // same question the drawing answers. Counting all four would expect four
    // marks where two were drawn, and the whole grid would lose its outline.
    const [layer] = layersOf(GAPPY, drawnChart(2, true));
    const trace = new Heatmap(layer);

    expect(highlighted(trace, 0, 0)).toEqual(['mark-0']);
    expect(highlighted(trace, 1, 1)).toEqual(['mark-1']);
    // The two cells nothing was drawn at name nothing either.
    expect(highlighted(trace, 0, 1)).toEqual([]);
    expect(highlighted(trace, 1, 0)).toEqual([]);
  });

  it('drops a cell placed outside the axes it was drawn against', () => {
    // Measured: ECharts keeps a datum whose coordinates fall off the grid --
    // `[5, 5, 9]` on a 2x2 -- and draws nothing for it. Writing it in would
    // index a row that does not exist and take the whole chart down with a
    // `TypeError`, so it is dropped from the reading and from the count.
    const [layer] = layersOf(
      {
        xData: ['c0', 'c1'],
        yData: ['r0', 'r1'],
        series: [{ type: 'heatmap', cells: [[0, 0, 1], [5, 5, 9], [1, 1, 4]] }],
      },
      drawnChart(2, true),
    );

    expect((layer.data as HeatmapData).points).toEqual([[null, 4], [1, null]]);
    expect(layer.selectors).toBeDefined();
  });

  it('reads a cell placed between two rows without outlining anything', () => {
    // Measured: a datum at `[0.5, 0.5]` is drawn -- three marks for three
    // data -- but it sits on no row and no column, so there is nowhere in a
    // `HeatmapData` grid to put it. It is left out, and the count then
    // disagrees with the drawing, which costs the chart its highlighting.
    // That is the conservative failure: no outline rather than a wrong one.
    const [layer] = layersOf(
      {
        xData: ['c0', 'c1'],
        yData: ['r0', 'r1'],
        series: [{ type: 'heatmap', cells: [[0, 0, 1], [0.5, 0.5, 7], [1, 1, 4]] }],
      },
      drawnChart(3, true),
    );

    expect((layer.data as HeatmapData).points).toEqual([[null, 4], [1, null]]);
    expect(layer.selectors).toBeUndefined();
  });

  it('does not count the visualMap legend as a cell', () => {
    // The legend's bands are filled with a `url(#…)` gradient, which is
    // neither `none` nor a furniture colour. Counted, they would put eight
    // marks where the model says six and cost the grid its highlighting.
    const [layer] = layersOf(GRID, drawnChart(6, true));

    expect(layer.selectors).toBeDefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('is declined when the grid has no named axes to sit on', () => {
    // Without category names there is nothing to announce a row or a column
    // as, and `HeatmapData` has no shape for a nameless one.
    expect(layersOf(
      { series: [{ type: 'heatmap', cells: [[0, 0, 1]] }] },
      drawnChart(1),
    )).toHaveLength(0);
  });
});

describe('an eCharts price chart', () => {
  const PRICES: FakeChart = {
    xData: ['d1', 'd2', 'd3'],
    yName: 'Price',
    series: [{
      type: 'candlestick',
      name: 'ACME',
      periods: ['d1', 'd2', 'd3'],
      candles: [[10, 12, 9, 13], [12, 11, 10, 14], [11, 15, 11, 16]],
    }],
  };

  it('reads the four prices ECharts already named', () => {
    const [layer] = layersOf(PRICES, drawnChart(3));

    expect(layer.type).toBe(TraceType.CANDLESTICK);
    expect(layer.name).toBe('ACME');
    expect(layer.data as CandlestickPoint[]).toEqual([
      { value: 'd1', open: 10, close: 12, low: 9, high: 13, volatility: 4 },
      { value: 'd2', open: 12, close: 11, low: 10, high: 14, volatility: 4 },
      { value: 'd3', open: 11, close: 15, low: 11, high: 16, volatility: 5 },
    ]);
  });

  it('outlines the candle the reader is on', () => {
    const [layer] = layersOf(PRICES, drawnChart(3));
    const trace = new Candlestick(layer);

    // A candlestick walks its periods along the column and reads one of the
    // four prices down the row, so the *column* picks the candle. Measured:
    // moving three rows down at column 0 stays on the first candle, and
    // moving to column 2 reaches the third.
    expect(highlighted(trace, 0, 0)).toEqual(['mark-0']);
    expect(highlighted(trace, 2, 0)).toEqual(['mark-0']);
    expect(highlighted(trace, 0, 2)).toEqual(['mark-2']);
  });

  it('skips a period the chart drew no candle for', () => {
    // A candle needs all four prices to be drawn at all, so a period missing
    // one is a period with nothing on the page -- and counting it would
    // expect three marks where two were drawn.
    const [layer] = layersOf(
      {
        xData: ['d1', 'd2', 'd3'],
        series: [{
          type: 'candlestick',
          periods: ['d1', 'd2', 'd3'],
          candles: [[10, 12, 9, 13], null, [11, 15, 11, 16]],
        }],
      },
      drawnChart(2),
    );

    expect((layer.data as CandlestickPoint[]).map(point => point.value))
      .toEqual(['d1', 'd3']);
    expect((layer.selectors as { body: string[] }).body).toHaveLength(2);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
