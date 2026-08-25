/**
 * @jest-environment jsdom
 */

/**
 * The ECharts adapter's selectors, resolved by the traces that consume them.
 *
 * `cartesian.test.ts` checks that each selector string the adapter emits finds
 * the element it means to, and that is a weaker claim than it looks: a trace
 * only ever reaches those strings through `mapToSvgElements`, and each trace
 * class accepts a different *shape*. A layer whose selectors are individually
 * correct and collectively the wrong shape resolves nothing at all, silently,
 * on a chart whose payload is otherwise perfect.
 *
 * Two of the four layers this adapter emits were exactly that:
 *
 * - **scatter** carried one selector per point. `ScatterTrace` reads
 *   `layer.selectors as string` and hands it to `Svg.selectAllElements`,
 *   whose `isUsableSelector` guard requires `typeof query === 'string'`, so
 *   an array matched nothing and every ECharts scatter highlighted nothing.
 *   The shape it wants is one selector naming the whole series at once.
 * - **stacked and dodged** carried every cell's selector flattened into one
 *   list. `SegmentedTrace.mapToSvgElements` routes an array to
 *   `mapGridToSvgElements`, which wants a row per series and declines a flat
 *   list -- for the reason its own comment gives, that a flat list says which
 *   bars there are but not which cell each one is in.
 *
 * Both are the same mistake `Svg.isUsableSelector` was written for (#990) and
 * both failed the same way: no highlight, no warning, nothing in the payload
 * to suggest anything was wrong. So these cases stop at the trace rather than
 * at the selector string, and each asserts that a navigated cell resolves to
 * the mark the adapter stamped for it.
 */

import type { EChartsInstance, EChartsList, EChartsSeriesModel } from '@adapters/echarts/types';
import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { TraceState } from '@type/state';
import { createMaidrFromEChart } from '@adapters/echarts/converters';
import { afterEach, describe, expect, it } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { LineTrace } from '@model/line';
import { ScatterTrace } from '@model/scatter';
import { SegmentedTrace } from '@model/segmented';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CATEGORIES = ['A', 'B', 'C'];

interface FakeSeries {
  type: string;
  names?: string[];
  values: (number | null)[];
  positions?: number[];
  name?: string;
  stack?: string;
}

function fakeList(series: FakeSeries): EChartsList {
  return {
    dimensions: ['x', 'y'],
    count: () => series.values.length,
    getName: index => series.names?.[index] ?? '',
    get: (dimension, index) => (dimension === 'y'
      ? series.values[index]
      : series.positions?.[index] ?? index),
  };
}

function fakeSeriesModel(series: FakeSeries): EChartsSeriesModel {
  const options: Record<string, unknown> = {
    name: series.name,
    stack: series.stack,
  };
  return {
    subType: series.type,
    name: series.name ?? 'series 0',
    getData: () => fakeList(series),
    get: key => options[key],
  };
}

function fakeInstance(series: FakeSeries[]): EChartsInstance {
  return {
    getModel: () => ({
      eachSeries: (callback) => {
        series.forEach((one, index) => callback(fakeSeriesModel(one), index));
      },
      eachComponent: (query, callback) => {
        const components: Record<string, Record<string, unknown>[]> = {
          xAxis: [{ type: 'category' }],
          yAxis: [{ type: 'value' }],
          title: [],
        };
        (components[query.mainType] ?? []).forEach((options, index) =>
          callback({ get: key => options[key] }, index));
      },
    }),
  };
}

/**
 * The document ECharts drew.
 *
 * This file runs in the jsdom environment rather than the node one its
 * siblings use, because a trace is not a pure function of its layer: building
 * a `LineTrace` reaches `Svg.createCircleElement`, which asks
 * `window.getComputedStyle` for the line's paint. `cartesian.test.ts` never
 * constructs one and so never needs a window; nothing here can avoid it.
 *
 * Every mark is given an id of its own so a resolved element can say which
 * mark it is -- the ids are the fixture's, not the adapter's, which addresses
 * marks only by the attribute it stamps.
 *
 * @param marks - How many filled marks the chart drew
 * @param lines - How many stroked polylines it drew
 * @returns The container the chart was rendered into
 */
function drawnChart(marks: number, lines: number): HTMLElement {
  document.body.innerHTML = '<div id="chart"></div>';
  // jsdom builds every SVG child as a plain `SVGElement` and defines neither
  // constructor, so `LineTrace`'s `instanceof SVGPathElement` throws a
  // ReferenceError unless a test binds them (#1001).
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.SVGPathElement = globals.SVGElement;
  globals.SVGPolylineElement = class NeverAPolyline {};

  const container = document.getElementById('chart') as HTMLElement;
  const svg = document.createElementNS(SVG_NS, 'svg');

  const add = (id: string, attributes: Record<string, string>): void => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('id', id);
    Object.entries(attributes).forEach(([key, value]) => path.setAttribute(key, value));
    svg.appendChild(path);
  };

  add('grid', { fill: 'none', stroke: '#dbdee4' });
  for (let index = 0; index < marks; index++) {
    // A symbol as ECharts writes one: a unit shape about the origin, scaled
    // and moved into place by a matrix, so the mark's centre is the last two
    // numbers and the `d` says nothing about where it is. Measured on
    // echarts 6.1.0 -- `matrix(2.937,0,0,2.937,240,235)`, `d="M1 0A1 1 …"`.
    add(`mark-${index}`, {
      fill: '#5070dd',
      d: 'M1 0A1 1 0 1 1 1 -0.0001',
      transform: `matrix(2.937,0,0,2.937,${100 + index * 50},${200 - index * 10})`,
    });
  }
  for (let index = 0; index < lines; index++) {
    add(`line-${index}`, {
      'fill': 'none',
      'stroke': '#5070dd',
      'stroke-width': '2',
      'd': 'M0 100L50 90L100 80',
    });
  }

  container.appendChild(svg);
  return container;
}

