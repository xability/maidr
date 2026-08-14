import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { TraceType } from '@type/grammar';
import { makeView } from './fixtures/testView';

/**
 * The Vega-Lite gallery's parallel coordinates recipe, over three cars.
 *
 * Three variables whose units are deliberately incomparable — economy in
 * tens, weight in thousands — which is why the recipe min-max normalises
 * into `norm_val` before plotting: Vega-Lite has one y scale, and the raw
 * values would put every economy figure on the floor of it. The axes
 * themselves are drawn by a separate `rule` layer, which is why the
 * polylines are layer **1**.
 */
const PARALLEL_SPEC: VegaLiteSpec = {
  transform: [
    { window: [{ op: 'count', as: 'index' }] },
    { fold: ['mpg', 'hp', 'weight'] },
    {
      joinaggregate: [
        { op: 'min', field: 'value', as: 'min' },
        { op: 'max', field: 'value', as: 'max' },
      ],
      groupby: ['key'],
    },
    { calculate: '(datum.value - datum.min) / (datum.max-datum.min)', as: 'norm_val' },
  ],
  layer: [
    {
      mark: { type: 'rule' },
      encoding: { detail: { aggregate: 'count' }, x: { field: 'key' } },
    },
    {
      mark: 'line',
      encoding: {
        color: { field: 'name', type: 'nominal', title: 'Car' },
        detail: { field: 'index', type: 'nominal' },
        x: { field: 'key', type: 'nominal', title: 'Variable' },
        y: { field: 'norm_val', type: 'quantitative', axis: null },
      },
    },
  ],
};

/**
 * The folded pipeline as vega-lite 6.4.3 compiles it: one row per
 * (observation, variable), carrying both the raw `value` and the
 * normalised `norm_val`.
 */
const FOLDED_ROWS = [
  { name: 'car A', index: 1, key: 'mpg', value: 33, min: 15, max: 33, norm_val: 1 },
  { name: 'car A', index: 1, key: 'hp', value: 65, min: 65, max: 230, norm_val: 0 },
  { name: 'car A', index: 1, key: 'weight', value: 1800, min: 1800, max: 3200, norm_val: 0 },
  { name: 'car B', index: 2, key: 'mpg', value: 21, min: 15, max: 33, norm_val: 0.3333 },
  { name: 'car B', index: 2, key: 'hp', value: 110, min: 65, max: 230, norm_val: 0.2727 },
  { name: 'car B', index: 2, key: 'weight', value: 2600, min: 1800, max: 3200, norm_val: 0.5714 },
  { name: 'car C', index: 3, key: 'mpg', value: 15, min: 15, max: 33, norm_val: 0 },
  { name: 'car C', index: 3, key: 'hp', value: 230, min: 65, max: 230, norm_val: 1 },
  { name: 'car C', index: 3, key: 'weight', value: 3200, min: 1800, max: 3200, norm_val: 1 },
];

/**
 * The tally table the axis-rule layer draws from. It sits at `data_1`,
 * which is the name the resolver would otherwise guess for layer 1.
 */
const RULE_TALLY_ROWS = [
  { key: 'mpg', __count: 3 },
  { key: 'hp', __count: 3 },
  { key: 'weight', __count: 3 },
];

const VIEW_DATASETS = { data_0: FOLDED_ROWS, data_1: RULE_TALLY_ROWS };

/**
 * Convert a spec and assert it produced exactly one layer.
 * @param spec The Vega-Lite spec to convert
 * @param datasets The compiled view's datasets
 * @returns The single converted layer
 */
