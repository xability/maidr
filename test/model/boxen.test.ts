import type { BoxenPoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { BoxenTrace } from '@model/boxen';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Two distributions of deliberately different ladder depth.
 *
 * `light` has two rungs and `heavy` has four, which is the situation a boxen
 * exists for: a library adds rungs as the sample grows, so depth is a fact
 * about the data rather than about the styling. `heavy`'s deepest rungs are
 * far outside its middle ones, so the rising profile jumps at the ends — the
 * heavy tail a box plot's single whisker flattens into one number.
 */
const DISTRIBUTIONS: BoxenPoint[] = [
  {
    z: 'light',
    median: 50,
    levels: [
      { p: 0.25, lo: 45, hi: 55 },
      { p: 0.125, lo: 42, hi: 58 },
    ],
    upperOutliers: [70],
  },
  {
    z: 'heavy',
    median: 50,
    levels: [
      { p: 0.25, lo: 46, hi: 54 },
      { p: 0.125, lo: 40, hi: 60 },
      { p: 0.0625, lo: 25, hi: 75 },
      { p: 0.03125, lo: 5, hi: 95 },
    ],
  },
];

/**
 * Create a minimal boxen layer for model-only tests.
 * @param data The distributions the layer carries
 * @param orientation Which way the chart is drawn
 * @returns Boxen layer definition
 */
function createLayer(
  data: BoxenPoint[] = DISTRIBUTIONS,
  orientation?: Orientation,
): MaidrLayer {
  return {
    id: 'test-boxen-layer',
    type: TraceType.BOXEN,
    title: 'Response times',
    ...(orientation === undefined ? {} : { orientation }),
    axes: { x: { label: 'Group' }, y: { label: 'Milliseconds' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: BoxenTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a boxen trace positioned on one rung of one distribution.
 * @param row Which distribution
 * @param col Which position along its ladder
 * @param data The distributions the layer carries
 * @param orientation Which way the chart is drawn
 * @returns The positioned trace
 */
function boxen(
  row = 0,
  col = 0,
  data: BoxenPoint[] = DISTRIBUTIONS,
  orientation?: Orientation,
): BoxenTrace {
  const trace = TraceFactory.create(createLayer(data, orientation)) as BoxenTrace;
  trace.moveToIndex(row, col);
  return trace;
}

describe('boxen registration', () => {
  test('the factory builds a BoxenTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(BoxenTrace);
  });

  test('announces itself as the chart it is', () => {
    expect(boxen().description.chartType).toBe('Letter-Value Plot');
  });
});

describe('the ladder is walked in value order', () => {
  test('runs from the deepest lower quantile up to the deepest upper one', () => {
    // A box plot's own arrangement generalised. Walking left to right has to
    // move monotonically through the distribution, or the pitch stops meaning
    // "further out".
    const values = [0, 1, 2, 3, 4].map(col =>
      nonEmptyState(boxen(0, col)).text.cross.value);

    expect(values).toEqual([42, 45, 50, 55, 58]);
  });

  test('a deeper ladder gets more positions, not the same five', () => {
    // The whole reason this is not a box plot: depth varies with the sample.
    const light = nonEmptyState(boxen(0, 0)).braille;
    if (light.empty) {
      throw new Error('Expected a populated braille state');
    }

    expect((light.values as number[][])[0]).toHaveLength(5);
    expect((light.values as number[][])[1]).toHaveLength(9);
  });

  test('rungs arriving inward-first are still walked outward-first', () => {
    // Nothing in the payload says which way round a producer emitted them,
    // so trusting the order would navigate some charts backwards.
    const reversed: BoxenPoint[] = [{
      z: 'x',
      median: 50,
      levels: [
        { p: 0.125, lo: 42, hi: 58 },
        { p: 0.25, lo: 45, hi: 55 },
      ],
    }];
    const values = [0, 1, 2, 3, 4].map(col =>
      nonEmptyState(boxen(0, col, reversed)).text.cross.value);

    expect(values).toEqual([42, 45, 50, 55, 58]);
  });
});

describe('each position says which quantile it is', () => {
  test('names the percentile rather than a rung number', () => {
    // "the 12.5th percentile" is a number a reader can place; "level 3" is
    // one they have to count back from.
    const sections = [0, 1, 2, 3, 4].map(col =>
      nonEmptyState(boxen(0, col)).text.section);

    expect(sections).toEqual([
      '12.5th percentile',
      '25th percentile',
      'median',
      '75th percentile',
      '87.5th percentile',
    ]);
  });

  test('a deep rung keeps enough precision to stay distinct', () => {
    // Rounding to whole percentiles would name the two deepest rungs of a
    // large sample identically -- exactly the part of the distribution a
    // letter-value plot exists to separate.
    const deepest = nonEmptyState(boxen(1, 0)).text.section;
    const nextIn = nonEmptyState(boxen(1, 1)).text.section;

    expect(deepest).toBe('3.13th percentile');
    expect(nextIn).toBe('6.25th percentile');
    expect(deepest).not.toBe(nextIn);
  });

  test('trims a trailing zero rather than reading "25.0th"', () => {
    expect(nonEmptyState(boxen(0, 1)).text.section).toBe('25th percentile');
  });
});

describe('the pitch compares distributions', () => {
  test('one scale across the chart, not one per distribution', () => {
    // A boxen is drawn to compare distributions. Per-row bounds would put
    // every category's own median in the middle of the register whatever it
    // measured.
    const light = nonEmptyState(boxen(0, 2)).audio.freq;
    const heavy = nonEmptyState(boxen(1, 4)).audio.freq;

    expect([light.min, light.max]).toEqual([heavy.min, heavy.max]);
    expect(light.min).toBe(5);
    expect(light.max).toBe(95);
  });

  test('the two medians are the same value and so the same note', () => {
    expect(nonEmptyState(boxen(0, 2)).audio.freq.raw)
      .toBe(nonEmptyState(boxen(1, 4)).audio.freq.raw);
  });
});

describe('the description says how deep the sample went', () => {
  const read = (label: string): unknown =>
    boxen().description.stats.find(stat => stat.label === label)?.value;

  test('reports the range of ladder depths', () => {
    // A library adds rungs as it gains confidence in the tail, so depth is a
    // fact about the sample rather than about the chart's styling.
    expect(read('Quantile levels')).toBe('2 to 4');
  });

  test('reports one number when every distribution is the same depth', () => {
    const even: BoxenPoint[] = [
      { z: 'a', median: 1, levels: [{ p: 0.25, lo: 0, hi: 2 }] },
      { z: 'b', median: 3, levels: [{ p: 0.25, lo: 2, hi: 4 }] },
    ];
    const stats = boxen(0, 0, even).description.stats;

    expect(stats.find(stat => stat.label === 'Quantile levels')?.value).toBe(1);
  });

  test('counts the outliers, which a boxen has few of', () => {
    // The deep rungs absorb what a whisker would have thrown out, so a small
    // count is itself informative.
    expect(read('Outliers')).toBe(1);
  });

  test('the table names every rung of every distribution', () => {
    const { dataTable } = boxen().description;

    expect(dataTable?.headers).toEqual(['Group', 'Quantile', 'Milliseconds']);
    expect(dataTable?.rows[0]).toEqual(['light', '12.5th percentile', 42]);
    // Five positions for the shallow ladder plus nine for the deep one.
    expect(dataTable?.rows).toHaveLength(14);
  });
});

describe('which axis is which follows the orientation', () => {
  test('a chart drawn the default way up names the group on x', () => {
    const { text } = nonEmptyState(boxen());

    expect(text.main.label).toBe('Group');
    expect(text.cross.label).toBe('Milliseconds');
  });

  test('a chart whose distributions run across the page swaps them', () => {
    const { text } = nonEmptyState(
      boxen(0, 0, DISTRIBUTIONS, Orientation.HORIZONTAL),
    );

    expect(text.main.label).toBe('Milliseconds');
    expect(text.cross.label).toBe('Group');
  });
});

describe('the ladder defends the shape it documents', () => {
  /**
   * Every rung label of one distribution, in walking order.
   * @param data The distributions the layer carries
   * @returns The labels
   */
  function labelsOf(data: BoxenPoint[]): (string | undefined)[] {
    const trace = TraceFactory.create(createLayer(data)) as BoxenTrace;
    const width = trace.state.empty ? 0 : 99;
    const labels: (string | undefined)[] = [];
    for (let col = 0; col < width; col++) {
      if (!trace.moveToIndex(0, col)) {
        break;
      }
      labels.push(nonEmptyState(trace).text.section);
    }
    return labels;
  }

  test('drops a rung that claims the median own place', () => {
    // `p` is a tail probability, so it lies strictly between nothing and the
    // median's 0.5. A producer sending 0.5 would put two rungs labelled
    // `50th percentile` either side of the rung already called `median` --
    // three names for one place, on a chart where the label is the whole of
    // what tells a reader where on the distribution they are.
    const labels = labelsOf([
      {
        z: 'only',
        median: 50,
        levels: [
          { p: 0.5, lo: 40, hi: 60 },
          { p: 0.25, lo: 30, hi: 70 },
        ],
      },
    ]);

    expect(labels).toEqual(['25th percentile', 'median', '75th percentile']);
  });

  test('drops a rung outside the range a tail can occupy', () => {
    const labels = labelsOf([
      {
        z: 'only',
        median: 50,
        levels: [
          { p: 0.25, lo: 30, hi: 70 },
          { p: 0, lo: 1, hi: 99 },
          { p: -0.1, lo: 0, hi: 100 },
        ],
      },
    ]);

    expect(labels).toEqual([
      '25th percentile',
      'median',
      '75th percentile',
    ]);
  });
});

describe('the selector guard matches the union it narrows', () => {
  /**
   * The elements a layer's selectors resolved to.
   *
   * @param selectors - Whatever the layer declared
   * @returns The resolved elements, or null
   */
  function highlightsFor(selectors: MaidrLayer['selectors']): SVGElement[][] | null {
    const trace = TraceFactory.create({
      ...createLayer(),
      selectors,
    }) as BoxenTrace;
    return (trace as unknown as { highlightValues: SVGElement[][] | null })
      .highlightValues;
  }

  test('withdraws for a selector shape a boxen cannot use', () => {
    // `MaidrLayer['selectors']` also admits `string[][]` and the box and
    // candlestick shapes. `Array.isArray` alone lets all of them reach a cast
    // to `string[]`, and what saved it was `isUsableSelector` rejecting each
    // entry three frames away -- a guard leaning on a check it does not name.
    expect(highlightsFor([['a', 'b'], ['c']] as unknown as MaidrLayer['selectors']))
      .toBeNull();
    expect(highlightsFor([{ q1: 'a', q3: 'b' }] as unknown as MaidrLayer['selectors']))
      .toBeNull();
  });

  test('withdraws when there is no selector at all', () => {
    expect(highlightsFor(undefined)).toBeNull();
  });
});
