import type { EChartsInstance, EChartsList, EChartsSeriesModel } from '@adapters/echarts/types';
import type { BarPoint, LinePoint, PiePoint, ScatterPoint, SegmentedPoint } from '@type/grammar';
import { createMaidrFromEChart } from '@adapters/echarts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/**
 * The shapes Apache Superset and Metabase hand ECharts (#1304).
 *
 * Both tools draw most of their charts with ECharts, and neither writes a
 * chart the way this adapter's own examples do. Measured against a running
 * Metabase 0.63 and against Superset's `transformProps`:
 *
 * - **Metabase feeds every cartesian series from a `dataset`**, one column
 *   per metric, and says which column a series reads with `encode`. The
 *   series' data list then carries every column of the dataset -- measured,
 *   `['\0_x', 'count', 'sum', '__\0ecstackresult_count', …]` -- so "the
 *   second column" is not the series' value. `mapDimension` is.
 * - **Metabase names no series.** Its legend is its own HTML; each series is
 *   identified by an `id` such as `43:CNT:Widget`.
 * - **Both draw a time series on a `time` axis**, whose positions arrive as
 *   epoch milliseconds.
 * - **Metabase paints in `hsla(…)`**, its hollow line symbols included.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Column {
  [dimension: string]: (number | null)[];
}

interface FakeSeries {
  type: string;
  /** Every column the series' data list carries, in order. */
  columns: Column;
  /** Which column each coordinate reads, as `encode` resolves it. */
  encode: Record<string, string>;
  names?: string[];
  options?: Record<string, unknown>;
}

function fakeList(series: FakeSeries): EChartsList {
  const dimensions = Object.keys(series.columns);
  const count = Object.values(series.columns)[0].length;
  return {
    dimensions,
    count: () => count,
    getName: index => series.names?.[index] ?? '',
    get: (dimension, index) => series.columns[dimension]?.[index],
    mapDimension: coordinate => series.encode[coordinate],
  };
}

function fakeSeries(series: FakeSeries, index: number): EChartsSeriesModel {
  const options = series.options ?? {};
  return {
    subType: series.type,
    name: `series\0${index}`,
    getData: () => fakeList(series),
    get: key => options[key],
  };
}

function fakeInstance(
  series: FakeSeries[],
  axes: { x?: Record<string, unknown>; y?: Record<string, unknown> } = {},
  global?: Record<string, unknown>,
): EChartsInstance {
  const components: Record<string, Record<string, unknown>[]> = {
    xAxis: [axes.x ?? { type: 'category' }],
    yAxis: [axes.y ?? { type: 'value' }],
    title: [],
  };
  return {
    getModel: () => ({
      ...(global ? { get: (key: string) => global[key] } : {}),
      eachSeries: (callback) => {
        series.forEach((one, index) => callback(fakeSeries(one, index), index));
      },
      eachComponent: (query, callback) => {
        (components[query.mainType] ?? []).forEach((options, index) =>
          callback({ get: key => options[key] }, index));
      },
    }),
  };
}

/**
 * A drawn chart: `marks` filled paths, `lines` stroked ones, and whatever
 * extra furniture a case adds.
 */
function drawnChart(
  marks: number,
  lines: number,
  furniture: Record<string, string>[] = [],
): HTMLElement {
  const doc = new JSDOM('<!doctype html><body><div id="chart"></div></body>').window.document;
  const container = doc.getElementById('chart') as HTMLElement;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  const add = (attributes: Record<string, string>): void => {
    const path = doc.createElementNS(SVG_NS, 'path');
    Object.entries(attributes).forEach(([key, value]) => path.setAttribute(key, value));
    svg.appendChild(path);
  };
  add({ fill: 'none', stroke: '#dbdee4' });
  for (let index = 0; index < marks; index++) {
    add({ fill: '#509EE3' });
  }
  for (let index = 0; index < lines; index++) {
    add({ 'fill': 'none', 'stroke': '#509EE3', 'stroke-width': '2' });
  }
  furniture.forEach(add);
  container.appendChild(svg);
  return container;
}

const X = '\0_x';
const CATEGORIES = ['Doohickey', 'Gadget', 'Gizmo'];

const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

describe('a series fed from a dataset', () => {
  it('reads the column its encode names, not the second one', () => {
    // Metabase's own shape: a dataset holding two metrics, and a bar
    // encoding the second. The columns ECharts adds for stacking come along
    // too, as measured.
    const chart = fakeInstance([{
      type: 'bar',
      names: CATEGORIES,
      columns: {
        [X]: [0, 1, 2],
        'count': [42, 53, 51],
        'sum': [10, 20, 30],
        '__\0ecstackresult_sum': [10, 20, 30],
      },
      encode: { x: X, y: 'sum' },
      options: { id: 'sum', stack: 'bar_sum' },
    }]);

    const [layer] = createMaidrFromEChart(chart, drawnChart(3, 0)).subplots[0][0].layers;

    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Doohickey', y: 10 },
      { x: 'Gadget', y: 20 },
      { x: 'Gizmo', y: 30 },
    ]);
  });

  it('reads a sideways bar from the column encoded on x', () => {
    const chart = fakeInstance(
      [{
        type: 'bar',
        names: ['p', 'q'],
        columns: { k: [0, 1], v: [3, 5] },
        encode: { y: 'k', x: 'v' },
      }],
      { x: { type: 'value' }, y: { type: 'category' } },
    );

    const [layer] = createMaidrFromEChart(chart, drawnChart(2, 0)).subplots[0][0].layers;

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data as BarPoint[]).toEqual([
      { x: 3, y: 'p' },
      { x: 5, y: 'q' },
    ]);
  });

  it('reads a pie from the column encoded as its value', () => {
    // Measured: the pie's list carries `['k', 'v', 'w']`, and reading the
    // first column took the names for values and produced no layer at all.
    const chart = fakeInstance([{
      type: 'pie',
      names: ['p', 'q'],
      columns: { k: [null, null], v: [3, 5], w: [9, 1] },
      encode: { value: 'w' },
    }]);

    const [layer] = createMaidrFromEChart(chart, drawnChart(2, 0)).subplots[0][0].layers;

    expect(layer.type).toBe(TraceType.PIE);
    expect(layer.data as PiePoint[]).toEqual([
      { x: 'p', y: 9 },
      { x: 'q', y: 1 },
    ]);
  });

  it('sizes a scatter by a spare column only when there is exactly one', () => {
    const one = fakeInstance(
      [{
        type: 'scatter',
        columns: { a: [1, 2], b: [2, 3], c: [30, 40] },
        encode: { x: 'a', y: 'b' },
      }],
      { x: { type: 'value' } },
    );
    const two = fakeInstance(
      [{
        type: 'scatter',
        columns: { a: [1, 2], b: [2, 3], c: [30, 40], d: [5, 6] },
        encode: { x: 'b', y: 'd' },
      }],
      { x: { type: 'value' } },
    );

    const [sized] = createMaidrFromEChart(one, drawnChart(2, 0)).subplots[0][0].layers;
    const [unsized] = createMaidrFromEChart(two, drawnChart(2, 0)).subplots[0][0].layers;

    expect(sized.data as ScatterPoint[]).toEqual([
      { x: 1, y: 2, z: 30 },
      { x: 2, y: 3, z: 40 },
    ]);
    // Two columns left over, and nothing to say which one sized the symbols.
    expect(unsized.data as ScatterPoint[]).toEqual([
      { x: 2, y: 5 },
      { x: 3, y: 6 },
    ]);
  });
});

