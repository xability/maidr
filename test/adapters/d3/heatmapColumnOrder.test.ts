/**
 * @jest-environment jsdom
 */

/**
 * Which column a d3 heatmap treats as its leftmost (#1013).
 *
 * #980 gave `D3HeatmapConfig` a `yOrder` so a caller could say which row is
 * the top one, for the reason #978 set out: appearance order is the order the
 * author's `.data().join()` iterated, which has no particular relationship to
 * the order their scale draws. Columns were left taking appearance order with
 * no way to say otherwise.
 *
 * There is nothing to measure here and there cannot be — a d3 binder is handed
 * an SVG and a selector, and the scale lives in the author's own closure. So
 * this covers the affordance rather than a chart: that a declared order is
 * honoured, that a useless one is declined rather than obeyed, and that the
 * two axes stay independent.
 *
 * Same silence as the row half when it is wrong: every value still travels
 * with its own label, and what suffers is the reader's model of the grid —
 * arrowing right walks left.
 */

import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { bindD3Heatmap } from '@adapters/d3/binders/heatmap';
import { afterEach, describe, expect, it } from '@jest/globals';

const SVG_NS = 'http://www.w3.org/2000/svg';

const globals = globalThis as unknown as Record<string, unknown>;
globals.SVGRectElement = globals.SVGElement;
globals.SVGPathElement = class SVGPathElementStub {};
globals.SVGImageElement = class SVGImageElementStub {};

/** The columns as a join that walked them right-to-left would append. */
const JOINED = ['c2', 'c1', 'c0'];
/** The same columns as the scale draws them, left first. */
const DRAWN = ['c0', 'c1', 'c2'];

afterEach(() => {
  document.body.innerHTML = '';
});

/**
 * A d3-joined heatmap: one `<rect>` per cell carrying its `__data__`, appended
 * in the order the join iterated.
 * @param joinOrder - The columns, in the order the join walked them
 * @returns The SVG root
 */
function buildSvg(joinOrder: string[]): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.id = 'chart';
  for (const y of ['r0', 'r1']) {
    for (const x of joinOrder) {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'cell');
      // Keyed to the column, so a mis-ordered column shows in the payload.
      const value = (y === 'r0' ? 0 : 3) + DRAWN.indexOf(x) + 1;
      (rect as unknown as { __data__: unknown }).__data__ = { xVar: x, yVar: y, val: value };
      svg.appendChild(rect);
    }
  }
  document.body.appendChild(svg);
  return svg;
}

/**
 * The layer a joined heatmap converts to.
 * @param joinOrder - The columns, in the order the join walked them
 * @param xOrder - What the caller declares the drawn order to be
 * @param yOrder - The same for the rows, when a case needs it
 * @returns The emitted layer
 */
function layerFor(
  joinOrder: string[],
  xOrder?: string[],
  yOrder?: string[],
): MaidrLayer {
  const svg = buildSvg(joinOrder);
  const { layer } = bindD3Heatmap(svg, {
    selector: 'rect.cell',
    title: 'cells',
    x: 'xVar',
    y: 'yVar',
    value: 'val',
    ...(xOrder ? { xOrder } : {}),
    ...(yOrder ? { yOrder } : {}),
  });
  return layer;
}

describe('a d3 heatmap saying which column is its leftmost', () => {
  it('takes appearance order when the caller says nothing', () => {
    // Unchanged behaviour, and the reason the option is needed: this is the
    // join's order, not the scale's, and nothing here can tell them apart.
    expect((layerFor(JOINED).data as HeatmapData).x).toEqual(['c2', 'c1', 'c0']);
  });

  it('takes the declared order over the order the join ran in', () => {
    expect((layerFor(JOINED, DRAWN).data as HeatmapData).x).toEqual(DRAWN);
  });

  it('carries every value across with its own column', () => {
    const data = layerFor(JOINED, DRAWN).data as HeatmapData;

    // `c0` holds 1 on r0 and 4 on r1 however the join ran.
    expect(data.points.map(row => row[data.x.indexOf('c0')])).toEqual([1, 4]);
    expect(data.points.map(row => row[data.x.indexOf('c2')])).toEqual([3, 6]);
  });

  it('ignores labels the cells do not carry', () => {
    // A scale's domain outlives a filter, so naming more than the chart draws
    // is ordinary and the extras are dropped.
    const data = layerFor(JOINED, ['c0', 'gone', 'c1', 'c2']).data as HeatmapData;

    expect(data.x).toEqual(DRAWN);
  });

  it('declines an order that does not name every column', () => {
    // Honouring it would lose a column the reader can see, so appearance
    // order is kept instead — the same rule the rows follow.
    const data = layerFor(JOINED, ['c0', 'c1']).data as HeatmapData;

    expect(data.x).toEqual(['c2', 'c1', 'c0']);
  });

  it('orders the two axes independently', () => {
    const data = layerFor(JOINED, DRAWN, ['r1', 'r0']).data as HeatmapData;

    expect(data.x).toEqual(DRAWN);
    expect(data.y).toEqual(['r1', 'r0']);
    expect(data.points).toEqual([[4, 5, 6], [1, 2, 3]]);
  });
});
