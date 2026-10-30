/**
 * A layered Vega-Lite chart is titled as Vega-Lite draws it.
 *
 * A layered spec without a title of its own draws the first title among its
 * layers, depth first (vega-lite's `LayerModel.assembleTitle`). Altair writes
 * `heatmap + text` that way, keeping the heatmap's title on `layer[0]`, so
 * py-maidr's Altair heatmap was announced as 'Vega-Lite Chart', in its
 * accessible name, its description and L T, under a drawn title 'Harvest of
 * local farmers (in tons/year)'.
 */
import type { VegaLiteSpec } from '@adapters/vegalite/types';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';

const ROWS = [
  { farmer: 'Agrifun', vegetable: 'wheat', harvest: 0 },
  { farmer: 'Agrifun', vegetable: 'tomato', harvest: 1 },
];

/**
 * Altair's `heatmap + text`: the rect layer carries the title.
 * @param heatmapTitle - The title on the rect layer
 * @param topTitle     - A title on the composite, if any
 * @returns The spec
 */
function heatmapWithText(heatmapTitle: unknown, topTitle?: unknown): VegaLiteSpec {
  return {
    ...(topTitle === undefined ? {} : { title: topTitle }),
    data: { values: ROWS },
    layer: [
      {
        mark: { type: 'rect' },
        encoding: {
          x: { field: 'farmer', type: 'nominal' },
          y: { field: 'vegetable', type: 'nominal' },
          color: { field: 'harvest', type: 'quantitative' },
        },
        title: heatmapTitle,
      },
      {
        mark: { type: 'text' },
        encoding: {
          x: { field: 'farmer', type: 'nominal' },
          y: { field: 'vegetable', type: 'nominal' },
          text: { field: 'harvest', type: 'quantitative' },
        },
      },
    ],
  } as unknown as VegaLiteSpec;
}

describe('a layered vega-lite chart with no title of its own', () => {
  it('is titled by the first layer that has one', () => {
    const maidr = vegaLiteToMaidr(heatmapWithText('Harvest of local farmers (in tons/year)'));

    // Before the fix: 'Vega-Lite Chart'.
    expect(maidr.title).toBe('Harvest of local farmers (in tons/year)');
  });

  it('takes the subtitle from the same layer', () => {
    const maidr = vegaLiteToMaidr(heatmapWithText({ text: 'Harvest', subtitle: 'tons per year' }));

    expect(maidr.title).toBe('Harvest');
    expect(maidr.subtitle).toBe('tons per year');
  });

  it('looks through a nested layer, depth first', () => {
    const nested = {
      data: { values: ROWS },
      layer: [
        { layer: [heatmapWithText('Inner').layer?.[0]] },
        { ...heatmapWithText('Second').layer?.[0], title: 'Second' },
      ],
    } as unknown as VegaLiteSpec;

    expect(vegaLiteToMaidr(nested).title).toBe('Inner');
  });
});

describe('a layered vega-lite chart with a title of its own', () => {
  it('keeps its own title over its layers\'', () => {
    const maidr = vegaLiteToMaidr(heatmapWithText('Layer title', 'Chart title'));

    expect(maidr.title).toBe('Chart title');
  });
});

describe('a vega-lite chart with no title anywhere', () => {
  it('still falls back to the placeholder', () => {
    const maidr = vegaLiteToMaidr(heatmapWithText(undefined));

    expect(maidr.title).toBe('Vega-Lite Chart');
  });
});
