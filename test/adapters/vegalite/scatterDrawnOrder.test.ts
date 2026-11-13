/**
 * A Vega-Lite scatter is read in the order its marks are drawn, wherever it
 * sits.
 *
 * A scatter's points are paired with its marks one to one, in order. An
 * `order` channel draws the marks sorted, while the table they come from
 * keeps the rows' own order, and a single view, a repeated cell and a facet's
 * panel were read from the table: every point was outlined on another, 8 of
 * 8 on a single view of iris-like rows, 6 of 8 in a facet and 16 of 16 in a
 * repeat.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import { colourGroupPlaces, vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';

const ROWS = [
  { panel: 'A', species: 'versicolor', length: 7.0, width: 3.2 },
  { panel: 'B', species: 'setosa', length: 5.1, width: 3.5 },
  { panel: 'A', species: 'virginica', length: 6.3, width: 3.3 },
  { panel: 'A', species: 'setosa', length: 4.9, width: 3.0 },
  { panel: 'B', species: 'versicolor', length: 6.4, width: 2.9 },
];
const LENGTH = { field: 'length', type: 'quantitative' };
const WIDTH = { field: 'width', type: 'quantitative' };
const SPECIES = { field: 'species', type: 'nominal' };
const BY_WIDTH = { field: 'width', type: 'quantitative' };

/**
 * The rows in the order vega-lite 5.23.0 and vega 5.33.1 draw their marks,
 * sorted by width, measured on these specs.
 * @param positions - The rows' indices, in drawn order
 * @returns The rows
 */
function drawn(...positions: number[]): Array<Record<string, unknown>> {
  return positions.map(k => ROWS[k]);
}

/**
 * A mark of the drawn scenegraph, one item per row.
 * @param name - Its name
 * @param rows - The rows its items are drawn from, in drawn order
 * @returns The mark
 */
function mark(name: string, rows: Array<Record<string, unknown>>): Record<string, unknown> {
  return { marktype: 'symbol', name, items: rows.map(datum => ({ datum })) };
}

/**
 * A compiled view: its tables by name, and a group of the drawn scenegraph
 * whose items each draw some marks, as a repeat's cell or a facet's `cell`
 * group does.
 * @param tables - Its tables, as `view.data()` answers them
 * @param group - The group's name
 * @param items - Each item's row, if any, and the marks it draws
 * @returns The view
 */
function compiled(
  tables: Record<string, unknown[]>,
  group: string,
  items: Array<{ datum?: Record<string, unknown>; marks: Array<Record<string, unknown>> }>,
): VegaView {
  const root = {
    marktype: 'group',
    name: 'root',
    items: [{ items: [{ marktype: 'group', name: group, items: items.map(item => ({ datum: item.datum, items: item.marks })) }] }],
  };
  return {
    data: (name: string) => {
      if (!(name in tables))
        throw new Error(`no dataset ${name}`);
      return tables[name];
    },
    scale: (name: string) => {
      if (name !== 'color')
        throw new Error(`Unrecognized scale or projection: ${name}`);
      return { domain: () => ['setosa', 'versicolor', 'virginica'] };
    },
    scenegraph: () => ({ root }),
    container: () => null,
    runAsync: async (): Promise<unknown> => undefined,
  } as unknown as VegaView;
}

/**
 * The points of a layer, as x and y.
 * @param layer - The layer
 * @returns Its points
 */
function pointsOf(layer: MaidrLayer): Array<[number, number]> {
  return (layer.data as ScatterPoint[]).map(point => [point.x, point.y]);
}

/**
 * Each layer's name, points and places among its mark's elements.
 * @param layers - The layers
 * @returns Them, read
 */
function read(layers: MaidrLayer[]): Array<[string | undefined, Array<[number, number]>, readonly number[] | undefined]> {
  return layers.map(layer => [layer.name, pointsOf(layer), colourGroupPlaces(layer)?.positions]);
}

