import type { AbstractTrace } from '@model/abstract';
import type { ExtremaTarget } from '@type/extrema';
import type { BoxenPoint, BoxPoint, MaidrLayer, ViolinKdePoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

/**
 * One group of a box-shaped layer. Outliers default to none.
 * @param z The group's name
 * @param min Its lower whisker end
 * @param q1 Its first quartile
 * @param q2 Its median
 * @param q3 Its third quartile
 * @param max Its upper whisker end
 * @param outliers Points past the whiskers
 * @param outliers.lower Below the lower whisker
 * @param outliers.upper Above the upper whisker
 * @returns The group
 */
function group(
  z: string,
  min: number,
  q1: number,
  q2: number,
  q3: number,
  max: number,
  outliers: { lower?: number[]; upper?: number[] } = {},
): BoxPoint {
  return {
    z,
    lowerOutliers: outliers.lower ?? [],
    min,
    q1,
    q2,
    q3,
    max,
    upperOutliers: outliers.upper ?? [],
  };
}

/**
 * Three boxes. `A` has outliers far past every whisker, so a rule that let
 * them in would send `]` to its 90 and `[` to its -40.
 */
const GROUPS: BoxPoint[] = [
  group('A', 5, 10, 15, 20, 25, { lower: [-40], upper: [90] }),
  group('B', 1, 4, 6, 8, 12),
  group('C', 3, 9, 14, 22, 40),
];

/**
 * Build a trace from a layer, as the figure does.
 * @param layer The layer
 * @returns The trace
 */
function traceOf(layer: MaidrLayer): AbstractTrace {
  return TraceFactory.create(layer) as AbstractTrace;
}

/**
 * A box-shaped layer with no selectors, so no DOM is needed.
 * @param type Box or violin box
 * @param data Its groups
 * @param extra Anything else the layer carries
 * @returns The layer
 */
function boxLayer(
  type: TraceType.BOX | TraceType.VIOLIN_BOX,
  data: BoxPoint[] = GROUPS,
  extra: Partial<MaidrLayer> = {},
): MaidrLayer {
  return {
    id: 'boxes',
    type,
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    data,
    ...extra,
  };
}

/**
 * The targets as type, label and value, which is what a reader meets in the
 * Go To dialog.
 * @param trace The trace to read
 * @returns One triple per target
 */
function offered(trace: AbstractTrace): [string, string, number][] {
  return trace.getExtremaTargets().map(target => [target.type, target.label, target.value]);
}

/**
 * Each target's position as the Go To dialog writes it, and the value it
 * formats that position from. The dialog formats `display.x` with the
 * layer's axis format only where it is `xValue` written out.
 * @param trace The trace to read
 * @returns One pair per target
 */
function positions(trace: AbstractTrace): [string | undefined, unknown][] {
  return trace.getExtremaTargets().map(target => [target.display?.x, target.xValue]);
}

/**
 * Where a target puts the reader, as the announcement reads it.
 * @param trace The trace to move
 * @param target The target to go to
 * @returns The main value, the section and the value read there
 */
function landing(trace: AbstractTrace, target: ExtremaTarget | undefined): unknown[] {
  if (target === undefined) {
    throw new Error('Expected a target');
  }
  trace.navigateToExtrema(target);
  const state = trace.state as NonEmptyTraceState;
  return [state.text.main.value, state.text.section, state.text.cross?.value];
}

describe('a box plot\'s [ and ] go to the whisker ends the description names', () => {
  test('offers the highest maximum and the lowest minimum, not the outliers past them', () => {
    const trace = traceOf(boxLayer(TraceType.BOX));

    expect(trace.supportsExtremaNavigation()).toBe(true);
    expect(offered(trace)).toEqual([
      ['max', 'Highest maximum at C', 40],
      ['min', 'Lowest minimum at B', 1],
    ]);
  });

  test.each([Orientation.VERTICAL, Orientation.HORIZONTAL])(
    'lands on the whisker end on a %s plot',
    (orientation) => {
      const trace = traceOf(boxLayer(TraceType.BOX, GROUPS, { orientation }));
      const [max, min] = trace.getExtremaTargets();

      expect(landing(trace, max)).toEqual(['C', 'Maximum', 40]);
      expect(landing(trace, min)).toEqual(['B', 'Minimum', 1]);
    },
  );

  test('offers every box holding the extreme, so a tie is walked', () => {
    const tied = [group('A', 5, 10, 15, 20, 40), ...GROUPS.slice(1)];
    const maxima = offered(traceOf(boxLayer(TraceType.BOX, tied)))
      .filter(([type]) => type === 'max')
      .map(([, label]) => label);

    expect(maxima).toEqual(['Highest maximum at A', 'Highest maximum at C']);
  });

  test('carries a named box as its x, so the Go To dialog formats it as the landing announces it', () => {
    // Without it the dialog listed a category '2019' as written while the
    // landing announced it in the axis's format, '2019.0000' at four decimals.
    const named = [group('2019', 1, 4, 6, 8, 12), group('', 3, 9, 14, 22, 40)];

    expect(positions(traceOf(boxLayer(TraceType.BOX, named)))).toEqual([
      ['Group 2', undefined],
      ['2019', '2019'],
    ]);
  });

  test('names a whisker drawn at a quantile as the summary does', () => {
    const trace = traceOf(boxLayer(TraceType.BOX, GROUPS, { whiskerQuantiles: [0.05, 0.95] }));

    expect(offered(trace).map(([, label]) => label)).toEqual([
      'Highest 95th percentile at C',
      'Lowest 5th percentile at B',
    ]);
  });
});

describe('a violin plot\'s box layer answers [ and ] as a box plot does', () => {
  test('offers the highest maximum and the lowest minimum', () => {
    const trace = traceOf(boxLayer(TraceType.VIOLIN_BOX));

    expect(trace.supportsExtremaNavigation()).toBe(true);
    expect(offered(trace)).toEqual([
      ['max', 'Highest maximum at C', 40],
      ['min', 'Lowest minimum at B', 1],
    ]);
    expect(landing(trace, trace.getExtremaTargets()[0])).toEqual(['C', 'Maximum', 40]);
  });

  test('offers no maximum where the violins are drawn without their extrema', () => {
    // There is no maximum section to land on, and the description names
    // no maximum.
    const trace = traceOf(boxLayer(TraceType.VIOLIN_BOX, GROUPS, { violinOptions: { showExtrema: false } }));

    expect(offered(trace)).toEqual([['min', 'Lowest minimum at B', 1]]);
  });
});

describe('a boxen plot\'s [ and ] go to the ends of its quantile range', () => {
  const DISTRIBUTIONS: BoxenPoint[] = [
    {
      z: 'light',
      median: 50,
      levels: [{ p: 0.25, lo: 45, hi: 55 }, { p: 0.125, lo: 42, hi: 58 }],
      upperOutliers: [99],
    },
    {
      z: 'heavy',
      median: 50,
      levels: [{ p: 0.25, lo: 46, hi: 54 }, { p: 0.03125, lo: 5, hi: 95 }],
    },
  ];

  test('offers the highest and the lowest rung, not an outlier past them', () => {
    const trace = traceOf({
      id: 'boxen',
      type: TraceType.BOXEN,
      axes: { x: { label: 'Group' }, y: { label: 'Milliseconds' } },
      data: DISTRIBUTIONS,
    });

    expect(trace.supportsExtremaNavigation()).toBe(true);
    expect(offered(trace)).toEqual([
      ['max', 'Max point at heavy', 95],
      ['min', 'Min point at heavy', 5],
    ]);
    expect(landing(trace, trace.getExtremaTargets()[0])[2]).toBe(95);
  });

  test('carries the distribution\'s name as its x, so the Go To dialog formats it as the landing announces it', () => {
    const trace = traceOf({
      id: 'boxen',
      type: TraceType.BOXEN,
      axes: { x: { label: 'Group' }, y: { label: 'Milliseconds' } },
      data: DISTRIBUTIONS,
    });

    expect(positions(trace)).toEqual([['heavy', 'heavy'], ['heavy', 'heavy']]);
  });
});

describe('a ridgeline\'s [ and ] go to the peak and the thinnest part of the ridge the reader is on', () => {
  const GROUPS_OF_DENSITY: ViolinKdePoint[][] = [
    [
      { x: 'early', y: 10, density: 0.02 },
      { x: 'early', y: 20, density: 0.09 },
      { x: 'early', y: 30, density: 0.01 },
    ],
    [
      { x: 'middle', y: 30, density: 0.30 },
      { x: 'middle', y: 45, density: 0.90 },
      { x: 'middle', y: 60, density: 0.20 },
    ],
  ];

  /**
   * A ridgeline with the reader on one sample of one ridge.
   * @param row Which ridge
   * @returns The trace
   */
  function ridgeline(row: number): AbstractTrace {
    const trace = traceOf({
      id: 'ridges',
      type: TraceType.RIDGELINE,
      axes: { x: { label: 'Days' }, y: { label: 'Cohort' } },
      data: GROUPS_OF_DENSITY,
    });
    trace.moveToIndex(row, 0);
    return trace;
  }

  test('offers the peak and the lowest density of the ridge the reader is on', () => {
    const trace = ridgeline(1);

    expect(trace.supportsExtremaNavigation()).toBe(true);
    expect(offered(trace)).toEqual([
      ['max', 'Max point at 45', 0.9],
      ['min', 'Min point at 60', 0.2],
    ]);
  });

  test('carries the raw position as its x, so the Go To dialog formats it as the landing announces it', () => {
    // Rounded here, a peak at 57.14285714285714 was listed at 57.14 while the
    // landing announced it in the axis's format, 57.1429 at four decimals.
    const trace = traceOf({
      id: 'ridges',
      type: TraceType.RIDGELINE,
      axes: { x: { label: 'Days' }, y: { label: 'Cohort' } },
      data: [[
        { x: 'early', y: 10, density: 0.02 },
        { x: 'early', y: 57.14285714285714, density: 0.09 },
      ]],
    });
    trace.moveToIndex(0, 0);

    expect(positions(trace)).toEqual([
      ['57.14285714285714', 57.14285714285714],
      ['10', 10],
    ]);
  });

  test('stays on its own ridge rather than going to the tallest', () => {
    // `early` peaks at 0.09, well below `middle`'s 0.9; the description
    // names the tallest ridge, and ] answers where this one peaks.
    expect(offered(ridgeline(0))[0]).toEqual(['max', 'Max point at 20', 0.09]);
  });
});
