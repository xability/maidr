import { bindD3Box } from '@adapters/d3/binders/box';
import { describe, expect, test } from '@jest/globals';
import { Orientation } from '@type/grammar';
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. Test only uses public Element/JSDOM surface.
import { JSDOM } from 'jsdom';

interface BoxData {
  fill: string;
  min: number;
  q1: number;
  q2: number;
  q3: number;
  max: number;
}

/**
 * Build an SVG containing one or more <g class="box"> groups, each with a
 *  rect (IQR), a horizontal median line, and two vertical whisker lines
 *  (one above and one below the rect center). __data__ is bound to the group.
 */
function buildVerticalBoxSvg(data: BoxData): { svg: SVGElement; getPart: (selector: string) => Element | null } {
  const dom = new JSDOM(`<!doctype html><svg xmlns="http://www.w3.org/2000/svg" id="bx-svg"></svg>`);
  const doc = dom.window.document;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = doc.querySelector('svg') as unknown as SVGElement;

  const group = doc.createElementNS(svgNS, 'g');
  group.setAttribute('class', 'box');
  (group as unknown as { __data__: unknown }).__data__ = data;

  // Rect: IQR body. center at (50, 50), width 20, height 20 → cx=60, cy=60
  const rect = doc.createElementNS(svgNS, 'rect');
  rect.setAttribute('x', '50');
  rect.setAttribute('y', '50');
  rect.setAttribute('width', '20');
  rect.setAttribute('height', '20');
  group.appendChild(rect);

  // Median: horizontal line across IQR (|dx| > |dy| in vertical orientation)
  const median = doc.createElementNS(svgNS, 'line');
  median.setAttribute('x1', '50');
  median.setAttribute('y1', '60');
  median.setAttribute('x2', '70');
  median.setAttribute('y2', '60');
  group.appendChild(median);

  // Upper whisker: vertical line ABOVE rect center (smaller y in SVG coords)
  const upper = doc.createElementNS(svgNS, 'line');
  upper.setAttribute('x1', '60');
  upper.setAttribute('y1', '20'); // y=20 < cy=60 → upper
  upper.setAttribute('x2', '60');
  upper.setAttribute('y2', '50');
  group.appendChild(upper);

  // Lower whisker: vertical line BELOW rect center (larger y)
  const lower = doc.createElementNS(svgNS, 'line');
  lower.setAttribute('x1', '60');
  lower.setAttribute('y1', '70');
  lower.setAttribute('x2', '60');
  lower.setAttribute('y2', '100'); // y=100 > cy=60 → lower
  group.appendChild(lower);

  svg.appendChild(group);

  const getPart = (selector: string) => doc.querySelector(selector);
  return { svg, getPart };
}

describe('bindD3Box whisker classification', () => {
  test('vertical orientation: classifies whisker lines by y-midpoint relative to rect center', () => {
    const { svg, getPart } = buildVerticalBoxSvg({
      fill: 'A',
      min: 1,
      q1: 2,
      q2: 3,
      q3: 4,
      max: 5,
    });

    const result = bindD3Box(svg, {
      selector: 'g.box',
      orientation: Orientation.VERTICAL,
    });

    // The IQR rect should be stamped 'iq'
    expect(getPart('rect')?.getAttribute('data-maidr-box-part')).toBe('iq');

    // The horizontal line (|dx| > |dy|) is the median (q2)
    const lines = Array.from(svg.querySelectorAll('line'));
    const medianLine = lines.find(
      l => Math.abs(Number(l.getAttribute('x2')) - Number(l.getAttribute('x1')))
        > Math.abs(Number(l.getAttribute('y2')) - Number(l.getAttribute('y1'))),
    );
    expect(medianLine?.getAttribute('data-maidr-box-part')).toBe('q2');

    // Vertical line with smaller y midpoint = upper whisker (SVG y grows down)
    const upperLine = lines.find(l => l.getAttribute('y1') === '20');
    expect(upperLine?.getAttribute('data-maidr-box-part')).toBe('upper-whisker');

    // Vertical line with larger y midpoint = lower whisker
    const lowerLine = lines.find(l => l.getAttribute('y1') === '70');
    expect(lowerLine?.getAttribute('data-maidr-box-part')).toBe('lower-whisker');

    // Result data preserves the bound 5-number summary
    expect(result.layer.data).toEqual([
      expect.objectContaining({ z: 'A', min: 1, q1: 2, q2: 3, q3: 4, max: 5 }),
    ]);
  });

  test('emits BoxSelectors objects (one per box) instead of a bare string', () => {
    const { svg } = buildVerticalBoxSvg({
      fill: 'A',
      min: 1,
      q1: 2,
      q2: 3,
      q3: 4,
      max: 5,
    });

    const result = bindD3Box(svg, {
      selector: 'g.box',
      orientation: Orientation.VERTICAL,
    });

    // selectors is an array (BoxTrace requires one BoxSelector per box)
    expect(Array.isArray(result.layer.selectors)).toBe(true);
    const selectors = result.layer.selectors as unknown as Array<Record<string, unknown>>;
    expect(selectors).toHaveLength(1);
    // Each BoxSelector exposes the named parts the model consumes.
    expect(selectors[0]).toMatchObject({
      iq: expect.any(String),
      q2: expect.any(String),
      min: expect.any(String),
      max: expect.any(String),
      lowerOutliers: expect.any(Array),
      upperOutliers: expect.any(Array),
    });
  });
});
