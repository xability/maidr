import type {
  GoogleBoundingBox,
  GoogleChart,
  GoogleChartType,
  GoogleDataTable,
} from '@adapters/google-charts/types';
import type { ErrorBarPoint } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One row: the domain label, then every numeric column in table order. */
type IntervalRow = [string, ...number[]];

const ROWS: IntervalRow[] = [
  ['Jan', 10, 8, 12],
  ['Feb', 14, 11, 17],
  ['Mar', 9, 7, 11],
];

/**
 * Minimal DataTable fake whose column roles are supplied per column, so a
 * test can decide which columns are intervals — and whether the table reports
 * roles at all, as a DataView-like object may not.
 */
function makeIntervalDataTable(
  rows: IntervalRow[],
  labels: string[],
  roles: (string | undefined)[],
  reportsRoles = true,
): GoogleDataTable {
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => String(rows[r][c]),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 0 ? 'string' : 'number'),
    ...(reportsRoles ? { getColumnRole: (c: number) => roles[c] ?? '' } : {}),
  };
}

/** A table with one estimate column and the interval pair Google draws round it. */
function singleIntervalTable(rows: IntervalRow[] = ROWS): GoogleDataTable {
  return makeIntervalDataTable(
    rows,
    ['Month', 'Sales', '', ''],
    [undefined, undefined, 'interval', 'interval'],
  );
}

/** Locations the fake layout reports for each sample's point marker. */
function pointBox(index: number): GoogleBoundingBox {
  return { left: 20 + index * 40, top: 50, width: 8, height: 8 };
}

/** A chart whose layout interface places one point marker per sample. */
function makeIntervalChart(markerCount = ROWS.length): GoogleChart {
  return {
    getSelection: () => [],
    setSelection: () => {},
    getChartLayoutInterface: () => ({
      getBoundingBox: (id) => {
        const match = /^point#0#(\d+)$/.exec(id);
        if (!match) {
          return null;
        }
        const index = Number(match[1]);
        return index < markerCount ? pointBox(index) : null;
      },
      getXLocation: value => Number(value),
      getYLocation: value => Number(value),
    }),
  };
}

/** Builds a rendered interval chart with one circle per drawn point marker. */
function makeIntervalContainer(markerCount = ROWS.length): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="interval-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('interval-chart') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);

  for (let i = 0; i < markerCount; i++) {
    const box = pointBox(i);
    const circle = doc.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', `${box.left + box.width / 2}`);
    circle.setAttribute('cy', `${box.top + box.height / 2}`);
    svg.appendChild(circle);
  }

  return container;
}

