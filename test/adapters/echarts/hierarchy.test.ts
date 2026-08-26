/**
 * @jest-environment jsdom
 */

/**
 * The ECharts series that carry a hierarchy or a graph (#1195, tier 3).
 *
 * Five series types, two payload shapes and one recurring trap: what ECharts
 * paints is not always what it holds. A treemap paints only its leaves, a
 * tree paints white symbols the adapter's paint filter calls furniture, and a
 * sunburst paints one mark per node in the tree's own order -- which is *not*
 * the data's order, because a sunburst reorders its children.
 *
 * Each of those was measured by giving every node an explicit
 * `itemStyle.color` and reading the fills in document order. Reading the
 * default palette instead had suggested the opposite for the sunburst, which
 * is why the selector assertions here navigate a real `SunburstTrace` rather
 * than checking that a string resolves.
 */

import type { EChartsInstance, EChartsList, EChartsSeriesModel } from '@adapters/echarts/types';
import type { FlowPoint, MaidrLayer, NetworkPoint, TreemapPoint } from '@type/grammar';
import { createMaidrFromEChart } from '@adapters/echarts/converters';
import { afterEach, describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A node as an author writes one. */
interface Node {
  name: string;
  value?: number;
  children?: Node[];
}

interface FakeSeries {
  type: string;
  name?: string;
  /** The forest, for a hierarchy series. */
  nodes?: Node[];
  /** The links, for a graph series. */
  links?: { source: string; target: string; value?: number }[];
  /** The node names, for a graph series, in declaration order. */
  names?: string[];
}

/**
 * The tree ECharts builds, synthetic root and all.
 *
 * `getValue()` rolls a node's children up when the author declared nothing,
 * which is the behaviour the reading has to tell apart from a declared value.
 */
function fakeTree(nodes: Node[]): { root: TreeNode } {
  const build = (node: Node): TreeNode => {
    const children = (node.children ?? []).map(build);
    return {
      name: node.name,
      ...(children.length > 0 ? { children } : {}),
      getValue: () => {
        if (node.value !== undefined) {
          return node.value;
        }
        // Measured: a `tree` reports `null` for every node, root included --
        // it has no magnitudes to roll up. So a subtree where nothing was
        // declared answers `null` here too, rather than summing to zero and
        // inventing a magnitude the chart never had.
        const below = children.map(child => child.getValue());
        const numbers = below.filter(each => typeof each === 'number');
        return numbers.length === 0
          ? null
          : numbers.reduce((sum, each) => sum + each, 0);
      },
    };
  };

  const roots = nodes.map(build);
  return {
    root: {
      name: '',
      children: roots,
      getValue: () => {
        const below = roots.map(child => child.getValue());
        const numbers = below.filter(each => typeof each === 'number');
        return numbers.length === 0
          ? null
          : numbers.reduce((sum, each) => sum + each, 0);
      },
    },
  };
}

interface TreeNode {
  name: string;
  children?: TreeNode[];
  getValue: () => number | null | undefined;
}

function fakeList(series: FakeSeries): EChartsList {
  const names = series.names ?? [];
  const list: EChartsList = {
    dimensions: ['value'],
    count: () => names.length,
    getName: index => names[index] ?? '',
    get: () => null,
  };

  if (series.nodes) {
    return { ...list, tree: fakeTree(series.nodes) };
  }

  const links = series.links ?? [];
  const at = (name: string): number => names.indexOf(name);
  return {
    ...list,
    graph: {
      nodes: names.map((_, dataIndex) => ({ dataIndex })),
      edges: links.map(link => ({
        node1: { dataIndex: at(link.source) },
        node2: { dataIndex: at(link.target) },
        getValue: () => link.value ?? null,
      })),
    },
  };
}

function fakeInstance(series: FakeSeries[]): EChartsInstance {
  return {
    getModel: () => ({
      eachSeries: (callback) => {
        series.forEach((one, index) => callback({
          subType: one.type,
          name: one.name ?? `series ${index}`,
          getData: () => fakeList(one),
          get: key => (key === 'name' ? one.name : undefined),
        } as EChartsSeriesModel, index));
      },
      eachComponent: () => {},
    }),
  };
}

/** The document ECharts drew: one filled mark per node it painted. */
function drawnChart(marks: number): HTMLElement {
  document.body.innerHTML = '<div id="chart"></div>';
  const container = document.getElementById('chart') as HTMLElement;
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (let index = 0; index < marks; index++) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('id', `mark-${index}`);
    path.setAttribute('fill', 'rgb(80,112,221)');
    svg.appendChild(path);
  }
  container.appendChild(svg);
  return container;
}

