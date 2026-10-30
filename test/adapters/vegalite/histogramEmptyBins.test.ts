/**
 * @jest-environment jsdom
 */

/**
 * A Vega-Lite histogram keeps its empty bins.
 *
 * Vega-Lite counts a bin with an aggregate, which has no row -- and so draws
 * no bar -- for a bin no value falls in. Read from those rows, Altair's
 * histogram of the iris petal lengths, binned by 0.5 from 1 to 7, was read as
 * 10 bins: "1.5 through 2, Frequency is 26" and then "3 through 3.5,
 * Frequency is 3", with the gap between the two clusters in neither the bin
 * count, the sound nor the braille.
 *
 * The rows below are the compiled bin rows, as the histogram's mark dataset
 * holds them; the bars are drawn one per row, where the bin scale puts them.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { HistogramPoint, Maidr, MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Histogram } from '@model/histogram';
import { initMaidrOnElement } from '@util/initMaidr';
import { bindVegaLite } from '../../../src/vegalite-entry';

jest.mock('@util/initMaidr', () => ({ initMaidrOnElement: jest.fn() }));
const initMock = initMaidrOnElement as unknown as jest.Mock;

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Pixels per unit of the binned field. */
const SCALE = 100;

type Row = Record<string, number>;

/**
 * A compiled bin row.
 * @param start - The bin's start
 * @param count - Its count
 * @returns The row
 */
function bin(start: number, count: number): Row {
  return { bin_maxbins_20_petal: start, bin_maxbins_20_petal_end: start + 0.5, __count: count };
}

/** Bins of 0.5 from 1 to 4, none between 2 and 3, in no particular order. */
const ROWS: Row[] = [bin(3.5, 8), bin(1, 24), bin(3, 3), bin(1.5, 26)];

/**
 * The histogram spec over pre-binned rows.
 * @param rows - The bin rows
 * @param horizontal - Whether the bins run up the y axis
 * @returns The spec
 */
function specFor(rows: Row[], horizontal = false): VegaLiteSpec {
  const bins = { bin: true, field: 'petal', type: 'quantitative', title: 'Petal Length' };
  const count = { aggregate: 'count', type: 'quantitative', title: 'Frequency' };
  return {
    data: { values: rows },
    mark: 'bar',
    encoding: horizontal ? { y: bins, x: count } : { x: bins, y: count },
  } as unknown as VegaLiteSpec;
}

/**
 * A rendered histogram: one bar per row, in the rows' order, where the bin
 * scale draws it -- left to right, or bottom to top when the bins run along y.
 * @param rows - The bin rows
 * @param horizontal - Whether the bins run up the y axis
 * @returns The view to bind
 */
function chart(rows: Row[], horizontal = false): VegaView {
  const container = document.createElement('div');
  container.id = 'chart';
  const svg = document.createElementNS(SVG_NS, 'svg');
  const marks = document.createElementNS(SVG_NS, 'g');
  marks.setAttribute('class', 'mark-rect role-mark marks');
  for (const row of rows) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('data-bin', String(row.bin_maxbins_20_petal));
    const along = row.bin_maxbins_20_petal * SCALE;
    const box = horizontal
      ? { x: 0, y: 1000 - along - SCALE / 2, width: row.__count, height: SCALE / 2 }
      : { x: along, y: 300 - row.__count, width: SCALE / 2, height: row.__count };
    path.getBoundingClientRect = (): DOMRect => ({
      ...box,
      top: box.y,
      left: box.x,
      right: box.x + box.width,
      bottom: box.y + box.height,
    }) as DOMRect;
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
    scale: () => {
      throw new Error('no scales');
    },
  } as unknown as VegaView;
  return view;
}

/**
 * Bind a histogram and return the layer MAIDR is handed.
 * @param rows - The bin rows
 * @param horizontal - Whether the bins run up the y axis
 * @returns The layer
 */
