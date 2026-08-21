import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { GanttData, MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { Orientation, TraceType } from '@type/grammar';

/**
 * A range chart read or dropped on its mark's name alone (#1122).
 *
 * `resolveTraceType` had cases for `bar`, `line`, `area`, `point`, `rect`,
 * `arc`, `errorbar` and the rest, and none for `rule`, so a spec spanning
 * `x`–`x2` fell to `default: return null` and the figure came back with no
 * layers. The identical spec written with `mark: 'bar'` read as a gantt.
 *
 * Which of the two an author writes is a choice about how thick the span is
 * painted, not about what it means, and Vega-Lite's own gallery reaches for
 * `rule` to draw a range chart.
 *
 * The three other charts that wear this mark keep resolving to nothing, and
 * the spec separates them cleanly — a reference line and a lollipop's stem
 * each carry **one** positional field, so neither states an interval any row
 * of the data contains. That is what makes this cheaper than the same
 * reading on the Observable side (#1100), where the shapes had to be told
 * apart by measuring the drawn geometry.
 */

const SCHEDULE = {
  values: [
    { task: 'Design', start: 0, end: 3 },
    { task: 'Build', start: 3, end: 8 },
    { task: 'Ship', start: 8, end: 10 },
  ],
};

/** The lanes-on-y spelling, which is how a schedule is ordinarily drawn. */
function lanesOnY(mark: string): VegaLiteSpec {
  return {
    data: SCHEDULE,
    mark,
    encoding: {
      y: { field: 'task', type: 'ordinal', title: 'Task' },
      x: { field: 'start', type: 'quantitative', title: 'Day' },
      x2: { field: 'end' },
    },
  } as VegaLiteSpec;
}

function layersOf(spec: VegaLiteSpec): MaidrLayer[] {
  return vegaLiteToMaidr(spec).subplots[0][0].layers;
}

function onlyLayer(spec: VegaLiteSpec): MaidrLayer {
  const layers = layersOf(spec);
  expect(layers).toHaveLength(1);
  return layers[0];
}

describe('vega-Lite rules that span a range', () => {
  it('reads a rule spanning x–x2 as the gantt it draws', () => {
    const layer = onlyLayer(lanesOnY('rule'));

    expect(layer.type).toBe(TraceType.GANTT);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data as GanttData).toEqual({
      // One lane per task, in first-seen row order, and the lane list beside
      // them — the nested payload a schedule needs so a lane nothing books
      // is still a row the reader can land on.
      lanes: ['Design', 'Build', 'Ship'],
      points: [
        [{ x: 'Design', start: 0, end: 3 }],
        [{ x: 'Build', start: 3, end: 8 }],
        [{ x: 'Ship', start: 8, end: 10 }],
      ],
    });
  });

  it('reads it exactly as the same chart written with a bar', () => {
    // The heart of it: the two specs differ in one string, and differed in
    // whether the chart was read at all. Compared field by field rather than
    // both being asserted against a literal, so the two cannot drift apart
    // while each still matches something written down.
    const asRule = onlyLayer(lanesOnY('rule'));
    const asBar = onlyLayer(lanesOnY('bar'));

    expect(asRule.type).toBe(asBar.type);
    expect(asRule.data).toEqual(asBar.data);
    expect(asRule.axes).toEqual(asBar.axes);
    expect(asRule.orientation).toBe(asBar.orientation);
  });

  it('reads the lanes-on-x spelling too', () => {
    const layer = onlyLayer({
      data: SCHEDULE,
      mark: 'rule',
      encoding: {
        x: { field: 'task', type: 'ordinal', title: 'Task' },
        y: { field: 'start', type: 'quantitative', title: 'Day' },
        y2: { field: 'end' },
      },
    });

    expect(layer.type).toBe(TraceType.GANTT);
    // Lanes down x is the vertical spelling, so no orientation is emitted —
    // the same thing the bar case does, and the reason it is asserted is
    // that the two axes are read from different channels either way.
    expect(layer.orientation).toBeUndefined();
  });

  it('highlights through the element Vega draws a rule as', () => {
    // A `rule` renders as `<line>` where a `bar` renders as `<path>`, and a
    // selector naming the wrong tag matches nothing — which costs the layer
    // its highlighting without costing it anything else, so no other
    // assertion in this file would notice.
    const layer = onlyLayer(lanesOnY('rule'));

    expect(layer.selectors).toContain('mark-rule');
    expect(layer.selectors).toContain('line');
    expect(layer.selectors).not.toContain('path');
  });

  it('reads a rule over a running total as the waterfall a bar would be', () => {
    // `resolveRangedBarType` separates the two by `hasRunningSumTransform`,
    // and that branch is reachable from this mark now. Nobody draws a
    // waterfall with a `rule`, which is exactly why it is pinned: the
    // mark's name reaches only the warning string, and a future change that
    // gave it its own branch would be silent otherwise.
    const layer = onlyLayer({
      data: {
        values: [
          { label: 'Begin', amount: 4000 },
          { label: 'Jan', amount: 1707 },
          { label: 'Feb', amount: -1425 },
        ],
      },
      transform: [
        { window: [{ op: 'sum', field: 'amount', as: 'sum' }] },
        { calculate: 'datum.sum - datum.amount', as: 'previous_sum' },
      ],
      mark: 'rule',
      encoding: {
        x: { field: 'label', type: 'ordinal', title: 'Month' },
        y: { field: 'previous_sum', type: 'quantitative', title: 'Amount' },
        y2: { field: 'sum' },
      },
    });

    expect(layer.type).toBe(TraceType.WATERFALL);
  });

  it('leaves a reference line unread', () => {
    // One positional field: Vega-Lite draws it across the whole frame
    // because it was given the frame, not because a row said so.
    expect(layersOf({
      data: SCHEDULE,
      mark: 'rule',
      encoding: { y: { field: 'start', type: 'quantitative' } },
    })).toHaveLength(0);
  });

  it('leaves a lollipop stem unread', () => {
    // `x` and `y` with no second bound: the stem runs from the baseline to
    // the value, so reading it as a span would announce "0 to 8" where the
    // chart means "8".
    expect(layersOf({
      data: SCHEDULE,
      mark: 'rule',
      encoding: {
        x: { field: 'task', type: 'ordinal' },
        y: { field: 'start', type: 'quantitative' },
      },
    })).toHaveLength(0);
  });

  it('leaves a rule whose second bound is a constant unread', () => {
    // `x2: { datum: 0 }` is the baseline an ordinary lollipop already stands
    // on, not a bound taken from the data — the distinction `hasField`
    // exists for, asserted here because this mark now reaches it.
    expect(layersOf({
      data: SCHEDULE,
      mark: 'rule',
      encoding: {
        y: { field: 'task', type: 'ordinal' },
        x: { field: 'start', type: 'quantitative' },
        x2: { datum: 0 },
      },
    })).toHaveLength(0);
  });

  it('leaves a rule unread when the lane axis has no declared type', () => {
    // Vega-Lite would infer the type at compile time; the spec alone cannot,
    // so there is nothing to name the lanes with. Refused rather than
    // guessed, the same as the bar case.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(layersOf({
        data: SCHEDULE,
        mark: 'rule',
        encoding: {
          y: { field: 'task' },
          x: { field: 'start', type: 'quantitative' },
          x2: { field: 'end' },
        },
      })).toHaveLength(0);

      // And the advice names what actually became of this mark. A `bar` in
      // the same position still reads as an ordinary bar, so the two
      // sentences cannot be the same one.
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('leaving the rule unread'),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('still tells a bar what a bar falls back to', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const layer = onlyLayer({
        data: SCHEDULE,
        mark: 'bar',
        encoding: {
          y: { field: 'task' },
          x: { field: 'start', type: 'quantitative' },
          x2: { field: 'end' },
        },
      });

      expect(layer.type).toBe(TraceType.BAR);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('reading it as an ordinary bar'),
      );
    } finally {
      warn.mockRestore();
    }
  });
});
