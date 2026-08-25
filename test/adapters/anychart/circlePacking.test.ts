/**
 * `anychart.circlePacking()` drew and the adapter read nothing (#1170).
 *
 * It was left alone when the sunburst was read, for a reason that turned out
 * to be only half true: the packing does not draw its circles in the tree's
 * order, so pairing them by position looked like a coin toss. Measured, the
 * order is not arbitrary at all -- it is depth first with each parent's
 * children largest first, and the sizes say so out loud.
 *
 * A packing sizes a circle by the square root of its magnitude, so within one
 * parent's children `r / sqrt(total)` is a single constant. Measured across
 * four tree shapes -- a deep chain beside a shallow sibling, an ascending
 * declared order, two multi-child subtrees, and a pair of tied siblings --
 * the circles came back in that order every time and the ratio held to four
 * significant figures.
 *
 * So the pairing is not assumed, it is *checked*: the order gives a candidate
 * and the radii confirm it. If AnyChart's packing ever ordered its siblings
 * differently the check would fail and the chart would lose its highlight
 * rather than quietly outline the wrong circle.
 *
 * The one case the drawing genuinely cannot settle is two siblings of equal
 * size. They are drawn as two circles of the same radius and a packing labels
 * only its root, so nothing says which is which; that chart is left unread.
 */

import type { AnyChartInstance, AnyChartTreeItem } from '@adapters/anychart/types';
import type { TreemapPoint } from '@type/grammar';
import { anyChartToMaidr, bindAnyChart } from '@adapters/anychart/converters';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  document: dom.window.document,
  window: dom.window,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  Node: dom.window.Node,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
});

const SVG_NS = 'http://www.w3.org/2000/svg';

interface NodeSpec {
  name: string;
  value?: number;
  children?: NodeSpec[];
}

function createTreeItem(spec: NodeSpec): AnyChartTreeItem {
  const children = (spec.children ?? []).map(createTreeItem);
  return {
    get: (field: string) => (spec as unknown as Record<string, unknown>)[field],
    numChildren: () => children.length,
    getChildAt: (index: number) => children[index] ?? null,
  };
}

/**
 * A circle packing as the adapter meets one: a tree on `data()`, no series
 * API, a `labelsMode()` of its own, and NO chart type name -- `getType()`
 * answers `undefined` on a real packing, which is why the detection cannot
 * ask for a name the way every other one does.
 */
function createPackingChart(
  roots: NodeSpec[],
  extra: {
    container?: HTMLElement;
    /** Give the chart a type name, as a treemap and a sunburst have. */
    chartType?: string;
    /** Take away the one method that identifies a packing. */
    noLabelsMode?: boolean;
    /**
     * Hand back a flat data view instead of a tree, and a series API with it
     * — the shape of an ordinary chart that happens to carry `labelsMode`.
     */
    dataView?: boolean;
  } = {},
): AnyChartInstance {
  const items = roots.map(createTreeItem);
  const tree = {
    numChildren: () => items.length,
    getChildAt: (index: number) => items[index] ?? null,
  };
  const rows: Array<[string, number]> = [['A', 3], ['B', 8]];
  const view = {
    getIterator: () => {
      let i = -1;
      return {
        reset: () => {
          i = -1;
        },
        advance: () => {
          i += 1;
          return i < rows.length;
        },
        getIndex: () => i,
        get: (field: string) => (field === 'x' ? rows[i][0] : rows[i][1]),
      };
    },
  };
  const chart: Record<string, unknown> = {
    title: () => 'Head count',
    container: () => extra.container ?? '',
    getType: () => extra.chartType,
    data: () => (extra.dataView ? view : tree),
  };
  if (extra.dataView) {
    chart.getSeriesCount = () => 1;
    chart.getSeriesAt = () => ({
      seriesType: () => 'column',
      data: () => view,
      name: () => 'Series 1',
    });
  }
  if (!extra.noLabelsMode)
    chart.labelsMode = () => 'outside';
  return chart as unknown as AnyChartInstance;
}

function nodesOf(chart: AnyChartInstance): TreemapPoint[] {
  const maidr = anyChartToMaidr(chart);
  return maidr!.subplots[0][0].layers[0].data as TreemapPoint[];
}

/**
 * A rendered packing: one `<circle>` per entry, at the given radius, inside a
 * single AnyChart layer. The backdrop is a `<path>`, as on a real chart, so it
 * is never a candidate.
 *
 * @param id    - The container id
 * @param radii - One radius per circle, in the order they are drawn
 * @returns The container and the circles
 */
