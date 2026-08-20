/**
 * A rule mark carrying an interval (#1100).
 *
 * `Plot.ruleX` and `Plot.ruleY` are how Plot draws a high-low chart, a range
 * plot and a gantt. A `<line>` writes both of its ends as attributes, so the
 * reading is exact — the same gantt a `link` produces, off a cheaper shape.
 *
 * Three other things wear the same label and are refused, all by the same
 * question asked of the whole mark: a reference line, a bare positional rule,
 * and a lollipop's stems. Each gives itself away by agreeing with itself —
 * every line ending where every other one does — because that end is the frame
 * or the baseline rather than anything a row of the data said.
 */

import type { GanttData } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { describe, expect, it } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { mountFixture } from './helpers';

function layersOf(key: Parameters<typeof mountFixture>[0]): {
  type: TraceType;
  orientation?: Orientation;
  data: unknown;
}[] {
  const { element } = mountFixture(key);
  return observablePlotToMaidr(element)?.subplots[0][0].layers ?? [];
}

function spansOf(key: Parameters<typeof mountFixture>[0]): (string | number)[][][] {
  const data = layersOf(key)[0]?.data as GanttData;
  return data.points.map(row => row.map(point => [point.x, point.start, point.end]));
}

describe('a rule mark drawing intervals', () => {
  it('reads a lane of spans as a gantt', () => {
    // Mon 2–8, Tue 3–11, Wed 1–6, drawn as three horizontal lines on a point
    // scale of three lanes. `x1="98"` is 2 on [1, 11] → [40, 620], and every
    // other end comes back the same way.
    expect(layersOf('ganttRules')[0]?.type).toBe(TraceType.GANTT);
    expect(spansOf('ganttRules')).toEqual([
      [['Mon', 2, 8]],
      [['Tue', 3, 11]],
      [['Wed', 1, 6]],
    ]);
  });

  it('keeps two intervals in one lane in that lane', () => {
    // A fourth interval on Mon. Nested by lane rather than flattened, so the
    // reader moving down the chart hears one row carrying two.
    expect(spansOf('twoPerLane')).toEqual([
      [['Mon', 2, 8], ['Mon', 9, 10]],
      [['Tue', 3, 11]],
      [['Wed', 1, 6]],
    ]);
  });

  it('reads the same intervals stood up as a high-low chart', () => {
    // The lane axis is the discrete one either way, so a categorical x with a
    // measured y is the vertical reading of the same shape.
    expect(layersOf('highLowRules')[0]?.orientation).toBe(Orientation.VERTICAL);
    expect(spansOf('highLowRules')).toEqual([
      [['Mon', 2, 8]],
      [['Tue', 3, 11]],
      [['Wed', 1, 6]],
    ]);
  });
});

describe('a rule that agrees with itself', () => {
  it('is handed back when it is a reference line', () => {
    // `Plot.ruleY([5])` across a categorical dot plot. Its one line runs the x
    // range end to end because Plot handed it the frame, so read as an interval
    // it would put a span into the chart that no row of the data contains. The
    // dot plot beside it is still announced, alone.
    const layers = layersOf('referenceRule');
    expect(layers.map(layer => layer.type)).toEqual([TraceType.DOT]);
  });

  it('is handed back when it is a lollipop\'s stems', () => {
    // Every stem starts at the baseline — `y1="370"`, which is 0 on a domain
    // of [0, 11]. Read as intervals they would announce "0 to 8" where the
    // chart means "8", and the dot at each tip already carries that 8.
    const layers = layersOf('stemRules');
    expect(layers.map(layer => layer.type)).toEqual([TraceType.DOT]);
  });

  it('is handed back when it lies across the lanes rather than along one', () => {
    // `Plot.ruleY([5, 8])` — two reference lines at different heights, so
    // unlike a single one they agree on neither end. They are refused for the
    // other reason: the chart's lanes run down the categorical x, and a
    // horizontal line spanning the frame has no interval in one of them.
    const layers = layersOf('crossingRules');
    expect(layers.map(layer => layer.type)).toEqual([TraceType.DOT]);
  });

  it('is handed back when the constant end is the second one', () => {
    // The same lollipop written `y1: 'hi', y2: 0`, so the baseline lands in
    // `y2`. Which attribute Plot puts a constant in is the caller's spelling,
    // not a fact about the chart, so both ends are asked the same question.
    expect(layersOf('sharedEndRules')).toHaveLength(0);
  });

  it('is handed back when it is the frame drawn at each position', () => {
    // `Plot.ruleX(rows, {x})` beside a dot plot. Every line runs `y1="20"` to
    // `y2="370"`, the full height of the frame, so read as intervals all three
    // would announce the y domain end to end — three times over, in three
    // lanes, as though the data said so.
    const layers = layersOf('framedRules');
    expect(layers.map(layer => layer.type)).toEqual([TraceType.DOT]);
  });

  it('is handed back when there is no scale to invert it through', () => {
    // The same positional rule alone. The plot has no y scale at all, so even
    // without the question above there is nothing an interval could be read
    // in — the way a vector with no `length` channel has no scale to invert
    // its reach.
    expect(layersOf('bareRules')).toHaveLength(0);
  });
});
