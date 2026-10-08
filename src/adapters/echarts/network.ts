/**
 * The ECharts series that carry a graph (#1195, tier 3).
 *
 * `sankey` and `graph` are both nodes joined by links, and MAIDR's grammar
 * derives the nodes from the links for both: a `FlowPoint` names its two ends
 * and how much flows, a `NetworkPoint` names its two ends and nothing else.
 * So neither reading emits a node list -- the edges are the whole payload,
 * and their order is the order the author declared them.
 *
 * Measured on echarts 6.1.0, `data.graph` carries `nodes` and `edges`, and
 * naming a node is the part worth writing down:
 *
 *     node.name                       undefined -- there is no such property
 *     node.id                         'a'
 *     data.getName(node.dataIndex)    'a'
 *     getEdgeData().getName(i)        'a > b'  -- a label, not a pair
 *
 * The first of those cost a probe: reading `node.name` gave `undefined`,
 * `JSON.stringify` dropped the field, and the result looked like ECharts
 * exposing no names at all. It exposes them under `dataIndex`.
 *
 * ## Highlighting
 *
 * A directed graph is outlined; see "Outlining a directed graph" below. An
 * undirected `graph` and a `sankey` are not, and the reason is the shape
 * rather than the drawing: both traces navigate **links**, and the marks are
 * **nodes**. There is no
 * per-link element to name -- a sankey's ribbons are paths in their own
 * right, but the trace's cursor is on a flow, not on a ribbon, and pairing
 * the two was not measured. Reading without an outline is what the gauge
 * already does (tier 2a) when the marks and the cursor disagree.
 *
 * Measured all the same, so the next tier does not start from nothing: with
 * every node given an explicit `itemStyle.color`, a graph's three marks come
 * out in exactly `data.graph.nodes` order, and a sankey's node rectangles do
 * too, with the link ribbons (`#86878c` by default) and one `#000` alongside.
 *
 * ## Direction
 *
 * A `graph` whose every link carries an arrow at exactly one end is a
 * directed graph, and reading it as undirected links would drop the one
 * thing the arrows were drawn to say. ECharts resolves the mark at each end
 * of a link into the edge's visuals, a link's own `symbol` overriding the
 * series' `edgeSymbol` end by end. Measured on echarts 6.1.0:
 *
 *     edgeSymbol                 link symbol        fromSymbol  toSymbol
 *     (default)                  --                 'none'      'none'
 *     ['none', 'arrow']          --                 'none'      'arrow'
 *     ['none', 'arrow']          ['arrow', 'none']  'arrow'     'none'
 *     ['none', 'arrow']          'none'             'none'      'none'
 *     'arrow'                    --                 'arrow'     'arrow'
 *
 * `fromSymbol` is drawn at `node1`, the link's `source`, and `toSymbol` at
 * `node2`, so the arrow's end is the node the edge arrives at. Only
 * `'arrow'` counts: a `'triangle'` or `'circle'` at a link's end is a
 * marker the author chose, not a direction they declared. A graph where any
 * link has no arrow, or one at both ends, keeps the undirected reading --
 * half a graph's edges directed is not a directed graph, and a two-headed
 * arrow says the pair is joined, which is what a `network` already says.
 *
 * ## Outlining a directed graph
 *
 * A directed graph navigates **nodes**, and names each one by its declared
 * index, so its marks can be paired where an undirected graph's cannot. What
 * a graph paints as filled marks, measured on echarts 6.1.0 in the SVG
 * renderer across `none`, `force` and `circular` layouts, straight, curved and
 * self-looping links, labels, edge labels, categories and a `'source'` edge
 * colour, is always the same sequence: per link in link order, its stroked
 * line (unfilled, so never counted) and then a filled mark for each end that
 * draws a symbol, painted in the link's stroke colour; then one filled symbol
 * per node in data order, painted in the node's colour. So the series' filled
 * marks are counted as the link ends plus the nodes, and the nodes are the
 * last of them.
 *
 * Two node paints break the pairing, and a graph wearing either is left
 * without an outline rather than counted wrongly: an `empty*` symbol is
 * filled white, and a node coloured pure black, which the mark filter sets
 * aside as furniture along with white. A link drawn in either paint only
 * leaves its ends out of the count, since the filter leaves them out too.
 */

