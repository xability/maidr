/**
 * @jest-environment jsdom
 */

/**
 * Tests for `Svg.createHighlightElement` in `src/util/svg.ts`.
 *
 * A line or polyline highlight is drawn as a clone of the original stroked at
 * the original width plus two, so the overlay reads as a thickening of the
 * line the reader is on. The width has to be read from the original element,
 * which is in the document: the clone is still detached when the width is
 * needed, and a detached element has no computed style, so reading it there
 * silently collapses every highlight to the bare increment.
 *
 * A group -- a Mermaid or Graphviz node, edge or cluster -- is outlined
 * through the shapes it holds. Its children declare their own paint, as an
 * attribute, a stylesheet rule or an inline `!important`, and a colour set on
 * the group reached none of them, so a node showed at most a green label and
 * an edge nothing at all.
 *
 * A light mark is drawn in a darker shade of its own colour, at least 3:1
 * against it, keeping the edge it draws in a colour of its own. Scaling its
 * dominant channel alone left a lavender slice 1.06:1 from its highlight.
 */

import type { Rgb } from '@type/color';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Color } from '@util/color';
import { Svg } from '@util/svg';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const FALLBACK_COLOR = '#03c809';

/**
 * Builds a chart whose stroke width comes from a stylesheet rule that only
 * matches an element inside the `<svg>`, the way a charting library styles its
 * series. A clone that has not been inserted yet matches nothing.
 */
function renderChart(tag: 'line' | 'polyline', strokeWidth: string): SVGElement {
  document.head.innerHTML = `<style>svg ${tag} { stroke-width: ${strokeWidth}; stroke: #1f77b4; }</style>`;

  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  svg.appendChild(element);
  document.body.appendChild(svg);

  return element;
}

describe('createHighlightElement stroke width', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it.each([
    { tag: 'polyline' as const, width: '5px', expected: '7px' },
    { tag: 'line' as const, width: '4px', expected: '6px' },
  ])('thickens a $tag of $width to $expected', ({ tag, width, expected }) => {
    const element = renderChart(tag, width);

    const highlight = Svg.createHighlightElement(element, FALLBACK_COLOR);

    expect(highlight.getAttribute('stroke-width')).toBe(expected);
  });

  it('falls back to the bare increment when the original has no stroke width', () => {
    const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
    const element = document.createElementNS(SVG_NAMESPACE, 'polyline');
    svg.appendChild(element);
    document.body.appendChild(svg);

    const highlight = Svg.createHighlightElement(element, FALLBACK_COLOR);

    expect(highlight.getAttribute('stroke-width')).toBe('2');
  });

  it('thickens the line inline, over a stylesheet rule that beats the attribute', () => {
    const element = renderChart('line', '1.5px');

    const highlight = Svg.createHighlightElement(element, FALLBACK_COLOR);

    expect(highlight.style.strokeWidth).toBe('3.5px');
    expect(highlight.getAttribute('stroke-width')).toBe('3.5px');
  });
});

/**
 * Draws markup into an `<svg id="d">` under a stylesheet.
 * @param markup - The svg's content
 * @param css - The page's stylesheet
 * @returns The svg
 */
function renderDiagram(markup: string, css = ''): SVGSVGElement {
  document.head.innerHTML = `<style>${css}</style>`;
  document.body.innerHTML = `<svg id="d" xmlns="${SVG_NAMESPACE}">${markup}</svg>`;
  return document.getElementById('d') as unknown as SVGSVGElement;
}

/**
 * Reads how a shape of a highlight is stroked.
 * @param shape - The shape
 * @returns Its inline stroke, width and fill, and whether the stroke is important
 */
function paintOf(shape: Element | null): { stroke: string; width: string; fill: string; important: string } {
  const style = (shape as SVGElement).style;
  return {
    stroke: style.getPropertyValue('stroke'),
    width: style.getPropertyValue('stroke-width'),
    fill: style.getPropertyValue('fill'),
    important: style.getPropertyPriority('stroke'),
  };
}

