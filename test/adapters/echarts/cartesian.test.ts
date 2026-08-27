import type { EChartsInstance, EChartsList, EChartsSeriesModel, EChartsSeriesType } from '@adapters/echarts/types';
import type { BarPoint, LinePoint, ScatterPoint, SegmentedPoint } from '@type/grammar';
import { createMaidrFromEChart, READ } from '@adapters/echarts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/**
 * The first tier of the ECharts adapter (#1195).
 *
 * ECharts had none at all -- fourteen libraries did, and the largest one with
 * no MAIDR support was this. The readings here are the cartesian three, and
 * the shapes the fakes below stand in for were measured against **echarts
 * 6.1.0** driven in Chromium, not read from its documentation:
 *
 *     dimensions   ['x', 'y'], or ['x', 'y', 'value'] with a sized symbol
 *     getName(i)   the category on a category axis, '' on a value axis
 *     get(dim, i)  the value; on a category axis x is the INDEX
 *     horizontal   y is the category axis, and the values arrive
 *                  [magnitude, categoryIndex]
 *
 * The marks are the harder half, and `selectors.ts` says why: the SVG has no
 * ids, no `data-*` and only generated classes, so a mark is found by its
 * paint and checked by its count.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

interface FakeSeries {
  type: string;
  /** Category names, or `undefined` for a value axis. */
  names?: string[];
  /** The magnitude at each position; `null` is a datum that drew nothing. */
  values: (number | null)[];
  /** The other coordinate, when the chart is not categorical. */
  positions?: (number | null)[];
  /** A third column, which is what a sized symbol reads. */
  sizes?: number[];
  name?: string;
  stack?: string;
  step?: string;
  areaStyle?: object;
}

function fakeList(series: FakeSeries, horizontal: boolean): EChartsList {
  const dimensions = series.sizes ? ['x', 'y', 'value'] : ['x', 'y'];
  const magnitude = horizontal ? 'x' : 'y';
  const position = horizontal ? 'y' : 'x';

  return {
    dimensions,
    count: () => series.values.length,
    getName: index => series.names?.[index] ?? '',
    get: (dimension, index) => {
      if (dimension === magnitude) {
        return series.values[index];
      }
      if (dimension === position) {
        // Read verbatim when the case supplies them, so a `null` coordinate
        // stays a `null` rather than falling back to the index.
        return series.positions ? series.positions[index] : index;
      }
      return series.sizes?.[index];
    },
  };
}

function fakeSeries(series: FakeSeries, horizontal: boolean): EChartsSeriesModel {
  const options: Record<string, unknown> = {
    name: series.name,
    stack: series.stack,
    step: series.step,
    areaStyle: series.areaStyle,
  };

  return {
    subType: series.type,
    // ECharts always resolves one, inventing a name for a series declared
    // without any -- which is why the reading asks the *option* instead.
    name: series.name ?? 'series 0',
    getData: () => fakeList(series, horizontal),
    get: key => options[key],
  };
}

interface FakeChart {
  series: FakeSeries[];
  xName?: string;
  yName?: string;
  title?: string;
  horizontal?: boolean;
}

function fakeInstance(chart: FakeChart): EChartsInstance {
  const horizontal = Boolean(chart.horizontal);
  const components: Record<string, Record<string, unknown>[]> = {
    xAxis: [{ name: chart.xName, type: horizontal ? 'value' : 'category' }],
    yAxis: [{ name: chart.yName, type: horizontal ? 'category' : 'value' }],
    title: chart.title === undefined ? [] : [{ text: chart.title }],
  };

  return {
    getModel: () => ({
      eachSeries: (callback) => {
        chart.series.forEach((series, index) =>
          callback(fakeSeries(series, horizontal), index));
      },
      eachComponent: (query, callback) => {
        (components[query.mainType] ?? []).forEach((options, index) =>
          callback({ get: key => options[key] }, index));
      },
    }),
  };
}

/**
 * A drawn chart: `marks` solid paths in the series colour, `lines` stroked
 * ones, and the furniture that must not be counted as either.
 *
 * The furniture is not decoration in this fixture -- each piece is one the
 * detection was measured against, and one of them (the axis name's black
 * background, written `rgb(0,0,0)`) is what a set holding only `#000` let
 * through.
 */
function drawnChart(marks: number, lines: number): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('chart') as HTMLElement;
  const svg = doc.createElementNS(SVG_NS, 'svg');

  const add = (attributes: Record<string, string>): void => {
    const path = doc.createElementNS(SVG_NS, 'path');
    Object.entries(attributes).forEach(([key, value]) => path.setAttribute(key, value));
    svg.appendChild(path);
  };

  // Gridlines: unfilled, stroked grey, and unweighted.
  add({ fill: 'none', stroke: '#dbdee4' });
  add({ fill: 'none', stroke: '#54555a' });

  for (let index = 0; index < marks; index++) {
    add({ fill: '#5070dd' });
  }
  for (let index = 0; index < lines; index++) {
    add({ 'fill': 'none', 'stroke': '#5070dd', 'stroke-width': '2' });
  }

  // A hover symbol, and the two blacks: the per-series border artefact and
  // an axis name's background, each in its own spelling.
  add({ 'fill': '#fff', 'stroke': '#5070dd', 'stroke-width': '0.7' });
  add({ fill: '#000' });
  add({ fill: 'rgb(0,0,0)', stroke: '#3c3c41' });

  container.appendChild(svg);
  return container;
}

