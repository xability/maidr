/**
 * @jest-environment jsdom
 *
 * The room the Mermaid and Observable adapters leave in a drawing for
 * MAIDR's focus ring, and the padding they leave alone.
 *
 * The helper read only a padding written on the drawing, so one a page's
 * stylesheet gave it was overridden by the 6px it wrote, against what both
 * adapters' docs say.
 */

import { leaveRoomForFocusRing } from '@adapters/shared/focusRing';
import { afterEach, describe, expect, it } from '@jest/globals';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A drawing, placed in the page unless told otherwise.
 * @param placed - Whether to put it in the page
 * @returns The drawing
 */
function drawing(placed = true): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'chart');
  if (placed) {
    document.body.appendChild(svg);
  }
  return svg;
}

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('leaveRoomForFocusRing', () => {
  it('pads a drawing inside its own size', () => {
    const svg = drawing();

    leaveRoomForFocusRing(svg);

    expect(svg.style.padding).toBe('6px');
    expect(svg.style.boxSizing).toBe('border-box');
  });

  it('keeps a padding written on the drawing', () => {
    const svg = drawing();
    svg.style.padding = '12px';

    leaveRoomForFocusRing(svg);

    expect(svg.style.padding).toBe('12px');
  });

  it('keeps a padding a stylesheet of the page gives the drawing', () => {
    document.head.innerHTML = '<style>svg.chart { padding: 0 10px; }</style>';
    const svg = drawing();

    leaveRoomForFocusRing(svg);

    expect(svg.style.padding).toBe('');
    expect(svg.style.boxSizing).toBe('');
  });

  it('pads a drawing not yet in the page, which no stylesheet reaches', () => {
    document.head.innerHTML = '<style>svg.chart { padding: 10px; }</style>';
    const svg = drawing(false);

    leaveRoomForFocusRing(svg);

    expect(svg.style.padding).toBe('6px');
  });
});
