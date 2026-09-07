import type { MaidrLayer, SurvivalPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { SurvivalTrace } from '@model/survival';
import { TraceType } from '@type/grammar';

/**
 * Two arms over the same follow-up.
 *
 * `Treatment` never falls to half, so its median is *not reached* -- which is
 * a result rather than a missing number, and the case a reading that only
 * reported medians it found would silently drop. `Control` reaches half at
 * month 9.
 *
 * Censoring is placed where it matters: at month 12 on `Treatment`, on a
 * time where the curve does *not* step. Nothing else in the announcement
 * distinguishes it from the month before.
 */
const ARMS: SurvivalPoint[][] = [
  [
    { x: 0, y: 1.00, z: 'Control', yMin: 1.00, yMax: 1.00 },
    { x: 3, y: 0.88, z: 'Control', yMin: 0.79, yMax: 0.97 },
    { x: 6, y: 0.71, z: 'Control', yMin: 0.59, yMax: 0.83 },
    { x: 9, y: 0.50, z: 'Control', yMin: 0.37, yMax: 0.63 },
    { x: 12, y: 0.41, z: 'Control', yMin: 0.28, yMax: 0.54 },
  ],
  [
    { x: 0, y: 1.00, z: 'Treatment', yMin: 1.00, yMax: 1.00 },
    { x: 3, y: 0.95, z: 'Treatment', yMin: 0.89, yMax: 1.00 },
    { x: 6, y: 0.86, z: 'Treatment', yMin: 0.77, yMax: 0.95 },
    { x: 9, y: 0.79, z: 'Treatment', yMin: 0.68, yMax: 0.90 },
    { x: 12, y: 0.79, z: 'Treatment', censored: true, yMin: 0.68, yMax: 0.90 },
  ],
];

/**
 * Create a minimal survival layer for model-only tests.
 * @param data The arms the layer carries
 * @returns Survival layer definition
 */
function createLayer(data: SurvivalPoint[][] = ARMS): MaidrLayer {
  return {
    id: 'test-survival-layer',
    type: TraceType.SURVIVAL,
    title: 'Overall survival',
    axes: { x: { label: 'Months' }, y: { label: 'Survival' }, z: { label: 'Arm' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: SurvivalTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a survival trace positioned on one time of one arm.
 * @param row Which arm
 * @param col Which time
 * @param data The arms the layer carries
 * @returns The positioned trace
 */
function survival(
  row = 0,
  col = 0,
  data: SurvivalPoint[][] = ARMS,
): SurvivalTrace {
  const trace = TraceFactory.create(createLayer(data)) as SurvivalTrace;
  trace.moveToIndex(row, col);
  return trace;
}

describe('survival registration', () => {
  test('the factory builds a SurvivalTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(SurvivalTrace);
  });

  test('it announces itself as a survival curve, not a step chart', () => {
    // `StepTrace` forces plotType to 'step' so a step chart does not announce
    // its raw layer type. A survival curve is a step chart, but it is not
    // *a step chart* to a reader.
    expect(nonEmptyState(survival()).plotType).toBe('survival');
  });

  test('it reads the curve a time at a time, as a step chart does', () => {
    expect(nonEmptyState(survival(0, 2)).text.main.value).toBe(6);
    expect(nonEmptyState(survival(0, 2)).text.cross?.value).toBe(0.71);
  });
});

describe('a censored time is not an event', () => {
  test('says so where the curve does not step', () => {
    // Month 12 on `Treatment` holds at 0.79, the same as month 9. Without
    // this, nothing in the announcement separates a subject leaving the
    // study from a month in which nothing happened.
    expect(nonEmptyState(survival(1, 4)).text.section).toBe('censored');
  });

  test('says nothing at an ordinary time', () => {
    expect(nonEmptyState(survival(1, 3)).text.section).toBeUndefined();
  });

  test('offers a rotor filter for the censored times', () => {
    const keys = survival().getRotorFilterUnits().map(unit => unit.key);

    expect(keys).toContain('censored');
    // The step chart's own unit survives rather than being displaced.
    expect(keys).toContain('transition');
  });

  test('withholds the filter on a curve where nobody was censored', () => {
    // A mode whose only possible answer is "none found" is worse than not
    // offering it.
    const uncensored: SurvivalPoint[][] = [
      [{ x: 0, y: 1, z: 'Only' }, { x: 1, y: 0.4, z: 'Only' }],
    ];
    const keys = survival(0, 0, uncensored).getRotorFilterUnits().map(u => u.key);

    expect(keys).not.toContain('censored');
  });

  test('jumps to the censored time within the current arm', () => {
    const trace = survival(1, 0);

    expect(trace.moveToRotorFilter('censored', 'right')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe(12);
    // Nothing further along, so the next request reports the bound.
    expect(trace.moveToRotorFilter('censored', 'right')).toBe(false);
  });
});

describe('the band travels with the estimate', () => {
  test('announces the interval alongside the estimate at this time', () => {
    // How wide the interval is at a time is how much the curve is worth
    // there, and it is the comparison a reader makes when two arms look
    // separated. It travels as `interval`, which the text service reads
    // *after* the estimate; a `crossRange` would replace the estimate with
    // the band, and the survival probability -- the number the curve is
    // read for -- would never be spoken.
    const { text } = nonEmptyState(survival(0, 2));

    expect(text.cross?.value).toBe(0.71);
    expect(text.interval).toEqual({ min: 0.59, max: 0.83 });
    expect(text.crossRange).toBeUndefined();
  });

  test('says nothing when the chart draws no band', () => {
    const bare: SurvivalPoint[][] = [
      [{ x: 0, y: 1, z: 'Only' }, { x: 1, y: 0.4, z: 'Only' }],
    ];

    expect(nonEmptyState(survival(0, 1, bare)).text.interval).toBeUndefined();
    expect(nonEmptyState(survival(0, 1, bare)).text.crossRange).toBeUndefined();
  });
});

describe('the description reports what the figure is quoted by', () => {
  test('names the median survival of each arm', () => {
    const stats = survival().description.stats;
    const read = (label: string): unknown =>
      stats.find(stat => stat.label === label)?.value;

    // `Control` reaches half at month 9. `Treatment` never does -- and "not
    // reached" is the result, not a missing number: more than half its
    // subjects were still alive at the end of follow-up.
    expect(read('Median survival')).toBe('Control: 9, Treatment: not reached');
  });

  test('takes the first time at or below half, not the nearest', () => {
    // Survival is non-increasing, so the median is the first time the curve
    // is not above a half. A curve stepping straight past 0.5 has its median
    // at the step, not at the value closest to it.
    const steep: SurvivalPoint[][] = [
      [
        { x: 0, y: 1.0, z: 'Steep' },
        { x: 5, y: 0.55, z: 'Steep' },
        { x: 6, y: 0.20, z: 'Steep' },
      ],
    ];

    expect(survival(0, 0, steep).description.stats.find(stat => stat.label === 'Median survival')?.value)
      .toBe(6);
  });

  test('does not name the arm of a curve that has no second arm', () => {
    // Prefixed on a single curve, one authoring no name was told its median
    // belonged to "Arm 1" -- a name nothing else in the figure uses, and one
    // that implies a second arm the reader can go looking for.
    const alone: SurvivalPoint[][] = [
      [{ x: 0, y: 1 }, { x: 4, y: 0.5 }],
    ];

    expect(survival(0, 0, alone).description.stats.find(stat => stat.label === 'Median survival')?.value).toBe(4);
  });

  test('counts the censored times per arm', () => {
    // The argument this chart is read for is comparative: one censored time
    // in `Treatment` and none in `Control` says something a single total
    // across both arms cannot -- and the censored-time rotor walks the
    // current arm alone, so a reader counting one there could not reconcile
    // it with the sum.
    const stats = survival().description.stats;

    expect(stats.find(stat => stat.label === 'Censored times')?.value)
      .toBe('Control: 0, Treatment: 1');
  });

  test('counts them bare on a single curve', () => {
    const alone: SurvivalPoint[][] = [
      [{ x: 0, y: 1, z: 'Only' }, { x: 1, y: 0.4, z: 'Only', censored: true }],
    ];

    expect(survival(0, 0, alone).description.stats.find(stat => stat.label === 'Censored times')?.value).toBe(1);
  });

  test('reports the gap between the arms at the end, and which is on top', () => {
    // 0.79 against 0.41 at month 12. What a two-arm survival figure is drawn
    // to show, and what a reader cannot assemble by ear without holding one
    // curve's last value while walking the other.
    //
    // The arms are named because the gap is a maximum over every arm: on the
    // three-arm figure a dose comparison draws, one number could belong to
    // any of three pairs.
    const stats = survival().description.stats;

    expect(stats
      .find(stat => stat.label === 'Separation at the end of shared follow-up')
      ?.value).toBe('0.38 at 12, Treatment above Control');
  });

  test('names no arm above another when the arms end level', () => {
    const level: SurvivalPoint[][] = [
      [{ x: 0, y: 1, z: 'A' }, { x: 4, y: 0.6, z: 'A' }],
      [{ x: 0, y: 1, z: 'B' }, { x: 4, y: 0.6, z: 'B' }],
    ];

    expect(survival(0, 0, level).description.stats.find(stat => stat.label === 'Separation at the end of shared follow-up')?.value).toBe('0 at 4');
  });

  test('compares the arms at a time, not at an index', () => {
    // Independently fitted arms land on different event and censoring grids,
    // so `arm[i]` of one is a different time from `arm[i]` of the other.
    // Aligned by index this compared Control at month 5 against Treatment at
    // month 7 and announced the gap as though it were one time.
    //
    // Shared follow-up ends at month 7. Control has a point at month 6, so
    // reading it as a step function gives 0.6 there; index 2 of Control is
    // month 5, which gives 0.7 -- and month 5 is not month 7.
    const uneven: SurvivalPoint[][] = [
      [
        { x: 0, y: 1.0, z: 'Control' },
        { x: 2, y: 0.9, z: 'Control' },
        { x: 5, y: 0.7, z: 'Control' },
        { x: 6, y: 0.6, z: 'Control' },
        { x: 9, y: 0.4, z: 'Control' },
        { x: 14, y: 0.2, z: 'Control' },
      ],
      [
        { x: 0, y: 1.0, z: 'Treatment' },
        { x: 3, y: 0.95, z: 'Treatment' },
        { x: 7, y: 0.85, z: 'Treatment' },
      ],
    ];

    // 0.85 against 0.60. Aligned by index it reads 0.15, comparing month 5
    // against month 7.
    expect(survival(0, 0, uneven).description.stats.find(stat => stat.label === 'Separation at the end of shared follow-up')?.value).toBe('0.25 at 7, Treatment above Control');
  });

  test('says nothing when the times cannot be ordered', () => {
    // A categorical x has no "end of follow-up" to read at, and guessing one
    // would announce a gap measured somewhere the reader cannot name.
    const categorical: SurvivalPoint[][] = [
      [{ x: 'early', y: 1.0, z: 'A' }, { x: 'late', y: 0.5, z: 'A' }],
      [{ x: 'early', y: 1.0, z: 'B' }, { x: 'late', y: 0.8, z: 'B' }],
    ];

    expect(survival(0, 0, categorical).description.stats
      .find(stat => stat.label === 'Separation at the end of shared follow-up'))
      .toBeUndefined();
  });

  test('reports no separation for a single arm', () => {
    const alone: SurvivalPoint[][] = [
      [{ x: 0, y: 1, z: 'Only' }, { x: 1, y: 0.4, z: 'Only' }],
    ];

    expect(survival(0, 0, alone).description.stats
      .find(stat => stat.label === 'Separation at the end of shared follow-up'))
      .toBeUndefined();
  });
});

describe('the description calls the curves arms, not lines', () => {
  test('counts and names them as arms', () => {
    // Inherited from the line trace, the dialog opened "Number of lines: 2,
    // Line names: Control, Treatment" and then called the same two curves
    // arms in every statistic below -- two nouns for one referent, with
    // `Line` the wrong one for a clinical figure.
    const labels = survival().description.stats.map(stat => stat.label);

    expect(labels).toContain('Number of arms');
    expect(labels).toContain('Arm names');
    expect(labels).not.toContain('Number of lines');
    expect(labels).not.toContain('Points per line');
    expect(labels).not.toContain('Line names');
  });

  test('names an unnamed curve positionally the way the statistics do', () => {
    // The positional fallback takes its noun from the same place, so the
    // curve the table calls `Arm 2` is the one the medians call `Arm 2`.
    const unnamed: SurvivalPoint[][] = [
      [{ x: 0, y: 1 }, { x: 4, y: 0.6 }],
      [{ x: 0, y: 1 }, { x: 4, y: 0.3 }],
    ];
    const { stats, dataTable } = survival(0, 0, unnamed).description;

    expect(stats.find(stat => stat.label === 'Arm names')?.value)
      .toBe('Arm 1, Arm 2');
    expect(stats.find(stat => stat.label === 'Median survival')?.value)
      .toBe('Arm 1: not reached, Arm 2: 4');
    expect(dataTable.rows[0][2]).toBe('Arm 1');
  });
});

describe('the table says which times were censored', () => {
  test('carries the flag beside the time it belongs to', () => {
    // The distinction this class exists to convey, in the one place a reader
    // reviews the whole curve at once. Month 12 of `Treatment` is the
    // censored time; the curve does not step there, so nothing else in the
    // row separates it from the month before.
    const { dataTable } = survival().description;

    expect(dataTable.headers).toEqual(['Months', 'Survival', 'Arm', 'Censored']);
    expect(dataTable.rows[9]).toEqual([12, 0.79, 'Treatment', 'censored']);
    // Blank rather than "no", so the column can be scanned.
    expect(dataTable.rows[4]).toEqual([12, 0.41, 'Control', '']);
  });

  test('leaves the table alone on a curve where nobody was censored', () => {
    // The same condition the rotor is withheld under: a column that can only
    // ever be blank is noise in every row.
    const uncensored: SurvivalPoint[][] = [
      [{ x: 0, y: 1, z: 'Only' }, { x: 1, y: 0.4, z: 'Only' }],
    ];
    const { dataTable } = survival(0, 0, uncensored).description;

    expect(dataTable.headers).not.toContain('Censored');
  });
});