function createRendered(
  id: string,
  radii: number[],
): { container: HTMLElement; circles: SVGElement[] } {
  const container = document.createElement('div');
  container.id = id;
  const svg = document.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);
  document.body.appendChild(container);

  const backdrop = document.createElementNS(SVG_NS, 'path');
  backdrop.id = 'ac_path_0_0';
  backdrop.setAttribute('fill', '#ffffff');
  svg.appendChild(backdrop);

  const layer = document.createElementNS(SVG_NS, 'g');
  layer.id = 'ac_layer_1';
  svg.appendChild(layer);
  const circles = radii.map((r, i) => {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.id = `ac_circle_1_${i}`;
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', '#64b5f6');
    layer.appendChild(circle);
    return circle as unknown as SVGElement;
  });

  return { container, circles };
}

function cleanUp(container: HTMLElement): void {
  (container.closest('[data-maidr-anychart-host]') ?? container).remove();
}

/** Two multi-child subtrees, captured from the browser measurement. */
const WIDE: NodeSpec[] = [{
  name: 'R',
  children: [
    { name: 'X', children: [{ name: 'X1', value: 9 }, { name: 'X2', value: 23 }] },
    { name: 'Y', children: [
      { name: 'Y1', value: 7 },
      { name: 'Y2', value: 41 },
      { name: 'Y3', value: 2 },
    ] },
  ],
}];

/**
 * The radii the browser drew `WIDE` at, in draw order, to four decimals:
 * `R, Y, Y2, Y1, Y3, X, X2, X1`.
 */
const WIDE_RADII = [147.5, 70.4766, 41.3088, 17.0687, 9.1236, 56.3813, 29.3892, 18.3842];

const ATTR = 'data-maidr-anychart-pack-node';

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('anyChartToMaidr (circle packing)', () => {
  it('reads the hierarchy the circles draw, rather than nothing at all', () => {
    const maidr = anyChartToMaidr(createPackingChart(WIDE));

    expect(maidr!.subplots[0][0].layers.map(layer => layer.type))
      .toEqual([TraceType.PACK]);
  });

  it('is a pack rather than a treemap, being drawn as nested circles', () => {
    // The same hierarchy, and the trace type is what the reader is told is on
    // the page (#1153).
    const [layer] = anyChartToMaidr(createPackingChart(WIDE))!.subplots[0][0].layers;

    expect(layer.type).toBe(TraceType.PACK);
  });

  it('orders each parent\'s children largest first, as the packing draws them', () => {
    // NOT the declared order: `X` is declared before `Y` and drawn after it,
    // because `Y` totals 50 against `X`'s 32. Reading the tree's own order
    // would announce every node against its neighbour's circle.
    const nodes = nodesOf(createPackingChart(WIDE));

    expect(nodes.map(node => node.x))
      .toEqual(['R', 'Y', 'Y2', 'Y1', 'Y3', 'X', 'X2', 'X1']);
  });

  it('gives every node its ancestors and its own magnitude only', () => {
    const nodes = nodesOf(createPackingChart(WIDE));

    expect(nodes).toEqual([
      { x: 'R', path: [] },
      { x: 'Y', path: ['R'] },
      { x: 'Y2', y: 41, path: ['R', 'Y'] },
      { x: 'Y1', y: 7, path: ['R', 'Y'] },
      { x: 'Y3', y: 2, path: ['R', 'Y'] },
      { x: 'X', path: ['R'] },
      { x: 'X2', y: 23, path: ['R', 'X'] },
      { x: 'X1', y: 9, path: ['R', 'X'] },
    ]);
  });

  it('sizes an interior node by its subtree, without announcing that total', () => {
    // `Y` is drawn at the size of 50 and states no value of its own. The
    // derived figure orders it and checks its circle; it is never emitted,
    // because the chart does not say it.
    const nodes = nodesOf(createPackingChart([{
      name: 'R',
      children: [
        { name: 'Small', value: 3 },
        { name: 'Big', children: [{ name: 'Leaf', value: 90 }] },
      ],
    }]));

    expect(nodes.map(node => node.x)).toEqual(['R', 'Big', 'Leaf', 'Small']);
    expect(nodes[1]).toEqual({ x: 'Big', path: ['R'] });
  });

  it('drops a subtree the packing draws no circle for', () => {
    // Measured: `[R, A=30, E, E1]` -- where `E` and `E1` declare no value
    // anywhere -- came back as TWO circles, the root and `A`. Keeping the
    // empty branch would announce a part of the chart the reader is not being
    // shown, and would leave the nodes and the circles out of step.
    const nodes = nodesOf(createPackingChart([{
      name: 'R',
      children: [
        { name: 'A', value: 30 },
        { name: 'E', children: [{ name: 'E1' }] },
      ],
    }]));

    expect(nodes.map(node => node.x)).toEqual(['R', 'A']);
  });

  it('names its dimensions, having no axis to borrow a title from', () => {
    const [layer] = anyChartToMaidr(createPackingChart(WIDE))!.subplots[0][0].layers;

    expect(layer.axes).toEqual({ x: { label: 'Node' }, y: { label: 'Value' } });
  });
});