function bound(rows: Row[], horizontal = false): MaidrLayer {
  bindVegaLite(chart(rows, horizontal), specFor(rows, horizontal));
  const maidr = initMock.mock.calls[0]?.[0] as Maidr | undefined;
  const layer = maidr?.subplots?.[0]?.[0]?.layers?.[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer;
}

describe('a vega-lite histogram with a run of empty bins', () => {
  beforeEach(() => {
    initMock.mockClear();
    document.body.innerHTML = '';
  });

  it('reads the empty bins as bins of 0, in their place', () => {
    const bins = bound(ROWS).data as HistogramPoint[];

    // Before the fix: four bins, 1.5-2 followed by 3-3.5.
    expect(bins.map(b => [b.xMin, b.xMax, b.y])).toEqual([
      [1, 1.5, 24],
      [1.5, 2, 26],
      [2, 2.5, 0],
      [2.5, 3, 0],
      [3, 3.5, 3],
      [3.5, 4, 8],
    ]);
    expect(bins[2].x).toBe('2-2.5');
  });

  it('keeps each drawn bar on its own bin', () => {
    const trace = new Histogram(bound(ROWS));
    const highlights = (trace as unknown as { highlightValues: SVGElement[][] | null }).highlightValues;

    // An empty bin has no bar to outline.
    expect(highlights?.[0].map(element => element.getAttribute('data-bin')))
      .toEqual(['1', '1.5', null, null, '3', '3.5']);
    trace.dispose();
  });

  it('reads a histogram binned up the y axis from the top, empty bins included', () => {
    const bins = bound(ROWS, true).data as HistogramPoint[];

    expect(bins.map(b => [b.yMin, b.yMax, b.x])).toEqual([
      [3.5, 4, 8],
      [3, 3.5, 3],
      [2.5, 3, 0],
      [2, 2.5, 0],
      [1.5, 2, 26],
      [1, 1.5, 24],
    ]);
  });

  it('writes the edges of a fractional step as the axis does', () => {
    const tenths: Row[] = [0.1, 0.4].map(start =>
      ({ bin_maxbins_20_petal: start, bin_maxbins_20_petal_end: Number((start + 0.1).toFixed(1)), __count: 2 }));

    const bins = bound(tenths).data as HistogramPoint[];

    expect(bins.map(b => b.x)).toEqual(['0.1-0.2', '0.2-0.3', '0.3-0.4', '0.4-0.5']);
  });

  it('fills a gap of one bin wherever it falls', () => {
    const bins = bound([bin(3, 2), bin(1, 4), bin(2, 1)]).data as HistogramPoint[];

    expect(bins.map(b => [b.x, b.y])).toEqual([
      ['1-1.5', 4],
      ['1.5-2', 0],
      ['2-2.5', 1],
      ['2.5-3', 0],
      ['3-3.5', 2],
    ]);
  });

  it('writes an empty bin\'s label as the drawn bins\' labels are written', () => {
    // Every digit of an edge counts: a timestamp of thirteen, to the unit.
    const start = 1700000000123;
    const stamps: Row[] = [0, 3].map(k => ({
      bin_maxbins_20_petal: start + k * 1000,
      bin_maxbins_20_petal_end: start + (k + 1) * 1000,
      __count: 1,
    }));

    const bins = bound(stamps).data as HistogramPoint[];

    expect(bins.map(b => b.x)).toEqual([
      '1700000000123-1700000001123',
      '1700000001123-1700000002123',
      '1700000002123-1700000003123',
      '1700000003123-1700000004123',
    ]);
  });
});

describe('a vega-lite histogram the empty bins are not put into', () => {
  beforeEach(() => {
    initMock.mockClear();
    document.body.innerHTML = '';
  });

  it('leaves bins of different widths as they are', () => {
    const rows: Row[] = [bin(1, 4), { bin_maxbins_20_petal: 3, bin_maxbins_20_petal_end: 4, __count: 2 }];

    const bins = bound(rows).data as HistogramPoint[];

    expect(bins.map(b => b.x)).toEqual(['1-1.5', '3-4']);
  });

  it('leaves the bins alone when a drawn bar already counts 0', () => {
    // `Histogram` pairs its bars with the bins that are not empty, so a bar
    // drawn for a 0 would be passed over and every later bar shifted.
    const rows: Row[] = [bin(1, 4), bin(1.5, 0), bin(3, 2)];

    const bins = bound(rows).data as HistogramPoint[];

    expect(bins.map(b => b.x)).toEqual(['1-1.5', '1.5-2', '3-3.5']);
  });
});
