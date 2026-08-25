/**
 * The Chart.js adapter refused every `chartjs-chart-graph` chart (#1178).
 *
 * `tree`, `dendrogram` and `forceDirectedGraph` are the last of the three
 * plugin families the adapter threw on. The same hierarchy drawn in amCharts,
 * Google Charts, Highcharts or Observable Plot was navigable; only a Chart.js
 * one raised.
 *
 * Measured on `chartjs-chart-graph@4`, driven headlessly through Chart.js's
 * own `BasicPlatform`, all three take the **same** flat node list:
 *
 *     data    [{}, {parent: 0}, {parent: 0}, {parent: 1}, {parent: 1}]
 *     labels  ["root", "a", "b", "a1", "a2"]
 *     meta.edges -> node indices  [[0,1], [0,2], [1,3], [1,4]]
 *
 * and `meta.edges` is filled the same way whether the author declared `edges`
 * or left the plugin to derive them from `parent`. What separates the
 * readings is what the node list is allowed to *be*:
 *
 *   - `tree` and `dendrogram` name a parent per node, so the data is a
 *     hierarchy by construction. They are one controller class with a `mode`
 *     option, and one reading: {@link TraceType.TREE}, which the grammar
 *     already defines as a hierarchy drawn as boxes joined by links, whatever
 *     the layout puts where.
 *
 *   - `forceDirectedGraph` may be given `edges` instead, and measured, the
 *     plugin accepts an edge list that closes a **cycle** -- five links over
 *     five nodes, drawn without complaint. A cycle is not a hierarchy, so
 *     reading it as a tree would announce ancestry that is not there.
 *     {@link TraceType.NETWORK} is the grammar's own word for it.
 */
import type { ChartJsChart, ChartJsDataset, ChartJsDataValue, ChartJsMetaElement } from '@adapters/chartjs/types';
import type { NetworkPoint, TreemapPoint } from '@type/grammar';
import { extractChartData } from '@adapters/chartjs/extractor';
import { computeTargetMaps, resolveActiveTargets } from '@adapters/chartjs/highlightTargets';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

type GraphType = 'tree' | 'dendrogram' | 'forceDirectedGraph';

interface GraphOptions {
  labels?: (string | number)[];
  /** Which node pairs the plugin resolved, by position. */
  edges?: [number, number][];
  label?: string;
}

/**
 * A graph chart as Chart.js leaves it after its layout has settled.
 *
 * The elements stand in for the `PointElement` per node, and `meta.edges`
 * holds the *same objects* — which is how the plugin leaves them, and what
 * makes pairing an end back to a node a matter of identity.
 *
 * @param chartType - Which controller drew it
 * @param parents - One entry per node: its parent's position, or null
 * @param options - Node names, resolved edges, and the dataset's own name
 * @returns The chart
 */
function graphChart(
  chartType: GraphType,
  parents: (number | null)[],
  options: GraphOptions = {},
): ChartJsChart {
  const { labels, edges, label } = options;
  const rows = parents.map(parent =>
    (parent === null ? {} : { parent })) as unknown as ChartJsDataValue[];
  const elements = parents.map((_, index) => ({ index })) as unknown as ChartJsMetaElement[];
  const derived: [number, number][] = parents.flatMap((parent, index) =>
    (parent === null ? [] : [[parent, index] as [number, number]]));
  // One object, not a fresh one per call: a test that reaches in to change
  // `meta.edges` has to be changing the thing the extractor will read.
  const meta = {
    data: elements,
    type: chartType,
    edges: (edges ?? derived).map(([source, target]) => ({
      source: elements[source],
      target: elements[target],
    })),
  };

  return {
    canvas: {} as HTMLCanvasElement,
    data: {
      ...(labels === undefined ? {} : { labels }),
      datasets: [{ ...(label === undefined ? {} : { label }), data: rows }] as unknown as ChartJsDataset[],
    },
    options: { plugins: {} },
    config: { type: chartType },
    getDatasetMeta: () => meta,
    setActiveElements: () => {},
  } as unknown as ChartJsChart;
}

/** The first layer of a graph chart. */
function layerOf(chart: ChartJsChart): any {
  return extractChartData(chart).maidr.subplots[0][0].layers[0];
}

/** A five-node hierarchy: a root, two children, two grandchildren. */
const FAMILY: (number | null)[] = [null, 0, 0, 1, 1];
const NAMES = ['root', 'a', 'b', 'a1', 'a2'];