describe('createHighlightElement on a group', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('outlines a Mermaid node\'s shape over the stylesheet that paints it', () => {
    const svg = renderDiagram(
      '<g class="node"><rect></rect><text>A</text></g><g class="later"></g>',
      '#d .node rect { fill: #ffffff; stroke: #28253d; stroke-width: 2px; }',
    );
    const node = svg.querySelector('g.node') as SVGElement;

    const highlight = Svg.createHighlightElement(node, FALLBACK_COLOR);

    expect(paintOf(highlight.querySelector('rect'))).toEqual({
      stroke: FALLBACK_COLOR,
      width: '4px',
      fill: 'none',
      important: 'important',
    });
    // The group itself is not painted, so its label keeps its own colour.
    expect(highlight.getAttribute('fill')).toBeNull();
    expect(highlight.getAttribute('stroke')).toBeNull();
    expect(highlight.style.getPropertyValue('fill')).toBe('');
    expect(highlight.style.getPropertyValue('stroke')).toBe('');
    expect(highlight.getAttribute('visibility')).toBe('visible');
  });

  it('draws the outline last in its parent, above the marks drawn after the group', () => {
    const svg = renderDiagram(
      '<g class="cluster"><polygon style="fill: none; stroke: black"></polygon></g>'
      + '<g class="node"><polygon style="fill: #dbe9f6; stroke: black"></polygon></g>',
    );
    const cluster = svg.querySelector('g.cluster') as SVGElement;

    const highlight = Svg.createHighlightElement(cluster, FALLBACK_COLOR);

    expect(svg.lastElementChild).toBe(highlight);
    expect(cluster.nextElementSibling?.getAttribute('class')).toBe('node');
    expect(highlight.style.pointerEvents).toBe('none');
  });

  it('strokes both shapes of a Graphviz edge, which declare their paint as attributes', () => {
    const svg = renderDiagram('<g class="edge"><title>a--b</title>'
      + '<path fill="none" stroke="black" style="stroke-width: 1px"></path>'
      + '<polygon fill="black" stroke="black" style="stroke-width: 1px"></polygon></g>');
    const edge = svg.querySelector('g.edge') as SVGElement;

    const highlight = Svg.createHighlightElement(edge, FALLBACK_COLOR);

    for (const shape of highlight.querySelectorAll('path, polygon')) {
      expect(paintOf(shape)).toEqual({ stroke: FALLBACK_COLOR, width: '3px', fill: 'none', important: 'important' });
    }
  });

  it('leaves a shape\'s arrowhead off its outline, where it would grow over it', () => {
    // An Ishikawa cause is its branch line, an arrowhead and its label. A
    // marker is scaled by the width of the line it is on, so the outline's
    // copy drew the arrowhead three times its size, in its own dark paint,
    // over most of a 30px branch. The arrowhead drawn under the outline stays.
    const svg = renderDiagram('<defs><marker id="arrow"><path d="M 10 0 L 0 5 L 10 10 Z"></path></marker></defs>'
      + '<g class="ishikawa-sub-group"><line marker-start="url(#arrow)" style="stroke: #333333; stroke-width: 1px"></line>'
      + '<text>Lens</text></g>');
    const cause = svg.querySelector('g.ishikawa-sub-group') as SVGElement;

    const highlight = Svg.createHighlightElement(cause, FALLBACK_COLOR);

    const line = (highlight.querySelector('line') as SVGElement).style;
    expect(paintOf(highlight.querySelector('line')).stroke).toBe(FALLBACK_COLOR);
    for (const marker of ['marker-start', 'marker-mid', 'marker-end']) {
      expect([line.getPropertyValue(marker), line.getPropertyPriority(marker)]).toEqual(['none', 'important']);
    }
    expect(cause.querySelector('line')?.getAttribute('marker-start')).toBe('url(#arrow)');
  });

  it('replaces a C4 shape\'s inline !important paint', () => {
    const svg = renderDiagram('<g><rect style="fill: #999999 !important; stroke: #8a8a8a !important"></rect></g>');

    const highlight = Svg.createHighlightElement(svg.querySelector('g') as SVGElement, FALLBACK_COLOR);

    expect(paintOf(highlight.querySelector('rect'))).toMatchObject({ stroke: FALLBACK_COLOR, important: 'important' });
  });

  it('leaves a shape the chart draws with no paint unpainted', () => {
    const svg = renderDiagram('<g><rect id="hit" style="fill: none; stroke: none"></rect>'
      + '<rect id="box" style="fill: #ffffff; stroke: #000000"></rect></g>');

    const highlight = Svg.createHighlightElement(svg.querySelector('g') as SVGElement, FALLBACK_COLOR);

    expect(paintOf(highlight.querySelector('#hit'))).toMatchObject({ stroke: 'none', important: '' });
    expect(paintOf(highlight.querySelector('#box')).stroke).toBe(FALLBACK_COLOR);
  });

  it('outlines a shape drawn without an edge twice as wide as the increase', () => {
    // A Mermaid architecture service's tile is filled and drawn with no
    // stroke. At the bare increment half of its two units fell inside the
    // tile, and the outline was a third as wide as other diagrams' nodes.
    const svg = renderDiagram('<g class="architecture-service">'
      + '<rect id="tile" style="fill: #087ebf; stroke: none; stroke-width: 0px"></rect>'
      + '<circle id="glyph" style="fill: none; stroke: #ffffff; stroke-width: 2px"></circle></g>');

    const highlight = Svg.createHighlightElement(svg.querySelector('g') as SVGElement, FALLBACK_COLOR);

    expect(paintOf(highlight.querySelector('#tile')).width).toBe('4px');
    // A shape that draws its own edge is still widened by the increase.
    expect(paintOf(highlight.querySelector('#glyph')).width).toBe('4px');
  });

  it('lets the outline of a shape inside a nested svg spill over its edge', () => {
    // Mermaid draws an architecture service's icon in an `<svg>` of its own,
    // which clips what it holds to its box: the outer half of the tile's
    // outline, the half on the page, was cut away.
    const svg = renderDiagram('<g class="architecture-service"><g>'
      + '<svg width="80" height="80" viewBox="0 0 80 80">'
      + '<rect width="80" height="80" style="fill: #087ebf; stroke: none; stroke-width: 0px"></rect>'
      + '</svg></g></g>');
    const service = svg.querySelector('g.architecture-service') as SVGElement;

    const highlight = Svg.createHighlightElement(service, FALLBACK_COLOR);
    const icon = highlight.querySelector('svg') as SVGElement;

    expect(icon.style.getPropertyValue('overflow')).toBe('visible');
    expect(icon.style.getPropertyPriority('overflow')).toBe('important');
    // The chart's own icon is left as it was drawn.
    expect((service.querySelector('svg') as SVGElement).style.getPropertyValue('overflow')).toBe('');
  });

  it('paints a group drawing nothing but text whole, beside it, as before', () => {
    const svg = renderDiagram('<g id="label"><text>x</text></g><g id="after"></g>');
    const label = svg.querySelector('#label') as SVGElement;

    const highlight = Svg.createHighlightElement(label, FALLBACK_COLOR);

    expect(highlight.getAttribute('fill')).toBe(FALLBACK_COLOR);
    expect(highlight.style.fill).toBe(FALLBACK_COLOR);
    expect(label.nextElementSibling).toBe(highlight);
  });
});