function layersOf(series: FakeSeries[], container: HTMLElement): MaidrLayer[] {
  return createMaidrFromEChart(fakeInstance(series), container).subplots[0][0].layers;
}

/**
 * A forest with both value cases in it.
 *
 * `A` declares nothing and its children sum to 3; `B` declares 5 while its
 * one child carries 2. Measured against a real chart, ECharts reports 3 and 5
 * respectively -- the rolled-up sum and the declared value -- and writes both
 * back into the raw data, so only the comparison with the children tells them
 * apart.
 */
const FOREST: Node[] = [
  { name: 'A', children: [{ name: 'A1', value: 1 }, { name: 'A2', value: 2 }] },
  { name: 'B', value: 5, children: [{ name: 'B1', value: 2 }] },
];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('an eCharts hierarchy', () => {
  it('drops the synthetic root ECharts adds above the forest', () => {
    // Its name is the empty string and its value is the sum of everything
    // below, neither of which the author wrote. A reader meeting it would be
    // told about a node that is not in their data.
    const [layer] = layersOf([{ type: 'treemap', nodes: FOREST }], drawnChart(3));

    const points = layer.data as TreemapPoint[];
    expect(points.map(point => point.x)).toEqual(['A', 'A1', 'A2', 'B', 'B1']);
    expect(points.some(point => point.x === '')).toBe(false);
  });

  it('names each node by its ancestors, itself excluded', () => {
    const [layer] = layersOf([{ type: 'treemap', nodes: FOREST }], drawnChart(3));

    const points = layer.data as TreemapPoint[];
    expect(points[0]).toEqual({ x: 'A' });
    expect(points[1]).toEqual({ x: 'A1', y: 1, path: ['A'] });
    expect(points[4]).toEqual({ x: 'B1', y: 2, path: ['B'] });
  });

  it('omits a rolled-up value and keeps a declared one', () => {
    // The distinction `TreemapPoint.y` asks for. `A` carries the sum of its
    // children, which is not a magnitude of its own; `B` carries 5 where its
    // children account for 2, and that difference is the author's.
    const [layer] = layersOf([{ type: 'treemap', nodes: FOREST }], drawnChart(3));

    const points = layer.data as TreemapPoint[];
    expect(points[0].y).toBeUndefined();
    expect(points[3].y).toBe(5);
  });

  it('reads a hierarchy with no magnitudes at all', () => {
    // A `tree` carries `value: null` on every node -- measured -- which is
    // the shape #1153 made room for. Emitting `y: 0` would be a magnitude
    // the chart never had.
    const [layer] = layersOf(
      [{ type: 'tree', nodes: [{ name: 'root', children: [{ name: 'c1' }] }] }],
      drawnChart(2),
    );

    expect(layer.type).toBe(TraceType.TREE);
    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'root' },
      { x: 'c1', path: ['root'] },
    ]);
  });

  it('reads each of the three as its own trace type', () => {
    const shapes: [string, TraceType][] = [
      ['treemap', TraceType.TREEMAP],
      ['sunburst', TraceType.SUNBURST],
      ['tree', TraceType.TREE],
    ];

    for (const [subType, type] of shapes) {
      const [layer] = layersOf([{ type: subType, nodes: FOREST }], drawnChart(5));
      expect(layer.type).toBe(type);
    }
  });
});

