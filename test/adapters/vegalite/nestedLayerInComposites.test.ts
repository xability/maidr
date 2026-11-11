/**
 * A layer that is itself a layered spec, inside a concat, a facet or a
 * repeat, is read as the layers it draws.
 *
 * A layered spec's nested layer was read as the layers it draws only at the
 * top level (#1652). Inside a composite child it was read as one layer with
 * no mark and dropped with every mark under it: `[[bars, labels], line]` in a
 * concat child or a facet's panel was read as its line alone, and a child
 * whose every layer was nested, or whose other layer read as nothing, emptied
 * the whole chart ("Concat spec contains a child with an unsupported mark
 * type").
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { BarPoint, Maidr, MaidrLayer } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { afterAll, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

const SALES = [
  { site: 'North', month: 'Jan', sales: 10, target: 12 },
  { site: 'North', month: 'Feb', sales: 14, target: 12 },
  { site: 'South', month: 'Jan', sales: 15, target: 12 },
  { site: 'South', month: 'Feb', sales: 19, target: 12 },
];
const NORTH = SALES.filter(row => row.site === 'North');
const MONTH = { field: 'month', type: 'ordinal', sort: null };
const BARS = { mark: 'bar', encoding: { x: MONTH, y: { field: 'sales', type: 'quantitative' } } };
const LABELS = { mark: 'text', encoding: { x: MONTH, y: { field: 'sales', type: 'quantitative' }, text: { field: 'sales', type: 'quantitative' } } };
const TARGET = { mark: 'line', encoding: { x: MONTH, y: { field: 'target', type: 'quantitative' } } };
const MEAN = { mark: 'rule', encoding: { y: { aggregate: 'mean', field: 'sales', type: 'quantitative' } } };
const NESTED_BARS = { layer: [BARS, LABELS] };

/**
 * Convert a spec.
 * @param spec - The spec
 * @param view - Its compiled view, if any
 * @returns The chart
 */
function convert(spec: unknown, view?: VegaView): Maidr {
  return vegaLiteToMaidr(spec as VegaLiteSpec, view);
}

/**
 * A compiled view of a facet, whose `cell` group draws each panel's marks
 * inside an item whose row holds the panel's facet values.
 * @param panels - Each panel's values and the marks drawn in it
 * @returns The view
 */
