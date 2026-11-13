import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { LinePoint, Maidr, MaidrLayer, ScatterPoint } from '@type/grammar';
/**
 * A chart whose views declare names is read under the names Vega-Lite
 * compiles them to.
 *
 * A view that declares a `name` is compiled under it, and so is every mark,
 * group and scale below it (see `names.ts`). The adapter named each by its
 * place alone -- `layer_0_marks`, `concat_1_group`, `child_marks` -- so a
 * named view's layers were outlined on marks Vega never drew, its panel was
 * not found, its colour scale was not read, and where its rows had to be read
 * off its drawn marks they were guessed: a scatter drawn in its `order` was
 * read in its table's order, and a named line computing its own column was
 * read as zeros. Altair 6.1 names the view of a compound chart that carries
 * its selection, so `alt.layer(points.interactive(), line)` was one.
 *
 * The charts, their tables, scales and drawn marks are captured from
 * vega-lite 5.23.0 and vega 5.33.1 (`fixtures/namedViews.ts`).
 */
import type { NamedViewCapture } from './fixtures/namedViews';
import { colourGroupPlaces, vegaLiteToMaidr } from '@adapters/vegalite/converters';
import { stampFacetCells } from '@adapters/vegalite/facets';
import { compiledName, viewName } from '@adapters/vegalite/names';
import { describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { namedViews } from './fixtures/namedViews';
import { makeView } from './fixtures/testView';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * The SVG Vega's renderer draws a scenegraph as: a `<g>` per mark, classed by
 * its type, role and name, holding a `<path>` per item -- one for a whole line
 * or area, a `<line>` per rule -- and, for a group, a `<g>` per item, its
 * background path first.
 *
 * @param capture - The chart
 * @returns The drawn chart
 */
function drawn(capture: NamedViewCapture): SVGSVGElement {
  const document = new JSDOM('<!doctype html><body></body>').window.document;
  const svg = document.createElementNS(SVG, 'svg') as SVGSVGElement;
  document.body.appendChild(svg);
  const draw = (mark: NamedViewCapture['scene'], parent: Element): void => {
    const group = document.createElementNS(SVG, 'g');
    group.setAttribute('class', `mark-${mark.marktype} role-${mark.role}${mark.name ? ` ${mark.name}` : ''}`);
    parent.appendChild(group);
    if (mark.marktype === 'group') {
      for (const item of mark.items) {
        const itemGroup = document.createElementNS(SVG, 'g');
        const background = document.createElementNS(SVG, 'path');
        background.setAttribute('class', 'background');
        itemGroup.appendChild(background);
        group.appendChild(itemGroup);
        for (const child of item.items ?? [])
          draw(child, itemGroup);
      }
      return;
    }
    const whole = ['line', 'area', 'trail'].includes(mark.marktype);
    const elements = whole ? Math.min(mark.items.length, 1) : mark.items.length;
    for (let i = 0; i < elements; i++)
      group.appendChild(document.createElementNS(SVG, mark.marktype === 'rule' ? 'line' : 'path'));
  };
  draw(capture.scene, svg);
  return svg;
}

/**
 * Convert a captured chart and stamp its facet's cells, as `bindVegaLite`
 * does before any selector is read.
 *
 * @param capture - The chart
 * @returns Its schema and its drawing
 */
function bound(capture: NamedViewCapture): { maidr: Maidr; svg: SVGSVGElement } {
  const spec = capture.spec as unknown as VegaLiteSpec;
  const view: VegaView = Object.assign(makeView(capture.tables, capture.scales), { scenegraph: () => ({ root: capture.scene }) });
  const maidr = vegaLiteToMaidr(spec, view, { id: 'chart' });
  const svg = drawn(capture);
  stampFacetCells(svg, maidr, compiledName(viewName(spec, '', ''), 'cell'));
  return { maidr, svg };
}

/**
 * How many of a layer's points are outlined on a drawn element: a colour
 * group's on its mark's element at each point's place, a line's on a path
 * for each series, and any other's when its selector finds one element per
 * point.
 *
 * @param layer - The layer
 * @param svg - The drawn chart
 * @returns Its points, and how many of them are outlined
 */
function outlines(layer: MaidrLayer, svg: SVGSVGElement): [points: number, outlined: number] {
  const places = colourGroupPlaces(layer);
  if (places) {
    const elements = [...svg.querySelectorAll(places.marks)]
      .flatMap(group => [...group.children].filter(child => child.tagName === places.element));
    return [places.positions.length, places.positions.filter(position => elements[position] !== undefined).length];
  }
  if (Array.isArray(layer.selectors)) {
    const series = layer.data as LinePoint[][];
    const selectors = layer.selectors as string[];
    const outlined = series.filter((_, i) => selectors[i] !== undefined && svg.querySelectorAll(selectors[i]).length > 0);
    return [series.flat().length, outlined.flat().length];
  }
  const points = (layer.data as unknown[]).length;
  const elements = typeof layer.selectors === 'string' ? svg.querySelectorAll(layer.selectors).length : 0;
  return [points, elements === points ? points : 0];
}

describe('a vega-lite chart whose views declare names', () => {
  it.each(Object.keys(namedViews))('outlines every point of "%s" on a mark Vega draws, in its panel', (name) => {
    const { maidr, svg } = bound(namedViews[name]);

    const panels = maidr.subplots.flat();
    const read = panels.flatMap(panel => panel.layers.map(layer => outlines(layer, svg)));
    // Before: no point was outlined, and no panel of a named concat child,
    // repeated cell or facet was found.
    expect(read.length).toBeGreaterThan(0);
    expect(read.filter(([points, outlined]) => points === 0 || outlined !== points)).toEqual([]);
    expect(panels.filter(panel => panel.selector !== undefined && svg.querySelectorAll(panel.selector).length !== 1)).toEqual([]);
  });

  it('lists a named scatter\'s colour groups in its legend\'s order', () => {
    const { maidr } = bound(namedViews['single scatter, named']);

    // Before: `b` first, as its rows first name it; the colour scale is
    // `v_color`, not `color`.
    expect(maidr.subplots[0][0].layers.map(layer => layer.name)).toEqual(['a', 'b']);
  });

  it('reads a named scatter in the order its marks are drawn', () => {
    const { maidr } = bound(namedViews['single scatter drawn in its order, named']);

    // Before: 3, 5, 4, its table's order, so every point was outlined on
    // another's mark. Its marks are `v_marks`, not `marks`.
    expect((maidr.subplots[0][0].layers[0].data as ScatterPoint[]).map(point => point.y)).toEqual([5, 4, 3]);
  });

  it('reads a named line that computes its own column from the series it draws', () => {
    const { maidr } = bound(namedViews['layer, named series computing its column']);

    // Before: 0, 0, read from a sibling's rows, which lack the column; its
    // series are drawn in `tenfold_pathgroup`, not `layer_1_pathgroup`.
    const line = maidr.subplots[0][0].layers[1];
    expect((line.data as LinePoint[][]).map(series => series.map(point => point.y))).toEqual([[30, 50], [40, 80]]);
  });
});
