import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Heatmap } from '@model/heatmap';
import { TraceType } from '@type/grammar';

/**
 * A layer switch carries the reader's X across traces: the outgoing trace
 * reports `getCurrentXValue()` and the incoming one answers `moveToXValue()`.
 * A heatmap has no `points`, so the base class fell back to scanning its
 * `values` grid -- and a grid of magnitudes has no X in it. The magnitude of
 * the focused cell went out as the reader's X, and an incoming X was matched
 * against magnitudes across the whole grid, landing on whichever cell happened
 * to hold that number.
 */

function layerOf(points: number[][]): MaidrLayer {
  return {
    id: 'hm',
    type: TraceType.HEATMAP,
    title: 'test',
    axes: { x: { label: 'Day' }, y: { label: 'Half' }, z: { label: 'Count' } },
    data: {
      x: ['a', 'b', 'c'],
      // Top row first, which `Heatmap` turns over on construction.
      y: ['PM', 'AM'],
      points,
    } satisfies HeatmapData,
  };
}

describe('Heatmap layer switching', () => {
  test('reports the column label as its current X, not the cell magnitude', () => {
    const heatmap = new Heatmap(layerOf([[10, 11, 12], [20, 21, 22]]));
    heatmap.moveToIndex(0, 2);

    const xValue = heatmap.getCurrentXValue();

    expect(xValue).toBe('c');
  });

  test('moves to the column with that X label, staying on the current row', () => {
    const heatmap = new Heatmap(layerOf([[10, 11, 12], [20, 21, 22]]));
    heatmap.moveToIndex(0, 2);

    const moved = heatmap.moveToXValue('b');

    expect(moved).toBe(true);
    const state = heatmap.state;
    expect(state.empty).toBe(false);
    if (!state.empty) {
      expect(state.braille.empty).toBe(false);
      if (!state.braille.empty) {
        expect([state.braille.row, state.braille.col]).toEqual([0, 1]);
      }
    }
  });

  test('does not treat an incoming number as a cell magnitude to search for', () => {
    // 11 is the magnitude of the cell at the bottom row's second column; a
    // numeric X is a column position, and no column here is labelled 11.
    const heatmap = new Heatmap(layerOf([[10, 11, 12], [20, 21, 22]]));
    heatmap.moveToIndex(0, 2);

    const moved = heatmap.moveToXValue(11);

    expect(moved).toBe(false);
    const state = heatmap.state;
    if (!state.empty && !state.braille.empty) {
      expect([state.braille.row, state.braille.col]).toEqual([0, 2]);
    }
  });

  test('finds a numeric column label when the grid is labelled with numbers', () => {
    const heatmap = new Heatmap({
      ...layerOf([[10, 11, 12], [20, 21, 22]]),
      data: { x: ['1', '2', '3'], y: ['PM', 'AM'], points: [[10, 11, 12], [20, 21, 22]] },
    });
    heatmap.moveToIndex(1, 0);

    const moved = heatmap.moveToXValue(3);

    expect(moved).toBe(true);
    const state = heatmap.state;
    if (!state.empty && !state.braille.empty) {
      expect([state.braille.row, state.braille.col]).toEqual([1, 2]);
    }
  });
});
