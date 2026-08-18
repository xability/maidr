/**
 * D3 binder for line, bump and radar charts.
 *
 * Extracts data from D3.js-rendered line chart SVG elements and generates
 * the MAIDR JSON schema for accessible line chart interaction. A bump chart
 * plots ranks instead of magnitudes and a radar wraps its samples around a
 * circle, but both are drawn and navigated as a multi-line layer, so they
 * share this extraction core; the area family builds on it too (see
 * `binders/area.ts`).
 */

import type { LinePoint, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3LineConfig, DataAccessor, LineMarkTraceType } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector, selectorPrefix } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, getD3Datum, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

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
  // A declared step convention is what makes the chart a staircase rather than
  // a line -- the same rule the Victory adapter uses, since the extraction is
  // identical and only the reading differs: navigated by transition rather
  // than by sample, and described in terms of its runs.
  const type = config.stepDirection ? TraceType.STEP : TraceType.LINE;
  return finalizeSingleChart(svg, config, buildLineLayer(svg, config, undefined, type));
}

/**
 * Binds a D3.js bump chart (rank over time) to MAIDR.
 *
 * A bump chart is a multi-line layer whose y values are **ranks**: 1 is the
 * best position and the smallest number. The extraction is that of
 * {@link bindD3Line} — one `<path>` per competitor, `fill` naming it — and the
 * ranks you already bind are what `y` should read. The trace inverts the pitch
 * so first place is the highest note, and announces the places gained or lost
 * at each period, so nothing extra has to be computed here.
 *
 * A slope graph of *values* is a line chart with two samples, not this.
 *
 * @param svg - The SVG element containing the D3 bump chart.
 * @param config - Configuration specifying selectors and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * bindD3Bump(svgElement, {
 *   selector: 'path.rank-line',
 *   title: 'League Table by Round',
 *   axes: { x: 'Round', y: 'Rank', fill: 'Team' },
 *   x: 'round',
 *   y: 'rank',
 *   fill: 'team',
 * });
 * ```
 */
export function bindD3Bump(svg: Element, config: D3LineConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildLineLayer(svg, config, undefined, TraceType.BUMP));
}

/**
 * Binds a D3.js radar (spider) chart to MAIDR.
 *
 * A radar is a multi-line layer wrapped around a circle: `selector` matches one
 * closed `d3.lineRadial()` `<path>` per series, `x` names the **spoke** (the
 * variable) and `fill` names the series. The trace pans each spoke by its angle
 * — 12 o'clock centre, 3 o'clock hard right — so a radar sounds like a circle
 * rather than a row of bars, and nothing extra has to be computed here.
 *
 * A closed outline is usually drawn by repeating the first vertex at the end.
 * That repeat is how the polygon closes, not a spoke of its own, so the binder
 * drops a trailing sample whose `x` matches the first one — otherwise the chart
 * announces one spoke more than it has, and the reader walks off the end into
 * a duplicate.
 *
 * @param svg - The SVG element containing the D3 radar chart.
 * @param config - Configuration specifying selectors and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * bindD3Radar(svgElement, {
 *   selector: 'path.radar-area',
 *   title: 'Model Comparison',
 *   axes: { x: 'Attribute', y: 'Score', fill: 'Model' },
 *   x: 'attribute',
 *   y: 'score',
 *   fill: 'model',
 * });
 * ```
 */
export function bindD3Radar(svg: Element, config: D3LineConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildLineLayer(svg, config, undefined, TraceType.RADAR));
}

/**
 * Adds a chart-specific field to a point after the line core has read its
 * `x`, `y` and `z` from the same datum.
 *
 * A survival curve is a line whose samples also say whether the time was
 * censored and how wide the confidence band is there. Those live on the very
 * datum the core has just resolved, and the core is the only place that knows
 * which datum produced which point across all three of its extraction
 * patterns — so the extension point is here rather than a second pass that
 * would have to guess the pairing.
 *
 * @param point - The point the core built, to add fields to in place
 * @param datum - The datum it was read from
 * @param index - That datum's index within its selection
 *
 * @internal
 */
export type LinePointDecorator = (point: LinePoint, datum: unknown, index: number) => void;

/**
 * Samples a point-level datum the way {@link buildLineLayer} does, so a binder
 * layered on top of it can infer its own accessors from the same shape.
 *
 * @param root - The extraction root (the SVG, or a panel element)
 * @param config - The binder config, read for `selector` and `pointSelector`
 * @returns One point's datum, or `undefined` when none can be reached
 *
 * @internal
 */
export function sampleLineDatum(root: Element, config: D3LineConfig): unknown {
  if (config.pointSelector) {
    return queryD3Elements(root, config.pointSelector)[0]?.datum;
  }
  const pathDatum = queryD3Elements(root, config.selector)[0]?.datum;
  return Array.isArray(pathDatum) ? pathDatum[0] : pathDatum;
}