/**
 * Puts one mark in the document, painted by its inline style, which is the
 * one style jsdom computes.
 * @param tag - The mark's element
 * @param style - Its inline style
 * @param attributes - Its other attributes, such as its geometry
 * @returns The mark
 */
function renderMark(tag: string, style: string, attributes = ''): SVGElement {
  document.body.innerHTML = `<svg xmlns="${SVG_NAMESPACE}"><${tag} ${attributes} style="${style}"></${tag}></svg>`;
  return document.querySelector(tag) as SVGElement;
}

/**
 * The WCAG contrast between two colours.
 * @param a - One colour
 * @param b - The other
 * @returns The ratio, from 1 to 21
 */
function contrast(a: string, b: string): number {
  return Color.getContrastRatio(Color.parse(a) as Rgb, Color.parse(b) as Rgb);
}

describe('createHighlightElement colour', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  // Mermaid's pie and XY bars, its cats slice and gantt task, a yellow radar
  // series, white, light grey and a light heat map cell: each came out
  // between 1.06:1 and 2.85:1 against the mark it covered.
  it.each(['#ECECFF', '#FFFFDE', '#B9B9FF', '#BFC7FF', '#FFFF78', '#FFFFFF', '#D3D3D3', '#F8D6BE'])(
    'darkens a light mark of %s to 3:1 against it and against a white page',
    (fill) => {
      const mark = renderMark('rect', `fill: ${fill}; stroke: ${fill}`);

      const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);
      const color = highlight.getAttribute('fill') ?? '';

      expect(contrast(color, fill)).toBeGreaterThanOrEqual(3);
      expect(contrast(color, '#FFFFFF')).toBeGreaterThanOrEqual(3);
    },
  );

  it('draws a light mark in the highlight colour as it is when asked to', () => {
    const mark = renderMark('rect', 'fill: #FFFFFF');

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR, { useColorAsIs: true });

    expect(highlight.getAttribute('fill')).toBe(FALLBACK_COLOR);
  });

  it('draws a dark mark in the highlight colour', () => {
    const mark = renderMark('rect', 'fill: #1F77B4');

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(highlight.getAttribute('fill')).toBe(FALLBACK_COLOR);
  });

  it('keeps the edge a mark draws in a colour of its own', () => {
    const mark = renderMark('path', 'fill: #ECECFF; stroke: #000000; stroke-width: 2px');

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(Color.isEqual(highlight.style.stroke, '#000000')).toBe(true);
    expect(Color.isEqual(highlight.getAttribute('stroke') ?? '', '#000000')).toBe(true);
  });

  it.each([
    { what: 'an edge drawn in the fill\'s own colour', tag: 'circle', style: 'fill: #FFFF78; stroke: #FFFF78' },
    { what: 'a hollow marker, whose stroke closes on itself', tag: 'path', style: 'fill: none; stroke: #1F77B4', d: 'M 0 -3 A 3 3 0 1 1 0 3 A 3 3 0 1 1 0 -3 Z' },
    { what: 'an edge drawn at zero opacity', tag: 'rect', style: 'fill: #ECECFF; stroke: #000000; stroke-opacity: 0' },
  ])('strokes $what in the highlight\'s own colour', ({ tag, style, d }) => {
    const mark = renderMark(tag, style, d === undefined ? '' : `d="${d}"`);

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(highlight.style.stroke).toBe(highlight.style.fill);
  });

  it.each(['#FFFFFF', '#D3D3D3'])('draws a mark of %s, which has no hue, in a shade of the highlight colour', (fill) => {
    // A Recharts line's dot is filled white inside a ring in the line's
    // colour. A darker shade of white is a mid grey, and the dot read was
    // grey inside its ring where every bar of the chart turned green.
    const mark = renderMark('circle', `fill: ${fill}; stroke: #8884d8; stroke-width: 1px`);

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);
    const color = Color.parse(highlight.getAttribute('fill') ?? '') as Rgb;

    // Green, as the highlight colour is, and still 3:1 against the mark.
    expect(color.g).toBeGreaterThan(color.r + 100);
    expect(color.g).toBeGreaterThan(color.b + 100);
    expect(contrast(Color.rgbToString(color), fill)).toBeGreaterThanOrEqual(3);
  });

  it('takes a near-white within the grey cut-off to the highlight colour, and a tint past it to its own', () => {
    // #F4F4FB's channels spread by 7, within the cut-off of 8; #F0F0FF's by 15.
    const grey = Svg.createHighlightElement(renderMark('rect', 'fill: #F4F4FB'), FALLBACK_COLOR);
    const greyColor = Color.parse(grey.getAttribute('fill') ?? '') as Rgb;
    const tint = Svg.createHighlightElement(renderMark('rect', 'fill: #F0F0FF'), FALLBACK_COLOR);
    const tintColor = Color.parse(tint.getAttribute('fill') ?? '') as Rgb;

    expect(greyColor.g).toBeGreaterThan(greyColor.b + 100);
    expect(tintColor.b).toBeGreaterThan(tintColor.g);
  });

  it('still reaches 3:1 against a white mark when the highlight colour is a grey', () => {
    // A grey highlight colour has no hue to give the shade, but the shade is
    // still taken far enough to read against the mark.
    const mark = renderMark('circle', 'fill: #FFFFFF; stroke: #8884d8; stroke-width: 1px');

    const highlight = Svg.createHighlightElement(mark, '#C0C0C0');

    expect(contrast(highlight.getAttribute('fill') ?? '', '#FFFFFF')).toBeGreaterThanOrEqual(3);
  });

  it('draws the copy of a ribbon drawn by its stroke at 20% opaque', () => {
    // A Recharts sankey ribbon's copy kept its 20%, and the ribbon read was a
    // slightly deeper tint of the same pale green as the ribbons beside it.
    const mark = renderMark('path', 'fill: none; stroke: #82ca9d; stroke-width: 40px; stroke-opacity: 0.2', 'd="M 0 0 C 50 0 50 100 100 100"');

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(highlight.style.strokeOpacity).toBe('1');
  });

  it.each([
    { what: 'a bar filled at 30%', tag: 'rect', style: 'fill: #1f77b4; fill-opacity: 0.3', opacity: '0.3' },
    { what: 'a point filled at 50%, as overlapping points are', tag: 'circle', style: 'fill: #1f77b4; fill-opacity: 0.5', opacity: '0.5' },
  ])('keeps the opacity of $what, so what it is drawn over still shows', ({ tag, style, opacity }) => {
    const mark = renderMark(tag, style);

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(highlight.style.fillOpacity).toBe(opacity);
  });

  it('draws the copy of a hit target filled at 0% opaque, as before', () => {
    const mark = renderMark('rect', 'fill: #1f77b4; fill-opacity: 0');

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(highlight.style.fillOpacity).toBe('1');
  });
});

