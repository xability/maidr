/**
 * Each child of a concatenated Vega-Lite spec reads its own data.
 *
 * A concat child's mark datasets are scoped to its group, so `view.data()`
 * cannot reach them, and the child's rows were found by guessing pipeline
 * names from its position: `data_<i>` for the i-th child. That works while
 * every child compiles to one table, as a bar or a scatter does. A box plot
 * compiles to eight, so in an hconcat of two box plots the second child's
 * guess, `data_1`, is the first child's joinaggregate table: the 'Product
 * Ratings' panel of the gallery example was read as one unnamed box of
 * zeros, with no highlight.
 *
 * The datasets below are the ones vega-lite 5.23 compiles for the gallery's
 * two box plots (`examples/vegalite-hconcat-box.html`), cut down to a few
 * rows each.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { BarPoint, BoxPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { afterAll, describe, expect, it, jest } from '@jest/globals';

// The resolver warns on purpose when a child's rows cannot be found.
const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
afterAll(() => warn.mockRestore());

const SCORES = [
  { group: 'A', score: 60 },
  { group: 'A', score: 70 },
  { group: 'A', score: 80 },
  { group: 'B', score: 65 },
  { group: 'B', score: 70 },
  { group: 'B', score: 75 },
];

const RATINGS = [
  { category: 'X', rating: 3.5 },
  { category: 'X', rating: 4 },
  { category: 'X', rating: 4.5 },
  { category: 'Y', rating: 4 },
  { category: 'Y', rating: 4.5 },
  { category: 'Y', rating: 5 },
  { category: 'Z', rating: 2.5 },
  { category: 'Z', rating: 3 },
  { category: 'Z', rating: 3.5 },
];

const SPEC = {
  hconcat: [
    {
      data: { values: SCORES },
      mark: 'boxplot',
      encoding: {
        x: { field: 'group', type: 'nominal' },
        y: { field: 'score', type: 'quantitative' },
      },
    },
    {
      data: { values: RATINGS },
      mark: 'boxplot',
      encoding: {
        x: { field: 'category', type: 'nominal' },
        y: { field: 'rating', type: 'quantitative' },
      },
    },
  ],
} as unknown as VegaLiteSpec;

/**
 * The tables of the compiled spec: each child's raw source, then its box
 * plot pipeline. Only the shapes matter here, so the statistics columns are
 * left out of all but the joinaggregate tables.
 */
const DATASETS: Record<string, Record<string, unknown>[]> = {
  source_0: SCORES,
  source_1: RATINGS,
  data_1: SCORES.map(row => ({ ...row, lower_box_score: 65, upper_box_score: 75 })),
  data_2: [],
  data_3: [{ group: 'A', lower_whisker_score: 60, upper_whisker_score: 80 }],
  data_10: RATINGS.map(row => ({ ...row, lower_box_rating: 3.5, upper_box_rating: 4.5 })),
  data_12: [{ category: 'X', lower_whisker_rating: 3.5, upper_whisker_rating: 4.5 }],
};

/**
 * A compiled view holding the given tables, enumerable through `getState`
 * in the order vega registers them.
 * @param datasets - Dataset name to rows
 * @returns The stub view
 */
function viewWith(datasets: Record<string, Record<string, unknown>[]>): VegaView {
  return {
    data: (name: string) => {
      if (!(name in datasets))
        throw new Error(`Unrecognized data set: ${name}`);
      return datasets[name];
    },
    getState: () => ({ data: Object.fromEntries(Object.keys(datasets).map(name => [name, {}])) }),
    scale: () => {
      throw new Error('no scales');
    },
  } as unknown as VegaView;
}

describe('an hconcat of two vega-lite box plots, with its compiled view', () => {
  it('reads the second panel from its own data', () => {
    const maidr = vegaLiteToMaidr(SPEC, viewWith(DATASETS));

    const panel = maidr.subplots[0][1].layers[0].data as BoxPoint[];

    // Before the fix: [{ z: '', min: 0, q1: 0, q2: 0, q3: 0, max: 0 }], from
    // the first panel's joinaggregate table, which has no `category`.
    expect(panel.map(box => box.z)).toEqual(['X', 'Y', 'Z']);
    expect(panel.map(box => box.q2)).toEqual([4, 4.5, 3]);
  });

  it('still reads the first panel from its own data', () => {
    const maidr = vegaLiteToMaidr(SPEC, viewWith(DATASETS));

    const panel = maidr.subplots[0][0].layers[0].data as BoxPoint[];

    expect(panel.map(box => box.z)).toEqual(['A', 'B']);
    expect(panel.map(box => box.q2)).toEqual([70, 70]);
  });
});

