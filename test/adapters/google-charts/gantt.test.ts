import type { GoogleChart, GoogleChartType, GoogleDataTable } from '@adapters/google-charts/types';
import type { GanttData } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { FormatUtil } from '@util/format';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

type Cell = string | number | Date | null;

/**
 * Minimal DataTable fake for the gantt and timeline packages, whose column
 * layouts differ only in where the lane and the dates sit.
 */
function makeScheduleDataTable(
  rows: Cell[][],
  labels: string[],
  types: GoogleDataTable extends { getColumnType: (c: number) => infer T } ? T[] : never,
): GoogleDataTable {
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => {
      const value = rows[r][c];
      return value instanceof Date ? value.toISOString() : String(value ?? '');
    },
    getColumnLabel: c => labels[c],
    getColumnType: c => types[c],
    getColumnRole: () => '',
  };
}

/** Google's Gantt layout: id, name, resource, start, end, duration, percent, deps. */
function makeGanttDataTable(): GoogleDataTable {
  return makeScheduleDataTable(
    [
      ['research', 'Research', null, new Date('2024-01-01'), new Date('2024-01-15'), null, 100, null],
      ['write', 'Write', null, new Date('2024-01-15'), new Date('2024-02-05'), null, 40, 'research'],
    ],
    ['Task ID', 'Task Name', 'Resource', 'Start Date', 'End Date', 'Duration', 'Percent Complete', 'Dependencies'],
    ['string', 'string', 'string', 'date', 'date', 'number', 'number', 'string'],
  );
}

/** Google's Timeline layout: row label, bar label, start, end. */
function makeTimelineDataTable(rows?: Cell[][]): GoogleDataTable {
  return makeScheduleDataTable(
    rows ?? [
      ['Magnolia Room', 'Beginning JavaScript', new Date('2024-03-04T12:00:00Z'), new Date('2024-03-04T14:00:00Z')],
      ['Magnolia Room', 'Intermediate JavaScript', new Date('2024-03-04T14:00:00Z'), new Date('2024-03-04T15:00:00Z')],
      ['Willow Room', 'Beginning Google Charts', new Date('2024-03-04T12:30:00Z'), new Date('2024-03-04T14:00:00Z')],
    ],
    ['Room', 'Session', 'Start', 'End'],
    ['string', 'string', 'date', 'date'],
  );
}

/**
 * Neither package exposes a layout interface, so the adapter must never ask
 * for one — this fake fails loudly if it does.
 */
const SCHEDULE_CHART: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
  getChartLayoutInterface: () => {
    throw new Error('a schedule has no chart layout interface');
  },
};

/** Builds a rendered schedule: `barCount` bars inside the chart-area group. */
function makeScheduleContainer(barCount: number): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="schedule-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('schedule-chart') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  const group = doc.createElementNS(SVG_NS, 'g');
  group.setAttribute('clip-path', 'url(#clip)');
  svg.appendChild(group);
  container.appendChild(svg);

  // A gridline the marking path must not count as a bar.
  const gridline = doc.createElementNS(SVG_NS, 'rect');
  gridline.setAttribute('width', '1');
  gridline.setAttribute('height', '200');
  group.appendChild(gridline);

  for (let bar = 0; bar < barCount; bar++) {
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', `${bar * 40}`);
    rect.setAttribute('y', `${bar * 30}`);
    rect.setAttribute('width', '80');
    rect.setAttribute('height', '20');
    group.appendChild(rect);
  }

  return container;
}

function build(
  chartType: GoogleChartType,
  dt: GoogleDataTable,
  container: HTMLElement,
): ReturnType<typeof createMaidrFromGoogleChart>['subplots'][0][0]['layers'][0] {
  return createMaidrFromGoogleChart(SCHEDULE_CHART, dt, container, { chartType })
    .subplots[0][0]
    .layers[0];
}

// The mismatch cases warn on purpose; installing the spy per test would let
// them print on every run instead.
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

