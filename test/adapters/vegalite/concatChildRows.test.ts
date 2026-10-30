/**
 * A Vega-Lite concat child is read from the rows its marks are drawn from.
 *
 * A concat child's marks are drawn inside its group, out of `view.data()`'s
 * reach, so its rows were found by guessing its data pipeline's name from
 * its position. Where the children share the top-level data and each filters
 * it, vega-lite 5.23 names their pipelines `data_1`, `data_2`, `data_3` after
 * the shared `source_0`, so the guess for child i, `data_<i>`, was one short:
 * the first child was read from the unfiltered source and every other from
 * the child before it. Measured on vega 5.33 in Chromium: three panels
 * filtered to a, b and c read all six rows, then a's, then b's.
 *
 * The view below imitates that compiled view: its datasets are named as
 * vega-lite names them, and its scenegraph holds each child's drawn marks.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { Maidr } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';

const ROWS = ['a', 'b', 'c'].flatMap(g =>
  [1, 2].map(x => ({ g, x, v: { a: 1, b: 10, c: 100 }[g as 'a' | 'b' | 'c'] * x })));

/**
 * The rows one group keeps.
 * @param g - The group
 * @returns Its rows
 */
function only(g: string): typeof ROWS {
  return ROWS.filter(row => row.g === g);
}

/**
 * A bar chart of one group, filtered out of the shared data.
 * @param g - The group
 * @returns The child spec
 */
function child(g: string): Record<string, unknown> {
  return {
    transform: [{ filter: `datum.g == '${g}'` }],
    mark: 'bar',
    encoding: { x: { field: 'x', type: 'ordinal' }, y: { field: 'v', type: 'quantitative' } },
  };
}

/**
 * A drawn mark of the scenegraph, one item per row.
 * @param name - The mark's name
 * @param rows - The rows its items are drawn from
 * @returns The mark
 */
function mark(name: string, rows: Array<Record<string, unknown>>): Record<string, unknown> {
  return { marktype: 'rect', name, items: rows.map(datum => ({ datum })) };
}

/**
 * A group mark holding other marks.
 * @param name - The group's name
 * @param marks - The marks inside it
 * @returns The group mark
 */
function group(name: string, marks: Array<Record<string, unknown>>): Record<string, unknown> {
  return { marktype: 'group', name, items: [{ items: marks }] };
}

/**
 * A compiled view of three concatenated charts sharing the top-level data.
 * @param withScene - Whether the view exposes its scenegraph
 * @returns The view
 */
function view(withScene = true): VegaView {
  const datasets: Record<string, Array<Record<string, unknown>>> = {
    source_0: ROWS,
    data_1: only('a'),
    data_2: only('b'),
    data_3: only('c'),
  };
  const root = group('root', ['a', 'b', 'c'].map((g, i) =>
    group(`concat_${i}_group`, [mark(`concat_${i}_marks`, only(g))])));
  return {
    data: (name: string) => {
      if (!datasets[name])
        throw new Error(`no dataset ${name}`);
      return datasets[name];
    },
    container: () => null,
    runAsync: async (): Promise<unknown> => undefined,
    scale: () => undefined,
    ...(withScene ? { scenegraph: () => ({ root }) } : {}),
  } as unknown as VegaView;
}

/**
 * Each panel's bar heights, row by row of the grid.
 * @param maidr - The converted chart
 * @returns The heights
 */
function heights(maidr: Maidr): number[][] {
  return maidr.subplots.flat().map(subplot => (subplot.layers[0].data as Array<{ y: number }>).map(bar => bar.y));
}

const SPEC = { data: { values: ROWS }, vconcat: ['a', 'b', 'c'].map(child) } as unknown as VegaLiteSpec;

describe('vega-lite concat children filtering the shared data', () => {
  it('reads each child from the rows its marks are drawn from', () => {
    const maidr = vegaLiteToMaidr(SPEC, view());

    // Before the fix: [1, 2, 10, 20, 100, 200], then [1, 2], then [10, 20].
    expect(heights(maidr)).toEqual([[1, 2], [10, 20], [100, 200]]);
  });

  it('reads a layered child\'s layers from their own drawn marks', () => {
    const layered = {
      transform: [{ filter: 'datum.g == \'b\'' }],
      layer: [
        { mark: 'bar', encoding: { x: { field: 'x', type: 'ordinal' }, y: { field: 'v', type: 'quantitative' } } },
      ],
    };
    const base = view();
    const root = group('root', [
      group('concat_0_group', [mark('concat_0_marks', only('a'))]),
      group('concat_1_group', [mark('concat_1_layer_0_marks', only('b'))]),
    ]);

    const maidr = vegaLiteToMaidr(
      { data: { values: ROWS }, hconcat: [child('a'), layered] } as unknown as VegaLiteSpec,
      { ...base, scenegraph: () => ({ root }) } as VegaView,
    );

    expect(heights(maidr)).toEqual([[1, 2], [10, 20]]);
  });

  it('reads a nested child from its own drawn marks', () => {
    const base = view();
    const root = group('root', [
      group('concat_0_group', [
        group('concat_0_concat_0_group', [mark('concat_0_concat_0_marks', only('a'))]),
        group('concat_0_concat_1_group', [mark('concat_0_concat_1_marks', only('b'))]),
      ]),
      group('concat_1_group', [mark('concat_1_marks', only('c'))]),
    ]);

    const maidr = vegaLiteToMaidr(
      { data: { values: ROWS }, vconcat: [{ hconcat: [child('a'), child('b')] }, child('c')] } as unknown as VegaLiteSpec,
      { ...base, scenegraph: () => ({ root }) } as VegaView,
    );

    expect(heights(maidr)).toEqual([[1, 2], [10, 20], [100, 200]]);
  });

  it('falls back to the datasets when the view has no scenegraph', () => {
    const maidr = vegaLiteToMaidr(SPEC, view(false));

    expect(heights(maidr)).toHaveLength(3);
  });
});