describe('createHighlightElement on a mark too small to see', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  /**
   * Draws one mark and gives it the boxes a browser would measure, which
   * jsdom, laying nothing out, does not.
   * @param tag - The mark's element
   * @param attributes - Its geometry
   * @param box - Its box in its own user units, as `getBBox` reports it
   * @param box.x - The box's left edge
   * @param box.y - The box's top edge
   * @param box.width - The box's width
   * @param box.height - The box's height
   * @param screen - Its size on the page
   * @param screen.width - Its width on the page
   * @param screen.height - Its height on the page
   * @returns The mark
   */
  function measuredMark(
    tag: string,
    attributes: string,
    box: { x: number; y: number; width: number; height: number },
    screen: { width: number; height: number },
  ): SVGElement {
    const mark = renderMark(tag, 'fill: #808080; stroke: #000000; stroke-width: 1px', attributes);
    Object.defineProperty(mark, 'getBBox', { value: () => box });
    Object.defineProperty(mark, 'getBoundingClientRect', {
      value: () => ({ x: 0, y: 0, left: 0, top: 0, right: screen.width, bottom: screen.height, ...screen }),
    });
    return mark;
  }

  it('marks a wick shorter than a pixel with a circle at its middle', () => {
    // mplfinance drew an upper wick 0.04 price units long, a tenth of a pixel.
    const wick = measuredMark(
      'path',
      'd="M 209.5 302.99 L 209.5 303.09"',
      { x: 209.5, y: 302.99, width: 0, height: 0.1 },
      { width: 0, height: 0.13 },
    );

    const highlight = Svg.createHighlightElement(wick, FALLBACK_COLOR);

    expect(highlight.tagName.toLowerCase()).toBe('circle');
    expect(Number(highlight.getAttribute('cx'))).toBeCloseTo(209.5);
    expect(Number(highlight.getAttribute('cy'))).toBeCloseTo(303.04);
    expect(Number(highlight.getAttribute('r'))).toBeGreaterThanOrEqual(4);
    expect(highlight.getAttribute('fill')).toBe(FALLBACK_COLOR);
    expect(wick.nextElementSibling).toBe(highlight);
    expect(Svg.isOwned(highlight)).toBe(true);
  });

  it('marks a rect with no height, which is not drawn at all, at its middle', () => {
    // A spine plot's empty tile is drawn 52 px wide and 0 high.
    const tile = measuredMark(
      'rect',
      'x="447" y="91" width="52" height="0"',
      { x: 447, y: 91, width: 52, height: 0 },
      { width: 52, height: 0 },
    );

    const highlight = Svg.createHighlightElement(tile, FALLBACK_COLOR);

    expect(highlight.tagName.toLowerCase()).toBe('circle');
    expect(Number(highlight.getAttribute('cx'))).toBe(473);
    expect(Number(highlight.getAttribute('cy'))).toBe(91);
  });

  it('marks a point drawn as a zero-length path where it is, as before', () => {
    const point = measuredMark('path', 'd="M 40 60"', { x: 40, y: 60, width: 0, height: 0 }, { width: 0, height: 0 });

    const highlight = Svg.createHighlightElement(point, FALLBACK_COLOR);

    expect(highlight.tagName.toLowerCase()).toBe('circle');
    expect([highlight.getAttribute('cx'), highlight.getAttribute('cy')]).toEqual(['40', '60']);
  });

  it.each([
    { what: 'a path with no height, which strokes a line', tag: 'path', attributes: 'd="M 0 10 L 52 10"', box: { x: 0, y: 10, width: 52, height: 0 } },
    { what: 'a wick a pixel long', tag: 'path', attributes: 'd="M 5 10 L 5 11"', box: { x: 5, y: 10, width: 0, height: 1 } },
  ])('copies $what', ({ tag, attributes, box }) => {
    const mark = measuredMark(tag, attributes, box, box);

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(highlight.tagName.toLowerCase()).toBe(tag);
  });

  it.each([
    { what: 'that is hidden itself', group: '', mark: 'display: none' },
    { what: 'in a group that is hidden', group: 'display: none', mark: '' },
  ])('copies a mark $what, which measures as nothing, rather than drawing a marker for it', ({ group, mark: hidden }) => {
    // A mark that is not drawn reports an empty box, which passes for one too
    // small to see; a marker for it would be drawn, visible, at that box.
    document.body.innerHTML = `<svg xmlns="${SVG_NAMESPACE}"><g style="${group}">`
      + `<path d="M 209.5 302.99 L 209.5 303.09" style="stroke: #000000; ${hidden}"></path></g></svg>`;
    const mark = document.querySelector('path') as SVGElement;
    Object.defineProperty(mark, 'getBBox', { value: () => ({ x: 0, y: 0, width: 0, height: 0 }) });

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(highlight.tagName.toLowerCase()).toBe('path');
    expect(document.querySelector('circle')).toBeNull();
  });
});