function layerFor(series: FakeSeries[], marks: number, lines: number): MaidrLayer {
  const container = drawnChart(marks, lines);
  const layer = createMaidrFromEChart(fakeInstance(series), container)
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

afterEach(() => {
  const globals = globalThis as unknown as Record<string, unknown>;
  delete globals.SVGPathElement;
  delete globals.SVGPolylineElement;
  document.body.innerHTML = '';
});

describe('an eCharts bar layer', () => {
  it('outlines the bar the reader is on', () => {
    const layer = layerFor(
      [{ type: 'bar', names: CATEGORIES, values: [1, 2, 3] }],
      3,
      0,
    );
    const trace = new BarTrace(layer);

    expect(highlighted(trace, 0, 0)).toEqual(['mark-0']);
    expect(highlighted(trace, 0, 2)).toEqual(['mark-2']);
  });
});

describe('an eCharts stacked bar layer', () => {
  it('outlines the segment the reader is on, not nothing at all', () => {
    // Six marks: three categories in each of two series, series-major, which
    // is the order ECharts draws them in.
    const layer = layerFor(
      [
        { type: 'bar', names: CATEGORIES, values: [1, 2, 3], name: 'one', stack: 'total' },
        { type: 'bar', names: CATEGORIES, values: [4, 5, 6], name: 'two', stack: 'total' },
      ],
      6,
      0,
    );
    const trace = new SegmentedTrace(layer);
    const rows = layer.data as SegmentedPoint[][];

    expect(rows).toHaveLength(2);
    expect(highlighted(trace, 0, 0)).toEqual(['mark-0']);
    expect(highlighted(trace, 0, 2)).toEqual(['mark-2']);
    expect(highlighted(trace, 1, 0)).toEqual(['mark-3']);
    expect(highlighted(trace, 1, 2)).toEqual(['mark-5']);
  });
});

describe('an eCharts dodged bar layer', () => {
  it('outlines the bar the reader is on, not nothing at all', () => {
    const layer = layerFor(
      [
        { type: 'bar', names: CATEGORIES, values: [1, 2, 3], name: 'one' },
        { type: 'bar', names: CATEGORIES, values: [4, 5, 6], name: 'two' },
      ],
      6,
      0,
    );
    const trace = new SegmentedTrace(layer);

    expect(highlighted(trace, 0, 1)).toEqual(['mark-1']);
    expect(highlighted(trace, 1, 1)).toEqual(['mark-4']);
  });
});

describe('an eCharts scatter layer', () => {
  it('outlines the point the reader is on, not nothing at all', () => {
    const layer = layerFor(
      [{ type: 'scatter', values: [1, 2, 3], positions: [10, 20, 30] }],
      3,
      0,
    );
    const trace = new ScatterTrace(layer);

    // A scatter navigates by x, and each x here holds one point.
    expect(highlighted(trace, 0, 0)).toEqual(['mark-0']);
    expect(highlighted(trace, 0, 2)).toEqual(['mark-2']);
  });
});

describe('two eCharts scatter series', () => {
  it('each outline only their own points', () => {
    // Every mark on the chart is painted alike and stamped in one pass, so
    // the stamp has to say which series a mark belongs to as well as which
    // datum it is. Naming them all alike would put the second series' points
    // on the first series' outline -- and with one series on the chart, which
    // is what every other case here has, the two are indistinguishable.
    const container = drawnChart(5, 0);
    const layers = createMaidrFromEChart(
      fakeInstance([
        { type: 'scatter', values: [1, 2], positions: [10, 20], name: 'one' },
        { type: 'scatter', values: [3, 4, 5], positions: [30, 40, 50], name: 'two' },
      ]),
      container,
    ).subplots[0][0].layers;

    expect(layers).toHaveLength(2);
    const first = new ScatterTrace(layers[0]);
    const second = new ScatterTrace(layers[1]);

    expect(highlighted(first, 0, 0)).toEqual(['mark-0']);
    expect(highlighted(first, 0, 1)).toEqual(['mark-1']);
    expect(highlighted(second, 0, 0)).toEqual(['mark-2']);
    expect(highlighted(second, 0, 2)).toEqual(['mark-4']);
  });
});

describe('an eCharts line layer', () => {
  it('outlines the line the reader is on', () => {
    const layer = layerFor(
      [{ type: 'line', names: CATEGORIES, values: [1, 2, 3] }],
      0,
      1,
    );
    const trace = new LineTrace(layer);

    expect(highlighted(trace, 0, 0)).not.toEqual([]);
  });
});
