/**
 * D3 binder for force-directed networks (node-link diagrams).
 *
 * Extracts the two ends of every link a `d3-force` simulation drew and
 * generates the MAIDR JSON schema for accessible interaction. The nodes are
 * derived from the links rather than read separately, so a link is the unit
 * here — which is also the element the chart draws one of per datum.
 *
 * Positions are deliberately not read. Where a force-directed node lands is a
 * fact about the solver's seed rather than about the data, so announcing it
 * would be inventing a finding.
 */

import type { MaidrLayer, NetworkPoint } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3NetworkConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor } from '../util';

/** Keys a node object is named by, in the order `d3-force` itself tries `id`. */
const NODE_NAME_KEYS = ['id', 'name', 'key', 'label'] as const;

/**
 * Normalizes one end of a link to the node's name.
 *
 * `d3.forceLink` **mutates** the links it is given: before the simulation runs
 * `link.source` is whatever the author wrote (usually an id), and afterwards it
 * is the node *object* that id resolved to. A binder called after the layout —
 * which is the only time the lines exist to select — therefore sees objects,
 * and reading them as names is the difference between "Ada — Grace" and
 * "[object Object] — [object Object]".
 *
 * @param raw - The value the accessor produced for this end
 * @param endpoint - Which end, for the error message
 * @param index - Position of the link in the selection
 * @returns The node's name
 * @throws Error when an object end carries none of {@link NODE_NAME_KEYS}
 */
function resolveEndpoint(
  raw: unknown,
  endpoint: 'source' | 'target',
  index: number,
): string | number {
  if (typeof raw === 'string' || typeof raw === 'number') {
    return raw;
  }
  if (raw !== null && typeof raw === 'object') {
    const node = raw as Record<string, unknown>;
    for (const key of NODE_NAME_KEYS) {
      const value = node[key];
      if (typeof value === 'string' || typeof value === 'number') {
        return value;
      }
    }
    throw new Error(
      `The "${endpoint}" of the link at index ${index} is a node object with `
      + `no name: none of ${NODE_NAME_KEYS.join(', ')} is set on it. `
      + `Available properties: ${Object.keys(node).join(', ')}. Pass a `
      + `\`${endpoint}\` accessor that names the node, e.g. `
      + `\`${endpoint}: d => d.${endpoint}.title\`.`,
    );
  }
  throw new Error(
    `The "${endpoint}" of the link at index ${index} resolved to `
    + `${String(raw)}, which names no node. A link needs both of its ends.`,
  );
}

/**
 * Binds a D3.js force-directed network to MAIDR, generating the accessible
 * data representation.
 *
 * Point `selector` at the **links** — one `<line>` per edge — rather than at
 * the node circles. The nodes are derived from the links, so the links are what
 * map one-to-one onto the payload; a selector matching the circles would give
 * the trace a node count where it expects a link count, and highlighting would
 * be withdrawn.
 *
 * @remarks
 * **Timing — call after the simulation has been wired up.** `d3.forceLink`
 * replaces each link's `source` and `target` with the resolved node objects, so
 * the binder reads names either way; what it cannot do is run before the lines
 * are joined. Bind right after the `.data(links).join('line')` chain — there is
 * no need to wait for the simulation to settle, since no position is read.
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
 *
 * @param svg - The SVG element containing the D3 network.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const link = svg.selectAll('line.link').data(links).join('line');
 * d3.forceSimulation(nodes).force('link', d3.forceLink(links).id(d => d.id));
 *
 * bindD3Network(svgElement, {
 *   selector: 'line.link',
 *   title: 'Collaborations',
 *   axes: { x: 'Person', y: 'Links' },
 * });
 * ```
 */
export function bindD3Network(svg: Element, config: D3NetworkConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildNetworkLayer(svg, config));
}

/**
 * Pure extraction core for networks. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildNetworkLayer(root: Element, config: D3NetworkConfig, panel?: D3PanelScope): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'network link');
  }

  // Infer accessors from the first datum's keys when the user did not specify.
  const firstDatum = elements[0].datum;
  const sourceAccessor = inferAccessor<unknown>(
    config,
    'source',
    'source',
    ['from', 'src'],
    firstDatum,
  );
  const targetAccessor = inferAccessor<unknown>(
    config,
    'target',
    'target',
    ['to', 'dst'],
    firstDatum,
  );

  const data: NetworkPoint[] = elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }
    return {
      source: resolveEndpoint(resolveAccessor(datum, sourceAccessor, index), 'source', index),
      target: resolveEndpoint(resolveAccessor(datum, targetAccessor, index), 'target', index),
    };
  });

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.NETWORK,
    title,
    // One scoped selector matching every link: the trace pairs them with the
    // links in declared order and highlights, from a node, the line it is
    // most connected by — which is also where the next keystroke goes.
    selectors: scopeSelector(root, selector, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}
