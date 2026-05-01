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
    }
  } else {
    // Extract data from the path element's bound data directly
    // D3 line charts typically bind an array of points to each path
    for (const { datum } of lineElements) {
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
  const selectorValue: string | string[] = data.length > 1
    ? lineElements.map(({ element }, lineIndex) => {
        // Clear any prior stamp so rebinding after a D3 data update produces
        // a clean, deterministic state.
        element.removeAttribute('data-maidr-line-index');
        element.setAttribute('data-maidr-line-index', String(lineIndex));
        return `#${cssEscape(svgId)} ${selector}[data-maidr-line-index="${lineIndex}"]`;
      })
    : scopeSelector(svg, selector);
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
