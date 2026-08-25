import type { GoogleChart, GoogleDataTable } from '@adapters/google-charts/types';
import type { HeatmapData } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

type Cell = Date | number | null;

/**
 * Google's calendar layout: `[date, value]`, and nothing else.
 */
function makeCalendarDataTable(
  rows: Cell[][],
  labels: string[] = ['', 'Wins'],
): GoogleDataTable {
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => String(rows[r][c] ?? ''),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 0 ? 'date' : 'number'),
    getColumnRole: () => '',
  };
}

/**
 * A drawn calendar: every day cell of every block is a direct `rect` child of
 * one `g`, which is what the package emits (measured on `current`, 2026-08).
 * The `<pattern>` rect is there because the real drawing has one and the
 * locator must not count it.
 */
function makeCalendarContainer(dayCount: number): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="cal"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('cal') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  const defs = doc.createElementNS(SVG_NS, 'defs');
  const pattern = doc.createElementNS(SVG_NS, 'pattern');
  pattern.appendChild(doc.createElementNS(SVG_NS, 'rect'));
  defs.appendChild(pattern);
  svg.appendChild(defs);

  const group = doc.createElementNS(SVG_NS, 'g');
  for (let day = 0; day < dayCount; day++) {
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('data-day', `${day}`);
    group.appendChild(rect);
  }
  svg.appendChild(group);
  container.appendChild(svg);

  return container;
}

/** A calendar has no layout interface; asking for one is a bug. */
const CALENDAR_CHART: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
  getChartLayoutInterface: () => {
    throw new Error('a calendar has no chart layout interface');
  },
};

function build(
  dt: GoogleDataTable,
  container: HTMLElement,
): ReturnType<typeof createMaidrFromGoogleChart>['subplots'][0][0]['layers'] {
  return createMaidrFromGoogleChart(CALENDAR_CHART, dt, container, {
    chartType: 'Calendar',
  }).subplots[0][0].layers;
}

function grid(layer: { data: unknown }): HeatmapData {
  return layer.data as HeatmapData;
}

/**
 * The value at a payload position.
 *
 * `points` is top-first, so row 0 is Sunday -- the row the package draws at
 * the top of each block.
 */
function valueAt(layer: { data: unknown }, row: number, col: number): number | null {
  return grid(layer).points[row][col];
}

/**
 * The selector for the same payload position.
 *
 * `HeatmapTrace` turns the rows over on construction and indexes its grid by
 * its own row, so reading a payload row back means counting from the other
 * end (#978).
 */
function selectorAt(
  layer: { data: unknown; selectors?: unknown },
  row: number,
  col: number,
): string | null {
  const selectors = layer.selectors as (string | null)[][];
  return selectors[grid(layer).points.length - 1 - row][col];
}

// 2012 began on a Sunday and 2013 on a Tuesday, which is what makes the pair
// worth using: the first has no ragged head and the second has two days of
// one.
const JAN_1_2012 = new Date(2012, 0, 1);
const DEC_31_2012 = new Date(2012, 11, 31);
const JAN_1_2013 = new Date(2013, 0, 1);
const DAYS_2012 = 366;
const DAYS_2013 = 365;

const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

