import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { RadarTrace } from '@model/radar';
import { TraceType } from '@type/grammar';

/**
 * Four spokes, two series. Four is the number that makes the angles exact --
 * 12, 3, 6 and 9 o'clock -- so the panning can be asserted as values rather
 * than as inequalities, and a sweep that stayed linear cannot coincide with
 * one that goes round.
 */
const SPECS: LinePoint[][] = [
  [
    { x: 'speed', y: 8, z: 'model A' },
    { x: 'range', y: 4, z: 'model A' },
    { x: 'comfort', y: 6, z: 'model A' },
    { x: 'price', y: 9, z: 'model A' },
  ],
  [
    { x: 'speed', y: 5, z: 'model B' },
    { x: 'range', y: 7, z: 'model B' },
    { x: 'comfort', y: 3, z: 'model B' },
    { x: 'price', y: 2, z: 'model B' },
  ],
];

/**
 * Create a minimal radar layer for model-only tests.
 * @param type Which of the two circular types to declare
 * @param data The spokes the layer carries
 * @returns Radar layer definition
 */
function createLayer(
  type: TraceType = TraceType.RADAR,
  data: LinePoint[][] = SPECS,
): MaidrLayer {
  return {
    id: 'test-radar-layer',
    type,
    title: 'Model comparison',
    axes: { x: { label: 'Attribute' }, y: { label: 'Score' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: RadarTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a radar trace positioned on one spoke of one series.
 * @param row Which series
 * @param col Which spoke
 * @param type Which of the two circular types to declare
 * @param data The spokes the layer carries
 * @returns The positioned trace
 */
function radar(
  row = 0,
  col = 0,
  type: TraceType = TraceType.RADAR,
  data: LinePoint[][] = SPECS,
): RadarTrace {
  const trace = TraceFactory.create(createLayer(type, data)) as RadarTrace;
  trace.moveToIndex(row, col);
  return trace;
}

/**
 * The stereo position the audio service will compute from a state.
 *
 * It reads the pan as `interpolate(x, 0, cols - 1, -1, 1)`, so asserting on
 * `panning.x` alone would pass for a trace that got `cols` wrong -- and `cols`
 * is the half of the pair that makes the arithmetic land on `sin θ`.
 * @param state The trace state to read
 * @returns The pan, from -1 (hard left) to 1 (hard right)
 */
function pan(state: NonEmptyTraceState): number {
  const { x, cols } = state.audio.panning;
  return (x / (cols - 1)) * 2 - 1;
}

describe('radar registration', () => {
  test('the factory builds a RadarTrace for both circular types', () => {
    expect(TraceFactory.create(createLayer(TraceType.RADAR)))
      .toBeInstanceOf(RadarTrace);
    expect(TraceFactory.create(createLayer(TraceType.POLAR_AREA)))
      .toBeInstanceOf(RadarTrace);
  });

  test('announces itself as the chart it is', () => {
    expect(radar().description.chartType).toBe('Radar Chart');
    expect(radar(0, 0, TraceType.POLAR_AREA).description.chartType)
      .toBe('Polar Area Chart');
  });

  test('does not report itself as a line plot', () => {
    // It extends the line trace, which names itself 'single line' or
    // 'multiline' -- and that is what the instruction text and the layer
    // switch announce. A reader told they are on a line plot has been told
    // the wrong chart.
    expect(nonEmptyState(radar()).plotType).toBe('radar');
    expect(nonEmptyState(radar(0, 0, TraceType.POLAR_AREA)).plotType)
      .toBe('polar area');
  });
});

describe('navigation is the multi-line model', () => {
  test('walks spokes across and series up', () => {
    // Series zero is the bottom row, as it is for any multi-line layer, so
    // UPWARD reaches the next series -- inherited rather than redefined.
    const trace = radar();

    expect(trace.moveOnce('FORWARD')).toBe(true);
    expect(trace.moveOnce('DOWNWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe('range');
    expect(nonEmptyState(trace).text.cross.value).toBe(7);
  });

  test('stops at the last spoke rather than wrapping', () => {
    // The outline is closed, so wrapping would arguably read better -- but
    // every other trace stops at its bounds, and a reader who has learned
    // that would be silently looped without being told. Changing it is a
    // decision for the whole navigation model, not for one trace.
    const trace = radar(0, 3);

    expect(trace.moveOnce('FORWARD')).toBe(false);
  });
});

describe('the sweep goes round rather than across', () => {
  test('places four spokes at the quarters of the circle', () => {
    // 12 o'clock centre, 3 o'clock hard right, 6 o'clock centre again,
    // 9 o'clock hard left. A linear pan would give -1, -1/3, 1/3, 1.
    expect(pan(nonEmptyState(radar(0, 0)))).toBeCloseTo(0);
    expect(pan(nonEmptyState(radar(0, 1)))).toBeCloseTo(1);
    expect(pan(nonEmptyState(radar(0, 2)))).toBeCloseTo(0);
    expect(pan(nonEmptyState(radar(0, 3)))).toBeCloseTo(-1);
  });

  test('returns to where it started, which a line never does', () => {
    // The property that makes a circle audible: the first and third spokes
    // of a four-spoke chart sit at the same stereo position.
    const first = pan(nonEmptyState(radar(0, 0)));
    const opposite = pan(nonEmptyState(radar(0, 2)));

    expect(first).toBeCloseTo(opposite);
  });

  test('gives every series the same angles', () => {
    // A spoke is a place on the chart, not a place in a series.
    for (let col = 0; col < 4; col++) {
      expect(pan(nonEmptyState(radar(0, col))))
        .toBeCloseTo(pan(nonEmptyState(radar(1, col))));
    }
  });

  test('keeps the series index in the panning it does not use for stereo', () => {
    // `y` and `rows` are carried through to the tone but not read for the
    // stereo position, so they stay honest rather than being zeroed.
    const { panning } = nonEmptyState(radar(1, 0)).audio;

    expect(panning.y).toBe(1);
    expect(panning.rows).toBe(2);
  });
});

describe('spoke angles', () => {
  test('are taken from the longest series, not the first', () => {
    // A ragged chart is not what a radar is for, but a producer can emit one,
    // and a column with no angle would pan to whatever `undefined`
    // interpolates to.
    const ragged: LinePoint[][] = [
      [{ x: 'a', y: 1 }, { x: 'b', y: 2 }],
      [{ x: 'a', y: 3 }, { x: 'b', y: 4 }, { x: 'c', y: 5 }],
    ];
    const trace = radar(1, 2, TraceType.RADAR, ragged);

    expect(Number.isFinite(pan(nonEmptyState(trace)))).toBe(true);
  });

  test('divide the circle evenly whatever the values are', () => {
    // Unlike a pie, whose angles follow from the shares. Doubling one spoke's
    // value must not move any spoke.
    const doubled = SPECS.map(series =>
      series.map((point, index) =>
        index === 0 ? { ...point, y: Number(point.y) * 2 } : point),
    );

    for (let col = 0; col < 4; col++) {
      expect(pan(nonEmptyState(radar(0, col, TraceType.RADAR, doubled))))
        .toBeCloseTo(pan(nonEmptyState(radar(0, col))));
    }
  });
});

describe('the rest of the reading is unchanged', () => {
  test('pitch still tracks the value', () => {
    const { audio } = nonEmptyState(radar(0, 0));

    expect(audio.freq.raw).toBe(8);
  });

  test('braille is one row per series', () => {
    const { braille } = nonEmptyState(radar());

    expect(braille.empty).toBe(false);
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }
    expect(braille.values).toEqual([[8, 4, 6, 9], [5, 7, 3, 2]]);
  });

  test('the spoke and its value are announced', () => {
    const { text } = nonEmptyState(radar(1, 2));

    expect(text.main.value).toBe('comfort');
    expect(text.cross.value).toBe(3);
  });
});
