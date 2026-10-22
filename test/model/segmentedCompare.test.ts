import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { TraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { DivergingTrace } from '@model/diverging';
import { SegmentedTrace } from '@model/segmented';
import { TraceType } from '@type/grammar';

/**
 * The rotor's lower and higher value modes on stacked, dodged and normalized
 * bars.
 *
 * Those layers were offered both modes and searched nothing: the search lived
 * on the plain bar and the histogram, so a reader on a 70 with a 31 beside it
 * heard "No lower value found to the right of the current value".
 */

const CATEGORIES = ['Adelie', 'Chinstrap', 'Gentoo'];

/** Two series over three categories, in the shape every producer emits. */
function layer(type: TraceType, rows: number[][]): MaidrLayer {
  const data: SegmentedPoint[][] = rows.map((row, series) =>
    row.map((y, col) => ({ x: CATEGORIES[col], y, z: `series ${series}` })),
  );
  return {
    id: `${type}-layer`,
    type,
    axes: { x: { label: 'Species' }, y: { label: 'Count' } },
    data,
  };
}

function valueOf(trace: { state: TraceState }): unknown {
  const state = trace.state;
  if (state.empty || state.type !== 'trace') {
    throw new Error('expected a populated trace state');
  }
  return state.text.cross?.value ?? state.text.main.value;
}

describe.each([TraceType.DODGED, TraceType.STACKED, TraceType.NORMALIZED])(
  '%s bars',
  (type) => {
    const rows = [[70, 31, 58], [10, 20, 5]];

    test('offer the lower and higher value modes', () => {
      expect(new SegmentedTrace(layer(type, rows)).supportsCompareMode()).toBe(true);
    });

    test('lower to the right finds the next lower bar in the series', () => {
      const trace = new SegmentedTrace(layer(type, rows));
      trace.moveToIndex(0, 0);

      expect(trace.moveToNextCompareValue('right', 'lower')).toBe(true);
      expect(trace.row).toBe(0);
      expect(trace.col).toBe(1);
    });

    test('higher to the right skips a lower bar to reach a higher one', () => {
      const trace = new SegmentedTrace(layer(type, rows));
      trace.moveToIndex(1, 0);

      expect(trace.moveToNextCompareValue('right', 'higher')).toBe(true);
      expect(trace.col).toBe(1);
    });

    test('nothing lower further on is a boundary, and the cursor stays', () => {
      const trace = new SegmentedTrace(layer(type, rows));
      trace.moveToIndex(0, 1);
      const seen: TraceState[] = [];
      trace.addObserver({ update: state => seen.push(state as TraceState) });

      expect(trace.moveToNextCompareValue('right', 'lower')).toBe(false);
      expect(trace.col).toBe(1);
      expect(seen.at(-1)).toMatchObject({ empty: true, warning: true });
    });
  },
);

test('a dodged bar reads the value it moved to', () => {
  const trace = new SegmentedTrace(layer(TraceType.DODGED, [[70, 31, 58], [10, 20, 5]]));
  trace.moveToIndex(0, 0);
  trace.moveToNextCompareValue('right', 'lower');

  expect(valueOf(trace)).toBe(31);
});

test('a diverging layer searches its rows too', () => {
  const trace = new DivergingTrace(layer(TraceType.DIVERGING, [[-3, 4, -1], [2, -5, 6]]));
  trace.moveToIndex(0, 0);

  expect(trace.supportsCompareMode()).toBe(true);
  expect(trace.moveToNextCompareValue('right', 'higher')).toBe(true);
  expect(trace.col).toBe(1);
});