describe('createMaidrFromGoogleChart with a Calendar', () => {
  it('reads a year as a heat grid of weekdays by weeks', () => {
    const [layer] = build(
      makeCalendarDataTable([[JAN_1_2012, 5]]),
      makeCalendarContainer(DAYS_2012),
    );

    expect(layer.type).toBe(TraceType.HEATMAP);
    // Sunday first, which is the row the package draws at the top.
    expect(grid(layer).y).toEqual([
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ]);
    // 366 days from a Sunday spill into a 53rd column holding two of them.
    expect(grid(layer).points).toHaveLength(7);
    expect(grid(layer).points[0]).toHaveLength(53);
  });

  it('names the week by the Sunday it begins on', () => {
    const [layer] = build(
      makeCalendarDataTable([[JAN_1_2012, 5]]),
      makeCalendarContainer(DAYS_2012),
    );

    expect(layer.axes).toEqual({
      x: { label: 'Week beginning' },
      y: { label: 'Day of week' },
      z: { label: 'Wins' },
    });
    expect(grid(layer).x[0]).toBe('2012-01-01');
    expect(grid(layer).x[1]).toBe('2012-01-08');
    expect(grid(layer).x[52]).toBe('2012-12-30');
  });

  it('names the first column by a Sunday in the year before, when it is one', () => {
    const [, layer] = build(
      makeCalendarDataTable([[JAN_1_2012, 5], [JAN_1_2013, 20]]),
      makeCalendarContainer(DAYS_2012 + DAYS_2013),
    );

    // 2013 begins on a Tuesday, so its leftmost column begins on the Sunday
    // of the previous December -- which is where the two undrawn slots above
    // January 1st are. Naming that column '2013-01-01' instead would put
    // every cell in it two days out, and the whole grid with it: the date of
    // a cell is its column plus its row.
    expect(grid(layer).x[0]).toBe('2012-12-30');
    expect(grid(layer).x[1]).toBe('2013-01-06');
    expect(grid(layer).x[52]).toBe('2013-12-29');
  });

  it('puts each day in the cell the package drew it in', () => {
    const [layer] = build(
      makeCalendarDataTable([
        [JAN_1_2012, 5],
        [new Date(2012, 0, 9), 12], // a Monday, the second week
        [DEC_31_2012, 50], // a Monday, the last
      ]),
      makeCalendarContainer(DAYS_2012),
    );

    expect(valueAt(layer, 0, 0)).toBe(5);
    expect(valueAt(layer, 1, 1)).toBe(12);
    expect(valueAt(layer, 1, 52)).toBe(50);
  });

  it('leaves a day the table says nothing about with no value, not a zero', () => {
    const [layer] = build(
      makeCalendarDataTable([[JAN_1_2012, 5]]),
      makeCalendarContainer(DAYS_2012),
    );

    // January 2nd is drawn -- a white cell inside the year -- but the table
    // gives it no value, and announcing a zero would be a reading the chart
    // never drew (#1191).
    expect(valueAt(layer, 1, 0)).toBeNull();
    expect(selectorAt(layer, 1, 0)).not.toBeNull();
  });

  it('leaves the slots outside the year with neither a value nor an element', () => {
    const [, layer] = build(
      makeCalendarDataTable([[JAN_1_2012, 5], [JAN_1_2013, 20]]),
      makeCalendarContainer(DAYS_2012 + DAYS_2013),
    );

    // 2013 began on a Tuesday, so its first column's Sunday and Monday are
    // not days of 2013 and the package draws nothing for them.
    expect(valueAt(layer, 0, 0)).toBeNull();
    expect(selectorAt(layer, 0, 0)).toBeNull();
    expect(valueAt(layer, 1, 0)).toBeNull();
    expect(selectorAt(layer, 1, 0)).toBeNull();

    // The Tuesday beside them is January 1st, and it is drawn.
    expect(valueAt(layer, 2, 0)).toBe(20);
    expect(selectorAt(layer, 2, 0)).not.toBeNull();
  });

  it('gives each calendar year its own layer, named by the year', () => {
    const layers = build(
      makeCalendarDataTable([[DEC_31_2012, 50], [JAN_1_2013, 20]]),
      makeCalendarContainer(DAYS_2012 + DAYS_2013),
    );

    expect(layers.map(layer => layer.title)).toEqual(['2012', '2013']);
    // Stacking them into one seven-row grid would put two different days in
    // one cell: the package restarts its week columns each January.
    expect(valueAt(layers[0], 1, 52)).toBe(50);
    expect(valueAt(layers[1], 2, 0)).toBe(20);
  });

  it('draws a block for a year in the middle that holds nothing', () => {
    const layers = build(
      makeCalendarDataTable([[JAN_1_2012, 5], [new Date(2014, 5, 1), 9]]),
      makeCalendarContainer(DAYS_2012 + DAYS_2013 + 365),
    );

    expect(layers.map(layer => layer.title)).toEqual(['2012', '2013', '2014']);
    expect(grid(layers[1]).points.flat().every(cell => cell === null)).toBe(true);
  });

  it('counts the day cells from the start of the drawing, block by block', () => {
    const layers = build(
      makeCalendarDataTable([[JAN_1_2012, 5], [JAN_1_2013, 20]]),
      makeCalendarContainer(DAYS_2012 + DAYS_2013),
    );

    // The DOM order is column-major over the days actually drawn, so the
    // second block's first day follows the first block's last.
    expect(selectorAt(layers[0], 0, 0))
      .toBe('#cal svg rect[data-maidr-day="0"]');
    expect(selectorAt(layers[0], 1, 52))
      .toBe(`#cal svg rect[data-maidr-day="${DAYS_2012 - 1}"]`);
    expect(selectorAt(layers[1], 2, 0))
      .toBe(`#cal svg rect[data-maidr-day="${DAYS_2012}"]`);
  });

  it('takes the last of two rows naming the same day', () => {
    const [layer] = build(
      makeCalendarDataTable([[JAN_1_2012, 90], [JAN_1_2012, 20]]),
      makeCalendarContainer(DAYS_2012),
    );

    // Measured: the cell drew identically to a lone 20, so the package is
    // not summing them.
    expect(valueAt(layer, 0, 0)).toBe(20);
  });

  it('reads a day with no value as a hole rather than a NaN', () => {
    const [layer] = build(
      makeCalendarDataTable([[JAN_1_2012, null]]),
      makeCalendarContainer(DAYS_2012),
    );

    expect(valueAt(layer, 0, 0)).toBeNull();
  });

  it('drops the highlighting when the drawing holds a different number of cells', () => {
    const [layer] = build(
      makeCalendarDataTable([[JAN_1_2012, 5]]),
      makeCalendarContainer(DAYS_2012 - 1),
    );

    expect(layer.selectors).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Calendar day count mismatch'),
    );
    // The reading survives; only the outline is gone.
    expect(valueAt(layer, 0, 0)).toBe(5);
  });

  it('reads a table with no dates as a calendar of no weeks', () => {
    const [layer] = build(
      makeCalendarDataTable([[null, 5]]),
      makeCalendarContainer(0),
    );

    expect(layer.type).toBe(TraceType.HEATMAP);
    expect(grid(layer).y).toHaveLength(7);
    expect(grid(layer).x).toEqual([]);
    expect(grid(layer).points.every(row => row.length === 0)).toBe(true);
  });
});
