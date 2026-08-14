/**
 * D3 binder for segmented bar charts (stacked, dodged, normalized, diverging
 * and mosaic).
 *
 * Extracts data from D3.js-rendered grouped/stacked bar chart SVG elements
 * and generates the MAIDR JSON schema for accessible interaction. All five
 * carry one category, one value and one series key per mark, which is why
 * they share a single extraction core and differ only in the type the layer
 * announces — the type is what makes a diverging chart read its values as
 * sides rather than as a stack. A mosaic adds one thing to the payload, the
 * column width, because on that chart alone the width is data.
 */

import type { MaidrLayer, MosaicPoint, SegmentedPoint } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3MosaicConfig, D3SegmentedConfig, DataAccessor, SegmentedTraceType } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

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
  return finalizeSingleChart(svg, config, buildSegmentedLayer(svg, config));
}

/**
 * Binds a D3.js diverging bar chart — a population pyramid, a Likert scale —
 * to MAIDR.
 *
 * A diverging chart is two series drawn back to back across a shared category
 * axis, which is the segmented extraction with a different reading: the sign
 * of a value is a **side**, not a magnitude, and the trace pitches the
 * magnitude while announcing the side.
 *
 * So emit the values **as the chart draws them** — the left-hand series
 * negative — and do not take their absolute value. Handed unsigned data the
 * trace has no way to tell the two sides apart, and the balance it reports
 * between them becomes a total instead of a comparison.
 *
 * A pyramid is usually drawn on its side. Pass
 * `orientation: Orientation.HORIZONTAL` (with `x` reading the signed value and
 * `y` the category) so the axes are announced the way it was drawn.
 *
 * @param svg - The SVG element containing the D3 diverging bar chart.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * bindD3Diverging(svgElement, {
 *   selector: 'rect.band',
 *   title: 'Population by Age Band',
 *   orientation: Orientation.HORIZONTAL,
 *   axes: { x: 'People, thousands', y: 'Age band', fill: 'Sex' },
 *   x: 'people',   // negative for the side drawn to the left
 *   y: 'band',
 *   fill: 'sex',
 * });
 * ```
 */
export function bindD3Diverging(svg: Element, config: D3SegmentedConfig): D3BinderResult {
  return finalizeSingleChart(
    svg,
    config,
    buildSegmentedLayer(svg, { ...config, type: TraceType.DIVERGING }),
  );
}

/**
 * Binds a D3.js mosaic (marimekko) plot to MAIDR.
 *
 * A mosaic is a stacked bar chart in which the **column widths also encode
 * data** — usually each category's share of all observations. That share is
 * the one thing this binder reads that the stacked one does not, and it is
 * worth supplying: a reader given only the segment heights has half the table,
 * so a category of six people and one of six hundred read identically.
 *
 * The width is read from the datum, never measured off the rendered `<rect>`.
 * A drawn width is a layout fact — padding, margins, the scale the columns
 * were laid out on — and turning it back into a proportion would announce a
 * number the data does not contain.
 *
 * `count` travels too when you have the contingency table the mosaic was drawn
 * from, since those counts are the numbers a reader would quote back.
 *
 * @param svg - The SVG element containing the D3 mosaic plot.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * bindD3Mosaic(svgElement, {
 *   selector: 'rect.cell',
 *   title: 'Survival by Passenger Class',
 *   axes: { x: 'Class', y: 'Proportion', fill: 'Outcome' },
 *   x: 'klass',
 *   y: 'share',
 *   fill: 'outcome',
 *   width: 'columnShare',
 *   count: 'n',
 * });
 * ```
 */
export function bindD3Mosaic(svg: Element, config: D3MosaicConfig): D3BinderResult {
  return finalizeSingleChart(
    svg,
    config,
    buildSegmentedLayer(svg, { ...config, type: TraceType.MOSAIC }),
  );
}

/**
 * The two accessors a mosaic reads on top of the segmented ones, or `null` for
 * the four chart types that carry neither.
 */
interface MosaicAccessors {
  width: DataAccessor<number>;
  count: DataAccessor<number>;
}

/**
 * Resolves the mosaic-only accessors, once, from a sample datum.
 *
 * Returns `null` for every other segmented type, so a stacked bar whose datum
 * happens to carry a `width` key does not pick up a column share it never
 * meant to declare.
 *
 * @param config - The user's config
 * @param type - The type the layer will announce
 * @param sampleDatum - First segment datum, for key inference
 * @returns The accessors, or `null` when the chart is not a mosaic
 */
function inferMosaicAccessors(
  config: D3MosaicConfig,
  type: SegmentedTraceType,
  sampleDatum: unknown,
): MosaicAccessors | null {
  if (type !== TraceType.MOSAIC) {
    return null;
  }
  return {
    width: inferAccessor<number>(
      config,
      'width',
      'width',
      ['share', 'proportion', 'marginal'],
      sampleDatum,
    ),
    count: inferAccessor<number>(
      config,
      'count',
      'count',
      ['n', 'freq', 'frequency'],
      sampleDatum,
    ),
  };
}

