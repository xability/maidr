import type { BarPoint, MaidrLayer, SegmentedPoint } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

/**
 * A bar trace must not write to the data it was handed.
 *
 * `AbstractBarPlot` held `MaidrLayer.data` by reference, and two things write
 * to it: `SegmentedTrace` appends its summary row, and `dispose()` truncates
 * the array to zero. Both reached back into the caller's spec.
 *
 * That is not a theoretical sharing problem. A `Maidr` spec is built once and
 * used repeatedly by design -- React re-renders with the same `data` prop,
 * `window.maidrLive.setData()` pushes a new figure over the old one, and a
 * multi-panel figure can hand one spec object to more than one subplot. Every
 * one of those routes builds a second trace over an array the first has
 * already grown, so the chart gains a phantom series whose values compound:
 * `[[3,5],[2,4]]` read three times became
 * `[[3,5],[2,4],[5,9],[10,18],[20,36]]`.
 *
 * Nothing announced the extra series as fabricated. It navigated, sonified and
 * announced exactly as a real one would.
 */

/** Two series over two categories, rebuilt from scratch for each test. */
let stackedData: SegmentedPoint[][];
let barData: BarPoint[];

beforeEach(() => {
  stackedData = [
    [{ x: 'a', y: 3, z: 'A' }, { x: 'b', y: 5, z: 'A' }],
    [{ x: 'a', y: 2, z: 'B' }, { x: 'b', y: 4, z: 'B' }],
  ];
  barData = [{ x: 'a', y: 3 }, { x: 'b', y: 5 }];
});

/**
 * A layer over the shared stacked data.
 * @param type Which of the segmented types to declare
 * @returns The layer definition
 */
function stackedLayer(type: TraceType = TraceType.STACKED): MaidrLayer {
  return {
    id: 'layer',
    type,
    title: 'Sales',
    orientation: Orientation.VERTICAL,
    axes: { x: { label: 'X' }, y: { label: 'Y' }, z: { label: 'Series' } },
    data: stackedData,
  };
}

/**
 * The value grid a trace is navigating, read through its braille state.
 *
 * Braille carries the whole grid, so it reports a fabricated row without the
 * test reaching into a private field.
 * @param trace The trace to read
 * @param trace.state Its current state
 * @returns One row of values per series
 */
function grid(trace: { state: unknown }): number[][] {
  const state = trace.state as { empty: boolean; braille: { empty: boolean; values: unknown } };
  if (state.empty || state.braille.empty) {
    throw new Error('Expected a populated braille state');
  }
  return state.braille.values as number[][];
}

describe('a bar trace does not write to the spec it was given', () => {
  test('building a stacked bar twice does not grow the data', () => {
    TraceFactory.create(stackedLayer());
    TraceFactory.create(stackedLayer());

    expect(stackedData).toHaveLength(2);
  });

  test('the second figure reads the same chart as the first', () => {
    // The failure this prevents: the second trace navigates a series the
    // chart does not contain, sonified and announced like any other.
    const first = grid(TraceFactory.create(stackedLayer()));
    const second = grid(TraceFactory.create(stackedLayer()));

    expect(second).toEqual(first);
    // Two authored series plus the summary row the trace appends.
    expect(second).toHaveLength(3);
  });

  test('a third build does not compound the sums', () => {
    // The appended totals were themselves summed on the next build, so the
    // phantom values grew geometrically rather than merely repeating.
    TraceFactory.create(stackedLayer());
    TraceFactory.create(stackedLayer());
    const third = grid(TraceFactory.create(stackedLayer()));

    expect(third).toEqual([[3, 5], [2, 4], [5, 9]]);
  });

  test('the normalized variant is affected the same way, and fixed the same way', () => {
    TraceFactory.create(stackedLayer(TraceType.NORMALIZED));
    TraceFactory.create(stackedLayer(TraceType.NORMALIZED));

    expect(stackedData).toHaveLength(2);
  });

  test('disposing a trace does not empty the caller data', () => {
    // `dispose()` truncates the array it holds, which is the other half of
    // the same reference. A figure torn down on a route change took the
    // spec's data with it, so re-mounting rendered an empty chart.
    const trace = TraceFactory.create(stackedLayer());

    trace.dispose();

    expect(stackedData).toHaveLength(2);
    expect(stackedData[0]).toHaveLength(2);
  });

  test('a plain bar layer survives disposal too', () => {
    const trace = TraceFactory.create({
      id: 'layer',
      type: TraceType.BAR,
      title: 'Sales',
      axes: { x: { label: 'X' }, y: { label: 'Y' } },
      data: barData,
    });

    trace.dispose();

    expect(barData).toHaveLength(2);
  });
});
