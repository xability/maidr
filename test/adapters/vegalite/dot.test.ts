import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { BarPoint, MaidrLayer, ScatterPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { Orientation, TraceType } from '@type/grammar';

const MEDALS = {
  values: [
    { country: 'Norway', medals: 37 },
    { country: 'Germany', medals: 31 },
    { country: 'Canada', medals: 29 },
  ],
};

function onlyLayer(spec: VegaLiteSpec): MaidrLayer {
  const result = vegaLiteToMaidr(spec);
  const layers = result.subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

describe('vega-Lite point marks against a category', () => {
  it('converts a point mark with a category axis into a dot plot', () => {
    const layer = onlyLayer({
      data: MEDALS,
      mark: 'point',
      encoding: {
        x: { field: 'country', type: 'nominal', title: 'Country' },
        y: { field: 'medals', type: 'quantitative', title: 'Medals' },
      },
    });

    expect(layer.type).toBe(TraceType.DOT);
    // Read as a scatter, `Number('Norway')` put NaN on every x — the whole
    // category axis went silent. The category belongs on x as a name.
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Norway', y: 37 },
      { x: 'Germany', y: 31 },
      { x: 'Canada', y: 29 },
    ]);
    expect(layer.selectors).toBe(
      'g.mark-symbol.role-mark.marks path, g.mark-symbol.role-mark.layer_0_marks path',
    );
    expect(layer.orientation).toBeUndefined();
  });

  it('flips the value onto x for a Cleveland dot plot', () => {
    const layer = onlyLayer({
      data: MEDALS,
      mark: 'circle',
      encoding: {
        x: { field: 'medals', type: 'quantitative', title: 'Medals' },
        y: { field: 'country', type: 'nominal', title: 'Country' },
      },
    });

    expect(layer.type).toBe(TraceType.DOT);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    // `BarTrace` reads the magnitude off `x` when the layer is horizontal.
    expect(layer.data as BarPoint[]).toEqual([
      { x: 37, y: 'Norway' },
      { x: 31, y: 'Germany' },
      { x: 29, y: 'Canada' },
    ]);
  });

  it('reads the value channel even when the spec leaves its type to be inferred', () => {
    const layer = onlyLayer({
      data: MEDALS,
      mark: 'point',
      encoding: {
        x: { field: 'medals' },
        y: { field: 'country', type: 'nominal' },
      },
    });

    // The flip follows the *category* channel, so an untyped value channel
    // still lands on the value side.
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect((layer.data as BarPoint[])[0]).toEqual({ x: 37, y: 'Norway' });
  });

  it('leaves a two-magnitude point mark a scatter', () => {
    const layer = onlyLayer({
      data: { values: [{ a: 1, b: 2 }, { a: 4, b: 5 }] },
      mark: 'point',
      encoding: {
        x: { field: 'a', type: 'quantitative' },
        y: { field: 'b', type: 'quantitative' },
      },
    });

    expect(layer.type).toBe(TraceType.SCATTER);
    expect(layer.data as ScatterPoint[]).toEqual([{ x: 1, y: 2 }, { x: 4, y: 5 }]);
  });

  it('leaves a temporal axis a scatter — a time axis is a magnitude', () => {
    const layer = onlyLayer({
      data: { values: [{ t: '2020-01-01', b: 2 }] },
      mark: 'point',
      encoding: {
        x: { field: 't', type: 'temporal' },
        y: { field: 'b', type: 'quantitative' },
      },
    });

    expect(layer.type).toBe(TraceType.SCATTER);
  });

  it('highlights a tick mark through the rect group Vega actually renders', () => {
    const layer = onlyLayer({
      data: MEDALS,
      mark: 'tick',
      encoding: {
        x: { field: 'medals', type: 'quantitative' },
        y: { field: 'country', type: 'nominal' },
      },
    });

    expect(layer.type).toBe(TraceType.DOT);
    // Vega has no `tick` mark: Vega-Lite compiles one to a thin `rect`,
    // so the `mark-tick` class this used to emit matched nothing at all.
    expect(layer.selectors).toBe(
      'g.mark-rect.role-mark.marks path, g.mark-rect.role-mark.layer_0_marks path',
    );
  });
});