describe('createHighlightElement on a mark drawn by its stroke alone', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  // ApexCharts draws a radial gauge's value as an arc, Frappe a donut's slices
  // and every producer a percentile band's median as open lines, all unfilled.
  // Filled, the highlight covered the hollow centre, or the band between the
  // line and the chord joining its ends.
  it.each([
    { what: 'a gauge\'s arc', d: 'M 200 40 A 160 160 0 1 1 51.6 140.2' },
    { what: 'a band\'s median line', d: 'M 60.43 258.1 L 94.02 247.14 L 127.6 251.9 L 429.83 137.59' },
  ])('strokes $what wider in the highlight colour and leaves it unfilled', ({ d }) => {
    const mark = renderMark('path', 'fill: none; stroke: #1F77B4; stroke-width: 2px', `d="${d}"`);

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(highlight.getAttribute('fill')).toBe('none');
    expect(highlight.style.fill).toBe('none');
    expect(highlight.getAttribute('stroke')).toBe(FALLBACK_COLOR);
    expect(highlight.getAttribute('stroke-width')).toBe('4px');
  });

  it('strokes an error bar, whose fill covers nothing, in the highlight colour', () => {
    // Plotly draws the cap, the bar and the shoe as three straight runs and
    // leaves the fill at its default black. Recolouring the fill drew nothing,
    // and the bar kept its own stroke: the highlight was the bar as drawn.
    const mark = renderMark(
      'path',
      'fill: rgb(0, 0, 0); stroke: rgb(31, 119, 180); stroke-width: 2px',
      'd="M226.5,373h16m-8,0V420m-8,0h16"',
    );

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(highlight.getAttribute('stroke')).toBe(FALLBACK_COLOR);
    expect(highlight.getAttribute('stroke-width')).toBe('4px');
    expect(highlight.getAttribute('fill')).toBe('none');
  });

  it('leaves an unfilled polyline unfilled', () => {
    const mark = renderMark(
      'polyline',
      'fill: none; stroke: #12355b; stroke-width: 2px',
      'points="100,240 180,238.2 260,235.5 340,236.4"',
    );

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(highlight.getAttribute('fill')).toBe('none');
    expect(highlight.getAttribute('stroke')).toBe(FALLBACK_COLOR);
  });

  it('fills a polyline the chart fills', () => {
    const mark = renderMark('polyline', 'fill: #1F77B4; stroke: #1F77B4', 'points="0,10 10,0 20,10"');

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(highlight.getAttribute('fill')).toBe(FALLBACK_COLOR);
  });

  it('fills a filled area drawn as an open path, as the chart does', () => {
    const mark = renderMark('path', 'fill: #1F77B4; stroke: #1F77B4; stroke-width: 1px', 'd="M 0 100 L 50 20 L 100 60 L 100 100"');

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(highlight.getAttribute('fill')).toBe(FALLBACK_COLOR);
    expect(highlight.getAttribute('stroke-width')).toBeNull();
  });
});

