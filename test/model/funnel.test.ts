import type { BarPoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { FunnelTrace } from '@model/funnel';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Four stages, arranged so the raw scale and the retention disagree.
 *
 * `Visited -> Signed up` loses three quarters of the axis and keeps 24%.
 * `Viewed -> Purchased` loses a fifth of the axis and keeps **4%**. The second
 * is the catastrophe and the first is the ordinary top of a funnel, so a
 * reading that pitched the counts hears them the wrong way round -- which is
 * the whole reason this is a type of its own.
 */
const STAGES: BarPoint[] = [
  { x: 'Visited', y: 10000 },
  { x: 'Signed up', y: 2400 },
  { x: 'Viewed', y: 2300 },
  { x: 'Purchased', y: 100 },
];

/**
 * Create a minimal funnel layer for model-only tests.
 * @param data The stages the layer carries
 * @returns Funnel layer definition
 */
function createLayer(
  data: BarPoint[] = STAGES,
  orientation: Orientation = Orientation.VERTICAL,
): MaidrLayer {
  return {
    id: 'test-funnel-layer',
    type: TraceType.FUNNEL,
    title: 'Checkout funnel',
    orientation,
    axes: { x: { label: 'Stage' }, y: { label: 'People' } },
    data,
  };
}

/**
 * The same four stages a funnel drawn top to bottom carries.
 *
 * A horizontal bar layer puts the magnitude on `x` and the category on `y`,
 * which is the pair the parent reads. A funnel is drawn this way at least as
 * often as the other, so it is the arrangement where reading a fixed field
 * is wrong.
 */
const HORIZONTAL_STAGES: BarPoint[] = STAGES.map(point => ({
  x: point.y,
  y: point.x,
}));

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: FunnelTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a funnel trace positioned on one stage.
 * @param col Which stage
 * @param data The stages the layer carries
 * @returns The positioned trace
 */
function funnel(col = 0, data: BarPoint[] = STAGES): FunnelTrace {
  const trace = TraceFactory.create(createLayer(data)) as FunnelTrace;
  trace.moveToIndex(0, col);
  return trace;
}

/**
 * Where a state's pitch sits within the range it was given, 0 to 1.
 * @param state The trace state to read
 * @returns The relative pitch
 */
function pitch(state: NonEmptyTraceState): number {
  const { min, max, raw } = state.audio.freq;
  return (Number(raw) - min) / (max - min);
}

describe('funnel registration', () => {
  test('the factory builds a FunnelTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(FunnelTrace);
  });

  test('announces itself as the chart it is', () => {
    expect(funnel().description.chartType).toBe('Funnel Chart');
    expect(nonEmptyState(funnel()).plotType).toBe('funnel');
  });
});

describe('the ear gets the ratio, because the ear cannot take a ratio', () => {
  test('the pitch is the retention, not the count', () => {
    // Signed up keeps 24% of Visited.
    const { audio } = nonEmptyState(funnel(1));

    expect(audio.freq.raw).toBeCloseTo(0.24);
    expect(audio.freq.min).toBe(0);
    expect(audio.freq.max).toBe(1);
  });

  test('the worst stage is the lowest note, which the counts would not give', () => {
    // Purchased keeps 4% and is the catastrophe; Signed up keeps 24% and is
    // the ordinary top of a funnel. On the raw scale the fall into Signed up
    // is three times the fall into Purchased -- so pitching counts reports
    // the healthy stage as the worse one.
    const signedUp = pitch(nonEmptyState(funnel(1)));
    const purchased = pitch(nonEmptyState(funnel(3)));

    expect(purchased).toBeLessThan(signedUp);

    // And the counts really do disagree, so the assertion above is not a
    // coincidence of this fixture.
    const counts = STAGES.map(stage => Number(stage.y));
    const rawFallIntoSignedUp = counts[0] - counts[1];
    const rawFallIntoPurchased = counts[2] - counts[3];
    expect(rawFallIntoSignedUp).toBeGreaterThan(rawFallIntoPurchased);
  });

  test('a stage that lost nobody sounds like one', () => {
    // Viewed keeps 95.8% of Signed up, which has to be near the top of the
    // register rather than near the bottom where its count sits.
    expect(pitch(nonEmptyState(funnel(2)))).toBeGreaterThan(0.9);
  });
});

