/**
 * A Vega-Lite layer names what its colour splits or shades the marks by as
 * the legend names it.
 *
 * Only a parallel coordinates layer and a merged run of line layers set
 * `axes.z`, so every other layer coloured by a field was read under the
 * core's placeholder: "Class is First, Passengers is 80, Level is No" for a
 * bar stacked by `survived` under a legend titled "Survived", "Level is 8"
 * for a heatmap cell under a legend titled "Activity Level", "Competitor is
 * Ash" for a bump chart's "Team".
 */
import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';

const PASSENGERS = [
  { class: 'First', survived: 'No', count: 80 },
  { class: 'First', survived: 'Yes', count: 136 },
  { class: 'Second', survived: 'No', count: 97 },
  { class: 'Second', survived: 'Yes', count: 87 },
];

/**
 * The only layer a spec converts to.
 * @param spec - The spec
 * @returns The layer
 */
function onlyLayer(spec: unknown): MaidrLayer {
  const layers = vegaLiteToMaidr(spec as VegaLiteSpec).subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

/**
 * A bar over the passengers, coloured by survival.
 * @param y     - The y channel
 * @param extra - More channels
 * @returns The spec
 */
function barSpec(y: Record<string, unknown>, extra: Record<string, unknown> = {}): unknown {
  return {
    data: { values: PASSENGERS },
    mark: 'bar',
    encoding: {
      x: { field: 'class', type: 'nominal', title: 'Class' },
      y: { field: 'count', type: 'quantitative', title: 'Passengers', ...y },
      color: { field: 'survived', type: 'nominal', title: 'Survived' },
      ...extra,
    },
  };
}

describe('a vega-lite layer coloured by a field', () => {
  it('names a stacked bar\'s series as its legend does', () => {
    const layer = onlyLayer(barSpec({}));

    expect(layer.type).toBe('stacked_bar');
    expect(layer.axes?.z).toEqual({ label: 'Survived' });
  });

  it('names a dodged bar\'s series as its legend does', () => {
    const layer = onlyLayer(barSpec({}, { xOffset: { field: 'survived' } }));

    expect(layer.type).toBe('dodged_bar');
    expect(layer.axes?.z).toEqual({ label: 'Survived' });
  });

  it('names a normalized bar\'s series as its legend does', () => {
    const layer = onlyLayer(barSpec({ stack: 'normalize' }));

    expect(layer.type).toBe('stacked_normalized_bar');
    expect(layer.axes?.z).toEqual({ label: 'Survived' });
  });

  it('names a diverging bar\'s sides as its legend does', () => {
    const layer = onlyLayer({
      data: {
        values: [
          { age: '0', gender: 'Male', people: 2200 },
          { age: '0', gender: 'Female', people: -2150 },
          { age: '10', gender: 'Male', people: 2020 },
          { age: '10', gender: 'Female', people: -2030 },
        ],
      },
      mark: 'bar',
      encoding: {
        y: { field: 'age', type: 'ordinal' },
        x: { field: 'people', type: 'quantitative' },
        color: { field: 'gender', type: 'nominal', title: 'Gender' },
      },
    });

    expect(layer.type).toBe('diverging_bar');
    expect(layer.axes?.z).toEqual({ label: 'Gender' });
  });

  it('names a heatmap cell\'s value as its legend does', () => {
    const layer = onlyLayer({
      data: { values: [{ day: 'Mon', hour: 'Morning', value: 5 }, { day: 'Tue', hour: 'Morning', value: 7 }] },
      mark: 'rect',
      encoding: {
        x: { field: 'day', type: 'ordinal' },
        y: { field: 'hour', type: 'ordinal' },
        color: { field: 'value', type: 'quantitative', title: 'Activity Level' },
      },
    });

    expect(layer.type).toBe('heat');
    expect(layer.axes?.z).toEqual({ label: 'Activity Level' });
  });

  it('names a line\'s series as its legend does', () => {
    const layer = onlyLayer({
      data: { values: [{ x: 1, y: 2, s: 'Series 1' }, { x: 2, y: 3, s: 'Series 1' }, { x: 1, y: 4, s: 'Series 2' }, { x: 2, y: 1, s: 'Series 2' }] },
      mark: 'line',
      encoding: {
        x: { field: 'x', type: 'quantitative' },
        y: { field: 'y', type: 'quantitative' },
        color: { field: 's', type: 'nominal', title: 'Series' },
      },
    });

    expect(layer.axes?.z).toEqual({ label: 'Series' });
  });

  it('names a bump chart\'s competitors as its legend does', () => {
    const layer = onlyLayer({
      data: { values: [{ team: 'Ash', round: 'R1', score: 10 }, { team: 'Birch', round: 'R1', score: 8 }] },
      transform: [{ window: [{ op: 'rank', as: 'rank' }], groupby: ['round'], sort: [{ field: 'score', order: 'descending' }] }],
      mark: 'line',
      encoding: {
        x: { field: 'round', type: 'ordinal' },
        y: { field: 'rank', type: 'quantitative' },
        color: { field: 'team', type: 'nominal', title: 'Team' },
      },
    });

    expect(layer.type).toBe('bump');
    expect(layer.axes?.z).toEqual({ label: 'Team' });
  });

  it('falls back to the field, which is what the legend shows without a title', () => {
    const layer = onlyLayer({
      data: { values: PASSENGERS },
      mark: 'bar',
      encoding: {
        x: { field: 'class', type: 'nominal' },
        y: { field: 'count', type: 'quantitative' },
        color: { field: 'survived', type: 'nominal' },
      },
    });

    expect(layer.axes?.z).toEqual({ label: 'survived' });
  });
});

describe('a vega-lite layer not split by a colour field', () => {
  it('claims no z axis for a line of one colour', () => {
    const layer = onlyLayer({
      data: { values: [{ x: 1, y: 2 }, { x: 2, y: 3 }] },
      mark: 'line',
      encoding: {
        x: { field: 'x', type: 'quantitative' },
        y: { field: 'y', type: 'quantitative' },
        color: { value: 'red' },
      },
    });

    expect(layer.axes?.z).toBeUndefined();
  });

  it('claims no z axis for a bar coloured by its own category', () => {
    // A plain bar has no series for a z axis to name.
    const layer = onlyLayer({
      data: { values: [{ a: 'A', b: 1 }, { a: 'B', b: 2 }] },
      mark: 'bar',
      encoding: {
        x: { field: 'a', type: 'nominal' },
        y: { field: 'b', type: 'quantitative' },
      },
    });

    expect(layer.type).toBe('bar');
    expect(layer.axes?.z).toBeUndefined();
  });
});
