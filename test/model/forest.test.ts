import type { ForestPoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { ForestTrace } from '@model/forest';
import { TraceType } from '@type/grammar';

/**
 * Four studies and a pooled summary, as a meta-analysis draws them.
 *
 * The measure is an odds ratio, so the null is 1. `Nguyen 2020` crosses it
 * and `Okafor 2022` does not, while `Silva 2018` sits *below* the null with
 * both bounds under it -- a real finding in the other direction, and the case
 * a reading that only checked the upper bound would call a crossing.
 *
 * The weights are deliberately uneven: `Okafor 2022` carries more than half
 * the analysis, which two intervals that sound alike would never reveal.
 */
const STUDIES: ForestPoint[] = [
  { x: 'Silva 2018', y: 0.62, yMin: 0.41, yMax: 0.94, weight: 0.12 },
  { x: 'Nguyen 2020', y: 1.34, yMin: 0.98, yMax: 1.83, weight: 0.08 },
  { x: 'Okafor 2022', y: 1.71, yMin: 1.22, yMax: 2.40, weight: 0.55 },
  { x: 'Haddad 2023', y: 1.05, yMin: 0.60, yMax: 1.84, weight: 0.25 },
  { x: 'Pooled', y: 1.28, yMin: 1.02, yMax: 1.61, pooled: true },
];

/**
 * Create a minimal forest layer for model-only tests.
 * @param data The studies the layer carries
 * @param nullValue The value that means no effect, when declared
 * @returns Forest layer definition
 */
function createLayer(
  data: ForestPoint[] = STUDIES,
  nullValue?: number,
): MaidrLayer {
  return {
    id: 'test-forest-layer',
    type: TraceType.FOREST,
    title: 'Effect of the intervention',
    axes: { x: { label: 'Study' }, y: { label: 'Odds ratio' } },
    data,
    ...(nullValue === undefined ? {} : { forestOptions: { nullValue } }),
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: ForestTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a forest trace positioned on one section of one study.
 * @param row Which section
 * @param col Which study
 * @param nullValue The value that means no effect, when declared
 * @param data The studies the layer carries
 * @returns The positioned trace
 */
function forest(
  row = 1,
  col = 0,
  nullValue: number | null = 1,
  data: ForestPoint[] = STUDIES,
): ForestTrace {
  // `null` rather than `undefined`, because passing `undefined` to a default
  // parameter takes the default -- so the "declares no null" cases would
  // have silently tested the declared ones.
  const trace = TraceFactory.create(
    createLayer(data, nullValue ?? undefined),
  ) as ForestTrace;
  trace.moveToIndex(row, col);
  return trace;
}

describe('forest registration', () => {
  test('the factory builds a ForestTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(ForestTrace);
  });

  test('it names itself a forest plot rather than an error bar', () => {
    expect(forest().description.chartType).toBe('Forest Plot');
  });

  test('it reads the interval a bound at a time, as an error bar does', () => {
    // The navigation transfers wholesale: what this type adds is what the
    // figure is read *for*, not a different way through it.
    expect(nonEmptyState(forest(0, 1)).text.cross.value).toBe(0.98);
    expect(nonEmptyState(forest(1, 1)).text.cross.value).toBe(1.34);
    expect(nonEmptyState(forest(2, 1)).text.cross.value).toBe(1.83);
  });
});

describe('whether an interval crosses the null is the result', () => {
  test('says so when it does', () => {
    // Nguyen 2020: 0.98 to 1.83 spans 1.
    expect(nonEmptyState(forest(1, 1)).text.section)
      .toBe('estimate, crosses the null');
  });

  test('says so when it does not', () => {
    // Okafor 2022: 1.22 to 2.40, entirely above 1.
    expect(nonEmptyState(forest(1, 2)).text.section)
      .toBe('estimate, does not cross the null');
  });

  test('a finding below the null does not read as a crossing', () => {
    // Silva 2018: 0.41 to 0.94, entirely *below* 1. A reading that only
    // asked whether the upper bound cleared the null would call this a
    // crossing and report a real protective effect as no effect at all.
    expect(nonEmptyState(forest(1, 0)).text.section)
      .toBe('estimate, does not cross the null');
  });

  test('claims nothing when the layer declares no null', () => {
    // A ratio chart guessed at 0 reports every study as not crossing, since
    // odds ratios are all positive -- a confident wrong answer on every row.
    // Silence is the only honest alternative.
    expect(nonEmptyState(forest(1, 1, null)).text.section).toBe('estimate');
  });

  test('a one-sided interval is answered on the bound it has', () => {
    const oneSided: ForestPoint[] = [
      { x: 'Upper only', y: 1.4, yMax: 2.2 },
      { x: 'Lower only', y: 1.4, yMin: 1.1 },
    ];

    // Unbounded below, so 1 lies inside it.
    expect(nonEmptyState(forest(1, 0, 1, oneSided)).text.section)
      .toBe('estimate, crosses the null');
    // Bounded at 1.1 and unbounded above, so 1 lies outside it.
    expect(nonEmptyState(forest(1, 1, 1, oneSided)).text.section)
      .toBe('estimate, does not cross the null');
  });
});

describe('the weight is a magnitude the reader is otherwise never told', () => {
  test('announces it on the estimate', () => {
    expect(nonEmptyState(forest(1, 2)).text.z)
      .toEqual({ label: 'Weight', value: '55.0%' });
  });

  test('does not repeat it at every bound', () => {
    // A study has three rows. Repeating the weight and the verdict at each
    // one buries the number the reader navigated to.
    expect(nonEmptyState(forest(0, 2)).text.z).toBeUndefined();
    expect(nonEmptyState(forest(2, 2)).text.z).toBeUndefined();
  });

  test('withholds it when the study declares none', () => {
    // The pooled row carries no weight of its own -- it is the weighting.
    expect(nonEmptyState(forest(1, 4)).text.z).toBeUndefined();
  });
});

describe('the pooled row is not a study', () => {
  test('names itself as the pooled estimate', () => {
    expect(nonEmptyState(forest(1, 4)).text.section)
      .toBe('pooled estimate, does not cross the null');
  });

  test('names its bounds as pooled too', () => {
    expect(nonEmptyState(forest(0, 4)).text.section).toBe('pooled lower bound');
  });

  test('is excluded from the count of studies', () => {
    // Nguyen (0.98 to 1.83) and Haddad (0.60 to 1.84) both span 1; Silva
    // sits below it and Okafor above. Counting the pooled row among the
    // evidence would report five studies where the analysis had four.
    const stats = forest().description.stats;
    const read = (label: string): unknown =>
      stats.find(stat => stat.label === label)?.value;

    expect(read('Studies crossing the null')).toBe('2 of 4');
  });
});

describe('the description reports what the figure is scanned for', () => {
  test('names the pooled estimate and its verdict', () => {
    const stats = forest().description.stats;
    const read = (label: string): unknown =>
      stats.find(stat => stat.label === label)?.value;

    expect(read('Pooled estimate')).toBe('Pooled, 1.28, does not cross the null');
  });

  test('counts the studies, not the rows', () => {
    // The inherited stat counts every row. Left alone the description reads
    // `Number of points is 5` beside `Studies crossing the null is 2 of 4`
    // -- two counts of the same thing that disagree, in one paragraph.
    const stats = forest().description.stats;

    expect(stats.find(stat => stat.label === 'Number of points')).toBeUndefined();
    expect(stats.find(stat => stat.label === 'Number of studies')?.value).toBe(4);
  });

  test('measures interval width over the studies, not the summary', () => {
    // A pooled interval is typically the tightest on the figure -- that is
    // what pooling is for -- so a reader asking which study was most precise
    // would routinely be handed the summary instead.
    const tightPooled: ForestPoint[] = [
      { x: 'Broad', y: 1.4, yMin: 0.5, yMax: 2.3, weight: 0.5 },
      { x: 'Also broad', y: 1.2, yMin: 0.6, yMax: 2.0, weight: 0.5 },
      { x: 'Pooled', y: 1.3, yMin: 1.25, yMax: 1.35, pooled: true },
    ];
    const stats = forest(1, 0, 1, tightPooled).description.stats;
    const read = (label: string): unknown =>
      stats.find(stat => stat.label === label)?.value;

    // 2.0 - 0.6, not the pooled row's 0.1.
    expect(read('Narrowest interval')).toBe(1.4);
    expect(read('Widest interval')).toBe(1.8);
  });

  test('names where the weight sits', () => {
    // A meta-analysis whose weight is in one trial is a different object
    // from one where it is spread, and the per-row announcement never says
    // where the mass is.
    const stats = forest().description.stats;

    expect(stats.find(stat => stat.label === 'Heaviest study')?.value)
      .toBe('Okafor 2022, 55.0%');
  });

  test('withholds the crossing count when no null is declared', () => {
    const stats = forest(1, 0, null).description.stats;

    expect(stats.find(stat => stat.label === 'Studies crossing the null'))
      .toBeUndefined();
    // The pooled row is still named -- that does not depend on a null value.
    expect(stats.find(stat => stat.label === 'Pooled estimate')?.value)
      .toBe('Pooled, 1.28');
  });
});
