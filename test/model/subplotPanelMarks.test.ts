/**
 * @jest-environment jsdom
 */

import type { BoxPoint, BoxSelector, Maidr, MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, it } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';

/**
 * Where a chart names no panel of its own, the lobby outlines the largest
 * element holding a subplot's marks and none of another subplot's. A
 * subplot's marks were found from its first layer's selector only when that
 * was a string, so a subplot whose first layer names its marks by a box's
 * parts, or by a heat map's grid of cells, had none: it was outlined round
 * nothing, and the subplot beside it, with no marks of its to stop at, was
 * outlined round the whole figure. r-maidr draws both, in a patchwork of a
 * box plot over a bar chart and in a pheatmap with a row tree alone.
 */

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Draws a figure of two panels, each a group of its own in one layout
 * group, as r-maidr's export of a patchwork lays them out.
 * @param first - The first panel's marks
 * @returns The chart's root
 */
function drawFigure(first: string): HTMLElement {
  const chart = document.createElement('div');
  chart.innerHTML = `<svg xmlns="${SVG_NAMESPACE}"><g id="layout">`
    + `<g id="panel-1"><g>${first}</g></g>`
    + `<g id="panel-2"><g><rect class="bar"/><rect class="bar"/></g></g>`
    + `</g></svg>`;
  document.body.appendChild(chart);
  chart.querySelectorAll<SVGGraphicsElement>('path').forEach((part, index) => {
    const box = { x: 10, y: 10 + 10 * index, width: 20, height: 10 };
    Object.defineProperty(part, 'getBBox', { value: () => ({ ...box }), configurable: true });
  });
  return chart;
}

/** A box plot of one box, named by its parts. */
const BOX: { marks: string; layer: MaidrLayer } = {
  marks: '<path id="low"/><path id="box"/><path id="median"/><path id="high"/>',
  layer: {
    id: 'box',
    type: TraceType.BOX,
    title: 'Spread',
    axes: { x: { label: 'Group' }, y: { label: 'Value' } },
    selectors: [{
      lowerOutliers: [],
      min: '#low',
      iq: '#box',
      q2: '#median',
      max: '#high',
      upperOutliers: [],
    } satisfies BoxSelector],
    data: [{ z: 'a', lowerOutliers: [], min: 2, q1: 4, q2: 5, q3: 6, max: 8, upperOutliers: [] } satisfies BoxPoint],
  } as MaidrLayer,
};

/** A heat map of two by two cells, named cell by cell. */
const HEAT: { marks: string; layer: MaidrLayer } = {
  marks: '<rect id="c00"/><rect id="c01"/><rect id="c10"/><rect id="c11"/>',
  layer: {
    id: 'heat',
    type: TraceType.HEATMAP,
    title: 'Counts',
    axes: { x: { label: 'Column' }, y: { label: 'Row' } },
    selectors: [['#c00', '#c01'], ['#c10', '#c11']],
    data: { x: ['a', 'b'], y: ['r1', 'r2'], points: [[1, 2], [3, 4]] },
  } as MaidrLayer,
};

/** The bar chart in the second panel. */
const BAR: MaidrLayer = {
  id: 'bar',
  type: TraceType.BAR,
  title: 'Counts',
  axes: { x: { label: 'Group' }, y: { label: 'Count' } },
  selectors: '#panel-2 rect.bar',
  data: [{ x: 'a', y: 1 }, { x: 'b', y: 2 }],
} as MaidrLayer;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the lobby panel of a subplot whose first layer names its marks other than by one string', () => {
  it.each([
    { what: 'a box plot, named by its box\'s parts', first: BOX },
    { what: 'a heat map, named by its grid of cells', first: HEAT },
  ])('is its own, and the subplot beside it is not outlined round both: $what', ({ first }) => {
    const chart = drawFigure(first.marks);
    const figure = new Figure({
      id: 'two-panels',
      subplots: [[{ layers: [first.layer] }], [{ layers: [BAR] }]],
    } as Maidr);

    figure.applyLayout(resolveSubplotLayout(figure.subplots, [chart]));

    expect(figure.subplots[0][0].panelElement).toBe(chart.querySelector('#panel-1'));
    expect(figure.subplots[1][0].panelElement).toBe(chart.querySelector('#panel-2'));
  });
});
