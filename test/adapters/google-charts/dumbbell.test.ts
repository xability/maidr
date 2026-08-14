import type {
  GoogleBoundingBox,
  GoogleChart,
  GoogleDataTable,
} from '@adapters/google-charts/types';
import type { DumbbellData } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One row: the category, then every numeric column in table order. */
type PairRow = [string, ...number[]];

const ROWS: PairRow[] = [
  ['Japan', 79, 84],
  ['Kenya', 57, 66],
  ['Peru', 68, 77],
];

/** Minimal DataTable fake whose column labels and roles are supplied. */
function makePairDataTable(
  rows: PairRow[],
  labels: string[],
  roles: (string | undefined)[] = [],
): GoogleDataTable {
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => String(rows[r][c]),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 0 ? 'string' : 'number'),
    getColumnRole: c => roles[c] ?? '',
  };
}

/** The plain recipe: a category and the two values compared at it. */
function plainTable(): GoogleDataTable {
  return makePairDataTable(ROWS, ['Country', '1990', '2020']);
}

/**
 * The intervals recipe: a hidden series (`lineWidth: 0`) whose two
 * `role: 'interval'` columns are drawn as the sticks and their end dots.
 */
function intervalTable(): GoogleDataTable {
  return makePairDataTable(
    ROWS.map(([label, start, end]) => [label, (start + end) / 2, start, end] as PairRow),
    ['Country', 'Life expectancy', '1990', '2020'],
    [undefined, undefined, 'interval', 'interval'],
  );
}

/** Locations the fake layout reports for each row's drawn marker. */
function pointBox(index: number): GoogleBoundingBox {
  return { left: 30 + index * 50, top: 60, width: 10, height: 10 };
}

/** A chart whose layout interface places one point marker per row. */
function makePairChart(markerCount = ROWS.length): GoogleChart {
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

/** Builds a rendered dumbbell with one circle per drawn marker. */
function makePairContainer(markerCount = ROWS.length, reversed = false): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="pair-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('pair-chart') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);

  const order = Array.from({ length: markerCount }, (_, i) => i);
  for (const i of reversed ? order.reverse() : order) {
    const box = pointBox(i);
    const circle = doc.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', `${box.left + box.width / 2}`);
    circle.setAttribute('cy', `${box.top + box.height / 2}`);
    svg.appendChild(circle);
  }

  return container;
}

function build(
  dt: GoogleDataTable,
  chart: GoogleChart = makePairChart(),
  container: HTMLElement = makePairContainer(),
): {
  layer: ReturnType<typeof createMaidrFromGoogleChart>['subplots'][0][0]['layers'][0];
  container: HTMLElement;
} {
  const maidr = createMaidrFromGoogleChart(chart, dt, container, {
    chartType: 'DumbbellChart',
  });
  return { layer: maidr.subplots[0][0].layers[0], container };
}

// The order-mismatch case warns on purpose; installing the spy per test would
// let it print on every run instead.
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

describe('createMaidrFromGoogleChart with a DumbbellChart', () => {
  it('reads a plain [category, start, end] table as one object, not an array', () => {
    const { layer } = build(plainTable());

    expect(layer.type).toBe(TraceType.DUMBBELL);
    expect(layer.orientation).toBe(Orientation.VERTICAL);

    const data = layer.data as DumbbellData;
    expect(data.points).toEqual([
      { x: 'Japan', start: 79, end: 84 },
      { x: 'Kenya', start: 57, end: 66 },
      { x: 'Peru', start: 68, end: 77 },
    ]);
  });

  it('takes the names of the two ends from the value columns', () => {
    const { layer } = build(plainTable());

    // The names are the content of the comparison: without them a reader is
    // told "start" and "end" and never which year they are on.
    const data = layer.data as DumbbellData;
    expect(data.startLabel).toBe('1990');
    expect(data.endLabel).toBe('2020');
  });

  it('emits no change between the ends', () => {
    const { layer } = build(plainTable());

    // A drawn segment cannot disagree with the dots it joins, so the trace
    // derives the change and an authored one would be a second source.
    const data = layer.data as DumbbellData;
    expect(data.points.every(point => !('delta' in point) && !('change' in point))).toBe(true);
  });

  it('reads the intervals recipe from its interval columns, not its estimate', () => {
    const { layer } = build(intervalTable());

    // The visible series is `lineWidth: 0` and carries the midpoint; the two
    // ends the chart actually draws are the interval columns.
    const data = layer.data as DumbbellData;
    expect(data.points).toEqual([
      { x: 'Japan', start: 79, end: 84 },
      { x: 'Kenya', start: 57, end: 66 },
      { x: 'Peru', start: 68, end: 77 },
    ]);
    expect(data.startLabel).toBe('1990');
    expect(data.endLabel).toBe('2020');
  });

  it('names the category axis and leaves the value axis unnamed', () => {
    const { layer } = build(plainTable());

    // Naming it after either column would announce the quantity as one of its
    // own ends — "1990: 84" on the dot labelled 2020.
    expect(layer.axes).toEqual({ x: { label: 'Country' } });
  });

  it('marks one drawn marker per row for highlighting', () => {
    const { layer, container } = build(plainTable());

    const marked = Array.from(
      container.ownerDocument.querySelectorAll(String(layer.selectors)),
    );
    expect(marked).toHaveLength(ROWS.length);
    expect(marked.map(circle => circle.getAttribute('data-maidr-pair')))
      .toEqual(['0', '1', '2']);
  });

  it('omits the selectors when the chart drew no point markers', () => {
    const { layer, container } = build(
      plainTable(),
      makePairChart(),
      makePairContainer(0),
    );

    expect(layer.selectors).toBeUndefined();
    expect(container.querySelectorAll('[data-maidr-pair]')).toHaveLength(0);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('withdraws the marks when the chart drew its markers out of data order', () => {
    const { layer, container } = build(
      plainTable(),
      makePairChart(),
      makePairContainer(ROWS.length, true),
    );

    // A single attribute selector resolves in document order. Marking a
    // right-to-left chart in data order would put every highlight on another
    // row's dot, and only the highlight would say so.
    expect(layer.selectors).toBeUndefined();
    expect(container.querySelectorAll('[data-maidr-pair]')).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Dumbbell point order mismatch'));
  });
});
