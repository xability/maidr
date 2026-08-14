/**
 * D3 binder for scatter, Manhattan and volcano plots.
 *
 * Extracts data from D3.js-rendered point elements and generates the MAIDR
 * JSON schema for accessible interaction. A Manhattan plot is a scatter with
 * two extra things a reader cannot see without them — what each point *is* and
 * which chromosome it sits on — and a volcano is that same reading with an
 * effect size on the x axis, so all three are built by the same extraction core
 * and differ only in the type the layer announces and in the accessors the
 * caller supplies.
 */

import type { MaidrLayer, VolcanoPoint } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3ManhattanConfig, D3ScatterConfig, D3VolcanoConfig, ScatterMarkTraceType } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

/**
 * Binds a D3.js scatter plot to MAIDR, generating the accessible data representation.
 *
 * Extracts x/y data from D3-bound SVG point elements (`<circle>`, `<use>`, etc.)
 * and produces a complete {@link Maidr} data structure.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** This function reads each matched
 * element's D3-bound `__data__`: the numeric x/y bound to each point element.
 * Calling it before `.data().join()` has run (or before the SVG is mounted)
 * throws "No elements found for selector …" or "Property '…' not found on
 * datum".
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
 * @param svg - The SVG element containing the D3 scatter plot.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Scatter(svgElement, {
 *   selector: 'circle.dot',
 *   title: 'Height vs Weight',
 *   axes: { x: 'Height (cm)', y: 'Weight (kg)' },
 *   x: 'height',
 *   y: 'weight',
 * });
 * ```
 */
export function bindD3Scatter(svg: Element, config: D3ScatterConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildScatterLayer(svg, config));
}

/**
 * Binds a D3.js Manhattan plot to MAIDR.
 *
 * A Manhattan plot is a scatter of `-log10(p)` against genomic position, drawn
 * with tens of thousands of points of which a few dozen matter. The question a
 * reader asks it is never "what is at this coordinate" — it is "which points
 * cross the line, and what are they called", so the two accessors that answer
 * that (`label`, `group`) and the `significance` cutoff are what this binder
 * adds to {@link bindD3Scatter}.
 *
 * All three are optional, and the chart still reads without them: the trace
 * simply reports no findings when no cutoff was declared, rather than guessing
 * one. It is worth supplying them — the cutoff is the whole reason the chart
 * was drawn, and it is written nowhere a screen reader can reach.
 *
 * @param svg - The SVG element containing the D3 Manhattan plot.
 * @param config - Configuration specifying the selector, accessors and cutoff.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * bindD3Manhattan(svgElement, {
 *   selector: 'circle.snp',
 *   title: 'Genome-wide Association',
 *   axes: { x: 'Position', y: '-log10(p)', fill: 'Chromosome' },
 *   x: 'pos',
 *   y: 'logP',
 *   label: 'snp',
 *   group: 'chromosome',
 *   significance: 7.3,
 * });
 * ```
 */
export function bindD3Manhattan(svg: Element, config: D3ManhattanConfig): D3BinderResult {
  return finalizeSingleChart(
    svg,
    config,
    buildScatterLayer(svg, config, undefined, TraceType.MANHATTAN),
  );
}

/**
 * Binds a D3.js volcano plot to MAIDR.
 *
 * A volcano plots effect size against significance, and is read exactly as a
 * Manhattan plot is: which points clear the line, and what they are called.
 * The difference is that it has **two** lines — a gene matters when its change
 * is both large and significant — so `effect` joins `significance`.
 *
 * Supply `label`. On a volcano the gene name is the payload: a reader told
 * "x is 2.3, y is 14.1" has been given the two numbers whose shape they can
 * already hear, and withheld the one thing they came for. The binder warns
 * when no label resolves rather than failing, since the chart still reads
 * without it.
 *
 * @param svg - The SVG element containing the D3 volcano plot.
 * @param config - Configuration specifying the selector, accessors and cutoffs.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * bindD3Volcano(svgElement, {
 *   selector: 'circle.gene',
 *   title: 'Differential Expression',
 *   axes: { x: 'log2 fold change', y: '-log10(p)' },
 *   x: 'lfc',
 *   y: 'logP',
 *   label: 'gene',
 *   significance: 1.3,
 *   effect: 1,
 * });
 * ```
 */
