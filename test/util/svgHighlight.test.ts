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
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
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
});
