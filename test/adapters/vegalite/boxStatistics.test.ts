/**
 * A Vega-Lite box plot announces the statistics the chart draws.
 *
 * Vega-Lite compiles `mark: 'boxplot'` into several tables, and for the
 * default (Tukey) extent no one of them carries every statistic: the
 * joinaggregate stage holds the raw rows with only `lower_box_*` and
 * `upper_box_*`, while the median and the whisker ends sit in tables of their
 * own. A spec with inline data resolved to its raw `source_0` and was
 * computed from the values; Altair names its dataset, so there is no
 * `source_0`, the name guess landed on the joinaggregate table, and that was
 * read as if it held every statistic: every median 0, the whisker ends equal
 * to the quartiles, and every value outside the box an outlier.
 *
 * Datasets below are laid out the way vega-lite 5.23 compiles an Altair box
 * plot (measured on py-maidr's example_altair_box page):
 *
 *   data-<hash>  raw rows
 *   data_1       raw rows + lower_box_v, upper_box_v      (joinaggregate)
 *   data_2       the outlier rows
 *   data_3       lower_whisker_v, upper_whisker_v, lower_box_v, upper_box_v
 *   data_6       lower_box_v, upper_box_v, mid_box_v, min_v, max_v
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { BoxPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';

/**
 * Two groups with a fractional outlier each. By hand (linear interpolation
 * between closest ranks, which is what Vega's quartiles use):
 *
 *   a: 10 20 30 40 50 60 70 | 200.4    q1 27.5  median 45   q3 62.5
 *      fences -25 and 115, whiskers 10 and 70, upper outlier 200.4
 *   b: -10.3 | 5 6 7 8 9               q1 5.25  median 6.5  q3 7.75
 *      fences 1.5 and 11.5, whiskers 5 and 9, lower outlier -10.3
 */
const RAW = [
  ...[10, 20, 30, 40, 50, 60, 70, 200.4].map(v => ({ g: 'a', v })),
  ...[-10.3, 5, 6, 7, 8, 9].map(v => ({ g: 'b', v })),
];

const EXPECTED: BoxPoint[] = [
  { z: 'a', lowerOutliers: [], min: 10, q1: 27.5, q2: 45, q3: 62.5, max: 70, upperOutliers: [200.4] },
  { z: 'b', lowerOutliers: [-10.3], min: 5, q1: 5.25, q2: 6.5, q3: 7.75, max: 9, upperOutliers: [] },
];

const BOX = { a: { q1: 27.5, q3: 62.5 }, b: { q1: 5.25, q3: 7.75 } };

/** An Altair box plot: its data named rather than inline. */
const ALTAIR_SPEC = {
  data: { name: 'data-3a191f69' },
  mark: { type: 'boxplot' },
  encoding: {
    x: { field: 'g', type: 'nominal' },
    y: { field: 'v', type: 'quantitative' },
  },
} as unknown as VegaLiteSpec;

/**
 * A compiled view holding the tables vega-lite builds for that spec.
 * @param tables - Dataset name to rows
 * @returns The stub view
 */
function viewWith(tables: Record<string, Record<string, unknown>[]>): VegaView {
  return {
    data: (name: string) => {
      if (!(name in tables))
        throw new Error(`Unrecognized data set: ${name}`);
      return tables[name];
    },
    getState: () => ({ data: Object.fromEntries(Object.keys(tables).map(name => [name, {}])) }),
    scale: () => {
      throw new Error('no scales');
    },
  } as unknown as VegaView;
}

/** The tables of an Altair box plot of `RAW`. */
function altairTables(): Record<string, Record<string, unknown>[]> {
  const boxOf = (g: string): { q1: number; q3: number } => BOX[g as 'a' | 'b'];
  return {
    'data-3a191f69': RAW,
    'data_1': RAW.map(row => ({ ...row, lower_box_v: boxOf(row.g).q1, upper_box_v: boxOf(row.g).q3 })),
    'data_2': [{ g: 'a', v: 200.4 }, { g: 'b', v: -10.3 }],
    'data_3': EXPECTED.map(p => ({ g: p.z, lower_whisker_v: p.min, upper_whisker_v: p.max, lower_box_v: p.q1, upper_box_v: p.q3 })),
    'data_6': EXPECTED.map(p => ({ g: p.z, lower_box_v: p.q1, upper_box_v: p.q3, mid_box_v: p.q2, min_v: -10.3, max_v: 200.4 })),
  };
}

describe('a vega-lite box plot whose data is named, as Altair names it', () => {
  it('announces the median and the whisker ends the chart draws', () => {
    const maidr = vegaLiteToMaidr(ALTAIR_SPEC, viewWith(altairTables()));

    const boxes = maidr.subplots[0][0].layers[0].data as BoxPoint[];

    // Before the fix: q2 0, min = q1 and max = q3 for both boxes, and every
    // value outside the box an outlier.
    expect(boxes).toEqual(EXPECTED);
  });
});

describe('a vega-lite box plot with a table carrying every statistic', () => {
  it('still reads that table as computed', () => {
    // `extent: 'min-max'` compiles to one table with all five columns.
    const full = [
      { g: 'a', lower_box_v: 27.5, upper_box_v: 62.5, mid_box_v: 45, lower_whisker_v: 10, upper_whisker_v: 200.4 },
    ];
    const spec = {
      ...ALTAIR_SPEC,
      mark: { type: 'boxplot', extent: 'min-max' },
    } as unknown as VegaLiteSpec;

    const maidr = vegaLiteToMaidr(spec, viewWith({ data_0: full }));

    expect(maidr.subplots[0][0].layers[0].data).toEqual([
      { z: 'a', lowerOutliers: [], min: 10, q1: 27.5, q2: 45, q3: 62.5, max: 200.4, upperOutliers: [] },
    ]);
  });
});