describe('createMaidrFromGoogleChart with a Gantt', () => {
  it('gives each task its own lane, measured in days', () => {
    const layer = build('Gantt', makeGanttDataTable(), makeScheduleContainer(2));

    expect(layer.type).toBe(TraceType.GANTT);
    // A schedule runs left to right, so the dates are on x and the lanes on y.
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);

    const data = layer.data as GanttData;
    expect(data.lanes).toEqual(['Research', 'Write']);
    expect(data.unit).toBe('days');
    expect(data.points).toEqual([
      [{
        x: 'Research',
        start: new Date('2024-01-01').getTime() / MS_PER_DAY,
        end: new Date('2024-01-15').getTime() / MS_PER_DAY,
      }],
      [{
        x: 'Write',
        start: new Date('2024-01-15').getTime() / MS_PER_DAY,
        end: new Date('2024-02-05').getTime() / MS_PER_DAY,
      }],
    ]);
    // Which makes the announced length 14 days rather than 1209600000 of
    // whatever epoch milliseconds are.
    expect(data.points[0][0].end - data.points[0][0].start).toBe(14);
  });

  it('hands the date axis a format that reads the unit back as a date', () => {
    const layer = build('Gantt', makeGanttDataTable(), makeScheduleContainer(2));

    expect(layer.axes?.y).toEqual({ label: 'Task Name' });
    const format = layer.axes?.x?.format;
    expect(format?.function).toContain(`${MS_PER_DAY}`);

    // Resolved the way MAIDR resolves it, so the ends announce as dates while
    // the length announces as a count of days.
    const render = FormatUtil.resolveFormat(format);
    const start = (layer.data as GanttData).points[0][0].start;
    expect(render(start)).toBe(new Date('2024-01-01').toLocaleDateString());
  });

  it('marks one bar per row, ignoring the gridline', () => {
    const container = makeScheduleContainer(2);

    const layer = build('Gantt', makeGanttDataTable(), container);

    const marked = Array.from(
      container.ownerDocument.querySelectorAll(String(layer.selectors)),
    );
    expect(marked).toHaveLength(2);
    expect(marked.map(rect => rect.getAttribute('data-maidr-lane-bar'))).toEqual(['0', '1']);
  });

  it('omits the selectors when the bar count does not match the row count', () => {
    // A Gantt draws an inner rect for percent complete, so the drawn count
    // routinely exceeds the row count.
    const container = makeScheduleContainer(3);

    const layer = build('Gantt', makeGanttDataTable(), container);

    expect(layer.selectors).toBeUndefined();
    expect(container.querySelectorAll('rect[data-maidr-lane-bar]')).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Gantt bar count mismatch'));
  });
});

describe('createMaidrFromGoogleChart with a Timeline', () => {
  it('merges the rows sharing a label into one lane, measured in hours', () => {
    const layer = build('Timeline', makeTimelineDataTable(), makeScheduleContainer(3));

    const data = layer.data as GanttData;
    expect(data.lanes).toEqual(['Magnolia Room', 'Willow Room']);
    // An agenda spans an afternoon; measured in days every session would be a
    // fraction, and the length is the fact the chart is drawn to carry.
    expect(data.unit).toBe('hours');
    expect(data.points.map(lane => lane.length)).toEqual([2, 1]);
    expect(data.points[0][0]).toEqual({
      x: 'Magnolia Room',
      label: 'Beginning JavaScript',
      start: new Date('2024-03-04T12:00:00Z').getTime() / MS_PER_HOUR,
      end: new Date('2024-03-04T14:00:00Z').getTime() / MS_PER_HOUR,
    });
  });

  it('omits the selectors when the lanes are interleaved in the DataTable', () => {
    const container = makeScheduleContainer(3);
    const dt = makeTimelineDataTable([
      ['Magnolia Room', 'Beginning JavaScript', new Date('2024-03-04T12:00:00Z'), new Date('2024-03-04T14:00:00Z')],
      ['Willow Room', 'Beginning Google Charts', new Date('2024-03-04T12:30:00Z'), new Date('2024-03-04T14:00:00Z')],
      ['Magnolia Room', 'Intermediate JavaScript', new Date('2024-03-04T14:00:00Z'), new Date('2024-03-04T15:00:00Z')],
    ]);

    const layer = build('Timeline', dt, container);

    // The lanes are still read correctly; it is only the drawn order that can
    // no longer be sliced lane by lane.
    expect((layer.data as GanttData).points.map(lane => lane.length)).toEqual([2, 1]);
    expect(layer.selectors).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not contiguous'));
  });

  it('leaves a schedule whose ends are plain numbers unconverted', () => {
    const dt = makeScheduleDataTable(
      [['Phase 1', 'Design', 0, 4], ['Phase 2', 'Build', 4, 12]],
      ['Phase', 'Step', 'Start', 'End'],
      ['string', 'string', 'number', 'number'],
    );

    const layer = build('Timeline', dt, makeScheduleContainer(2));

    const data = layer.data as GanttData;
    // The producer already chose a unit and the adapter has no name for it,
    // so nothing is scaled and nothing is claimed about what a unit means.
    expect(data.unit).toBeUndefined();
    expect(layer.axes?.x?.format).toBeUndefined();
    expect(data.points[0][0].start).toBe(0);
    expect(data.points[1][0].end).toBe(12);
  });
});
