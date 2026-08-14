import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { BarPoint, DumbbellData, MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { Orientation, TraceType } from '@type/grammar';
import { makeView } from './fixtures/testView';

const MEDALS = [
  { country: 'Norway', medals: 37 },
  { country: 'Germany', medals: 31 },
  { country: 'Canada', medals: 29 },
];

/** A lollipop: a stem from the baseline, then the head on top of it. */
const lollipopSpec: VegaLiteSpec = {
  data: { values: MEDALS },
  encoding: {
    x: { field: 'country', type: 'nominal', title: 'Country' },
    y: { field: 'medals', type: 'quantitative', title: 'Medals' },
  },
  layer: [
    { mark: 'rule' },
    { mark: { type: 'point' } },
  ],
};

const LIFE = [
  { country: 'Chile', year: 1995, life: 75.1 },
  { country: 'Chile', year: 2000, life: 77.3 },
  { country: 'Mexico', year: 1995, life: 73.5 },
  { country: 'Mexico', year: 2000, life: 74.8 },
];

/**
 * Vega-Lite's own "Ranged Dot Plot": one connector per country carrying the
 * pair, and a dot layer whose colour tells the two years apart.
 */
const dumbbellSpec: VegaLiteSpec = {
  data: { values: LIFE },
  encoding: {
    x: { field: 'life', type: 'quantitative', title: 'Life Expectancy' },
    y: { field: 'country', type: 'nominal', title: 'Country' },
  },
  layer: [
    { mark: 'line', encoding: { detail: { field: 'country', type: 'nominal' } } },
    {
      mark: { type: 'point' },
      encoding: { color: { field: 'year', type: 'ordinal', title: 'Year' } },
    },
  ],
};

/**
 * The datasets a two-layer spec compiles to: both layers draw the same
 * rows, and Vega registers each layer's mark items under its own name.
 * Layered specs always resolve their rows through the view, so every test
 * here supplies one.
 */
function datasetsFor(rows: Record<string, unknown>[]): Record<string, unknown[]> {
  return {
    data_0: rows,
    layer_0_marks: rows.map(datum => ({ datum })),
    layer_1_marks: rows.map(datum => ({ datum })),
  };
}

function convertLayers(
  spec: VegaLiteSpec,
  rows: Record<string, unknown>[],
  scales?: Record<string, unknown[]>,
): MaidrLayer[] {
  const result = vegaLiteToMaidr(spec, makeView(datasetsFor(rows), scales));
  return result.subplots[0][0].layers;
}

function onlyLayer(
  spec: VegaLiteSpec,
  rows: Record<string, unknown>[],
  scales?: Record<string, unknown[]>,
): MaidrLayer {
  const layers = convertLayers(spec, rows, scales);
  expect(layers).toHaveLength(1);
  return layers[0];
}

describe('vega-Lite segment-plus-dot layers', () => {
  it('collapses a rule and its dots into one lollipop layer', () => {
    const layer = onlyLayer(lollipopSpec, MEDALS);

    expect(layer.type).toBe(TraceType.LOLLIPOP);
    expect(layer.data as BarPoint[]).toEqual([
      { x: 'Norway', y: 37 },
      { x: 'Germany', y: 31 },
      { x: 'Canada', y: 29 },
    ]);
    // The stem, not the head: it is one <line> per category and it spans
    // the magnitude being announced.
    expect(layer.selectors).toBe('g.mark-rule.role-mark.layer_0_marks line');
    expect(layer.axes?.x?.label).toBe('Country');
    expect(layer.axes?.y?.label).toBe('Medals');
    expect(layer.orientation).toBeUndefined();
  });

  it('flips a horizontal lollipop the way a bar chart flips', () => {
    const layer = onlyLayer({
      ...lollipopSpec,
      encoding: {
        y: { field: 'country', type: 'nominal' },
        x: { field: 'medals', type: 'quantitative' },
      },
    }, MEDALS);

    expect(layer.type).toBe(TraceType.LOLLIPOP);
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect((layer.data as BarPoint[])[0]).toEqual({ x: 37, y: 'Norway' });
  });

  it('collapses a ranged dot plot into one dumbbell layer', () => {
    const layer = onlyLayer(
      dumbbellSpec,
      LIFE,
      // The colour scale's domain is the order the chart draws the ends in.
      { color: [1995, 2000] },
    );

    expect(layer.type).toBe(TraceType.DUMBBELL);
    expect(layer.data as DumbbellData).toEqual({
      points: [
        { x: 'Chile', start: 75.1, end: 77.3 },
        { x: 'Mexico', start: 73.5, end: 74.8 },
      ],
      // The whole content of the comparison: without them a reader is told
      // which dot they are on but not which year it is.
      startLabel: '1995',
      endLabel: '2000',
    });
    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    // Vega draws one <path> per `detail` group, so the connector layer has
    // exactly one element per row — where the dot layer has two.
    expect(layer.selectors).toBe('g.mark-line.role-mark.layer_0_marks path');
  });

  it('names the two ends from the data when the view exposes no colour scale', () => {
    const layer = onlyLayer(dumbbellSpec, LIFE);

    const data = layer.data as DumbbellData;
    expect(data.startLabel).toBe('1995');
    expect(data.endLabel).toBe('2000');
    expect(data.points).toHaveLength(2);
  });

  it('leaves a three-value group alone rather than call it a dumbbell', () => {
    const layers = convertLayers(
      dumbbellSpec,
      [...LIFE, { country: 'Chile', year: 2005, life: 78.5 }],
    );

    // Three values per category is not a pair, and reading it as one would
    // drop a row per category. The dots read as the dot plot they are, and
    // the connector converts on its own terms.
    expect(layers.map(layer => layer.type)).toEqual([TraceType.LINE, TraceType.DOT]);
  });

  it('leaves a mean rule over a histogram as two independent layers', () => {
    // The rule draws a different quantity from the layer under it, so
    // there is nothing to collapse — and the point layer that would make
    // it a pair is absent.
    const result = vegaLiteToMaidr({
      data: { values: [{ n: 1 }, { n: 2 }, { n: 2 }] },
      layer: [
        {
          mark: 'bar',
          encoding: {
            x: { field: 'n', type: 'quantitative', bin: true },
            y: { aggregate: 'count', type: 'quantitative' },
          },
        },
        {
          mark: 'rule',
          encoding: { x: { field: 'n', type: 'quantitative', aggregate: 'mean' } },
        },
      ],
    });

    expect(result.subplots[0][0].layers.map(l => l.type)).toEqual([TraceType.HISTOGRAM]);
  });

  it('leaves a line with a point overlay a line and a scatter', () => {
    // Both channels are magnitudes, so this is not a category-and-value
    // chart and the pair test does not apply.
    const result = vegaLiteToMaidr({
      data: { values: [{ a: 1, b: 2 }, { a: 2, b: 4 }] },
      encoding: {
        x: { field: 'a', type: 'quantitative' },
        y: { field: 'b', type: 'quantitative' },
      },
      layer: [{ mark: 'line' }, { mark: 'point' }],
    });

    expect(result.subplots[0][0].layers.map(l => l.type))
      .toEqual([TraceType.LINE, TraceType.SCATTER]);
  });
});
