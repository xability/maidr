/**
 * A Vega-Lite scatter coloured by a nominal or ordinal field is read as one
 * layer per colour group, in the order the legend lists them, each named as
 * the legend names it.
 *
 * Read as one layer, the groups could not be told apart: py-maidr's Altair
 * iris scatter, coloured by species under a legend titled "Species", was
 * announced as one cloud of 150 points ("Sepal Length (cm) is 4.4, Sepal
 * Width (cm) are 2.9, 3, 3.2"), no species was ever said, and PageUp found
 * "No additional layer".
 */
import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { Maidr, MaidrLayer, ScatterPoint } from '@type/grammar';
import { colourGroupPlaces, vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { afterAll, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { makeView } from './fixtures/testView';

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

const IRIS = [
  { species: 'versicolor', length: 7.0, width: 3.2 },
  { species: 'setosa', length: 5.1, width: 3.5 },
  { species: 'virginica', length: 6.3, width: 3.3 },
  { species: 'setosa', length: 4.9, width: 3.0 },
  { species: 'versicolor', length: 6.4, width: 3.2 },
];
const LENGTH = { field: 'length', type: 'quantitative', title: 'Sepal Length (cm)' };
const WIDTH = { field: 'width', type: 'quantitative', title: 'Sepal Width (cm)' };
const SPECIES = { field: 'species', type: 'nominal', title: 'Species' };
const POINTS = { mark: 'point', encoding: { x: LENGTH, y: WIDTH, color: SPECIES } };
const REPEATED = { mark: 'point', encoding: { x: { field: { repeat: 'column' }, type: 'quantitative' }, y: WIDTH, color: SPECIES } };
const MEAN_RULE = { mark: 'rule', encoding: { y: { aggregate: 'mean', field: 'width', type: 'quantitative' } } };
const PANELLED = IRIS.map((row, k) => ({ ...row, panel: ['A', 'B', 'A', 'A', 'B'][k] }));
/** The group a single view's point mark is drawn in, under either name it can have. */
const MARKS = 'g.mark-symbol.role-mark.marks, g.mark-symbol.role-mark.layer_0_marks';

/**
 * A point mark over the iris rows.
 * @param color - The colour channel, if any
 * @returns The spec
 */
function scatter(color?: Record<string, unknown>): Record<string, unknown> {
  return {
    data: { values: IRIS },
    mark: 'point',
    encoding: { x: LENGTH, y: WIDTH, ...(color ? { color } : {}) },
  };
}

/**
 * Every layer of a chart, panel by panel.
 * @param maidr - The converted chart
 * @returns Its layers
 */
function layersOf(maidr: Maidr): MaidrLayer[] {
  return maidr.subplots.flat().flatMap(subplot => subplot.layers);
}

/**
 * The points of a layer, as x and y.
 * @param layer - The layer
 * @returns Its points
 */
function pointsOf(layer: MaidrLayer): Array<[number, number]> {
  return (layer.data as ScatterPoint[]).map(point => [point.x, point.y]);
}

describe('a vega-lite scatter coloured by a field', () => {
  it('reads each colour group as a layer of its own, named as the legend names it', () => {
    const layers = layersOf(vegaLiteToMaidr(scatter(SPECIES) as VegaLiteSpec));

    // Before: one layer of all five points, with no name and no z axis.
    expect(layers.map(layer => layer.type)).toEqual([TraceType.SCATTER, TraceType.SCATTER, TraceType.SCATTER]);
    expect(layers.map(layer => layer.name)).toEqual(['versicolor', 'setosa', 'virginica']);
    expect(layers.map(pointsOf)).toEqual([
      [[7.0, 3.2], [6.4, 3.2]],
      [[5.1, 3.5], [4.9, 3.0]],
      [[6.3, 3.3]],
    ]);
    expect(layers.every(layer => layer.axes?.z?.label === 'Species')).toBe(true);
    expect(layers.map(layer => layer.id)).toEqual(['0', '0.1', '0.2']);
  });

  it('lists the groups in the order of the colour scale, as the legend does', () => {
    const view = makeView({ data_0: IRIS }, { color: ['setosa', 'versicolor', 'virginica'] });

    const layers = layersOf(vegaLiteToMaidr(scatter(SPECIES) as VegaLiteSpec, view));

    expect(layers.map(layer => layer.name)).toEqual(['setosa', 'versicolor', 'virginica']);
  });

  it('lists the groups the colour scale leaves out after those it lists, as their rows first name them', () => {
    const view = makeView({ data_0: IRIS }, { color: ['virginica'] });

    const layers = layersOf(vegaLiteToMaidr(scatter(SPECIES) as VegaLiteSpec, view));

    expect(layers.map(layer => layer.name)).toEqual(['virginica', 'versicolor', 'setosa']);
  });

  it('places each group\'s points among the elements of the mark\'s group, for the bind pass to mark', () => {
    const layers = layersOf(vegaLiteToMaidr(scatter(SPECIES) as VegaLiteSpec));

    // The mark draws row k as its group's k-th element: setosa's rows are the
    // second and fourth. The groups carry no selector until the bind pass has
    // marked their points; the cloud's would name every group's.
    expect(colourGroupPlaces(layers[1])).toEqual({ marks: MARKS, element: 'path', positions: [1, 3] });
    expect(layers.map(layer => layer.selectors)).toEqual([undefined, undefined, undefined]);
  });

  it('reads the rows the spec\'s own filter leaves, which are the rows the mark draws', () => {
    // As Vega-Lite 5.23 compiles the spec and Vega 5.33 runs it: the filter
    // runs in `data_0`, the table the mark is drawn from, and drops row 3,
    // the setosa point at 4.9 by 3.0.
    const kept = [IRIS[0], IRIS[1], IRIS[2], IRIS[4]];
    const view = makeView(
      { source_0: IRIS, data_0: kept, marks: kept.map(datum => ({ datum })) },
      { color: ['setosa', 'versicolor', 'virginica'] },
    );
    const spec = { ...scatter(SPECIES), transform: [{ filter: 'datum.length > 5' }] };

    const layers = layersOf(vegaLiteToMaidr(spec as VegaLiteSpec, view));

    expect(layers.map(layer => layer.name)).toEqual(['setosa', 'versicolor', 'virginica']);
    expect(layers.map(pointsOf)).toEqual([
      [[5.1, 3.5]],
      [[7.0, 3.2], [6.4, 3.2]],
      [[6.3, 3.3]],
    ]);
    // The places count the marks drawn: versicolor's second point is the
    // fourth, where the unfiltered rows would have made it the fifth.
    expect(colourGroupPlaces(layers[1])?.positions).toEqual([0, 3]);
  });

  it('counts the places of a facet panel\'s groups among that panel\'s marks', () => {
    const spec = {
      data: { values: PANELLED },
      facet: { column: { field: 'panel' } },
      spec: { mark: 'point', encoding: { x: LENGTH, y: WIDTH, color: SPECIES } },
    };

    const [a, b] = vegaLiteToMaidr(spec as VegaLiteSpec, undefined, { id: 'iris' }).subplots[0];

    // Without a view, each panel lists its groups as its rows first name them.
    expect(a.layers.map(layer => layer.name)).toEqual(['versicolor', 'virginica', 'setosa']);
    expect(b.layers.map(layer => layer.name)).toEqual(['setosa', 'versicolor']);
    // B's versicolor point is the second B draws, though the fifth row.
    expect(colourGroupPlaces(b.layers[1])).toEqual({
      marks: 'g[data-maidr-cell="iris-0-1"] g.mark-symbol.role-mark.child_marks, '
        + 'g[data-maidr-cell="iris-0-1"] g.mark-symbol.role-mark.child_layer_0_marks',
      element: 'path',
      positions: [1],
    });
  });

  it('reads an ordinal colour as groups too', () => {
    const layers = layersOf(vegaLiteToMaidr(scatter({ field: 'species', type: 'ordinal' }) as VegaLiteSpec));

    expect(layers).toHaveLength(3);
  });

  it.each([
    ['along a continuous scale', { field: 'width', type: 'quantitative' }],
    ['by one value only', { datum: 'all' }],
  ])('keeps a scatter coloured %s one layer', (_, color) => {
    const layers = layersOf(vegaLiteToMaidr(scatter(color) as VegaLiteSpec));

    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBeUndefined();
  });

  it('keeps a scatter whose rows are all of one group one layer', () => {
    const spec = { ...scatter(SPECIES), data: { values: IRIS.filter(row => row.species === 'setosa') } };

    expect(layersOf(vegaLiteToMaidr(spec as VegaLiteSpec))).toHaveLength(1);
  });

  it('keeps a scatter its spec declares one layer', () => {
    const spec = { ...scatter(SPECIES), usermeta: { maidr: { type: TraceType.SCATTER, name: 'Flowers' } } };

    const layers = layersOf(vegaLiteToMaidr(spec as VegaLiteSpec));

    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe('Flowers');
  });

  it('reads the groups in place of the scatter among a layered spec\'s layers', () => {
    const spec = {
      data: { values: IRIS },
      layer: [
        { mark: 'point', encoding: { x: LENGTH, y: WIDTH, color: SPECIES } },
        { mark: 'line', encoding: { x: LENGTH, y: WIDTH } },
      ],
    };

    const layers = layersOf(vegaLiteToMaidr(spec as VegaLiteSpec));

    expect(layers.map(layer => [layer.id, layer.type, layer.name])).toEqual([
      ['0', TraceType.SCATTER, 'versicolor'],
      ['0.1', TraceType.SCATTER, 'setosa'],
      ['0.2', TraceType.SCATTER, 'virginica'],
      ['1', TraceType.LINE, undefined],
    ]);
    expect(colourGroupPlaces(layers[1])).toEqual({ marks: 'g.mark-symbol.role-mark.layer_0_marks', element: 'path', positions: [1, 3] });
  });

  it('names a concat panel on its first group only', () => {
    const spec = { data: { values: IRIS }, hconcat: [{ title: 'Iris', ...scatter(SPECIES) }, { ...scatter() }] };

    const [first] = vegaLiteToMaidr(spec as VegaLiteSpec).subplots[0];

    expect(first.layers.map(layer => [layer.id, layer.title, layer.name])).toEqual([
      ['0_0', 'Iris', 'versicolor'],
      ['0_0.1', undefined, 'setosa'],
      ['0_0.2', undefined, 'virginica'],
    ]);
    expect(colourGroupPlaces(first.layers[2])).toEqual({
      marks: 'g.mark-symbol.role-mark.concat_0_marks, g.mark-symbol.role-mark.concat_0_layer_0_marks',
      element: 'path',
      positions: [2],
    });
  });

  // The groups are handed from the scatter's layer to `buildMaidr` by the
  // layer itself, which every composite numbers and names in place: a copy
  // made on the way would read the scatter as one cloud again.
  it.each([
    [
      'a repeat',
      { data: { values: IRIS }, repeat: { column: ['length', 'width'] }, spec: REPEATED },
      [['versicolor', 'setosa', 'virginica'], ['versicolor', 'setosa', 'virginica']],
    ],
    [
      'a layered concat child',
      { hconcat: [{ data: { values: IRIS }, layer: [POINTS, MEAN_RULE] }, scatter()] },
      [['versicolor', 'setosa', 'virginica'], [undefined]],
    ],
    [
      'a facet of a layered spec',
      { data: { values: PANELLED }, facet: { column: { field: 'panel' } }, spec: { layer: [POINTS, MEAN_RULE] } },
      [['versicolor', 'virginica', 'setosa'], ['setosa', 'versicolor']],
    ],
    [
      'a repeat of a layered spec',
      { data: { values: IRIS }, repeat: { column: ['length', 'width'] }, spec: { layer: [REPEATED, MEAN_RULE] } },
      [['versicolor', 'setosa', 'virginica'], ['versicolor', 'setosa', 'virginica']],
    ],
    [
      'a nested layer of a concat child',
      { hconcat: [{ data: { values: IRIS }, layer: [{ layer: [POINTS] }, MEAN_RULE] }, scatter()] },
      [['versicolor', 'setosa', 'virginica'], [undefined]],
    ],
    [
      'a nested layer of a facet',
      { data: { values: PANELLED }, facet: { column: { field: 'panel' } }, spec: { layer: [{ layer: [POINTS] }, MEAN_RULE] } },
      [['versicolor', 'virginica', 'setosa'], ['setosa', 'versicolor']],
    ],
    [
      'a nested layer of a repeat',
      { data: { values: IRIS }, repeat: { column: ['length', 'width'] }, spec: { layer: [{ layer: [REPEATED] }, MEAN_RULE] } },
      [['versicolor', 'setosa', 'virginica'], ['versicolor', 'setosa', 'virginica']],
    ],
  ])('reads the groups of a scatter in %s', (_, spec, names) => {
    const { subplots } = vegaLiteToMaidr(spec as VegaLiteSpec);

    expect(subplots.flat().map(subplot => subplot.layers.map(layer => layer.name))).toEqual(names);
  });

  it('names a group of a null or missing colour as the legend does', () => {
    // As Vega-Lite 5.23 and 6.5 compile it and Vega 5.33 and 6.4 run it: the
    // colour scale's domain holds null and undefined first, and the legend
    // labels them "null" and "undefined".
    const rows = [
      { species: 'setosa', length: 5.1, width: 3.5 },
      { species: null, length: 4.9, width: 3.0 },
      { species: 'virginica', length: 6.3, width: 3.3 },
      { length: 5.8, width: 2.7 },
      { species: 'setosa', length: 5.4, width: 3.9 },
    ];
    const view = makeView({ data_0: rows }, { color: [null, undefined, 'setosa', 'virginica'] });
    const spec = { ...scatter(SPECIES), data: { values: rows } };

    const layers = layersOf(vegaLiteToMaidr(spec as VegaLiteSpec, view));

    expect(layers.map(layer => layer.name)).toEqual(['null', 'undefined', 'setosa', 'virginica']);
    expect(layers.map(pointsOf)).toEqual([[[4.9, 3.0]], [[5.8, 2.7]], [[5.1, 3.5], [5.4, 3.9]], [[6.3, 3.3]]]);
  });

  it('splits a scatter of two groups, one of them a single point', () => {
    const spec = { ...scatter(SPECIES), data: { values: IRIS.filter(row => row.species !== 'virginica').slice(0, 3) } };

    const layers = layersOf(vegaLiteToMaidr(spec as VegaLiteSpec));

    expect(layers.map(layer => [layer.name, pointsOf(layer)])).toEqual([
      ['versicolor', [[7.0, 3.2]]],
      ['setosa', [[5.1, 3.5], [4.9, 3.0]]],
    ]);
    expect(colourGroupPlaces(layers[0])?.positions).toEqual([0]);
  });
});
