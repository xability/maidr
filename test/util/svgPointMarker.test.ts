/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { Svg } from '@util/svg';

/**
 * The marker MAIDR places on a line or a band at the point being read is
 * sized from the line's stroke. A band drawn by its fill alone still has a
 * stroke width, `1px`, and so does a thin line, and their markers were dots
 * four pixels across: half the size of one on an ordinary 2px line, and hard
 * to find on a D3 or Victory area, a Recharts parallel coordinates chart or
 * an MUI radar.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Draws a path with the given style and places one marker on it.
 * @param style - The path's style
 * @returns The marker's radius
 */
function markerRadiusOn(style: string): number {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('style', style);
  document.querySelector('g')?.appendChild(path);

  const [marker] = Svg.createCircleElements([{ cx: 10, cy: 20 }], path);

  return Number(marker.getAttribute('r'));
}

describe('a point marker', () => {
  beforeEach(() => {
    document.body.innerHTML = `<svg xmlns="${SVG_NS}"><g></g></svg>`;
  });

  it('should be as large on a band drawn by its fill alone as on an ordinary line', () => {
    expect(markerRadiusOn('fill: #1f77b4; stroke: none; stroke-width: 1px')).toBe(4);
  });

  it('should be as large on a thin line as on an ordinary line', () => {
    expect(markerRadiusOn('fill: none; stroke: #8884d8; stroke-width: 1px')).toBe(4);
  });

  it('should keep its size on an ordinary line', () => {
    expect(markerRadiusOn('fill: none; stroke: #8884d8; stroke-width: 2px')).toBe(4);
  });

  it('should grow with a thicker line', () => {
    expect(markerRadiusOn('fill: none; stroke: #8884d8; stroke-width: 3px')).toBe(6);
  });
});
