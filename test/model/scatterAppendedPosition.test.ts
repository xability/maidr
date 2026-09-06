/**
 * @jest-environment jsdom
 */

import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * A scatter can say where it keeps one of the points it was given.
 *
 * Live data streams a point in and reports it by its index in the layer's
 * `data` array, which for most traces is also the column it lands on. A
 * scatter is not one of those: the constructor sorts by x and groups the
 * duplicates, so a column is a unique x and the raw index addresses some
 * other point — or a column the chart does not have, once duplicates have
 * collapsed several into one.
 *
 * These pin the translation the monitor announcement of a streamed point
 * goes through.
 */

/**
 * A scatter with no axis ranges, so grid mode is unavailable and the trace
 * navigates its columns — the configuration a streaming chart arrives in.
 * @param data - The points the layer carries
 * @returns The layer
 */
function createLayer(data: ScatterPoint[]): MaidrLayer {
  return {
    id: 'points',
    type: TraceType.SCATTER,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  };
}

/** Two points at one x, and one either side of it, in no particular order. */
const unsorted: ScatterPoint[] = [
  { x: 5, y: 1 },
  { x: 1, y: 2 },
  { x: 5, y: 3 },
  { x: 3, y: 9 },
];

describe('the position a scatter keeps a data point at', () => {
  test('is the column its x sorts into, not the order it arrived in', () => {
    const trace = new ScatterTrace(createLayer(unsorted));

    // Unique x values are 1, 3, 5 — so the last point to arrive is the
    // middle column, and reading it at index 3 would fall off the axis.
    expect(trace.positionOfDataIndex(3)).toEqual({ row: 0, col: 1 });
    expect(trace.positionOfDataIndex(1)).toEqual({ row: 0, col: 0 });
  });

  test('is the point\'s place within its column when points share an x', () => {
    const trace = new ScatterTrace(createLayer(unsorted));

    // The two points at x = 5 stack in ascending y: y = 1 then y = 3.
    expect(trace.positionOfDataIndex(0)).toEqual({ row: 0, col: 2 });
    expect(trace.positionOfDataIndex(2)).toEqual({ row: 1, col: 2 });
  });

  test('is a row on the y axis once the reader has switched to row navigation', () => {
    const trace = new ScatterTrace(createLayer(unsorted));
    trace.isInitialEntry = false;

    trace.moveOnce('UPWARD'); // COL -> ROW

    // Unique y values are 1, 2, 3, 9; the appended point's y = 9 is the last.
    expect(trace.positionOfDataIndex(3)).toEqual({ row: 3, col: 1 });
  });

  test('is nothing for an index the layer does not have', () => {
    const trace = new ScatterTrace(createLayer(unsorted));

    expect(trace.positionOfDataIndex(4)).toBeNull();
    expect(trace.positionOfDataIndex(-1)).toBeNull();
  });
});