function layersOf(chart: FakeChart, container: HTMLElement) {
  return createMaidrFromEChart(fakeInstance(chart), container).subplots[0][0].layers;
}

const CATEGORIES = ['A', 'B', 'C'];

const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

describe('an eCharts bar chart', () => {
  it('is read as the bars it draws, named by their categories', () => {
    const [layer] = layersOf(
      { series: [{ type: 'bar', names: CATEGORIES, values: [1, 2, 3] }] },
      drawnChart(3, 0),
    );

    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.orientation).toBe(Orientation.VERTICAL);
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'A', y: 1 },
      { x: 'B', y: 2 },
      { x: 'C', y: 3 },
    ]);
  });

  it('reads a sideways chart from which axis is categorical', () => {
    // ECharts has no "horizontal" option: a bar is turned on its side by
    // making y the category axis, and that is the only thing that says so.
    const [layer] = layersOf(
      {
        horizontal: true,
        series: [{ type: 'bar', names: CATEGORIES, values: [1, 2, 3] }],
      },
      drawnChart(3, 0),
    );

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    // The magnitude belongs to x and the category to y -- declaring the
    // orientation without moving the payload is the defect #480 had.
    expect(layer.data as BarPoint[]).toEqual([
      { x: 1, y: 'A' },
      { x: 2, y: 'B' },
      { x: 3, y: 'C' },
    ]);
  });

  it('leaves out a category the chart drew no bar for', () => {
    const [layer] = layersOf(
      { series: [{ type: 'bar', names: CATEGORIES, values: [1, null, 3] }] },
      drawnChart(2, 0),
    );

    expect(layer.data as BarPoint[]).toEqual([{ x: 'A', y: 1 }, { x: 'C', y: 3 }]);
    // Two bars were drawn, so two selectors -- counting the data list would
    // have expected three and dropped the highlighting (#1002).
    expect(layer.selectors).toHaveLength(2);
  });

  it('is stacked when the series share a stack, and dodged when they do not', () => {
    const series = [
      { type: 'bar', names: CATEGORIES, values: [1, 2, 3], name: 'One' },
      { type: 'bar', names: CATEGORIES, values: [3, 1, 2], name: 'Two' },
    ];

    const [dodged] = layersOf({ series }, drawnChart(6, 0));
    expect(dodged.type).toBe(TraceType.DODGED);

    const [stacked] = layersOf(
      { series: series.map(one => ({ ...one, stack: 'total' })) },
      drawnChart(6, 0),
    );
    expect(stacked.type).toBe(TraceType.STACKED);
    expect((stacked.data as SegmentedPoint[][])[1]).toEqual([
      { x: 'A', y: 3, z: 'Two' },
      { x: 'B', y: 1, z: 'Two' },
      { x: 'C', y: 2, z: 'Two' },
    ]);
  });
});

