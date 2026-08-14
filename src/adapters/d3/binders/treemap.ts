/**
 * D3 binder for treemaps, sunbursts and icicles.
 *
 * Extracts the tree a `d3.treemap()` or `d3.partition()` laid out and generates
 * the MAIDR JSON schema for accessible interaction. Both layouts run over a
 * `d3.hierarchy()`, so the datum bound to each mark is a hierarchy node — the
 * binder recognises it and reads the node's value and its ancestor chain
 * directly, the way the pie binder unwraps a `d3.pie()` arc.
 */

import type { MaidrLayer, TreemapPoint } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3TreemapConfig, DataAccessor, TreemapTraceType } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessorOptional } from '../util';

/**
 * The node `d3.hierarchy()` wraps each of the caller's rows in: their own row
 * under `data`, the total `.sum(...)` computed under `value`, and the tree
 * itself reachable through `ancestors()`.
 *
 * `d3.treemap()` and `d3.partition()` add the node's rectangle (`x0`/`y0`/…)
 * but change nothing here, which is why one interface serves both layouts.
 */
interface D3HierarchyNode {
  data: unknown;
  depth: number;
  value?: number;
  ancestors: () => D3HierarchyNode[];
}

/**
 * Whether a bound datum is a `d3.hierarchy()` node rather than the caller's own
 * row.
 *
 * Recognised by the shape the layout documents — `ancestors()` is the method
 * the path is derived from, and testing for it means a hand-rolled object that
 * merely happens to have a `data` key is not mistaken for a node.
 *
 * @param datum - The element's D3-bound datum
 * @returns True when the datum is a hierarchy node
 */
function isHierarchyNode(datum: unknown): datum is D3HierarchyNode {
  if (typeof datum !== 'object' || datum === null) {
    return false;
  }
  return 'data' in datum
    && 'depth' in datum
    && typeof (datum as { ancestors?: unknown }).ancestors === 'function';
}

/**
 * Reads what one node is called.
 *
 * Used for the node itself and for every ancestor of it, so the breadcrumb a
 * reader is given several levels down names things exactly as the nodes do. A
 * row that is a bare string or number names its own node, since a string
 * accessor cannot address a primitive.
 *
 * @param row - The caller's own datum for this node
 * @param accessor - The resolved name accessor
 * @param index - Position of the mark in the selection, for the error message
 * @returns The node's name
 * @throws Error when the accessor resolves to nothing on an object row
 */
function resolveNodeName(
  row: unknown,
  accessor: DataAccessor<string | number>,
  index: number,
): string | number {
  if (typeof accessor === 'string' && (row === null || typeof row !== 'object')) {
    return typeof row === 'number' ? row : String(row);
  }

  const name = resolveAccessorOptional<string | number>(row, accessor, index);
  if (name !== undefined && name !== null) {
    return name;
  }
  const available = row !== null && typeof row === 'object'
    ? ` Available properties: ${Object.keys(row as Record<string, unknown>).join(', ')}.`
    : '';
  throw new Error(
    `The node at index ${index} (or one of its ancestors) has no name: the `
    + `accessor resolved to nothing on it.${available} Pass an \`x\` accessor `
    + `naming the property that carries it.`,
  );
}

/**
 * Reads a node's magnitude off the caller's own row.
 *
 * Reached only when the layout has no total to offer — a tree built by hand,
 * or one whose `y` the caller named themselves. A row that is a bare number is
 * its own magnitude, since a string accessor cannot address a primitive; a
 * function accessor is always invoked, as it may be index-based.
 *
 * @param row - The caller's own datum for this node
 * @param accessor - The resolved value accessor
 * @param index - Position of the mark in the selection
 * @returns The magnitude, or `undefined` when the row declares none
 */
function resolveNodeValue(
  row: unknown,
  accessor: DataAccessor<number>,
  index: number,
): number | undefined {
  if (typeof accessor === 'string' && (row === null || typeof row !== 'object')) {
    return typeof row === 'number' ? row : undefined;
  }
  return resolveAccessorOptional<number>(row, accessor, index);
}

