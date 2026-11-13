/**
 * A lollipop, a dumbbell, a median band, a declared fan and a labelled mark
 * are read as one layer wherever their layered spec sits: as a layer of
 * another, a concat child, a facet's panels or a repeated cell, not only at
 * the top level.
 *
 * Each pair was read among a top-level spec's layers alone. Below the top
 * level a lollipop was read as its dots, its stems dropped; a dumbbell as a
 * line whose every value was `NaN` beside its dots; a median band as an
 * error bar beside a second line sounding the medians again.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { BarPoint, Maidr, MaidrLayer, PercentileBandPoint, ScatterPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { afterAll, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

const FRUIT = [
  { panel: 'A', name: 'Apple', n: 28 },
  { panel: 'A', name: 'Banana', n: 55 },
  { panel: 'B', name: 'Apple', n: 38 },
  { panel: 'B', name: 'Banana', n: 65 },
];
const FRUIT_A = FRUIT.filter(row => row.panel === 'A');
const NAME = { field: 'name', type: 'nominal', sort: null };
const N = { field: 'n', type: 'quantitative' };
const LOLLIPOP = [{ mark: 'rule', encoding: { x: NAME, y: N } }, { mark: 'point', encoding: { x: NAME, y: N } }];
const BARS = { mark: 'bar', encoding: { x: NAME, y: N } };

const LIFE = [
  { country: 'Canada', year: '1955', life: 70 },
  { country: 'Canada', year: '2000', life: 80 },
  { country: 'Chile', year: '1955', life: 60 },
  { country: 'Chile', year: '2000', life: 75 },
];
const COUNTRY = { field: 'country', type: 'nominal' };
const DUMBBELL = [
  { mark: 'line', encoding: { y: COUNTRY, x: { field: 'life', type: 'quantitative' }, detail: COUNTRY } },
  { mark: 'point', encoding: { y: COUNTRY, x: { field: 'life', type: 'quantitative' }, color: { field: 'year', type: 'ordinal' } } },
];

const STEP = { field: 'step', type: 'quantitative' };
const LOSS = { field: 'loss', type: 'quantitative' };
const BAND = [
  { mark: { type: 'errorband', extent: 'iqr' }, encoding: { x: STEP, y: LOSS } },
  { mark: 'line', encoding: { x: STEP, y: { ...LOSS, aggregate: 'median' } } },
];
/** The aggregated rows the band's area and the median's line are drawn from. */
const QUARTILES = [
  { panel: 'A', step: 1, median_loss: 3, center_loss: 3, lower_loss: 2, upper_loss: 4 },
  { panel: 'A', step: 2, median_loss: 6, center_loss: 6, lower_loss: 4, upper_loss: 8 },
  { panel: 'B', step: 1, median_loss: 5, center_loss: 5, lower_loss: 4, upper_loss: 7 },
  { panel: 'B', step: 2, median_loss: 9, center_loss: 9, lower_loss: 8, upper_loss: 10 },
];

const FAN_ROWS = [0, 1, 2].map(step => ({ step, p50: step, p5: step - 2, p95: step + 2, p25: step - 1, p75: step + 1 }));
const FAN_X = { field: 'step', type: 'quantitative' };
/** A median line declaring the two named range layers beside it its bands. */
const FAN = [
  { name: 'p5-95', mark: 'area', encoding: { x: FAN_X, y: { field: 'p5', type: 'quantitative' }, y2: { field: 'p95' } } },
  { name: 'p25_75', mark: 'errorband', encoding: { x: FAN_X, y: { field: 'p25', type: 'quantitative' }, y2: { field: 'p75' } } },
  {
    mark: 'line',
    encoding: { x: FAN_X, y: { field: 'p50', type: 'quantitative' } },
    usermeta: { maidr: { type: TraceType.PERCENTILE_BAND, bands: [
      { series: 'p25_75', lower: 0.25, upper: 0.75 },
      { series: 'p5-95', lower: 0.05, upper: 0.95 },
    ] } },
  },
];

/**
 * A mark of the drawn scenegraph, one item per row.
 * @param marktype - What it draws
 * @param name - Its name
 * @param rows - The rows its items are drawn from
 * @returns The mark
 */
function mark(marktype: string, name: string, rows: Array<Record<string, unknown>>): Record<string, unknown> {
  return { marktype, name, items: rows.map(datum => ({ datum })) };
}

/**
 * A compiled view whose marks are drawn inside a group, out of `view.data()`'s
 * reach, as a concat child's and a facet panel's are: a facet's `cell` group
 * draws each panel inside an item whose row holds the panel's facet values.
 * @param name - The group's name
 * @param items - The marks inside each item of the group, and its row
 * @returns The view
 */
function viewDrawing(name: string, items: Array<{ datum?: Record<string, unknown>; marks: Array<Record<string, unknown>> }>): VegaView {
  const root = { marktype: 'group', name: 'root', items: [{ items: [{ marktype: 'group', name, items: items.map(item => ({ datum: item.datum, items: item.marks })) }] }] };
  return {
    data: (name: string) => {
      throw new Error(`no dataset ${name}`);
    },
    container: () => null,
    runAsync: async (): Promise<unknown> => undefined,
    scale: (name: string) => {
      throw new Error(`no scale ${name}`);
    },
    scenegraph: () => ({ root }),
  } as unknown as VegaView;
}

