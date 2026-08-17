/**
 * @jest-environment jsdom
 */
/**
 * A d3 heatmap has to be told which row is the top one (#978).
 *
 * The schema orders rows top-first, and `Heatmap` turns them over so its own
 * row 0 is the bottom of the drawn grid — which is what makes ArrowUp move
 * visually up. The binder took its order from the cells' order of appearance
 * in the DOM, which is the order the author's `.data().join()` ran in and has
 * no particular relation to the order their scale draws.
 *
 * Unlike the four sibling adapters there is nothing to consult: a d3 chart's
 * scale lives in the author's own closure and is never handed to the binder.
 * So the caller says, via `yOrder`.
 *
 * Measured before the fix, driving the binder and then the real trace: a join
 * over an ascending band domain — `['first', 'second', 'third']`, which draws
 * 'first' at the bottom — entered at `'third'`, the visual **top**, and
 * ArrowUp moved to `'second'`, walking down. A top-down join entered at
 * `'first'` and climbed.
 */
import type { HeatmapData, MaidrLayer } from '@type/grammar';
import { bindD3Heatmap } from '@adapters/d3/binders/heatmap';
import { afterEach, describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';

const SVG_NS = 'http://www.w3.org/2000/svg';

// jsdom exposes no specialised SVG constructors, and the heatmap model
// branches on all three; alias rect to the real one, keep the others disjoint.
const globals = globalThis as unknown as Record<string, unknown>;
globals.SVGRectElement = globals.SVGElement;
globals.SVGPathElement = class SVGPathElementStub {};
globals.SVGImageElement = class SVGImageElementStub {};

/** The rows as an ascending band scale would be walked: 'first' at the bottom. */
const BOTTOM_UP = ['first', 'second', 'third'];
/** The same rows in the order they are drawn, top first. */
const DRAWN = ['third', 'second', 'first'];

/**
 * A d3-joined heatmap: one `<rect>` per cell carrying its `__data__`, appended
 * in the order the join iterated.
 * @param joinOrder - The rows, in the order the join walked them
 * @returns The SVG root
 */
function buildSvg(joinOrder: string[]): SVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.id = 'chart';
  for (const y of joinOrder) {
    for (const x of ['c1', 'c2']) {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('class', 'cell');
      // Values keyed to the row, so a mis-ordered row is visible in the payload.
      const value = BOTTOM_UP.indexOf(y) * 2 + (x === 'c1' ? 1 : 2);
      (rect as unknown as { __data__: unknown }).__data__ = { xVar: x, yVar: y, val: value };
      svg.appendChild(rect);
    }
  }
  document.body.appendChild(svg);
  return svg;
}

/**
 * The layer a joined heatmap converts to.
 * @param joinOrder - The rows, in the order the join walked them
 * @param yOrder - What the caller declares the drawn order to be
 * @returns The emitted layer
 */
function layerFor(joinOrder: string[], yOrder?: string[]): MaidrLayer {
  const svg = buildSvg(joinOrder);
  const { layer } = bindD3Heatmap(svg, {
    selector: 'rect.cell',
    title: 'cells',
    x: 'xVar',
    y: 'yVar',
    value: 'val',
    ...(yOrder ? { yOrder } : {}),
  });
  return layer;
}

/** Where the cursor lands, and where ArrowUp takes it. */
function walkUp(layer: MaidrLayer): { entry: unknown; afterUp: unknown } {
  const trace = TraceFactory.create(layer) as unknown as {
    state: { text?: { cross?: { value?: unknown } } };
    moveOnce: (direction: string) => boolean;
  };
  const entry = trace.state.text?.cross?.value;
  // The first move only settles the cursor, so step twice to actually travel.
  trace.moveOnce('UPWARD');
  trace.moveOnce('UPWARD');
  return { entry, afterUp: trace.state.text?.cross?.value };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a d3 heatmap joined bottom-up', () => {
  it('is read upside down when nothing says otherwise', () => {
    // The behaviour `yOrder` exists to let a caller escape. Pinned rather than
    // fixed silently: without the scale there is nothing the binder could
    // consult, so appearance order remains the only available default.
    const { entry, afterUp } = walkUp(layerFor(BOTTOM_UP));

    expect(entry).toBe('third');
    expect(afterUp).toBe('second');
  });

  it('is read the right way up once the drawn order is declared', () => {
    const { entry, afterUp } = walkUp(layerFor(BOTTOM_UP, DRAWN));

    expect(entry).toBe('first');
    expect(afterUp).toBe('second');
  });

  it('emits the rows top-first', () => {
    expect((layerFor(BOTTOM_UP, DRAWN).data as HeatmapData).y).toEqual(DRAWN);
  });

  it('carries each value onto its own row', () => {
    const { y, points } = layerFor(BOTTOM_UP, DRAWN).data as HeatmapData;

    expect(points[y.indexOf('first')]).toEqual([1, 2]);
    expect(points[y.indexOf('second')]).toEqual([3, 4]);
    expect(points[y.indexOf('third')]).toEqual([5, 6]);
  });
});

describe('the highlight follows the rows', () => {
  it('names one cell per selector instead of one selector for all', () => {
    // A single selector resolves in DOM order, which is the join order the row
    // order was just taken off — so reordering the rows alone would announce
    // one cell and outline another.
    const { selectors } = layerFor(BOTTOM_UP, DRAWN);

    expect(Array.isArray(selectors)).toBe(true);
    expect((selectors as string[][]).length).toBe(3);
    expect((selectors as string[][])[0].length).toBe(2);
  });

  it('points row 0 at the cell row 0 announces', () => {
    // Model row 0 is the bottom of the grid — 'first' — whose cells were the
    // first two joined.
    const layer = layerFor(BOTTOM_UP, DRAWN);
    const first = (layer.selectors as string[][])[0][0];
    const element = document.querySelector(first);

    expect(element).not.toBeNull();
    expect((element as unknown as { __data__: { yVar: string; val: number } }).__data__.yVar).toBe('first');
    expect((element as unknown as { __data__: { yVar: string; val: number } }).__data__.val).toBe(1);
  });

  it('drops the domMapping hint it no longer needs', () => {
    // Per-cell selectors leave nothing to flatten, so the row/column-major
    // hint would only be another thing able to disagree.
    expect(layerFor(BOTTOM_UP, DRAWN).domMapping).toBeUndefined();
  });
});

describe('an order that does not describe the grid', () => {
  it('ignores labels the cells do not carry', () => {
    // A scale's domain outliving a filter is ordinary.
    expect((layerFor(BOTTOM_UP, [...DRAWN, 'ghost']).data as HeatmapData).y).toEqual(DRAWN);
  });

  it('declines an order missing a row the chart draws', () => {
    // Honouring it would lose a row the reader can see.
    expect((layerFor(BOTTOM_UP, ['third', 'second']).data as HeatmapData).y).toEqual(BOTTOM_UP);
  });
});
