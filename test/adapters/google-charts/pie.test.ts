import type { GoogleChart, GoogleDataTable } from '@adapters/google-charts/types';
import type { PiePoint } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

type PieRow = [string, number | null];

/** Minimal DataTable fake for a two-column (label, value) pie chart. */
function makePieDataTable(
  rows: PieRow[],
  labels: [string, string] = ['Fruit', 'Units'],
): GoogleDataTable {
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => 2,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => (rows[r][c] === null ? '' : String(rows[r][c])),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 0 ? 'string' : 'number'),
  };
}

/**
 * A PieChart is not axis-based and exposes no layout interface, so the
 * adapter must never ask for one — this fake fails loudly if it does.
 */
const PIE_CHART: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
  getChartLayoutInterface: () => {
    throw new Error('a PieChart has no chart layout interface');
  },
};

/**
 * Builds a rendered pie chart: a container div holding an SVG with a legend
 * swatch (a plain rectangular path, as Google draws it), then `pathsPerSlice`
 * wedge paths per row. A wedge is an arc; the swatch is not.
 */
function makePieContainer(rowCount: number, pathsPerSlice = 1): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="pie-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('pie-chart') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);

  const swatch = doc.createElementNS(SVG_NS, 'path');
  swatch.setAttribute('d', 'M0,0 L12,0 L12,12 L0,12 Z');
  svg.appendChild(swatch);

  for (let slice = 0; slice < rowCount; slice++) {
    for (let part = 0; part < pathsPerSlice; part++) {
      const wedge = doc.createElementNS(SVG_NS, 'path');
      wedge.setAttribute('d', `M100,100 L180,100 A80,80 0 0,1 ${140 + slice},${170 + part} Z`);
      svg.appendChild(wedge);
    }
  }

  return container;
}

const ROWS: PieRow[] = [['Apples', 30], ['Bananas', 50], ['Cherries', 20]];

// The mismatch case warns on purpose; installing the spy per test would let it
// print on every run instead.
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

describe('createMaidrFromGoogleChart with a PieChart', () => {
  it('emits a flat pie layer with the label and value column labels as axes', () => {
    const container = makePieContainer(ROWS.length);

    const maidr = createMaidrFromGoogleChart(
      PIE_CHART,
      makePieDataTable(ROWS),
      container,
      { chartType: 'PieChart', title: 'Fruit sales' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.PIE);
    // Flat PiePoint[], never the nested array the bar family uses.
    expect(layer.data).toEqual([
      { x: 'Apples', y: 30 },
      { x: 'Bananas', y: 50 },
      { x: 'Cherries', y: 20 },
    ]);
    expect(layer.axes).toEqual({ x: { label: 'Fruit' }, y: { label: 'Units' } });
    // A pie has no orientation, and its percentage is derived from the values
    // rather than labelled by a fill axis.
    expect(layer.orientation).toBeUndefined();
    expect(layer.axes?.z).toBeUndefined();
  });

  it('marks one wedge per slice in row order, ignoring the legend swatch', () => {
    const container = makePieContainer(ROWS.length);

    const maidr = createMaidrFromGoogleChart(
      PIE_CHART,
      makePieDataTable(ROWS),
      container,
      { chartType: 'PieChart' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    // Resolve the emitted selector the way MAIDR does: page-globally.
    const marked = Array.from(
      container.ownerDocument.querySelectorAll(String(layer.selectors)),
    );
    expect(marked).toHaveLength(ROWS.length);
    expect(marked.map(path => path.getAttribute('data-maidr-slice'))).toEqual(['0', '1', '2']);
    // The swatch has no arc command, so it is not a wedge.
    expect(container.querySelector('path')?.hasAttribute('data-maidr-slice')).toBe(false);
  });

  it('omits the selectors when the wedge count does not match the row count', () => {
    // A 3-D pie draws several paths per slice: which path is which slice is
    // then unknown, and a wrong highlight is worse than none.
    const container = makePieContainer(ROWS.length, 2);

    const maidr = createMaidrFromGoogleChart(
      PIE_CHART,
      makePieDataTable(ROWS),
      container,
      { chartType: 'PieChart' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    expect(layer.selectors).toBeUndefined();
    expect(container.querySelectorAll('path[data-maidr-slice]')).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Pie slice count mismatch'));
  });

  it('reports a slice with no measurement as a gap rather than a zero', () => {
    const rows: PieRow[] = [['Apples', 30], ['Bananas', null]];
    const container = makePieContainer(rows.length);

    const maidr = createMaidrFromGoogleChart(
      PIE_CHART,
      makePieDataTable(rows),
      container,
      { chartType: 'PieChart' },
    );

    const data = maidr.subplots[0][0].layers[0].data as PiePoint[];
    // `Number(null)` is 0, which would be sonified, totalled, and offered as
    // a minimum — the pie model reads NaN as the absence it actually is.
    expect(Number.isNaN(data[1].y)).toBe(true);
  });
});
