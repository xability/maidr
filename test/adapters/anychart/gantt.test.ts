import type {
  AnyChartInstance,
  AnyChartTreeItem,
} from '@adapters/anychart/types';
import type { GanttData } from '@type/grammar';
import { anyChartToMaidr, bindAnyChart } from '@adapters/anychart/converters';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  document: dom.window.document,
  window: dom.window,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  Node: dom.window.Node,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
});

const SVG_NS = 'http://www.w3.org/2000/svg';
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** A task as an author writes one into `anychart.data.tree`. */
interface TaskSpec {
  name?: string;
  id?: string;
  actualStart?: number | string | Date;
  actualEnd?: number | string | Date;
  /** What AnyChart derived for a parent task that states no dates itself. */
  meta?: Record<string, unknown>;
  /** A resource chart's bookings. */
  periods?: Array<Record<string, unknown>>;
  children?: TaskSpec[];
}

function createTreeItem(spec: TaskSpec): AnyChartTreeItem {
  const children = (spec.children ?? []).map(createTreeItem);
  return {
    get: (field: string) => (spec as Record<string, unknown>)[field],
    meta: (key: string) => spec.meta?.[key],
    numChildren: () => children.length,
    getChildAt: (index: number) => children[index] ?? null,
  };
}

function createGanttChart(
  tasks: TaskSpec[],
  extra: {
    container?: HTMLElement;
    chartType?: string;
    /** Hands back a flat data view instead of a task tree. */
    dataView?: boolean;
  } = {},
): AnyChartInstance {
  const roots = tasks.map(createTreeItem);
  const tree = {
    numChildren: () => roots.length,
    getChildAt: (index: number) => roots[index] ?? null,
  };
  return {
    title: () => 'Release plan',
    container: () => extra.container ?? '',
    getType: () => extra.chartType ?? 'gantt-project',
    data: () => (extra.dataView ? { getIterator: () => undefined } : tree),
    // A gantt has NO series API; a mock that offered one would let a broken
    // route look like a working one.
  } as unknown as AnyChartInstance;
}

function ganttData(chart: AnyChartInstance): GanttData {
  const maidr = anyChartToMaidr(chart);
  return maidr!.subplots[0][0].layers[0].data as GanttData;
}

/**
 * A rendered gantt: `layers` describes one AnyChart layer per entry, each
 * holding filled paths at the given boxes. A real one holds several — the row
 * stripes behind both halves of the split widget, then the task bars.
 */
function createRenderedGantt(
  id: string,
  layers: Array<Array<{ left: number; width: number }>>,
): { container: HTMLElement; paths: SVGElement[][] } {
  const container = document.createElement('div');
  container.id = id;
  const svg = document.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);
  document.body.appendChild(container);

  const paths = layers.map((shapes, layerIndex) => {
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = `ac_layer_${layerIndex}`;
    svg.appendChild(layer);
    return shapes.map((shape, i) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.id = `ac_path_${layerIndex}_${i}`;
      path.setAttribute('d', 'M 0 0 L 10 0 L 10 10 Z');
      path.setAttribute('fill', '#4682b4');
      Object.defineProperty(path, 'getBBox', {
        value: () => ({
          x: shape.left,
          y: i * 20,
          width: shape.width,
          height: 12,
        }),
      });
      layer.appendChild(path);
      return path as unknown as SVGElement;
    });
  });

  return { container, paths };
}