describe('the announcement keeps the count', () => {
  test('gives the stage, the count, the retention and the share', () => {
    const { text } = nonEmptyState(funnel(1));

    expect(text.main.value).toBe('Signed up');
    expect(text.cross?.value).toBe(2400);
    expect(text.z).toEqual({ label: 'Retained', value: '24.0%' });
    expect(text.stack?.label).toBe('Entered');
    expect(text.stack?.value).toBe(10000);
    expect(text.stack?.share).toBeCloseTo(0.24);
  });

  test('the entry stage claims neither a retention nor a share', () => {
    // "100% retained" would report a conversion the chart never claimed --
    // nothing converted into the first stage -- and "Entered is 10000, 100.0%
    // of it" says the same number twice while calling one of them a share.
    const { text } = nonEmptyState(funnel(0));

    expect(text.z).toBeUndefined();
    expect(text.stack).toBeUndefined();
    // The count itself is still there.
    expect(text.cross?.value).toBe(10000);
  });

  test('the description names the entry stage, since the announcement does not', () => {
    // Silence is the signal when walking the funnel, but a reader who
    // arrived by rotor has nothing to have contrasted it against.
    const stats = funnel().description.stats;

    expect(stats.find(stat => stat.label === 'Entry stage')?.value)
      .toBe('Visited');
  });

  test('the share is cumulative, which the retention alone does not give', () => {
    // Viewed keeps 95.8% of the stage before it but only 23% of everyone who
    // entered, and a reader would otherwise have to multiply out every stage
    // they had passed.
    const { text } = nonEmptyState(funnel(2));

    expect(text.z?.value).toBe('95.8%');
    expect(text.stack?.share).toBeCloseTo(0.23);
  });
});

describe('a stage that measured nothing', () => {
  test('reports no ratio rather than an infinity', () => {
    // Dividing by an empty stage would hand the audio a non-finite frequency
    // and the announcement an infinity.
    const withZero: BarPoint[] = [
      { x: 'a', y: 100 },
      { x: 'b', y: 0 },
      { x: 'c', y: 0 },
    ];
    const { audio } = nonEmptyState(funnel(2, withZero));

    expect(Number.isNaN(Number(audio.freq.raw))).toBe(true);
  });

  test('a zero stage is a real reading of zero retention, not a gap', () => {
    const withZero: BarPoint[] = [
      { x: 'a', y: 100 },
      { x: 'b', y: 0 },
    ];

    expect(nonEmptyState(funnel(1, withZero)).audio.freq.raw).toBe(0);
  });
});

describe('the description locates the drop', () => {
  const read = (label: string): unknown =>
    funnel().description.stats.find(stat => stat.label === label)?.value;

  test('names the steepest drop by retention, not by size', () => {
    // The one thing a reader cannot assemble from a sequence of counts
    // without dividing each by the one before it.
    expect(read('Steepest drop')).toBe('Purchased, 4.3% retained');
  });

  test('reports the overall conversion', () => {
    expect(read('Overall conversion')).toBe('1.0%');
  });

  test('says nothing about a drop on a single-stage funnel', () => {
    const stats = funnel(0, [{ x: 'only', y: 5 }]).description.stats;

    expect(stats.find(stat => stat.label === 'Steepest drop')).toBeUndefined();
  });
});

describe('a funnel drawn top to bottom', () => {
  /**
   * Build a horizontally oriented funnel.
   * @returns The trace
   */
  function horizontal(): FunnelTrace {
    return TraceFactory.create(
      createLayer(HORIZONTAL_STAGES, Orientation.HORIZONTAL),
    ) as FunnelTrace;
  }

  test('names the entry stage rather than counting it', () => {
    // Read off a fixed field, this reports 10000 -- the count where the name
    // belongs, in the one summary a reader consults to find out where the
    // funnel starts.
    const stats = horizontal().description.stats;
    const read = (label: string): unknown =>
      stats.find(stat => stat.label === label)?.value;

    expect(read('Entry stage')).toBe('Visited');
  });

  test('names the stage that loses the most people', () => {
    const stats = horizontal().description.stats;
    const worst = stats.find(stat => stat.label === 'Steepest drop')?.value;

    expect(worst).toBe('Purchased, 4.3% retained');
  });
});