describe('an eCharts line chart', () => {
  it('keeps a gap as a position with no reading', () => {
    // `LinePoint` can say it and `BarPoint` cannot: the samples either side
    // stay in their places instead of the series closing over the hole, and
    // it is not a zero (#925).
    const [layer] = layersOf(
      { series: [{ type: 'line', names: CATEGORIES, values: [1, null, 3] }] },
      drawnChart(0, 1),
    );

    expect(layer.type).toBe(TraceType.LINE);
    expect((layer.data as LinePoint[][])[0]).toEqual([
      { x: 'A', y: 1 },
      { x: 'B', y: null },
      { x: 'C', y: 3 },
    ]);
  });

  it('positions its samples by x when the axis carries numbers', () => {
    // A line on a `type: 'value'` x axis has no category names, so the
    // position is the coordinate itself -- and it is the **x** coordinate.
    // Taking y would announce every sample as sitting at its own magnitude.
    const [layer] = layersOf(
      { series: [{ type: 'line', values: [2, 4, 1], positions: [10, 20, 30] }] },
      drawnChart(0, 1),
    );

    expect((layer.data as LinePoint[][])[0]).toEqual([
      { x: 10, y: 2 },
      { x: 20, y: 4 },
      { x: 30, y: 1 },
    ]);
  });

  it('is an area when the series fills the band under it', () => {
    // `areaStyle` is what fills it, so it is what makes the chart an area
    // rather than a line -- read off the resolved option so an author cannot
    // mislabel one as the other.
    const [layer] = layersOf(
      {
        series: [{
          type: 'line',
          names: CATEGORIES,
          values: [1, 2, 3],
          areaStyle: {},
        }],
      },
      drawnChart(1, 1),
    );

    expect(layer.type).toBe(TraceType.AREA);
  });

  it('carries the staircase direction the series was drawn with', () => {
    const [held] = layersOf(
      { series: [{ type: 'line', names: CATEGORIES, values: [1, 2, 3], step: 'end' }] },
      drawnChart(0, 1),
    );
    expect(held.stepDirection).toBe('hv');

    const [jumped] = layersOf(
      { series: [{ type: 'line', names: CATEGORIES, values: [1, 2, 3], step: 'start' }] },
      drawnChart(0, 1),
    );
    expect(jumped.stepDirection).toBe('vh');
  });

  it('points at the polyline, which is what the chart drew', () => {
    const [layer] = layersOf(
      { series: [{ type: 'line', names: CATEGORIES, values: [1, 2, 3] }] },
      drawnChart(0, 1),
    );

    // One path per series rather than one per point, measured -- so the
    // selector is the whole line, as it is in every other adapter.
    expect(typeof layer.selectors).toBe('string');
  });
});

describe('an eCharts scatter chart', () => {
  it('reads its coordinates rather than a category index', () => {
    const [layer] = layersOf(
      {
        series: [{
          type: 'scatter',
          values: [2, 4, 1],
          positions: [1, 2, 3],
        }],
      },
      drawnChart(3, 0),
    );

    expect(layer.type).toBe(TraceType.SCATTER);
    expect(layer.data as ScatterPoint[]).toEqual([
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 1 },
    ]);
  });

  it('counts only the points it will emit', () => {
    // A point needs both coordinates to be drawn, and `scatterLayer` emits
    // only the ones that have them. The count the marks are checked against
    // has to ask the same question: counting the datum with no `x` would
    // expect three marks on a drawing that has two, the check would fail,
    // and the whole chart would lose its highlighting over a point that was
    // never on it.
    const [layer] = layersOf(
      {
        series: [{
          type: 'scatter',
          values: [2, 4, 1],
          positions: [1, null, 3],
        }],
      },
      drawnChart(2, 0),
    );

    expect(layer.data as ScatterPoint[]).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 1 },
    ]);
    expect(layer.selectors).toBeDefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('makes a sized symbol audible', () => {
    // A `symbolSize` reading a third column arrives as an extra dimension.
    // `ScatterPoint.z` carries it and `zIntensityFor()` sounds it (#826), so
    // dropping it would silence the thing the chart is drawn to show.
    const [layer] = layersOf(
      {
        series: [{
          type: 'scatter',
          values: [2, 4],
          positions: [1, 2],
          sizes: [10, 30],
        }],
      },
      drawnChart(2, 0),
    );

    expect(layer.data as ScatterPoint[]).toEqual([
      { x: 1, y: 2, z: 10 },
      { x: 2, y: 4, z: 30 },
    ]);
  });
});

