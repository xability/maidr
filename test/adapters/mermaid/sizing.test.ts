/**
 * @jest-environment jsdom
 */

import { describe, expect, it } from '@jest/globals';
import { convert, drawn } from './helpers';

/**
 * The size the converter leaves a drawing at.
 *
 * MAIDR's plot is only as wide as what it holds, so a drawing whose width is
 * a share of its container's has nothing to take that share of. Mermaid
 * draws one by default: `width="100%"` and an inline `max-width`, which the
 * browser drew at its 300px fallback.
 */

const PIE = { getSections: () => new Map([['Dogs', 3], ['Cats', 2]]) };

/**
 * A pie drawing with the given size attributes.
 *
 * @param width - Its `width` attribute, if any
 * @param style - Its `style` attribute, if any
 * @returns The drawing
 */
function pieDrawn(width?: string, style?: string): SVGSVGElement {
  const svg = drawn('pie', '<path class="pieCircle"></path><path class="pieCircle"></path>');
  if (width !== undefined) {
    svg.setAttribute('width', width);
  }
  if (style !== undefined) {
    svg.setAttribute('style', style);
  }
  return svg;
}

describe('the drawing\'s size', () => {
  it('gives a drawing Mermaid sized to its container the width it was drawn at', () => {
    const svg = pieDrawn('100%', 'max-width: 1062.02px; background-color: white;');

    convert('pie', PIE, svg);

    expect(svg.style.width).toBe('1062.02px');
    expect(svg.style.maxWidth).toBe('100%');
    expect(svg.style.backgroundColor).toBe('white');
  });

  it.each([
    ['an absolute width', '672', undefined],
    ['no max-width', '100%', undefined],
    ['a max-width that is a share too', '100%', 'max-width: 80%;'],
    ['a width of its own', '100%', 'max-width: 1062px; width: 500px;'],
    ['a share other than all of it', '50%', 'max-width: 1062px;'],
  ])('leaves a drawing with %s as it is', (_, width, style) => {
    const svg = pieDrawn(width, style);
    const before = svg.getAttribute('style');

    convert('pie', PIE, svg);

    expect(svg.getAttribute('style')).toBe(before);
    expect(svg.getAttribute('width')).toBe(width);
  });

  it('leaves a diagram it does not read as Mermaid drew it', () => {
    const svg = pieDrawn('100%', 'max-width: 600px;');

    expect(() => convert('mystery', {}, svg)).toThrow(/not supported/);
    expect(svg.getAttribute('style')).toBe('max-width: 600px;');
  });
});