/**
 * Adds the column share and the cell count to a segment, where the datum
 * declares them.
 *
 * Both are optional and both are read optionally: a producer working from
 * proportions alone genuinely has no counts, and a cell missing its width is a
 * cell whose column declared one elsewhere — {@link MosaicTrace} reads the
 * width from whichever series of the column carries it. Non-finite values are
 * dropped rather than emitted, since `NaN` would be announced as a share.
 *
 * @param point - The segment built by the segmented extraction
 * @param datum - The segment's D3-bound datum
 * @param index - Position of the segment in its selection
 * @param mosaic - The mosaic accessors, or `null` for the other types
 * @returns The same point, with the mosaic fields set where they resolved
 */
function withMosaicFields(
  point: SegmentedPoint,
  datum: unknown,
  index: number,
  mosaic: MosaicAccessors | null,
): SegmentedPoint {
  if (mosaic === null) {
    return point;
  }
  const cell = point as MosaicPoint;
  const width = resolveAccessorOptional<number>(datum, mosaic.width, index);
  if (typeof width === 'number' && Number.isFinite(width)) {
    cell.width = width;
  }
  const count = resolveAccessorOptional<number>(datum, mosaic.count, index);
  if (typeof count === 'number' && Number.isFinite(count)) {
    cell.count = count;
  }
  return cell;
}

/**
 * Pure extraction core for segmented bar charts. See {@link buildBarLayer}
 * for the single-chart vs multi-panel contract.
 *
 * The config is typed as the superset {@link D3MosaicConfig}: the other four
 * types leave the mosaic-only accessors unset, and nothing extra is then read
 * or emitted.
 *
 * @internal
 */
export function buildSegmentedLayer(root: Element, config: D3MosaicConfig, panel?: D3PanelScope): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    groupSelector,
    type = TraceType.STACKED,
    orientation,
    domOrder: domOrderOverride,
  } = config;

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

    const groupElements = queryD3Elements(root, groupSelector);
    if (groupElements.length === 0) {
      throw buildNoElementsError(root, groupSelector, 'segmented-bar group');
    }

    // Sample the first group's first segment for accessor inference.
    const firstGroupSegments = queryD3Elements(groupElements[0].element, selector);
    const sampleDatum = firstGroupSegments[0]?.datum;
    const xAccessor = inferAccessor<string | number>(
      config,
      'x',
      'x',
      ['category', 'label', 'name', 'key', 'date'],
      sampleDatum,
    );
    const yAccessor = inferAccessor<number | string>(
      config,
      'y',
      'y',
      ['value', 'count', 'amount', 'total'],
      sampleDatum,
    );
    const fillAccessor = inferAccessor<string>(
      config,
      'fill',
      'fill',
      ['group', 'series', 'category', 'z', 'color'],
      sampleDatum,
    );
    const mosaic = inferMosaicAccessors(config, type, sampleDatum);

    for (const { element: groupEl, datum: groupDatum } of groupElements) {
      const segments = queryD3Elements(groupEl, selector);
      if (segments.length === 0)
        continue;

      // Derive fill from group datum's .key (d3.stack) or first segment
      const groupKey = (groupDatum as Record<string, unknown> | null)?.key as string | undefined;

      const groupPoints: SegmentedPoint[] = segments.map(({ datum, index }) => {
        if (datum === undefined || datum === null) {
          throw buildNoDatumError(selector, index);
        }
        const fillValue = groupKey ?? resolveAccessor<string>(datum, fillAccessor, index);
        return withMosaicFields({
          x: resolveAccessor<string | number>(datum, xAccessor, index),
          y: resolveAccessor<number | string>(datum, yAccessor, index),
          z: fillValue,
        }, datum, index, mosaic);
      });

      if (groupPoints.length > 0) {
        groupOrder.push(groupPoints[0].z);
        data.push(groupPoints);
      }
    }
  } else {
    // Flat structure: all segments in one container, grouped by fill value
    const elements = queryD3Elements(root, selector);
    if (elements.length === 0) {
      throw buildNoElementsError(root, selector, 'segmented bar');
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
      config,
      'x',
      'x',
      ['category', 'label', 'name', 'key', 'date'],
      sampleDatum,
    );
    const yAccessor = inferAccessor<number | string>(
      config,
      'y',
      'y',
      ['value', 'count', 'amount', 'total'],
      sampleDatum,
    );
    const fillAccessor = inferAccessor<string>(
      config,
      'fill',
      'fill',
      ['group', 'series', 'category', 'z', 'color'],
      sampleDatum,
    );
    const mosaic = inferMosaicAccessors(config, type, sampleDatum);

    const groups = new Map<string, SegmentedPoint[]>();
    for (const { datum, index } of elements) {
      if (datum === undefined || datum === null) {
        throw buildNoDatumError(selector, index);
      }
      const point: SegmentedPoint = withMosaicFields({
        x: resolveAccessor<string | number>(datum, xAccessor, index),
        y: resolveAccessor<number | string>(datum, yAccessor, index),
        z: resolveAccessor<string>(datum, fillAccessor, index),
      }, datum, index, mosaic);
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

  const selectorValue = groupSelector
    ? scopeSelector(root, `${groupSelector} ${selector}`, panel)
    : scopeSelector(root, selector, panel);

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
    id: generateId(),
    type,
    title,
    selectors: selectorValue,
    // Omitted when the caller did not declare one, so the core keeps applying
    // its own default rather than being told a value the chart never claimed.
    ...(orientation ? { orientation } : {}),
    axes: buildAxes(axes, format),
    data,
    domMapping,
  };

  return { layer, legend: groupOrder };
}