describe('an hconcat whose children each compile to one table', () => {
  it('keeps reading each child from its own table', () => {
    // Bars and points compile to one `data_<i>` per child, which is what the
    // guess was written for; requiring the child's columns must not move it.
    const spec = {
      hconcat: [
        {
          data: { values: [{ a: 'A', b: 1 }, { a: 'B', b: 2 }] },
          mark: 'bar',
          encoding: { x: { field: 'a', type: 'nominal' }, y: { field: 'b', type: 'quantitative' } },
        },
        {
          data: { values: [{ c: 'X', d: 10 }, { c: 'Y', d: 20 }] },
          mark: 'bar',
          encoding: { x: { field: 'c', type: 'nominal' }, y: { aggregate: 'sum', field: 'd', type: 'quantitative' } },
        },
      ],
    } as unknown as VegaLiteSpec;
    const view = viewWith({
      source_0: [{ a: 'A', b: 1 }, { a: 'B', b: 2 }],
      source_1: [{ c: 'X', d: 10 }, { c: 'Y', d: 20 }],
      data_0: [{ a: 'A', b: 1, b_start: 0, b_end: 1 }, { a: 'B', b: 2, b_start: 0, b_end: 2 }],
      data_1: [{ c: 'X', sum_d: 10 }, { c: 'Y', sum_d: 20 }],
    });

    const maidr = vegaLiteToMaidr(spec, view);

    expect(maidr.subplots[0][0].layers[0].data).toEqual([{ x: 'A', y: 1 }, { x: 'B', y: 2 }]);
    // An aggregated channel reads a column Vega-Lite renamed (`sum_d`), so it
    // is not one the rows have to carry under its own name.
    expect((maidr.subplots[0][1].layers[0].data as BarPoint[]).map(bar => bar.y)).toEqual([10, 20]);
  });
});

describe('an hconcat child no compiled table carries the columns of', () => {
  it('falls back to the child\'s own inline rows, as an unresolved layer always has', () => {
    const spec = {
      hconcat: [
        {
          data: { values: [{ a: 'A', b: 1 }, { a: 'B', b: 2 }] },
          mark: 'bar',
          encoding: { x: { field: 'a', type: 'nominal' }, y: { field: 'b', type: 'quantitative' } },
        },
        {
          data: { values: [{ c: 'X', d: 10 }, { c: 'Y', d: 20 }] },
          mark: 'bar',
          encoding: { x: { field: 'c', type: 'nominal' }, y: { field: 'd', type: 'quantitative' } },
        },
      ],
    } as unknown as VegaLiteSpec;
    // Only the first child's table is reachable.
    const view = viewWith({ data_0: [{ a: 'A', b: 1 }, { a: 'B', b: 2 }] });

    const maidr = vegaLiteToMaidr(spec, view);

    // Before the fix the guesses fell through to `data_0`, the first child's
    // table, and the second panel was read from it as bars named "".
    expect(maidr.subplots[0][1].layers[0].data).toEqual([{ x: 'X', y: 10 }, { x: 'Y', y: 20 }]);
  });
});

describe('an hconcat child whose named data no compiled table carries', () => {
  it('still says its rows could not be resolved', () => {
    warn.mockClear();
    const spec = {
      hconcat: [
        {
          data: { values: [{ a: 'A', b: 1 }] },
          mark: 'bar',
          encoding: { x: { field: 'a', type: 'nominal' }, y: { field: 'b', type: 'quantitative' } },
        },
        {
          data: { name: 'ratings' },
          mark: 'bar',
          encoding: { x: { field: 'c', type: 'nominal' }, y: { field: 'd', type: 'quantitative' } },
        },
      ],
    } as unknown as VegaLiteSpec;

    const maidr = vegaLiteToMaidr(spec, viewWith({ data_0: [{ a: 'A', b: 1 }] }));

    // No inline rows to fall back to: nothing is read, and the warning that
    // always marked an unresolved layer is given rather than another
    // child's table read in its place.
    expect(maidr.subplots[0][1]?.layers[0]?.data ?? []).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not resolve dataset for layer index 1'));
  });
});