/**
 * Pure extraction core for line charts. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * The trailing `type` selects which chart the layer announces itself as; the
 * extraction is the same for all of them (see {@link LineMarkTraceType}).
 * `decorate`, when given, adds the fields a chart carries beyond a line's —
 * see {@link LinePointDecorator}.
 *
 * @internal
 */
export function buildLineLayer(
  root: Element,
  config: D3LineConfig,
  panel?: D3PanelScope,
  type: LineMarkTraceType = TraceType.LINE,
  decorate?: LinePointDecorator,
): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    pointSelector,
  } = config;

  const lineElements = queryD3Elements(root, selector);
  if (lineElements.length === 0) {
    throw buildNoElementsError(root, selector, 'line path');
  }

  // Infer accessors from a sample point-level datum when the user was silent.
  // When pointSelector is set, sample the first matching point; otherwise
  // the path's datum is typically an array of points — take its first item.
  let sampleDatum: unknown;
  if (pointSelector) {
    const samplePointEl = root.querySelector(pointSelector);
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
      lineElements.map(({ element }) => element.parentElement ?? root),
    );

    if (parents.size >= lineElements.length) {
      // Pattern A: distinct parents – scope point queries per parent
      for (const { element } of lineElements) {
        const parent = element.parentElement ?? root;
        const points = queryD3Elements(parent, pointSelector);
        const lineData = extractPointsFromElements(
          points,
          xAccessor,
          yAccessor,
          fillAccessor,
          pointSelector,
          decorate,
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
      const allPoints = queryD3Elements(root, pointSelector);
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
        decorate?.(point, datum, index);

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
        decorate?.(point, d, index);
        return point;
      });

      if (lineData.length > 0) {
        data.push(lineData);
        // This path's datum produced this row; pair them for a precise stamp.
        rowPaths.push(element);
      }
    }
  }

  // A closed radar outline repeats its first vertex to shut the polygon. That
  // repeat is geometry, not a spoke, so it goes before anything counts the
  // spokes: RadarTrace spaces its angles by the widest series' length, and one
  // phantom spoke rotates every announced position away from where it is drawn.
  if (type === TraceType.RADAR) {
    for (const row of data) {
      if (row.length > 1 && row[row.length - 1].x === row[0].x) {
        row.pop();
      }
    }
  }

  // A series whose `<path>` runs right to left was drawn from the far end, and
  // reading it as the datum lists it walks the chart backwards (#1044). Only
  // the drawing can say so here: the binders never see a scale, because the
  // caller passes selectors and accessors rather than `d3.scaleLinear()`. The
  // rendered `d` says it anyway, which is the move `drawsCategoriesReversed`
  // makes for Google Charts (#1040) — ask where the marks landed, not what the
  // author asked for.
  //
  // Excluded for RADAR, whose "x" is an angle around a circle rather than a
  // position along an axis. Its closed outline is not monotonic and would
  // decline on its own; naming it keeps that from being an accident.
  const reversed = type !== TraceType.RADAR && drawsRightToLeft(rowPaths, data);
  if (reversed) {
    for (const row of data) {
      row.reverse();
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

  // Emit selectors from the same rows that produced `data`: `rowPaths` is
  // parallel to it. See {@link stampSeriesSelectors} for why a bare selector
  // will not do.
  const selectorValue: string | string[] | undefined = lineElements.length > 1
    ? stampSeriesSelectors(root, selector, rowPaths, data.length, panel)
    // Exactly one path matched → a single scoped selector highlights it.
    : scopeSelector(root, selector, panel);

  const layer: MaidrLayer = {
    id: generateId(),
    type,
    title,
    selectors: selectorValue,
    // `d3.line()` emits its vertices in the array's order rather than sorting
    // them, so a turned-over payload needs the resolved elements turned over
    // too -- `LineTrace` does that on this word (#1026). The same holds for a
    // `pointSelector` bind, whose markers sit in the DOM in datum order.
    ...(reversed ? { domMapping: { pointOrder: 'reverse' as const } } : {}),
    // Declared rather than derived: `d3.curveStep*` leaves no trace in the
    // rendered path a reader could tell from a line whose samples happen to
    // land on a staircase, and the curve is the author's own choice. `StepTrace`
    // announces it; `AreaTrace` reads it to tell the risers of a stepped band
    // from its samples (#1066).
    ...(config.stepDirection ? { stepDirection: config.stepDirection } : {}),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer, legend };
}

/** The x of each vertex of a path's `d`, in the order it was written. */
function pathVertexXs(element: Element): number[] {
  const d = element.getAttribute('d') ?? '';
  const xs: number[] = [];
  for (const match of d.matchAll(/[ML]\s*(-?[\d.]+)[,\s]/g)) {
    const x = Number.parseFloat(match[1]);
    if (Number.isFinite(x)) {
      xs.push(x);
    }
  }
  return xs;
}

/**
 * Whether a run of coordinates never goes back on itself, and which way it ran.
 *
 * Non-strict on purpose: a staircase repeats an x at every tread, and a
 * survival curve is a staircase. What is rejected is a run that turns around
 * -- a connected scatter or a loop -- because neither end of it is the order
 * the chart was drawn in.
 *
 * @param xs - The coordinates, in the order they were written
 * @returns `'asc'`, `'desc'`, or null when the run is flat or doubles back
 */
function runDirection(xs: readonly number[]): 'asc' | 'desc' | null {
  if (xs.length < 2) {
    return null;
  }
  let rising = false;
  let falling = false;
  for (let at = 1; at < xs.length; at++) {
    if (xs[at] > xs[at - 1])
      rising = true;
    if (xs[at] < xs[at - 1])
      falling = true;
  }
  if (rising === falling) {
    return null;
  }
  return rising ? 'asc' : 'desc';
}

/**
 * Whether every series of this layer was drawn from the right-hand end.
 *
 * Each row is asked of its own `<path>`, and they all have to agree: one
 * series descending while another ascends is not a reversed axis, and turning
 * only one over would put two series' column `c` at opposite ends of the
 * chart. A row whose path could not be identified leaves the question
 * unanswerable, so the layer keeps the order it arrived in.
 *
 * Only the leading vertices are read -- as many as the row has points. An
 * `d3.area()` path runs out along the top edge and back along the baseline,
 * so the whole list doubles back while the part that matters does not; and
 * `LineTrace.reconcilePathCoordinates` drops the surplus from the end, so
 * these are exactly the vertices the highlight will be built from.
 *
 * @param rowPaths - The `<path>` that produced each row, parallel to `data`
 * @param data - The rows the layer is emitting
 * @returns Whether every series runs right to left
 */
function drawsRightToLeft(
  rowPaths: readonly (Element | null)[],
  data: readonly LinePoint[][],
): boolean {
  if (data.length === 0 || rowPaths.length !== data.length) {
    return false;
  }
  for (let row = 0; row < data.length; row++) {
    const path = rowPaths[row];
    if (!path) {
      return false;
    }
    const xs = pathVertexXs(path).slice(0, data[row].length);
    if (runDirection(xs) !== 'desc') {
      return false;
    }
  }
  return true;
}

/**
 * Emits one highlight selector per series, by stamping each series' `<path>`
 * with a MAIDR-owned `data-maidr-line-index` attribute and pinning it.
 *
 * `LineTrace.mapToSvgElements` requires one selector per line (it uses
 * `Svg.selectElement(selectors[r])` to grab a single `<path>` per series for
 * path-parsing, or `selectAllElements(selectors[r])` for per-point markers).
 * A bare `selector` like `"path.line"` matches ALL line paths at once, so
 * `selectors.length (1) !== lineValues.length (N)` → the model bails out and
 * no highlight renders.
 *
 * Structural selectors (e.g. `:nth-child(N)`) are fragile to DOM reordering
 * (legend/axis insertions, React re-renders, non-path siblings shifting
 * nth-child indices), so the stamp is an attribute the binder owns, absolutely
 * scoped by the SVG's id. This matches the Google Charts adapter's
 * `data-maidr-line-series` / `data-maidr-point` convention and survives any
 * DOM reordering that leaves the path itself intact.
 *
 * @param root      - The extraction root (the SVG, or a panel element).
 * @param selector  - The user-provided selector matching the series paths.
 * @param rowPaths  - The `<path>` that produced each data row, parallel to the
 *                    emitted rows. A `null` entry marks a row whose rendering
 *                    path could not be reliably identified.
 * @param rowCount  - How many rows the layer emits.
 * @param panel     - Optional panel scope for multi-panel binds.
 * @returns One selector per row, or `undefined` when a safe per-series
 *          selector cannot be emitted — the model then withdraws highlighting
 *          instead of highlighting the wrong series.
 *
 * @internal
 */
export function stampSeriesSelectors(
  root: Element,
  selector: string,
  rowPaths: (Element | null)[],
  rowCount: number,
  panel?: D3PanelScope,
): string[] | undefined {
  if (rowPaths.length !== rowCount) {
    return undefined;
  }
  const paths: Element[] = [];
  for (const element of rowPaths) {
    if (element === null) {
      return undefined;
    }
    paths.push(element);
  }

  // `selectorPrefix` auto-assigns an id when the container lacks one,
  // mirroring `scopeSelector`'s behaviour, and appends the `data-maidr-panel`
  // segment on multi-panel binds.
  const prefix = selectorPrefix(root, panel);
  return paths.map((element, rowIndex) => {
    // Clear any prior stamp so rebinding after a D3 data update produces a
    // clean, deterministic state.
    element.removeAttribute('data-maidr-line-index');
    element.setAttribute('data-maidr-line-index', String(rowIndex));
    return `${prefix} ${selector}[data-maidr-line-index="${rowIndex}"]`;
  });
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
  decorate?: LinePointDecorator,
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
    decorate?.(point, datum, index);
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
