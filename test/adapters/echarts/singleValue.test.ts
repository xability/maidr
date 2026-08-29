/**
 * @jest-environment jsdom
 */

/**
 * The ECharts series that carry one magnitude per named thing (#1195, tier 2a).
 *
 * A pie, a funnel and a gauge sit on no grid, own the whole chart, and report
 * `data.dimensions` as `['value']` with the label on `getName(i)` -- measured
 * on echarts 6.1.0, not read from the documentation. So the reading is that
 * pair, and what these cases are about is where each of the three puts it.
 *
 * The selectors are checked through the traces that consume them rather than
 * by resolving the strings, which is the lesson tier 1 paid for (#1196): each
 * trace class accepts a different shape, and a layer whose selectors are
 * individually right and collectively the wrong shape resolves nothing at
 * all, silently.
 */

import type { EChartsInstance, EChartsList, EChartsSeriesModel } from '@adapters/echarts/types';
import type { BarPoint, GaugePoint, MaidrLayer, PiePoint } from '@type/grammar';
import type { TraceState } from '@type/state';
import { createMaidrFromEChart } from '@adapters/echarts/converters';
import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FunnelTrace } from '@model/funnel';
import { PieTrace } from '@model/pie';
import { Orientation, TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface FakeSeries {
  type: string;
  names?: (string | undefined)[];
  values: (number | null)[];
  name?: string;
  min?: number;
  max?: number;
  /** ECharts' own name for the direction a funnel's STAGES progress. */
  orient?: 'vertical' | 'horizontal';
}

function fakeSeriesModel(series: FakeSeries): EChartsSeriesModel {
  const options: Record<string, unknown> = {
    name: series.name,
    min: series.min,
    max: series.max,
    orient: series.orient,
  };
  const list: EChartsList = {
    dimensions: ['value'],
    count: () => series.values.length,
    getName: index => series.names?.[index] ?? '',
    get: (_dimension, index) => series.values[index],
  };

  return {
    subType: series.type,
    name: series.name ?? 'series 0',
    getData: () => list,
    get: key => options[key],
  };
}

function fakeInstance(series: FakeSeries[]): EChartsInstance {
  return {
    getModel: () => ({
      eachSeries: (callback) => {
        series.forEach((one, index) => callback(fakeSeriesModel(one), index));
      },
      // A pie, a funnel and a gauge declare no axes at all, which is part of
      // what makes them a family of their own.
      eachComponent: () => {},
    }),
  };
}

/**
 * The document ECharts drew: one filled path per slice or stage, and the
 * unfilled label guides beside them that the paint filter must decline.
 *
 * @param marks - How many data marks the chart drew
 * @returns The container the chart was rendered into
 */
function drawnChart(marks: number): HTMLElement {
  document.body.innerHTML = '<div id="chart"></div>';
  const container = document.getElementById('chart') as HTMLElement;
  const svg = document.createElementNS(SVG_NS, 'svg');

  const add = (id: string, attributes: Record<string, string>): void => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('id', id);
    Object.entries(attributes).forEach(([key, value]) => path.setAttribute(key, value));
    svg.appendChild(path);
  };

  for (let index = 0; index < marks; index++) {
    add(`mark-${index}`, { fill: '#5070dd' });
    // The guide line a pie draws out to each label: stroked, unfilled, and
    // exactly as numerous as the slices, so a filter that counted it would
    // find twice what it expected.
    add(`guide-${index}`, { fill: 'none', stroke: '#5070dd' });
  }

  container.appendChild(svg);
  return container;
}

