import type { GoogleChart, GoogleDataTable } from '@adapters/google-charts/types';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

type FlowRow = [string, string, number];

const ROWS: FlowRow[] = [
  ['Coal', 'Electricity', 34],
  ['Gas', 'Electricity', 21],
  ['Electricity', 'Homes', 40],
];

/** Minimal DataTable fake for the sankey package's fixed From/To/Weight shape. */
function makeFlowDataTable(rows: FlowRow[] = ROWS): GoogleDataTable {
  const labels = ['From', 'To', 'Weight'];
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => 3,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => String(rows[r][c]),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 2 ? 'number' : 'string'),
  };
}

/**
 * The sankey package exposes no layout interface, so the adapter must never
 * ask for one — this fake fails loudly if it does.
 */
const SANKEY_CHART: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
  getChartLayoutInterface: () => {
    throw new Error('a Sankey has no chart layout interface');
  },
};

/**
 * Builds a rendered sankey: node rectangles, then one cubic-curve ribbon per
 * flow in DataTable row order.
 */
function makeSankeyContainer(ribbonCount = ROWS.length, nodeCount = 4): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="sankey-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('sankey-chart') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);

  for (let node = 0; node < nodeCount; node++) {
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', `${node * 120}`);
    rect.setAttribute('width', '12');
    rect.setAttribute('height', '60');
    svg.appendChild(rect);
  }

  for (let flow = 0; flow < ribbonCount; flow++) {
    const ribbon = doc.createElementNS(SVG_NS, 'path');
    ribbon.setAttribute('d', `M12,${20 + flow * 10} C60,${20 + flow * 10} 60,40 120,40`);
    svg.appendChild(ribbon);
  }

  return container;
}

// The mismatch case warns on purpose; installing the spy per test would let it
// print on every run instead.
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

describe('createMaidrFromGoogleChart with a Sankey', () => {
  it('emits a flat FlowPoint list and derives no node list of its own', () => {
    const container = makeSankeyContainer();

    const maidr = createMaidrFromGoogleChart(
      SANKEY_CHART,
      makeFlowDataTable(),
      container,
      { chartType: 'Sankey', title: 'Energy' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.SANKEY);
    // A flow names both of its ends, so FlowTrace builds the nodes itself.
    expect(layer.data).toEqual([
      { source: 'Coal', target: 'Electricity', value: 34 },
      { source: 'Gas', target: 'Electricity', value: 21 },
      { source: 'Electricity', target: 'Homes', value: 40 },
    ]);
    expect(layer.axes).toEqual({ x: { label: 'From' }, y: { label: 'Weight' } });
  });

  it('marks one ribbon per flow in row order, ignoring the node rectangles', () => {
    const container = makeSankeyContainer();

    const maidr = createMaidrFromGoogleChart(
      SANKEY_CHART,
      makeFlowDataTable(),
      container,
      { chartType: 'Sankey' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    const marked = Array.from(
      container.ownerDocument.querySelectorAll(String(layer.selectors)),
    );
    expect(marked).toHaveLength(ROWS.length);
    expect(marked.map(path => path.getAttribute('data-maidr-flow'))).toEqual(['0', '1', '2']);
    expect(container.querySelectorAll('rect[data-maidr-flow]')).toHaveLength(0);
  });

  it('omits the selectors when the ribbon count does not match the row count', () => {
    const container = makeSankeyContainer(ROWS.length + 1);

    const maidr = createMaidrFromGoogleChart(
      SANKEY_CHART,
      makeFlowDataTable(),
      container,
      { chartType: 'Sankey' },
    );

    const layer = maidr.subplots[0][0].layers[0];
    expect(layer.selectors).toBeUndefined();
    expect(container.querySelectorAll('path[data-maidr-flow]')).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Sankey ribbon count mismatch'));
  });

  it('reports a flow with no weight as a gap rather than a zero', () => {
    const rows = [['Coal', 'Electricity', null]] as unknown as FlowRow[];
    const container = makeSankeyContainer(1);

    const maidr = createMaidrFromGoogleChart(
      SANKEY_CHART,
      makeFlowDataTable(rows),
      container,
      { chartType: 'Sankey' },
    );

    const data = maidr.subplots[0][0].layers[0].data as { value: number }[];
    expect(Number.isNaN(data[0].value)).toBe(true);
  });
});