/**
 * Reads a node's declared ancestors off the caller's own row.
 *
 * Used for a tree that was NOT built with `d3.hierarchy()` — there is no
 * ancestor chain to walk, so the path has to be declared. `path` is the
 * canonical key and needs no config; anything else is named through the
 * accessor. A row that is a bare string or number declares no ancestors, and
 * is a top-level node.
 *
 * @param row - The caller's own datum for this node
 * @param accessor - The user's `path` accessor, when they gave one
 * @param index - Position of the mark in the selection
 * @returns The ancestors, or `undefined` when the row declares none
 */
function resolvePath(
  row: unknown,
  accessor: DataAccessor<(string | number)[]> | undefined,
  index: number,
): (string | number)[] | undefined {
  const resolved = accessor ?? 'path';
  if (typeof resolved === 'string' && (row === null || typeof row !== 'object')) {
    return undefined;
  }
  return resolveAccessorOptional<(string | number)[]>(row, resolved, index);
}

/**
 * Binds a D3.js treemap to MAIDR, generating the accessible data representation.
 *
 * Point `selector` at the node marks — one `<rect>` per leaf for the canonical
 * `d3.treemap()(root).leaves()` join. Every matched element becomes one point,
 * in DOM order, and **nothing is filtered**: the interior nodes and their
 * totals are derived from the paths, so selecting the leaves alone is a
 * complete tree, and selecting more than you drew would leave the reader
 * navigating nodes that highlight nothing.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** Like every D3 binder, this reads
 * each matched element's D3-bound `__data__`; calling it before
 * `.data().join()` has run (or before the SVG is mounted) throws "No elements
 * found for selector …".
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
 *
 * @param svg - The SVG element containing the D3 treemap.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const root = d3.treemap().size([w, h])(
 *   d3.hierarchy(data).sum(d => d.population),
 * );
 * svg.selectAll('rect.leaf').data(root.leaves()).join('rect')…;
 *
 * bindD3Treemap(svgElement, {
 *   selector: 'rect.leaf',
 *   title: 'World population by region',
 *   axes: { x: 'Region', y: 'Population, millions' },
 * });
 * ```
 */
export function bindD3Treemap(svg: Element, config: D3TreemapConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildTreemapLayer(svg, config));
}

/**
 * Binds a D3.js sunburst to MAIDR.
 *
 * A sunburst is the same tree as a treemap drawn in polar coordinates, so the
 * extraction is that of {@link bindD3Treemap}: `selector` matches the arc
 * `<path>` elements a `d3.partition()` produced. The trace pans each node by
 * its angle around the dial, which is what distinguishes a ring from a row of
 * rectangles by ear.
 *
 * What differs in practice is *which* nodes are drawn: a partition lays out
 * interior nodes as well as leaves, and `root.descendants()` includes the root
 * itself. Whatever you joined is what the binder emits, so select exactly the
 * arcs you drew.
 *
 * @param svg - The SVG element containing the D3 sunburst.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const root = d3.partition().size([2 * Math.PI, radius])(
 *   d3.hierarchy(data).sum(d => d.population),
 * );
 * svg.selectAll('path.arc').data(root.descendants().slice(1)).join('path')…;
 *
 * bindD3Sunburst(svgElement, {
 *   selector: 'path.arc',
 *   title: 'World population by region',
 *   axes: { x: 'Region', y: 'Population, millions' },
 * });
 * ```
 */
export function bindD3Sunburst(svg: Element, config: D3TreemapConfig): D3BinderResult {
  return finalizeSingleChart(
    svg,
    config,
    buildTreemapLayer(svg, config, undefined, TraceType.SUNBURST),
  );
}