function layerFor(series: FakeSeries, marks: number): MaidrLayer {
  const container = drawnChart(marks);
  const layer = createMaidrFromEChart(fakeInstance([series]), container)
    .subplots[0][0]
    .layers[0];
  if (!layer) {
    throw new Error('no layer emitted');
  }
  return layer;
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
function highlighted(
  cursor: Cursor,
  row: number,
  col: number,
): string[] {
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

describe('an eCharts pie chart', () => {
  it('is read as the slices it draws, named and measured', () => {
    const layer = layerFor(
      { type: 'pie', names: ['A', 'B', 'C'], values: [1, 2, 3], name: 'Share' },
      3,
    );

    expect(layer.type).toBe(TraceType.PIE);
    expect(layer.name).toBe('Share');
    expect(layer.data as PiePoint[]).toEqual([
      { x: 'A', y: 1 },
      { x: 'B', y: 2 },
      { x: 'C', y: 3 },
    ]);
  });

  it('names every slice at once, which is the shape PieTrace reads', () => {
    // `PieTrace` casts `layer.selectors` to `string`, and
    // `Svg.selectAllElements` declines anything that is not one, so a list
    // here would resolve nothing and lose the highlighting in silence.
    const layer = layerFor(
      { type: 'pie', names: ['A', 'B', 'C'], values: [1, 2, 3] },
      3,
    );

    expect(typeof layer.selectors).toBe('string');
    const trace = new PieTrace(layer);
    expect(highlighted(trace, 0, 0)).toEqual(['mark-0']);
    expect(highlighted(trace, 0, 2)).toEqual(['mark-2']);
  });

  it('names a slice the author left unnamed', () => {
    // A slice with no name is still a slice, and `PiePoint.x` is what a
    // reader is told they are on.
    const layer = layerFor(
      { type: 'pie', names: ['A', undefined, 'C'], values: [1, 2, 3] },
      3,
    );

    expect((layer.data as PiePoint[])[1].x).toBe('Slice 2');
  });
});

describe('a single-value datum with no number', () => {
  it('is left out rather than announced as a slice of nothing', () => {
    // ECharts draws nothing for it, so reading it would put a slice on the
    // chart that is not there -- and the mark count would then expect three
    // where two were drawn, costing the other two their outline as well.
    const layer = layerFor(
      { type: 'pie', names: ['A', 'B', 'C'], values: [1, null, 3] },
      2,
    );

    expect(layer.data as PiePoint[]).toEqual([
      { x: 'A', y: 1 },
      { x: 'C', y: 3 },
    ]);
    expect(layer.selectors).toBeDefined();
  });

  it('leaves a chart with nothing to read out of the figure', () => {
    // Not an empty layer: a layer a reader can land on and hear nothing from
    // is worse than one that is not there (#421 makes the same call in
    // py-maidr).
    const container = drawnChart(0);
    expect(() => createMaidrFromEChart(
      fakeInstance([{ type: 'pie', names: ['A'], values: [null] }]),
      container,
    )).not.toThrow();
    expect(
      createMaidrFromEChart(
        fakeInstance([{ type: 'pie', names: ['A'], values: [null] }]),
        container,
      ).subplots[0][0].layers,
    ).toHaveLength(0);
  });
});

describe('an eCharts funnel chart', () => {
  it('keeps its stages in the order they were drawn', () => {
    // The order is the reading: MAIDR pitches each stage against the one
    // before it, so a sorted funnel would announce a retention the chart
    // never showed.
    //
    // The pair reads `{x: count, y: stage}` because an ECharts funnel's
    // default `orient: 'vertical'` stacks its stages down the page and
    // encodes the value as each band's WIDTH -- measured in Chromium,
    // uniform heights of 80 against widths of 360/216/72 for values
    // 100/60/20 -- so the magnitude runs horizontally and `FunnelTrace`,
    // which extends `BarTrace`, reads it off `x`.
    const layer = layerFor(
      {
        type: 'funnel',
        names: ['Visit', 'Cart', 'Buy'],
        values: [100, 60, 30],
      },
      3,
    );

    expect(layer.type).toBe(TraceType.FUNNEL);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data as BarPoint[]).toEqual([
      { x: 100, y: 'Visit' },
      { x: 60, y: 'Cart' },
      { x: 30, y: 'Buy' },
    ]);
  });

  it('reads an `orient: horizontal` funnel as the upright one it is', () => {
    // The transpose of the default, and the one place ECharts' word and
    // MAIDR's agree on neither: ECharts names the direction the stages
    // progress, MAIDR the direction the magnitude runs. Measured in Chromium,
    // `orient: 'horizontal'` draws uniform widths of 120 against heights of
    // 240/144/48 for values 100/60/30 -- the value is a vertical extent, so
    // the layer is the upright one and keeps `{x: stage, y: count}`.
    const layer = layerFor(
      {
        type: 'funnel',
        orient: 'horizontal',
        names: ['Visit', 'Cart', 'Buy'],
        values: [100, 60, 30],
      },
      3,
    );

    expect(layer.orientation).toBeUndefined();
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Visit', y: 100 },
      { x: 'Cart', y: 60 },
      { x: 'Buy', y: 30 },
    ]);
    expect(layer.axes).toEqual({ x: { label: 'Stage' }, y: { label: 'Count' } });
  });

  it('names each stage separately, which is the shape FunnelTrace reads', () => {
    // `FunnelTrace` extends `BarTrace`, whose array branch takes one selector
    // per mark and declines a nested list.
    const layer = layerFor(
      {
        type: 'funnel',
        names: ['Visit', 'Cart', 'Buy'],
        values: [100, 60, 30],
      },
      3,
    );

    expect(layer.selectors).toHaveLength(3);
    const trace = new FunnelTrace(layer);
    expect(highlighted(trace, 0, 0)).toEqual(['mark-0']);
    expect(highlighted(trace, 0, 2)).toEqual(['mark-2']);
  });
});

