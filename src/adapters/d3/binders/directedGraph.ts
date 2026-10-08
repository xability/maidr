/**
 * D3 binder for directed graphs -- node-link diagrams whose links run one
 * way, as a computation graph's do.
 *
 * The links are read exactly as `binders/network.ts` reads them, each end
 * named the way `d3.forceLink` resolves it, and each link becomes an input of
 * the node it points at. What a directed graph adds is that the trace walks
 * **nodes** in the order the edges run, so the nodes are the unit: read from
 * their own elements when the chart names them, which is also what lets the
 * node the reader is on be outlined.
 */

import type { DirectedGraphPoint, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3DirectedGraphConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';
import { resolveEndpoint } from './network';

/**
 * Binds a D3.js directed graph to MAIDR.
 *
 * Calling this binder is the declaration that the links have a direction:
 * each points from its `source` to its `target`. Point `selector` at the
 * links and, to have the node a reader is on outlined, `nodeSelector` at the
 * nodes -- one element per node, whose datum names it as a link's end does.
 *
 * @param svg - The SVG element containing the D3 graph.
 * @param config - Configuration naming the links, and optionally the nodes.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * bindD3DirectedGraph(svgElement, {
 *   selector: 'line.edge',
 *   nodeSelector: 'circle.op',
 *   label: 'name',
 * });
 * ```
 */
export function bindD3DirectedGraph(svg: Element, config: D3DirectedGraphConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildDirectedGraphLayer(svg, config));
}

/**
 * Pure extraction core for directed graphs. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildDirectedGraphLayer(
  root: Element,
  config: D3DirectedGraphConfig,
  panel?: D3PanelScope,
): D3BuiltLayer {
  const { title, axes, format, selector, nodeSelector } = config;

  const links = queryD3Elements(root, selector);
  if (links.length === 0) {
    throw buildNoElementsError(root, selector, 'directed graph link');
  }
  const first = links[0].datum;
  const sourceAccessor = inferAccessor<unknown>(config, 'source', 'source', ['from', 'src'], first);
  const targetAccessor = inferAccessor<unknown>(config, 'target', 'target', ['to', 'dst'], first);

  const edges = links.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }
    return {
      source: resolveEndpoint(resolveAccessor(datum, sourceAccessor, index), 'source', index),
      target: resolveEndpoint(resolveAccessor(datum, targetAccessor, index), 'target', index),
    };
  });

  // The nodes: the chart's own node elements, in DOM order, when it names
  // them; otherwise every end in the order the links first mention it.
  const nodes: { id: string | number; label?: string | number }[] = [];
  if (nodeSelector) {
    const elements = queryD3Elements(root, nodeSelector);
    if (elements.length === 0) {
      throw buildNoElementsError(root, nodeSelector, 'directed graph node');
    }
    for (const { datum, index } of elements) {
      if (datum === undefined || datum === null) {
        throw buildNoDatumError(nodeSelector, index);
      }
      const raw = config.node === undefined ? datum : resolveAccessor(datum, config.node, index);
      const label = config.label === undefined
        ? undefined
        : resolveAccessorOptional<string | number>(datum, config.label, index);
      nodes.push({ id: resolveEndpoint(raw, 'node', index), ...(label === undefined ? {} : { label }) });
    }
  } else {
    const seen = new Set<string | number>();
    for (const { source, target } of edges) {
      for (const id of [source, target]) {
        if (!seen.has(id)) {
          seen.add(id);
          nodes.push({ id });
        }
      }
    }
  }

  const data: DirectedGraphPoint[] = nodes.map((node) => {
    const inputs = edges.filter(edge => edge.target === node.id).map(edge => edge.source);
    return {
      id: node.id,
      ...(node.label === undefined ? {} : { label: node.label }),
      ...(inputs.length > 0 ? { inputs } : {}),
    };
  });

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.DIRECTED_GRAPH,
    title,
    // One scoped selector matching every node, in DOM order -- the order the
    // nodes were read in, so the trace's declared node i is element i. A graph
    // read from its links alone has no node element to name.
    ...(nodeSelector ? { selectors: scopeSelector(root, nodeSelector, panel) } : {}),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}
