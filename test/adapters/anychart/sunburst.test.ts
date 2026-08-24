/**
 * `anychart.sunburst()` drew and the adapter read nothing (#1170).
 *
 * All three of AnyChart's hierarchy charts -- treemap, sunburst and circle
 * packing -- take the same tree and expose it the same way, on `chart.data()`.
 * What separates them is what they draw it with, and only one of the three
 * draws something a reader can be pointed at node by node.
 *
 * A sunburst gives one arc per node, in the hierarchy's own depth-first order.
 * Measured in Chromium against the AnyChart bundle, on a deliberately
 * unbalanced tree (`R -> A -> A1 -> A1a` beside a shallow `R -> B`) so that
 * pre-order and breadth-first disagree: the arcs came back at radii 33, 66,
 * 99, 132, 66 -- `R, A, A1, A1a, B`, the first and not the second. `sort()`
 * reorders the rings around the circle and leaves the drawing order alone.
 *
 * A circle packing orders its circles by magnitude instead and labels only its
 * root, and a treemap draws an aggregate -- `maxDepth` defaults to 1, so an
 * interior node stands in for its whole subtree. Both are left unread rather
 * than half-read, which the last case here holds to.
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

/** A node as an author writes one into `anychart.data.tree`. */
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

function createHierarchyChart(
  roots: NodeSpec[],
  extra: { container?: HTMLElement; chartType?: string; dataView?: boolean } = {},
): AnyChartInstance {
  const items = roots.map(createTreeItem);
  const tree = {
    numChildren: () => items.length,
    getChildAt: (index: number) => items[index] ?? null,
  };
  return {
    title: () => 'Head count',
    container: () => extra.container ?? '',
    getType: () => extra.chartType ?? 'sunburst',
    data: () => (extra.dataView ? { getIterator: () => undefined } : tree),
    // A sunburst has NO series API; a mock that offered one would let a broken
    // route look like a working one.
  } as unknown as AnyChartInstance;
}

function nodesOf(chart: AnyChartInstance): TreemapPoint[] {
  const maidr = anyChartToMaidr(chart);
  return maidr!.subplots[0][0].layers[0].data as TreemapPoint[];
}

/**
 * A rendered chart: one AnyChart layer per entry, each holding that many
 * filled paths. A real sunburst holds two -- the backdrop, then the arcs.
 */
function createRendered(
  id: string,
  layers: number[],
): { container: HTMLElement; paths: SVGElement[][] } {
  const container = document.createElement('div');
  container.id = id;
  const svg = document.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);
  document.body.appendChild(container);

  const paths = layers.map((count, layerIndex) => {
    const layer = document.createElementNS(SVG_NS, 'g');
    layer.id = `ac_layer_${layerIndex}`;
    svg.appendChild(layer);
    return Array.from({ length: count }, (_, i) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.id = `ac_path_${layerIndex}_${i}`;
      path.setAttribute('d', 'M 0 0 A 44 44 0 0 1 10 10 Z');
      path.setAttribute('fill', '#64b5f6');
      layer.appendChild(path);
      return path as unknown as SVGElement;
    });
  });

  return { container, paths };
}

function cleanUp(container: HTMLElement): void {
  (container.closest('[data-maidr-anychart-host]') ?? container).remove();
}

