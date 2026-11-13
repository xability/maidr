/**
 * A layer of a faceted spec is read in each panel from the marks it draws in
 * that panel's cell, and left out of a panel where it draws none.
 *
 * Each layer's rows were its dataset's, matched to it by position and split
 * by the facet values, so a layer whose own filter keeps it out of a panel
 * was read there all the same, from rows it does not draw, and a layered
 * panel's summed bars were read from the rows before the sum: `alt.layer(
 * bars, labels).facet(...)` was announced as one bar per row rather than
 * per category.
 *
 * The tables and the drawn marks are as vega-lite 5.23.0 compiles these
 * specs and vega 5.33.1 runs them.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { BarPoint, LinePoint, MaidrSubplot } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { makeView } from './fixtures/testView';

const ROWS = [
  { panel: 'A', cat: 'p', series: 's1', v: 10 },
  { panel: 'A', cat: 'p', series: 's2', v: 20 },
  { panel: 'A', cat: 'q', series: 's1', v: 30 },
  { panel: 'A', cat: 'q', series: 's2', v: 40 },
  { panel: 'B', cat: 'p', series: 's1', v: 50 },
  { panel: 'B', cat: 'p', series: 's2', v: 60 },
  { panel: 'B', cat: 'q', series: 's1', v: 70 },
  { panel: 'B', cat: 'q', series: 's2', v: 80 },
];
const CAT = { field: 'cat', type: 'nominal' };
const SUM = { field: 'v', type: 'quantitative', aggregate: 'sum' };
const MEAN = { field: 'v', type: 'quantitative', aggregate: 'mean' };
const ONLY_A = [{ filter: 'datum.panel === \'A\'' }];
const BARS = { mark: 'bar', encoding: { x: CAT, y: SUM } };

const SUMS = [{ cat: 'p', panel: 'A', sum_v: 30 }, { cat: 'q', panel: 'A', sum_v: 70 }, { cat: 'p', panel: 'B', sum_v: 110 }, { cat: 'q', panel: 'B', sum_v: 150 }];
const MEANS = [{ cat: 'p', panel: 'A', mean_v: 15 }, { cat: 'q', panel: 'A', mean_v: 35 }, { cat: 'p', panel: 'B', mean_v: 55 }, { cat: 'q', panel: 'B', mean_v: 75 }];

/**
 * A drawn mark, one item per row.
 * @param marktype - What it draws
 * @param name - Its name
 * @param rows - Its items' rows
 * @returns The mark
 */
function mark(marktype: string, name: string, rows: Array<Record<string, unknown>>): Record<string, unknown> {
  return { marktype, name, items: rows.map(datum => ({ datum })) };
}

/**
 * The rows a summed or averaged mark draws in a panel, which carry no panel.
 * @param rows - The aggregated rows of every panel
 * @param panel - The panel
 * @returns Its rows
 */
function inPanel(rows: Array<Record<string, unknown>>, panel: string): Array<Record<string, unknown>> {
  return rows.filter(row => row.panel === panel).map(({ panel: _panel, ...row }) => row);
}

/**
 * A compiled facet: its tables, and the marks each panel's cell draws.
 * @param tables - The tables `view.data()` answers for
 * @param a - The marks panel A draws
 * @param b - The marks panel B draws
 * @returns The view
 */
function facet(tables: Record<string, unknown[]>, a: unknown[], b: unknown[]): VegaView {
  const cell = (panel: string, marks: unknown[]): Record<string, unknown> => ({ datum: { panel, count: 4 }, items: marks });
  const root = { marktype: 'group', name: 'root', items: [{ items: [{ marktype: 'group', name: 'cell', items: [cell('A', a), cell('B', b)] }] }] };
  return Object.assign(makeView(tables), { scenegraph: () => ({ root }) });
}

/**
 * Each layer of a panel, its type and its values.
 * @param panel - The panel
 * @returns Its layers, read
 */
function read(panel: MaidrSubplot): Array<[TraceType, unknown[]]> {
  return panel.layers.map((layer) => {
    const points = Array.isArray(layer.data) ? (layer.data as Array<BarPoint | LinePoint[]>).flat() : [];
    return [layer.type, (points as Array<{ y: unknown }>).map(point => point.y)];
  });
}

/**
 * Convert a faceted spec of the rows.
 * @param layer - The layers each panel draws
 * @param view - The compiled view
 * @returns The panels
 */
