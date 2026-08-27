import type {
  EChartsComponentModel,
  EChartsInstance,
  EChartsList,
  EChartsSeriesModel,
} from '@adapters/echarts/types';
import type { LinePoint, SegmentedPoint } from '@type/grammar';
import { createMaidrFromEChart } from '@adapters/echarts/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/**
 * The two series types that own the chart but are read as a set of series.
 *
 * Both were refused by name until now, so a themeRiver or a parallel chart
 * threw "Unsupported ECharts series type(s)" and the page lost its reading
 * outright. The fixtures below carry the shapes measured off echarts 6.1.0
 * -- a themeRiver's flat `['time','value','name']` rows and a parallel's one
 * row per observation with the axis names living on separate components --
 * because those two facts are the whole of what these readings do.
 */

/** One row of a themeRiver: an instant, a magnitude, and the band it is in. */
interface Band {
  time: number;
  value: number | null;
  name: string;
}

/** Midnight UTC on the given day of January 2020, in epoch milliseconds. */
function january(day: number): number {
  return Date.UTC(2020, 0, day);
}

function themeRiverChart(
  rows: Band[],
  options: { axisName?: string; axisType?: string; seriesName?: string } = {},
): EChartsInstance {
  const list: EChartsList = {
    dimensions: ['time', 'value', 'name'],
    count: () => rows.length,
    getName: index => rows[index].name,
    get: (dimension, index) =>
      dimension === 'time' ? rows[index].time : rows[index].value,
  };

  const series: EChartsSeriesModel = {
    subType: 'themeRiver',
    name: options.seriesName ?? 'series 0',
    getData: () => list,
    get: key => (key === 'name' ? options.seriesName : undefined),
  };

  return instanceOf(series, {
    singleAxis: [{
      name: options.axisName,
      type: options.axisType ?? 'time',
    }],
  });
}

/** One `parallelAxis` component, as an author writes it. */
interface Axis {
  dim?: number;
  name?: string;
}

function parallelChart(
  rows: (number | null)[][],
  axes: Axis[],
  seriesName?: string,
): EChartsInstance {
  const dimensions = rows[0]?.map((_, column) => `dim${column}`) ?? [];
  const list: EChartsList = {
    dimensions,
    count: () => rows.length,
    // Measured: a parallel series names none of its observations.
    getName: () => '',
    get: (dimension, index) => rows[index][dimensions.indexOf(dimension)],
  };

  const series: EChartsSeriesModel = {
    subType: 'parallel',
    name: seriesName ?? 'series 0',
    getData: () => list,
    get: key => (key === 'name' ? seriesName : undefined),
  };

  return instanceOf(series, {
    parallelAxis: axes.map(axis => ({ name: axis.name, dim: axis.dim })),
  });
}

function instanceOf(
  series: EChartsSeriesModel,
  components: Record<string, Record<string, unknown>[]>,
): EChartsInstance {
  return {
    getModel: () => ({
      eachSeries: callback => callback(series, 0),
      eachComponent: (query, callback) => {
        (components[query.mainType] ?? []).forEach((options, index) => {
          const component: EChartsComponentModel = { get: key => options[key] };
          callback(component, index);
        });
      },
    }),
  };
}

function container(): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="chart"></div></body>');
  return dom.window.document.getElementById('chart') as HTMLElement;
}

/** A drawn theme river: `bands` filled paths, plus gridline furniture. */
function drawnRiver(bands: number): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="chart"></div></body>');
  const doc = dom.window.document;
  const host = doc.getElementById('chart') as HTMLElement;
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');

  const add = (attributes: Record<string, string>): void => {
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    Object.entries(attributes).forEach(([key, value]) =>
      path.setAttribute(key, value));
    svg.appendChild(path);
  };

  add({ fill: 'none', stroke: '#dbdee4' });
  // One filled path per band -- what the drawing actually paints.
  for (let index = 0; index < bands; index++) {
    add({ fill: '#5070dd' });
  }

  host.appendChild(svg);
  return host;
}

function layersOf(chart: EChartsInstance, host: HTMLElement = container()) {
  return createMaidrFromEChart(chart, host).subplots[0][0].layers;
}

const RIVER: Band[] = [
  { time: january(1), value: 10, name: 'A' },
  { time: january(2), value: 15, name: 'A' },
  { time: january(3), value: 12, name: 'A' },
  { time: january(1), value: 5, name: 'B' },
  { time: january(2), value: 8, name: 'B' },
  { time: january(3), value: 20, name: 'B' },
];

