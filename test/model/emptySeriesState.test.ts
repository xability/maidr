/**
 * A layer with an empty series threw as soon as its state was read (#905).
 *
 * Every populated branch of `AbstractTrace.state` reaches `points[row][col]`
 * through one accessor or another — `LineTrace.text` reads `point.z`,
 * `BarTrace`'s reads `point.x` — and none of them guarded the *point* itself.
 * The optional chaining stopped one step short: `this.points[this.row]?.[this.col]`
 * yields `undefined` for an empty series, and the property read off it threw.
 *
 * The blast radius is what makes it worth a test rather than a shrug. A throw
 * out of trace construction propagates out of `new Figure(...)`, so one
 * malformed layer takes the whole render with it rather than degrading to one
 * silent layer — the same outcome `rules/model.md` describes for an
 * unregistered trace type.
 *
 * A producer can always emit an empty series; py-maidr did, for a subplot
 * whose only trace had nothing to plot (xability/py-maidr#421). The core
 * cannot assume the producer got it right.
 */
import type { Maidr, MaidrLayer } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';

jest.mock('hotkeys-js', () => ({
  __esModule: true,
  default: { setScope: jest.fn() },
}));

/**
 * Build a layer of the given type over the given data.
 * @param type - The trace type to author
 * @param data - The layer's data, in that type's own shape
 * @returns A layer definition
 */
function layer(type: TraceType, data: unknown): MaidrLayer {
  return {
    id: 'empty-layer',
    type,
    title: 'Measurement',
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  } as MaidrLayer;
}

/** Two points, so a populated series can be told from an empty one. */
const POINTS = [{ x: 1, y: 1 }, { x: 2, y: 2 }];

describe('a trace with nothing at the cursor', () => {
  test('the reproduction from the issue answers instead of throwing', () => {
    const trace = TraceFactory.create(layer(TraceType.LINE, [[]]));

    expect(() => trace.state).not.toThrow();
    expect(trace.state.empty).toBe(true);
  });

  test.each([
    ['line', TraceType.LINE, [[]]],
    ['smooth', TraceType.SMOOTH, [[]]],
    ['step', TraceType.STEP, [[]]],
    ['area', TraceType.AREA, [[]]],
    // Not a line at all, and it threw on `point.x` rather than `point.z` —
    // the same defect through a different accessor, which is why the guard
    // sits at the one funnel they share rather than in `LineTrace`.
    ['bar', TraceType.BAR, []],
  ])('a %s layer with no points reports empty', (_name, type, data) => {
    const trace = TraceFactory.create(layer(type, data));

    expect(() => trace.state).not.toThrow();
    expect(trace.state.empty).toBe(true);
  });
});

describe('a ragged layer', () => {
  /**
   * One series with points and one without — the shape a producer emits when
   * a group has no data for the range, and the reason the guard is read at
   * the cursor rather than off the layer as a whole.
   * @returns The trace
   */
  function raggedTrace(): ReturnType<typeof TraceFactory.create> {
    return TraceFactory.create(layer(TraceType.LINE, [POINTS, []]));
  }

  test('the series with points is still described', () => {
    const trace = raggedTrace();

    expect(trace.state.empty).toBe(false);
  });

  test('the empty series reports empty rather than throwing', () => {
    const trace = raggedTrace();
    (trace as unknown as { row: number }).row = 1;

    expect(() => trace.state).not.toThrow();
    expect(trace.state.empty).toBe(true);
  });

  test('moving back to the populated series describes it again', () => {
    // The guard must not latch: an empty row is a fact about where the
    // cursor is, not about the trace.
    const trace = raggedTrace();
    const cursor = trace as unknown as { row: number };

    cursor.row = 1;
    expect(trace.state.empty).toBe(true);

    cursor.row = 0;
    expect(trace.state.empty).toBe(false);
  });
});

describe('a figure carrying one empty layer', () => {
  /**
   * Build a single-subplot figure from the given layers.
   * @param layers - The layers the subplot holds
   * @returns A Maidr config
   */
  function maidr(layers: MaidrLayer[]): Maidr {
    return { id: 'empty-series-test', subplots: [[{ layers }]] };
  }

  test('still constructs', () => {
    // The blast radius: a throw here left MAIDR unmounted and the chart
    // unusable, rather than costing the one layer that was malformed.
    expect(() =>
      new Figure(maidr([layer(TraceType.LINE, [[]])])),
    ).not.toThrow();
  });

  test('does not take its healthy neighbour down with it', () => {
    const figure = new Figure(
      maidr([
        layer(TraceType.LINE, [POINTS]),
        layer(TraceType.LINE, [[]]),
      ]),
    );

    expect(figure.state.empty).toBe(false);
  });
});

describe('a populated trace is unaffected', () => {
  test('it still reports a full state', () => {
    // The guard keys off `dimension`, which every trace already answers, so
    // this pins that reading it changed nothing for the ordinary case.
    const trace = TraceFactory.create(layer(TraceType.LINE, [POINTS]));
    const state = trace.state;

    expect(state.empty).toBe(false);
    expect(state).toHaveProperty('text');
    expect(state).toHaveProperty('audio');
  });
});
