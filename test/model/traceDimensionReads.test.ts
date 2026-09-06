/**
 * How often one keypress asks a trace for its shape.
 *
 * `dimension` is not a field. Several traces compute it -- GanttTrace,
 * HexbinTrace, RidgelineTrace and BoxenTrace all reduce over every row to find
 * the widest, and ScatterTrace re-runs its mode branching -- and each call
 * allocates a fresh `{rows, cols}`. Reading it repeatedly inside one state
 * computation therefore costs a full row scan each time on those traces, for
 * an answer that cannot change between the reads.
 */

import type { Dimension } from '@model/abstract';
import type { MaidrLayer } from '@type/grammar';
import { describe, expect, it } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * A bar trace that counts how often its shape is asked for.
 */
class CountingBarTrace extends BarTrace {
  public reads = 0;

  protected override get dimension(): Dimension {
    this.reads += 1;
    return super.dimension;
  }
}

/**
 * A bar trace over four categories, entered and sitting on the first bar.
 * @returns The counting trace
 */
function barTrace(): CountingBarTrace {
  const layer: MaidrLayer = {
    id: 'dimension-layer',
    type: TraceType.BAR,
    title: 'Dimension reads',
    axes: { x: { label: 'Category' }, y: { label: 'Count' } },
    data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }, { x: 'C', y: 3 }, { x: 'D', y: 4 }],
  };
  const trace = new CountingBarTrace(layer);
  trace.moveOnce('FORWARD');
  return trace;
}

describe('a trace is asked for its shape once per question', () => {
  it('reads its shape a bounded number of times for one keypress', () => {
    const trace = barTrace();

    trace.reads = 0;
    trace.moveOnce('FORWARD');

    // Bounds check, safe indices, the empty-cursor guard and the autoplay
    // limits are four separate questions; nothing beyond them should ask.
    expect(trace.reads).toBeLessThanOrEqual(4);
  });

  it('still reports the same autoplay limits it always did', () => {
    const trace = barTrace();

    const state = trace.state;

    expect(state.empty).toBe(false);
    if (!state.empty) {
      expect(state.autoplay).toEqual({
        UPWARD: 1,
        DOWNWARD: 1,
        FORWARD: 4,
        BACKWARD: 4,
      });
    }
  });

  it('still reports the limits of the row the cursor is on', () => {
    // A line trace's column count is the length of the *current* series, so
    // the answer has to be read after the move rather than carried over it.
    const trace = new LineTrace({
      id: 'ragged-line',
      type: TraceType.LINE,
      title: 'Ragged series',
      axes: { x: { label: 'X' }, y: { label: 'Y' } },
      data: [
        [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        [{ x: 0, y: 5 }, { x: 1, y: 6 }, { x: 2, y: 7 }],
      ],
    });
    trace.moveOnce('FORWARD');

    const before = trace.state;
    trace.moveOnce('UPWARD');
    const after = trace.state;

    expect(before.empty).toBe(false);
    if (!before.empty && !after.empty) {
      expect(before.autoplay.FORWARD).toBe(2);
      expect(after.autoplay.FORWARD).toBe(3);
    }
  });
});
