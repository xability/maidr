/**
 * Up and Down on an amCharts gantt follow the drawing.
 *
 * amCharts draws a category y axis from the bottom unless its renderer is
 * inversed, and draws to a canvas, so MAIDR has no highlight to measure the
 * order of the lanes from. Told nothing, it took the first lane to be at the
 * bottom. On amcharts-floating-columns.html the lane axis is inversed and
 * Design, the first lane, is drawn at the top, yet Up from it moved to Build,
 * drawn below it, and Down said "No more data to display".
 */
import type { AmXYSeries } from '@adapters/amcharts/types';
import type { GanttData, MaidrLayer } from '@type/grammar';
import { fromAmCharts } from '@adapters/amcharts/adapter';
import { describe, expect, it } from '@jest/globals';
import { GanttTrace } from '@model/gantt';
import { fakeChart, fakeRoot, fakeSeries, fakeTimeAxis } from './helpers';

const DAY = 86_400_000;
const LANES = ['Design', 'Build', 'Review'];

/**
 * A lane axis whose renderer answers the one setting the adapter reads, and
 * whose data items name the lanes in the order the axis declares them.
 *
 * @param inversed - Whether its renderer is inversed
 * @returns The axis
 */
function laneAxis(inversed: boolean): unknown {
  const renderer = { get: (key: string) => (key === 'inversed' ? inversed : undefined) };
  return {
    className: 'CategoryAxis',
    get: (key: string) => (key === 'renderer' ? renderer : undefined),
    dataItems: LANES.map(category => ({
      get: (key: string) => (key === 'category' ? category : undefined),
    })),
  };
}

/**
 * The gantt layer of a three-lane schedule on a date axis.
 *
 * @param inversed - Whether the lane axis' renderer is inversed
 * @returns The layer
 */
function schedule(inversed: boolean): MaidrLayer {
  const series: AmXYSeries = fakeSeries({
    className: 'ColumnSeries',
    name: 'Schedule',
    settings: {
      categoryYField: 'category',
      openValueXField: 'fromDate',
      xAxis: fakeTimeAxis('day'),
      yAxis: laneAxis(inversed),
    },
    data: [
      { categoryY: 'Design', openValueX: 0, valueX: 30 * DAY },
      { categoryY: 'Build', openValueX: 30 * DAY, valueX: 100 * DAY },
      { categoryY: 'Review', openValueX: 75 * DAY, valueX: 90 * DAY },
    ],
  });
  return fromAmCharts(fakeRoot([fakeChart({ series: [series], xLabel: 'Day', yLabel: 'Phase' })]))
    .subplots[0][0]
    .layers[0];
}

/**
 * The trace a reader walks, entered on the first lane.
 *
 * Built without the layer's selectors, as on the canvas amCharts draws to:
 * there is no highlighted element to measure the order of the lanes from.
 *
 * @param layer - The gantt layer
 * @returns The trace, on the first interval of the first lane
 */
function enter(layer: MaidrLayer): GanttTrace {
  const trace = new GanttTrace({ ...layer, selectors: undefined });
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * The lane the reader is on, as announced.
 *
 * @param trace - The trace
 * @returns The lane's name
 */
function lane(trace: GanttTrace): unknown {
  const state = trace.state;
  if (state.empty || state.type !== 'trace') {
    throw new Error('expected a populated trace state');
  }
  return state.text.main.value;
}

describe('an amCharts gantt', () => {
  it('says its first lane is drawn at the top on an inversed lane axis, so Down moves down the drawing', () => {
    const layer = schedule(true);

    const trace = enter(layer);

    expect((layer.data as GanttData).firstLane).toBe('top');
    expect(lane(trace)).toBe('Design');
    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(lane(trace)).toBe('Build');
  });

  it('says its first lane is drawn at the bottom on a plain lane axis, so Up moves up the drawing', () => {
    const layer = schedule(false);

    const trace = enter(layer);

    expect((layer.data as GanttData).firstLane).toBe('bottom');
    expect(lane(trace)).toBe('Design');
    expect(trace.isMovable('DOWNWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(lane(trace)).toBe('Build');
  });
});