function facetDrawing(panels: Array<{ values: Record<string, unknown>; marks: Array<Record<string, unknown>> }>): VegaView {
  const cell = { marktype: 'group', name: 'cell', items: panels.map(panel => ({ datum: panel.values, items: panel.marks })) };
  const root = { marktype: 'group', name: 'root', items: [{ items: [cell] }] };
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
 * Each layer of a panel as its id and type.
 * @param layers - The panel's layers
 * @returns Their ids and types
 */
function idsAndTypes(layers: MaidrLayer[]): Array<[string, string]> {
  return layers.map(layer => [layer.id, layer.type]);
}

/**
 * The values of a bar layer.
 * @param layer - The layer
 * @returns Its bars' values
 */
function barValues(layer: MaidrLayer): number[] {
  return (layer.data as BarPoint[]).map(point => Number(point.y));
}

describe('a vega-lite nested layer inside a composite', () => {
  it('reads a nested layer of a layered concat child as the layers it draws', () => {
    const maidr = convert({ hconcat: [{ data: { values: NORTH }, layer: [NESTED_BARS, TARGET] }, { data: { values: NORTH }, ...BARS }] });

    const [first] = maidr.subplots[0];

    // Before: the line alone, the bars dropped with their labels.
    expect(idsAndTypes(first.layers)).toEqual([['0_0_0', TraceType.BAR], ['0_1', TraceType.LINE]]);
    expect(barValues(first.layers[0])).toEqual([10, 14]);
    expect(first.layers[0].selectors).toBe('g.mark-rect.role-mark.concat_0_layer_0_layer_0_marks path');
  });

  it('reads a concat child whose every layer is nested', () => {
    const maidr = convert({ hconcat: [{ data: { values: NORTH }, layer: [NESTED_BARS] }, { data: { values: NORTH }, ...BARS }] });

    // Before: no layer at all, so the whole chart was read as empty.
    expect(maidr.subplots[0].map(subplot => subplot.layers.map(layer => layer.type))).toEqual([
      [TraceType.BAR],
      [TraceType.BAR],
    ]);
  });

  it('reads a nested layer in every panel of a facet, from that panel\'s rows', () => {
    const maidr = convert({ data: { values: SALES }, facet: { column: { field: 'site' } }, spec: { layer: [NESTED_BARS, TARGET] } });

    const panels = maidr.subplots[0];

    expect(panels.map(panel => idsAndTypes(panel.layers))).toEqual([
      [['0_0', TraceType.BAR], ['0_1', TraceType.LINE]],
      [['1_0', TraceType.BAR], ['1_1', TraceType.LINE]],
    ]);
    expect(panels.map(panel => barValues(panel.layers[0]))).toEqual([[10, 14], [15, 19]]);
    expect(panels[1].layers[0].selectors).toBe(
      'g[data-maidr-cell="vl-chart-0-1"] g.mark-rect.role-mark.child_layer_0_layer_0_marks path',
    );
  });

  it('reads an aggregated nested layer of a facet\'s panel from the marks drawn in that panel', () => {
    // Vega-Lite splits the rows into panels before the bars sum them, so the
    // summed rows do not hold their panel's site.
    const bars = (jan: number, feb: number): Record<string, unknown> => ({
      marktype: 'rect',
      name: 'child_layer_0_layer_0_marks',
      items: [{ datum: { month: 'Jan', sum_sales: jan } }, { datum: { month: 'Feb', sum_sales: feb } }],
    });
    const view = facetDrawing([
      { values: { site: 'North' }, marks: [bars(10, 14)] },
      { values: { site: 'South' }, marks: [bars(15, 19)] },
    ]);
    const summed = { mark: 'bar', encoding: { x: MONTH, y: { aggregate: 'sum', field: 'sales', type: 'quantitative' } } };
    const spec = { data: { values: SALES }, facet: { column: { field: 'site' } }, spec: { layer: [{ layer: [summed, LABELS] }, TARGET] } };

    const panels = convert(spec, view).subplots[0];

    expect(panels.map(panel => barValues(panel.layers[0]))).toEqual([[10, 14], [15, 19]]);
  });

  it('reads a facet whose only other layer reads as nothing', () => {
    const maidr = convert({ data: { values: SALES }, facet: { column: { field: 'site' } }, spec: { layer: [NESTED_BARS, MEAN] } });

    // Before: no layer in any panel, so the whole chart was read as empty.
    expect(maidr.subplots[0].map(panel => panel.layers.map(layer => layer.type))).toEqual([
      [TraceType.BAR],
      [TraceType.BAR],
    ]);
  });

  it('reads a nested layer of a repeated layered child in every cell', () => {
    const repeated = { field: { repeat: 'column' }, type: 'quantitative' };
    const maidr = convert({
      data: { values: NORTH },
      repeat: { column: ['sales', 'target'] },
      spec: { layer: [{ layer: [{ mark: 'bar', encoding: { x: MONTH, y: repeated } }, { mark: 'text', encoding: { x: MONTH, y: repeated, text: repeated } }] }, TARGET] },
    });

    const cells = maidr.subplots[0];

    expect(cells.map(cell => cell.layers.map(layer => layer.type))).toEqual([
      [TraceType.BAR, TraceType.LINE],
      [TraceType.BAR, TraceType.LINE],
    ]);
    expect(cells.map(cell => barValues(cell.layers[0]))).toEqual([[10, 14], [12, 12]]);
    expect(cells[0].layers[0].selectors).toBe('g.mark-rect.role-mark.child__column_sales_layer_0_layer_0_marks path');
  });
});
