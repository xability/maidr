import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { Orientation, TraceType } from '@type/grammar';
import { makeView } from './fixtures/testView';

/**
 * The Vega-Lite gallery's population pyramid, which is authored as an
 * ordinary stacked bar over a `calculate` that negates one side. Nothing
 * in the spec says "diverging" — Vega-Lite has no such mark — so the only
 * evidence is the signs in the resolved values.
 */
const PYRAMID_SPEC: VegaLiteSpec = {
  transform: [
    { calculate: 'datum.sex == 2 ? \'Female\' : \'Male\'', as: 'gender' },
    { calculate: 'datum.sex == 2 ? -datum.people : datum.people', as: 'signed_people' },
  ],
  mark: 'bar',
  encoding: {
    y: { field: 'age', axis: null, title: 'Age' },
    x: { aggregate: 'sum', field: 'signed_people', title: 'population' },
    color: { field: 'gender', title: 'Gender' },
  },
};

/**
 * The aggregated pipeline as vega-lite 6.4.3 compiles it: the aggregate
 * renames the column to `sum_signed_people`, and the rows arrive
 * interleaved, one age band at a time.
 */
const PYRAMID_ROWS = [
  { age: 0, gender: 'Male', sum_signed_people: 1007 },
  { age: 0, gender: 'Female', sum_signed_people: -1014 },
  { age: 5, gender: 'Male', sum_signed_people: 1057 },
  { age: 5, gender: 'Female', sum_signed_people: -1064 },
  { age: 10, gender: 'Male', sum_signed_people: 1107 },
  { age: 10, gender: 'Female', sum_signed_people: -1114 },
];

/**
 * Convert a spec and assert it produced exactly one layer.
 * @param spec The Vega-Lite spec to convert
 * @param rows The compiled view's aggregated rows
 * @returns The single converted layer
 */