/**
 * Every layer of a chart, panel by panel.
 * @param maidr - The converted chart
 * @returns Its layers
 */
function layersOf(maidr: Maidr): MaidrLayer[] {
  return maidr.subplots.flat().flatMap(subplot => subplot.layers);
}

/**
 * Convert a spec.
 * @param spec - The spec
 * @param view - Its compiled view, if any
 * @returns The chart
 */
function convert(spec: unknown, view?: VegaView): Maidr {
  return vegaLiteToMaidr(spec as VegaLiteSpec, view);
}

describe('vega-lite pairs below the top level', () => {
  it('reads a lollipop that is a nested layer', () => {
    const layers = layersOf(convert({ data: { values: FRUIT_A }, layer: [{ layer: LOLLIPOP }] }));

    // Before: its dots alone, read as a dot plot.
    expect(layers.map(layer => [layer.id, layer.type])).toEqual([['0_0', TraceType.LOLLIPOP]]);
    expect((layers[0].data as BarPoint[]).map(point => point.y)).toEqual([28, 55]);
    expect(layers[0].selectors).toBe('g.mark-rule.role-mark.layer_0_layer_0_marks line');
  });

  it('reads a lollipop that is a concat child', () => {
    const maidr = convert({ hconcat: [{ data: { values: FRUIT_A }, layer: LOLLIPOP }, { data: { values: FRUIT_A }, ...BARS }] });

    const [first] = maidr.subplots[0];

    expect(first.layers.map(layer => [layer.id, layer.type])).toEqual([['0_0', TraceType.LOLLIPOP]]);
    expect(first.layers[0].selectors).toBe('g.mark-rule.role-mark.concat_0_layer_0_marks line');
  });

  it('reads a lollipop in every panel of a facet, from that panel\'s rows', () => {
    const maidr = convert({ data: { values: FRUIT }, facet: { column: { field: 'panel' } }, spec: { layer: LOLLIPOP } });

    const panels = maidr.subplots[0];

    expect(panels.map(panel => panel.layers.map(layer => layer.type))).toEqual([[TraceType.LOLLIPOP], [TraceType.LOLLIPOP]]);
    expect(panels.map(panel => (panel.layers[0].data as BarPoint[]).map(point => point.y))).toEqual([[28, 55], [38, 65]]);
    expect(panels[1].layers[0].selectors).toBe('g[data-maidr-cell="vl-chart-0-1"] g.mark-rule.role-mark.child_layer_0_marks line');
  });

  it('reads a lollipop in a repeated cell', () => {
    const repeated = { field: { repeat: 'column' }, type: 'quantitative' };
    const maidr = convert({
      data: { values: FRUIT_A },
      repeat: { column: ['n'] },
      spec: { layer: LOLLIPOP.map(layer => ({ ...layer, encoding: { x: NAME, y: repeated } })) },
    });

    const [cell] = maidr.subplots[0];

    expect(cell.layers.map(layer => layer.type)).toEqual([TraceType.LOLLIPOP]);
    expect(cell.layers[0].selectors).toBe('g.mark-rule.role-mark.child__column_n_layer_0_marks line');
  });

  it('reads a dumbbell that is a concat child', () => {
    const maidr = convert({ hconcat: [{ data: { values: LIFE }, layer: DUMBBELL }, { data: { values: FRUIT_A }, ...BARS }] });

    const [first] = maidr.subplots[0];

    // Before: a line of NaNs beside the dots.
    expect(first.layers.map(layer => layer.type)).toEqual([TraceType.DUMBBELL]);
    expect(first.layers[0].selectors).toBe('g.mark-line.role-mark.concat_0_layer_0_marks path');
  });

  it('reads a median band that is a concat child, from the rows its marks are drawn from', () => {
    const quartiles = QUARTILES.filter(row => row.panel === 'A');
    const view = viewDrawing('concat_0_group', [{ marks: [
      mark('area', 'concat_0_layer_0_layer_0_marks', quartiles),
      mark('line', 'concat_0_layer_1_marks', quartiles),
    ] }]);

    const [first] = convert({ hconcat: [{ layer: BAND }, { data: { values: FRUIT_A }, ...BARS }] }, view).subplots[0];

    // Before: an error bar beside a second line.
    expect(first.layers.map(layer => layer.type)).toEqual([TraceType.PERCENTILE_BAND]);
    expect((first.layers[0].data as PercentileBandPoint[]).map(point => point.quantiles.map(q => q.value))).toEqual([[2, 3, 4], [4, 6, 8]]);
    expect(first.layers[0].selectors).toEqual([
      'g.mark-area.role-mark.concat_0_layer_0_layer_0_marks > path',
      'g.mark-line.role-mark.concat_0_layer_1_marks > path',
    ]);
  });

  it('reads a median band in every panel of a facet, from that panel\'s drawn rows', () => {
    // The quartiles are aggregated after the rows are split into panels, so
    // the drawn rows do not hold their panel.
    const panel = (key: string): { datum: Record<string, unknown>; marks: Array<Record<string, unknown>> } => {
      const rows = QUARTILES.filter(row => row.panel === key).map(({ panel: _, ...row }) => row);
      return { datum: { panel: key }, marks: [mark('area', 'child_layer_0_layer_0_marks', rows), mark('line', 'child_layer_1_marks', rows)] };
    };
    const spec = { data: { values: QUARTILES.map(({ panel: key, step }) => ({ panel: key, step, loss: 1 })) }, facet: { column: { field: 'panel' } }, spec: { layer: BAND } };

    const panels = convert(spec, viewDrawing('cell', [panel('A'), panel('B')])).subplots[0];

    expect(panels.map(cell => cell.layers.map(layer => layer.type))).toEqual([[TraceType.PERCENTILE_BAND], [TraceType.PERCENTILE_BAND]]);
    expect((panels[1].layers[0].data as PercentileBandPoint[]).map(point => point.quantiles.map(q => q.value))).toEqual([[4, 5, 7], [8, 9, 10]]);
    expect(panels[1].layers[0].selectors).toEqual([
      'g[data-maidr-cell="vl-chart-0-1"] g.mark-area.role-mark.child_layer_0_layer_0_marks > path',
      'g[data-maidr-cell="vl-chart-0-1"] g.mark-line.role-mark.child_layer_1_marks > path',
    ]);
  });

  // Measured on vega-lite 5.23.0 with vega 5.33.1: a named band's marks keep
  // its own name wherever the fan sits but in a repeated cell, which puts the
  // cell's name before it; the unnamed median line is `layer_2` of the layered
  // spec the fan is, named by the path to it.
  it.each([
    [
      'a concat child',
      { hconcat: [{ data: { values: FAN_ROWS }, layer: FAN }] },
      [
        'g.mark-area.role-mark.p5_95_marks > path',
        'g.mark-area.role-mark.p25_75_layer_0_marks > path',
        'g.mark-line.role-mark.concat_0_layer_2_marks > path',
      ],
    ],
    [
      'a nested layer',
      { data: { values: FAN_ROWS }, layer: [{ layer: FAN }] },
      [
        'g.mark-area.role-mark.p5_95_marks > path',
        'g.mark-area.role-mark.p25_75_layer_0_marks > path',
        'g.mark-line.role-mark.layer_0_layer_2_marks > path',
      ],
    ],
    [
      'a facet\'s panel',
      { data: { values: FAN_ROWS.map(row => ({ ...row, panel: 'A' })) }, facet: { column: { field: 'panel' } }, spec: { layer: FAN } },
      [
        'g[data-maidr-cell="vl-chart-0-0"] g.mark-area.role-mark.p5_95_marks > path',
        'g[data-maidr-cell="vl-chart-0-0"] g.mark-area.role-mark.p25_75_layer_0_marks > path',
        'g[data-maidr-cell="vl-chart-0-0"] g.mark-line.role-mark.child_layer_2_marks > path',
      ],
    ],
    [
      'a repeated cell',
      {
        data: { values: FAN_ROWS },
        repeat: { column: ['p50'] },
        spec: { layer: [FAN[0], FAN[1], { ...FAN[2], encoding: { x: FAN_X, y: { field: { repeat: 'column' }, type: 'quantitative' } } }] },
      },
      [
        'g.mark-area.role-mark.child__column_p50_p5_95_marks > path',
        'g.mark-area.role-mark.child__column_p50_p25_75_layer_0_marks > path',
        'g.mark-line.role-mark.child__column_p50_layer_2_marks > path',
      ],
    ],
  ])('reads a declared fan that is %s, its marks named as they are drawn', (_, spec, selectors) => {
    const [first] = convert(spec).subplots[0];

    // Before: an area, an error bar and a line under names no mark is drawn
    // with, and nothing at all in a facet. In a repeated cell, a band named
    // no mark until the cell's name was put before its own.
    expect(first.layers.map(layer => layer.type)).toEqual([TraceType.PERCENTILE_BAND]);
    expect(first.layers[0].selectors).toEqual(selectors);
  });

  it('gives the labels of a concat child to the points they label', () => {
    const rows = [{ x: 1, y: 3, who: 'Aa' }, { x: 2, y: 5, who: 'Bb' }];
    const X = { field: 'x', type: 'quantitative' };
    const Y = { field: 'y', type: 'quantitative' };
    const spec = { hconcat: [{ data: { values: rows }, layer: [{ mark: 'point', encoding: { x: X, y: Y } }, { mark: 'text', encoding: { x: X, y: Y, text: { field: 'who' } } }] }] };

    const [first] = convert(spec).subplots[0];

    // Before: the points, and the labels again as a second scatter.
    expect(first.layers.map(layer => layer.type)).toEqual([TraceType.SCATTER]);
    expect((first.layers[0].data as ScatterPoint[]).map(point => point.label)).toEqual(['Aa', 'Bb']);
  });
});
