import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { TextState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * Two lines that meet at their first point, neither of them named.
 */
function layer(data: LinePoint[][]): MaidrLayer {
  return {
    id: 'lines',
    type: TraceType.LINE,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data,
  };
}

function textOf(trace: LineTrace): TextState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state.text;
}

describe('an intersection of unnamed lines', () => {
  test('names the lines the way every other announcement does', () => {
    const trace = new LineTrace(layer([
      [{ x: 1, y: 1 }, { x: 2, y: 2 }],
      [{ x: 1, y: 1 }, { x: 2, y: 3 }],
    ]));
    trace.moveToIndex(0, 0);

    const { z } = textOf(trace);

    // The position announcement, the description table and the intersection
    // label all say "Line 1"; the summary must not switch to an abbreviation
    // the reader has never been given.
    expect(z?.value).toBe('Line 1, intersection at (Line 1, Line 2)');
  });

  test('keeps an authored name when the series has one', () => {
    const trace = new LineTrace(layer([
      [{ x: 1, y: 1, z: 'Control' }, { x: 2, y: 2, z: 'Control' }],
      [{ x: 1, y: 1, z: 'Treated' }, { x: 2, y: 3, z: 'Treated' }],
    ]));
    trace.moveToIndex(0, 0);

    const { z } = textOf(trace);

    expect(z?.value).toBe('Control, intersection at (Control, Treated)');
  });
});

describe('an intersection names the line the cursor is on', () => {
  /**
   * Three trees that all measure 30 at 118 days, and part after it, as
   * lattice draws the Orange trees.
   */
  const TREES: LinePoint[][] = [
    [{ x: 118, y: 30, z: '3' }, { x: 484, y: 51, z: '3' }],
    [{ x: 118, y: 30, z: '1' }, { x: 484, y: 58, z: '1' }],
    [{ x: 118, y: 30, z: '5' }, { x: 484, y: 49, z: '5' }],
  ];

  test('after up and down inside the tie, the line moved to comes first', () => {
    const trace = new LineTrace(layer(TREES));
    trace.moveToIndex(0, 0);

    trace.moveOnce('UPWARD');
    expect(textOf(trace).z?.value).toBe('1, intersection at (1, 3, 5)');

    trace.moveOnce('UPWARD');
    expect(textOf(trace).z?.value).toBe('5, intersection at (5, 3, 1)');

    trace.moveOnce('DOWNWARD');
    expect(textOf(trace).z?.value).toBe('1, intersection at (1, 3, 5)');
  });

  test('along the line onto the point, the line followed comes first', () => {
    const trace = new LineTrace(layer(TREES));
    trace.moveToIndex(2, 1);

    trace.moveOnce('BACKWARD');

    expect(textOf(trace).z?.value).toBe('5, intersection at (5, 3, 1)');
  });

  test('a point one line has to itself names that line alone', () => {
    const trace = new LineTrace(layer(TREES));
    trace.moveToIndex(1, 1);

    expect(textOf(trace).z?.value).toBe('1');
  });

  test('two radar series with one value on a spoke are told apart', () => {
    // Mazda RX4 and RX4 Wag share every value of these two spokes.
    const trace = TraceFactory.create({
      ...layer([
        [{ x: 'mpg', y: 21, z: 'Mazda RX4' }, { x: 'cyl', y: 6, z: 'Mazda RX4' }],
        [{ x: 'mpg', y: 21, z: 'Mazda RX4 Wag' }, { x: 'cyl', y: 6, z: 'Mazda RX4 Wag' }],
      ]),
      type: TraceType.RADAR,
    }) as LineTrace;
    trace.moveToIndex(0, 0);
    expect(textOf(trace).z?.value).toBe('Mazda RX4, intersection at (Mazda RX4, Mazda RX4 Wag)');

    trace.moveOnce('UPWARD');

    expect(textOf(trace).z?.value).toBe('Mazda RX4 Wag, intersection at (Mazda RX4 Wag, Mazda RX4)');
  });

  test('two observations with one value on a parallel axis are told apart', () => {
    // Mazda RX4 and Hornet 4 Drive both have 110 horsepower.
    const trace = TraceFactory.create({
      ...layer([
        [{ x: 'mpg', y: 21, z: 'Mazda RX4' }, { x: 'hp', y: 110, z: 'Mazda RX4' }],
        [{ x: 'mpg', y: 21.4, z: 'Hornet 4 Drive' }, { x: 'hp', y: 110, z: 'Hornet 4 Drive' }],
      ]),
      type: TraceType.PARALLEL,
    }) as LineTrace;
    trace.moveToIndex(1, 1);

    expect(textOf(trace).z?.value).toBe('Hornet 4 Drive, intersection at (Hornet 4 Drive, Mazda RX4)');
  });

  test('two survival arms at the origin they share are told apart', () => {
    const trace = TraceFactory.create({
      ...layer([
        [{ x: 0, y: 1, z: 'Treated' }, { x: 6, y: 0.8, z: 'Treated' }],
        [{ x: 0, y: 1, z: 'Control' }, { x: 6, y: 0.6, z: 'Control' }],
      ]),
      type: TraceType.SURVIVAL,
    }) as LineTrace;
    trace.moveToIndex(0, 0);

    trace.moveOnce('UPWARD');

    expect(textOf(trace).z?.value).toBe('Control, intersection at (Control, Treated)');
  });
});

describe('the intersection targets in the go-to-extrema dialog', () => {
  /**
   * The names the dialog lists beside each intersection target.
   * @param trace The trace, positioned on the line to read from
   * @returns One entry per intersection target
   */
  function otherLines(trace: LineTrace): (string | undefined)[] {
    return trace.getExtremaTargets()
      .filter(target => target.type === 'intersection')
      .map(target => target.display?.otherLines);
  }

  test('name an unnamed series with the noun the layer uses for it', () => {
    const trace = TraceFactory.create({
      ...layer([
        [{ x: 1, y: 1 }, { x: 2, y: 2 }],
        [{ x: 1, y: 1 }, { x: 2, y: 3 }],
      ]),
      type: TraceType.SMOOTH,
    }) as LineTrace;
    trace.moveToIndex(0, 0);

    // Navigation and the description call these "Curve 1" and "Curve 2".
    expect(otherLines(trace)).toEqual(['Curve 2']);
  });

  test('keep an authored name when the series has one', () => {
    const trace = new LineTrace(layer([
      [{ x: 1, y: 1, z: 'Control' }, { x: 2, y: 2, z: 'Control' }],
      [{ x: 1, y: 1, z: 'Treated' }, { x: 2, y: 3, z: 'Treated' }],
    ]));
    trace.moveToIndex(0, 0);

    expect(otherLines(trace)).toEqual(['Treated']);
  });
});
