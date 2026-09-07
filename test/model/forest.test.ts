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
    expect(nonEmptyState(forest(0, 1)).text.cross?.value).toBe(0.98);
    expect(nonEmptyState(forest(1, 1)).text.cross?.value).toBe(1.34);
    expect(nonEmptyState(forest(2, 1)).text.cross?.value).toBe(1.83);
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

    // With its interval: the pooled estimate alone is half the headline
    // result, and a reader told that it clears the null is not told how near
    // it came.
    expect(read('Pooled estimate'))
      .toBe('Pooled, 1.28 (1.02 to 1.61), does not cross the null');
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

  test('states the null every verdict is judged against', () => {
    // Every crossing verdict in the dialog is measured from this number, and
    // it appeared nowhere: told an interval crosses, a reader could not tell
    // whether an estimate of 1.28 is a 28% increase over a null of 1 or a
    // large effect over a null of 0.
    const stats = forest().description.stats;

    expect(stats.find(stat => stat.label === 'No-effect value')?.value).toBe(1);
  });

  test('counts only the studies the bounds can decide', () => {
    // A study with neither bound is undecidable. Left in the denominator the
    // stat read `1 of 3`, indistinguishable from two studies that definitely
    // did not cross -- the guess `text` refuses to make when it omits the
    // verdict on such a row.
    const partial: ForestPoint[] = [
      { x: 'Decided', y: 1.7, yMin: 1.2, yMax: 2.4 },
      { x: 'Crossing', y: 1.3, yMin: 0.9, yMax: 1.8 },
      { x: 'No interval', y: 1.1 },
    ];
    const stats = forest(1, 0, 1, partial).description.stats;

    expect(stats.find(stat => stat.label === 'Studies crossing the null')?.value)
      .toBe('1 of 2');
  });

  test('drops the width stats when only the summary carries bounds', () => {
    // The guard on the override used to fail open: with no study width to
    // report, the parent's pair -- measured over every row, the summary
    // included -- was left standing as a description of the summary alone,
    // with nothing saying so.
    const summaryOnly: ForestPoint[] = [
      { x: 'Bare', y: 1.4, weight: 0.5 },
      { x: 'Also bare', y: 1.2, weight: 0.5 },
      { x: 'Pooled', y: 1.3, yMin: 1.25, yMax: 1.35, pooled: true },
    ];
    const labels = forest(0, 0, 1, summaryOnly).description.stats.map(stat => stat.label);

    expect(labels).not.toContain('Narrowest interval');
    expect(labels).not.toContain('Widest interval');
  });

  test('measures no width from a bound that is null', () => {
    // `Number(null)` is 0, so a study with one bound used to contribute a
    // width measured from zero -- a number derived from a bound the figure
    // never drew.
    const halfBound: ForestPoint[] = [
      { x: 'One bound', y: 1.4, yMin: null as unknown as number, yMax: 2.2 },
      { x: 'Both', y: 1.2, yMin: 0.9, yMax: 1.5 },
    ];
    const stats = forest(1, 1, 1, halfBound).description.stats;
    const read = (label: string): unknown =>
      stats.find(stat => stat.label === label)?.value;

    expect(read('Narrowest interval')).toBe(0.6);
    expect(read('Widest interval')).toBe(0.6);
  });

  test('withholds the crossing count when no null is declared', () => {
    const stats = forest(1, 0, null).description.stats;

    expect(stats.find(stat => stat.label === 'Studies crossing the null'))
      .toBeUndefined();
    // The pooled row is still named -- that does not depend on a null value.
    expect(stats.find(stat => stat.label === 'Pooled estimate')?.value)
      .toBe('Pooled, 1.28 (1.02 to 1.61)');
  });
});

describe('the table is where the studies are compared side by side', () => {
  test('carries the weight and marks the row that is not a study', () => {
    // The two facts the class exists for. A reader hears a weight one row at
    // a time and can never see the distribution, and the summary sits among
    // the studies distinguishable only by whatever the producer called it --
    // 'Pooled', 'RE Model', 'Overall' -- which is the miscount the class is
    // written to prevent.
    const { dataTable } = forest().description;

    expect(dataTable.headers).toEqual([
      'Study',
      'Odds ratio',
      'Lower',
      'Upper',
      'Weight',
      'Crosses null',
      'Row',
    ]);
    expect(dataTable.rows[1]).toEqual([
      'Nguyen 2020',
      1.34,
      0.98,
      1.83,
      '8.0%',
      'crosses',
      'study',
    ]);
    expect(dataTable.rows[4]).toEqual([
      'Pooled',
      1.28,
      1.02,
      1.61,
      '',
      'does not cross',
      'pooled',
    ]);
  });

  test('adds no column for a fact the figure does not carry', () => {
    // A forest plot with no weights and no declared null tabulates exactly
    // what an error bar does.
    const plain: ForestPoint[] = [
      { x: 'Alpha', y: 1.4, yMin: 1.1, yMax: 1.9 },
      { x: 'Beta', y: 0.9, yMin: 0.6, yMax: 1.3 },
    ];
    const { dataTable } = forest(1, 0, null, plain).description;

    expect(dataTable.headers).toEqual(['Study', 'Odds ratio', 'Lower', 'Upper']);
  });

  test('leaves a study the null cannot decide blank rather than guessing', () => {
    const partial: ForestPoint[] = [
      { x: 'Decided', y: 1.7, yMin: 1.2, yMax: 2.4 },
      { x: 'No interval', y: 1.1 },
    ];
    const { dataTable } = forest(1, 0, 1, partial).description;

    expect(dataTable.headers).toEqual([
      'Study',
      'Odds ratio',
      'Lower',
      'Upper',
      'Crosses null',
    ]);
    expect(dataTable.rows[1]).toEqual(['No interval', 1.1, '', '', '']);
  });
});