/** The company tree the cases below share. */
const COMPANY: NodeSpec[] = [{
  name: 'Company',
  children: [
    { name: 'Sales', value: 30 },
    {
      name: 'Engineering',
      children: [
        { name: 'Frontend', value: 20 },
        { name: 'Backend', value: 25 },
      ],
    },
  ],
}];

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('anyChartToMaidr (sunburst)', () => {
  it('reads the hierarchy the rings draw, rather than nothing at all', () => {
    const chart = createHierarchyChart(COMPANY);

    const maidr = anyChartToMaidr(chart);

    expect(maidr!.subplots[0][0].layers.map(layer => layer.type))
      .toEqual([TraceType.SUNBURST]);
  });

  it('names every node and gives each its ancestors', () => {
    const nodes = nodesOf(createHierarchyChart(COMPANY));

    expect(nodes).toEqual([
      { x: 'Company', path: [] },
      { x: 'Sales', y: 30, path: ['Company'] },
      { x: 'Engineering', path: ['Company'] },
      { x: 'Frontend', y: 20, path: ['Company', 'Engineering'] },
      { x: 'Backend', y: 25, path: ['Company', 'Engineering'] },
    ]);
  });

  it('leaves an interior node without a magnitude it never declared', () => {
    // AnyChart derives an interior total for the layout, and reading the field
    // through the adapter's numeric coercion turned that absence into a `0`.
    // A node announced as 0 states a magnitude the chart does not.
    const nodes = nodesOf(createHierarchyChart(COMPANY));

    expect(nodes.filter(node => 'y' in node).map(node => node.x))
      .toEqual(['Sales', 'Frontend', 'Backend']);
  });

  it('keeps a leaf whose magnitude really is zero', () => {
    // The other side of the same coin: a department with nobody in it is a
    // fact about the chart, and dropping it would announce the node as an
    // interior one with a total.
    const nodes = nodesOf(createHierarchyChart([{
      name: 'Company',
      children: [{ name: 'Sales', value: 0 }],
    }]));

    expect(nodes[1]).toEqual({ x: 'Sales', y: 0, path: ['Company'] });
  });

  it('treats a blank value cell as no value, not as a zero', () => {
    // AnyChart's table mappings hand an empty cell through as `''`, and the
    // adapter's numeric coercion turns that into a `0` as readily as it turns
    // an interior node's absent field into one. Neither is a magnitude the
    // author wrote.
    const nodes = nodesOf(createHierarchyChart([{
      name: 'Company',
      children: [{ name: 'Sales', value: '' as unknown as number }],
    }]));

    expect(nodes[1]).toEqual({ x: 'Sales', path: ['Company'] });
  });

  it('is not read when the tree it was given is empty', () => {
    // A tree with no roots is a chart whose data has not arrived. Binding it
    // would emit a hierarchy with nothing in it, which a reader can enter and
    // then navigate nowhere within.
    expect(anyChartToMaidr(createHierarchyChart([]))).toBeNull();
  });

  it('reads a deep branch before its shallow sibling, as the arcs are drawn', () => {
    // The order is AnyChart's, not a convention chosen here. Pre-order and
    // breadth-first disagree on this tree, and the arcs measured in the
    // browser came back pre-order.
    const nodes = nodesOf(createHierarchyChart([{
      name: 'R',
      children: [
        { name: 'A', children: [{ name: 'A1', children: [{ name: 'A1a', value: 13 }] }] },
        { name: 'B', value: 61 },
      ],
    }]));

    expect(nodes.map(node => node.x)).toEqual(['R', 'A', 'A1', 'A1a', 'B']);
  });

  it('reads a forest as the several roots it draws', () => {
    const nodes = nodesOf(createHierarchyChart([
      { name: 'North', value: 4 },
      { name: 'South', value: 7 },
    ]));

    expect(nodes).toEqual([
      { x: 'North', y: 4, path: [] },
      { x: 'South', y: 7, path: [] },
    ]);
  });

  it('names its dimensions, having no axis to borrow a title from', () => {
    const layer = anyChartToMaidr(createHierarchyChart(COMPANY))!
      .subplots[0][0]
      .layers[0];

    expect(layer.axes).toEqual({ x: { label: 'Node' }, y: { label: 'Value' } });
  });

  it('is not read when the chart has been given no tree', () => {
    // A chart naming itself a sunburst whose `data()` is a flat view has not
    // been given its data. Binding it would announce a hierarchy with no
    // nodes in it.
    const chart = createHierarchyChart(COMPANY, { dataView: true });

    expect(anyChartToMaidr(chart)).toBeNull();
  });
});