function panels(layer: unknown[], view: VegaView): MaidrSubplot[] {
  const spec = { data: { values: ROWS }, facet: { column: { field: 'panel' } }, spec: { layer } };
  return vegaLiteToMaidr(spec as unknown as VegaLiteSpec, view).subplots[0];
}

describe('a vega-lite facet\'s layers, read from the marks each panel draws', () => {
  it('leaves a layer out of the panel its own filter keeps it out of', () => {
    const view = facet(
      { source_0: ROWS, data_2: SUMS.slice(0, 2), data_3: MEANS },
      [mark('rect', 'child_layer_0_marks', inPanel(SUMS, 'A')), mark('line', 'child_layer_1_marks', inPanel(MEANS, 'A'))],
      [mark('rect', 'child_layer_0_marks', []), mark('line', 'child_layer_1_marks', inPanel(MEANS, 'B'))],
    );

    const [a, b] = panels([{ ...BARS, transform: ONLY_A }, { mark: 'line', encoding: { x: CAT, y: MEAN } }], view);

    // Before: bars in B too, and in both panels a bar and a point per row.
    expect(read(a)).toEqual([[TraceType.BAR, [30, 70]], [TraceType.LINE, [15, 35]]]);
    expect(read(b)).toEqual([[TraceType.LINE, [55, 75]]]);
  });

  it('leaves a line split into series out of the panel its own filter keeps it out of', () => {
    // A series line is drawn one group per series inside its `_pathgroup`,
    // which holds none where the line draws nothing.
    const series = (key: string, rows: Array<Record<string, unknown>>): Record<string, unknown> =>
      ({ items: [mark('line', 'child_layer_1_marks', rows.filter(row => row.series === key))] });
    const lines = [
      { cat: 'p', series: 's1', mean_v: 10 },
      { cat: 'q', series: 's1', mean_v: 30 },
      { cat: 'p', series: 's2', mean_v: 20 },
      { cat: 'q', series: 's2', mean_v: 40 },
    ];
    const view = facet(
      { source_0: ROWS, data_2: SUMS, data_3: lines.map(row => ({ ...row, panel: 'A' })) },
      [
        mark('rect', 'child_layer_0_marks', inPanel(SUMS, 'A')),
        { marktype: 'group', name: 'child_layer_1_pathgroup', items: [series('s1', lines), series('s2', lines)] },
      ],
      [mark('rect', 'child_layer_0_marks', inPanel(SUMS, 'B')), { marktype: 'group', name: 'child_layer_1_pathgroup', items: [] }],
    );

    const [a, b] = panels([BARS, { mark: 'line', transform: ONLY_A, encoding: { x: CAT, y: MEAN, color: { field: 'series', type: 'nominal' } } }], view);

    // Before: the line in B too, from B's rows.
    expect(read(a)).toEqual([[TraceType.BAR, [30, 70]], [TraceType.LINE, [10, 30, 20, 40]]]);
    expect(read(b)).toEqual([[TraceType.BAR, [110, 150]]]);
  });

  it('leaves a pair out of the panel its own filter keeps it out of', () => {
    const raw = ROWS.filter(row => row.panel === 'A');
    const view = facet(
      { source_0: ROWS, data_2: raw, data_3: SUMS },
      [mark('rule', 'child_layer_0_marks', raw), mark('symbol', 'child_layer_1_marks', raw), mark('rect', 'child_layer_2_marks', inPanel(SUMS, 'A'))],
      [mark('rule', 'child_layer_0_marks', []), mark('symbol', 'child_layer_1_marks', []), mark('rect', 'child_layer_2_marks', inPanel(SUMS, 'B'))],
    );
    const V = { field: 'v', type: 'quantitative' };

    const [, b] = panels([
      { mark: 'rule', transform: ONLY_A, encoding: { x: CAT, y: V } },
      { mark: 'point', transform: ONLY_A, encoding: { x: CAT, y: V } },
      BARS,
    ], view);

    // Before: B's rows as the points of the pair, and as its bars unsummed.
    expect(read(b)).toEqual([[TraceType.BAR, [110, 150]]]);
  });

  it('reads no fan in the panel its own filter keeps it out of', () => {
    const steps = [0, 1].flatMap(step => ['A', 'B'].map(panel => ({ panel, step, p5: step - 2, p50: step, p95: step + 2 })));
    const inA = steps.filter(row => row.panel === 'A');
    const X = { field: 'step', type: 'quantitative' };
    const view = facet(
      { source_0: steps, data_2: inA },
      [mark('area', 'p5_95_marks', inA), mark('line', 'child_layer_1_marks', inA), mark('symbol', 'child_layer_2_marks', inA)],
      [mark('area', 'p5_95_marks', []), mark('line', 'child_layer_1_marks', []), mark('symbol', 'child_layer_2_marks', steps.filter(row => row.panel === 'B'))],
    );
    const spec = {
      data: { values: steps },
      facet: { column: { field: 'panel' } },
      spec: { layer: [
        { name: 'p5-95', mark: 'area', transform: ONLY_A, encoding: { x: X, y: { field: 'p5', type: 'quantitative' }, y2: { field: 'p95' } } },
        { mark: 'line', transform: ONLY_A, encoding: { x: X, y: { field: 'p50', type: 'quantitative' } }, usermeta: { maidr: { type: TraceType.PERCENTILE_BAND, bands: [{ series: 'p5-95', lower: 0.05, upper: 0.95 }] } } },
        { mark: 'point', encoding: { x: X, y: { field: 'p50', type: 'quantitative' } } },
      ] },
    };

    const [a, b] = vegaLiteToMaidr(spec as unknown as VegaLiteSpec, view).subplots[0];

    // Before: a fan in B too, read from B's rows. A fan of no points would be
    // a layer MAIDR cannot read.
    expect(a.layers.map(layer => layer.type)).toContain(TraceType.PERCENTILE_BAND);
    expect(b.layers.map(layer => layer.type)).not.toContain(TraceType.PERCENTILE_BAND);
  });

  it('reads a panel\'s summed bars from the bars it draws', () => {
    const view = facet(
      { source_0: ROWS, data_2: SUMS },
      [mark('rect', 'child_layer_0_marks', inPanel(SUMS, 'A')), mark('text', 'child_layer_1_marks', inPanel(SUMS, 'A'))],
      [mark('rect', 'child_layer_0_marks', inPanel(SUMS, 'B')), mark('text', 'child_layer_1_marks', inPanel(SUMS, 'B'))],
    );

    const [a, b] = panels([BARS, { mark: { type: 'text', dy: -5 }, encoding: { x: CAT, y: SUM, text: SUM } }], view);

    // Before: a bar per row, 10, 20, 30 and 40 in A, beside their labels' sums.
    expect(read(a)).toEqual([[TraceType.BAR, [30, 70]]]);
    expect(read(b)).toEqual([[TraceType.BAR, [110, 150]]]);
  });
});

