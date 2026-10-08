import type { GoogleChart, GoogleDataTable } from '@adapters/google-charts/types';
import type { PrCurvePoint } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Column {
  label: string;
  role?: string;
  id?: string;
  p?: Record<string, unknown>;
}

/**
 * A DataTable of operating points: recall in the domain column, a curve per
 * data column, and a tooltip-role column of thresholds Google does not draw.
 */
function makeTable(columns: Column[], rows: unknown[][]): GoogleDataTable {
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => columns.length,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => String(rows[r][c]),
    getColumnLabel: c => columns[c].label,
    getColumnType: () => 'number',
    getColumnRole: c => columns[c].role ?? '',
    getColumnId: c => columns[c].id ?? '',
    getColumnProperty: (c, name) => columns[c].p?.[name],
  };
}

const CHART: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
  getChartLayoutInterface: () => {
    throw new Error('the line marking path must not need a layout interface');
  },
};

/** A drawn line chart: one `fill="none"` outline per series. */
function makeContainer(series: number): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="pr-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('pr-chart') as HTMLElement;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  const group = doc.createElementNS(SVG_NS, 'g');
  group.setAttribute('clip-path', 'url(#clip)');
  svg.appendChild(group);
  container.appendChild(svg);
  for (let s = 0; s < series; s++) {
    const line = doc.createElementNS(SVG_NS, 'path');
    line.setAttribute('fill', 'none');
    line.setAttribute('d', `M0,${s}L40,${10 + s}L80,${20 + s}`);
    group.appendChild(line);
  }
  return container;
}

const ROWS = [
  [0, 1, 0.9, 1],
  [0.5, 0.8, 0.5, 0.9],
  [1, 0.4, null, 0.4],
];

function layerOf(columns: Column[], rows: unknown[][] = ROWS, series = 2) {
  return createMaidrFromGoogleChart(CHART, makeTable(columns, rows), makeContainer(series), {
    chartType: 'LineChart',
  }).subplots[0][0].layers[0];
}

describe('createMaidrFromGoogleChart with a declared precision-recall curve', () => {
  let warn: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  const COLUMNS: Column[] = [
    { label: 'Recall' },
    { label: 'Logistic', p: { maidr: { type: 'pr_curve', prevalence: 0.4 } } },
    { label: 'Threshold', role: 'tooltip', id: 'threshold' },
    { label: 'Forest' },
  ];

  it('reads every series as a curve, each carrying only its own block\'s facts', () => {
    const layer = layerOf(COLUMNS);

    expect(layer.type).toBe(TraceType.PR_CURVE);
    const curves = layer.data as PrCurvePoint[][];
    expect(curves[0]).toEqual([
      { x: 0, y: 1, z: 'Logistic', threshold: 0.9, prevalence: 0.4 },
      { x: 0.5, y: 0.8, z: 'Logistic', threshold: 0.5 },
      { x: 1, y: 0.4, z: 'Logistic' },
    ]);
    expect(curves[1][0]).toEqual({ x: 0, y: 1, z: 'Forest' });
    // Each series' own stamped outline, as a line's.
    expect(layer.selectors).toEqual([
      '#pr-chart svg path[data-maidr-line-series="0"]',
      '#pr-chart svg path[data-maidr-line-series="1"]',
    ]);
  });

  it('stays a line chart when no column declares a curve', () => {
    const layer = layerOf(COLUMNS.map(({ p: _p, ...column }) => column));

    expect(layer.type).toBe(TraceType.LINE);
  });

  it('stays a line chart when the domain names no recall', () => {
    const layer = layerOf(COLUMNS, ROWS.map((row, i) => [`Run ${i}`, ...row.slice(1)]));

    expect(layer.type).toBe(TraceType.LINE);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('needs a number for the recall'));
  });

  it('reports a threshold column that is not there', () => {
    const columns = [...COLUMNS];
    columns[1] = { ...columns[1], p: { maidr: { type: 'pr_curve', threshold: 'cut' } } };

    const layer = layerOf(columns);

    expect((layer.data as PrCurvePoint[][])[0][0]).not.toHaveProperty('threshold');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('names "cut" for threshold'));
  });
});
