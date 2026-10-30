/**
 * The layers of a layered Vega-Lite chart name a shared axis by the title it
 * is drawn with.
 *
 * Vega-Lite draws an axis the layers share once, titled by merging their own
 * titles, and a title written on a channel beats one derived from its field.
 * Each layer was read for its own channel alone, so py-maidr's Altair bar +
 * line chart, which titles the bars' x "X values" and leaves the line's
 * untitled, announced its line as "x is 1, Line values is 8" and described
 * its x axis as "x", under an axis drawn "X values".
 */
import type { VegaLiteSpec } from '@adapters/vegalite/types';
import type { Maidr } from '@type/grammar';
import { vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { describe, expect, it } from '@jest/globals';

const ROWS = [1, 2, 3].map(x => ({ x, bar_values: x * 2, line_values: x * 4 }));

/**
 * py-maidr's Altair bar + line chart, with optional changes.
 * @param changes - Overrides: the line's x channel, the composite's resolve
 * @param changes.lineX - The line layer's x channel
 * @param changes.resolve - The layered spec's `resolve`
 * @returns The spec
 */
function barAndLine(changes: { lineX?: unknown; resolve?: unknown } = {}): VegaLiteSpec {
  return {
    data: { values: ROWS },
    layer: [
      {
        mark: { type: 'bar' },
        encoding: {
          x: { field: 'x', type: 'ordinal', title: 'X values' },
          y: { field: 'bar_values', type: 'quantitative', title: 'Bar values' },
        },
      },
      {
        mark: { type: 'line', point: true },
        encoding: {
          x: changes.lineX ?? { field: 'x', type: 'ordinal' },
          y: { field: 'line_values', type: 'quantitative', title: 'Line values' },
        },
      },
    ],
    resolve: changes.resolve ?? { scale: { y: 'independent' } },
  } as unknown as VegaLiteSpec;
}

/**
 * Each layer's x and y labels.
 * @param maidr - The converted chart
 * @returns The labels, layer by layer
 */
function labels(maidr: Maidr): Array<[string | undefined, string | undefined]> {
  return maidr.subplots[0][0].layers.map(layer => [layer.axes?.x?.label, layer.axes?.y?.label]);
}

describe('a layered vega-lite chart whose shared axis one layer titles', () => {
  it('names the axis by that title on the layer that leaves it untitled', () => {
    const maidr = vegaLiteToMaidr(barAndLine());

    // Before the fix the line's x was 'x', its field.
    expect(labels(maidr)).toEqual([
      ['X values', 'Bar values'],
      ['X values', 'Line values'],
    ]);
  });

  it('keeps the titles of an axis each layer draws for itself', () => {
    // `resolve: { scale: { y: 'independent' } }` above gives each layer a y
    // axis of its own; here the x axes are made independent too.
    const maidr = vegaLiteToMaidr(barAndLine({ resolve: { axis: { x: 'independent' }, scale: { y: 'independent' } } }));

    expect(labels(maidr)[1]).toEqual(['x', 'Line values']);
  });

  it('names a shared y the same way', () => {
    const spec = barAndLine({ resolve: {} });
    const line = spec.layer?.[1];
    if (line?.encoding?.y)
      delete line.encoding.y.title;

    const maidr = vegaLiteToMaidr(spec);

    expect(labels(maidr)[1]).toEqual(['X values', 'Bar values']);
  });

  it('keeps a layer\'s own title when it writes one', () => {
    const maidr = vegaLiteToMaidr(barAndLine({ lineX: { field: 'x', type: 'ordinal', title: 'Step' } }));

    expect(labels(maidr).map(([x]) => x)).toEqual(['X values', 'Step']);
  });

  it('titles a layer that takes its channel from the layered spec', () => {
    // The line has no x of its own and inherits the parent's, untitled; the
    // bars override it with a title.
    const spec = barAndLine();
    const line = spec.layer?.[1];
    if (line?.encoding)
      delete line.encoding.x;
    spec.encoding = { x: { field: 'x', type: 'ordinal' } };

    const maidr = vegaLiteToMaidr(spec);

    expect(labels(maidr)[1]).toEqual(['X values', 'Line values']);
  });
});

describe('a layered vega-lite chart with a layer that writes its title away', () => {
  // Vega-Lite draws a shared axis with no title at all when any layer writes
  // it as `null` (vega-lite 5.23, `mergeTitleComponent`), so no layer is
  // given a sibling's title and each is read as before.
  it('reads each layer as before when the channel\'s title is null', () => {
    const maidr = vegaLiteToMaidr(barAndLine({ lineX: { field: 'x', type: 'ordinal', title: null } }));

    expect(labels(maidr).map(([x]) => x)).toEqual(['X values', 'x']);
  });

  it('reads each layer as before when the axis\'s title is null', () => {
    const maidr = vegaLiteToMaidr(barAndLine({ lineX: { field: 'x', type: 'ordinal', axis: { title: null } } }));

    expect(labels(maidr).map(([x]) => x)).toEqual(['X values', 'x']);
  });

  it('names the axis by the written title over an empty one, as it is drawn', () => {
    const titles = [
      { field: 'x', type: 'ordinal', title: '' },
      { field: 'x', type: 'ordinal', axis: { title: '' } },
    ];

    const read = titles.map(lineX => labels(vegaLiteToMaidr(barAndLine({ lineX }))).map(([x]) => x));

    expect(read).toEqual([['X values', 'X values'], ['X values', 'X values']]);
  });
});

describe('sibling vega-lite line layers that share an axis one of them titles', () => {
  it('are read as one line of two series, each named as its legend entry', () => {
    // Titled alike, the two lines describe the same axes, and the sibling-line
    // merge reads them as the one chart they are drawn as.
    const rows = [1, 2, 3].map(x => ({ x, a: x * 2, b: x * 3 }));
    const line = (y: string, name: string, titled: boolean): unknown => ({
      mark: 'line',
      encoding: {
        x: { field: 'x', type: 'quantitative', ...(titled ? { title: 'Day' } : {}) },
        y: { field: y, type: 'quantitative', ...(titled ? { title: 'Count' } : {}) },
        color: { datum: name },
      },
    });

    const maidr = vegaLiteToMaidr({
      data: { values: rows },
      layer: [line('a', 'Alpha', true), line('b', 'Beta', false)],
    } as unknown as VegaLiteSpec);

    const layers = maidr.subplots[0][0].layers;
    expect(layers).toHaveLength(1);
    const series = layers[0].data as Array<Array<{ y: number; z?: string }>>;
    expect(series.map(points => points.map(point => point.z))).toEqual([
      ['Alpha', 'Alpha', 'Alpha'],
      ['Beta', 'Beta', 'Beta'],
    ]);
    expect(series.map(points => points.map(point => point.y))).toEqual([[2, 4, 6], [3, 6, 9]]);
    expect(labels(maidr)).toEqual([['Day', 'Count']]);
  });
});

describe('a layered vega-lite chart none of whose layers titles an axis', () => {
  it('names each layer\'s axis by its own field, as before', () => {
    const spec = barAndLine();
    const bars = spec.layer?.[0];
    if (bars?.encoding?.x)
      delete bars.encoding.x.title;

    const maidr = vegaLiteToMaidr(spec);

    expect(labels(maidr).map(([x]) => x)).toEqual(['x', 'x']);
  });
});
