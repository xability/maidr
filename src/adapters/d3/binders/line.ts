/**
 * D3 binder for line charts.
 *
 * Extracts data from D3.js-rendered line chart SVG elements and generates
 * the MAIDR JSON schema for accessible line chart interaction.
 */

import type { LinePoint, Maidr, MaidrLayer } from '../../../type/grammar';
import type { D3BinderResult, D3LineConfig, DataAccessor } from '../types';
import { TraceType } from '../../../type/grammar';
import { cssEscape, ensureContainerId, scopeSelector } from '../selectors';
import { applyMaidrData, buildAxes, buildNoDatumError, buildNoElementsError, generateId, getD3Datum, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

/**
 * Binds a D3.js line chart to MAIDR, generating the accessible data representation.
 *
 * Supports both single-line and multi-line charts. Data can be extracted from:
 * 1. D3-bound data on point elements (circles, etc.) via `pointSelector`.
 *    When using `pointSelector`, each line path and its associated points
 *    must share the same parent `<g>` group element for correct scoping.
 * 2. D3-bound data on the path elements themselves (array of points per path).
 *
 * @remarks
 * **Timing — call after D3 has rendered.** This function reads each matched
 * element's D3-bound `__data__`: an array of points per line path, or
 * individual point data when `pointSelector` is set. Calling it before
 * `.data().join()` has run (or before the SVG is mounted) throws "No
 * elements found for selector …" or "Property '…' not found on datum".
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
 * @param svg - The SVG element containing the D3 line chart.
 * @param config - Configuration specifying selectors and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * // Multi-line chart with paths and point circles
 * const result = bindD3Line(svgElement, {
 *   selector: 'path.line',
 *   pointSelector: 'circle.data-point',
 *   title: 'Temperature Over Time',
 *   axes: { x: 'Month', y: 'Temperature (F)' },
 *   x: 'month',
 *   y: 'temp',
 *   fill: 'city',
 * });
 * ```
 */
export function bindD3Line(svg: Element, config: D3LineConfig): D3BinderResult {
  const {
    id = generateId(),
    title,
    subtitle,
    caption,
    axes,
    format,
    selector,
    pointSelector,
    autoApply,
  } = config;

  const lineElements = queryD3Elements(svg, selector);
  if (lineElements.length === 0) {
    throw buildNoElementsError(svg, selector, 'line path');
  }

  // Infer accessors from a sample point-level datum when the user was silent.
  // When pointSelector is set, sample the first matching point; otherwise
  // the path's datum is typically an array of points — take its first item.
  let sampleDatum: unknown;
  if (pointSelector) {
    const samplePointEl = svg.querySelector(pointSelector);
    sampleDatum = samplePointEl ? getD3Datum(samplePointEl) : undefined;
  } else {
    const pathDatum = lineElements[0].datum;
    sampleDatum = Array.isArray(pathDatum) ? pathDatum[0] : pathDatum;
  }
  const xAccessor = inferAccessor<number | string>(
    config,
    'x',
    'x',
    ['category', 'label', 'name', 'date', 'time'],
    sampleDatum,
  );
  const yAccessor = inferAccessor<number>(
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

  const data: LinePoint[][] = [];
  // Tracks the `<path>` element that produced each data row (parallel to
  // `data`). `null` marks a row whose rendering path could not be reliably
  // identified, so the emitted selectors degrade to no-highlight instead of
  // mis-highlighting a different series.
  const rowPaths: (Element | null)[] = [];

  if (pointSelector) {
    // Determine whether line paths have distinct parent elements.
    // Pattern A: Each <path> lives in its own <g> with its <circle> points.
    // Pattern B: All <path>s and <circle>s share a single parent <g>.
    const parents = new Set(
      lineElements.map(({ element }) => element.parentElement ?? svg),
    );

    if (parents.size >= lineElements.length) {
      // Pattern A: distinct parents – scope point queries per parent
      for (const { element } of lineElements) {
        const parent = element.parentElement ?? svg;
        const points = queryD3Elements(parent, pointSelector);
        const lineData = extractPointsFromElements(
          points,
          xAccessor,
          yAccessor,
          fillAccessor,
          pointSelector,
        );
        if (lineData.length > 0) {
          data.push(lineData);
          // This path contributed this row; pair them so the emitted selector
          // targets exactly this line even if other paths are dropped.
          rowPaths.push(element);
        }
      }
    } else {
      // Pattern B: shared parent – query all points once and group by fill
      const allPoints = queryD3Elements(svg, pointSelector);
      if (allPoints.length === 0) {
        throw new Error(
          `No point elements found for selector "${pointSelector}" within the SVG.`,
        );
      }

      const lineMap = new Map<string, LinePoint[]>();
      const lineOrder: string[] = [];

      for (const { datum, index } of allPoints) {
        if (datum === undefined || datum === null) {
          throw buildNoDatumError(pointSelector, index);
        }
        const point: LinePoint = {
          x: resolveAccessor<number | string>(datum, xAccessor, index),
          y: resolveAccessor<number>(datum, yAccessor, index),
        };
        const fill = resolveAccessorOptional<string>(datum, fillAccessor, index);
        if (fill !== undefined) {
          point.z = fill;
        }

        const key = fill ?? '__default__';
        if (!lineMap.has(key)) {
          lineOrder.push(key);
          lineMap.set(key, []);
        }
        lineMap.get(key)!.push(point);
      }

      for (const key of lineOrder) {
        data.push(lineMap.get(key)!);
      }

      // Map each fill group (data row) back to the `<path>` that renders it so
      // per-series highlighting targets the correct line. Trusted only when
      // every group resolves to a distinct path via the path's own bound fill;
      // otherwise all rows are `null` and highlighting degrades gracefully.
      for (const path of resolvePatternBPaths(lineElements, lineOrder, fillAccessor)) {
        rowPaths.push(path);
      }
    }
  } else {
    // Extract data from the path element's bound data directly
    // D3 line charts typically bind an array of points to each path
    for (const { element, datum } of lineElements) {
      if (datum === undefined || datum === null) {
        throw new Error(
          `No D3 data bound to line path element. `
          + `Ensure D3's .data() join has been applied to the "${selector}" elements, `
          + `or provide a pointSelector.`,
        );
      }

      const pointArray = Array.isArray(datum) ? datum : [datum];
      const lineData: LinePoint[] = pointArray.map((d: unknown, index: number) => {
        const point: LinePoint = {
          x: resolveAccessor<number | string>(d, xAccessor, index),
          y: resolveAccessor<number>(d, yAccessor, index),
        };
        const fill = resolveAccessorOptional<string>(d, fillAccessor, index);
        if (fill !== undefined) {
          point.z = fill;
        }
        return point;
      });

      if (lineData.length > 0) {
        data.push(lineData);
        // This path's datum produced this row; pair them for a precise stamp.
        rowPaths.push(element);
      }
    }
  }

  // Extract legend labels from fill values (stored as `z` on each LinePoint)
  const legend: string[] = [];
  for (const lineData of data) {
    const fill = lineData[0]?.z;
    if (fill) {
      legend.push(fill);
    }
  }

  const layerId = generateId();

  // Ensure the SVG has a stable id so we can emit absolutely-scoped selectors
  // (the model resolves selectors via global `document.querySelector`, so they
  // MUST be unique page-wide). `ensureContainerId` auto-assigns an id when
  // the user-supplied SVG lacks one, mirroring `scopeSelector`'s behaviour.
  const svgId = ensureContainerId(svg);

  // LineTrace's `mapToSvgElements` requires one selector per line (it uses
  // `Svg.selectElement(selectors[r])` to grab a single <path> per series for
  // path-parsing, or `selectAllElements(selectors[r])` for per-point markers).
  // A bare `selector` like `"path.line"` matches ALL line paths at once, so
  // `selectors.length (1) !== lineValues.length (N)` → the model bails out
  // and no highlight renders.
  //
  // Structural selectors (e.g. `:nth-child(N)`) are fragile to DOM reordering
  // (legend/axis insertions, React re-renders, non-path siblings shifting
  // nth-child indices). Instead, stamp a MAIDR-owned `data-maidr-line-index`
  // attribute on each line path at bind time and emit selectors that pin
  // that attribute, absolutely scoped by the SVG's id. This matches the
  // Google Charts adapter's `data-maidr-line-series` / `data-maidr-point`
  // convention and survives any DOM reordering that leaves the path itself
  // intact.
  // Emit selectors from the same rows that produced `data`. `rowPaths` is
  // parallel to `data`, so stamping each path with its row index guarantees
  // `selectors.length === data.length` — even when some paths were dropped
  // (empty series) or the path↔series mapping was ambiguous. When any surviving
  // row lacks an identified path, we cannot emit a safe per-series selector, so
  // degrade to no-highlight (`undefined`) instead of mis-highlighting.
  //
  // Stamp a MAIDR-owned `data-maidr-line-index` attribute (absolutely scoped by
  // the SVG's id) rather than a structural `:nth-child` selector, which is
  // fragile to DOM reordering. This matches the Google Charts adapter's
  // `data-maidr-line-series` convention and survives any reordering that leaves
  // the path itself intact.
  let selectorValue: string | string[] | undefined;
  if (lineElements.length > 1) {
    if (rowPaths.length === data.length && rowPaths.every(el => el !== null)) {
      selectorValue = rowPaths.map((element, rowIndex) => {
        // Clear any prior stamp so rebinding after a D3 data update produces
        // a clean, deterministic state.
        element!.removeAttribute('data-maidr-line-index');
        element!.setAttribute('data-maidr-line-index', String(rowIndex));
        return `#${cssEscape(svgId)} ${selector}[data-maidr-line-index="${rowIndex}"]`;
      });
    } else {
      selectorValue = undefined;
    }
  } else {
    // Exactly one path matched → a single scoped selector highlights it.
    selectorValue = scopeSelector(svg, selector);
  }
  const layer: MaidrLayer = {
    id: layerId,
    type: TraceType.LINE,
    title,
    selectors: selectorValue,
    axes: buildAxes(axes, format),
    data,
  };

  const maidr: Maidr = {
    id,
    title,
    subtitle,
    caption,
    subplots: [[{
      ...(legend.length > 0 ? { legend } : {}),
      layers: [layer],
    }]],
  };

  applyMaidrData(svg, maidr, autoApply);
  return { maidr, layer };
}

/**
 * Extracts LinePoint data from a set of queried D3 elements.
 */
function extractPointsFromElements(
  points: { element: Element; datum: unknown; index: number }[],
  xAccessor: DataAccessor<number | string>,
  yAccessor: DataAccessor<number>,
  fillAccessor: DataAccessor<string>,
  pointSelector: string,
): LinePoint[] {
  const lineData: LinePoint[] = [];
  for (const { datum, index } of points) {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(pointSelector, index);
    }
    const point: LinePoint = {
      x: resolveAccessor<number | string>(datum, xAccessor, index),
      y: resolveAccessor<number>(datum, yAccessor, index),
    };
    const fill = resolveAccessorOptional<string>(datum, fillAccessor, index);
    if (fill !== undefined) {
      point.z = fill;
    }
    lineData.push(point);
  }
  return lineData;
}

/**
 * Resolves the `<path>` element that renders each fill group in Pattern B
 * (shared-parent multi-line charts), keyed to the group order in `lineOrder`.
 *
 * Correspondence is trusted only when the path count equals the group count
 * AND every group maps to a distinct path via that path's own D3-bound fill
 * (its datum, or the first item when the datum is an array of points). When it
 * cannot be established, an all-`null` array is returned so the caller degrades
 * to no-highlight rather than mis-highlighting a different series.
 *
 * @param lineElements - The queried line `<path>` elements with their D3 data.
 * @param lineOrder    - Fill-group keys in the order rows were pushed to `data`.
 * @param fillAccessor - Accessor used to read a datum's fill/series key.
 * @returns One entry per group (parallel to `lineOrder`): the matching path, or
 *          `null` for every group when the mapping is ambiguous.
 */
function resolvePatternBPaths(
  lineElements: { element: Element; datum: unknown; index: number }[],
  lineOrder: string[],
  fillAccessor: DataAccessor<string>,
): (Element | null)[] {
  const unresolved: (Element | null)[] = lineOrder.map(() => null);
  if (lineElements.length !== lineOrder.length) {
    return unresolved;
  }

  const pathByFill = new Map<string, Element>();
  for (const { element, datum } of lineElements) {
    const sample = Array.isArray(datum) ? datum[0] : datum;
    let key = '__default__';
    if (sample !== undefined && sample !== null && typeof sample === 'object') {
      const fill = resolveAccessorOptional<string>(sample, fillAccessor, 0);
      if (fill !== undefined) {
        key = fill;
      }
    }
    if (!pathByFill.has(key)) {
      pathByFill.set(key, element);
    }
  }

  const matched: (Element | null)[] = lineOrder.map(key => pathByFill.get(key) ?? null);
  const allResolved = matched.every(el => el !== null);
  const allDistinct = new Set(matched).size === matched.length;
  return allResolved && allDistinct ? matched : unresolved;
}
