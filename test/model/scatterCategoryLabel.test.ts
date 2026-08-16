import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import type { TraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';
import { TraceType } from '@type/grammar';

/**
 * A scatter on a category axis could not say which category a point was in
 * (#927).
 *
 * `ScatterPoint.x` is numeric and has to stay numeric: the trace sorts on it
 * (`a.x - b.x`), measures distance with it (`Math.hypot(center.x - _x, …)`),
 * and resolves the column index stereo panning uses from it. `'a' - 'b'` is
 * `NaN`, so widening the field would give an unstable sort, a broken column
 * index and a highlight that lands nowhere.
 *
 * So a producer drawing `seaborn.stripplot`, `seaborn.swarmplot` or
 * `ggplot2::geom_jitter` had two options and both lost something: emit the
 * jitter, which is a precise number for a quantity that does not exist, or
 * emit the tick position, which is honest about where the point sits and
 * silent about what it is. A reader heard "g is 0" where the chart said "a".
 *
 * `xLabel` / `yLabel` carry the name alongside the position. Both axes have
 * one because either can be the categorical one — `stripplot(x='g', y='v')`
 * puts the names on x and `stripplot(y='g', x='v')` puts them on y.
 *
 * Every mode is covered below rather than just the default one: the trace
 * announces a coordinate from five places, and a mode that kept announcing
 * the slot index would be the same defect, reachable by one keystroke.
 */
function layerOf(data: ScatterPoint[]): MaidrLayer {
  return {
    id: 'test-scatter-category',
    type: TraceType.SCATTER,
    title: 'Category axis',
    axes: { x: { label: 'g' }, y: { label: 'v' } },
    data,
  };
}

/** Narrows the trace state union to the populated case. */
function stateOf(trace: ScatterTrace): Extract<TraceState, { empty: false }> {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state;
}

/** A strip plot: three named slots on x, measurements on y. */
function stripPoints(): ScatterPoint[] {
  return [
    { x: 0, xLabel: 'a', y: 1 },
    { x: 0, xLabel: 'a', y: 2 },
    { x: 1, xLabel: 'b', y: 3 },
    { x: 2, xLabel: 'c', y: 4 },
  ];
}

/** The same chart drawn horizontally: names on y, measurements on x. */
function horizontalStripPoints(): ScatterPoint[] {
  return [
    { x: 1, y: 0, yLabel: 'a' },
    { x: 2, y: 0, yLabel: 'a' },
    { x: 3, y: 1, yLabel: 'b' },
  ];
}

describe('a scatter whose x axis carries names', () => {
  test('column navigation announces the category, not the slot', () => {
    const trace = new ScatterTrace(layerOf(stripPoints()));
    trace.col = 0;

    expect(stateOf(trace).text.main.value).toBe('a');
  });

  test('each column announces its own category', () => {
    const trace = new ScatterTrace(layerOf(stripPoints()));
    trace.col = 2;

    expect(stateOf(trace).text.main.value).toBe('c');
  });

  test('the measurement axis is untouched', () => {
    // The guard against naming everything: y carries real numbers here, and
    // announcing those as names would be the same defect mirrored.
    const trace = new ScatterTrace(layerOf(stripPoints()));
    trace.col = 0;

    expect(stateOf(trace).text.cross.value).toEqual([1, 2]);
  });

  test('point mode announces the category too', () => {
    const trace = new ScatterTrace(layerOf(stripPoints()));
    trace.moveOnce('UPWARD'); // Initial-entry handshake.
    trace.setPointMode(true);

    expect(stateOf(trace).text.main.value).toBe('a');
  });

  test('the row mode cross value names every category at that y', () => {
    // ROW mode announces the x values sharing a y, which on a strip plot are
    // categories. This is the array case: without it the reader is handed a
    // list of slot indices in the one mode built for comparing across
    // categories.
    const trace = new ScatterTrace(layerOf([
      { x: 0, xLabel: 'a', y: 5 },
      { x: 1, xLabel: 'b', y: 5 },
      { x: 2, xLabel: 'c', y: 9 },
    ]));
    trace.moveOnce('UPWARD'); // Handshake.
    trace.moveOnce('UPWARD'); // Toggle to ROW mode, at the lowest y.

    expect(stateOf(trace).text.cross.value).toEqual(['a', 'b']);
  });

  test('intersection mode names the anchor category', () => {
    const trace = new ScatterTrace(layerOf(stripPoints()));
    trace.col = 0;
    trace.setIntersectionMode(true);
    trace.moveToNextIntersection();

    expect(stateOf(trace).text.main.value).toBe('a');
  });

  test('grid-cell point mode announces the category', () => {
    // The fifth announcing site, and the one easiest to leave behind: it has
    // its own grouping pass (`enterGridCell`) rather than reusing `xPoints`,
    // so naming the other four does not name this one.
    //
    // Grid mode needs per-axis min/max/tickStep before the trace will build
    // cells at all, which is why this layer differs from the others here.
    const trace = new ScatterTrace({
      id: 'grid-category',
      type: TraceType.SCATTER,
      title: 'Category axis, gridded',
      axes: {
        x: { label: 'g', min: 0, max: 4, tickStep: 2 },
        y: { label: 'v', min: 0, max: 4, tickStep: 2 },
      },
      data: [
        { x: 0, xLabel: 'a', y: 0.5 },
        { x: 1, xLabel: 'b', y: 0.7 },
        { x: 3, xLabel: 'd', y: 3 },
      ],
    });
    trace.isInitialEntry = false;
    trace.setGridMode(true);

    expect(trace.enterGridCell()).toBe(true);
    expect(stateOf(trace).text.main.value).toBe('a');
  });

  test('the description table shows names rather than slots', () => {
    // A table still listing 0, 1, 2 after the cursor said "a" would be the
    // same defect one surface over.
    const trace = new ScatterTrace(layerOf(stripPoints()));

    expect(trace.description.dataTable?.rows).toEqual([
      ['a', 1],
      ['a', 2],
      ['b', 3],
      ['c', 4],
    ]);
  });
});

describe('a scatter whose y axis carries names', () => {
  test('row navigation announces the category', () => {
    const trace = new ScatterTrace(layerOf(horizontalStripPoints()));
    trace.moveOnce('UPWARD'); // Handshake.
    trace.moveOnce('UPWARD'); // Toggle to ROW mode, at y = 0.

    expect(stateOf(trace).text.main.value).toBe('a');
  });

  test('the column cross value names every category at that x', () => {
    const trace = new ScatterTrace(layerOf([
      { x: 7, y: 0, yLabel: 'a' },
      { x: 7, y: 1, yLabel: 'b' },
    ]));
    trace.col = 0;

    expect(stateOf(trace).text.cross.value).toEqual(['a', 'b']);
  });

  test('point mode announces it on the cross axis', () => {
    const trace = new ScatterTrace(layerOf(horizontalStripPoints()));
    trace.moveOnce('UPWARD');
    trace.setPointMode(true);

    expect(stateOf(trace).text.cross.value).toBe('a');
  });
});

describe('what must not change', () => {
  test('a continuous scatter announces its numbers', () => {
    const trace = new ScatterTrace(layerOf([
      { x: 1.5, y: 10 },
      { x: 2.5, y: 20 },
    ]));
    trace.col = 0;

    expect(stateOf(trace).text.main.value).toBe(1.5);
    expect(stateOf(trace).text.cross.value).toEqual([10]);
  });

  test('an empty label is treated as absent', () => {
    // A producer emitting '' for an unnamed slot should get the number, not a
    // blank where a value belongs.
    const trace = new ScatterTrace(layerOf([
      { x: 3, xLabel: '', y: 10 },
    ]));
    trace.col = 0;

    expect(stateOf(trace).text.main.value).toBe(3);
  });

  test('sorting and column grouping still key off the number', () => {
    // The reason `x` stays numeric. Labels arriving out of order must not
    // disturb the ascending column order the trace is built on, and two
    // points in one category must stay one column.
    const trace = new ScatterTrace(layerOf([
      { x: 2, xLabel: 'c', y: 1 },
      { x: 0, xLabel: 'a', y: 2 },
      { x: 0, xLabel: 'a', y: 3 },
    ]));

    trace.col = 0;
    expect(stateOf(trace).text.main.value).toBe('a');
    expect(stateOf(trace).text.cross.value).toEqual([2, 3]);

    trace.col = 1;
    expect(stateOf(trace).text.main.value).toBe('c');
  });

  test('a partially labelled axis keeps the unlabelled slots numeric', () => {
    // Not an idiomatic payload, but the mixed case has to resolve to
    // something honest rather than to a blank or a dropped entry.
    const trace = new ScatterTrace(layerOf([
      { x: 0, xLabel: 'a', y: 5 },
      { x: 1, y: 5 },
    ]));
    trace.moveOnce('UPWARD');
    trace.moveOnce('UPWARD');

    expect(stateOf(trace).text.cross.value).toEqual(['a', '1']);
  });
});
