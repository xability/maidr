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
import { beforeEach, describe, expect, it } from '@jest/globals';
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
 * @returns The mark
 */
function renderMark(tag: string, style: string): SVGElement {
  document.body.innerHTML = `<svg xmlns="${SVG_NAMESPACE}"><${tag} style="${style}"></${tag}></svg>`;
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
    { what: 'a mark with no fill', tag: 'path', style: 'fill: none; stroke: #1F77B4' },
    { what: 'an edge drawn at zero opacity', tag: 'rect', style: 'fill: #ECECFF; stroke: #000000; stroke-opacity: 0' },
  ])('strokes $what in the highlight\'s own colour', ({ tag, style }) => {
    const mark = renderMark(tag, style);

    const highlight = Svg.createHighlightElement(mark, FALLBACK_COLOR);

    expect(highlight.style.stroke).toBe(highlight.style.fill);
  });
});