describe('a vega-lite pair outside a facet whose marks draw no item', () => {
  // A lollipop whose layers' own filter keeps all of it out, as vega 5.33.1
  // gives it before and after it runs: before, every table throws and no
  // mark is drawn; after, the marks draw no item and their tables are
  // `undefined`.
  const LOLLIPOP = [{ cat: 'p', v: 10 }, { cat: 'q', v: 30 }, { cat: 'r', v: 20 }];
  const V = { field: 'v', type: 'quantitative' };
  const NONE = [{ filter: 'false' }];
  const spec = { data: { values: LOLLIPOP }, layer: [
    { mark: 'rule', transform: NONE, encoding: { x: CAT, y: V } },
    { mark: 'point', transform: NONE, encoding: { x: CAT, y: V } },
  ] };
  const drawing = (view: VegaView, marks: unknown[]): VegaView =>
    Object.assign(view, { scenegraph: () => ({ root: { marktype: 'group', name: 'root', items: [{ items: marks }] } }) });
  const notRun = drawing(makeView({}), []);
  const run = drawing(
    makeView({ source_0: LOLLIPOP, data_0: [], layer_0_marks: undefined, layer_1_marks: undefined } as unknown as Record<string, unknown[]>),
    [mark('rule', 'layer_0_marks', []), mark('symbol', 'layer_1_marks', [])],
  );

  it.each([['not yet run', notRun], ['run', run]])('reads the pair from its data, as before, in a view %s', (_stage, view) => {
    const [[chart]] = vegaLiteToMaidr(spec as unknown as VegaLiteSpec, view).subplots;

    // Marks that draw no item outside a facet give the pair no rows, as
    // those of a view not yet run do, so it is not left out.
    expect(read(chart)).toEqual([[TraceType.LOLLIPOP, [10, 30, 20]]]);
  });
});
