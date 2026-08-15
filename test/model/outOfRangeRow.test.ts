/**
 * `dimension` threw on an out-of-range row, before any guard could run (#910).
 *
 * Several traces read `this.<values>[this.row].length` with no bounds check,
 * so a cursor parked past the end of the outer array threw inside `dimension`
 * itself. That is a different failure from an empty series (#905, fixed in
 * #909) and the guard added there cannot reach it: `isEmptyAtCursor` is keyed
 * off* `dimension`, so `dimension` throwing happens first.
 *
 * The two look alike and are not. An empty series is a cursor sitting
 * somewhere real that has nothing in it, and `dimension` answers honestly with
 * `cols: 0`. An out-of-range row is a cursor sitting somewhere that does not
 * exist, and there is nothing to answer with until the read is guarded.
 *
 * Scoped to traces. `Figure.dimension` indexes `subplots[this.row]` the same
 * way, but guarding it changes nothing observable: `Figure.state` reaches
 * `activeSubplot`, which does its own unguarded `subplots[this.row][this.col]`
 * and throws first. That is a separate read with a separate fix — and unlike a
 * trace it has no `getStateAt` to reach it, so navigation cannot get there.
 * Left alone rather than half-guarded.
 *
 * Reachable through `AbstractTrace.getStateAt(row, col)`, which assigns
 * `this.row` / `this.col` directly with no validation — it is what monitor
 * mode uses to sonify a newly appended point without moving the user's cursor.
 * Ordinary keyboard navigation cannot get here: `MovableGrid`/`MovableGraph`
 * bound the cursor to real positions.
 */
import type { MaidrLayer } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
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
    id: 'out-of-range-layer',
    type,
    title: 'Measurement',
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  } as MaidrLayer;
}

/** A row index no trace below has, so every read of it is out of range. */
const PAST_THE_END = 5;

describe('a cursor parked past the end of the data', () => {
  test('the reproduction from the issue answers instead of throwing', () => {
    const trace = TraceFactory.create(
      layer(TraceType.LINE, [[{ x: 1, y: 1 }]]),
    );
    trace.row = PAST_THE_END;

    expect(() => trace.state).not.toThrow();
    expect(trace.state.empty).toBe(true);
  });

  test.each([
    ['line', TraceType.LINE, [[{ x: 1, y: 1 }, { x: 2, y: 2 }]]],
    ['smooth', TraceType.SMOOTH, [[{ x: 1, y: 1 }, { x: 2, y: 2 }]]],
    ['step', TraceType.STEP, [[{ x: 1, y: 1 }, { x: 2, y: 2 }]]],
    ['area', TraceType.AREA, [[{ x: 1, y: 1 }, { x: 2, y: 2 }]]],
    ['bar', TraceType.BAR, [{ x: 'a', y: 1 }, { x: 'b', y: 2 }]],
    [
      'heatmap',
      TraceType.HEATMAP,
      { x: ['a', 'b'], y: ['p', 'q'], points: [[1, 2], [3, 4]] },
    ],
  ])('a %s trace reports empty rather than throwing', (_name, type, data) => {
    const trace = TraceFactory.create(layer(type, data));
    trace.row = PAST_THE_END;

    expect(() => trace.state).not.toThrow();
    expect(trace.state.empty).toBe(true);
  });

  // `box` and `pie` are patched by the same change but do not fit the table
  // above: a box point is a five-number summary rather than an {x, y} pair,
  // and a pie is a single row of slices. Given separately rather than left
  // untested, since both are in the diff.

  test('a box trace reports empty rather than throwing', () => {
    // Its own index, deliberately: `boxValues` is section-major, so a single
    // box is seven rows (the five-number summary plus the outlier groups) and
    // `PAST_THE_END` would still be inside it. Picking a row that is only
    // past the end of *some* traces is how a guard gets a green test it never
    // exercised.
    const trace = TraceFactory.create(
      layer(TraceType.BOX, [
        {
          z: 'a',
          lowerOutliers: [],
          min: 1,
          q1: 2,
          q2: 3,
          q3: 4,
          max: 5,
          upperOutliers: [],
        },
      ]),
    );
    trace.row = 99;

    expect(() => trace.state).not.toThrow();
    expect(trace.state.empty).toBe(true);
  });

  test('a pie trace reports empty rather than throwing', () => {
    // Worth its own case beyond shape: `PieTrace.dimension` hardcodes
    // `rows: 1`, so the row index is the one thing nothing else keeps at 0.
    const trace = TraceFactory.create(
      layer(TraceType.PIE, [{ x: 'a', y: 1 }, { x: 'b', y: 2 }]),
    );
    trace.row = PAST_THE_END;

    expect(() => trace.state).not.toThrow();
    expect(trace.state.empty).toBe(true);
  });
});

describe('the cursor coming back into range', () => {
  test('the trace describes itself again', () => {
    // The guard reports on where the cursor is, not on the trace, so it must
    // not latch — the same property the empty-series guard needed.
    const trace = TraceFactory.create(
      layer(TraceType.LINE, [[{ x: 1, y: 1 }, { x: 2, y: 2 }]]),
    );

    trace.row = PAST_THE_END;
    expect(trace.state.empty).toBe(true);

    trace.row = 0;
    expect(trace.state.empty).toBe(false);
  });
});

describe('an in-range cursor is unaffected', () => {
  test('a populated trace still reports a full state', () => {
    const trace = TraceFactory.create(
      layer(TraceType.LINE, [[{ x: 1, y: 1 }, { x: 2, y: 2 }]]),
    );
    const state = trace.state;

    expect(state.empty).toBe(false);
    expect(state).toHaveProperty('text');
    expect(state).toHaveProperty('audio');
  });

  test('a second series is still reachable', () => {
    // `rows` is untouched by this change, so a row that does exist keeps
    // answering — the guard only covers reads past the end.
    const trace = TraceFactory.create(
      layer(TraceType.LINE, [
        [{ x: 1, y: 1 }, { x: 2, y: 2 }],
        [{ x: 1, y: 3 }, { x: 2, y: 4 }],
      ]),
    );
    trace.row = 1;

    expect(trace.state.empty).toBe(false);
  });
});
