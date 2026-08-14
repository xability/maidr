import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { MaidrLayer, ViolinKdePoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { TraceType } from '@type/grammar';
import { makeView } from './fixtures/testView';

/**
 * The Vega-Lite gallery's "Faceted Density Plot", which is a ridgeline:
 * one `area` per row facet, drawn from a `density` transform grouped by
 * the facet field, with the panels flush against each other so the curves
 * read as a stack of ridges.
 */
const RIDGELINE_SPEC: VegaLiteSpec = {
  title: 'Seattle Weather',
  mark: 'area',
  transform: [
    { density: 'temp', groupby: ['month'], extent: [0, 30], steps: 4 },
  ],
  encoding: {
    x: { field: 'value', type: 'quantitative', title: 'Maximum Daily Temperature (C)' },
    y: { field: 'density', type: 'quantitative', stack: 'zero' },
    row: { field: 'month', type: 'ordinal', title: 'Month' },
  },
};

/**
 * The density pipeline as vega-lite 6.4.3 / vega 6.3.1 compile it, rounded
 * for legibility: five samples over a shared extent, one block per group,
 * in the order the source rows declared the groups (Jan, Apr, Jul).
 *
 * The three groups peak in different places — Jan at 7.5, Apr at 15, Jul
 * at 22.5 — so a mis-assigned curve is unmistakable.
 */
const DENSITY_ROWS = [
  { month: 'Jan', value: 0, density: 0.0000053 },
  { month: 'Jan', value: 7.5, density: 0.1922 },
  { month: 'Jan', value: 15, density: 0.0000001 },
  { month: 'Jan', value: 22.5, density: 0 },
  { month: 'Jan', value: 30, density: 0 },
  { month: 'Apr', value: 0, density: 0 },
  { month: 'Apr', value: 7.5, density: 0.0000000074 },
  { month: 'Apr', value: 15, density: 0.1822 },
  { month: 'Apr', value: 22.5, density: 0.0000322 },
  { month: 'Apr', value: 30, density: 0 },
  { month: 'Jul', value: 0, density: 0 },
  { month: 'Jul', value: 7.5, density: 0 },
  { month: 'Jul', value: 15, density: 0 },
  { month: 'Jul', value: 22.5, density: 0.0367 },
  { month: 'Jul', value: 30, density: 0.0176 },
];

/**
 * The `cell` dataset: Vega's own panel items, in the order it laid them
 * out. Note it is **not** the order the rows declare the groups in — Vega
 * sorts the facet domain, so `["Jan", "Apr", "Jul"]` renders as Apr, Jan,
 * Jul. Captured from a real compiled view.
 */
const CELL_ITEMS = [
  { datum: { month: 'Apr', count: 5 } },
  { datum: { month: 'Jan', count: 5 } },
  { datum: { month: 'Jul', count: 5 } },
];

/**
 * The un-ordered `aggregate` behind the facet header, in first-seen order.
 * Present so the test proves the converter does *not* take its order.
 */
const ROW_DOMAIN = [
  { month: 'Jan', count: 5 },
  { month: 'Apr', count: 5 },
  { month: 'Jul', count: 5 },
];

const VIEW_DATASETS = {
  data_0: DENSITY_ROWS,
  row_domain: ROW_DOMAIN,
  cell: CELL_ITEMS,
};

/**
 * Convert a spec and assert it produced a single-panel, single-layer chart.
 * @param spec The Vega-Lite spec to convert
 * @param datasets The compiled view's datasets
 * @returns The single converted layer
 */
function onlyLayer(
  spec: VegaLiteSpec,
  datasets: Record<string, unknown[]> = VIEW_DATASETS,
): MaidrLayer {
  const result = vegaLiteToMaidr(spec, makeView(datasets));
  expect(result.subplots).toHaveLength(1);
  expect(result.subplots[0]).toHaveLength(1);
  const layers = result.subplots[0][0].layers;
  expect(layers).toHaveLength(1);
  return layers[0];
}

describe('vega-Lite row-faceted density plots', () => {
  it('collapses the panel grid into one ridgeline layer', () => {
    const layer = onlyLayer(RIDGELINE_SPEC);

    // Read as a facet this is three AREA subplots the reader has to page
    // between, which is the comparison the chart exists to make.
    expect(layer.type).toBe(TraceType.RIDGELINE);
  });

  it('carries one curve per group, value and density apart', () => {
    const layer = onlyLayer(RIDGELINE_SPEC);
    const curves = layer.data as ViolinKdePoint[][];

    expect(curves).toHaveLength(3);
    expect(curves[1]).toEqual([
      { x: 'Jan', y: 0, density: 0.0000053 },
      { x: 'Jan', y: 7.5, density: 0.1922 },
      { x: 'Jan', y: 15, density: 0.0000001 },
      { x: 'Jan', y: 22.5, density: 0 },
      { x: 'Jan', y: 30, density: 0 },
    ]);
  });

  it('orders the curves the way Vega laid the panels out', () => {
    const layer = onlyLayer(RIDGELINE_SPEC);

    // Vega sorts the facet domain before laying the cells out, so the
    // rendered order is Apr, Jan, Jul — not the `row_domain` order the
    // rows arrive in. One selector resolves every ridge in DOM order, so
    // taking `row_domain` would light the wrong curve for two of three.
    expect((layer.data as ViolinKdePoint[][]).map(curve => curve[0].x))
      .toEqual(['Apr', 'Jan', 'Jul']);
  });

  it('falls back to a sorted domain when the view cannot say', () => {
    // Vega's default facet sort is ascending, so the sorted distinct
    // values are the same answer whenever `cell` is unreachable.
    const layer = onlyLayer(RIDGELINE_SPEC, { data_0: DENSITY_ROWS });

    expect((layer.data as ViolinKdePoint[][]).map(curve => curve[0].x))
      .toEqual(['Apr', 'Jan', 'Jul']);
  });

  it('highlights one element per ridge', () => {
    const layer = onlyLayer(RIDGELINE_SPEC);

    // Vega draws each cell's area as a single `<path>` under the shared
    // `child_marks` class — one element per group, which is what
    // `RidgelineTrace` pairs its curves with. No per-cell scoping: the
    // layer is the whole chart rather than one panel of it.
    expect(layer.selectors).toBe(
      'g.mark-area.role-mark.child_marks path, '
      + 'g.mark-area.role-mark.child_layer_0_marks path',
    );
  });

  it('names the value axis and the dimension the groups vary along', () => {
    const layer = onlyLayer(RIDGELINE_SPEC);

    expect(layer.axes?.x?.label).toBe('Maximum Daily Temperature (C)');
    expect(layer.axes?.y?.label).toBe('Month');
    expect(layer.axes?.z?.label).toBe('Month');
  });

  it('reads the same chart declared with the facet operator', () => {
    const layer = onlyLayer({
      title: 'Seattle Weather',
      facet: { row: { field: 'month', type: 'ordinal', title: 'Month' } },
      spec: {
        mark: 'area',
        transform: [{ density: 'temp', groupby: ['month'], extent: [0, 30], steps: 4 }],
        encoding: {
          x: { field: 'value', type: 'quantitative' },
          y: { field: 'density', type: 'quantitative' },
        },
      },
    });

    expect(layer.type).toBe(TraceType.RIDGELINE);
    expect(layer.data as ViolinKdePoint[][]).toHaveLength(3);
  });

  it('reads a ridgeline turned on its side', () => {
    const layer = onlyLayer({
      ...RIDGELINE_SPEC,
      encoding: {
        x: { field: 'density', type: 'quantitative' },
        y: { field: 'value', type: 'quantitative', title: 'Temperature' },
        row: { field: 'month', type: 'ordinal' },
      },
    });

    expect(layer.type).toBe(TraceType.RIDGELINE);
    expect(layer.axes?.x?.label).toBe('Temperature');
    expect((layer.data as ViolinKdePoint[][])[0][1])
      .toEqual({ x: 'Apr', y: 7.5, density: 0.0000000074 });
  });

  it('honours the output column names a density transform declares', () => {
    const rows = DENSITY_ROWS.map(({ value, density, ...rest }) => ({
      ...rest,
      temp: value,
      pdf: density,
    }));
    const layer = onlyLayer(
      {
        ...RIDGELINE_SPEC,
        transform: [{ density: 'temp', groupby: ['month'], as: ['temp', 'pdf'] }],
        encoding: {
          x: { field: 'temp', type: 'quantitative' },
          y: { field: 'pdf', type: 'quantitative' },
          row: { field: 'month', type: 'ordinal' },
        },
      },
      { data_0: rows, cell: CELL_ITEMS },
    );

    expect(layer.type).toBe(TraceType.RIDGELINE);
    expect((layer.data as ViolinKdePoint[][])[0][2])
      .toEqual({ x: 'Apr', y: 15, density: 0.1822 });
  });
});

describe('vega-Lite facets that are not ridgelines', () => {
  /**
   * Convert a spec and return its panel grid.
   * @param spec The Vega-Lite spec to convert
   * @returns The converted subplot grid
   */
  function subplots(spec: VegaLiteSpec): ReturnType<typeof vegaLiteToMaidr>['subplots'] {
    return vegaLiteToMaidr(spec, makeView(VIEW_DATASETS)).subplots;
  }

  it('leaves a column facet a panel grid', () => {
    // Columns of curves are not offset ridges; they are small multiples.
    const grid = subplots({
      ...RIDGELINE_SPEC,
      encoding: {
        ...RIDGELINE_SPEC.encoding,
        row: undefined,
        column: { field: 'month', type: 'ordinal' },
      },
    });

    expect(grid[0]).toHaveLength(3);
    expect(grid[0][0].layers[0].type).toBe(TraceType.AREA);
  });

  it('leaves a faceted area without a density transform a panel grid', () => {
    // Without one the panels are magnitudes rather than estimates, and
    // `y` is not a density at all.
    const grid = subplots({ ...RIDGELINE_SPEC, transform: undefined });

    expect(grid).toHaveLength(3);
    expect(grid[0][0].layers[0].type).toBe(TraceType.AREA);
  });

  it('leaves a density faceted by some other field a panel grid', () => {
    // A density grouped by one field and faceted by another draws the same
    // curve in every panel, which is not a ridge per group.
    const grid = subplots({
      ...RIDGELINE_SPEC,
      transform: [{ density: 'temp', groupby: ['site'], extent: [0, 30] }],
    });

    expect(grid).toHaveLength(3);
    expect(grid[0][0].layers[0].type).toBe(TraceType.AREA);
  });

  it('leaves a faceted line a panel grid', () => {
    const grid = subplots({ ...RIDGELINE_SPEC, mark: 'line' });

    expect(grid).toHaveLength(3);
    expect(grid[0][0].layers[0].type).toBe(TraceType.LINE);
  });

  it('leaves a single-group facet a panel grid', () => {
    // One ridge is a density plot, which the panel path already reads.
    const oneGroup = DENSITY_ROWS.filter(row => row.month === 'Jan');
    const grid = vegaLiteToMaidr(
      RIDGELINE_SPEC,
      makeView({ data_0: oneGroup, cell: [CELL_ITEMS[1]] }),
    ).subplots;

    expect(grid).toHaveLength(1);
    expect(grid[0][0].layers[0].type).toBe(TraceType.AREA);
  });
});