function cleanUp(container: HTMLElement): void {
  (container.closest('[data-maidr-anychart-host]') ?? container).remove();
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('anyChartToMaidr (gantt)', () => {
  it('reads a project chart as one lane per task, in row order', () => {
    const chart = createGanttChart([
      {
        name: 'Research',
        actualStart: Date.UTC(2024, 0, 1),
        actualEnd: Date.UTC(2024, 0, 15),
      },
      {
        name: 'Write',
        actualStart: Date.UTC(2024, 0, 15),
        actualEnd: Date.UTC(2024, 1, 5),
      },
    ]);

    const layer = anyChartToMaidr(chart)!.subplots[0][0].layers[0];
    expect(layer.type).toBe(TraceType.GANTT);
    // A schedule runs its bars left to right: the dates are the x axis and the
    // lanes are the rows, the opposite of the trace's own default.
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);

    const data = layer.data as GanttData;
    expect(data.lanes).toEqual(['Research', 'Write']);
    expect(data.points).toEqual([
      [{
        x: 'Research',
        start: Date.UTC(2024, 0, 1) / MS_PER_DAY,
        end: Date.UTC(2024, 0, 15) / MS_PER_DAY,
      }],
      [{
        x: 'Write',
        start: Date.UTC(2024, 0, 15) / MS_PER_DAY,
        end: Date.UTC(2024, 1, 5) / MS_PER_DAY,
      }],
    ]);
    // The length of an interval is what a gantt is read for, and a bare number
    // does not carry it. Left in milliseconds every task announces a
    // nine-digit figure.
    expect(data.unit).toBe('days');
    expect(layer.axes?.x?.format?.function)
      .toBe(`return new Date(value * ${MS_PER_DAY}).toLocaleDateString()`);
    expect(layer.axes?.x?.label).toBe('Date');
    expect(layer.axes?.y?.label).toBe('Task');
  });

  it('reads a schedule shorter than two days in hours', () => {
    const chart = createGanttChart([
      {
        name: 'Deploy',
        actualStart: Date.UTC(2024, 0, 1, 9),
        actualEnd: Date.UTC(2024, 0, 1, 11),
      },
    ]);

    const data = ganttData(chart);
    expect(data.unit).toBe('hours');
    expect(data.points[0][0].start).toBe(Date.UTC(2024, 0, 1, 9) / MS_PER_HOUR);
  });

  it('accepts a date written as a string or a Date, as the chart does', () => {
    const chart = createGanttChart([
      {
        name: 'Research',
        actualStart: '2024-01-01T00:00:00Z',
        actualEnd: new Date(Date.UTC(2024, 0, 15)),
      },
    ]);

    expect(ganttData(chart).points[0][0]).toEqual({
      x: 'Research',
      start: Date.UTC(2024, 0, 1) / MS_PER_DAY,
      end: Date.UTC(2024, 0, 15) / MS_PER_DAY,
    });
  });

  it('gives a parent task the dates the chart worked out for it', () => {
    const chart = createGanttChart([
      {
        name: 'Phase one',
        // A summary row states no dates of its own: AnyChart derives them
        // from the children and keeps them in the item's meta. Reading only
        // the authored fields would leave every summary row empty.
        meta: {
          autoStart: Date.UTC(2024, 0, 1),
          autoEnd: Date.UTC(2024, 1, 5),
        },
        children: [
          {
            name: 'Research',
            actualStart: Date.UTC(2024, 0, 1),
            actualEnd: Date.UTC(2024, 0, 15),
          },
          {
            name: 'Write',
            actualStart: Date.UTC(2024, 0, 15),
            actualEnd: Date.UTC(2024, 1, 5),
          },
        ],
      },
    ]);

    const data = ganttData(chart);
    // Depth first, parents before their children — the order the chart stacks
    // its rows in.
    expect(data.lanes).toEqual(['Phase one', 'Research', 'Write']);
    expect(data.points[0][0].start).toBe(Date.UTC(2024, 0, 1) / MS_PER_DAY);
    expect(data.points[0][0].end).toBe(Date.UTC(2024, 1, 5) / MS_PER_DAY);
  });

  it('keeps an undated task as an empty lane that still has a name', () => {
    const chart = createGanttChart([
      {
        name: 'Research',
        actualStart: Date.UTC(2024, 0, 1),
        actualEnd: Date.UTC(2024, 0, 15),
      },
      { name: 'Unscheduled' },
    ]);

    const data = ganttData(chart);
    // Nothing is booked in it, which is a real statement about a plan — and
    // the row a reader can navigate onto and otherwise be told nothing about.
    expect(data.points[1]).toEqual([]);
    expect(data.lanes?.[1]).toBe('Unscheduled');
  });

  it('reads a milestone as the instant it is', () => {
    const chart = createGanttChart([
      { name: 'Ship', actualStart: Date.UTC(2024, 0, 15) },
      {
        name: 'Write',
        actualStart: Date.UTC(2024, 0, 1),
        actualEnd: Date.UTC(2024, 0, 20),
      },
    ]);

    const [milestone] = ganttData(chart).points[0];
    expect(milestone.start).toBe(milestone.end);
  });

  it('reads a resource chart as several intervals in one lane', () => {
    const chart = createGanttChart(
      [
        {
          name: 'Alice',
          periods: [
            { id: 'p1', start: Date.UTC(2024, 0, 1), end: Date.UTC(2024, 0, 5) },
            { id: 'p2', start: Date.UTC(2024, 0, 9), end: Date.UTC(2024, 0, 12) },
          ],
        },
      ],
      { chartType: 'gantt-resource' },
    );

    const layer = anyChartToMaidr(chart)!.subplots[0][0].layers[0];
    const data = layer.data as GanttData;
    expect(data.points[0]).toHaveLength(2);
    expect(data.points[0].map(p => p.label)).toEqual(['p1', 'p2']);
    // A resource chart's rows are who is booked, not what is to be done.
    expect(layer.axes?.y?.label).toBe('Resource');
  });

  it('emits one exact-match selector per interval, lane by lane', () => {
    const chart = createGanttChart([
      {
        name: 'Research',
        actualStart: Date.UTC(2024, 0, 1),
        actualEnd: Date.UTC(2024, 0, 15),
      },
      { name: 'Unscheduled' },
      {
        name: 'Write',
        actualStart: Date.UTC(2024, 0, 15),
        actualEnd: Date.UTC(2024, 1, 5),
      },
    ]);

    // `GanttTrace` slices the resolved elements lane by lane, so the order
    // they arrive in IS the reading. The empty lane contributes none.
    expect(anyChartToMaidr(chart)!.subplots[0][0].layers[0].selectors).toEqual([
      '[data-maidr-anychart-task-bar="0-0"]',
      '[data-maidr-anychart-task-bar="2-0"]',
    ]);
  });

  it('binds nothing when a chart names itself a gantt but holds no tree', () => {
    // The structural half of the detection: a gantt with a flat data view has
    // not been given its schedule, and silence is the acceptable failure.
    expect(anyChartToMaidr(createGanttChart([], { dataView: true }))).toBeNull();
  });

  it('binds nothing when no task in the plan is dated', () => {
    const chart = createGanttChart([{ name: 'One' }, { name: 'Two' }]);
    expect(anyChartToMaidr(chart)).toBeNull();
  });

  it('leaves a timeline chart alone', () => {
    // `anychart.timeline()` is a third constructor with a series API of its
    // own, whose moments are instants rather than intervals. Reading one here
    // would announce a schedule the chart did not draw.
    const chart = createGanttChart(
      [{ name: 'Talk', actualStart: Date.UTC(2024, 0, 1) }],
      { chartType: 'timeline' },
    );
    expect(anyChartToMaidr(chart)).toBeNull();
  });
});

