/**
 * A Recharts `normalized_bar` carries shares, not counts (#963).
 *
 * `chartType: 'normalized_bar'` maps to `TraceType.NORMALIZED`, and the core
 * does not divide anything itself — fed the same payload, `NORMALIZED` and
 * `STACKED` announce identically. So a 100% chart was sonified with its raw
 * counts: a category of 1 and 1 next to one of 300 and 100 pitched a 300-fold
 * rise where the bars draw half a column against three quarters of one.
 *
 * Recharts normalises at render time under `stackOffset="expand"`, so raw
 * values are the ordinary thing for an author to hand over. Dividing is safe
 * whichever they supplied, because it is idempotent in proportion — that is
 * what the last case here pins.
 *
 * The Highcharts adapter has always done this, reading Highcharts' own
 * `point.percentage`, which is why the shares are percentages rather than
 * fractions.
 */
import type { RechartsAdapterConfig } from '@adapters/recharts/types';
import type { SegmentedPoint } from '@type/grammar';
import { convertRechartsToMaidr } from '@adapters/recharts/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

/**
 * The series of a normalized bar layer built from two value columns.
 * @param rows - One object per category
 * @param chartType - The declared type, so the stacked control can reuse this
 * @returns The emitted `SegmentedPoint[][]`
 */
function seriesOf(
  rows: Record<string, unknown>[],
  chartType = 'normalized_bar',
): SegmentedPoint[][] {
  const layer = convertRechartsToMaidr({
    id: 'n',
    title: 'Share of responses',
    data: rows,
    chartType,
    xKey: 'q',
    yKeys: ['a', 'b'],
    fillKeys: ['A', 'B'],
    xLabel: 'Quarter',
    yLabel: 'Share',
  } as RechartsAdapterConfig).subplots[0][0].layers[0];
  return layer.data as SegmentedPoint[][];
}

/** Values differing in count and in share, so the two cannot be confused. */
const UNEVEN = [
  { q: 'Q1', a: 1, b: 1 },
  { q: 'Q2', a: 300, b: 100 },
];

describe('a normalized bar layer', () => {
  it('divides each category by its own total', () => {
    // Q1 is 50/50 and Q2 is 75/25. Before the fix these were 1, 300, 1, 100.
    const [first, second] = seriesOf(UNEVEN);

    expect(first.map(point => point.y)).toEqual([50, 75]);
    expect(second.map(point => point.y)).toEqual([50, 25]);
  });

  it('makes every category sum to 100', () => {
    const series = seriesOf(UNEVEN);

    const totals = series[0].map(
      (_, row) => series.reduce((sum, band) => sum + Number(band[row].y), 0),
    );
    expect(totals).toEqual([100, 100]);
  });

  it('keeps its trace type and its band names', () => {
    const [first, second] = seriesOf(UNEVEN);

    expect(first[0].z).toBe('A');
    expect(second[0].z).toBe('B');
  });

  it('leaves values already given as shares where they are', () => {
    // Dividing is idempotent in proportion, which is what makes the fix safe
    // without knowing whether the author pre-divided: 25 and 75 come back as
    // 25 and 75, only now guaranteed to be against a total of 100.
    const [first, second] = seriesOf([{ q: 'Q1', a: 25, b: 75 }]);

    expect(first[0].y).toBe(25);
    expect(second[0].y).toBe(75);
  });

  it('leaves a category of nothing alone rather than dividing by zero', () => {
    // A zero total has no share to report, and `0 / 0` would reach the trace
    // as `NaN` — which it reads as a gap, not as an empty category.
    const [first, second] = seriesOf([{ q: 'Q1', a: 0, b: 0 }]);

    expect(first[0].y).toBe(0);
    expect(second[0].y).toBe(0);
  });
});

describe('a plain stacked bar layer is untouched', () => {
  it('keeps the counts it was given', () => {
    const [first, second] = seriesOf(UNEVEN, 'stacked_bar');

    expect(first.map(point => point.y)).toEqual([1, 300]);
    expect(second.map(point => point.y)).toEqual([1, 100]);
  });

  it('is still a stacked layer', () => {
    const layer = convertRechartsToMaidr({
      id: 'n',
      title: 's',
      data: UNEVEN,
      chartType: 'stacked_bar',
      xKey: 'q',
      yKeys: ['a', 'b'],
      fillKeys: ['A', 'B'],
    } as RechartsAdapterConfig).subplots[0][0].layers[0];

    expect(layer.type).toBe(TraceType.STACKED);
  });
});
