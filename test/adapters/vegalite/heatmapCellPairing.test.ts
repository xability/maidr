/**
 * @jest-environment jsdom
 */

/**
 * A Vega-Lite heatmap's drawn cells are paired with the data by the row Vega
 * bound to each one, not by where the cell sits in the DOM.
 *
 * Vega draws one `<path>` per row, in the order the rows are listed, and lays
 * each out where its scales put it. `extractHeatmapData` orders both axes by
 * the scale domains (#977), so the k-th drawn cell is no longer the k-th cell
 * of the payload's grid. The bind-time pass still derived each cell's row and
 * column from its DOM index, as if the payload were in the rows' order, and so
 * rebuilt the grid with every row label on the wrong row: on the gallery's
 * weekly activity heatmap the bottom row (Morning) was announced as Afternoon
 * and the highlight sat on another row's cell for every move.
 *
 * The marks below imitate what Vega renders for that spec: one path per row in
 * the rows' order, each carrying the row on `__data__.datum` (Vega's SVG
 * renderer binds the scenegraph item there) and the measured position. jsdom
 * lays nothing out, so the positions are stubbed.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { HeatmapData, Maidr } from '@type/grammar';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { initMaidrOnElement } from '@util/initMaidr';
import { bindVegaLite } from '../../../src/vegalite-entry';

jest.mock('@util/initMaidr', () => ({ initMaidrOnElement: jest.fn() }));
const initMock = initMaidrOnElement as unknown as jest.Mock;

const SVG_NS = 'http://www.w3.org/2000/svg';
const CELL = 100;

type Row = Record<string, string | number>;

/** The gallery example's rows, two days of it, listed day by day. */
const ROWS: Row[] = [
  { day: 'Mon', hour: 'Morning', value: 5 },
  { day: 'Mon', hour: 'Afternoon', value: 8 },
  { day: 'Mon', hour: 'Evening', value: 3 },
  { day: 'Tue', hour: 'Morning', value: 7 },
  { day: 'Tue', hour: 'Afternoon', value: 6 },
  { day: 'Tue', hour: 'Evening', value: 4 },
];

/** The heatmap spec over the given rows. */
function specFor(rows: Row[], x = 'day', y = 'hour'): VegaLiteSpec {
  return {
    data: { values: rows },
    mark: 'rect',
    encoding: {
      x: { field: x, type: 'ordinal' },
      y: { field: y, type: 'ordinal' },
      color: { field: 'value', type: 'quantitative' },
    },
  } as unknown as VegaLiteSpec;
}

interface Drawing {
  /** Left-to-right order of the x labels as drawn. */
  columns: string[];
  /** Top-to-bottom order of the y labels as drawn. */
  rows: string[];
  /** What `view.scale(...).domain()` reports, per scale. */
  domains: Record<string, string[]>;
  /** Whether Vega's item binding is present on the marks. */
  bound?: boolean;
  /** Indices of rows whose mark carries no binding, when only some do. */
  unbound?: number[];
}

/**
 * A rendered heatmap: one path per row in the rows' order, at the position
 * the drawing puts its labels.
 * @param rows    - The rows, in the order Vega emits them
 * @param drawing - Where each label is drawn and what the scales report
 * @param x       - The x field
 * @param y       - The y field
 * @returns The view to bind
 */
