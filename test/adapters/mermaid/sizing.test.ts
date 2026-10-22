/**
 * @jest-environment jsdom
 */

import type { MermaidApi } from '@adapters/mermaid/types';
import { renderMermaid } from '@adapters/mermaid/bind';
import { describe, expect, it } from '@jest/globals';
import { convert, drawn } from './helpers';

/**
 * The size the converter leaves a drawing at, and the room it leaves in it.
 *
 * MAIDR's plot is only as wide as what it holds, so a drawing whose width is
 * a share of its container's has nothing to take that share of. Mermaid
 * draws one by default: `width="100%"` and an inline `max-width`, which the
 * browser drew at its 300px fallback.
 *
 * MAIDR's focus ring is drawn 5px into the chart, over what is there, and
 * Mermaid crops a drawing to what it drew.
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

  it('pads a drawing inside its size, so the focus ring covers none of it', () => {
    const svg = pieDrawn(undefined, 'max-width: 400px;');

    convert('pie', PIE, svg);

    expect(svg.style.padding).toBe('5px');
    expect(svg.style.boxSizing).toBe('border-box');
    expect(svg.style.maxWidth).toBe('400px');
  });

  it('keeps a padding the drawing has of its own', () => {
    const svg = pieDrawn(undefined, 'padding: 12px;');

    convert('pie', PIE, svg);

    expect(svg.style.padding).toBe('12px');
  });

  it('sizes and pads the drawing renderMermaid puts on the page', async () => {
    document.body.innerHTML = '<pre class="mermaid">pie\n  "Dogs" : 3</pre>';
    const mermaid: MermaidApi = {
      mermaidAPI: { getDiagramFromText: async () => ({ type: 'pie', db: PIE }) },
      render: async (id: string) => ({
        svg: `<svg id="${id}" width="100%" style="max-width: 640px;"><path class="pieCircle"></path></svg>`,
      }),
    };

    await renderMermaid(mermaid, document.querySelector('pre') as Element);

    const svg = document.querySelector('svg[maidr]') as SVGSVGElement;
    expect(svg.style.width).toBe('640px');
    expect(svg.style.maxWidth).toBe('100%');
    expect(svg.style.padding).toBe('5px');
    expect(svg.style.boxSizing).toBe('border-box');
  });

  it.each([
    ['an absolute width', '672', undefined],
    ['no max-width', '100%', undefined],
    ['a max-width that is a share too', '100%', 'max-width: 80%;'],
    ['a width of its own', '100%', 'max-width: 1062px; width: 500px;'],
    ['a share other than all of it', '50%', 'max-width: 1062px;'],
  ])('leaves the width of a drawing with %s as it is', (_, width, style) => {
    const svg = pieDrawn(width, style);
    const before = { width: svg.style.width, maxWidth: svg.style.maxWidth };

    convert('pie', PIE, svg);

    expect({ width: svg.style.width, maxWidth: svg.style.maxWidth }).toEqual(before);
    expect(svg.getAttribute('width')).toBe(width);
  });

  it('leaves a diagram it does not read as Mermaid drew it', () => {
    const svg = pieDrawn('100%', 'max-width: 600px;');

    expect(() => convert('mystery', {}, svg)).toThrow(/not supported/);
    expect(svg.getAttribute('style')).toBe('max-width: 600px;');
  });
});
