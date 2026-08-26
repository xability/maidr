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
 * A `graph` can be outlined and a `sankey`'s nodes could be, but neither is
 * outlined here, and the reason is the shape rather than the drawing: both
 * traces navigate **links**, and the marks are **nodes**. There is no
 * per-link element to name -- a sankey's ribbons are paths in their own
 * right, but the trace's cursor is on a flow, not on a ribbon, and pairing
 * the two was not measured. Reading without an outline is what the gauge
 * already does (tier 2a) when the marks and the cursor disagree.
 *
 * Measured all the same, so the next tier does not start from nothing: with
 * every node given an explicit `itemStyle.color`, a graph's three marks come
 * out in exactly `data.graph.nodes` order, and a sankey's node rectangles do
 * too, with the link ribbons (`#86878c` by default) and one `#000` alongside.
 */

import type { FlowPoint, MaidrLayer, NetworkPoint } from '@type/grammar';
import type { EChartsGraphNode, EChartsSeriesModel } from './types';
import { TraceType } from '@type/grammar';
import { nextId } from '../shared/selectorUtil';

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
