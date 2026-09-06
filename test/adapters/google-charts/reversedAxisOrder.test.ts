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
 *
 * A horizontal `BarChart` puts its categories on the **vertical** axis, so it
 * is `getYLocation` that answers there. Measured on the same library:
 *
 *   BarChart, plain                  labels top→bottom: Sat, Sun, Thu, Fri
 *                                    getYLocation(0) = 108   (3) = 293
 *   BarChart, vAxis: {direction:-1}  labels top→bottom: Fri, Thu, Sun, Sat
 *                                    getYLocation(0) = 293   (3) = 108
 *
 * and on that reversed chart `getXLocation` read 116 then 127 — ascending, and
 * unchanged from the plain one, because it is the magnitude axis. Both
 * orientations are exercised below for that reason: a first version of this
 * suite covered `ColumnChart` only and was hiding a check that never fired on
 * a horizontal chart at all.
 */
import type {
  GoogleBoundingBox,
  GoogleChart,
  GoogleDataTable,
} from '@adapters/google-charts/types';
import type { BarPoint, MaidrLayer, SegmentedPoint } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { describe, expect, it } from '@jest/globals';
import { Orientation } from '@type/grammar';
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
function makeChart(reversed: boolean, horizontal = false): GoogleChart {
  const box = (index: number): GoogleBoundingBox => (horizontal
    ? { left: 20, top: leftOf(index, reversed), width: 100, height: 24 }
    : { left: leftOf(index, reversed), top: 30, width: 24, height: 100 });
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
      // The measured signal, on whichever axis carries the categories:
      // ascending means the rows run from the near end, descending means the
      // last is drawn before the first. The other axis is the magnitude one,
      // and stands still whichever way the categories were drawn — which is
      // what asking it instead would have bought.
      getXLocation: value => (horizontal ? 116 + Number(value) * 4 : leftOf(Number(value), reversed)),
      getYLocation: value => (horizontal ? leftOf(Number(value), reversed) : 100 + Number(value) * 4),
    }),
  };
}

/**
 * A rendered chart carrying one rect per row, in DataTable order — which is
 * what Google emits whichever way the axis runs.
 * @param reversed - Whether the category axis is reversed
 * @returns The container
 */
function makeContainer(reversed: boolean, horizontal = false): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="rev-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('rev-chart') as HTMLElement;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);

  for (let i = 0; i < ROWS.length; i++) {
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', horizontal ? '20' : `${leftOf(i, reversed)}`);
    rect.setAttribute('y', horizontal ? `${leftOf(i, reversed)}` : '30');
    rect.setAttribute('width', horizontal ? '100' : '24');
    rect.setAttribute('height', horizontal ? '24' : '100');
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
function build(reversed: boolean, horizontal = false): { layer: MaidrLayer; container: HTMLElement } {
  const container = makeContainer(reversed, horizontal);
  const maidr = createMaidrFromGoogleChart(
    makeChart(reversed, horizontal),
    makeDataTable(),
    container,
    { chartType: horizontal ? 'BarChart' : 'ColumnChart' },
  );
  return { layer: maidr.subplots[0][0].layers[0], container };
}

/**
 * The categories of a bar layer, in the order it emits them.
 *
 * A horizontal layer is written the way `BarTrace` reads one — magnitude in
 * `x`, category in `y` (#955) — so which field holds the category follows the
 * orientation rather than the axis it was drawn against.
 */
function categoriesOf(layer: MaidrLayer): unknown[] {
  const horizontal = layer.orientation === Orientation.HORIZONTAL;
  return (layer.data as BarPoint[]).map(p => (horizontal ? p.y : p.x));
}

/**
 * A two-column table, which routes a `ColumnChart` to the segmented reading.
 * @returns The fake table
 */
function makeSegmentedDataTable(): GoogleDataTable {
  const labels = ['Day', 'Tips', 'Bills'];
  const valueAt = (r: number, c: number): number =>
    (c === 2 ? ROWS[r][1] / 2 : (ROWS[r][c] as number));
  return {
    getNumberOfRows: () => ROWS.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => (c === 0 ? ROWS[r][0] : valueAt(r, c)),
    getFormattedValue: (r, c) => String(c === 0 ? ROWS[r][0] : valueAt(r, c)),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 0 ? 'string' : 'number'),
  };
}

