import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { TraceType } from '@type/grammar';

const RAINFALL = {
  values: [
    { month: 'Jan', rain: 12 },
    { month: 'Feb', rain: 23 },
    { month: 'Mar', rain: 47 },
    { month: 'Apr', rain: 6 },
  ],
};

function onlyLayer(spec: VegaLiteSpec): MaidrLayer {
  const result = vegaLiteToMaidr(spec);
  const layers = result.subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

describe('vega-Lite arc marks with a radius', () => {
  it('converts a radial plot into a polar area layer', () => {
    const layer = onlyLayer({
      data: RAINFALL,
      mark: { type: 'arc', innerRadius: 20 },
      encoding: {
        theta: { field: 'month', type: 'nominal' },
        radius: { field: 'rain', type: 'quantitative', title: 'Rainfall' },
        color: { field: 'month', type: 'nominal', title: 'Month' },
      },
    });

    expect(layer.type).toBe(TraceType.POLAR_AREA);
    // One series: a coxcomb draws one wedge per category, so the
    // categories are the spokes rather than one ring per group.
    expect(layer.data as LinePoint[][]).toEqual([[
      { x: 'Jan', y: 12 },
      { x: 'Feb', y: 23 },
      { x: 'Mar', y: 47 },
      { x: 'Apr', y: 6 },
    ]]);
    // An arc has no x or y, so the axes are named after the channels that
    // carry the categories and the magnitudes — as a pie's are.
    expect(layer.axes?.x?.label).toBe('Month');
    expect(layer.axes?.y?.label).toBe('Rainfall');
  });

  it('emits one selector per series, matching every wedge', () => {
    const layer = onlyLayer({
      data: RAINFALL,
      mark: 'arc',
      encoding: {
        theta: { field: 'month', type: 'nominal' },
        radius: { field: 'rain', type: 'quantitative' },
        color: { field: 'month', type: 'nominal' },
      },
    });

    // `RadarTrace` extends `LineTrace`, which wants one selector per
    // series and resolves each to the series' own points.
    expect(layer.selectors).toEqual([
      'g.mark-arc.role-mark.marks > path, g.mark-arc.role-mark.layer_0_marks > path',
    ]);
  });

  it('names the spokes after the angular channel when there is no colour', () => {
    const layer = onlyLayer({
      data: RAINFALL,
      mark: 'arc',
      encoding: {
        theta: { field: 'month', type: 'nominal', title: 'Month' },
        radius: { field: 'rain', type: 'quantitative' },
      },
    });

    expect((layer.data as LinePoint[][])[0].map(point => point.x))
      .toEqual(['Jan', 'Feb', 'Mar', 'Apr']);
    expect(layer.axes?.x?.label).toBe('Month');
  });

  it('leaves a pie a pie when the radius is not bound to a field', () => {
    // Vega-Lite specs set a constant radius to size a pie; only a radius
    // reading the data makes the wedge length a magnitude.
    const layer = onlyLayer({
      data: RAINFALL,
      mark: 'arc',
      encoding: {
        theta: { field: 'rain', type: 'quantitative' },
        radius: { datum: 100 },
        color: { field: 'month', type: 'nominal' },
      },
    });

    expect(layer.type).toBe(TraceType.PIE);
  });
});