describe('a vega-lite scatter drawn in the order of a channel', () => {
  it('reads a single view in the order its marks are drawn', () => {
    const view = compiled(
      { source_0: ROWS, data_0: ROWS, marks: drawn(4, 3, 0, 2, 1).map(datum => ({ datum })) },
      'none',
      [],
    );
    const spec = { data: { values: ROWS }, mark: 'point', encoding: { x: LENGTH, y: WIDTH, color: SPECIES, order: BY_WIDTH } };

    const layers = vegaLiteToMaidr(spec as VegaLiteSpec, view).subplots[0][0].layers;

    // Before: setosa's points in the table's order, at its rows' places there,
    // [1, 3], which the drawn marks hold a setosa and a versicolor at.
    expect(read(layers)).toEqual([
      ['setosa', [[4.9, 3.0], [5.1, 3.5]], [1, 4]],
      ['versicolor', [[6.4, 2.9], [7.0, 3.2]], [0, 2]],
      ['virginica', [[6.3, 3.3]], [3]],
    ]);
  });

  it('reads a single view of one colour in the order its marks are drawn', () => {
    const view = compiled({ source_0: ROWS, data_0: ROWS, marks: drawn(4, 3, 0, 2, 1).map(datum => ({ datum })) }, 'none', []);
    const spec = { data: { values: ROWS }, mark: 'point', encoding: { x: LENGTH, y: WIDTH, order: BY_WIDTH } };

    const [cloud] = vegaLiteToMaidr(spec as VegaLiteSpec, view).subplots[0][0].layers;

    // Its selector names every mark in drawn order, the n-th the n-th point's.
    expect(pointsOf(cloud)).toEqual([[6.4, 2.9], [4.9, 3.0], [7.0, 3.2], [6.3, 3.3], [5.1, 3.5]]);
  });

  it('reads a repeated cell in the order its marks are drawn', () => {
    const view = compiled(
      { source_0: ROWS, data_0: ROWS },
      'child__column_length_group',
      [{ marks: [mark('child__column_length_marks', drawn(4, 3, 0, 2, 1))] }],
    );
    const spec = {
      data: { values: ROWS },
      repeat: { column: ['length'] },
      spec: { mark: 'point', encoding: { x: { field: { repeat: 'column' }, type: 'quantitative' }, y: WIDTH, color: SPECIES, order: BY_WIDTH } },
    };

    const layers = vegaLiteToMaidr(spec as unknown as VegaLiteSpec, view).subplots[0][0].layers;

    expect(read(layers)).toEqual([
      ['setosa', [[4.9, 3.0], [5.1, 3.5]], [1, 4]],
      ['versicolor', [[6.4, 2.9], [7.0, 3.2]], [0, 2]],
      ['virginica', [[6.3, 3.3]], [3]],
    ]);
  });

  it('reads each panel of a facet in the order its marks are drawn there', () => {
    const view = compiled(
      { source_0: ROWS, data_0: ROWS },
      'cell',
      [
        { datum: { panel: 'A', count: 3 }, marks: [mark('child_marks', drawn(3, 0, 2))] },
        { datum: { panel: 'B', count: 2 }, marks: [mark('child_marks', drawn(4, 1))] },
      ],
    );
    const spec = {
      data: { values: ROWS },
      facet: { column: { field: 'panel' } },
      spec: { mark: 'point', encoding: { x: LENGTH, y: WIDTH, color: SPECIES, order: BY_WIDTH } },
    };

    const [a, b] = vegaLiteToMaidr(spec as VegaLiteSpec, view).subplots[0];

    // Before: A's versicolor at the first place and its setosa at the third,
    // where A draws its setosa first.
    expect(read(a.layers)).toEqual([
      ['setosa', [[4.9, 3.0]], [0]],
      ['versicolor', [[7.0, 3.2]], [1]],
      ['virginica', [[6.3, 3.3]], [2]],
    ]);
    expect(read(b.layers)).toEqual([
      ['setosa', [[5.1, 3.5]], [1]],
      ['versicolor', [[6.4, 2.9]], [0]],
    ]);
  });

  it('reads a facet panel from its table where the marks drawn there lack a column it reads', () => {
    const widthless = (rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> =>
      rows.map(({ width: _width, ...row }) => row);
    const view = compiled(
      { source_0: ROWS, data_0: ROWS },
      'cell',
      [
        { datum: { panel: 'A', count: 3 }, marks: [mark('child_marks', widthless(drawn(3, 0, 2)))] },
        { datum: { panel: 'B', count: 2 }, marks: [mark('child_marks', widthless(drawn(4, 1)))] },
      ],
    );
    const spec = {
      data: { values: ROWS },
      facet: { column: { field: 'panel' } },
      spec: { mark: 'point', encoding: { x: LENGTH, y: WIDTH, color: SPECIES, order: BY_WIDTH } },
    };

    const [a] = vegaLiteToMaidr(spec as VegaLiteSpec, view).subplots[0];

    // A drawn row without the width is no point of this scatter, so A is read
    // from its table, in the rows' order: 0, 2, then 3.
    expect(read(a.layers)).toEqual([
      ['setosa', [[4.9, 3.0]], [2]],
      ['versicolor', [[7.0, 3.2]], [0]],
      ['virginica', [[6.3, 3.3]], [1]],
    ]);
  });
});
