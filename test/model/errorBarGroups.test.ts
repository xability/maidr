/**
 * A grouped error bar keeps its groups apart (#942).
 *
 * `error_bar` took one flat series, so a dodged chart over two treatments
 * arrived as two estimates at every category with nothing saying which was
 * which. Every number was right and no point was missing, which is what made
 * it worse than a visible failure: the reading sounded complete, and the
 * comparison the chart exists for — whether one group's interval clears the
 * other's — was the part that had gone.
 *
 * Rows run group-major: each group's sections are contiguous and ordered
 * bottom to top, then the next group's. That is what makes the chart's own
 * question answerable by ear, and it is the property these tests pin — an
 * interleaving by section would put the two ends of one interval three moves
 * apart and answer nothing.
 */

import type { ErrorBarTrace } from '@model/errorBar';
import type { ErrorBarPoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/** Two treatments across three categories, every number distinct. */
const CONTROL: ErrorBarPoint[] = [
  { x: 'a', y: 2, yMin: 1.5, yMax: 2.9, z: 'control' },
  { x: 'b', y: 4, yMin: 3.2, yMax: 5.5, z: 'control' },
  { x: 'c', y: 3, yMin: 2.7, yMax: 3.2, z: 'control' },
];

const TREATED: ErrorBarPoint[] = [
  { x: 'a', y: 3, yMin: 2.4, yMax: 3.6, z: 'treated' },
  { x: 'b', y: 5, yMin: 4.1, yMax: 6.0, z: 'treated' },
  { x: 'c', y: 6, yMin: 5.2, yMax: 6.9, z: 'treated' },
];

const GROUPS: ErrorBarPoint[][] = [CONTROL, TREATED];

function createLayer(
  data: ErrorBarPoint[] | ErrorBarPoint[][],
  zLabel?: string,
): MaidrLayer {
  return {
    id: 'grouped-error-bar',
    type: TraceType.ERROR_BAR,
    title: 'Response by dose and treatment',
    axes: {
      x: { label: 'Dose' },
      y: { label: 'Response' },
      ...(zLabel !== undefined && { z: { label: zLabel } }),
    },
    data,
  };
}

function nonEmptyState(trace: ErrorBarTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

function at(
  data: ErrorBarPoint[] | ErrorBarPoint[][],
  row: number,
  col: number,
  zLabel?: string,
): ErrorBarTrace {
  const trace = TraceFactory.create(createLayer(data, zLabel)) as ErrorBarTrace;
  trace.moveToIndex(row, col);
  return trace;
}

describe('a grouped error bar is navigable as one chart', () => {
  test('every group contributes its own sections to the grid', () => {
    const state = nonEmptyState(at(GROUPS, 0, 0));

    // Two groups of three sections. A flat reading would give three rows and
    // silently drop one group's bounds onto the other's.
    expect(state.autoplay.UPWARD).toBe(6);
    expect(state.autoplay.DOWNWARD).toBe(6);
    // Columns stay the samples of one group, not the flattened total: six
    // would let the cursor walk off the end of every row.
    expect(state.autoplay.FORWARD).toBe(3);
  });

  test('rows are group-major, so one interval is walked in three moves', () => {
    // Rows 0..2 are control's lower/value/upper at each category; 3..5 are
    // treated's. Read at category "b".
    const walked = [0, 1, 2, 3, 4, 5].map(
      row => nonEmptyState(at(GROUPS, row, 1)).audio.freq.raw,
    );

    expect(walked).toEqual([3.2, 4, 5.5, 4.1, 5, 6.0]);
  });

  test('pressing up at one category crosses from one group to the next', () => {
    // The comparison the chart is drawn for: control's upper (5.5) against
    // treated's lower (4.1) at category "b". They overlap, and a reader hears
    // that directly because the two are adjacent moves.
    const controlUpper = nonEmptyState(at(GROUPS, 2, 1)).audio.freq.raw;
    const treatedLower = nonEmptyState(at(GROUPS, 3, 1)).audio.freq.raw;

    expect(controlUpper).toBe(5.5);
    expect(treatedLower).toBe(4.1);
  });

  test('the sonification is scaled across every group', () => {
    // One scale, so a bound in one group sounds higher than a lower value in
    // the other. Per-group scaling would make the two groups' extremes sound
    // alike and erase the comparison by ear.
    const state = nonEmptyState(at(GROUPS, 1, 0));

    expect(state.audio.freq.min).toBe(1.5);
    expect(state.audio.freq.max).toBe(6.9);
  });
});

describe('extrema navigation reaches every group', () => {
  test('the largest estimate is found wherever it is', () => {
    // Control's estimates are [2, 4, 3] and treated's [3, 5, 6]. Searching
    // only the first group's row reports 4 as the maximum and never surfaces
    // 6 -- a "go to max" that lands somewhere the chart's maximum is not.
    const [highest] = at(GROUPS, 1, 0).getExtremaTargets();

    expect(highest.value).toBe(6);
    expect(highest.xValue).toBe('c');
    expect(highest.groupIndex).toBe(1);
  });

  test('the smallest estimate is found wherever it is', () => {
    const targets = at(GROUPS, 1, 0).getExtremaTargets();
    const lowest = targets.find(target => target.type === 'min');

    expect(lowest?.value).toBe(2);
    expect(lowest?.groupIndex).toBe(0);
  });

  test('the label names the group the extreme belongs to', () => {
    // Two groups share the category names, so "Max value at c" alone does not
    // say which series it means.
    const [highest] = at(GROUPS, 1, 0).getExtremaTargets();

    expect(highest.label).toContain('treated');
  });

  test('navigating to an extreme lands on that group row', () => {
    const trace = at(GROUPS, 1, 0);
    const [highest] = trace.getExtremaTargets();

    trace.navigateToExtrema(highest);
    const state = nonEmptyState(trace);

    // Landing on group 0's value row would announce control's estimate at
    // category c -- 3, not the 6 the target named.
    expect(state.audio.freq.raw).toBe(6);
    expect(state.text.z?.value).toBe('treated');
  });

  test('an ungrouped chart still reports its own extremes', () => {
    const [highest] = at(CONTROL, 1, 0).getExtremaTargets();

    expect(highest.value).toBe(4);
    expect(highest.xValue).toBe('b');
  });
});

describe('a grouped error bar says which group it is reading', () => {
  test('the announcement names the group', () => {
    const state = nonEmptyState(at(GROUPS, 1, 1));

    expect(state.text.z).toEqual({ label: 'Group', value: 'control' });
    expect(state.text.main.value).toBe('b');
  });

  test('the second group announces its own name', () => {
    const state = nonEmptyState(at(GROUPS, 4, 1));

    expect(state.text.z).toEqual({ label: 'Group', value: 'treated' });
  });

  test('the z axis label names the grouping variable when authored', () => {
    const state = nonEmptyState(at(GROUPS, 1, 0, 'Treatment'));

    // Otherwise a chart grouped by treatment announces "Group is control",
    // which names the mechanism rather than the variable.
    expect(state.text.z).toEqual({ label: 'Treatment', value: 'control' });
  });

  test('the section is still named alongside the group', () => {
    // Both facts are needed: which group, and which of its three magnitudes.
    const lower = nonEmptyState(at(GROUPS, 0, 0));
    const upper = nonEmptyState(at(GROUPS, 2, 0));

    expect(lower.text.section).toBe('lower bound');
    expect(upper.text.section).toBe('upper bound');
    expect(lower.text.z?.value).toBe('control');
  });

  test('a chart with unnamed groups announces no group rather than a number', () => {
    const unnamed: ErrorBarPoint[][] = [
      [{ x: 'a', y: 1 }, { x: 'b', y: 2 }],
      [{ x: 'a', y: 3 }, { x: 'b', y: 4 }],
    ];

    // "Group is Error bar 1" would be noise in place of a reading. The
    // positions still separate the groups; only the name is absent.
    expect(nonEmptyState(at(unnamed, 0, 0)).text.z).toBeUndefined();
  });
});

describe('an ungrouped error bar is unchanged', () => {
  test('a flat payload still reads as one series', () => {
    const state = nonEmptyState(at(CONTROL, 1, 1));

    expect(state.autoplay.UPWARD).toBe(3);
    expect(state.autoplay.FORWARD).toBe(3);
    expect(state.audio.freq.raw).toBe(4);
  });

  test('a single series announces no group', () => {
    // One group has nothing to disambiguate, so naming it would add a clause
    // to every announcement that carries no information.
    expect(nonEmptyState(at(CONTROL, 1, 0)).text.z).toBeUndefined();
  });

  test('a single group wrapped in an array reads the same as a flat one', () => {
    const wrapped = nonEmptyState(at([CONTROL], 1, 1));
    const flat = nonEmptyState(at(CONTROL, 1, 1));

    expect(wrapped.audio.freq.raw).toBe(flat.audio.freq.raw);
    expect(wrapped.autoplay.UPWARD).toBe(flat.autoplay.UPWARD);
    expect(wrapped.text.z).toBeUndefined();
  });
});

describe('the description covers every group', () => {
  test('the table names the group each row belongs to', () => {
    const trace = at(GROUPS, 0, 0);
    const { dataTable } = trace.description;

    // Without the group column the table has two rows headed "a" differing
    // only in their numbers -- the announcement's loss, written down.
    expect(dataTable?.headers).toEqual([
      'Group',
      'Dose',
      'Response',
      'Lower',
      'Upper',
    ]);
    expect(dataTable?.rows).toHaveLength(6);
    expect(dataTable?.rows[0]).toEqual(['control', 'a', 2, 1.5, 2.9]);
    expect(dataTable?.rows[3]).toEqual(['treated', 'a', 3, 2.4, 3.6]);
  });

  test('an ungrouped table keeps the four columns it had', () => {
    const { dataTable } = at(CONTROL, 0, 0).description;

    expect(dataTable?.headers).toEqual(['Dose', 'Response', 'Lower', 'Upper']);
    expect(dataTable?.rows[0]).toEqual(['a', 2, 1.5, 2.9]);
  });

  test('the group count is reported', () => {
    const stats = at(GROUPS, 0, 0).description.stats;
    const groupCount = stats?.find(stat => stat.label === 'Number of groups');

    expect(groupCount?.value).toBe(2);
    expect(stats?.find(stat => stat.label === 'Number of points')?.value).toBe(6);
  });

  test('an ungrouped chart reports no group count', () => {
    const stats = at(CONTROL, 0, 0).description.stats;

    expect(stats?.find(stat => stat.label === 'Number of groups')).toBeUndefined();
  });
});
