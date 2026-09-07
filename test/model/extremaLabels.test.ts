import type { AbstractTrace } from '@model/abstract';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { DescriptionStat } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

/**
 * The chart-wide extremes say what they are the extremes *of*.
 *
 * `Min value: 0.1` names a number and not a quantity, which on a chart whose
 * axes measure different things is a figure with no referent -- the dialog
 * being exactly where a reader goes to learn what the axes are. Contour hit
 * this first and renamed the pair by hand; every family reports the same pair,
 * so the naming belongs where the pair is built.
 *
 * The stats also carry a `key`, because four traces drop or rewrite them and
 * used to find them by their display text -- which pinned the wording in place:
 * improving a label would have turned those filters into silent no-ops.
 */

const SALES: LinePoint[][] = [[
  { x: 'Q1', y: 10 },
  { x: 'Q2', y: 30 },
  { x: 'Q3', y: 20 },
]];

/**
 * Reads a trace's description stats.
 *
 * @param layer - The layer to build from
 * @returns The stats the trace reports
 */
function statsOf(layer: MaidrLayer): DescriptionStat[] {
  return (TraceFactory.create(layer) as AbstractTrace).description.stats;
}

/**
 * The stat carrying a key, whatever it happens to be labelled.
 *
 * @param stats - The stats to search
 * @param key - The key to find
 * @returns The matching stat, or undefined
 */
function byKey(stats: DescriptionStat[], key: 'min' | 'max'): DescriptionStat | undefined {
  return stats.find(stat => stat.key === key);
}

describe('the extremes name the quantity they measure', () => {
  test('takes the noun from the axis the values were measured on', () => {
    const stats = statsOf({
      id: 'line',
      type: TraceType.LINE,
      title: 'Revenue',
      axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
      data: SALES,
    });

    expect(byKey(stats, 'min')?.label).toBe('Min Revenue');
    expect(byKey(stats, 'max')?.label).toBe('Max Revenue');
  });

  test('falls back to a plain noun rather than to an axis placeholder', () => {
    // `this.yAxis` answers `Y` for an unlabelled axis. "Min Y" names nothing
    // and reads as noise, so the fallback is the generic word -- a stat is
    // either specific or generic, never a placeholder.
    const stats = statsOf({
      id: 'line',
      type: TraceType.LINE,
      title: 'Revenue',
      axes: { x: { label: 'Quarter' } },
      data: SALES,
    });

    expect(byKey(stats, 'min')?.label).toBe('Min value');
    expect(byKey(stats, 'max')?.label).toBe('Max value');
  });

  test('a heatmap names its cell axis, not the axes it is gridded by', () => {
    // The extremes are over the cell values, which sit on z. Named for x or y
    // they would claim to describe the grid.
    const stats = statsOf({
      id: 'heat',
      type: TraceType.HEATMAP,
      title: 'Scores',
      axes: { x: { label: 'Task' }, y: { label: 'Model' }, z: { label: 'Score' } },
      data: { x: ['Task A', 'Task B'], y: ['PM', 'AM'], points: [[1, 2], [3, 4]] },
    });

    expect(byKey(stats, 'min')?.label).toBe('Min Score');
    expect(byKey(stats, 'max')?.label).toBe('Max Score');
  });

  test('names the axis the magnitudes actually run along, either way round', () => {
    // A horizontal bar puts its categories on y and its magnitudes on x; a
    // vertical one is the other way about. Each layer below is shaped for its
    // own orientation, and the two carry different labels on the magnitude
    // axis -- so a noun taken from a fixed axis would get one of them wrong.
    const horizontal = statsOf({
      id: 'bar-h',
      type: TraceType.BAR,
      title: 'Sales',
      axes: { x: { label: 'Sales' }, y: { label: 'Region' } },
      orientation: Orientation.HORIZONTAL,
      data: [{ x: 10, y: 'North' }, { x: 30, y: 'South' }],
    });
    const vertical = statsOf({
      id: 'bar-v',
      type: TraceType.BAR,
      title: 'Headcount',
      axes: { x: { label: 'Region' }, y: { label: 'Headcount' } },
      orientation: Orientation.VERTICAL,
      data: [{ x: 'North', y: 10 }, { x: 'South', y: 30 }],
    });

    expect(byKey(horizontal, 'min')?.label).toBe('Min Sales');
    expect(byKey(vertical, 'min')?.label).toBe('Min Headcount');
  });
});

describe('a trace that drops the extremes finds them by key, not by wording', () => {
  test('a bump chart drops them however they are labelled', () => {
    // A bump chart's y is a rank: reporting its extremes as values invites the
    // reading that rank 3 is three times rank 1. The filter has to keep
    // working when the label names the axis.
    const stats = statsOf({
      id: 'bump',
      type: TraceType.BUMP,
      title: 'Standings',
      axes: { x: { label: 'Round' }, y: { label: 'Position' } },
      data: [
        [{ x: 'R1', y: 1 }, { x: 'R2', y: 2 }],
        [{ x: 'R1', y: 2 }, { x: 'R2', y: 1 }],
      ],
    });

    expect(byKey(stats, 'min')).toBeUndefined();
    expect(byKey(stats, 'max')).toBeUndefined();
    // And nothing was dropped by matching a label that merely looks similar.
    expect(stats.length).toBeGreaterThan(0);
  });
});
