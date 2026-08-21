/**
 * `Plot.text` is a labelled scatter, and the whole layer was handed back
 * (#1106).
 *
 * The mark draws a name at a position and says both exactly: the position is
 * the element's `transform`, the same place `dot`, `tick` and `vector` take
 * theirs from, and the name is what the element draws. Nothing is inverted
 * from a colour, rounded from a radius, or inferred from a shape.
 *
 * It is not a decorative mark. `Plot.text` is *how* a labelled scatter is
 * drawn -- country names against GDP is Plot's own canonical example -- and
 * it is also how another mark's labels are drawn, which is the same markup
 * put to a different use. Position separates the two, and separates them
 * exactly: Plot writes a label's transform from the same channel it writes
 * the labelled point's, so a label lands on what it labels. Measured on a
 * `Plot.dot` + `Plot.text` scatter with `dy: -8` -- both at
 * `translate(40,238.376)`, because the offset is applied when the text is
 * laid out and not to its transform.
 *
 * So a `text` mark under which another mark's points sit is that mark's
 * names, and one that stands alone is a series. Read the first way, a
 * five-node `Plot.tree` became three layers at the same coordinates; read
 * the second way, the labelled scatter had no layer at all.
 */

import type { ScatterPoint } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { mountFixture } from './helpers';

/**
 * The layers a captured chart produces.
 *
 * @param key - Which fixture to read.
 * @returns Its layers, or an empty list when it produced none.
 */
function layersOf(key: Parameters<typeof mountFixture>[0]): { type: TraceType; data: unknown }[] {
  const { element } = mountFixture(key);
  return observablePlotToMaidr(element)?.subplots[0][0].layers ?? [];
}

/**
 * One layer's points.
 *
 * @param layer      - The layer to read.
 * @param layer.data - Its points, as the schema carries them.
 * @returns Its points.
 */
function pointsOf(layer: { data: unknown }): ScatterPoint[] {
  return layer.data as ScatterPoint[];
}

describe('a Plot.text that stands alone', () => {
  it('is read as the scatter it draws, carrying each point\'s name', () => {
    // Three labels and no other mark. The whole chart used to be handed
    // back, so this is a layer where there was none.
    const layers = layersOf('labelledScatter');

    expect(layers.map(layer => layer.type)).toEqual([TraceType.SCATTER]);
    expect(pointsOf(layers[0])).toEqual([
      { x: 3.1, y: 14.2, label: 'alpha' },
      { x: 5.4, y: 9.8, label: 'beta' },
      { x: 8.9, y: 21.5, label: 'gamma' },
    ]);
  });
});

describe('a Plot.text that labels another mark', () => {
  it('names that mark\'s points instead of becoming a series of its own', () => {
    // `Plot.dot` + `Plot.text` over the same data. Two layers here would be
    // the same three coordinates twice, one set of them nameless.
    const layers = layersOf('dotWithLabels');

    expect(layers.map(layer => layer.type)).toEqual([TraceType.SCATTER]);
    expect(pointsOf(layers[0])).toEqual([
      { x: 3.1, y: 14.2, label: 'alpha' },
      { x: 5.4, y: 9.8, label: 'beta' },
      { x: 8.9, y: 21.5, label: 'gamma' },
    ]);
  });

  it('gives a tree its node names, from the title rather than the glyph', () => {
    // `Plot.tree` draws two `text` groups over its dots, and the dots carry
    // the full path in a `<title>` while the text shows only the leaf. The
    // path is the unambiguous name, and reading `textContent` off the text
    // element would give "b/a/b" -- a `<title>` child's text is part of its
    // parent's `textContent`.
    //
    // The coordinates stay what the chart drew: d3 tree layout depth and
    // sibling offset, on scales `Plot.tree` renders with `axis: null`. This
    // does not make them meaningful; it stops them being all a reader gets.
    const nodes = layersOf('labelledTree').filter(layer => layer.type === TraceType.SCATTER);

    expect(nodes).toHaveLength(1);
    expect(pointsOf(nodes[0]).map(point => point.label)).toEqual([
      '/a',
      '/a/b',
      '/a/c',
      '/a/b/d',
      '/a/b/e',
    ]);
  });
});

describe('a faceted chart', () => {
  it('pairs the labels within each panel rather than across panels', () => {
    // A faceted mark's own children are the per-facet wrappers, not the
    // elements it drew. Reading positions off them compares the *panels'*
    // offsets, which coincide between any two marks faceted alike -- so every
    // pairing appears to succeed, the `text` group is claimed, and the names
    // are keyed by wrappers nothing ever looks up.
    //
    // Measured before the fix: two panels, each holding one dot layer with
    // its two points and no names at all. The labels were not duplicated;
    // they were lost.
    const { element } = mountFixture('facetedDotWithLabels');
    const grid = observablePlotToMaidr(element)?.subplots ?? [];
    const cells = grid.flat();

    expect(cells).toHaveLength(2);
    expect(cells.map(cell => cell.layers.length)).toEqual([1, 1]);
    expect(cells.map(cell => pointsOf(cell.layers[0]).map(point => point.label)))
      .toEqual([['a', 'b'], ['c', 'd']]);
  });
});