function onlyLayer(
  spec: VegaLiteSpec,
  datasets: Record<string, unknown[]> = VIEW_DATASETS,
): MaidrLayer {
  const result = vegaLiteToMaidr(spec, makeView(datasets));
  const layers = result.subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

describe('vega-Lite lines over a fold', () => {
  it('converts the gallery recipe into a parallel coordinates layer', () => {
    const layer = onlyLayer(PARALLEL_SPEC);

    // The `rule` layer resolves to no trace type and drops out, leaving
    // the polylines as the only layer.
    expect(layer.type).toBe(TraceType.PARALLEL);
  });

  it('draws one row per observation, not one per colour', () => {
    const layer = onlyLayer(PARALLEL_SPEC);

    // Grouped by colour the three cars would collapse into one polyline
    // zig-zagging through every axis in turn.
    expect(layer.data as LinePoint[][]).toHaveLength(3);
    expect((layer.data as LinePoint[][]).map(row => row.map(point => point.x)))
      .toEqual([
        ['mpg', 'hp', 'weight'],
        ['mpg', 'hp', 'weight'],
        ['mpg', 'hp', 'weight'],
      ]);
  });

  it('announces the raw folded values rather than the normalisation', () => {
    const layer = onlyLayer(PARALLEL_SPEC);

    // `ParallelTrace` derives each axis' extent from the layer and pitches
    // against it, which *is* the min-max normalisation — so handing it the
    // raw values costs nothing and buys back the units.
    expect((layer.data as LinePoint[][]).map(row => row.map(point => point.y)))
      .toEqual([
        [33, 65, 1800],
        [21, 110, 2600],
        [15, 230, 3200],
      ]);
  });

  it('names each observation after the colour channel', () => {
    const layer = onlyLayer(PARALLEL_SPEC);

    expect((layer.data as LinePoint[][]).map(row => row[0].z))
      .toEqual(['car A', 'car B', 'car C']);
    expect(layer.axes?.z?.label).toBe('Car');
  });

  it('names the axes after the fold rather than the normalised column', () => {
    const layer = onlyLayer(PARALLEL_SPEC);

    // The gallery spec hides the y axis outright (`axis: null`) and its
    // field is called `norm_val`, which describes the drawing rather than
    // the data.
    expect(layer.axes?.x?.label).toBe('Variable');
    expect(layer.axes?.y?.label).toBe('value');
  });

  it('emits one line selector per observation', () => {
    const layer = onlyLayer(PARALLEL_SPEC);

    // Vega draws one `<path>` per `detail` group, all under the layer's
    // own class; the caller resolves the rth in document order.
    expect(layer.selectors).toEqual([
      'g.mark-line.role-mark.layer_1_marks > path',
      'g.mark-line.role-mark.layer_1_marks > path',
      'g.mark-line.role-mark.layer_1_marks > path',
    ]);
  });

  it('skips the axis layer\'s tally table when resolving its rows', () => {
    // `data_1` is what the resolver guesses for layer 1, and it holds the
    // rules' row counts — three rows of two columns. Reading it would give
    // the chart three axes of one point each.
    const layer = onlyLayer(PARALLEL_SPEC);

    expect((layer.data as LinePoint[][]).flat()).toHaveLength(9);
  });

  it('honours the output column names a fold declares for itself', () => {
    const rows = FOLDED_ROWS.map(({ key, value, ...rest }) => ({
      ...rest,
      variable: key,
      reading: value,
    }));
    const layer = onlyLayer(
      {
        ...PARALLEL_SPEC,
        transform: [
          { window: [{ op: 'count', as: 'index' }] },
          { fold: ['mpg', 'hp', 'weight'], as: ['variable', 'reading'] },
        ],
        layer: [
          PARALLEL_SPEC.layer![0],
          {
            ...PARALLEL_SPEC.layer![1],
            encoding: {
              ...PARALLEL_SPEC.layer![1].encoding,
              x: { field: 'variable', type: 'nominal' },
            },
          },
        ],
      },
      { data_0: rows },
    );

    expect(layer.type).toBe(TraceType.PARALLEL);
    expect((layer.data as LinePoint[][])[0]).toEqual([
      { x: 'mpg', y: 33, z: 'car A' },
      { x: 'hp', y: 65, z: 'car A' },
      { x: 'weight', y: 1800, z: 'car A' },
    ]);
  });

  it('leaves a folded long-format chart a line chart without a detail split', () => {
    // A fold whose rows are joined into one path per colour is an ordinary
    // multi-series line chart in long format, not a parallel coordinates
    // plot — nothing separates the observations.
    const layer = onlyLayer(
      {
        transform: [{ fold: ['mpg', 'hp', 'weight'] }],
        mark: 'line',
        encoding: {
          x: { field: 'key', type: 'nominal' },
          y: { field: 'value', type: 'quantitative' },
          color: { field: 'name', type: 'nominal' },
        },
      },
      { data_0: FOLDED_ROWS },
    );

    expect(layer.type).toBe(TraceType.LINE);
  });

  it('leaves a line a line when the folded key is not on an axis', () => {
    const layer = onlyLayer(
      {
        transform: [{ fold: ['mpg', 'hp', 'weight'] }],
        mark: 'line',
        encoding: {
          x: { field: 'index', type: 'quantitative' },
          y: { field: 'value', type: 'quantitative' },
          detail: { field: 'name', type: 'nominal' },
        },
      },
      { data_0: FOLDED_ROWS },
    );

    expect(layer.type).toBe(TraceType.LINE);
  });
});
