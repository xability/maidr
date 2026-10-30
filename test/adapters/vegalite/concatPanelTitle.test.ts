/**
 * A concatenated Vega-Lite chart's panels are named by the titles they are
 * drawn with.
 *
 * Each child of an `hconcat`, `vconcat` or `concat` is drawn under its own
 * title, and MAIDR names a panel in its subplot announcements by the panel's
 * first layer's title -- which the facet and repeat paths fill in and the
 * concat path did not. The gallery's two box plots, drawn as 'Test Scores'
 * and 'Product Ratings', were announced as 'Subplot 1 of 2' and 'Subplot 2
 * of 2' alone.
 */
import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { Maidr } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';

/**
 * A bar chart child.
 * @param extra - Properties to add to it
 * @returns The child
 */
function bars(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    data: { values: [{ a: 'A', b: 1 }, { a: 'B', b: 2 }] },
    mark: 'bar',
    encoding: {
      x: { field: 'a', type: 'nominal' },
      y: { field: 'b', type: 'quantitative' },
    },
    ...extra,
  };
}

/**
 * The first layer's title of each panel.
 * @param maidr - The converted chart
 * @returns The titles, panel by panel
 */
function panelTitles(maidr: Maidr): Array<string | undefined> {
  return maidr.subplots.flat().map(subplot => subplot.layers[0]?.title);
}

describe('a concatenated vega-lite chart whose children are titled', () => {
  it('names each panel by its title', () => {
    const maidr = vegaLiteToMaidr({
      title: 'Side by side',
      hconcat: [bars({ title: 'Test Scores' }), bars({ title: { text: 'Product Ratings', subtitle: 'stars' } })],
    } as unknown as VegaLiteSpec);

    // Before the fix: [undefined, undefined].
    expect(panelTitles(maidr)).toEqual(['Test Scores', 'Product Ratings']);
    expect(maidr.title).toBe('Side by side');
  });

  it('names a layered panel by the title its first titled layer is drawn with', () => {
    const layered = {
      data: { values: [{ a: 'A', b: 1 }, { a: 'B', b: 2 }] },
      layer: [
        { ...bars(), data: undefined, title: 'Totals' },
        { mark: 'text', encoding: { x: { field: 'a', type: 'nominal' }, y: { field: 'b', type: 'quantitative' }, text: { field: 'b' } } },
      ],
    };

    const maidr = vegaLiteToMaidr({ vconcat: [layered, bars({ title: 'Second' })] } as unknown as VegaLiteSpec);

    expect(panelTitles(maidr)).toEqual(['Totals', 'Second']);
  });

  it('keeps a title the layer declares for itself', () => {
    const declared = {
      data: { values: [{ a: 1, b: 1 }, { a: 2, b: 2 }] },
      mark: 'point',
      encoding: { x: { field: 'a', type: 'quantitative' }, y: { field: 'b', type: 'quantitative' } },
      title: 'Drawn',
      usermeta: { maidr: { type: 'point', title: 'Declared' } },
    };

    const maidr = vegaLiteToMaidr({ hconcat: [declared, bars({ title: 'Other' })] } as unknown as VegaLiteSpec);

    expect(panelTitles(maidr)).toEqual(['Declared', 'Other']);
  });
});

describe('a concatenated vega-lite chart whose children are not titled', () => {
  it('leaves the panels unnamed, as before', () => {
    const maidr = vegaLiteToMaidr({ hconcat: [bars(), bars()] } as unknown as VegaLiteSpec);

    expect(panelTitles(maidr)).toEqual([undefined, undefined]);
  });
});