function onlyLayer(spec: VegaLiteSpec, rows: unknown[]): MaidrLayer {
  const result = vegaLiteToMaidr(spec, makeView({ data_1: rows }));
  const layers = result.subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

describe('vega-Lite stacked bars with signed values', () => {
  it('reads a population pyramid as a diverging bar', () => {
    const layer = onlyLayer(PYRAMID_SPEC, PYRAMID_ROWS);

    expect(layer.type).toBe(TraceType.DIVERGING);
    // The category rides y and the magnitude x, as it does for any
    // horizontal segmented bar.
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
  });

  it('carries the values signed, one series per side', () => {
    const layer = onlyLayer(PYRAMID_SPEC, PYRAMID_ROWS);

    // `DivergingTrace` takes the magnitude for the pitch and names the
    // side from the sign, so the sign has to survive the conversion.
    expect(layer.data as SegmentedPoint[][]).toEqual([
      [
        { x: 1007, y: '0', z: 'Male' },
        { x: 1057, y: '5', z: 'Male' },
        { x: 1107, y: '10', z: 'Male' },
      ],
      [
        { x: -1014, y: '0', z: 'Female' },
        { x: -1064, y: '5', z: 'Female' },
        { x: -1114, y: '10', z: 'Female' },
      ],
    ]);
  });

  it('highlights the bars the way a segmented layer does', () => {
    const layer = onlyLayer(PYRAMID_SPEC, PYRAMID_ROWS);

    // A diverging bar is drawn with the same `rect` marks a stacked one
    // is; only the reading changes.
    expect(layer.selectors).toBe(
      'g.mark-rect.role-mark.marks path, g.mark-rect.role-mark.layer_0_marks path',
    );
  });

  it('maps the interleaved bars the gallery pyramid renders', () => {
    const layer = onlyLayer(PYRAMID_SPEC, PYRAMID_ROWS);

    // Vega draws a bar per row in dataset order, and the pyramid's rows
    // alternate the two sides — so the DOM is category-major. Bind-time
    // detection only covers STACKED / DODGED / NORMALIZED, so without
    // this the layer would take `SegmentedTrace`'s row-major default and
    // every highlight would land on a bar of the other side.
    expect(layer.domMapping).toEqual({ order: 'column', groupDirection: 'forward' });
  });

  it('maps grouped bars row-major', () => {
    const layer = onlyLayer(PYRAMID_SPEC, [
      { age: 0, gender: 'Male', sum_signed_people: 1007 },
      { age: 5, gender: 'Male', sum_signed_people: 1057 },
      { age: 0, gender: 'Female', sum_signed_people: -1014 },
      { age: 5, gender: 'Female', sum_signed_people: -1064 },
    ]);

    expect(layer.type).toBe(TraceType.DIVERGING);
    expect(layer.domMapping).toEqual({ order: 'row' });
  });

  it('reads a Likert scale with more than two sides', () => {
    // Every response type keeps to one side of the neutral midpoint, which
    // is the same evidence a two-sided pyramid gives.
    const layer = onlyLayer(
      {
        mark: 'bar',
        encoding: {
          y: { field: 'question', type: 'nominal' },
          x: { field: 'signed', type: 'quantitative' },
          color: { field: 'response', type: 'nominal' },
        },
      },
      [
        { question: 'Q1', response: 'Disagree', signed: -9 },
        { question: 'Q2', response: 'Disagree', signed: -18 },
        { question: 'Q1', response: 'Neutral', signed: 0 },
        { question: 'Q2', response: 'Neutral', signed: 0 },
        { question: 'Q1', response: 'Agree', signed: 60 },
        { question: 'Q2', response: 'Agree', signed: 64 },
      ],
    );

    expect(layer.type).toBe(TraceType.DIVERGING);
  });

  it('leaves an all-positive stacked bar stacked', () => {
    const layer = onlyLayer(PYRAMID_SPEC, PYRAMID_ROWS.map(row => ({
      ...row,
      sum_signed_people: Math.abs(row.sum_signed_people),
    })));

    expect(layer.type).toBe(TraceType.STACKED);
  });

  it('leaves an all-negative stacked bar stacked', () => {
    // A chart of costs grows one way only; there is no baseline to
    // straddle, and announcing a side would invent one.
    const layer = onlyLayer(PYRAMID_SPEC, PYRAMID_ROWS.map(row => ({
      ...row,
      sum_signed_people: -Math.abs(row.sum_signed_people),
    })));

    expect(layer.type).toBe(TraceType.STACKED);
  });

  it('leaves a stacked bar with one series crossing the baseline stacked', () => {
    // Profit by region, where one region had a bad quarter. The negative
    // sits *inside* a series that is otherwise positive, which is exactly
    // what a diverging chart's sides never do.
    const layer = onlyLayer(PYRAMID_SPEC, [
      { age: 0, gender: 'Male', sum_signed_people: 1007 },
      { age: 0, gender: 'Female', sum_signed_people: -1014 },
      { age: 5, gender: 'Male', sum_signed_people: -1057 },
      { age: 5, gender: 'Female', sum_signed_people: -1064 },
    ]);

    expect(layer.type).toBe(TraceType.STACKED);
  });

  it('leaves a dodged bar with signed values dodged', () => {
    // Dodged series sit side by side rather than either side of a
    // baseline, so the signs are two magnitudes rather than two directions.
    const layer = onlyLayer(
      {
        ...PYRAMID_SPEC,
        encoding: {
          ...PYRAMID_SPEC.encoding,
          yOffset: { field: 'gender' },
        },
      },
      PYRAMID_ROWS,
    );

    expect(layer.type).toBe(TraceType.DODGED);
  });

  it('leaves a normalised bar normalised', () => {
    // A normalised bar divides a total and cannot straddle a baseline.
    const layer = onlyLayer(
      {
        ...PYRAMID_SPEC,
        encoding: {
          ...PYRAMID_SPEC.encoding,
          x: { aggregate: 'sum', field: 'signed_people', stack: 'normalize' },
        },
      },
      PYRAMID_ROWS,
    );

    expect(layer.type).toBe(TraceType.NORMALIZED);
  });

  it('reads a vertical diverging bar', () => {
    const layer = onlyLayer(
      {
        mark: 'bar',
        encoding: {
          x: { field: 'quarter', type: 'nominal' },
          y: { field: 'flow', type: 'quantitative' },
          color: { field: 'direction', type: 'nominal' },
        },
      },
      [
        { quarter: 'Q1', direction: 'In', flow: 40 },
        { quarter: 'Q2', direction: 'In', flow: 55 },
        { quarter: 'Q1', direction: 'Out', flow: -30 },
        { quarter: 'Q2', direction: 'Out', flow: -48 },
      ],
    );

    expect(layer.type).toBe(TraceType.DIVERGING);
    expect(layer.orientation).toBeUndefined();
    expect((layer.data as SegmentedPoint[][])[1]).toEqual([
      { x: 'Q1', y: -30, z: 'Out' },
      { x: 'Q2', y: -48, z: 'Out' },
    ]);
  });
});