import type { DirectedGraphPoint, FlowPoint, MaidrLayer, NetworkPoint } from '@type/grammar';
import type { EChartsGraph, EChartsGraphEdge, EChartsGraphNode, EChartsList, EChartsSeriesModel } from './types';
import { TraceType } from '@type/grammar';
import { nextId } from '../shared/selectorUtil';
import { isMarkPaint } from './selectors';

/** The series types this module reads. */
export const NETWORK: ReadonlySet<string> = new Set(['sankey', 'graph']);

/**
 * Builds the layer for one graph series.
 *
 * A link whose ends cannot both be named is dropped: a flow needs both to be
 * a flow at all, and half of one is not a reading.
 *
 * @param seriesModel - The series to read
 * @returns The layer, or `undefined` when the series carries no links
 */
export function networkLayer(
  seriesModel: EChartsSeriesModel,
): MaidrLayer | undefined {
  const data = seriesModel.getData();
  const graph = data.graph;
  if (!graph) {
    return undefined;
  }

  const named = (node: EChartsGraphNode | undefined): string | undefined => {
    if (!node || typeof node.dataIndex !== 'number') {
      return undefined;
    }
    const name = data.getName(node.dataIndex);
    return name === '' ? undefined : name;
  };

  const weighted = seriesModel.subType === 'sankey';
  if (!weighted) {
    const directed = directedGraphLayer(seriesModel, data, graph);
    if (directed) {
      return directed;
    }
  }
  const flows: FlowPoint[] = [];
  const links: NetworkPoint[] = [];

  for (const edge of graph.edges) {
    const source = named(edge.node1);
    const target = named(edge.node2);
    if (source === undefined || target === undefined) {
      continue;
    }
    if (!weighted) {
      links.push({ source, target });
      continue;
    }
    const value = edge.getValue('value');
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      // A sankey's whole subject is how much flows, so a flow with no
      // magnitude is a flow the reader cannot be told anything about.
      continue;
    }
    flows.push({ source, target, value });
  }

  const points = weighted ? flows : links;
  if (points.length === 0) {
    return undefined;
  }

  const authored = seriesModel.get('name');
  const name = typeof authored === 'string' ? authored : '';

  return {
    id: nextId('layer'),
    type: weighted ? TraceType.SANKEY : TraceType.NETWORK,
    ...(name ? { name } : {}),
    axes: {},
    data: points,
  };
}

/**
 * Whether the mark one end of a link draws is an arrow anyone can see.
 *
 * @param edge - The link
 * @param end - Which end: `'from'` is `node1`, `'to'` is `node2`
 * @returns True for a drawn arrow
 */
function arrowAt(edge: EChartsGraphEdge, end: 'from' | 'to'): boolean {
  if (edge.getVisual?.(`${end}Symbol`) !== 'arrow') {
    return false;
  }
  // A zero-sized arrow is drawn as nothing, so it says nothing either.
  const size = edge.getVisual(`${end}SymbolSize`);
  return typeof size !== 'number' || size > 0;
}

/**
 * Reads a `graph` series as a directed graph, when every link says which way
 * it runs: an arrow at exactly one of its ends. See "Direction" above.
 *
 * Every node is declared, in data order, isolated ones included -- a
 * directed graph declares its nodes rather than deriving them from the
 * links. A node's `inputs` are the nodes at the arrowless end of the links
 * whose arrow points at it, in link order.
 *
 * @param seriesModel - The series
 * @param data - Its data list
 * @param graph - Its graph
 * @returns The layer, or `undefined` when the graph is not directed
 */
function directedGraphLayer(
  seriesModel: EChartsSeriesModel,
  data: EChartsList,
  graph: EChartsGraph,
): MaidrLayer | undefined {
  if (graph.edges.length === 0) {
    return undefined;
  }

  const idOf = (node: EChartsGraphNode | undefined): string | undefined =>
    typeof node?.id === 'string' ? node.id : undefined;

  const inputs = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const from = arrowAt(edge, 'from');
    const to = arrowAt(edge, 'to');
    if (from === to) {
      return undefined;
    }
    const tail = idOf(to ? edge.node1 : edge.node2);
    const head = idOf(to ? edge.node2 : edge.node1);
    if (tail === undefined || head === undefined) {
      return undefined;
    }
    inputs.set(head, [...(inputs.get(head) ?? []), tail]);
  }

  const points: DirectedGraphPoint[] = [];
  for (const node of graph.nodes) {
    const id = idOf(node);
    if (id === undefined) {
      return undefined;
    }
    const name = data.getName(node.dataIndex);
    const into = inputs.get(id);
    points.push({
      id,
      ...(name !== '' && name !== id ? { label: name } : {}),
      ...(into ? { inputs: into } : {}),
    });
  }

  const authored = seriesModel.get('name');
  const name = typeof authored === 'string' ? authored : '';

  return {
    id: nextId('layer'),
    type: TraceType.DIRECTED_GRAPH,
    ...(name ? { name } : {}),
    axes: {},
    data: points,
  };
}

