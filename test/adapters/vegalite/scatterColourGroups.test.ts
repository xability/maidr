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
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
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

  it('names each group\'s points by their place in the mark', () => {
    const layers = layersOf(vegaLiteToMaidr(scatter(SPECIES) as VegaLiteSpec));

    // The mark draws row k as its group's (k + 1)-th child: setosa's rows are
    // the second and fourth.
    expect(layers[1].selectors).toBe(
      'g.mark-symbol.role-mark.marks > path:nth-child(2), g.mark-symbol.role-mark.layer_0_marks > path:nth-child(2), '
      + 'g.mark-symbol.role-mark.marks > path:nth-child(4), g.mark-symbol.role-mark.layer_0_marks > path:nth-child(4)',
    );
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
    expect(layers[1].selectors).toBe(
      'g.mark-symbol.role-mark.layer_0_marks > path:nth-child(2), g.mark-symbol.role-mark.layer_0_marks > path:nth-child(4)',
    );
  });

  it('names a concat panel on its first group only', () => {
    const spec = { data: { values: IRIS }, hconcat: [{ title: 'Iris', ...scatter(SPECIES) }, { ...scatter() }] };

    const [first] = vegaLiteToMaidr(spec as VegaLiteSpec).subplots[0];

    expect(first.layers.map(layer => [layer.id, layer.title, layer.name])).toEqual([
      ['0_0', 'Iris', 'versicolor'],
      ['0_0.1', undefined, 'setosa'],
      ['0_0.2', undefined, 'virginica'],
    ]);
    expect(first.layers[2].selectors).toBe(
      'g.mark-symbol.role-mark.concat_0_marks > path:nth-child(3), g.mark-symbol.role-mark.concat_0_layer_0_marks > path:nth-child(3)',
    );
  });
});