export function bindD3Volcano(svg: Element, config: D3VolcanoConfig): D3BinderResult {
  return finalizeSingleChart(
    svg,
    config,
    buildScatterLayer(svg, config, undefined, TraceType.VOLCANO),
  );
}

/**
 * Pure extraction core for scatter, Manhattan and volcano plots. See
 * {@link buildBarLayer} for the single-chart vs multi-panel contract.
 *
 * The config is typed as the superset {@link D3VolcanoConfig}: a plain scatter
 * leaves the threshold accessors unset, and nothing extra is then read or
 * emitted.
 *
 * @internal
 */
export function buildScatterLayer(
  root: Element,
  config: D3VolcanoConfig,
  panel?: D3PanelScope,
  type: ScatterMarkTraceType = TraceType.SCATTER,
): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    significance,
    significanceDirection,
    effect,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'scatter point');
  }

  // Infer accessors from the first datum's keys when the user did not specify.
  const firstDatum = elements[0].datum;
  const xAccessor = inferAccessor<number>(
    config,
    'x',
    'x',
    ['xVal', 'xValue', 'x_val', 'xCoord'],
    firstDatum,
  );
  const yAccessor = inferAccessor<number>(
    config,
    'y',
    'y',
    ['yVal', 'yValue', 'y_val', 'yCoord', 'value'],
    firstDatum,
  );

  // Threshold plots only: a plain scatter carries neither, so nothing extra is
  // read or emitted for it. Both are read optionally even here — a point whose
  // datum names no SNP is still a point, and dropping it for want of a label
  // would lose the reading the chart was drawn for.
  const identity = type === TraceType.SCATTER
    ? null
    : {
        label: inferAccessor<string>(
          config,
          'label',
          'label',
          ['snp', 'gene', 'symbol', 'id', 'name', 'probe'],
          firstDatum,
        ),
        group: inferAccessor<string>(
          config,
          'group',
          'group',
          ['chromosome', 'chrom', 'chr', 'regulation', 'direction', 'region'],
          firstDatum,
        ),
      };

  const data: VolcanoPoint[] = elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }
    const point: VolcanoPoint = {
      x: resolveAccessor<number>(datum, xAccessor, index),
      y: resolveAccessor<number>(datum, yAccessor, index),
    };
    if (identity === null) {
      return point;
    }
    const label = resolveAccessorOptional<string>(datum, identity.label, index);
    if (label !== undefined && label !== null) {
      point.label = String(label);
    }
    const group = resolveAccessorOptional<string>(datum, identity.group, index);
    if (group !== undefined && group !== null) {
      point.group = String(group);
    }
    return point;
  });

  // A volcano is read by gene name, so say so when none resolved. It is a
  // warning rather than an error: the chart still reads as a scatter with a
  // cutoff, and refusing to bind would leave the reader with nothing at all.
  if (type === TraceType.VOLCANO && !data.some(point => point.label !== undefined)) {
    console.warn(
      `[maidr/d3] No label resolved for any point of the volcano plot matched `
      + `by "${selector}". The gene name is what a volcano is read for — pass `
      + `a \`label\` accessor naming the property that carries it.`,
    );
  }

  const layer: MaidrLayer = {
    id: generateId(),
    type,
    title,
    selectors: scopeSelector(root, selector, panel),
    axes: buildAxes(axes, format),
    data,
  };

  // Only when the caller declared a cutoff. There is no default: these charts
  // are drawn on transformed axes whose conventions differ by field, and a
  // guessed line would sort every point onto the wrong side silently.
  if (significance !== undefined || significanceDirection !== undefined || effect !== undefined) {
    layer.thresholdOptions = {
      ...(significance !== undefined ? { significance } : {}),
      ...(significanceDirection !== undefined ? { significanceDirection } : {}),
      ...(effect !== undefined ? { effect } : {}),
    };
  }

  return { layer };
}
