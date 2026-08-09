import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { MaidrLayer, PiePoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { TraceType } from '@type/grammar';

const FRUIT = {
  values: [
    { fruit: 'Apples', units: 30 },
    { fruit: 'Bananas', units: 50 },
    { fruit: 'Cherries', units: 20 },
  ],
};

/**
 * A pie: an `arc` mark whose magnitudes ride `theta` and whose slice labels
 * come from the colour channel. No view is supplied, so the converter reads
 * the spec's inline data — the same fallback the other converter tests use.
 */
function pieSpec(mark: VegaLiteSpec['mark']): VegaLiteSpec {
  return {
    data: FRUIT,
    mark,
    encoding: {
      theta: { field: 'units', type: 'quantitative', title: 'Units' },
      color: { field: 'fruit', type: 'nominal', title: 'Fruit' },
    },
  };
}

function onlyLayer(spec: VegaLiteSpec): MaidrLayer {
  const result = vegaLiteToMaidr(spec);
  const layers = result.subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

describe('vega-Lite arc marks', () => {
  it('converts an arc mark with a theta encoding into a flat pie layer', () => {
    const layer = onlyLayer(pieSpec('arc'));

    expect(layer.type).toBe(TraceType.PIE);
    // Row order is the drawn order: the stack transform behind a `theta`
    // encoding computes angles without reordering the rows.
    expect(layer.data as PiePoint[]).toEqual([
      { x: 'Apples', y: 30 },
      { x: 'Bananas', y: 50 },
      { x: 'Cherries', y: 20 },
    ]);
    expect(layer.selectors).toBe(
      'g.mark-arc.role-mark.marks path, g.mark-arc.role-mark.layer_0_marks path',
    );
    expect(layer.orientation).toBeUndefined();
  });

  it('names the axes after the colour and theta channels, not the absent x/y', () => {
    const layer = onlyLayer(pieSpec('arc'));

    expect(layer.axes?.x?.label).toBe('Fruit');
    expect(layer.axes?.y?.label).toBe('Units');
  });

  it('falls back to the field names when the channels carry no title', () => {
    const layer = onlyLayer({
      data: FRUIT,
      mark: 'arc',
      encoding: {
        theta: { field: 'units', type: 'quantitative' },
        color: { field: 'fruit', type: 'nominal' },
      },
    });

    expect(layer.axes?.x?.label).toBe('fruit');
    expect(layer.axes?.y?.label).toBe('units');
  });

  it('reads a doughnut exactly as it reads a pie', () => {
    const layer = onlyLayer(pieSpec({ type: 'arc', innerRadius: 50 }));

    expect(layer.type).toBe(TraceType.PIE);
    expect(layer.data as PiePoint[]).toHaveLength(3);
  });

  it('takes the slice labels from fill when that is the channel in use', () => {
    const layer = onlyLayer({
      data: FRUIT,
      mark: 'arc',
      encoding: {
        theta: { field: 'units', type: 'quantitative' },
        fill: { field: 'fruit', type: 'nominal', title: 'Fruit' },
      },
    });

    expect((layer.data as PiePoint[]).map(point => point.x))
      .toEqual(['Apples', 'Bananas', 'Cherries']);
    expect(layer.axes?.x?.label).toBe('Fruit');
  });

  it('leaves an arc without theta unsupported rather than inventing slices', () => {
    // A radial mark with no angular encoding has no slices to navigate.
    const result = vegaLiteToMaidr({
      data: FRUIT,
      mark: 'arc',
      encoding: { color: { field: 'fruit', type: 'nominal' } },
    });

    expect(result.subplots[0][0].layers).toHaveLength(0);
  });
});
