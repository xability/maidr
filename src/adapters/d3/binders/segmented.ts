/**
 * D3 binder for segmented bar charts (stacked, dodged, and normalized).
 *
 * Extracts data from D3.js-rendered grouped/stacked bar chart SVG elements
 * and generates the MAIDR JSON schema for accessible interaction.
 */

import type { Maidr, MaidrLayer, SegmentedPoint } from '../../../type/grammar';
import type { D3BinderResult, D3SegmentedConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { applyMaidrData, buildAxes, buildNoDatumError, buildNoElementsError, generateId, inferAccessor, queryD3Elements, resolveAccessor } from '../util';

/**
 * Binds a D3.js segmented bar chart (stacked, dodged, or normalized) to MAIDR.
 *
 * Segmented bar charts extend regular bar charts with a `fill` dimension that
 * identifies the segment/group within each bar. The data is organized as a
 * 2D array where each inner array represents a series/group.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** This function reads each matched
 * element's D3-bound `__data__`: the x/y/fill bound to each bar segment —
 * or, with `groupSelector`, the `d3.stack()` tuple plus the parent group's
 * `.key`. Calling it before `.data().join()` has run (or before the SVG is
 * mounted) throws "No elements found for selector …" or "Property '…' not
 * found on datum".
 *
 * Typical call sites:
 * - **Vanilla JS:** right after your `selectAll(...).data(...).join(...)` chain.
 * - **React:** inside `useEffect`, never during render. Prefer
 *   {@link MaidrD3} / {@link useD3Adapter} from `maidr/react`, which
 *   handle the post-render timing for you.
 * - **Async data:** inside the `.then(...)` of your fetch, after drawing.
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
 *
 * @param svg - The SVG element containing the D3 segmented bar chart.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * // Flat structure: each rect has { x, y, fill } data
 * const result = bindD3Segmented(svgElement, {
 *   selector: 'rect.bar',
 *   type: 'stacked_bar',
 *   title: 'Revenue by Region and Quarter',
 *   axes: { x: 'Quarter', y: 'Revenue', fill: 'Region' },
 *   x: 'quarter',
 *   y: 'revenue',
 *   fill: 'region',
 * });
 *
 * // d3.stack() structure: groups contain segments
 * const result = bindD3Segmented(svgElement, {
 *   groupSelector: 'g.series',
 *   selector: 'rect',
 *   type: 'stacked_bar',
 *   title: 'Revenue by Region and Quarter',
 *   x: (d) => d.data.category,
 *   y: (d) => d[1] - d[0],
 * });
 * ```
 */
export function bindD3Segmented(svg: Element, config: D3SegmentedConfig): D3BinderResult {
  const {
    id = generateId(),
    title,
    subtitle,
    caption,
    axes,
    format,
    selector,
    groupSelector,
    type = TraceType.STACKED,
    domOrder: domOrderOverride,
    autoApply,
  } = config;

  const configRecord = config as unknown as Record<string, unknown>;
  const groupOrder: string[] = [];
  const data: SegmentedPoint[][] = [];

  // Track the DOM ordering so we can emit an accurate `domMapping` hint on the
  // layer below. Without this, the model falls back to column-major +
  // `groupDirection='reverse'`, which yields wrong highlights for both of the
  // typical D3 patterns (flat dodged ⇒ subject-major; nested/`d3.stack()` ⇒
  // series-major).
  let detectedDomOrder: 'subject-major' | 'series-major' | undefined;

  if (groupSelector) {
    // d3.stack() pattern: each group <g> contains segment <rect>s.
    // The group's datum typically has a .key property (d3.stack output).
    // Rects are rendered one full series at a time (all categories of group 0,
    // then all of group 1, …) ⇒ series-major DOM order.
    detectedDomOrder = 'series-major';

    const groupElements = queryD3Elements(svg, groupSelector);
    if (groupElements.length === 0) {
      throw buildNoElementsError(svg, groupSelector, 'segmented-bar group');
    }

    // Sample the first group's first segment for accessor inference.
    const firstGroupSegments = queryD3Elements(groupElements[0].element, selector);
    const sampleDatum = firstGroupSegments[0]?.datum;
    const xAccessor = inferAccessor<string | number>(
      configRecord,
      'x',
      'x',
      ['category', 'label', 'name', 'key', 'date'],
      sampleDatum,
    );
    const yAccessor = inferAccessor<number | string>(
      configRecord,
      'y',
      'y',
      ['value', 'count', 'amount', 'total'],
      sampleDatum,
    );
    const fillAccessor = inferAccessor<string>(
      configRecord,
      'fill',
      'fill',
      ['group', 'series', 'category', 'z', 'color'],
      sampleDatum,
    );

    for (const { element: groupEl, datum: groupDatum } of groupElements) {
      const segments = queryD3Elements(groupEl, selector);
      if (segments.length === 0)
        continue;

      // Derive fill from group datum's .key (d3.stack) or first segment
      const groupKey = (groupDatum as Record<string, unknown> | null)?.key as string | undefined;

      const groupPoints: SegmentedPoint[] = segments.map(({ datum, index }) => {
        if (!datum) {
          throw buildNoDatumError(selector, index);
        }
        const fillValue = groupKey ?? resolveAccessor<string>(datum, fillAccessor, index);
        return {
          x: resolveAccessor<string | number>(datum, xAccessor, index),
          y: resolveAccessor<number | string>(datum, yAccessor, index),
          z: fillValue,
        };
      });

      if (groupPoints.length > 0) {
        groupOrder.push(groupPoints[0].z);
        data.push(groupPoints);
      }
    }
  } else {
    // Flat structure: all segments in one container, grouped by fill value
    const elements = queryD3Elements(svg, selector);
    if (elements.length === 0) {
      throw buildNoElementsError(svg, selector, 'segmented bar');
    }

    // Pattern detection: if the datum looks like a d3.stack() tuple
    // ([y0, y1] array with a back-reference to the row via `.data`), the
    // user almost certainly wanted the grouped path. Tell them so before
    // `resolveAccessor` throws a cryptic "Property 'x' not found" error.
    const firstDatum = elements[0].datum;
    if (
      Array.isArray(firstDatum)
      && firstDatum.length === 2
      && typeof firstDatum[0] === 'number'
      && typeof firstDatum[1] === 'number'
      && 'data' in (firstDatum as unknown as Record<string, unknown>)
    ) {
      throw new Error(
        `The datum bound to "${selector}" looks like d3.stack() output `
        + `(a [y0, y1] tuple with a .data back-reference), but no `
        + `\`groupSelector\` was provided. Pass \`groupSelector\` (typically `
        + `the series container, e.g. "g.series") so the binder can walk `
        + `each group and read the series key from its datum. Alternatively, `
        + `pre-flatten your data to \`{ x, y, fill }\` before joining.`,
      );
    }

    // Pattern detection: if elements share a single parent whose datum
    // has a `.key` string, that parent is the d3.stack series group.
    // Suggest lifting it to `groupSelector`.
    const parents = new Set(elements.map(({ element }) => element.parentElement));
    if (parents.size === 1) {
      const parent = elements[0].element.parentElement;
      const parentDatum = parent ? (parent as { __data__?: unknown }).__data__ : undefined;
      if (
        parentDatum
        && typeof parentDatum === 'object'
        && 'key' in (parentDatum as Record<string, unknown>)
      ) {
        throw new Error(
          `All "${selector}" elements share a parent whose D3 datum has a `
          + `\`.key\` property — this is the d3.stack() shape. Pass a `
          + `\`groupSelector\` that matches the parent (e.g. "g.series") so `
          + `the binder can read each series key from the parent's datum.`,
        );
      }
    }

    // Infer accessors from the first segment's datum.
    const sampleDatum = elements[0].datum;
    const xAccessor = inferAccessor<string | number>(
      configRecord,
      'x',
      'x',
      ['category', 'label', 'name', 'key', 'date'],
      sampleDatum,
    );
    const yAccessor = inferAccessor<number | string>(
      configRecord,
      'y',
      'y',
      ['value', 'count', 'amount', 'total'],
      sampleDatum,
    );
    const fillAccessor = inferAccessor<string>(
      configRecord,
      'fill',
      'fill',
      ['group', 'series', 'category', 'z', 'color'],
      sampleDatum,
    );

    const groups = new Map<string, SegmentedPoint[]>();
    for (const { datum, index } of elements) {
      if (!datum) {
        throw buildNoDatumError(selector, index);
      }
      const point: SegmentedPoint = {
        x: resolveAccessor<string | number>(datum, xAccessor, index),
        y: resolveAccessor<number | string>(datum, yAccessor, index),
        z: resolveAccessor<string>(datum, fillAccessor, index),
      };
      if (!groups.has(point.z)) {
        groupOrder.push(point.z);
        groups.set(point.z, []);
      }
      groups.get(point.z)!.push(point);
    }
    for (const fill of groupOrder) {
      data.push(groups.get(fill)!);
    }

    // Detect DOM order from the first two rendered rects' fill values.
    // - Flat dodged join (`selectAll('rect.bar').data(flatArr)`): fills
    //   alternate by series each row ⇒ `[A, B, C, A, B, C, …]` (subject-major).
    // - Flat stacked-by-series join (`for (s of series) selectAll(`rect.${s.key}`)…`):
    //   all of series 0 first ⇒ `[E, E, …, W, W, …]` (series-major).
    // This catches both common patterns without requiring user config.
    if (elements.length >= 2) {
      const fill0 = String(resolveAccessor<string>(elements[0].datum, fillAccessor, 0));
      const fill1 = String(resolveAccessor<string>(elements[1].datum, fillAccessor, 1));
      detectedDomOrder = fill0 === fill1 ? 'series-major' : 'subject-major';
    }
  }

  const layerId = generateId();
  const selectorValue = groupSelector
    ? scopeSelector(svg, `${groupSelector} ${selector}`)
    : scopeSelector(svg, selector);

  // Resolve final DOM order: explicit user override wins; else detected value;
  // else fall back to the chart type (stacked/normalized render series-major,
  // dodged renders subject-major in the typical D3 patterns).
  const finalDomOrder: 'subject-major' | 'series-major' = domOrderOverride
    ?? detectedDomOrder
    ?? (type === TraceType.DODGED ? 'subject-major' : 'series-major');

  // Translate the semantic DOM order into the `domMapping` shape the model
  // consumes:
  // - series-major DOM ⇒ row-major iteration over `barValues` matches the DOM.
  // - subject-major DOM ⇒ column-major iteration, walking series top-to-bottom
  //   (`groupDirection: 'forward'`) matches the DOM.
  const domMapping = finalDomOrder === 'series-major'
    ? { order: 'row' as const }
    : { order: 'column' as const, groupDirection: 'forward' as const };

  const layer: MaidrLayer = {
    id: layerId,
    type,
    title,
    selectors: selectorValue,
    axes: buildAxes(axes, format),
    data,
    domMapping,
  };

  const maidr: Maidr = {
    id,
    title,
    subtitle,
    caption,
    subplots: [[{
      legend: groupOrder,
      layers: [layer],
    }]],
  };

  applyMaidrData(svg, maidr, autoApply);
  return { maidr, layer };
}
