import type { BarPoint, ErrorBarPoint, HistogramPoint, LinePoint, Maidr, MaidrLayer, ScatterPoint, SegmentedPoint } from '@type/grammar';
import type { TextState, TraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Switching layers from or to a horizontal bar-family layer keeps the reader
 * on the mark they were on, whichever way the other layer reads that mark.
 *
 * A horizontal bar's position reads two ways: its magnitude, in `x`, and its
 * category, in `y`. Points or a line drawn at the bar ends keep the value
 * axis in `x`, as every layer outside the bar family does, so they hold the
 * magnitude. A line through the levels of a horizontal dot plot, read as its
 * vertical transpose, and the bar's own error bars hold the category. A
 * switch carried only the magnitude, so from the dots of a horizontal dot plot
 * it searched the line's levels for a number, found none, and put the reader
 * on the first level; carrying only the category would do the same to the
 * points at the bar ends. The switch carries whichever the other layer holds.
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

describe('switching between a horizontal bar-family layer and one holding its category', () => {
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

  test('keeps the level through the layer tabs of the chart description', () => {
    const figure = figureOf(horizontalDots(), lineThroughLevels());
    const subplot = figure.activeSubplot;
    subplot.traces[0][0].moveToIndex(0, 2);

    const line = subplot.selectLayer(1);

    expect(textOf(line!.state)).toMatchObject({ main: { value: 'c' }, cross: { value: 40 } });
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

  test.each([TraceType.STACKED, TraceType.DODGED, TraceType.NORMALIZED, TraceType.DIVERGING])(
    'keeps the category, and the series, of a horizontal segmented bar (%s)',
    (type) => {
      const left = type === TraceType.DIVERGING ? -1 : 1;
      const segments: SegmentedPoint[][] = [
        [{ x: left, y: 'a', z: 's1' }, { x: 2 * left, y: 'b', z: 's1' }, { x: 3 * left, y: 'c', z: 's1' }],
        [{ x: 4, y: 'a', z: 's2' }, { x: 5, y: 'b', z: 's2' }, { x: 6, y: 'c', z: 's2' }],
      ];
      const figure = figureOf(
        layer('segments', type, segments, Orientation.HORIZONTAL),
        layer('line', TraceType.LINE, [[{ x: 'a', y: 5 }, { x: 'b', y: 7 }, { x: 'c', y: 9 }]]),
      );
      const subplot = figure.activeSubplot;
      const bars = subplot.traces[0][0];
      bars.moveToIndex(1, 1);
      expect(bars.getAlternateXValue?.()).toBe('b');

      const line = subplot.switchLayer('UPWARD');
      expect(textOf(line!.state)).toMatchObject({ main: { value: 'b' }, cross: { value: 7 } });

      line!.moveToIndex(0, 2);
      const back = subplot.switchLayer('DOWNWARD');

      expect(back).toBe(bars);
      expect(back!.getAlternateXValue?.()).toBe('c');
      expect(back!.row).toBe(1);
    },
  );

  test('keeps the bin of a horizontal histogram, both ways', () => {
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
    const histogram = subplot.traces[0][0];
    histogram.moveToIndex(0, 1);

    const density = subplot.switchLayer('UPWARD');

    expect(density!.getCurrentXValue()).toBe(15);

    density!.moveToIndex(0, 2);
    const back = subplot.switchLayer('DOWNWARD');

    expect(back).toBe(histogram);
    expect(back!.col).toBe(2);
  });

  test('keeps the category between two horizontal bar-family layers', () => {
    const bars: BarPoint[] = [{ x: 3, y: 'a' }, { x: 5, y: 'b' }, { x: 8, y: 'c' }];
    const dots: BarPoint[] = [{ x: 8, y: 'a' }, { x: 2, y: 'b' }, { x: 4, y: 'c' }];
    const figure = figureOf(
      layer('bars', TraceType.BAR, bars, Orientation.HORIZONTAL),
      layer('dots', TraceType.DOT, dots, Orientation.HORIZONTAL),
    );
    const subplot = figure.activeSubplot;
    subplot.traces[0][0].moveToIndex(0, 2);

    const other = subplot.switchLayer('UPWARD');

    // Bar c's magnitude, 8, is dot a's: the category decides.
    expect(textOf(other!.state)).toMatchObject({ main: { value: 'c' }, cross: { value: 4 } });

    other!.moveToIndex(0, 1);
    const back = subplot.switchLayer('DOWNWARD');

    expect(textOf(back!.state)).toMatchObject({ main: { value: 'b' }, cross: { value: 5 } });
  });
});

describe('switching between a horizontal bar-family layer and marks drawn at its ends', () => {
  // The value axis in `x`, as ggplot2's geom_col() + geom_point() or
  // geom_line(orientation = "y"), Base R's barplot(horiz = TRUE) + points()
  // or lines(), and matplotlib's barh() + scatter() or plot() emit them.
  const points: ScatterPoint[] = LEVELS.map((level, i) => ({ x: VALUES[i], y: i + 1, yLabel: level }));
  const line: LinePoint[] = LEVELS.map((_, i) => ({ x: VALUES[i], y: i + 1 }));

  test.each([
    ['points', layer('marks', TraceType.SCATTER, points)],
    ['a line', layer('marks', TraceType.LINE, [line])],
  ])('keeps the bar between it and %s at the bar ends', (_name, overlay) => {
    const figure = figureOf(layer('bars', TraceType.BAR, LEVELS.map((y, i) => ({ x: VALUES[i], y })), Orientation.HORIZONTAL), overlay);
    const subplot = figure.activeSubplot;
    const bars = subplot.traces[0][0];
    bars.moveToIndex(0, 2);

    const marks = subplot.switchLayer('UPWARD');

    expect(marks!.getCurrentXValue()).toBe(40);

    marks!.moveToXValue(20);
    const back = subplot.switchLayer('DOWNWARD');

    expect(back).toBe(bars);
    expect(textOf(back!.state)).toMatchObject({ main: { value: 'd' }, cross: { value: 20 } });
  });

  test('keeps the dot between a dot chart and the line joining its dots', () => {
    // Base R's dotchart(v) + lines(v, seq_along(v)), as r-maidr reads it:
    // the line's x is the value, written as text.
    const joined: LinePoint[] = LEVELS.map((_, i) => ({ x: String(VALUES[i]), y: i + 1 }));
    const figure = figureOf(horizontalDots(), layer('line', TraceType.LINE, [joined]));
    const subplot = figure.activeSubplot;
    subplot.traces[0][0].moveToIndex(0, 2);

    const line = subplot.switchLayer('UPWARD');

    expect(textOf(line!.state)).toMatchObject({ cross: { value: 3 } });

    line!.moveToIndex(0, 3);
    const back = subplot.switchLayer('DOWNWARD');

    expect(textOf(back!.state)).toMatchObject({ main: { value: 'd' }, cross: { value: 20 } });
  });
});

describe('what a bar-family layer offers a layer switch', () => {
  test('a horizontal one keeps its magnitude as its X and offers its category', () => {
    const trace = figureOf(horizontalDots()).activeSubplot.traces[0][0];

    trace.moveToIndex(0, 2);

    expect(trace.getCurrentXValue()).toBe(40);
    expect(trace.getAlternateXValue?.()).toBe('c');
    expect(trace.hasXValue?.('c')).toBe(true);
    expect(trace.hasXValue?.(40)).toBe(true);
    expect(trace.hasXValue?.(41)).toBe(false);
    expect(trace.moveToXValue('e')).toBe(true);
    expect(textOf(trace.state)).toMatchObject({ main: { value: 'e' }, cross: { value: 30 } });
  });

  test('a vertical one offers nothing more than the category it holds in x', () => {
    const bars: BarPoint[] = LEVELS.map((x, i) => ({ x, y: VALUES[i] }));
    const figure = figureOf(layer('bars', TraceType.BAR, bars), lineThroughLevels());
    const subplot = figure.activeSubplot;
    const first = subplot.traces[0][0];
    first.moveToIndex(0, 2);

    const line = subplot.switchLayer('UPWARD');

    expect(first.getCurrentXValue()).toBe('c');
    expect(first.getAlternateXValue?.()).toBeNull();
    expect(textOf(line!.state)).toMatchObject({ main: { value: 'c' }, cross: { value: 40 } });
  });
});
