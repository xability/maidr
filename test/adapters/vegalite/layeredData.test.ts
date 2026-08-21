import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { LinePoint, ScatterPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';

/**
 * A layered spec's inline data never reached its layers (#1126).
 *
 * `resolveData`'s inline fallback reads the spec it was handed, and
 * `convertLayerSpec` is handed the *child*. A layered chart puts `data`
 * once at the top and `layer:` beneath it -- Vega-Lite's own form, and the
 * one every example is written in -- so the fallback found nothing and the
 * layer came back with no rows at all.
 *
 * The parent's encoding and transforms were both threaded down already;
 * its data was not. The facet path had solved this for itself
 * (`{ ...layerSpec, data: childSpec.data ?? spec.data }`); the plain
 * layered and concat paths had not.
 *
 * What this is and is not: `bindVegaLite` always passes a compiled view,
 * and the view path runs first, so an ordinary browser chart takes its rows
 * from the view. This is the fallback -- what a layered chart falls back
 * to* when the view cannot supply rows, and what every spec-only test of
 * one was measuring. Those tests asserted layer types only, and passed
 * whether the data was right, wrong, or absent.
 */

const CITIES = {
  values: [
    { city: 'Aa', pop: 3, area: 10 },
    { city: 'Bb', pop: 5, area: 20 },
    { city: 'Cc', pop: 2, area: 30 },
  ],
};

const AREA = { field: 'area', type: 'quantitative' } as const;
const POP = { field: 'pop', type: 'quantitative' } as const;

function layersOf(spec: VegaLiteSpec): ReturnType<typeof vegaLiteToMaidr>['subplots'][0][0]['layers'] {
  return vegaLiteToMaidr(spec).subplots[0][0].layers;
}

describe('a layered spec\'s data', () => {
  it('reaches a layer that declares none of its own', () => {
    const layers = layersOf({
      data: CITIES,
      layer: [{ mark: 'point', encoding: { x: AREA, y: POP } }],
    });

    expect(layers).toHaveLength(1);
    expect(layers[0].data as ScatterPoint[]).toEqual([
      { x: 10, y: 3 },
      { x: 20, y: 5 },
      { x: 30, y: 2 },
    ]);
  });

  it('reaches every layer of a multi-layer chart', () => {
    // Encoding hoisted to the parent too, which is how the form is usually
    // written: one `data`, one `encoding`, and the marks beneath them.
    const layers = layersOf({
      data: CITIES,
      encoding: { x: AREA, y: POP },
      layer: [{ mark: 'point' }, { mark: 'line' }],
    });

    expect(layers.map(layer => layer.type)).toEqual(['point', 'line']);
    expect(layers[0].data as ScatterPoint[]).toHaveLength(3);
    // A line layer's payload is one series of points, not a flat list.
    expect((layers[1].data as LinePoint[][])[0]).toHaveLength(3);
  });

  it('lets a layer\'s own data win over the parent\'s', () => {
    // Vega-Lite's own precedence, and the reason this is an inheritance
    // rather than an override: a layer that names a dataset means it.
    const layers = layersOf({
      data: CITIES,
      layer: [
        {
          data: { values: [{ area: 99, pop: 1 }] },
          mark: 'point',
          encoding: { x: AREA, y: POP },
        },
        { mark: 'point', encoding: { x: AREA, y: POP } },
      ],
    });

    expect(layers[0].data as ScatterPoint[]).toEqual([{ x: 99, y: 1 }]);
    expect(layers[1].data as ScatterPoint[]).toHaveLength(3);
  });

  it('reaches the layers of a concat child', () => {
    // The other path that enumerates layer children without inheriting.
    const spec: VegaLiteSpec = {
      hconcat: [
        {
          data: CITIES,
          layer: [{ mark: 'point', encoding: { x: AREA, y: POP } }],
        },
      ],
    };

    const layers = vegaLiteToMaidr(spec).subplots[0][0].layers;
    expect(layers[0].data as ScatterPoint[]).toHaveLength(3);
  });

  it('leaves a single-view spec exactly as it was', () => {
    // The path that already worked, asserted beside the others so a change
    // to the inheritance cannot quietly reach it.
    const layers = layersOf({
      data: CITIES,
      mark: 'point',
      encoding: { x: AREA, y: POP },
    });

    expect(layers[0].data as ScatterPoint[]).toEqual([
      { x: 10, y: 3 },
      { x: 20, y: 5 },
      { x: 30, y: 2 },
    ]);
  });

  it('does not invent data for a layered spec that has none', () => {
    // No parent data and no child data is still no data. The layer is
    // emitted with an empty payload rather than anything being conjured.
    const layers = layersOf({
      layer: [{ mark: 'point', encoding: { x: AREA, y: POP } }],
    });

    expect(layers[0].data as ScatterPoint[]).toEqual([]);
  });
});
