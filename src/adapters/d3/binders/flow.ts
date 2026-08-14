/**
 * D3 binder for sankey, alluvial and chord diagrams.
 *
 * Extracts the two ends and the magnitude of every ribbon the layout drew and
 * generates the MAIDR JSON schema for accessible interaction. The nodes are
 * derived from the links rather than read separately — a flow list names both
 * of its ends, so a separate node selection would be a second source of truth
 * for something the ribbons already say.
 *
 * The three layouts differ in where they put the ribbons, not in what they
 * carry, so one core builds all three and the type the layer announces is what
 * changes.
 */

import type { FlowPoint, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3FlowConfig, DataAccessor, FlowTraceType } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

/** Keys a node object is named by, in the order `d3-sankey` itself tries `id`. */
const NODE_NAME_KEYS = ['id', 'name', 'key', 'label'] as const;

/**
 * Normalizes one end of a ribbon to the node it names.
 *
 * There are three shapes to read, and a chart draws whichever its layout
 * produced:
 *
 * 1. **A name**, for a graph drawn by hand — used as it stands.
 * 2. **A node object**, which is what `d3-sankey` leaves behind: like
 *    `d3.forceLink`, it replaces each link's `source` and `target` with the
 *    nodes it resolved them to, so a binder called after the layout sees
 *    objects. Read through {@link NODE_NAME_KEYS}.
 * 3. **A matrix index**, which is what `d3.chord()` produces: its ends are
 *    `{ index, value, startAngle, … }` and a matrix has no names in it. The
 *    caller's `names` supplies them; without it the index is announced as
 *    itself, since a bare number is at least the position the chart drew.
 *
 * @param raw - The value the accessor produced for this end
 * @param names - The matrix's row labels, when the caller declared them
 * @param endpoint - Which end, for the error message
 * @param index - Position of the ribbon in the selection
 * @returns The node's name
 * @throws Error when an object end carries neither a name nor an index
 */
function resolveEndpoint(
  raw: unknown,
  names: (string | number)[] | undefined,
  endpoint: 'source' | 'target',
  index: number,
): string | number {
  if (typeof raw === 'number') {
    return names?.[raw] ?? raw;
  }
  if (typeof raw === 'string') {
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
    // A chord's end, which names its group by position in the matrix.
    if (typeof node.index === 'number') {
      return names?.[node.index] ?? node.index;
    }
    throw new Error(
      `The "${endpoint}" of the flow at index ${index} is a node object with `
      + `no name: none of ${NODE_NAME_KEYS.join(', ')} is set on it. `
      + `Available properties: ${Object.keys(node).join(', ')}. Pass a `
      + `\`${endpoint}\` accessor that names the node, e.g. `
      + `\`${endpoint}: d => d.${endpoint}.title\`.`,
    );
  }
  throw new Error(
    `The "${endpoint}" of the flow at index ${index} resolved to `
    + `${String(raw)}, which names no node. A flow needs both of its ends.`,
  );
}

/**
 * Reads how much flows along one ribbon.
 *
 * `d3.chord()` puts the magnitude on each **end** of the ribbon rather than on
 * the ribbon itself — the same number the drawn width came from — so a datum
 * with no value of its own falls back to it. Nothing is derived beyond that: a
 * ribbon whose weight cannot be read is the whole content of the chart missing,
 * and a guessed one would be announced as measured.
 *
 * @param datum - The datum bound to the ribbon's element
 * @param accessor - The resolved value accessor
 * @param index - Position of the ribbon in the selection
 * @returns The magnitude
 * @throws Error when neither the datum nor its source end carries one
 */
function resolveValue(
  datum: unknown,
  accessor: DataAccessor<number>,
  index: number,
): number {
  const direct = Number(resolveAccessorOptional<number>(datum, accessor, index));
  if (Number.isFinite(direct)) {
    return direct;
  }

  const source = (datum as Record<string, unknown>).source;
  if (source !== null && typeof source === 'object') {
    const nested = Number((source as Record<string, unknown>).value);
    if (Number.isFinite(nested)) {
      return nested;
    }
  }

  const available = datum !== null && typeof datum === 'object'
    ? ` Available properties: ${Object.keys(datum as Record<string, unknown>).join(', ')}.`
    : '';
  throw new Error(
    `The flow at index ${index} carries no magnitude: neither the datum nor `
    + `its source end has a usable number.${available} Pass a \`value\` `
    + `accessor naming the property that carries it.`,
  );
}