describe('a time axis', () => {
  it('announces a position as the date it is, not as epoch milliseconds', () => {
    const chart = fakeInstance(
      [{
        type: 'line',
        columns: { x: [1577836800000, 1577923200000, 1577926800000], y: [5, 7, 3] },
        encode: { x: 'x', y: 'y' },
      }],
      { x: { type: 'time' } },
    );

    const [layer] = createMaidrFromEChart(chart, drawnChart(0, 1)).subplots[0][0].layers;

    // A day where the instant is a UTC midnight, the full instant otherwise.
    expect((layer.data as LinePoint[][])[0].map(point => point.x)).toEqual([
      '2020-01-01',
      '2020-01-02',
      '2020-01-02T01:00:00.000Z',
    ]);
  });

  it('turns a bar on its side when the time is on y, as Superset draws one', () => {
    // Superset's horizontal time-series bar exchanges its axes: the pairs
    // arrive `[value, time]`, x is the value axis and y the time axis.
    const chart = fakeInstance(
      [{
        type: 'bar',
        columns: { x: [989.44, 540.35], y: [1704067200000, 1706745600000] },
        encode: { x: 'x', y: 'y' },
      }],
      { x: { type: 'value' }, y: { type: 'time' } },
    );

    const [layer] = createMaidrFromEChart(chart, drawnChart(2, 0)).subplots[0][0].layers;

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data as BarPoint[]).toEqual([
      { x: 989.44, y: '2024-01-01' },
      { x: 540.35, y: '2024-02-01' },
    ]);
  });

  it('labels a scatter point with its date and keeps x a number', () => {
    const chart = fakeInstance(
      [{
        type: 'scatter',
        columns: { x: [1704067200000], y: [989.44] },
        encode: { x: 'x', y: 'y' },
      }],
      { x: { type: 'time' } },
    );

    const [layer] = createMaidrFromEChart(chart, drawnChart(1, 0)).subplots[0][0].layers;

    expect(layer.data as ScatterPoint[]).toEqual([
      { x: 1704067200000, y: 989.44, xLabel: '2024-01-01' },
    ]);
  });

  it('leaves a line drawn down a time axis upright, each axis with its own name', () => {
    const chart = fakeInstance(
      [{
        type: 'line',
        columns: { x: [1, 2], y: [1704067200000, 1706745600000] },
        encode: { x: 'x', y: 'y' },
      }],
      { x: { type: 'value', name: 'Depth' }, y: { type: 'time', name: 'When' } },
    );

    const [layer] = createMaidrFromEChart(chart, drawnChart(0, 1)).subplots[0][0].layers;

    expect((layer.data as LinePoint[][])[0][0]).toEqual({ x: 1, y: 1704067200000 });
    expect(layer.axes?.x?.label).toBe('Depth');
  });

  it('announces a date in local time when the chart draws in local time', () => {
    // ECharts' own default: `useUTC: false`. A local midnight read in UTC was
    // the day before east of Greenwich.
    const midnight = new Date(2024, 0, 1).getTime();
    const chart = fakeInstance(
      [{
        type: 'line',
        columns: { x: [midnight, midnight + 90 * 60 * 1000], y: [5, 7] },
        encode: { x: 'x', y: 'y' },
      }],
      { x: { type: 'time' } },
      { useUTC: false },
    );

    const [layer] = createMaidrFromEChart(chart, drawnChart(0, 1)).subplots[0][0].layers;

    expect((layer.data as LinePoint[][])[0].map(point => point.x)).toEqual([
      '2024-01-01',
      '2024-01-01 01:30:00',
    ]);
  });

  it('labels a scatter point on a category axis with its category, not a named point on a value axis', () => {
    const categorical = fakeInstance(
      [{
        type: 'scatter',
        names: ['a'],
        columns: { x: [0], y: [2] },
        encode: { x: 'x', y: 'y' },
      }],
      { x: { type: 'category' } },
    );
    const named = fakeInstance(
      [{
        type: 'scatter',
        names: ['Japan'],
        columns: { x: [1], y: [2] },
        encode: { x: 'x', y: 'y' },
      }],
      { x: { type: 'value' } },
    );

    const [labelled] = createMaidrFromEChart(categorical, drawnChart(1, 0)).subplots[0][0].layers;
    const [plain] = createMaidrFromEChart(named, drawnChart(1, 0)).subplots[0][0].layers;

    expect(labelled.data as ScatterPoint[]).toEqual([{ x: 0, y: 2, xLabel: 'a' }]);
    expect(plain.data as ScatterPoint[]).toEqual([{ x: 1, y: 2 }]);
  });

  it('leaves a value axis as the numbers it carries', () => {
    const chart = fakeInstance(
      [{
        type: 'line',
        columns: { x: [2025, 2026], y: [5, 7] },
        encode: { x: 'x', y: 'y' },
      }],
      { x: { type: 'value' } },
    );

    const [layer] = createMaidrFromEChart(chart, drawnChart(0, 1)).subplots[0][0].layers;

    expect((layer.data as LinePoint[][])[0].map(point => point.x)).toEqual([2025, 2026]);
  });
});