describe('an eCharts theme river', () => {
  it('is read as the stacked area it draws', () => {
    const layers = layersOf(themeRiverChart(RIVER, { seriesName: 'Flow' }));

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.STACKED_AREA);
    expect(layers[0].name).toBe('Flow');
  });

  it('groups its flat rows into a row per band', () => {
    // The reproduction of what makes this reading necessary: the series
    // hands over six rows, not two bands, and a segmented trace declines a
    // flat list.
    const data = layersOf(themeRiverChart(RIVER))[0].data as SegmentedPoint[][];

    expect(data).toHaveLength(2);
    expect(data[0].map(point => point.y)).toEqual([10, 15, 12]);
    expect(data[1].map(point => point.y)).toEqual([5, 8, 20]);
  });

  it('names each band on every one of its points', () => {
    // `z` is how a segmented trace tells the bands apart, and `getName()` is
    // the only place the name lives.
    const data = layersOf(themeRiverChart(RIVER))[0].data as SegmentedPoint[][];

    expect(data[0].every(point => point.z === 'A')).toBe(true);
    expect(data[1].every(point => point.z === 'B')).toBe(true);
  });

  it('stacks the bands in the order they first appear', () => {
    // Not alphabetical: the order the rows arrive in is the order the chart
    // stacks them, and sorting would announce a different chart.
    const rows: Band[] = [
      { time: january(1), value: 3, name: 'zeta' },
      { time: january(1), value: 4, name: 'alpha' },
      { time: january(2), value: 5, name: 'zeta' },
      { time: january(2), value: 6, name: 'alpha' },
    ];
    const data = layersOf(themeRiverChart(rows))[0].data as SegmentedPoint[][];

    expect(data.map(band => band[0].z)).toEqual(['zeta', 'alpha']);
  });

  it('announces an instant as the date it is, not as epoch milliseconds', () => {
    // Measured: `time` comes back as 1577836800000. Announced raw that is
    // unreadable, and it is the value a reader hears on every move.
    const data = layersOf(themeRiverChart(RIVER))[0].data as SegmentedPoint[][];

    expect(data[0].map(point => point.x)).toEqual([
      '2020-01-01',
      '2020-01-02',
      '2020-01-03',
    ]);
  });

  it('keeps the time of day when an instant carries one', () => {
    // The day alone would round away a chart drawn at finer than daily
    // resolution, so only an exact UTC midnight is shortened.
    const noon = Date.UTC(2020, 0, 1, 12, 30);
    const data = layersOf(themeRiverChart([
      { time: noon, value: 1, name: 'A' },
    ]))[0].data as SegmentedPoint[][];

    expect(data[0][0].x).toBe('2020-01-01T12:30:00.000Z');
  });

  it('leaves a non-time axis as the number it is', () => {
    const data = layersOf(themeRiverChart(
      [{ time: 7, value: 1, name: 'A' }],
      { axisType: 'value' },
    ))[0].data as SegmentedPoint[][];

    expect(data[0][0].x).toBe(7);
  });

  it('names its axis from the single axis it is drawn against', () => {
    const layer = layersOf(themeRiverChart(RIVER, { axisName: 'When' }))[0];

    expect(layer.axes?.x?.label).toBe('When');
    // A themeRiver draws no value axis, so naming one would be a claim the
    // chart does not make.
    expect(layer.axes?.y?.label).toBeUndefined();
  });

  it('drops a band row that drew nothing rather than reading it as zero', () => {
    const data = layersOf(themeRiverChart([
      { time: january(1), value: 10, name: 'A' },
      { time: january(2), value: null, name: 'A' },
      { time: january(3), value: 12, name: 'A' },
    ]))[0].data as SegmentedPoint[][];

    expect(data[0].map(point => point.y)).toEqual([10, 12]);
  });

  it('takes one selector per band', () => {
    // This shipped without an outline first, on the reasoning that
    // `STACKED_AREA` is a segmented trace needing a selector per *point*.
    // The premise was wrong -- `factory.ts` routes it to `AreaTrace`, which
    // extends `LineTrace` and takes one selector per *series*. One filled
    // path per band is exactly that shape.
    const layer = layersOf(themeRiverChart(RIVER), drawnRiver(2))[0];

    expect(layer.selectors).toHaveLength(2);
  });

  it('withholds the selectors when they do not line up with the bands', () => {
    // A list that does not match pairs every band with the wrong path,
    // which is worse than no highlighting at all.
    expect(layersOf(themeRiverChart(RIVER), drawnRiver(3))[0].selectors)
      .toBeUndefined();
  });

  it('counts only the bands that carry a measured value', () => {
    // The count handed to the mark finder has to be the one the layer will
    // carry, or a band dropped for having nothing drawn would shift the
    // pairing by one.
    const layer = layersOf(themeRiverChart([
      { time: january(1), value: 10, name: 'A' },
      { time: january(1), value: null, name: 'ghost' },
      { time: january(1), value: 5, name: 'B' },
    ]), drawnRiver(2))[0];

    expect(layer.data).toHaveLength(2);
    expect(layer.selectors).toHaveLength(2);
  });

  it('is refused when nothing it drew was measurable', () => {
    expect(() => layersOf(themeRiverChart([
      { time: january(1), value: null, name: 'A' },
    ]))).not.toThrow();
    expect(layersOf(themeRiverChart([
      { time: january(1), value: null, name: 'A' },
    ]))).toHaveLength(0);
  });
});

