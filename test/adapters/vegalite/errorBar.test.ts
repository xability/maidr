import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { ErrorBarPoint, MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { Orientation, TraceType } from '@type/grammar';
import { makeView } from './fixtures/testView';

const SCORES = {
  values: [
    { group: 'A', score: 28 },
    { group: 'A', score: 55 },
    { group: 'A', score: 43 },
    { group: 'B', score: 91 },
    { group: 'B', score: 81 },
    { group: 'B', score: 53 },
  ],
};

/**
 * The dataset Vega-Lite compiles the `errorbar` composite into, captured
 * from a real compiled view of the spec below. The mark aggregates the raw
 * observations itself into `center_` / `lower_` / `upper_` columns — one
 * row per sample — which is what the adapter reads.
 */
const COMPILED_ERROR_BARS = [
  {
    group: 'A',
    center_score: 42,
    extent_score: 7.810249675906654,
    upper_score: 49.810249675906654,
    lower_score: 34.189750324093346,
  },
  {
    group: 'B',
    center_score: 75,
    extent_score: 11.372481406154654,
    upper_score: 86.37248140615465,
    lower_score: 63.627518593845345,
  },
];

function onlyLayer(spec: VegaLiteSpec, datasets?: Record<string, unknown[]>): MaidrLayer {
  const view = datasets ? makeView(datasets) : undefined;
  const result = vegaLiteToMaidr(spec, view);
  const layers = result.subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

describe('vega-Lite interval marks', () => {
  it('converts an errorbar into an error bar layer using the compiled bounds', () => {
    const layer = onlyLayer(
      {
        data: SCORES,
        mark: 'errorbar',
        encoding: {
          x: { field: 'group', type: 'nominal', title: 'Group' },
          y: { field: 'score', type: 'quantitative', title: 'Score' },
        },
      },
      { source_0: SCORES.values, data_0: COMPILED_ERROR_BARS },
    );

    expect(layer.type).toBe(TraceType.ERROR_BAR);
    expect(layer.data as ErrorBarPoint[]).toEqual([
      { x: 'A', y: 42, yMin: 34.189750324093346, yMax: 49.810249675906654 },
      { x: 'B', y: 75, yMin: 63.627518593845345, yMax: 86.37248140615465 },
    ]);
    expect(layer.axes?.x?.label).toBe('Group');
    expect(layer.axes?.y?.label).toBe('Score');
    expect(layer.orientation).toBeUndefined();
  });

  it('points the selector at the whip, which Vega draws as a line per sample', () => {
    const layer = onlyLayer(
      {
        data: SCORES,
        mark: 'errorbar',
        encoding: {
          x: { field: 'group', type: 'nominal' },
          y: { field: 'score', type: 'quantitative' },
        },
      },
      { data_0: COMPILED_ERROR_BARS },
    );

    // `g.mark-rule ... line`, not `mark-errorbar ... path`: the composite
    // renders as a rule group, and Vega draws rules as <line> elements.
    expect(layer.selectors).toBe(
      'g.mark-rule.role-mark.marks line, g.mark-rule.role-mark.layer_0_marks line',
    );
  });

  it('keeps the estimate on y when the chart is drawn horizontally', () => {
    // ErrorBarTrace reads the magnitude off `y` in both orientations and
    // swaps only which axis label names it — the opposite of a bar, whose
    // value moves onto `x`.
    const layer = onlyLayer(
      {
        data: SCORES,
        mark: 'errorbar',
        encoding: {
          y: { field: 'group', type: 'nominal', title: 'Group' },
          x: { field: 'score', type: 'quantitative', title: 'Score' },
        },
      },
      { data_0: COMPILED_ERROR_BARS },
    );

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data as ErrorBarPoint[]).toEqual([
      { x: 'A', y: 42, yMin: 34.189750324093346, yMax: 49.810249675906654 },
      { x: 'B', y: 75, yMin: 63.627518593845345, yMax: 86.37248140615465 },
    ]);
  });

  it('reads an errorband as the same three magnitudes, drawn as one band', () => {
    const layer = onlyLayer(
      {
        data: SCORES,
        mark: 'errorband',
        encoding: {
          x: { field: 'group', type: 'nominal' },
          y: { field: 'score', type: 'quantitative' },
        },
      },
      { data_0: COMPILED_ERROR_BARS },
    );

    expect(layer.type).toBe(TraceType.ERROR_BAR);
    expect((layer.data as ErrorBarPoint[]).map(point => point.yMax))
      .toEqual([49.810249675906654, 86.37248140615465]);
    // A band is a single <path> covering every sample, so this selector
    // resolves to one element for N points and `ErrorBarTrace` withdraws
    // the highlight. That is the honest outcome: the chart holds no
    // per-sample element to highlight.
    expect(layer.selectors).toBe(
      'g.mark-area.role-mark.marks path, g.mark-area.role-mark.layer_0_marks path',
    );
  });

  it('aggregates raw observations itself when no compiled view is available', () => {
    // Vega-Lite's default extent is the standard error of the mean.
    const layer = onlyLayer({
      data: SCORES,
      mark: 'errorbar',
      encoding: {
        x: { field: 'group', type: 'nominal' },
        y: { field: 'score', type: 'quantitative' },
      },
    });

    const points = layer.data as ErrorBarPoint[];
    expect(points.map(point => point.x)).toEqual(['A', 'B']);
    expect(points[0].y).toBe(42);
    expect(points[0].yMin).toBeCloseTo(34.18975, 5);
    expect(points[0].yMax).toBeCloseTo(49.81025, 5);
    expect(points[1].y).toBe(75);
  });

  it('leaves the interval out rather than guess a non-default extent', () => {
    const layer = onlyLayer({
      data: SCORES,
      mark: { type: 'errorbar', extent: 'iqr' },
      encoding: {
        x: { field: 'group', type: 'nominal' },
        y: { field: 'score', type: 'quantitative' },
      },
    });

    // The estimate survives; a standard error dressed up as an
    // interquartile range would not be the interval the chart drew.
    expect(layer.data as ErrorBarPoint[]).toEqual([
      { x: 'A', y: 42 },
      { x: 'B', y: 75 },
    ]);
  });
});