describe('a sunburst\'s highlight', () => {
  it('points at one arc per node, in the order the arcs are drawn', () => {
    // A hierarchy is navigated node by node. One selector for the layer would
    // outline every ring at once.
    const { container, paths } = createRendered('sb-1', [1, 5]);
    const chart = createHierarchyChart(COMPANY, { container });

    bindAnyChart(chart, { id: 'sb-1' });

    expect(paths[1].map(path => path.getAttribute('data-maidr-anychart-sunburst-node')))
      .toEqual(['0', '1', '2', '3', '4']);
    // The backdrop sits in a layer of its own and is left alone.
    expect(paths[0][0].hasAttribute('data-maidr-anychart-sunburst-node')).toBe(false);
    cleanUp(container);
  });

  it('resolves each selector to exactly the arc it names', () => {
    const { container } = createRendered('sb-2', [1, 5]);
    const chart = createHierarchyChart(COMPANY, { container });

    const maidr = anyChartToMaidr(chart, { id: 'sb-2' });
    bindAnyChart(chart, { id: 'sb-2' });

    const selectors = maidr!.subplots[0][0].layers[0].selectors as string[];
    expect(selectors).toHaveLength(5);
    expect(selectors.map(selector => document.querySelectorAll(selector).length))
      .toEqual([1, 1, 1, 1, 1]);
    cleanUp(container);
  });

  it('withdraws when two layers could both be the arcs', () => {
    // Both hold five filled shapes, so which of them is the ring is not
    // something the SVG says. Taking the first would be a coin toss the
    // reader cannot check, and it would land on the wrong half of the time.
    const { container, paths } = createRendered('sb-0', [1, 5, 5]);
    const chart = createHierarchyChart(COMPANY, { container });

    bindAnyChart(chart, { id: 'sb-0' });

    expect(paths.flat().some(
      path => path.hasAttribute('data-maidr-anychart-sunburst-node'),
    )).toBe(false);
    cleanUp(container);
  });

  it('withdraws rather than outlining shapes it cannot vouch for', () => {
    // No layer holds five filled shapes, so which five are the arcs is not
    // something the SVG says. Stamping the nearest five would put the
    // highlight on whatever happened to be there.
    const { container, paths } = createRendered('sb-3', [1, 4, 7]);
    const chart = createHierarchyChart(COMPANY, { container });

    bindAnyChart(chart, { id: 'sb-3' });

    expect(paths.flat().some(
      path => path.hasAttribute('data-maidr-anychart-sunburst-node'),
    )).toBe(false);
    cleanUp(container);
  });

  it('rebinds quietly, resolving the arcs it already stamped', () => {
    // The gantt skips bars stamped on a prior bind, and doing the same here
    // would leave the backdrop alone to be resolved against five nodes -- so a
    // rebind would report that it could not find the arcs it had just
    // stamped. Re-resolving them instead writes the same values back, which
    // `setAttribute` treats as no change at all.
    const { container, paths } = createRendered('sb-4', [1, 5]);
    const chart = createHierarchyChart(COMPANY, { container });

    bindAnyChart(chart, { id: 'sb-4' });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    bindAnyChart(chart, { id: 'sb-4' });

    expect(warn).not.toHaveBeenCalled();
    expect(paths[1].map(path => path.getAttribute('data-maidr-anychart-sunburst-node')))
      .toEqual(['0', '1', '2', '3', '4']);
    cleanUp(container);
  });
});

describe('the two hierarchy charts that are not read', () => {
  it('leaves a treemap alone, because its default view is an aggregate', () => {
    // `maxDepth` defaults to 1, so a three-level tree draws two leaves and one
    // interior node carrying its children's total. Announcing the whole
    // hierarchy over that would name nodes the chart is not showing, and
    // pointing at them would outline their parent.
    expect(anyChartToMaidr(createHierarchyChart(COMPANY, { chartType: 'tree-map' })))
      .toBeNull();
  });

  it('leaves a circle packing alone, because nothing says which circle is which', () => {
    // One circle per node, but ordered by magnitude rather than by the tree,
    // and only the root is labelled. Pairing them by position would give every
    // node but the root the wrong outline.
    expect(anyChartToMaidr(createHierarchyChart(COMPANY, { chartType: 'circle-packing' })))
      .toBeNull();
  });
});