describe('a circle packing the drawing cannot settle', () => {
  it('is not read when two of a parent\'s children are the same size', () => {
    // Measured: `A` and `B` at 20 apiece came back as two circles of radius
    // 64.3292, one left and one right, and a packing labels only its root.
    // Announcing `A` over `B`'s circle is worse than announcing nothing.
    expect(anyChartToMaidr(createPackingChart([{
      name: 'R',
      children: [{ name: 'A', value: 20 }, { name: 'B', value: 20 }],
    }]))).toBeNull();
  });

  it('is not read when a tie is buried deeper in the tree', () => {
    // The tie need not be at the top: two grandchildren of equal size are as
    // indistinguishable as two children.
    expect(anyChartToMaidr(createPackingChart([{
      name: 'R',
      children: [
        { name: 'Top', value: 99 },
        { name: 'Pair', children: [{ name: 'L', value: 4 }, { name: 'M', value: 4 }] },
      ],
    }]))).toBeNull();
  });
});

describe('what is not a circle packing', () => {
  it('leaves a chart that names a type alone', () => {
    // `getType()` answers `undefined` on a real packing. A chart that DOES
    // name one has already been claimed by the branch for that name -- and an
    // undrawn treemap, whose name is unavailable, must not fall in here.
    expect(anyChartToMaidr(createPackingChart(WIDE, { chartType: 'tree-map' })))
      .toBeNull();
  });

  it('leaves a chart without the one method that identifies one alone', () => {
    expect(anyChartToMaidr(createPackingChart(WIDE, { noLabelsMode: true })))
      .toBeNull();
  });

  it('leaves a chart with a data view to be read as the chart it is', () => {
    // The structural half of the detection. A chart carrying `labelsMode`
    // and no type name but a data view and a series is an ordinary chart:
    // claiming it here would take its own reading away, and its stampers
    // with it.
    const layers = anyChartToMaidr(createPackingChart(WIDE, { dataView: true }))
      ?.subplots[0][0]
      .layers ?? [];

    expect(layers.map(layer => layer.type)).toEqual([TraceType.BAR]);
  });
});

describe('a circle packing\'s highlight', () => {
  it('points at one circle per node, in the order they are drawn', () => {
    const { container, circles } = createRendered('cp-1', WIDE_RADII);
    const chart = createPackingChart(WIDE, { container });

    bindAnyChart(chart, { id: 'cp-1' });

    expect(circles.map(circle => circle.getAttribute(ATTR)))
      .toEqual(['0', '1', '2', '3', '4', '5', '6', '7']);
    cleanUp(container);
  });

  it('resolves each selector to exactly the circle it names', () => {
    const { container } = createRendered('cp-2', WIDE_RADII);
    const chart = createPackingChart(WIDE, { container });

    const maidr = anyChartToMaidr(chart, { id: 'cp-2' });
    bindAnyChart(chart, { id: 'cp-2' });

    const selectors = maidr!.subplots[0][0].layers[0].selectors as string[];
    expect(selectors).toHaveLength(8);
    expect(selectors.map(selector => document.querySelectorAll(selector).length))
      .toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    cleanUp(container);
  });

  it('withdraws when a circle is not the size its node says', () => {
    // The check that makes the pairing a claim rather than a guess. Two of
    // `Y`'s children swapped: the order is still plausible and the count still
    // matches, but `r / sqrt(total)` no longer agrees across the group.
    const swapped = [...WIDE_RADII];
    [swapped[3], swapped[4]] = [swapped[4], swapped[3]];
    const { container, circles } = createRendered('cp-3', swapped);
    const chart = createPackingChart(WIDE, { container });

    bindAnyChart(chart, { id: 'cp-3' });

    expect(circles.some(circle => circle.hasAttribute(ATTR))).toBe(false);
    cleanUp(container);
  });

  it('names the mismatch when the chart drew a different number of circles', () => {
    // Counted before the radii are compared, and the count is what the
    // message is worth. Every stamper runs inside a `try`, so leaving this to
    // the radius check -- which reads one circle per node and would run off
    // the end of a short list -- withdraws the highlight either way. What
    // changes is what the caller is told: two figures they can act on, or a
    // caught `TypeError`.
    const { container, circles } = createRendered('cp-4', WIDE_RADII.slice(0, 6));
    const chart = createPackingChart(WIDE, { container });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    bindAnyChart(chart, { id: 'cp-4' });

    expect(circles.some(circle => circle.hasAttribute(ATTR))).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('8 nodes to the 6 circles'),
    );
    cleanUp(container);
  });

  it('rebinds quietly, resolving the circles it already stamped', () => {
    const { container, circles } = createRendered('cp-5', WIDE_RADII);
    const chart = createPackingChart(WIDE, { container });

    bindAnyChart(chart, { id: 'cp-5' });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    bindAnyChart(chart, { id: 'cp-5' });

    expect(warn).not.toHaveBeenCalled();
    expect(circles.map(circle => circle.getAttribute(ATTR)))
      .toEqual(['0', '1', '2', '3', '4', '5', '6', '7']);
    cleanUp(container);
  });
});