function chart(rows: Row[], drawing: Drawing, x = 'day', y = 'hour'): VegaView {
  const container = document.createElement('div');
  container.id = 'chart';
  const svg = document.createElementNS(SVG_NS, 'svg');
  const marks = document.createElementNS(SVG_NS, 'g');
  marks.setAttribute('class', 'mark-rect role-mark marks');

  for (const [index, row] of rows.entries()) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('aria-label', `${row[x]} ${row[y]}`);
    const left = drawing.columns.indexOf(String(row[x])) * CELL;
    const top = drawing.rows.indexOf(String(row[y])) * CELL;
    path.getBoundingClientRect = (): DOMRect => ({
      x: left,
      y: top,
      width: CELL,
      height: CELL,
      top,
      left,
      right: left + CELL,
      bottom: top + CELL,
    }) as DOMRect;
    if (drawing.bound !== false && !drawing.unbound?.includes(index)) {
      (path as unknown as { __data__: unknown }).__data__ = { datum: row };
    }
    marks.appendChild(path);
  }
  svg.appendChild(marks);
  container.appendChild(svg);
  document.body.appendChild(container);

  const view = {
    container: () => container,
    data: (name: string) => {
      throw new Error(`no dataset ${name}`);
    },
    runAsync: async (): Promise<unknown> => view,
    scale: (name: string) => {
      if (!(name in drawing.domains))
        throw new Error(`Unrecognized scale or projection: ${name}`);
      return { domain: () => drawing.domains[name] };
    },
  } as unknown as VegaView;
  return view;
}

/**
 * Bind a heatmap and read back what the reader is given: the grid, and the
 * cells in the DOM order the highlight pairs with it.
 * @param rows    - The rows, in emission order
 * @param drawing - The drawing
 * @param x       - The x field
 * @param y       - The y field
 * @returns The bound grid and the drawn cells' labels in DOM order
 */
function bind(
  rows: Row[],
  drawing: Drawing,
  x = 'day',
  y = 'hour',
): { data: HeatmapData; dom: string[] } {
  const view = chart(rows, drawing, x, y);
  bindVegaLite(view, specFor(rows, x, y));
  const maidr = initMock.mock.calls[0]?.[0] as Maidr | undefined;
  const layer = maidr?.subplots?.[0]?.[0]?.layers?.[0];
  if (!layer)
    throw new Error('no layer emitted');
  const container = view.container() as HTMLElement;
  const dom = Array.from(container.querySelectorAll('path')).map(path => path.getAttribute('aria-label') ?? '');
  return { data: layer.data as HeatmapData, dom };
}

/**
 * The value the reader hears at a drawn cell, looked up by its labels.
 * @param data - The bound grid
 * @param col  - The x label
 * @param row  - The y label
 * @returns The value at that cell
 */
function valueAt(data: HeatmapData, col: string, row: string): number | null {
  return data.points[data.y.indexOf(row)][data.x.indexOf(col)];
}