/**
 * Binds a D3.js icicle to MAIDR.
 *
 * An icicle is the sunburst's partition drawn in cartesian coordinates: the
 * same `d3.partition()` over the same `d3.hierarchy()`, laid out as
 * depth-ordered bands rather than concentric arcs. Nothing about the tree
 * changes, so the extraction is that of {@link bindD3Sunburst} — `selector`
 * matches the `<rect>` bands the partition produced, and whatever you joined
 * (leaves alone, or `descendants()` with its interior nodes) is what the reader
 * navigates.
 *
 * @param svg - The SVG element containing the D3 icicle.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const root = d3.partition().size([height, width])(
 *   d3.hierarchy(data).sum(d => d.population),
 * );
 * svg.selectAll('rect.band').data(root.descendants().slice(1)).join('rect')…;
 *
 * bindD3Icicle(svgElement, {
 *   selector: 'rect.band',
 *   title: 'World population by region',
 *   axes: { x: 'Region', y: 'Population, millions' },
 * });
 * ```
 */
export function bindD3Icicle(svg: Element, config: D3TreemapConfig): D3BinderResult {
  return finalizeSingleChart(
    svg,
    config,
    buildTreemapLayer(svg, config, undefined, TraceType.ICICLE),
  );
}

/**
 * Pure extraction core for treemaps, sunbursts and icicles. See
 * {@link buildBarLayer} for the single-chart vs multi-panel contract.
 *
 * The trailing `type` selects which layout the layer announces itself as; the
 * tree is the same for both (see {@link TreemapTraceType}).
 *
 * @internal
 */
export function buildTreemapLayer(
  root: Element,
  config: D3TreemapConfig,
  panel?: D3PanelScope,
  type: TreemapTraceType = TraceType.TREEMAP,
): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    y: yOverride,
    path: pathOverride,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'treemap node');
  }

  // Infer accessors from the USER's first row, not from the hierarchy node
  // wrapping it: the keys worth guessing (`name`, `value`, …) are the ones the
  // caller wrote, and every node carries the same layout keys regardless.
  const firstDatum = elements[0].datum;
  const firstRow = isHierarchyNode(firstDatum) ? firstDatum.data : firstDatum;
  const xAccessor = inferAccessor<string | number>(
    config,
    'x',
    'name',
    ['id', 'label', 'key', 'x'],
    firstRow,
  );
  const yAccessor = inferAccessor<number>(
    config,
    'y',
    'value',
    ['size', 'count', 'amount', 'total', 'y'],
    firstRow,
  );

  const data: TreemapPoint[] = elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }

    const node = isHierarchyNode(datum) ? datum : null;
    const row = node ? node.data : datum;

    const point: TreemapPoint = {
      x: resolveNodeName(row, xAccessor, index),
    };

    // `d3.hierarchy().sum(...)` has already totalled each node, and that total
    // is what the rectangle's area was drawn from — so reading it back keeps
    // the sonified magnitude identical to the mark on screen. An explicit `y`
    // still wins: it is what binds a tree laid out by hand.
    const value = node !== null && yOverride === undefined && typeof node.value === 'number'
      ? node.value
      : resolveNodeValue(row, yAccessor, index);
    if (typeof value === 'number' && Number.isFinite(value)) {
      point.y = value;
    }

    // Root first and excluding the node itself, which is the order and the
    // extent the grammar asks for. `ancestors()` runs the other way (self
    // first, root last), hence the reverse before the trailing slice — it
    // returns a fresh array each call, so reversing it in place is safe.
    const path = node !== null && pathOverride === undefined
      ? node.ancestors().reverse().slice(0, -1).map(ancestor => resolveNodeName(ancestor.data, xAccessor, index))
      : resolvePath(row, pathOverride, index);
    if (path !== undefined && path !== null && path.length > 0) {
      point.path = path;
    }

    return point;
  });

  const layer: MaidrLayer = {
    id: generateId(),
    type,
    title,
    // One scoped selector matching every mark: the trace indexes the matches by
    // declaration order, gives the interior nodes it derived a hidden
    // placeholder, and withdraws highlighting on a count mismatch rather than
    // highlighting a neighbouring rectangle for the rest of the chart.
    selectors: scopeSelector(root, selector, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}