function build(
  chartType: GoogleChartType,
  dt: GoogleDataTable,
  chart: GoogleChart = makeIntervalChart(),
  container: HTMLElement = makeIntervalContainer(),
): { layer: ReturnType<typeof createMaidrFromGoogleChart>['subplots'][0][0]['layers'][0]; container: HTMLElement } {
  const maidr = createMaidrFromGoogleChart(chart, dt, container, { chartType });
  return { layer: maidr.subplots[0][0].layers[0], container };
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

describe('createMaidrFromGoogleChart with interval columns', () => {
  it('reads a single-series chart with intervals as an error bar layer', () => {
    const { layer } = build('LineChart', singleIntervalTable());

    expect(layer.type).toBe(TraceType.ERROR_BAR);
    expect(layer.data).toEqual([
      { x: 'Jan', y: 10, yMin: 8, yMax: 12 },
      { x: 'Feb', y: 14, yMin: 11, yMax: 17 },
      { x: 'Mar', y: 9, yMin: 7, yMax: 11 },
    ]);
    expect(layer.axes).toEqual({ x: { label: 'Month' }, y: { label: 'Sales' } });
    expect(layer.orientation).toBe(Orientation.VERTICAL);
  });

  it('puts the value axis on x for a horizontal bar chart', () => {
    const { layer } = build('BarChart', singleIntervalTable());

    expect(layer.type).toBe(TraceType.ERROR_BAR);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
  });

  it('takes the outermost pair when the chart draws two interval levels', () => {
    const rows: IntervalRow[] = [['Jan', 10, 9, 11, 8, 12]];
    const dt = makeIntervalDataTable(
      rows,
      ['Month', 'Sales', '', '', '', ''],
      [undefined, undefined, 'interval', 'interval', 'interval', 'interval'],
    );

    const { layer } = build('LineChart', dt, makeIntervalChart(1), makeIntervalContainer(1));

    // The 95% band drawn inside the 99% one has nowhere to travel in the
    // schema; the wider bound is the one a reader is asking about.
    expect(layer.data).toEqual([{ x: 'Jan', y: 10, yMin: 8, yMax: 12 }]);
  });

  it('reads a lone interval column as the one bound it is', () => {
    const rows: IntervalRow[] = [['Jan', 10, 13], ['Feb', 14, 11]];
    const dt = makeIntervalDataTable(
      rows,
      ['Month', 'Sales', ''],
      [undefined, undefined, 'interval'],
    );

    const { layer } = build('LineChart', dt, makeIntervalChart(2), makeIntervalContainer(2));

    // A one-sided interval is a real chart; mirroring the bound across the
    // estimate would draw a symmetry the data never claimed.
    const data = layer.data as ErrorBarPoint[];
    expect(data[0]).toEqual({ x: 'Jan', y: 10, yMax: 13 });
    expect(data[1]).toEqual({ x: 'Feb', y: 14, yMin: 11 });
  });

  it('marks one point marker per sample for highlighting', () => {
    const { layer, container } = build('LineChart', singleIntervalTable());

    const marked = Array.from(
      container.ownerDocument.querySelectorAll(String(layer.selectors)),
    );
    expect(marked).toHaveLength(ROWS.length);
    expect(marked.map(circle => circle.getAttribute('data-maidr-interval')))
      .toEqual(['0', '1', '2']);
  });

  it('omits the selectors when the chart drew no point markers', () => {
    // A LineChart's default `pointSize: 0` draws the line and nothing else.
    const { layer, container } = build(
      'LineChart',
      singleIntervalTable(),
      makeIntervalChart(),
      makeIntervalContainer(0),
    );

    expect(layer.selectors).toBeUndefined();
    expect(container.querySelectorAll('[data-maidr-interval]')).toHaveLength(0);
    // Nothing to warn about: the chart simply drew no markers.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('withdraws a partial match rather than highlighting some samples', () => {
    const { layer, container } = build(
      'LineChart',
      singleIntervalTable(),
      makeIntervalChart(2),
      makeIntervalContainer(2),
    );

    expect(layer.selectors).toBeUndefined();
    expect(container.querySelectorAll('[data-maidr-interval]')).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Interval point count mismatch'));
  });

  it('keeps the existing reading when several series carry intervals', () => {
    const rows: IntervalRow[] = [['Jan', 10, 8, 12, 4, 3, 5]];
    const dt = makeIntervalDataTable(
      rows,
      ['Month', 'Sales', '', '', 'Expenses', '', ''],
      [undefined, undefined, 'interval', 'interval', undefined, 'interval', 'interval'],
    );

    const { layer } = build('LineChart', dt, makeIntervalChart(1), makeIntervalContainer(1));

    // `ErrorBarPoint[]` is flat, so a second estimate column has nowhere to
    // go — losing a whole series is worse than losing its intervals.
    expect(layer.type).toBe(TraceType.LINE);
    expect(layer.data).toHaveLength(2);
  });

  it('leaves a table that reports no column roles alone', () => {
    const dt = makeIntervalDataTable(
      ROWS,
      ['Month', 'Sales', 'Low', 'High'],
      [undefined, undefined, 'interval', 'interval'],
      false,
    );

    const { layer } = build('ColumnChart', dt);

    // `getColumnRole` is optional on a DataView-like object. Without it the
    // interval columns are indistinguishable from extra series, which is the
    // reading they already had.
    expect(layer.type).toBe(TraceType.DODGED);
  });
});
