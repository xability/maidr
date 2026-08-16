import type { NotificationService } from '@service/notification';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * A line sample that has a position but no reading (#925).
 *
 * `BarTrace` has had this since #112: a producer sends `null`, `toBarValue`
 * turns it into `NaN` so it stays distinguishable from a measured zero, and
 * every modality already knows what to do with a non-finite magnitude —
 * `AudioService` plays the empty tone, `TextService.formatSingleValue` returns
 * "missing", the bar braille encoder writes a blank cell.
 *
 * `LineTrace` never adopted it. It read `Number(point.y)`, and `Number(null)`
 * is `0`, so a gap arrived as a real measurement at the bottom of the range.
 * Measured before this change, on a three-point series whose middle y is null:
 *
 *     index 1: audio.freq.raw = 0, text.cross.value = null
 *
 * — a floor tone and the word "null", for data that does not exist.
 *
 * `null` rather than a non-finite number is what the *producer* sends, and
 * that part is load-bearing rather than stylistic: `NaN` and `Infinity` are
 * legal JavaScript literals but not JSON, and `JSON.parse` — which the core
 * runs on the SVG's `maidr` attribute — rejects them outright, so a producer
 * emitting one stops the chart initialising at all (xability/py-maidr#427).
 */

function lineLayer(rows: LinePoint[][]): MaidrLayer {
  return {
    id: 'l',
    type: TraceType.LINE,
    title: 'Series',
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data: rows,
  } as MaidrLayer;
}

/** A series whose middle sample was never measured. */
function withGap(): LineTrace {
  return new LineTrace(lineLayer([[
    { x: 'a', y: 1 },
    { x: 'b', y: null },
    { x: 'c', y: 3 },
  ]]));
}

function announce(state: TraceState): string {
  const text = new TextService({ notify: jest.fn() } as unknown as NotificationService);
  const listener = jest.fn();
  const disposable = text.onChange(listener);

  text.update(state);
  disposable.dispose();
  return (listener.mock.calls[0][0] as { value: string }).value;
}

function stateAt(trace: LineTrace, col: number): TraceState {
  return trace.getStateAt(0, col);
}

describe('a line sample with no reading', () => {
  test('is announced as missing rather than as a number', () => {
    expect(announce(stateAt(withGap(), 1))).toBe('X is b, Y is missing');
  });

  test('still says where it is', () => {
    // The whole reason the point is kept rather than dropped. An announcement
    // that named only the absence would be the out-of-bounds message, which is
    // what makes reusing `outOfBoundsState` for this wrong.
    expect(announce(stateAt(withGap(), 1))).toContain('X is b');
  });

  test('carries no magnitude for the audio service to pitch', () => {
    // `AudioService` already branches on a non-finite `raw` and plays the
    // empty tone there, so the model's job is only to stop turning the gap
    // into a number. Asserted on the state rather than the service to keep
    // this a model test.
    const audio = (stateAt(withGap(), 1) as { audio: { freq: { raw: number } } }).audio;

    expect(Number.isFinite(audio.freq.raw)).toBe(false);
  });

  test('is not confusable with a sample measured at zero', () => {
    // The defect exactly: `Number(null)` is `0`. A chart that really does read
    // zero in the middle has to sound and read differently from one that has
    // no reading there at all.
    const zero = new LineTrace(lineLayer([[
      { x: 'a', y: 1 },
      { x: 'b', y: 0 },
      { x: 'c', y: 3 },
    ]]));

    expect(announce(stateAt(zero, 1))).toBe('X is b, Y is 0');
    expect(announce(stateAt(withGap(), 1))).toBe('X is b, Y is missing');
  });
});

describe('what the gap must not drag down with it', () => {
  test('the measured samples either side are unaffected', () => {
    const trace = withGap();

    expect(announce(stateAt(trace, 0))).toBe('X is a, Y is 1');
    expect(announce(stateAt(trace, 2))).toBe('X is c, Y is 3');
  });

  test('the row keeps a usable range', () => {
    // `Math.min` of anything containing NaN is NaN. Without filtering the gap
    // out of the range, every point in the row would be scaled against a
    // non-finite min and max — one gap silencing the whole series rather than
    // itself.
    const audio = (stateAt(withGap(), 0) as {
      audio: { freq: { min: number; max: number } };
    }).audio;

    expect(audio.freq.min).toBe(1);
    expect(audio.freq.max).toBe(3);
  });

  test('a series with no gaps is unchanged', () => {
    const plain = new LineTrace(lineLayer([[
      { x: 'a', y: 1 },
      { x: 'b', y: 2 },
    ]]));

    expect(announce(stateAt(plain, 0))).toBe('X is a, Y is 1');
    expect(announce(stateAt(plain, 1))).toBe('X is b, Y is 2');
  });

  test('a row of nothing but gaps does not claim a range', () => {
    const allGaps = new LineTrace(lineLayer([[
      { x: 'a', y: null },
      { x: 'b', y: null },
    ]]));

    expect(announce(stateAt(allGaps, 0))).toBe('X is a, Y is missing');
  });
});

describe('navigating between series across a gap', () => {
  test('a gap is not a candidate for the nearest line below', () => {
    // `null` coerces to `0` in a relational comparison, so an unguarded gap
    // does not merely sort oddly — it presents itself as a line sitting at
    // zero. Whether that looks like a candidate depends on which side of zero
    // the cursor is, which is why both directions are covered and why the
    // fixtures straddle it.
    //
    // The distances matter as much as the directions. `Math.abs(0 - 9)` is 9
    // and the real line below is 14 away, so without the guard the gap wins
    // on distance and the cursor lands on a sample with nothing to announce.
    // An earlier version of this test used a cursor at y = 2, where
    // `null > 2` is false and UPWARD skipped the gap by accident: it passed
    // with the guard removed.
    const trace = new LineTrace(lineLayer([
      [{ x: 'a', y: 9 }, { x: 'b', y: 9 }],
      [{ x: 'a', y: 5 }, { x: 'b', y: null }],
      [{ x: 'a', y: -5 }, { x: 'b', y: -5 }],
    ]));
    trace.moveToIndex(0, 1);

    trace.moveOnce('DOWNWARD');

    expect(announce(trace.state)).toBe('X is b, Y is -5');
  });

  test('and not for the nearest line above either', () => {
    // The mirror image, with the cursor below zero so the phantom line at
    // zero is genuinely "above" it.
    const trace = new LineTrace(lineLayer([
      [{ x: 'a', y: -5 }, { x: 'b', y: -5 }],
      [{ x: 'a', y: 5 }, { x: 'b', y: null }],
      [{ x: 'a', y: 9 }, { x: 'b', y: 9 }],
    ]));
    trace.moveToIndex(0, 1);

    trace.moveOnce('UPWARD');

    expect(announce(trace.state)).toBe('X is b, Y is 9');
  });
});