describe('a chart drawing more than one kind of mark', () => {
  it('leaves both kinds pointing at what they drew', () => {
    // The two passes stamp different things -- bars per datum, lines per
    // series -- and each clears its own marks before writing. Sharing one
    // attribute made the line pass wipe what the bar pass had just written,
    // so every bar selector resolved to nothing while the line's still
    // worked. Found by running the adapter against the real library, and
    // invisible to any test that draws only one kind.
    const container = drawnChart(3, 1);
    const layers = layersOf(
      {
        series: [
          { type: 'bar', names: CATEGORIES, values: [1, 2, 3] },
          { type: 'line', names: CATEGORIES, values: [3, 2, 1] },
        ],
      },
      container,
    );

    const [bar, line] = layers;
    const barSelectors = bar.selectors as string[];
    expect(barSelectors).toHaveLength(3);
    barSelectors.forEach(selector =>
      expect(container.querySelector(selector)).not.toBeNull());

    expect(container.querySelector(line.selectors as string)).not.toBeNull();
  });
});

describe('what the adapter says it reads', () => {
  // `EChartsSeriesType` is exported from the package, so it is a promise to
  // consumers about which series this adapter accepts -- and `READ` is what
  // actually decides. They drifted once: tier 2b taught the adapter to read
  // `heatmap` and `candlestick` and left the union naming six types, so the
  // published type refused two series that work.
  //
  // Listing the union's members by hand is the only way to compare a type
  // with a value, so the list is checked against the union in both
  // directions at compile time, and against `READ` at run time. A type
  // added to one and not the others now fails here rather than in a
  // consumer's editor.
  const DECLARED = [
    'bar',
    'line',
    'scatter',
    'pie',
    'funnel',
    'gauge',
    'heatmap',
    'candlestick',
    'treemap',
    'sunburst',
    'tree',
    'sankey',
    'graph',
    'pictorialBar',
    'themeRiver',
    'parallel',
    'radar',
    'boxplot',
  ] as const;

  type Declared = typeof DECLARED[number];
  type Unlisted = Exclude<EChartsSeriesType, Declared>;
  type Invented = Exclude<Declared, EChartsSeriesType>;

  // The annotation is `true` only while the exclusion is `never`, so a type
  // in one and not the other makes the annotation `false` and the assignment
  // a compile error. `[T] extends [never]` rather than `T extends never`,
  // because the bare form distributes over a union and answers `never` for
  // every member rather than `false` once.
  //
  // Note what does *not* work here: annotating an empty array as
  // `Unlisted[]`. An empty array satisfies any element type, so it compiles
  // whatever the exclusion says -- a guard that cannot fail. This was
  // written that way first and proved vacuous when tested.
  const EVERY_TYPE_LISTED: [Unlisted] extends [never] ? true : false = true;
  const NO_TYPE_INVENTED: [Invented] extends [never] ? true : false = true;

  it('lists every member of the published union and no others', () => {
    expect(EVERY_TYPE_LISTED).toBe(true);
    expect(NO_TYPE_INVENTED).toBe(true);
  });

  it('reads exactly the series types it publishes', () => {
    expect(new Set<string>(DECLARED)).toEqual(READ);
  });
});