/**
 * Gives each element marked `data-box="left,top,width,height"` that box on
 * screen, which jsdom, laying nothing out, never gives anything.
 */
function useMarkedBoxes(): void {
  jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const [left, top, width, height] = (this.getAttribute('data-box') ?? '0,0,0,0').split(',').map(Number);
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

describe('createLabelHighlights', () => {
  const BLACK_AND_WHITE = ['#000000', '#ffffff'];

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    useMarkedBoxes();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Draws a mark and the label Mermaid draws over it, as a gantt task or a
   * packet field is drawn, and highlights the mark.
   * @param markStyle - The mark's paint
   * @param labelStyle - The label's paint
   * @param labelBox - Where the label is on screen
   * @returns The mark, its label, and the highlight's label copies
   */
  function labelledMark(
    markStyle: string,
    labelStyle: string,
    labelBox = '40,4,30,12',
    colors: readonly string[] = BLACK_AND_WHITE,
  ): { mark: SVGElement; label: SVGElement; highlight: SVGElement; copies: SVGElement[] } {
    renderDiagram(`<g><rect id="adapter" class="task crit1" data-box="0,0,100,20" style="${markStyle}"></rect>`
      + `<text id="adapter-text" class="taskText" data-box="${labelBox}" style="${labelStyle}">Adapter</text></g>`);
    const mark = document.getElementById('adapter') as unknown as SVGElement;
    const label = document.getElementById('adapter-text') as unknown as SVGElement;
    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);
    return { mark, label, highlight, copies: Svg.createLabelHighlights(mark, highlight, colors) };
  }

  it('copies a white label over a dark task in a colour that reads on the highlight', () => {
    // A critical gantt task is red, which the highlight colour covers, and
    // its white label sat on the highlight green at 2.27:1.
    const { label, highlight, copies } = labelledMark('fill: #ff0000', 'fill: #ffffff');

    expect(copies).toHaveLength(1);
    const [copy] = copies;
    expect(copy.textContent).toBe('Adapter');
    expect(contrast(copy.style.getPropertyValue('fill'), highlight.style.fill)).toBeGreaterThanOrEqual(4.5);
    expect(copy.style.getPropertyPriority('fill')).toBe('important');
    // Drawn just above the label it copies, as MAIDR's, with nothing of its
    // own for a selector or a screen reader to find.
    expect(label.nextElementSibling).toBe(copy);
    expect(Svg.isOwned(copy)).toBe(true);
    expect(copy.hasAttribute('id')).toBe(false);
    expect(copy.getAttribute('aria-hidden')).toBe('true');
    // The label itself is left as it is.
    expect(label.style.getPropertyValue('fill')).toBe('#ffffff');
  });

  it('chooses from the reader\'s high contrast pair', () => {
    const { copies } = labelledMark('fill: #000000', 'fill: #ffff00', undefined, ['#ffff00', '#000080']);

    expect(copies).toHaveLength(1);
    expect(copies[0].style.getPropertyValue('fill')).toBe('#000080');
  });

  it('colours the spans of a label as well', () => {
    renderDiagram('<rect id="field" data-box="0,0,100,20" style="fill: #000000"></rect>'
      + '<text id="field-text" data-box="40,4,30,12" style="fill: #ffffff"><tspan style="fill: #ffffff">Source port</tspan></text>');
    const mark = document.getElementById('field') as unknown as SVGElement;
    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR, { useColorAsIs: true });

    const [copy] = Svg.createLabelHighlights(mark, highlight, BLACK_AND_WHITE);

    expect((copy.querySelector('tspan') as SVGElement).style.getPropertyValue('fill')).toBe('#000000');
  });

  it('redraws the outline a label draws round its glyphs in the other colour', () => {
    // Highcharts outlines a data label in white, with a span drawn under the
    // text. Kept white round the copy's white glyphs, the outline filled the
    // letters in, and a sunburst's label was a white smear.
    renderDiagram('<path id="wedge" data-box="0,0,100,60" style="fill: #00e272"></path>'
      + '<text id="wedge-label" data-box="30,20,40,12" style="fill: #000000">'
      + '<tspan class="highcharts-text-outline" style="fill: #ffffff; stroke: #ffffff; stroke-width: 2px">Renewable</tspan>'
      + 'Renewable</text>');
    const mark = document.getElementById('wedge') as unknown as SVGElement;
    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    const [copy] = Svg.createLabelHighlights(mark, highlight, BLACK_AND_WHITE);

    const outline = copy.querySelector('tspan') as SVGElement;
    expect(copy.style.getPropertyValue('fill')).toBe('#ffffff');
    expect(outline.style.getPropertyValue('fill')).toBe('#ffffff');
    expect([outline.style.getPropertyValue('stroke'), outline.style.getPropertyPriority('stroke')])
      .toEqual(['#000000', 'important']);
    // The text itself draws no outline, and is given none.
    expect(copy.style.getPropertyValue('stroke')).toBe('');
    // The label is left as the chart drew it.
    expect((document.querySelector('#wedge-label tspan') as SVGElement).style.getPropertyValue('stroke')).toBe('#ffffff');
  });

  it('redraws an outline whose colour the browser reports in a form no parser here reads', () => {
    // Chromium reports the white of Highcharts' text outline as
    // `color(srgb 1 1 1)`. Read as no colour at all, the outline was left
    // white, and the label on the real page stayed a white smear.
    renderDiagram('<path id="wedge" data-box="0,0,100,60" style="fill: #00e272"></path>'
      + '<text id="wedge-label" data-box="30,20,40,12" style="fill: #000000">'
      + '<tspan class="highcharts-text-outline" style="fill: #ffffff; stroke: #ffffff; stroke-width: 2px">Renewable</tspan>'
      + 'Renewable</text>');
    const mark = document.getElementById('wedge') as unknown as SVGElement;
    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);
    const outlined = document.querySelector('#wedge-label tspan') as Element;
    // jsdom's CSS parser drops colour functions it does not know, so the
    // value Chromium reports is handed back by a stand-in for the style.
    const computed = window.getComputedStyle.bind(window);
    jest.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = computed(element, pseudo);
      return element === outlined
        ? new Proxy(style, { get: (target, key) => (key === 'stroke' ? 'color(srgb 1 1 1)' : Reflect.get(target, key)) })
        : style;
    });

    const [copy] = Svg.createLabelHighlights(mark, highlight, BLACK_AND_WHITE);

    expect((copy.querySelector('tspan') as SVGElement).style.getPropertyValue('stroke')).toBe('#000000');
  });

  it('draws the outline black round white glyphs when the reader\'s two colours are the same', () => {
    // With both high contrast colours set to white, the only colour on offer
    // for the outline was the glyphs' own, and the letters filled in.
    renderDiagram('<path id="wedge" data-box="0,0,100,60" style="fill: #00e272"></path>'
      + '<text id="wedge-label" data-box="30,20,40,12" style="fill: #000000">'
      + '<tspan class="highcharts-text-outline" style="fill: #ffffff; stroke: #ffffff; stroke-width: 2px">Renewable</tspan>'
      + 'Renewable</text>');
    const mark = document.getElementById('wedge') as unknown as SVGElement;
    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    const [copy] = Svg.createLabelHighlights(mark, highlight, ['#ffffff', '#ffffff']);

    expect(copy.style.getPropertyValue('fill')).toBe('#ffffff');
    expect((copy.querySelector('tspan') as SVGElement).style.getPropertyValue('stroke')).toBe('#000000');
  });

  it('draws a stroke the label\'s own text draws in the other colour too', () => {
    renderDiagram('<path id="wedge" data-box="0,0,100,60" style="fill: #00e272"></path>'
      + '<text id="wedge-label" data-box="30,20,40,12" style="fill: #000000; stroke: #ffffff; stroke-width: 1px">Renewable</text>');
    const mark = document.getElementById('wedge') as unknown as SVGElement;
    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    const [copy] = Svg.createLabelHighlights(mark, highlight, BLACK_AND_WHITE);

    expect([copy.style.getPropertyValue('fill'), copy.style.getPropertyValue('stroke')]).toEqual(['#ffffff', '#000000']);
  });

  it('leaves a label that already reads on the highlight', () => {
    // A light mark's highlight is a darker shade of it, stopping at 3:1 so
    // the dark label over it still reads.
    const { copies } = labelledMark('fill: #ECECFF', 'fill: #000000');

    expect(copies).toEqual([]);
  });

  it('leaves a label beside the mark rather than over it', () => {
    const { copies } = labelledMark('fill: #ff0000', 'fill: #ffffff', '110,4,30,12');

    expect(copies).toEqual([]);
  });

  it('leaves a label drawn under the mark', () => {
    renderDiagram('<text id="under" data-box="40,4,30,12" style="fill: #ffffff">Under</text>'
      + '<rect id="mark" data-box="0,0,100,20" style="fill: #ff0000"></rect>');
    const mark = document.getElementById('mark') as unknown as SVGElement;
    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(Svg.createLabelHighlights(mark, highlight, BLACK_AND_WHITE)).toEqual([]);
  });

  it('leaves the labels of an outlined group, which keeps its fill', () => {
    renderDiagram('<g id="node" data-box="0,0,100,20"><rect data-box="0,0,100,20" style="fill: #ff0000; stroke: #000000"></rect>'
      + '<text data-box="40,4,30,12" style="fill: #ffffff">Node</text></g>');
    const node = document.getElementById('node') as unknown as SVGElement;
    const highlight = Svg.createHighlightElement(node, FALLBACK_COLOR);

    expect(Svg.createLabelHighlights(node, highlight, BLACK_AND_WHITE)).toEqual([]);
  });

  it('leaves a label inside the box of a line, which fills nothing', () => {
    renderDiagram('<polyline id="line" data-box="0,0,100,100" style="fill: none; stroke: #1f77b4"></polyline>'
      + '<text data-box="40,40,30,12" style="fill: #ffffff">Note</text>');
    const line = document.getElementById('line') as unknown as SVGElement;
    const highlight = Svg.createHighlightElement(line, FALLBACK_COLOR);

    expect(Svg.createLabelHighlights(line, highlight, BLACK_AND_WHITE)).toEqual([]);
  });

  it('leaves MAIDR\'s own copies of a label', () => {
    renderDiagram('<rect id="mark" data-box="0,0,100,20" style="fill: #ff0000"></rect>'
      + '<text data-maidr-owned="true" visibility="hidden" data-box="40,4,30,12" style="fill: #ffffff">Copy</text>');
    const mark = document.getElementById('mark') as unknown as SVGElement;
    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(Svg.createLabelHighlights(mark, highlight, BLACK_AND_WHITE)).toEqual([]);
  });
});

describe('createLabelHighlights under a shape drawn over the mark', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    useMarkedBoxes();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('leaves a label on a shape drawn over the mark, as a treemap item over its section', () => {
    renderDiagram('<g><rect id="section" data-box="0,0,200,100" style="fill: #1f77b4"></rect>'
      + '<clipPath><rect data-box="0,0,200,100"></rect></clipPath>'
      + '<rect id="item" data-box="10,30,80,60" style="fill: #ff7f0e"></rect>'
      + '<text id="section-label" data-box="80,5,40,12" style="fill: #ffffff">Products</text>'
      + '<text id="item-label" data-box="30,50,40,12" style="fill: #ffffff">Phones</text></g>');
    const section = document.getElementById('section') as unknown as SVGElement;
    const highlight = Svg.createHighlightElement(section, FALLBACK_COLOR);

    const copies = Svg.createLabelHighlights(section, highlight, ['#000000', '#ffffff']);

    // The section's own label is on the highlight; the item's is on the item.
    expect(copies.map(copy => copy.textContent)).toEqual(['Products']);
  });
});