describe('chart.js graph', () => {
  it.each(['tree', 'dendrogram'] as const)('reads a %s as the hierarchy it draws', (kind) => {
    // The reproduction, and the reason the two share one case: they are one
    // controller class with a `mode`, and a dendrogram *is* a tree drawn with
    // its leaves levelled. Naming them apart would name a layout.
    const layer = layerOf(graphChart(kind, FAMILY, { labels: NAMES }));

    expect(layer.type).toBe(TraceType.TREE);
    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'root' },
      { x: 'a', path: ['root'] },
      { x: 'b', path: ['root'] },
      { x: 'a1', path: ['root', 'a'] },
      { x: 'a2', path: ['root', 'a'] },
    ]);
  });

  it('carries no magnitude, because the plugin sizes nothing by one', () => {
    // `TreemapPoint.y` is optional for exactly this: a reporting line has no
    // size, and inventing one would sonify a quantity nobody drew.
    const layer = layerOf(graphChart('tree', FAMILY, { labels: NAMES }));

    expect((layer.data as TreemapPoint[]).every(node => node.y === undefined)).toBe(true);
  });

  it('names a node by its position when the chart labelled none', () => {
    // A graph node carries no name the plugin reads -- `IGraphDataPoint`
    // declares `parent` and nothing else -- so `labels` is the only source,
    // and a node with none is still a node the path has to be built from.
    const layer = layerOf(graphChart('tree', [null, 0]));

    expect(layer.data as TreemapPoint[]).toEqual([{ x: 0 }, { x: 1, path: [0] }]);
  });

  it('reads a force-directed graph as the links it draws', () => {
    const layer = layerOf(graphChart('forceDirectedGraph', FAMILY, { labels: NAMES }));

    expect(layer.type).toBe(TraceType.NETWORK);
    expect(layer.data as NetworkPoint[]).toEqual([
      { source: 'root', target: 'a' },
      { source: 'root', target: 'b' },
      { source: 'a', target: 'a1' },
      { source: 'a', target: 'a2' },
    ]);
  });

  it('reads a graph whose links close a cycle, which no tree could hold', () => {
    // The measurement that decides the type: the plugin draws this without
    // complaint, and `a1 - a2` closes a loop. Read as a hierarchy it would
    // announce an ancestry the chart does not have.
    const layer = layerOf(graphChart('forceDirectedGraph', [null, null, null, null, null], {
      labels: NAMES,
      edges: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 4]],
    }));

    expect(layer.type).toBe(TraceType.NETWORK);
    expect(layer.data as NetworkPoint[]).toEqual([
      { source: 'root', target: 'a' },
      { source: 'root', target: 'b' },
      { source: 'a', target: 'a1' },
      { source: 'b', target: 'a2' },
      { source: 'a1', target: 'a2' },
    ]);
  });

  it('names a graph by what a reader is after at a node', () => {
    // Not the chart's own x and y: a force layout's coordinates are the
    // solver's output and mean nothing to a reader. A hierarchy has one
    // dimension to name, a graph two.
    const tree = layerOf(graphChart('tree', FAMILY, { labels: NAMES }));
    const network = layerOf(graphChart('forceDirectedGraph', FAMILY, { labels: NAMES }));

    expect(tree.axes).toEqual({ x: { label: 'Node' } });
    expect(network.axes).toEqual({ x: { label: 'Node' }, y: { label: 'Links' } });
  });

  it('takes the dataset name as the layer title', () => {
    const layer = layerOf(graphChart('tree', FAMILY, { labels: NAMES, label: 'Org chart' }));

    expect(layer.title).toBe('Org chart');
  });

  it('stops a path at a node it has already walked through', () => {
    // Measured, such a chart is broken before this runs: the plugin's own
    // `getTreeRoot` throws on a node list with no root. It throws from the
    // layout, which runs on an animation frame rather than inside `update()`,
    // so extraction can still be asked afterwards -- and without the guard
    // this would not return at all.
    const layer = layerOf(graphChart('tree', [1, 0], { labels: ['x', 'y'] }));

    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 'x', path: ['y'] },
      { x: 'y', path: ['x'] },
    ]);
  });

  it.each([
    ['past the end', 9],
    ['negative', -1],
    ['fractional', 1.5],
  ])('treats a %s parent as no parent at all', (_case, parent) => {
    // An index that names no node places nothing, so the node is read as a
    // root rather than hung under an ancestor that does not exist. One rule
    // covers all three, asked where the name is looked up rather than
    // restated as a shape test on the index.
    const layer = layerOf(graphChart('tree', [null, parent], { labels: ['root', 'orphan'] }));

    expect(layer.data as TreemapPoint[]).toEqual([{ x: 'root' }, { x: 'orphan' }]);
  });

  it('does not take a string as a parent, because the plugin does not', () => {
    // The one shape test that earns its place. The walk looks a parent up as
    // `names[at]`, and JavaScript coerces a string index happily -- so `'0'`
    // would place this node under the root. Measured, `chartjs-chart-graph`
    // throws on it instead, so a string is not a parent and a chart carrying
    // one is not a chart.
    const chart = graphChart('tree', [null, null], { labels: ['root', 'child'] });
    (chart.data.datasets[0].data[1] as Record<string, unknown>).parent = '0';

    expect(layerOf(chart).data as TreemapPoint[]).toEqual([{ x: 'root' }, { x: 'child' }]);
  });

  it('treats an empty label as no label rather than as a name', () => {
    // A short `labels` array padded out, or a node the author had no name
    // for. A node announced as nothing at all cannot be told from its
    // sibling, and its children would carry the blank in their path too.
    const layer = layerOf(graphChart('tree', [null, 0], { labels: ['', 'child'] }));

    expect(layer.data as TreemapPoint[]).toEqual([
      { x: 0 },
      { x: 'child', path: [0] },
    ]);
  });

  it('drops a link this cannot place both ends of', () => {
    // Half a link names nothing navigable: `NetworkTrace` derives its nodes
    // from the links, so an end that resolves to no node would enter the
    // graph as an undefined one.
    const chart = graphChart('forceDirectedGraph', [null, null], { labels: ['a', 'b'], edges: [[0, 1]] });
    const meta = chart.getDatasetMeta(0);
    meta.edges = [
      ...(meta.edges ?? []),
      { source: meta.data[0], target: { index: 99 } as any },
    ];

    const layer = layerOf(chart);

    expect(layer.data as NetworkPoint[]).toEqual([{ source: 'a', target: 'b' }]);
  });

  it('outlines the node a hierarchy announces', () => {
    // A tree reads through `TreemapTrace`, whose position is (depth, index
    // within depth). The plugin draws one element per node in dataset order,
    // which is the order the payload emits them in, so the treemap's own
    // addressing applies unchanged.
    const chart = graphChart('tree', FAMILY, { labels: NAMES });
    const extraction = extractChartData(chart);
    const layers = extraction.maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, extraction.layerDatasetIndices);
    const at = (row: number, col: number): unknown =>
      resolveActiveTargets(layers, maps, extraction.layerDatasetIndices, layers[0].id, row, col);

    expect(at(0, 0)).toEqual([{ datasetIndex: 0, index: 0 }]);
    expect(at(1, 0)).toEqual([{ datasetIndex: 0, index: 1 }]);
    expect(at(1, 1)).toEqual([{ datasetIndex: 0, index: 2 }]);
    expect(at(2, 1)).toEqual([{ datasetIndex: 0, index: 4 }]);
  });

  it('outlines nothing on a graph rather than outlining a node for a link', () => {
    // `NetworkTrace` names its highlight as one *link* -- deliberately, so
    // that the canvas and SVG channels cannot outline different lines. The
    // elements `setActiveElements` can name are the **nodes**, so the one
    // thing the trace asks for is the one thing this cannot give, and a node
    // instead would light up a mark the reader was not told about (#814).
    const chart = graphChart('forceDirectedGraph', FAMILY, { labels: NAMES });
    const extraction = extractChartData(chart);
    const layers = extraction.maidr.subplots[0][0].layers;
    const maps = computeTargetMaps(chart, layers, extraction.layerDatasetIndices);

    const targets = [0, 1, 2].map(col =>
      resolveActiveTargets(layers, maps, extraction.layerDatasetIndices, layers[0].id, 0, col));

    expect(targets).toEqual([[], [], []]);
  });

  it('emits no layer for a dataset with no nodes', () => {
    expect(extractChartData(graphChart('tree', [])).maidr.subplots[0][0].layers).toEqual([]);
  });

  it('emits no layer for a graph that drew no links', () => {
    // Five nodes and nothing joining them is not a node-link diagram, and
    // `NetworkTrace` derives its nodes from the links -- so an empty link
    // list is an empty chart rather than five isolated nodes.
    const layers = extractChartData(
      graphChart('forceDirectedGraph', [null, null], { labels: ['a', 'b'], edges: [] }),
    ).maidr.subplots[0][0].layers;

    expect(layers).toEqual([]);
  });
});