describe('a series with no name', () => {
  const segments = (ids: unknown[]): FakeSeries[] => ids.map(id => ({
    type: 'bar',
    names: ['2025', '2026'],
    columns: { [X]: [0, 1], cnt: [1, 2] },
    encode: { x: X, y: 'cnt' },
    options: { id, stack: 'bar' },
  }));

  it('is named by the id its author gave it', () => {
    const chart = fakeInstance(segments(['43:CNT:Widget', '43:CNT:Gizmo']));

    const [layer] = createMaidrFromEChart(chart, drawnChart(4, 0)).subplots[0][0].layers;

    expect(layer.type).toBe(TraceType.STACKED);
    expect((layer.data as SegmentedPoint[][]).map(row => row[0].z)).toEqual([
      '43:CNT:Widget',
      '43:CNT:Gizmo',
    ]);
  });

  it('is not named by an id ECharts invented', () => {
    const chart = fakeInstance(segments(['\0series\u00000\u00000', undefined]));

    const [layer] = createMaidrFromEChart(chart, drawnChart(4, 0)).subplots[0][0].layers;

    expect((layer.data as SegmentedPoint[][]).map(row => row[0].z)).toEqual([
      'Series 1',
      'Series 2',
    ]);
  });
});

describe('a mark painted in hsla()', () => {
  it('is furniture when it is white, so an area keeps its outline', () => {
    // A Metabase area: one band, one stroke, and a hollow symbol per point
    // written `hsla(0, 0%, 100%, 1.00)` -- which counted as marks and cost
    // the chart its highlighting until the spelling was understood.
    const hollow = { 'fill': 'hsla(0, 0%, 100%, 1.00)', 'stroke': '#509EE3', 'stroke-width': '0' };
    const chart = fakeInstance(
      [
        {
          type: 'line',
          columns: { x: [1, 2, 3], y: [5, 7, 3] },
          encode: { x: 'x', y: 'y' },
          options: { areaStyle: { opacity: 0.3 } },
        },
        {
          type: 'bar',
          columns: { x: [1, 2, 3], y: [1, 2, 3] },
          encode: { x: 'x', y: 'y' },
        },
      ],
      { x: { type: 'value' } },
    );

    const layers = createMaidrFromEChart(
      chart,
      drawnChart(4, 1, [hollow, hollow, hollow]),
    ).subplots[0][0].layers;

    expect(warnSpy).not.toHaveBeenCalled();
    expect(layers.every(layer => layer.selectors !== undefined)).toBe(true);
  });
});
