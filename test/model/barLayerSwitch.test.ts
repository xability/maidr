import type { BarPoint, ErrorBarPoint, HistogramPoint, LinePoint, Maidr, MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { TextState, TraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Switching layers from or to a horizontal bar-family layer carries the
 * category the reader is on, as it does for a vertical one.
 *
 * "The reader's X" across layers is the position along the category axis: a
 * box plot carries its group, and an error bar or a dumbbell keeps the
 * category in `x` in either orientation. A bar keeps it in `x` only when it is
 * vertical. A horizontal bar holds its magnitude in `x` and its category in
 * `y`, so the generic fallback carried the magnitude. A switch from the dots
 * of a horizontal dot plot to the line through them then searched the line's
 * levels for a number, found none, and put the reader on the first level.
 */

const LEVELS = ['a', 'b', 'c', 'd', 'e'];
const VALUES = [50, 10, 40, 20, 30];

function layer(
  id: string,
  type: TraceType,
  data: MaidrLayer['data'],
  orientation?: Orientation,
): MaidrLayer {
  return {
    id,
    type,
    ...(orientation ? { orientation } : {}),
    axes: orientation === Orientation.HORIZONTAL
      ? { x: { label: 'value' }, y: { label: 'level' } }
      : { x: { label: 'level' }, y: { label: 'value' } },
    data,
  };
}

function figureOf(...layers: MaidrLayer[]): Figure {
  const maidr: Maidr = { id: 'bars', subplots: [[{ layers }]] };
  return new Figure(maidr);
}

function textOf(state: TraceState): TextState {
  if (state.empty) {
    throw new Error('expected a non-empty trace state');
  }
  return state.text;
}

/** The line through the levels, as a vertical line reads it: x is the level. */
function lineThroughLevels(): MaidrLayer {
  const points: LinePoint[] = LEVELS.map((x, i) => ({ x, y: VALUES[i] }));
  return layer('line', TraceType.LINE, [points]);
}

function horizontalDots(type: TraceType = TraceType.DOT): MaidrLayer {
  const points: BarPoint[] = LEVELS.map((y, i) => ({ x: VALUES[i], y }));
  return layer('dots', type, points, Orientation.HORIZONTAL);
}

describe('switching layers from a horizontal bar-family layer', () => {
  test.each([TraceType.DOT, TraceType.BAR, TraceType.LOLLIPOP])(
    'keeps the level between the marks and the line through them (%s)',
    (type) => {
      const figure = figureOf(horizontalDots(type), lineThroughLevels());
      const subplot = figure.activeSubplot;
      const marks = subplot.traces[0][0];
      marks.moveToIndex(0, 1);
      expect(textOf(marks.state)).toMatchObject({ main: { value: 'b' }, cross: { value: 10 } });

      const line = subplot.switchLayer('UPWARD');

      expect(line).toBe(subplot.traces[1][0]);
      expect(textOf(line!.state)).toMatchObject({ main: { value: 'b' }, cross: { value: 10 } });

      line!.moveToIndex(0, 3);
      const back = subplot.switchLayer('DOWNWARD');

      expect(back).toBe(marks);
      expect(textOf(back!.state)).toMatchObject({ main: { value: 'd' }, cross: { value: 20 } });
    },
  );

  test('reports the category, not the magnitude, as the X', () => {
    const figure = figureOf(horizontalDots());
    const trace = figure.activeSubplot.traces[0][0];

    trace.moveToIndex(0, 2);

    expect(trace.getCurrentXValue()).toBe('c');
    expect(trace.moveToXValue('e')).toBe(true);
    expect(textOf(trace.state)).toMatchObject({ main: { value: 'e' }, cross: { value: 30 } });
  });

  test('keeps the category between a horizontal bar and its error bars', () => {
    const bars: BarPoint[] = [{ x: 2, y: 'a' }, { x: 4, y: 'b' }, { x: 3, y: 'c' }];
    const intervals: ErrorBarPoint[] = [
      { x: 'a', y: 2, yMin: 1.5, yMax: 2.9 },
      { x: 'b', y: 4, yMin: 3.2, yMax: 5.5 },
      { x: 'c', y: 3, yMin: 2.7, yMax: 3.2 },
    ];
    const figure = figureOf(
      layer('bars', TraceType.BAR, bars, Orientation.HORIZONTAL),
      layer('intervals', TraceType.ERROR_BAR, intervals, Orientation.HORIZONTAL),
    );
    const subplot = figure.activeSubplot;
    subplot.traces[0][0].moveToIndex(0, 1);

    const errorBars = subplot.switchLayer('UPWARD');

    expect(errorBars!.getCurrentXValue()).toBe('b');

    errorBars!.moveToXValue('c');
    const back = subplot.switchLayer('DOWNWARD');

    expect(textOf(back!.state)).toMatchObject({ main: { value: 'c' }, cross: { value: 3 } });
  });

  test('keeps the category, and the series, of a horizontal stacked bar', () => {
    const stacked: SegmentedPoint[][] = [
      [{ x: 1, y: 'a', z: 's1' }, { x: 2, y: 'b', z: 's1' }, { x: 3, y: 'c', z: 's1' }],
      [{ x: 4, y: 'a', z: 's2' }, { x: 5, y: 'b', z: 's2' }, { x: 6, y: 'c', z: 's2' }],
    ];
    const figure = figureOf(
      layer('stacked', TraceType.STACKED, stacked, Orientation.HORIZONTAL),
      layer('line', TraceType.LINE, [[{ x: 'a', y: 5 }, { x: 'b', y: 7 }, { x: 'c', y: 9 }]]),
    );
    const subplot = figure.activeSubplot;
    const bars = subplot.traces[0][0];
    bars.moveToIndex(1, 1);
    expect(bars.getCurrentXValue()).toBe('b');

    const line = subplot.switchLayer('UPWARD');
    expect(textOf(line!.state)).toMatchObject({ main: { value: 'b' }, cross: { value: 7 } });

    line!.moveToIndex(0, 2);
    const back = subplot.switchLayer('DOWNWARD');

    expect(textOf(back!.state)).toMatchObject({ main: { value: 'c' }, cross: { value: 6 } });
  });

  test('keeps the bin of a horizontal histogram', () => {
    const bins: HistogramPoint[] = [
      { x: 3, y: 5, xMin: 0, xMax: 3, yMin: 0, yMax: 10 },
      { x: 8, y: 15, xMin: 0, xMax: 8, yMin: 10, yMax: 20 },
      { x: 4, y: 25, xMin: 0, xMax: 4, yMin: 20, yMax: 30 },
    ];
    const figure = figureOf(
      layer('bins', TraceType.HISTOGRAM, bins, Orientation.HORIZONTAL),
      layer('density', TraceType.LINE, [[{ x: 5, y: 0.1 }, { x: 15, y: 0.3 }, { x: 25, y: 0.2 }]]),
    );
    const subplot = figure.activeSubplot;
    subplot.traces[0][0].moveToIndex(0, 1);

    const density = subplot.switchLayer('UPWARD');

    expect(density!.getCurrentXValue()).toBe(15);
  });
});

describe('switching layers from a vertical bar-family layer', () => {
  test('still carries the category it holds in x', () => {
    const bars: BarPoint[] = LEVELS.map((x, i) => ({ x, y: VALUES[i] }));
    const figure = figureOf(layer('bars', TraceType.BAR, bars), lineThroughLevels());
    const subplot = figure.activeSubplot;
    const first = subplot.traces[0][0];
    first.moveToIndex(0, 2);

    const line = subplot.switchLayer('UPWARD');

    expect(first.getCurrentXValue()).toBe('c');
    expect(textOf(line!.state)).toMatchObject({ main: { value: 'c' }, cross: { value: 40 } });
  });
});