describe('a vega-lite heatmap whose rows are not listed in the drawn order', () => {
  beforeEach(() => {
    initMock.mockClear();
    document.body.innerHTML = '';
  });

  // Vega sorts an ordinal scale: Afternoon, Evening, Morning from the top.
  const sorted: Drawing = {
    columns: ['Mon', 'Tue'],
    rows: ['Afternoon', 'Evening', 'Morning'],
    domains: { x: ['Mon', 'Tue'], y: ['Afternoon', 'Evening', 'Morning'] },
  };

  it('keeps every row label on the row the chart draws it on', () => {
    const { data } = bind(ROWS, sorted);

    // Before the fix: ['Evening', 'Morning', 'Afternoon'], each label carried
    // to the row of whichever cell happened to be emitted at its DOM index.
    expect(data.y).toEqual(['Afternoon', 'Evening', 'Morning']);
    expect(data.x).toEqual(['Mon', 'Tue']);
  });

  it('keeps every value on its own cell', () => {
    const { data } = bind(ROWS, sorted);

    expect(data.points).toEqual([[8, 6], [3, 4], [5, 7]]);
  });

  it('puts the drawn cells in the order the grid is read, top row first', () => {
    // `Heatmap.mapToSvgElements` pairs the k-th path with row floor(k / nx)
    // from the top, column k % nx, so the DOM has to follow the grid.
    const { dom } = bind(ROWS, sorted);

    expect(dom).toEqual([
      'Mon Afternoon',
      'Tue Afternoon',
      'Mon Evening',
      'Tue Evening',
      'Mon Morning',
      'Tue Morning',
    ]);
  });

  it('follows the drawing when a reversed scale draws the domain bottom up', () => {
    // `scale: { reverse: true }` leaves the domain as it is and flips where it
    // is drawn, so the domain order is not the top-to-bottom order.
    const reversed: Drawing = { ...sorted, rows: ['Morning', 'Evening', 'Afternoon'] };

    const { data, dom } = bind(ROWS, reversed);

    expect(data.y).toEqual(['Morning', 'Evening', 'Afternoon']);
    expect(valueAt(data, 'Mon', 'Morning')).toBe(5);
    expect(valueAt(data, 'Tue', 'Afternoon')).toBe(6);
    expect(dom.slice(0, 2)).toEqual(['Mon Morning', 'Tue Morning']);
  });

  it('tells the axes apart when they share their labels, as a correlation matrix does', () => {
    // Every label is on both axes, so a cell's row alone cannot say which of
    // its two names is its column; the drawing can.
    const matrix: Row[] = [
      { a: 'p', b: 'p', value: 1 },
      { a: 'p', b: 'q', value: 2 },
      { a: 'q', b: 'p', value: 3 },
      { a: 'q', b: 'q', value: 4 },
    ];
    const drawing: Drawing = {
      columns: ['p', 'q'],
      rows: ['p', 'q'],
      domains: { x: ['p', 'q'], y: ['p', 'q'] },
    };

    const { data } = bind(matrix, drawing, 'a', 'b');

    // x is field `a`, y is field `b`: the cell at column q, row p is a=q, b=p.
    expect(valueAt(data, 'q', 'p')).toBe(3);
    expect(valueAt(data, 'p', 'q')).toBe(2);
  });

  it('matches numeric labels to the numbers the rows carry', () => {
    // The payload's labels are strings; the bound rows hold the numbers.
    const hours: Row[] = [
      { hour: 1, day: 'Mon', value: 2 },
      { hour: 0, day: 'Mon', value: 1 },
      { hour: 1, day: 'Tue', value: 4 },
      { hour: 0, day: 'Tue', value: 3 },
    ];
    const drawing: Drawing = {
      columns: ['0', '1'],
      rows: ['Mon', 'Tue'],
      domains: { x: ['0', '1'], y: ['Mon', 'Tue'] },
    };

    const { data } = bind(hours, drawing, 'hour', 'day');

    expect(data.x).toEqual(['0', '1']);
    expect(data.points).toEqual([[1, 2], [3, 4]]);
  });
});

describe('a vega-lite heatmap whose marks carry no bound row', () => {
  beforeEach(() => {
    initMock.mockClear();
    document.body.innerHTML = '';
  });

  it('keeps the grid the converter read off the scales and orders the cells to match', () => {
    const { data, dom } = bind(ROWS, {
      columns: ['Mon', 'Tue'],
      rows: ['Afternoon', 'Evening', 'Morning'],
      domains: { x: ['Mon', 'Tue'], y: ['Afternoon', 'Evening', 'Morning'] },
      bound: false,
    });

    expect(data.y).toEqual(['Afternoon', 'Evening', 'Morning']);
    expect(data.points).toEqual([[8, 6], [3, 4], [5, 7]]);
    expect(dom[0]).toBe('Mon Afternoon');
  });

  it('keeps the converter\'s grid when only some marks carry a row', () => {
    // A field one cell cannot vouch for names nothing, so no axis is
    // recognised and the cells are not relabelled from a partial reading.
    const { data } = bind(ROWS, {
      columns: ['Mon', 'Tue'],
      rows: ['Afternoon', 'Evening', 'Morning'],
      domains: { x: ['Mon', 'Tue'], y: ['Afternoon', 'Evening', 'Morning'] },
      unbound: [4],
    });

    expect(data.y).toEqual(['Afternoon', 'Evening', 'Morning']);
    expect(data.points).toEqual([[8, 6], [3, 4], [5, 7]]);
  });
});
