/**
 * The titles an AnyChart chart does not draw.
 *
 * AnyChart's default theme gives every title placeholder text and leaves it
 * disabled. Measured on AnyChart 8.13: an untitled chart reports `text()` as
 * "Chart Title" ("Pie Chart" on a pie) and an untitled axis as "X-Axis" or
 * "Y-Axis", each with `enabled()` false; `title('Sales')` and
 * `title({ text: 'Sales' })` turn `enabled()` true, and `title().text('Sales')`
 * on its own leaves it false and draws nothing.
 */

import type {
  AnyChartAxis,
  AnyChartInstance,
  AnyChartSeries,
  AnyChartTitle,
} from '@adapters/anychart/types';
import type { MaidrLayer } from '@type/grammar';
import { anyChartToMaidr } from '@adapters/anychart/converters';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

function title(text: string, enabled?: boolean): AnyChartTitle {
  return {
    text: () => text,
    ...(enabled === undefined ? {} : { enabled: () => enabled }),
  };
}

function axis(text: string, enabled: boolean): AnyChartAxis {
  return {
    title: () => title(text, enabled),
    labels: () => ({ enabled: () => true }),
  };
}

function columnChart(
  chartTitle: AnyChartTitle,
  axes: { x: AnyChartAxis; y: AnyChartAxis },
): AnyChartInstance {
  const rows = [{ x: 'Mon', value: 3 }, { x: 'Tue', value: 5 }];
  const series: AnyChartSeries = {
    id: () => 0,
    name: () => 'Series 0',
    seriesType: () => 'column',
    getIterator: () => {
      let index = -1;
      return {
        advance: () => ++index < rows.length,
        get: (field: string) => (rows[index] as Record<string, unknown> | undefined)?.[field],
        getIndex: () => index,
        getRowsCount: () => rows.length,
        reset: () => {
          index = -1;
        },
      };
    },
    getPoint: () => ({ get: () => undefined, getIndex: () => 0, exists: () => false }),
    getStat: () => undefined,
  };
  return {
    title: () => chartTitle,
    container: () => '',
    getType: () => 'column',
    getSeriesCount: () => 1,
    getSeriesAt: (i: number) => (i === 0 ? series : null),
    xAxis: () => axes.x,
    yAxis: () => axes.y,
  };
}

function untitledGantt(): AnyChartInstance {
  const task = {
    get: (field: string) => ({
      name: 'Design',
      actualStart: Date.UTC(2024, 0, 8),
      actualEnd: Date.UTC(2024, 1, 5),
    } as Record<string, unknown>)[field],
    meta: () => undefined,
    numChildren: () => 0,
    getChildAt: () => null,
  };
  return {
    // What `anychart.ganttProject()` answers when `title()` was never called.
    title: () => title('Chart Title', false),
    container: () => '',
    getType: () => 'gantt-project',
    data: () => ({ numChildren: () => 1, getChildAt: () => task }),
  } as unknown as AnyChartInstance;
}

function firstLayer(chart: AnyChartInstance): MaidrLayer {
  return anyChartToMaidr(chart)!.subplots[0][0].layers[0];
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('an anychart chart title', () => {
  it('is left out when the chart draws none', () => {
    // The gantt example never calls `title()`, and was announced as
    // "Chart Title, Gantt Chart".
    expect(anyChartToMaidr(untitledGantt())?.title).toBeUndefined();
  });

  it('is read when the chart draws it', () => {
    const chart = columnChart(title('Sales', true), {
      x: axis('Day', true),
      y: axis('Units', true),
    });

    expect(anyChartToMaidr(chart)?.title).toBe('Sales');
  });

  it('is left out when only its text was set, which the chart does not draw', () => {
    const chart = columnChart(title('Sales', false), {
      x: axis('Day', true),
      y: axis('Units', true),
    });

    expect(anyChartToMaidr(chart)?.title).toBeUndefined();
  });

  it('is read from a title object that cannot say whether it is drawn', () => {
    // Builds and wrappers without `enabled()` keep the reading they had.
    const chart = columnChart(title('Sales'), {
      x: axis('Day', true),
      y: axis('Units', true),
    });

    expect(anyChartToMaidr(chart)?.title).toBe('Sales');
  });
});

describe('an anychart axis title', () => {
  it('is left out when the axis draws none, rather than read as "X-Axis"', () => {
    const chart = columnChart(title('Sales', true), {
      x: axis('X-Axis', false),
      y: axis('Y-Axis', false),
    });

    expect(firstLayer(chart).axes?.x?.label).toBeUndefined();
    expect(firstLayer(chart).axes?.y?.label).toBeUndefined();
  });

  it('is read when the axis draws it', () => {
    const chart = columnChart(title('Sales', true), {
      x: axis('Day', true),
      y: axis('Y-Axis', false),
    });

    expect(firstLayer(chart).axes?.x?.label).toBe('Day');
    expect(firstLayer(chart).axes?.y?.label).toBeUndefined();
  });
});