describe('an eCharts parallel coordinates plot', () => {
  const AXES: Axis[] = [
    { dim: 0, name: 'p' },
    { dim: 1, name: 'q' },
    { dim: 2, name: 'r' },
  ];

  it('is read as one polyline per observation', () => {
    const layers = layersOf(parallelChart([[1, 2, 3], [4, 5, 6]], AXES, 'Obs'));

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.PARALLEL);
    expect(layers[0].name).toBe('Obs');
    expect(layers[0].data).toHaveLength(2);
  });

  it('gives an observation a point per variable, each naming its own axis', () => {
    // `ParallelTrace` keys each axis's extent by the name its points carry,
    // not by column position, so the name on `x` is what keeps a value
    // pitched against its own variable's range (#1182).
    const data = layersOf(
      parallelChart([[1, 2, 3]], AXES),
    )[0].data as LinePoint[][];

    expect(data[0]).toEqual([
      { x: 'p', y: 1 },
      { x: 'q', y: 2 },
      { x: 'r', y: 3 },
    ]);
  });

  it('places each axis by its own dim rather than by declaration order', () => {
    // `dim` is what ties an axis to a column, and an author may write the
    // components in any order. Taking them as written would label every
    // value with its neighbour's variable.
    const data = layersOf(parallelChart(
      [[10, 20]],
      [{ dim: 1, name: 'second' }, { dim: 0, name: 'first' }],
    ))[0].data as LinePoint[][];

    expect(data[0]).toEqual([
      { x: 'first', y: 10 },
      { x: 'second', y: 20 },
    ]);
  });

  it('falls back to the column name when the author named no axis', () => {
    // Measured: an unnamed `parallelAxis` answers the empty string, not
    // `undefined`, so an unnamed axis would otherwise carry no name at all
    // and every column would collide under one key.
    const data = layersOf(parallelChart(
      [[1, 2]],
      [{ dim: 0 }, { dim: 1 }],
    ))[0].data as LinePoint[][];

    expect(data[0].map(point => point.x)).toEqual(['dim0', 'dim1']);
  });

  it('drops a reading the observation never had', () => {
    // An observation short a value is one point shorter rather than carrying
    // a zero; every remaining point still names its own axis, which is what
    // keeps the rest pitched correctly.
    const data = layersOf(parallelChart(
      [[1, null, 3]],
      AXES,
    ))[0].data as LinePoint[][];

    expect(data[0]).toEqual([
      { x: 'p', y: 1 },
      { x: 'r', y: 3 },
    ]);
  });

  it('is read without an outline, which is measured rather than conceded', () => {
    // The polylines are stroked, not filled, so the mark finder pairs
    // nothing: measured, a two-observation chart yields zero filled marks.
    expect(layersOf(parallelChart([[1, 2, 3]], AXES))[0].selectors).toBeUndefined();
  });

  it('emits no layer when no observation had a reading', () => {
    expect(layersOf(parallelChart([[null, null]], [{ dim: 0 }, { dim: 1 }])))
      .toHaveLength(0);
  });
});