describe('an eCharts pictorial bar', () => {
  // `pictorialBar` swaps the rectangle for a repeated symbol and changes
  // nothing else. Measured on echarts 6.1.0: the model reports the same
  // `['x', 'y']` a plain bar does, `getName(i)` gives the same category, and
  // giving each datum its own `itemStyle.color` shows one filled mark per
  // datum in data order. So it takes the bar reading whole rather than
  // getting one of its own.
  it('is read as the bar it is, marks and all', () => {
    const [layer] = layersOf(
      { series: [{ type: 'pictorialBar', names: CATEGORIES, values: [3, 5, 2] }] },
      drawnChart(3, 0),
    );

    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'A', y: 3 },
      { x: 'B', y: 5 },
      { x: 'C', y: 2 },
    ]);
    expect(layer.selectors).toHaveLength(3);
  });

  it('shares one bar layer with a plain bar beside it', () => {
    // The two are the same shape, so a chart declaring both is one bar
    // reading rather than two that would each claim the whole category axis.
    const layers = layersOf(
      {
        series: [
          { type: 'bar', names: CATEGORIES, values: [1, 2, 3] },
          { type: 'pictorialBar', names: CATEGORIES, values: [4, 5, 6] },
        ],
      },
      drawnChart(6, 0),
    );

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.DODGED);
  });
});

describe('what the adapter will not claim', () => {
  it('refuses a chart of series it has no reading for', () => {
    // By name, rather than mapped onto whichever trace is closest. ECharts
    // and each wanted its own measured layout first (#1195). `pie` stood
    // here, then `treemap`, then `radar`, then `boxplot` -- all read now.
    // The subject is no longer a core type but one from outside it:
    // `wordCloud` is an ECharts *extension*, which core does not register
    // and this adapter has never measured. That is the case that has to keep
    // refusing, and unlike the others it cannot be read out from under the
    // test by the next tier.
    expect(() => layersOf(
      { series: [{ type: 'wordCloud', values: [1, 2, 3] }] },
      drawnChart(3, 0),
    )).toThrow(/Unsupported ECharts series type\(s\): wordCloud/);
  });

  it('drops the highlighting when the drawing holds a different number of marks', () => {
    const [layer] = layersOf(
      { series: [{ type: 'bar', names: CATEGORIES, values: [1, 2, 3] }] },
      drawnChart(2, 0),
    );

    expect(layer.selectors).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('ECharts mark count mismatch'),
    );
    // The reading survives; only the outline is gone.
    expect(layer.data as BarPoint[]).toHaveLength(3);
  });

  it('names a layer only when the author named the series', () => {
    // ECharts always resolves a name, inventing one for a series declared
    // without any, and emitting that would name a layer after a counter.
    const [named] = layersOf(
      { series: [{ type: 'bar', names: CATEGORIES, values: [1, 2, 3], name: 'Sales' }] },
      drawnChart(3, 0),
    );
    expect(named.name).toBe('Sales');

    const [unnamed] = layersOf(
      { series: [{ type: 'bar', names: CATEGORIES, values: [1, 2, 3] }] },
      drawnChart(3, 0),
    );
    expect(unnamed.name).toBeUndefined();
  });
});

describe('what the figure says about itself', () => {
  it('takes the axis names and the title the author wrote', () => {
    const figure = createMaidrFromEChart(
      fakeInstance({
        title: 'Visitors',
        xName: 'Day',
        yName: 'Count',
        series: [{ type: 'bar', names: CATEGORIES, values: [1, 2, 3] }],
      }),
      drawnChart(3, 0),
    );

    expect(figure.title).toBe('Visitors');
    const [layer] = figure.subplots[0][0].layers;
    expect(layer.axes?.x?.label).toBe('Day');
    expect(layer.axes?.y?.label).toBe('Count');
  });

  it('leaves an unnamed axis unlabelled rather than inventing one', () => {
    const [layer] = layersOf(
      { series: [{ type: 'bar', names: CATEGORIES, values: [1, 2, 3] }] },
      drawnChart(3, 0),
    );

    expect(layer.axes?.x?.label).toBeUndefined();
    expect(layer.axes?.y?.label).toBeUndefined();
  });
});
