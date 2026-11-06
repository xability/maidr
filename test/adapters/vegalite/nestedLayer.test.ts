import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { BarPoint, MaidrLayer, ScatterPoint } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { TraceType } from '@type/grammar';
import { makeView } from './fixtures/testView';

/**
 * A layer of a layered spec that is itself a layered spec.
 *
 * Vega-Lite draws its children as marks of their own, named after the path
 * to them, `layer_<i>_layer_<j>_marks` (vega-lite 5.23). Read as one layer it
 * has no mark, so it was dropped with every mark under it: Altair's
 * `alt.layer(bars + labels, rule)` was read as its rule alone, which reads as
 * nothing, and the chart came back empty.
 */

const SALES = {
  values: [
    { month: 'Jan', sales: 10, target: 12 },
    { month: 'Feb', sales: 14, target: 12 },
    { month: 'Mar', sales: 9, target: 13 },
  ],
};

const MONTH = { field: 'month', type: 'ordinal' };

/** Bars of the sales with their values written on them, and a line of the targets. */
const BARS_LABELS_AND_TARGET = {
  data: SALES,
  layer: [
    {
      encoding: { x: MONTH, y: { field: 'sales', type: 'quantitative' } },
      layer: [
        { mark: 'bar' },
        { mark: { type: 'text', dy: -6 }, encoding: { text: { field: 'sales' } } },
      ],
    },
    { mark: 'line', encoding: { x: MONTH, y: { field: 'target', type: 'quantitative' } } },
  ],
} as unknown as VegaLiteSpec;

/**
 * The layers a spec converts to, without a compiled view.
 * @param spec The spec
 * @returns Its layers
 */
function layersOf(spec: VegaLiteSpec): MaidrLayer[] {
  return vegaLiteToMaidr(spec).subplots[0][0].layers;
}

describe('vega-Lite layers nested in a layer', () => {
  it('reads a nested layer as the layers it draws', () => {
    const layers = layersOf(BARS_LABELS_AND_TARGET);

    // Before: the line alone. The values written on the bars are a label on
    // a category axis, which the bars already announce.
    expect(layers.map(layer => [layer.id, layer.type])).toEqual([
      ['0_0', TraceType.BAR],
      ['1', TraceType.LINE],
    ]);
    expect((layers[0].data as BarPoint[]).map(bar => bar.y)).toEqual([10, 14, 9]);
  });

  it('highlights a nested layer\'s marks under the classes Vega-Lite draws them with', () => {
    const [bars] = layersOf(BARS_LABELS_AND_TARGET);

    expect(bars.selectors).toBe('g.mark-rect.role-mark.layer_0_layer_0_marks path');
  });

  it('reads a layer nested two deep under the path to it', () => {
    const spec = {
      data: SALES,
      layer: [{ layer: [{ layer: [{ mark: 'bar', encoding: { x: MONTH, y: { field: 'sales', type: 'quantitative' } } }] }] }],
    } as unknown as VegaLiteSpec;

    const [bars] = layersOf(spec);

    expect(bars.id).toBe('0_0_0');
    expect(bars.selectors).toBe('g.mark-rect.role-mark.layer_0_layer_0_layer_0_marks path');
  });

  it('gives a nested layer\'s children the encoding and transforms above them', () => {
    // The rank is computed at the top, plotted by the nested layer and drawn
    // by its child, which says nothing but its mark: a bump chart.
    const spec = {
      data: {
        values: [
          { team: 'Ash', round: 'R1', score: 10 },
          { team: 'Ash', round: 'R2', score: 2 },
          { team: 'Birch', round: 'R1', score: 8 },
          { team: 'Birch', round: 'R2', score: 9 },
        ],
      },
      transform: [{ window: [{ op: 'rank', as: 'rank' }], groupby: ['round'], sort: [{ field: 'score', order: 'descending' }] }],
      layer: [{
        encoding: { x: { field: 'round', type: 'ordinal' }, y: { field: 'rank', type: 'ordinal' }, color: { field: 'team', type: 'nominal' } },
        layer: [{ mark: 'line' }],
      }],
    } as unknown as VegaLiteSpec;

    const [line] = layersOf(spec);

    expect(line.type).toBe(TraceType.BUMP);
  });

  it('says where a nested bump chart draws first place from its own scale', () => {
    // The outer layers share `y`, which the scores draw on; the nested layer
    // resolves its own y scales independent, so the ranks are drawn on
    // `layer_1_layer_0_y` (vega-lite 5.23), here with rank 1 at the bottom.
    // The scores' scale, read instead, would say the top.
    const scales: Record<string, unknown> = {
      y: Object.assign((value: unknown) => Number(value) * 200 / 12, { domain: () => [0, 12] }),
      layer_1_layer_0_y: Object.assign((value: unknown) => [33, 100, 167][[3, 2, 1].indexOf(Number(value))], { domain: () => [3, 2, 1] }),
    };
    const view = {
      ...makeView({ data_0: [{ team: 'Ash', round: 'R1', score: 10, rank: 1 }, { team: 'Birch', round: 'R1', score: 8, rank: 2 }] }),
      scale: (name: string) => {
        if (!(name in scales))
          throw new Error(`Unrecognized scale or projection: ${name}`);
        return scales[name];
      },
    } as VegaView;
    const spec = {
      data: { values: [{ team: 'Ash', round: 'R1', score: 10 }, { team: 'Birch', round: 'R1', score: 8 }] },
      transform: [{ window: [{ op: 'rank', as: 'rank' }], groupby: ['round'], sort: [{ field: 'score', order: 'descending' }] }],
      layer: [
        { mark: 'point', encoding: { x: { field: 'round', type: 'ordinal' }, y: { field: 'score', type: 'quantitative' } } },
        {
          resolve: { scale: { y: 'independent' } },
          encoding: { x: { field: 'round', type: 'ordinal' }, y: { field: 'rank', type: 'ordinal', sort: [3, 2, 1] } },
          layer: [{ mark: 'line', encoding: { color: { field: 'team', type: 'nominal' } } }],
        },
      ],
    } as unknown as VegaLiteSpec;

    const bump = vegaLiteToMaidr(spec, view).subplots[0][0].layers.find(layer => layer.type === TraceType.BUMP);

    expect(bump?.firstPlace).toBe('bottom');
  });

  it('names a nested layer\'s points by the text that labels them', () => {
    const spec = {
      data: { values: [{ city: 'Aa', pop: 3, area: 10 }, { city: 'Bb', pop: 5, area: 20 }] },
      layer: [{
        encoding: { x: { field: 'area', type: 'quantitative' }, y: { field: 'pop', type: 'quantitative' } },
        layer: [{ mark: 'point' }, { mark: 'text', encoding: { text: { field: 'city', type: 'nominal' } } }],
      }],
    } as unknown as VegaLiteSpec;

    const layers = layersOf(spec);

    expect(layers).toHaveLength(1);
    expect(layers[0].data as ScatterPoint[]).toEqual([
      { x: 10, y: 3, label: 'Aa' },
      { x: 20, y: 5, label: 'Bb' },
    ]);
  });
});
