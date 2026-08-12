import type { BarPoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

/**
 * A dot plot and a lollipop are a bar chart's reading with a different mark.
 *
 * There is deliberately no model behind either: the same category and the same
 * value, navigated the same way. What they add is that the chart announces
 * itself as the chart the author drew — a reader told "bar chart" when they
 * asked for a lollipop has been told something false about the page, and the
 * description dialog's chart type is one of the few places a MAIDR user learns
 * what they are looking at.
 *
 * So these tests assert the naming and assert that nothing else moved.
 */

const SALES: BarPoint[] = [
  { x: 'Q1', y: 120 },
  { x: 'Q2', y: 200 },
  { x: 'Q3', y: 90 },
];

/**
 * Create a minimal layer of one of the three bar-shaped types.
 * @param type Which mark the chart draws
 * @param orientation Which way it is drawn, when it declares one
 * @returns The layer definition
 */
function createLayer(type: TraceType, orientation?: Orientation): MaidrLayer {
  return {
    id: 'test-layer',
    type,
    title: 'Sales',
    ...(orientation === undefined ? {} : { orientation }),
    axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
    data: SALES,
  };
}

/**
 * Read a trace's state at one point, asserting it is populated.
 * @param type Which mark the chart draws
 * @param col Which category
 * @param orientation Which way it is drawn
 * @returns The non-empty trace state
 */
function stateOf(
  type: TraceType,
  col = 0,
  orientation?: Orientation,
): NonEmptyTraceState {
  const trace = TraceFactory.create(createLayer(type, orientation));
  trace.moveToIndex(0, col);
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

describe('a dot plot and a lollipop are built, not rejected', () => {
  test.each([TraceType.DOT, TraceType.LOLLIPOP])(
    'the factory builds %s rather than throwing',
    (type) => {
      // An unregistered type throws `Invalid trace type` out of `new
      // Figure(...)`, so nothing on the page renders at all.
      expect(TraceFactory.create(createLayer(type))).toBeInstanceOf(BarTrace);
    },
  );
});

describe('each chart says which chart it is', () => {
  test('the description names the mark the author drew', () => {
    const chartType = (type: TraceType): string =>
      (TraceFactory.create(createLayer(type)) as BarTrace).description.chartType;

    expect(chartType(TraceType.DOT)).toBe('Dot Plot');
    expect(chartType(TraceType.LOLLIPOP)).toBe('Lollipop Chart');
    expect(chartType(TraceType.BAR)).toBe('Bar Chart');
  });

  test('the spoken plot type is the mark, not the model behind it', () => {
    // What the instruction text and the layer-switch cue announce. Sharing
    // `BarTrace` must not mean announcing "bar".
    expect(stateOf(TraceType.DOT).plotType).toBe('dot');
    expect(stateOf(TraceType.LOLLIPOP).plotType).toBe('lollipop');
  });
});

describe('nothing about the reading changes', () => {
  test.each([TraceType.DOT, TraceType.LOLLIPOP])(
    '%s announces the category and the value a bar would',
    (type) => {
      const dot = stateOf(type, 1);
      const bar = stateOf(TraceType.BAR, 1);

      expect(dot.text.main).toEqual(bar.text.main);
      expect(dot.text.cross).toEqual(bar.text.cross);
      expect(dot.audio.freq).toEqual(bar.audio.freq);
    },
  );

  test.each([TraceType.DOT, TraceType.LOLLIPOP])(
    '%s is oriented, since a bar is',
    (type) => {
      // A Cleveland dot plot is conventionally drawn with its categories down
      // the page, so a type that resolved no orientation would announce the
      // axes the wrong way round for the way it is usually drawn.
      const horizontal = stateOf(type, 0, Orientation.HORIZONTAL);
      const vertical = stateOf(type, 0, Orientation.VERTICAL);

      expect(horizontal.orientation).toBe(Orientation.HORIZONTAL);
      expect(vertical.orientation).toBe(Orientation.VERTICAL);
      expect(horizontal.text.main.label).not.toBe(vertical.text.main.label);
    },
  );

  test.each([TraceType.DOT, TraceType.LOLLIPOP])(
    '%s renders braille rather than a blank display',
    (type) => {
      // An unregistered braille encoder is the one registration failure that
      // is silent: the display stays empty while text and audio keep working.
      const { braille } = stateOf(type);

      expect(braille.empty).toBe(false);
      if (braille.empty) {
        throw new Error('Expected a populated braille state');
      }
      expect(braille.values).toEqual([[120, 200, 90]]);
    },
  );
});