/** The two ends of a link, as ECharts names the symbols drawn at them. */
const LINK_ENDS = ['from', 'to'] as const;

/**
 * The paint a link's end symbols are filled with: the link's stroke.
 *
 * @param edge - The link
 * @returns The colour, or `undefined` when it is not a plain one
 */
export function linkPaint(edge: EChartsGraphEdge): string | undefined {
  const style = edge.getVisual?.('style');
  const stroke = typeof style === 'object' && style !== null
    ? (style as { stroke?: unknown }).stroke
    : undefined;
  return typeof stroke === 'string' ? stroke : undefined;
}

/**
 * The ends of a link that draw a symbol, `node1`'s first.
 *
 * @param edge - The link
 * @returns `'from'`, `'to'`, both or neither
 */
export function drawnEnds(edge: EChartsGraphEdge): ('from' | 'to')[] {
  return LINK_ENDS.filter((end) => {
    const symbol = edge.getVisual?.(`${end}Symbol`);
    return typeof symbol === 'string' && symbol !== '' && symbol !== 'none';
  });
}

/**
 * The paint a node's symbol is filled with, as the SVG renderer fills it.
 *
 * @param data  - The graph's data list
 * @param index - The node's data index
 * @returns The colour, or `undefined` when it is not a plain one
 */
export function nodePaint(data: EChartsList, index: number): string | undefined {
  const symbol = data.getItemVisual?.(index, 'symbol');
  // Measured: an `emptyCircle` node is filled white and stroked in its colour.
  if (typeof symbol === 'string' && symbol.startsWith('empty')) {
    return '#ffffff';
  }
  const style = data.getItemVisual?.(index, 'style');
  const fill = typeof style === 'object' && style !== null
    ? (style as { fill?: unknown }).fill
    : undefined;
  return typeof fill === 'string' ? fill : undefined;
}

/**
 * How many filled marks a directed graph paints, link ends first and then
 * its nodes -- or zero when its nodes cannot be paired with what it painted.
 * See "Outlining a directed graph" above.
 *
 * @param seriesModel - The `graph` series, already read as a directed graph
 * @returns The marks the drawing should hold for it, or 0
 */
export function drawnGraphMarks(seriesModel: EChartsSeriesModel): number {
  const data = seriesModel.getData();
  const graph = data.graph;
  if (!graph || graph.nodes.length === 0) {
    return 0;
  }

  for (const node of graph.nodes) {
    const symbol = data.getItemVisual?.(node.dataIndex, 'symbol');
    const paint = nodePaint(data, node.dataIndex);
    if (symbol === 'none' || (typeof symbol === 'string' && symbol.startsWith('image://'))
      || paint === undefined || !isMarkPaint(paint)) {
      return 0;
    }
  }

  const ends = graph.edges.reduce((total, edge) => {
    const paint = linkPaint(edge);
    return paint !== undefined && isMarkPaint(paint) ? total + drawnEnds(edge).length : total;
  }, 0);
  return ends + graph.nodes.length;
}

/**
 * A directed graph's layer, given the selectors of the marks its series
 * painted.
 *
 * The nodes are the last of those marks, one per node in data order, which
 * is the order the layer declares them in -- so they are the layer's
 * selectors exactly, one per declared node as `DirectedGraphTrace` reads
 * them.
 *
 * @param layer - The directed graph's layer
 * @param marks - One selector per filled mark of the series, when they were
 *                found
 * @returns The layer, outlined when the marks pair with its nodes
 */
export function withNodeSelectors(layer: MaidrLayer, marks: string[] | undefined): MaidrLayer {
  const nodes = Array.isArray(layer.data) ? layer.data.length : 0;
  if (layer.type !== TraceType.DIRECTED_GRAPH || !marks || nodes === 0 || marks.length < nodes) {
    return layer;
  }
  return { ...layer, selectors: marks.slice(marks.length - nodes) };
}