/**
 * Where the two-series chart draws bar `index` of `series`.
 * @param series - Which series
 * @param index - The row
 * @param reversed - Whether the category axis is reversed
 * @returns The bar's box
 */
function segmentBox(series: number, index: number, reversed: boolean): GoogleBoundingBox {
  return { left: leftOf(index, reversed), top: 30 + series * 200, width: 24, height: 100 };
}

/**
 * A drawn two-series chart whose layout places both series.
 * @param reversed - Whether the category axis is reversed
 * @returns The fake chart
 */
function makeSegmentedChart(reversed: boolean): GoogleChart {
  return {
    getSelection: () => [],
    setSelection: () => {},
    getChartLayoutInterface: () => ({
      getBoundingBox: (id) => {
        const bar = /^bar#(\d+)#(\d+)$/.exec(id);
        if (!bar)
          return null;
        const index = Number(bar[2]);
        return index < ROWS.length ? segmentBox(Number(bar[1]), index, reversed) : null;
      },
      getXLocation: value => leftOf(Number(value), reversed),
      getYLocation: value => 100 + Number(value) * 4,
    }),
  };
}

/**
 * A rendered two-series chart, its rects in series-major DOM order.
 * @param reversed - Whether the category axis is reversed
 * @returns The container
 */
function makeSegmentedContainer(reversed: boolean): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="rev-seg-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('rev-seg-chart') as HTMLElement;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);

  for (let series = 0; series < 2; series++) {
    for (let i = 0; i < ROWS.length; i++) {
      const box = segmentBox(series, i, reversed);
      const rect = doc.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', `${box.left}`);
      rect.setAttribute('y', `${box.top}`);
      rect.setAttribute('width', `${box.width}`);
      rect.setAttribute('height', `${box.height}`);
      rect.setAttribute('data-datum', `s${series}-${LISTED[i]}`);
      svg.appendChild(rect);
    }
  }

  return container;
}

/**
 * The segmented layer a two-series chart converts to.
 * @param reversed - Whether the category axis is reversed
 * @returns The layer and its container
 */
function buildSegmented(reversed: boolean): { layer: MaidrLayer; container: HTMLElement } {
  const container = makeSegmentedContainer(reversed);
  const maidr = createMaidrFromGoogleChart(
    makeSegmentedChart(reversed),
    makeSegmentedDataTable(),
    container,
    { chartType: 'ColumnChart' },
  );
  return { layer: maidr.subplots[0][0].layers[0], container };
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

  it('asks the vertical axis on a horizontal BarChart', () => {
    // A `BarChart` runs its bars along x and its categories down y, so
    // `getXLocation` there reads the magnitude axis — which stands still
    // however the categories were drawn, and would answer no every time.
    expect(categoriesOf(build(true, true).layer)).toEqual(DRAWN);
  });

  it('leaves an ordinary BarChart alone', () => {
    expect(categoriesOf(build(false, true).layer)).toEqual(LISTED);
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

describe('a two-series google chart on a reversed category axis', () => {
  it('reads its categories the way the chart drew them', () => {
    // Adding a second series routes the same ColumnChart to the segmented
    // builder, which never asked which way the categories were drawn -- so a
    // chart that read correctly with one series is announced as its own
    // mirror image with two.
    const rows = buildSegmented(true).layer.data as SegmentedPoint[][];

    expect(rows).toHaveLength(2);
    rows.forEach(series => expect(series.map(point => point.x)).toEqual(DRAWN));
  });

  it('names each cell so the highlight follows the reading', () => {
    const { layer, container } = buildSegmented(true);
    const grid = layer.selectors as string[][];
    const doc = container.ownerDocument;
    const found = grid.map(row =>
      row.map(cell => doc.querySelector(cell)?.getAttribute('data-datum')));

    expect(found).toEqual([
      ['s0-Fri', 's0-Thu', 's0-Sun', 's0-Sat'],
      ['s1-Fri', 's1-Thu', 's1-Sun', 's1-Sat'],
    ]);
  });

  it('leaves an ordinary two-series chart on its single selector', () => {
    const { layer } = buildSegmented(false);

    expect(typeof layer.selectors).toBe('string');
    expect((layer.data as SegmentedPoint[][])[0].map(point => point.x)).toEqual(LISTED);
  });
});
