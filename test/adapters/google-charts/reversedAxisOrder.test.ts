/**
 * A Google Chart on a reversed category axis has to be read the way it is
 * drawn (#1020).
 *
 * `hAxis: {direction: -1}` reverses which end the categories start at, while
 * Google goes on emitting the rects in DataTable row order — so a layer
 * emitted as written is announced as the mirror image of the chart.
 *
 * Measured on the real library in Chromium (reached by relaying the gstatic
 * requests through Node, which has the egress proxy the browser lacks), for
 * `Sat: 87, Sun: 76, Thu: 62, Fri: 19`:
 *
 *   plain
 *     tick labels L→R:  Sat, Sun, Thu, Fri
 *     rects in DOM order (x, height):  133/213  226/186  318/152  411/46
 *
 *   hAxis: {direction: -1}
 *     tick labels L→R:  Fri, Thu, Sun, Sat
 *     rects in DOM order (x, height):  411/213  318/186  226/152  133/46
 *
 * The draw options never reach this adapter, but they do not have to. The
 * layout interface reports where each row was placed, and the same run gave:
 *
 *   plain                     getXLocation(0) = 162   getXLocation(3) = 439
 *   hAxis: {direction: -1}    getXLocation(0) = 439   getXLocation(3) = 162
 *
 * which is the interface `markBarElements` already calls to find the rects.
 */
import type {
  GoogleBoundingBox,
  GoogleChart,
  GoogleDataTable,
} from '@adapters/google-charts/types';
import type { BarPoint, MaidrLayer } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The categories in the order the DataTable lists them. */
const LISTED = ['Sat', 'Sun', 'Thu', 'Fri'];
/** The same categories in the order a reversed axis draws them. */
const DRAWN = ['Fri', 'Thu', 'Sun', 'Sat'];

const ROWS: Array<[string, number]> = [['Sat', 87], ['Sun', 76], ['Thu', 62], ['Fri', 19]];

/**
 * A DataTable of one category column and one magnitude column.
 * @returns The fake table
 */
function makeDataTable(): GoogleDataTable {
  const labels = ['Day', 'Tips'];
  return {
    getNumberOfRows: () => ROWS.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => ROWS[r][c],
    getFormattedValue: (r, c) => String(ROWS[r][c]),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 0 ? 'string' : 'number'),
  };
}

/**
 * Where row `index` is drawn, counted from whichever end the axis starts at.
 * @param index - The row
 * @param reversed - Whether the axis runs the other way
 * @returns The left edge
 */
function leftOf(index: number, reversed: boolean): number {
  const step = 40;
  return reversed ? 20 + (ROWS.length - 1 - index) * step : 20 + index * step;
}

/**
 * A drawn chart whose layout interface places the rows the way the axis runs.
 * @param reversed - Whether the category axis is reversed
 * @returns The fake chart
 */
function makeChart(reversed: boolean): GoogleChart {
  const box = (index: number): GoogleBoundingBox =>
    ({ left: leftOf(index, reversed), top: 30, width: 24, height: 100 });
  return {
    getSelection: () => [],
    setSelection: () => {},
    getChartLayoutInterface: () => ({
      getBoundingBox: (id) => {
        const bar = /^bar#0#(\d+)$/.exec(id);
        if (!bar)
          return null;
        const index = Number(bar[1]);
        return index < ROWS.length ? box(index) : null;
      },
      // The measured signal: ascending means left-to-right, descending means
      // the last row is drawn before the first.
      getXLocation: value => leftOf(Number(value), reversed),
      getYLocation: value => Number(value),
    }),
  };
}

/**
 * A rendered chart carrying one rect per row, in DataTable order — which is
 * what Google emits whichever way the axis runs.
 * @param reversed - Whether the category axis is reversed
 * @returns The container
 */
function makeContainer(reversed: boolean): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="rev-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('rev-chart') as HTMLElement;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);

  for (let i = 0; i < ROWS.length; i++) {
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', `${leftOf(i, reversed)}`);
    rect.setAttribute('y', '30');
    rect.setAttribute('width', '24');
    rect.setAttribute('height', '100');
    // Named after the datum it draws, so a resolved selector can say which.
    rect.setAttribute('data-datum', LISTED[i]);
    svg.appendChild(rect);
  }

  return container;
}

/**
 * The layer a chart converts to, and the document it was drawn in.
 * @param reversed - Whether the category axis is reversed
 * @returns The layer and its container
 */
function build(reversed: boolean): { layer: MaidrLayer; container: HTMLElement } {
  const container = makeContainer(reversed);
  const maidr = createMaidrFromGoogleChart(
    makeChart(reversed),
    makeDataTable(),
    container,
    { chartType: 'ColumnChart' },
  );
  return { layer: maidr.subplots[0][0].layers[0], container };
}

/** The categories of a bar layer, in the order it emits them. */
function categoriesOf(layer: MaidrLayer): unknown[] {
  return (layer.data as BarPoint[]).map(p => p.x);
}

describe('a google chart on a reversed category axis', () => {
  it('leads with the category drawn leftmost', () => {
    // Before the fix this was ['Sat', 'Sun', 'Thu', 'Fri'] — the exact reverse
    // of what the chart draws.
    expect(categoriesOf(build(true).layer)).toEqual(DRAWN);
  });

  it('carries each value with its own category', () => {
    const points = build(true).layer.data as BarPoint[];

    expect(points.find(p => p.x === 'Sat')?.y).toBe(87);
    expect(points.find(p => p.x === 'Fri')?.y).toBe(19);
  });

  it('leaves an ordinary chart alone', () => {
    expect(categoriesOf(build(false).layer)).toEqual(LISTED);
  });
});

describe('the highlight follows the categories', () => {
  it('names each bar instead of leaving one selector to resolve', () => {
    const { layer } = build(true);

    expect(Array.isArray(layer.selectors)).toBe(true);
    expect(layer.selectors).toHaveLength(4);
  });

  it('points selector 0 at the bar the reading leads with', () => {
    const { layer, container } = build(true);
    const selectors = layer.selectors as string[];
    const doc = container.ownerDocument;

    // The payload leads with Fri, whose rect Google emitted last.
    expect(doc.querySelector(selectors[0])?.getAttribute('data-datum')).toBe('Fri');
    expect(doc.querySelector(selectors[3])?.getAttribute('data-datum')).toBe('Sat');
  });

  it('gives every category its own selector', () => {
    const { layer, container } = build(true);
    const doc = container.ownerDocument;
    const found = (layer.selectors as string[])
      .map(s => doc.querySelector(s)?.getAttribute('data-datum'));

    expect(found).toEqual(categoriesOf(layer));
  });

  it('leaves an ordinary chart on its single selector', () => {
    expect(typeof build(false).layer.selectors).toBe('string');
  });
});