describe('an eCharts gauge', () => {
  it('is read against the dial it was drawn on', () => {
    const layer = layerFor(
      { type: 'gauge', names: ['Speed'], values: [70], min: 10, max: 200 },
      2,
    );

    expect(layer.type).toBe(TraceType.GAUGE);
    expect(layer.data as GaugePoint).toEqual({
      value: 70,
      min: 10,
      max: 200,
      label: 'Speed',
    });
  });

  it('takes ECharts\' own dial when the author wrote none', () => {
    // `getModel()` resolves the defaults, so 0 and 100 are the numbers the
    // chart was actually drawn with rather than a guess made here.
    const layer = layerFor({ type: 'gauge', values: [70] }, 2);

    expect(layer.data as GaugePoint).toEqual({ value: 70, min: 0, max: 100 });
  });

  it('is read without an outline rather than outlined wrongly', () => {
    // A gauge draws two filled marks for its one datum -- the track and the
    // progress arc -- so the count check has nothing to check, and naming
    // either one would be a guess about which the reader should be shown.
    const layer = layerFor({ type: 'gauge', values: [70] }, 2);

    expect(layer.selectors).toBeUndefined();
  });
});

describe('a gauge with more than one pointer', () => {
  it('reads every needle rather than the first', () => {
    // Measured: a two-entry gauge reports `count() === 2` and draws two
    // needles on one dial. `GaugePoint` is a single reading, so the two come
    // out as two layers -- what that loses is that they share a dial, and
    // nothing in the grammar carries it.
    const container = drawnChart(2);
    const layers = createMaidrFromEChart(
      fakeInstance([{
        type: 'gauge',
        names: ['A', 'B'],
        values: [30, 70],
        min: 0,
        max: 100,
      }]),
      container,
    ).subplots[0][0].layers;

    expect(layers).toHaveLength(2);
    expect(layers[0].data as GaugePoint).toEqual({
      value: 30,
      min: 0,
      max: 100,
      label: 'A',
    });
    expect(layers[1].data as GaugePoint).toEqual({
      value: 70,
      min: 0,
      max: 100,
      label: 'B',
    });
  });
});

describe('a chart that declares both families', () => {
  it('reads the single-value half and says what it left out', () => {
    // A pie has no grid to share with a bar, so this is not a chart ECharts
    // is drawn to make -- but it is not invalid either, and dropping half of
    // it in silence is the failure mode this adapter exists to avoid.
    const container = drawnChart(3);
    const layers = createMaidrFromEChart(
      fakeInstance([
        { type: 'pie', names: ['A', 'B', 'C'], values: [1, 2, 3] },
        { type: 'bar', names: ['A'], values: [1] },
      ]),
      container,
    ).subplots[0][0].layers;

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.PIE);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('ignoring: bar'),
    );
  });
});

describe('an eCharts chart of a type outside the set', () => {
  // `treemap` stood here until tier 3 gave it a reading, then `radar` until
  // its outline turned out to be a stroked polyline after all, then
  // `boxplot`. Every core type is read now, so the subject is `wordCloud` --
  // an ECharts extension core does not register and this adapter has never
  // measured.
  it('is refused rather than read as whichever trace is closest', () => {
    expect(() => layerFor({ type: 'wordCloud', values: [1] }, 1))
      .toThrow(/Unsupported ECharts series type/);
  });

  it('names the single-value types among the ones it does read', () => {
    expect(() => layerFor({ type: 'wordCloud', values: [1] }, 1))
      .toThrow(/pie, funnel, gauge/);
  });
});