describe('bindAnyChart (gantt stamping)', () => {
  const TASKS: TaskSpec[] = [
    {
      name: 'Research',
      actualStart: Date.UTC(2024, 0, 1),
      actualEnd: Date.UTC(2024, 0, 15),
    },
    {
      name: 'Write',
      actualStart: Date.UTC(2024, 0, 15),
      actualEnd: Date.UTC(2024, 1, 5),
    },
  ];

  it('stamps the task bars lane by lane', () => {
    const { container, paths } = createRenderedGantt('gantt-plain', [
      [{ left: 10, width: 40 }, { left: 50, width: 60 }],
    ]);
    bindAnyChart(createGanttChart(TASKS, { container }));

    expect(paths[0].map(p => p.getAttribute('data-maidr-anychart-task-bar')))
      .toEqual(['0-0', '1-0']);

    cleanUp(container);
  });

  it('picks the bars out of the row stripes drawn behind them', () => {
    // A project chart draws one stripe per row and one bar per row, so both
    // layers hold exactly as many shapes as the schedule has intervals. What
    // separates them is that a schedule's bars begin and end in different
    // places and a backdrop is one rectangle repeated down the chart.
    const { container, paths } = createRenderedGantt('gantt-stripes', [
      [{ left: 0, width: 300 }, { left: 0, width: 300 }],
      [{ left: 10, width: 40 }, { left: 50, width: 60 }],
    ]);
    bindAnyChart(createGanttChart(TASKS, { container }));

    expect(paths[0].every(p => !p.hasAttribute('data-maidr-anychart-task-bar')))
      .toBe(true);
    expect(paths[1].map(p => p.getAttribute('data-maidr-anychart-task-bar')))
      .toEqual(['0-0', '1-0']);

    cleanUp(container);
  });

  it('stamps nothing when two layers both look like the schedule', () => {
    const { container, paths } = createRenderedGantt('gantt-ambiguous', [
      [{ left: 10, width: 40 }, { left: 50, width: 60 }],
      [{ left: 15, width: 30 }, { left: 70, width: 20 }],
    ]);
    const warn = jest.spyOn(console, 'warn');

    bindAnyChart(createGanttChart(TASKS, { container }));

    // A bar highlighted for the wrong task is worse than none at all.
    expect(paths.flat().every(p => !p.hasAttribute('data-maidr-anychart-task-bar')))
      .toBe(true);
    expect(warn.mock.calls.flat().join(' ')).toContain('task bars');

    cleanUp(container);
  });

  it('stamps nothing when no layer holds the right number of shapes', () => {
    const { container, paths } = createRenderedGantt('gantt-mismatch', [
      [{ left: 10, width: 40 }, { left: 50, width: 60 }, { left: 90, width: 20 }],
    ]);
    bindAnyChart(createGanttChart(TASKS, { container }));

    expect(paths.flat().every(p => !p.hasAttribute('data-maidr-anychart-task-bar')))
      .toBe(true);

    cleanUp(container);
  });
});