describe('which hierarchies can be outlined', () => {
  it('outlines a sunburst, whose marks follow the walk', () => {
    // Measured by colour-tagging every node: a sunburst paints one mark per
    // node, in exactly the order the tree walk produces them. The reading
    // walks the tree rather than the data for that reason.
    const [layer] = layersOf([{ type: 'sunburst', nodes: FOREST }], drawnChart(5));

    const selectors = layer.selectors as string[];
    expect(selectors).toHaveLength(5);
    // The stamp the adapter puts on each mark, in the order it stamped them.
    selectors.forEach((selector, index) => {
      expect(selector).toContain(`data-maidr-echart-mark="${index}"`);
    });

    // And each one reaches the mark it names -- the half a string comparison
    // does not check.
    const resolved = selectors.map(selector => document.querySelector(selector));
    expect(resolved.map(element => element?.id)).toEqual([
      'mark-0',
      'mark-1',
      'mark-2',
      'mark-3',
      'mark-4',
    ]);
  });

  it('leaves a treemap unoutlined, because it paints only its leaves', () => {
    // Five nodes, three leaves. A count against the node total could never
    // match, so it is not attempted -- which keeps a structural mismatch
    // from being mistaken for a drawing that came out wrong.
    const [layer] = layersOf([{ type: 'treemap', nodes: FOREST }], drawnChart(5));

    expect(layer.selectors).toBeUndefined();
    expect((layer.data as TreemapPoint[]).length).toBe(5);
  });

  it('leaves a tree unoutlined, because its symbols are white', () => {
    // Measured: a tree's node symbols stay `#fff` whatever `itemStyle` says,
    // and the adapter counts white as furniture, so there is nothing to name.
    const [layer] = layersOf(
      [{ type: 'tree', nodes: [{ name: 'root', children: [{ name: 'c1' }] }] }],
      drawnChart(2),
    );

    expect(layer.selectors).toBeUndefined();
  });
});

describe('an eCharts graph', () => {
  const LINKS = [
    { source: 'a', target: 'b', value: 2 },
    { source: 'b', target: 'c', value: 3 },
  ];

  it('reads a sankey as the flows it draws', () => {
    const [layer] = layersOf(
      [{ type: 'sankey', names: ['a', 'b', 'c'], links: LINKS }],
      drawnChart(3),
    );

    expect(layer.type).toBe(TraceType.SANKEY);
    expect(layer.data as FlowPoint[]).toEqual([
      { source: 'a', target: 'b', value: 2 },
      { source: 'b', target: 'c', value: 3 },
    ]);
  });

  it('reads a graph as undirected links with no magnitude', () => {
    // `NetworkPoint` names two ends and nothing else. A graph's links carry
    // `value: null` -- measured -- and there is deliberately no position
    // field, because where a solver put a node is not a fact about the data.
    const [layer] = layersOf(
      [{ type: 'graph', names: ['n1', 'n2'], links: [{ source: 'n1', target: 'n2' }] }],
      drawnChart(2),
    );

    expect(layer.type).toBe(TraceType.NETWORK);
    expect(layer.data as NetworkPoint[]).toEqual([{ source: 'n1', target: 'n2' }]);
  });

  it('drops a flow with no magnitude, because that is a sankey s whole subject', () => {
    const [layer] = layersOf(
      [{
        type: 'sankey',
        names: ['a', 'b', 'c'],
        links: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c', value: 3 }],
      }],
      drawnChart(3),
    );

    expect(layer.data as FlowPoint[]).toEqual([
      { source: 'b', target: 'c', value: 3 },
    ]);
  });

  it('drops a link whose ends cannot both be named', () => {
    // Half a flow is not a reading. `getName` answers the empty string for a
    // node the series does not have.
    const [layer] = layersOf(
      [{
        type: 'sankey',
        names: ['a', 'b'],
        links: [{ source: 'a', target: 'missing', value: 1 }, { source: 'a', target: 'b', value: 4 }],
      }],
      drawnChart(2),
    );

    expect(layer.data as FlowPoint[]).toEqual([
      { source: 'a', target: 'b', value: 4 },
    ]);
  });

  it('is declined when no link survives', () => {
    expect(layersOf(
      [{ type: 'sankey', names: ['a'], links: [] }],
      drawnChart(1),
    )).toHaveLength(0);
  });

  it('carries the name the author gave the series', () => {
    const [layer] = layersOf(
      [{ type: 'sankey', name: 'Energy', names: ['a', 'b'], links: [{ source: 'a', target: 'b', value: 1 }] }],
      drawnChart(2),
    );

    expect(layer.name).toBe('Energy');
  });
});