/**
 * Binds a D3.js sankey diagram to MAIDR, generating the accessible data
 * representation.
 *
 * Point `selector` at the **ribbons** — one `<path>` per link, the
 * `d3-sankey` idiom being `.data(graph.links).join('path')` — rather than at
 * the node rectangles. The nodes are derived from the links, so the links are
 * what map one-to-one onto the payload; a selector matching the node rects
 * would give the trace a node count where it expects a link count, and
 * highlighting would be withdrawn.
 *
 * @remarks
 * **Timing — call after the layout has run.** `sankey(graph)` replaces each
 * link's `source` and `target` with the resolved node objects, and the binder
 * reads names either way; what it cannot do is run before the ribbons are
 * joined.
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
 *
 * @param svg - The SVG element containing the D3 sankey.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const graph = sankey({ nodes, links });
 * svg.selectAll('path.ribbon').data(graph.links).join('path')…;
 *
 * bindD3Sankey(svgElement, {
 *   selector: 'path.ribbon',
 *   title: 'Energy flow',
 *   axes: { x: 'Node', y: 'Petajoules' },
 * });
 * ```
 */
export function bindD3Sankey(svg: Element, config: D3FlowConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildFlowLayer(svg, config));
}

/**
 * Binds a D3.js alluvial diagram to MAIDR.
 *
 * An alluvial is a sankey whose node columns repeat — the same category
 * observed at several points, with the ribbons carrying how much moved between
 * them — so the extraction is that of {@link bindD3Sankey} and only the chart's
 * announced name changes.
 *
 * @param svg - The SVG element containing the D3 alluvial diagram.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * bindD3Alluvial(svgElement, {
 *   selector: 'path.ribbon',
 *   title: 'Party support between elections',
 *   axes: { x: 'Group', y: 'Voters' },
 * });
 * ```
 */
export function bindD3Alluvial(svg: Element, config: D3FlowConfig): D3BinderResult {
  return finalizeSingleChart(
    svg,
    config,
    buildFlowLayer(svg, config, undefined, TraceType.ALLUVIAL),
  );
}

/**
 * Binds a D3.js chord diagram to MAIDR.
 *
 * `selector` matches the ribbon `<path>` elements `d3.ribbon()` drew from
 * `d3.chord()(matrix)` — the chords themselves, not the group arcs around the
 * dial.
 *
 * **Declare `names`.** A chord layout is computed from a matrix, so each end of
 * a ribbon is a row *index* (`{ index, value, … }`) and the labels a sighted
 * reader takes from the ring are not in the data at all. Without `names` the
 * chart announces "0 to 3" — true, and useless.
 *
 * @param svg - The SVG element containing the D3 chord diagram.
 * @param config - Configuration specifying the selector, the group names and
 *                 any data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const chords = d3.chord()(matrix);
 * svg.selectAll('path.chord').data(chords).join('path').attr('d', d3.ribbon()…);
 *
 * bindD3Chord(svgElement, {
 *   selector: 'path.chord',
 *   title: 'Migration between regions',
 *   axes: { x: 'Region', y: 'People' },
 *   names: ['Africa', 'Americas', 'Asia', 'Europe'],
 * });
 * ```
 */
export function bindD3Chord(svg: Element, config: D3FlowConfig): D3BinderResult {
  return finalizeSingleChart(
    svg,
    config,
    buildFlowLayer(svg, config, undefined, TraceType.CHORD),
  );
}

/**
 * Pure extraction core for sankey, alluvial and chord diagrams. See
 * {@link buildBarLayer} for the single-chart vs multi-panel contract.
 *
 * The trailing `type` selects which diagram the layer announces itself as; the
 * graph is the same for all three (see {@link FlowTraceType}).
 *
 * @internal
 */
export function buildFlowLayer(
  root: Element,
  config: D3FlowConfig,
  panel?: D3PanelScope,
  type: FlowTraceType = TraceType.SANKEY,
): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    names,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'flow ribbon');
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
  const valueAccessor = inferAccessor<number>(
    config,
    'value',
    'value',
    ['weight', 'amount', 'count', 'y'],
    firstDatum,
  );

  const data: FlowPoint[] = elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }
    return {
      source: resolveEndpoint(resolveAccessor(datum, sourceAccessor, index), names, 'source', index),
      target: resolveEndpoint(resolveAccessor(datum, targetAccessor, index), names, 'target', index),
      value: resolveValue(datum, valueAccessor, index),
    };
  });

  const layer: MaidrLayer = {
    id: generateId(),
    type,
    title,
    // One scoped selector matching every ribbon: the trace keys them to the
    // flows in DECLARED order — which is the order they were queried in — and
    // highlights, from a node, the ribbons that touch it. A selector list that
    // reordered them would highlight one ribbon while announcing another.
    selectors: scopeSelector(root, selector, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}
