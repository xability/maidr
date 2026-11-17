import type { AbstractTrace } from '@model/abstract';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

/**
 * An area drawn on its side follows the drawing with the arrow keys (#1711).
 *
 * matplotlib's `fill_betweenx` and Bokeh's `harea` and `harea_stack` draw the
 * positions up the page and the values across it. py-maidr keeps the
 * positions in `x` and the values in `y`, as for any area, and says
 * `orientation: 'horz'`. The keys ran against the drawing: Left and Right
 * moved up and down the page along the band, and Up and Down left and right
 * between the bands.
 */

/** Two bands, as the first band nearest the axis and the second beyond it. */
const BANDS: LinePoint[][] = [
  [{ x: 0, y: 10 }, { x: 10, y: 12 }, { x: 20, y: 9 }, { x: 30, y: 7 }],
  [{ x: 0, y: 3 }, { x: 10, y: 4 }, { x: 20, y: 5 }, { x: 30, y: 2 }],
];

/** A third band, for a stack whose middle band Control would pass over. */
const THIRD: LinePoint[] = [{ x: 0, y: 1 }, { x: 10, y: 2 }, { x: 20, y: 2 }, { x: 30, y: 1 }];

/**
 * An area layer with no selectors, so there is nothing drawn to measure.
 *
 * @param options - How it is drawn
 * @param options.type - Which area type
 * @param options.orientation - Which way it is drawn, or undeclared
 * @param options.firstCategory - Which end its first position is drawn at
 * @param options.data - Its bands
 * @returns The trace
 */
function area({
  type = TraceType.STACKED_AREA,
  orientation,
  firstCategory,
  data = BANDS,
}: {
  type?: TraceType;
  orientation?: Orientation;
  firstCategory?: 'top' | 'bottom';
  data?: LinePoint[][];
} = {}): AbstractTrace {
  const layer: MaidrLayer = {
    id: 'bands',
    type,
    ...(orientation ? { orientation } : {}),
    ...(firstCategory ? { firstCategory } : {}),
    axes: { x: { label: 'Depth (m)' }, y: { label: 'Temperature' } },
    data,
  };
  const trace = TraceFactory.create(layer) as AbstractTrace;
  // The first key enters the chart, on the first band's first position.
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * Where the reader is told the cursor is: the position, then the value.
 *
 * @param trace - The trace
 * @returns The two
 */
function at(trace: AbstractTrace): unknown[] {
  const state = trace.state;
  if (state.empty || state.type !== 'trace') {
    throw new Error('expected a populated trace state');
  }
  return [state.text.main.value, state.text.cross?.value];
}

describe('an area drawn on its side', () => {
  test('moves along the band with Up and Down, the first position drawn at the bottom', () => {
    const trace = area({ orientation: Orientation.HORIZONTAL });
    expect(at(trace)).toEqual([0, 10]);

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(at(trace)).toEqual([10, 12]);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(at(trace)).toEqual([20, 9]);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(at(trace)).toEqual([10, 12]);
  });

  test('moves between the bands with Left and Right', () => {
    const trace = area({ orientation: Orientation.HORIZONTAL });
    trace.moveOnce('UPWARD');

    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(at(trace)).toEqual([10, 4]);
    expect(trace.moveOnce('BACKWARD')).toBe(true);
    expect(at(trace)).toEqual([10, 12]);
  });

  test('says Up at the last position is the edge, and isMovable agrees', () => {
    const trace = area({ orientation: Orientation.HORIZONTAL });
    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');
    expect(at(trace)).toEqual([30, 7]);

    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(false);
    expect(trace.isMovable('DOWNWARD')).toBe(true);
    expect(trace.isMovable('BACKWARD')).toBe(false);
    expect(at(trace)).toEqual([30, 7]);
  });

  test('moves Up toward the first position where the layer says it is drawn at the top', () => {
    const trace = area({ orientation: Orientation.HORIZONTAL, firstCategory: 'top' });

    expect(trace.moveOnce('UPWARD')).toBe(false);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(at(trace)).toEqual([10, 12]);
  });

  test('goes to the first and the last band with Control + Left and Right, over the middle one', () => {
    const trace = area({ orientation: Orientation.HORIZONTAL, data: [...BANDS, THIRD] });
    trace.moveOnce('UPWARD');

    expect(trace.moveToExtreme('FORWARD')).toBe(true);
    expect(at(trace)).toEqual([10, 2]);
    expect(trace.moveToExtreme('BACKWARD')).toBe(true);
    expect(at(trace)).toEqual([10, 12]);
  });

  test('goes to the ends of the band with Control + Up and Down', () => {
    const trace = area({ orientation: Orientation.HORIZONTAL });

    expect(trace.moveToExtreme('UPWARD')).toBe(true);
    expect(at(trace)).toEqual([30, 7]);
    expect(trace.moveToExtreme('DOWNWARD')).toBe(true);
    expect(at(trace)).toEqual([0, 10]);
  });

  test('moves an unstacked area\'s bands by Left and Right too, as they are drawn at their values', () => {
    const trace = area({ type: TraceType.AREA, orientation: Orientation.HORIZONTAL });

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(at(trace)).toEqual([10, 12]);
    expect(trace.moveOnce('BACKWARD')).toBe(true);
    expect(at(trace)).toEqual([10, 4]);
    expect(trace.moveToExtreme('FORWARD')).toBe(true);
    expect(at(trace)).toEqual([10, 12]);
  });

  test('searches along the band for a higher value with the rotor\'s Up', () => {
    // From 10, the next higher value up the band is 12 at 10 m.
    const trace = area({ orientation: Orientation.HORIZONTAL });

    expect(trace.moveUpRotor('higher')).toBe(true);
    expect(at(trace)).toEqual([10, 12]);
  });

  test('is still not announced as horizontal', () => {
    // Only the keys turn: the readings, the axes and the payload are an
    // area's whichever way it is drawn.
    expect(area({ orientation: Orientation.HORIZONTAL }).orientationLabel).toBeUndefined();
  });
});

describe('an area drawn upright', () => {
  test('keeps its keys: Right along the band, Up to the band above', () => {
    const trace = area();

    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(at(trace)).toEqual([10, 12]);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(at(trace)).toEqual([10, 4]);
  });
});
