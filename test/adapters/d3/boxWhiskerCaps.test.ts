/**
 * @jest-environment jsdom
 */
/**
 * A d3 box plot drawn with whisker caps.
 *
 * Every `<line>` in a box group was classified by aspect ratio alone: in a
 * vertical box anything wider than it is tall was the median. A great many
 * hand-rolled d3 box plots draw the whisker **caps** — the short crossbars at
 * min and max — as `<line>` siblings of the rect, and those are wider than
 * they are tall too, so all of them were stamped `q2` alongside the real
 * median.
 *
 * `Box.mapToSvgElements` resolves `selector.q2` with `Svg.selectElement`,
 * which takes the first match in document order, so a group appended in the
 * usual order — rect, caps, whiskers, median — made the median section
 * highlight the upper cap: the reader is told "median 3" while the outline
 * sits at the maximum. The horizontal orientation has the mirror-image
 * problem with vertical caps.
 *
 * A cap sits at the end of a whisker, outside the IQR body; the median
 * crosses it. That is what separates them.
 */
import type { BoxSelector } from '@type/grammar';
import { bindD3Box } from '@adapters/d3/binders/box';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { Orientation } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Appends a `<line>` to a group.
 * @param group - The box group to append to
 * @param coords - The line's `x1,y1,x2,y2`
 */
function line(group: Element, coords: [number, number, number, number]): void {
  const element = document.createElementNS(SVG_NS, 'line');
  element.setAttribute('x1', String(coords[0]));
  element.setAttribute('y1', String(coords[1]));
  element.setAttribute('x2', String(coords[2]));
  element.setAttribute('y2', String(coords[3]));
  group.appendChild(element);
}

/**
 * A vertical box with capped whiskers, appended rect-caps-whiskers-median.
 *
 * The IQR body spans y 50..70 across x 50..70; the whiskers run to y=20 and
 * y=100, each finished with a crossbar.
 *
 * @returns The SVG root
 */
function buildCappedVerticalBox(): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.id = 'bx';
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'box');
  (group as unknown as { __data__: unknown }).__data__ = {
    fill: 'A',
    min: 1,
    q1: 2,
    q2: 3,
    q3: 4,
    max: 5,
  };

  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', '50');
  rect.setAttribute('y', '50');
  rect.setAttribute('width', '20');
  rect.setAttribute('height', '20');
  group.appendChild(rect);

  line(group, [55, 20, 65, 20]); // cap at the maximum
  line(group, [55, 100, 65, 100]); // cap at the minimum
  line(group, [60, 20, 60, 50]); // upper whisker
  line(group, [60, 70, 60, 100]); // lower whisker
  line(group, [50, 60, 70, 60]); // median, crossing the body

  svg.appendChild(group);
  document.body.appendChild(svg);
  return svg;
}

/**
 * A horizontal box with capped whiskers, appended the same way.
 *
 * The IQR body spans x 50..70 across y 50..70; the whiskers run to x=20 and
 * x=100.
 *
 * @returns The SVG root
 */
function buildCappedHorizontalBox(): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.id = 'bx';
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'box');
  (group as unknown as { __data__: unknown }).__data__ = {
    fill: 'A',
    min: 1,
    q1: 2,
    q2: 3,
    q3: 4,
    max: 5,
  };

  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', '50');
  rect.setAttribute('y', '50');
  rect.setAttribute('width', '20');
  rect.setAttribute('height', '20');
  group.appendChild(rect);

  line(group, [20, 55, 20, 65]); // cap at the minimum
  line(group, [100, 55, 100, 65]); // cap at the maximum
  line(group, [20, 60, 50, 60]); // lower whisker
  line(group, [70, 60, 100, 60]); // upper whisker
  line(group, [60, 50, 60, 70]); // median, crossing the body

  svg.appendChild(group);
  document.body.appendChild(svg);
  return svg;
}

describe('a d3 box plot with whisker caps', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('points the vertical median selector at the line crossing the body', () => {
    const svg = buildCappedVerticalBox();

    const selectors = bindD3Box(svg, {
      selector: 'g.box',
      orientation: Orientation.VERTICAL,
    }).layer.selectors as BoxSelector[];

    const median = document.querySelectorAll(selectors[0].q2);
    expect(median).toHaveLength(1);
    expect(median[0].getAttribute('y1')).toBe('60');
  });

  it('points the horizontal median selector at the line crossing the body', () => {
    const svg = buildCappedHorizontalBox();

    const selectors = bindD3Box(svg, {
      selector: 'g.box',
      orientation: Orientation.HORIZONTAL,
    }).layer.selectors as BoxSelector[];

    const median = document.querySelectorAll(selectors[0].q2);
    expect(median).toHaveLength(1);
    expect(median[0].getAttribute('x1')).toBe('60');
  });

  it('reads a cap as part of the whisker it finishes', () => {
    const svg = buildCappedVerticalBox();

    bindD3Box(svg, { selector: 'g.box', orientation: Orientation.VERTICAL });

    const parts = Array.from(svg.querySelectorAll('line')).map(element => ({
      y1: element.getAttribute('y1'),
      part: element.getAttribute('data-maidr-box-part'),
    }));
    expect(parts).toEqual([
      { y1: '20', part: 'upper-whisker' },
      { y1: '100', part: 'lower-whisker' },
      { y1: '20', part: 'upper-whisker' },
      { y1: '70', part: 'lower-whisker' },
      { y1: '60', part: 'q2' },
    ]);
  });
});
