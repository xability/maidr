import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { GanttData, MaidrLayer, WaterfallPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { Orientation, TraceType } from '@type/grammar';
import { makeView } from './fixtures/testView';

const SCHEDULE = {
  values: [
    { task: 'Design', start: 0, end: 3 },
    { task: 'Design', start: 5, end: 6 },
    { task: 'Build', start: 3, end: 8 },
    { task: 'Ship', start: 8, end: 10 },
  ],
};

/**
 * A gantt chart: a `bar` spanning `x`–`x2` with its lanes on an ordinal y.
 * Vega-Lite passes such rows through untransformed, so the compiled
 * dataset is the source data — captured from a real compiled view.
 */
const ganttSpec: VegaLiteSpec = {
  data: SCHEDULE,
  mark: 'bar',
  encoding: {
    y: { field: 'task', type: 'ordinal', title: 'Task' },
    x: { field: 'start', type: 'quantitative', title: 'Day' },
    x2: { field: 'end' },
  },
};

/**
 * The waterfall of the official "Monthly Profit and Loss" example, trimmed
 * to the bar layer: a `window` sum builds the running total, and the two
 * `calculate`s give each bar the total before it and the total after.
 */
const waterfallSpec: VegaLiteSpec = {
  data: {
    values: [
      { label: 'Begin', amount: 4000 },
      { label: 'Jan', amount: 1707 },
      { label: 'Feb', amount: -1425 },
      { label: 'End', amount: 0 },
    ],
  },
  transform: [
    { window: [{ op: 'sum', field: 'amount', as: 'sum' }] },
    { calculate: 'datum.label === \'End\' ? 0 : datum.sum - datum.amount', as: 'previous_sum' },
  ],
  encoding: { x: { field: 'label', type: 'ordinal', title: 'Month' } },
  layer: [
    {
      mark: { type: 'bar' },
      encoding: {
        y: { field: 'previous_sum', type: 'quantitative', title: 'Amount' },
        y2: { field: 'sum' },
      },
    },
  ],
};

/** The rows that spec's transforms produce, captured from a compiled view. */
const COMPILED_WATERFALL = [
  { label: 'Begin', amount: 4000, sum: 4000, previous_sum: 0 },
  { label: 'Jan', amount: 1707, sum: 5707, previous_sum: 4000 },
  { label: 'Feb', amount: -1425, sum: 4282, previous_sum: 5707 },
  { label: 'End', amount: 4282, sum: 4282, previous_sum: 0 },
];

function onlyLayer(
  spec: VegaLiteSpec,
  datasets?: Record<string, unknown[]>,
  scales?: Record<string, unknown[]>,
): MaidrLayer {
  const view = datasets ? makeView(datasets, scales) : undefined;
  const result = vegaLiteToMaidr(spec, view);
  const layers = result.subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

describe('vega-Lite bars that span a range', () => {
  it('converts a bar spanning x–x2 into gantt lanes', () => {
    const layer = onlyLayer(ganttSpec);

    expect(layer.type).toBe(TraceType.GANTT);
    // Lanes keep first-seen row order, which is the order Vega drew them —
    // what lets the highlight elements be sliced per lane.
    expect(layer.data as GanttData).toEqual({
      points: [
        [
          { x: 'Design', start: 0, end: 3 },
          { x: 'Design', start: 5, end: 6 },
        ],
        [{ x: 'Build', start: 3, end: 8 }],
        [{ x: 'Ship', start: 8, end: 10 }],
      ],
      lanes: ['Design', 'Build', 'Ship'],
    });
    // A schedule drawn along x with its lanes down y is horizontal, so
    // `GanttTrace` names the lane with the y axis and the span with x.
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.axes?.x?.label).toBe('Day');
    expect(layer.axes?.y?.label).toBe('Task');
    expect(layer.selectors).toBe(
      'g.mark-rect.role-mark.marks path, g.mark-rect.role-mark.layer_0_marks path',
    );
  });

  it('keeps a lane the scale declares but no interval fills', () => {
    const layer = onlyLayer(
      ganttSpec,
      { data_0: SCHEDULE.values },
      // Vega sorts an ordinal domain, so the unbooked lane arrives among
      // the booked ones rather than at the end.
      { y: ['Build', 'Design', 'Review', 'Ship'] },
    );

    const data = layer.data as GanttData;
    expect(data.lanes).toEqual(['Design', 'Build', 'Ship', 'Review']);
    expect(data.points[3]).toEqual([]);
  });

  it('withholds the selectors when a lane\'s intervals are not adjacent', () => {
    // `GanttTrace` slices one flat element list lane by lane, and Vega
    // emits those elements in row order. Interleaved rows would hand lane
    // "A" the bar Vega drew for lane "B", so no highlight is better.
    const layer = onlyLayer({
      ...ganttSpec,
      data: {
        values: [
          { task: 'Design', start: 0, end: 3 },
          { task: 'Build', start: 3, end: 8 },
          { task: 'Design', start: 5, end: 6 },
        ],
      },
    });

    expect(layer.type).toBe(TraceType.GANTT);
    expect(layer.selectors).toBeUndefined();
    // The reading itself is unaffected — only the highlight is withheld.
    expect((layer.data as GanttData).points).toEqual([
      [
        { x: 'Design', start: 0, end: 3 },
        { x: 'Design', start: 5, end: 6 },
      ],
      [{ x: 'Build', start: 3, end: 8 }],
    ]);
  });

  it('reads a vertical ranged bar as a gantt too', () => {
    // Two measured bounds per category — a monthly temperature low and
    // high — is an interval per lane, not a contribution to a total.
    const layer = onlyLayer({
      data: { values: [{ month: 'Jan', low: -5, high: 4 }, { month: 'Feb', low: -2, high: 7 }] },
      mark: 'bar',
      encoding: {
        x: { field: 'month', type: 'ordinal' },
        y: { field: 'low', type: 'quantitative' },
        y2: { field: 'high' },
      },
    });

    expect(layer.type).toBe(TraceType.GANTT);
    expect(layer.orientation).toBeUndefined();
    expect((layer.data as GanttData).points).toEqual([
      [{ x: 'Jan', start: -5, end: 4 }],
      [{ x: 'Feb', start: -2, end: 7 }],
    ]);
  });

  it('converts a running-total bar into waterfall steps', () => {
    const layer = onlyLayer(waterfallSpec, {
      layer_0_marks: COMPILED_WATERFALL.map(datum => ({ datum })),
    });

    expect(layer.type).toBe(TraceType.WATERFALL);
    expect(layer.data as WaterfallPoint[]).toEqual([
      // The opening and closing bars stand on the baseline: they restate
      // the running total rather than contributing to it.
      { x: 'Begin', start: 0, end: 4000, delta: 4000, kind: 'total' },
      { x: 'Jan', start: 4000, end: 5707, delta: 1707, kind: 'increase' },
      { x: 'Feb', start: 5707, end: 4282, delta: -1425, kind: 'decrease' },
      { x: 'End', start: 0, end: 4282, delta: 4282, kind: 'total' },
    ]);
    expect(layer.axes?.x?.label).toBe('Month');
    expect(layer.axes?.y?.label).toBe('Amount');
    expect(layer.selectors).toBe('g.mark-rect.role-mark.layer_0_marks path');
  });

  it('needs the running sum to call a ranged bar a waterfall', () => {
    // The same bar without the window transform is a plain ranged bar, and
    // announcing its two bounds as a contribution would invent an
    // accumulation the chart never drew.
    const layer = onlyLayer(
      { ...waterfallSpec, transform: undefined },
      { layer_0_marks: COMPILED_WATERFALL.map(datum => ({ datum })) },
    );

    expect(layer.type).toBe(TraceType.GANTT);
  });

  it('reads a waterfall drawn along x as a waterfall, not a schedule', () => {
    // The same running total laid out sideways: the steps run down an
    // ordinal y and the bars span x–x2. Read as a gantt, the accumulation
    // would be announced as start and end times of a schedule.
    const rows = [
      { label: 'Begin', amount: 4000, sum: 4000, previous_sum: 0 },
      { label: 'Jan', amount: 1707, sum: 5707, previous_sum: 4000 },
      { label: 'Feb', amount: -1425, sum: 4282, previous_sum: 5707 },
    ];
    const layer = onlyLayer(
      {
        data: { values: rows },
        transform: [{ window: [{ op: 'sum', field: 'amount', as: 'sum' }] }],
        mark: 'bar',
        encoding: {
          y: { field: 'label', type: 'ordinal', title: 'Month' },
          x: { field: 'previous_sum', type: 'quantitative', title: 'Amount' },
          x2: { field: 'sum' },
        },
      },
      { data_0: rows },
    );

    expect(layer.type).toBe(TraceType.WATERFALL);
    expect(layer.data as WaterfallPoint[]).toEqual([
      { x: 'Begin', start: 0, end: 4000, delta: 4000, kind: 'total' },
      { x: 'Jan', start: 4000, end: 5707, delta: 1707, kind: 'increase' },
      { x: 'Feb', start: 5707, end: 4282, delta: -1425, kind: 'decrease' },
    ]);
    // `WaterfallTrace` announces the step against `axes.x` and the
    // contribution against `axes.y` whichever way the chart is drawn, so
    // the sideways layout swaps the two titles rather than the reading.
    expect(layer.axes?.x?.label).toBe('Month');
    expect(layer.axes?.y?.label).toBe('Amount');
  });

  it('warns when a ranged bar leaves its category axis untyped', () => {
    // Without a declared `nominal`/`ordinal` the adapter cannot tell the
    // lane axis from a magnitude, and the bar falls back to an ordinary one
    // whose value is the lower bound alone — quiet enough to be worth
    // saying out loud.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const layer = onlyLayer({
        data: { values: [{ task: 'Design', start: 0, end: 3 }] },
        mark: 'bar',
        encoding: {
          y: { field: 'task' },
          x: { field: 'start', type: 'quantitative' },
          x2: { field: 'end' },
        },
      });

      expect(layer.type).toBe(TraceType.BAR);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"nominal" or "ordinal"'));
    } finally {
      warn.mockRestore();
    }
  });
});
