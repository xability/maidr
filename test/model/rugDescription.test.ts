import type { ScatterTrace } from '@model/scatter';
import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * A rug plot, as both bindings emit one.
 *
 * One entry per observation, the observation on `x`, a constant `0` on the
 * axis across the ticks. `height`/`length` is one number for the whole layer,
 * so a tick's length is decoration and only its position is data
 * (xability/py-maidr#250, xability/r-maidr#222).
 */
const RUG: ScatterPoint[] = [
  { x: 1.5, y: 0 },
  { x: 2.5, y: 0 },
  { x: 3.5, y: 0 },
  { x: 7, y: 0 },
];

/**
 * Build a trace over the given points.
 * @param data The points the layer carries
 * @param crossLabel What the constant axis is called
 * @returns The trace
 */
function traceOf(data: ScatterPoint[], crossLabel = 'Rug'): ScatterTrace {
  const layer: MaidrLayer = {
    id: 'rug-layer',
    type: TraceType.SCATTER,
    title: 'Observations',
    axes: { x: { label: 'v' }, y: { label: crossLabel } },
    data,
  };
  return TraceFactory.create(layer) as ScatterTrace;
}

/**
 * Read one stat out of a trace's description.
 * @param trace The trace to read
 * @param label Which stat to take
 * @returns The stat's value
 */
function statOf(trace: ScatterTrace, label: string): unknown {
  return trace.description.stats?.find(stat => stat.label === label)?.value;
}

describe('an axis that never moves', () => {
  test('says it is constant rather than printing a span of nothing', () => {
    // #1132. A rug's pitch axis is the constant one, so every tick sonifies
    // at the bottom of the range and a reader has no way to tell the chart
    // from a fault. `0 to 0` was true and said nothing.
    expect(statOf(traceOf(RUG), 'Y range')).toBe('constant 0');
  });

  test('leaves an axis that does move alone', () => {
    // The rug's *own* axis is where its data is, and it must keep reading as
    // a span -- this is the axis carrying everything the chart shows.
    expect(statOf(traceOf(RUG), 'X range')).toBe('1.5 to 7');
  });

  test('applies to whichever axis is flat, not to rugs by name', () => {
    // Nothing here knows what a rug is. A scatter that happens to be drawn
    // along a horizontal line reads the same way, which is what makes this a
    // fact about the axis rather than a special case.
    const flatOnX: ScatterPoint[] = [
      { x: 3, y: 1 },
      { x: 3, y: 4 },
      { x: 3, y: 9 },
    ];
    const trace = traceOf(flatOnX, 'height');

    expect(statOf(trace, 'X range')).toBe('constant 3');
    expect(statOf(trace, 'Y range')).toBe('1 to 9');
  });

  test('an ordinary scatter still reads as two spans', () => {
    const ordinary: ScatterPoint[] = [
      { x: 1, y: 3 },
      { x: 2, y: 8 },
      { x: 4, y: 1 },
    ];
    const trace = traceOf(ordinary, 'y');

    expect(statOf(trace, 'X range')).toBe('1 to 4');
    expect(statOf(trace, 'Y range')).toBe('1 to 8');
  });
});
