/**
 * D3 binder for error-bar (point-range) and forest charts.
 *
 * Extracts data from D3.js-rendered estimate groups — the `<line>` plus marker
 * a confidence interval is drawn from — and generates the MAIDR JSON schema
 * for accessible interaction.
 *
 * A forest plot is that chart with three things added: how much each study
 * weighs, which row is the pooled summary, and where the null line sits. All
 * three are read off the same groups, so one core builds both.
 */

import type { ForestPoint, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3ErrorBarConfig, D3ForestConfig, DataAccessor } from '../types';
import { Orientation, TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

/**
 * Reads an interval bound, keeping only a usable number.
 *
 * The bounds are optional and independently so — a one-sided interval is a
 * real chart, and a datum that carries no bound at all is an estimate drawn
 * without one. Anything that is not a finite number is therefore dropped
 * rather than emitted: a `NaN` bound would be announced as a bound, and the
 * reader has no way to tell it from a measured one.
 *
 * @param datum - The datum bound to the estimate's element.
 * @param accessor - The bound's accessor.
 * @param index - The estimate's index, for accessor functions.
 * @returns The bound, or undefined when the chart does not draw one.
 */
function readBound(
  datum: unknown,
  accessor: DataAccessor<number>,
  index: number,
): number | undefined {
  const value = resolveAccessorOptional<number>(datum, accessor, index);
  const numeric = Number(value);
  return value === undefined || value === null || Number.isNaN(numeric)
    ? undefined
    : numeric;
}

/**
 * Binds a D3.js error-bar chart to MAIDR, generating the accessible data
 * representation.
 *
 * Point `selector` at one element per estimate — the canonical D3 idiom is a
 * `<g>` holding the interval's `<line>` and the estimate's marker, and that
 * group is what the reader's cursor should highlight.
 *
 * **The bounds are absolute positions on the value axis, not half-widths.**
 * Producers disagree about which they hand out, so the grammar fixes one and
 * each adapter converts. The binder cannot tell an offset from a bound by
 * looking at it, so a datum carrying `±se` needs a function accessor:
 * `yMin: d => d.mean - 1.96 * d.se`.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** Like every D3 binder, this reads
 * each matched element's D3-bound `__data__`; calling it before
 * `.data().join()` has run (or before the SVG is mounted) throws "No elements
 * found for selector …" or "Property '…' not found on datum".
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
 *
 * @param svg - The SVG element containing the D3 error-bar chart.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3ErrorBar(svgElement, {
 *   selector: 'g.estimate',
 *   title: 'Mean Response by Dose',
 *   axes: { x: 'Group', y: 'Response' },
 *   x: 'group',
 *   y: 'mean',
 *   yMin: 'ciLow',
 *   yMax: 'ciHigh',
 * });
 * ```
 */
export function bindD3ErrorBar(svg: Element, config: D3ErrorBarConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildErrorBarLayer(svg, config));
}

/**
 * Binds a D3.js forest plot to MAIDR, generating the accessible data
 * representation.
 *
 * A forest plot is a point-range chart of studies against a shared null line,
 * so `selector` matches one element per study exactly as
 * {@link bindD3ErrorBar}'s does, and the bounds are the same absolute positions
 * on the value axis.
 *
 * Three things make it a forest plot rather than an error bar, and each is what
 * a sighted reader takes from the drawing:
 *
 * - **`nullValue`** — the line at 1 (a ratio) or 0 (a difference). Whether a
 *   study's interval crosses it *is the result for that study*, and the trace
 *   announces the crossing. Without it, no claim about significance is made:
 *   there is no default, because a ratio chart guessed at 0 would report every
 *   study as not crossing.
 * - **`weight`** — the marker area, which is a magnitude a reader is otherwise
 *   never told; two studies whose intervals look alike can contribute wholly
 *   differently to the result.
 * - **`pooledSelector`** — the diamond at the bottom. It is drawn as a
 *   different mark from the studies, so it is selected separately and appended
 *   after them; it is not evidence, it is what the evidence came to, and
 *   announcing it as one more study invites a reader to count it among them.
 *
 * @param svg - The SVG element containing the D3 forest plot.
 * @param config - Configuration specifying the selectors and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * bindD3Forest(svgElement, {
 *   selector: 'g.study',
 *   pooledSelector: 'path.pooled',
 *   title: 'Effect of the Intervention',
 *   orientation: Orientation.HORIZONTAL,
 *   axes: { x: 'Odds ratio', y: 'Study' },
 *   x: 'study',
 *   y: 'or',
 *   yMin: 'ciLow',
 *   yMax: 'ciHigh',
 *   weight: 'weight',
 *   nullValue: 1,
 * });
 * ```
 */
export function bindD3Forest(svg: Element, config: D3ForestConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildForestLayer(svg, config));
}

/**
 * Pure extraction core for error-bar charts. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildErrorBarLayer(root: Element, config: D3ErrorBarConfig, panel?: D3PanelScope): D3BuiltLayer {
  return buildIntervalLayer(root, config, panel, TraceType.ERROR_BAR);
}

/**
 * Pure extraction core for forest plots. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildForestLayer(root: Element, config: D3ForestConfig, panel?: D3PanelScope): D3BuiltLayer {
  return buildIntervalLayer(root, config, panel, TraceType.FOREST);
}

/**
 * Builds an error-bar or forest layer from the estimate groups a chart drew.
 *
 * The forest-only fields are read only when the layer is a forest, so an error
 * bar chart whose datum happens to carry a `weight` key is not silently given
 * one.
 *
 * @param root - The extraction root (the SVG, or a panel element)
 * @param config - The user's config; the forest fields are ignored for an
 *                 error-bar layer
 * @param panel - Optional panel scope for multi-panel binds
 * @param type - Which of the two the layer announces itself as
 * @returns The extracted layer
 */
function buildIntervalLayer(
  root: Element,
  config: D3ForestConfig,
  panel: D3PanelScope | undefined,
  type: typeof TraceType.ERROR_BAR | typeof TraceType.FOREST,
): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    pooledSelector,
    nullValue,
    orientation = Orientation.VERTICAL,
  } = config;

  const isForest = type === TraceType.FOREST;

  const estimates = queryD3Elements(root, selector);
  if (estimates.length === 0) {
    throw buildNoElementsError(root, selector, isForest ? 'forest study' : 'error-bar estimate');
  }

  // The pooled summary, when it is drawn as its own mark. Its rows follow the
  // studies, which is both the order the chart draws them in and the order the
  // selector list has to be in for the highlight to land on the right row.
  const pooledElements = isForest && pooledSelector !== undefined
    ? queryD3Elements(root, pooledSelector)
    : [];
  if (isForest && pooledSelector !== undefined && pooledElements.length === 0) {
    throw buildNoElementsError(root, pooledSelector, 'pooled summary');
  }

  // Two selectors matching one element would emit that row twice — announced
  // once as a study and once as the summary — and the doubled selector list
  // would still have the same length as the doubled payload, so nothing
  // downstream could notice. Said here instead, where it is fixable.
  const overlap = pooledElements.filter(
    pooledEntry => estimates.some(estimate => estimate.element === pooledEntry.element),
  ).length;
  if (overlap > 0) {
    throw new Error(
      `The pooled selector "${pooledSelector}" also matches ${overlap} of the `
      + `${estimates.length} elements matched by "${selector}", so those rows `
      + `would be emitted twice — once as a study and once as the summary. `
      + `Narrow one of the two, e.g. \`selector: '${selector}:not(.pooled)'\`.`,
    );
  }

  const elements = [
    ...estimates.map(entry => ({ ...entry, isPooledMark: false })),
    // Indexes continue past the studies so a function accessor sees one
    // position per emitted row rather than two rows numbered zero.
    ...pooledElements.map(entry => ({
      ...entry,
      index: entry.index + estimates.length,
      isPooledMark: true,
    })),
  ];

  // Infer accessors from the first datum's keys when the user did not specify.
  const firstDatum = elements[0].datum;
  const xAccessor = inferAccessor<string | number>(
    config,
    'x',
    'x',
    ['category', 'label', 'name', 'key', 'group'],
    firstDatum,
  );
  const yAccessor = inferAccessor<number>(
    config,
    'y',
    'y',
    ['value', 'mean', 'estimate', 'median'],
    firstDatum,
  );
  const yMinAccessor = inferAccessor<number>(
    config,
    'yMin',
    'yMin',
    ['lower', 'ciLow', 'ci_low', 'low', 'min'],
    firstDatum,
  );
  const yMaxAccessor = inferAccessor<number>(
    config,
    'yMax',
    'yMax',
    ['upper', 'ciHigh', 'ci_high', 'high', 'max'],
    firstDatum,
  );

  const weightAccessor = inferAccessor<number>(
    config,
    'weight',
    'weight',
    ['w', 'share'],
    firstDatum,
  );
  const pooledAccessor = inferAccessor<boolean>(
    config,
    'pooled',
    'pooled',
    ['isPooled', 'summary'],
    firstDatum,
  );

  // Typed as the wider row throughout: a `ForestPoint` with neither `weight`
  // nor `pooled` set IS an `ErrorBarPoint`, so an error-bar layer emits
  // exactly what it did before.
  const data: ForestPoint[] = elements.map(({ datum, index, isPooledMark }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(isPooledMark && pooledSelector !== undefined ? pooledSelector : selector, index);
    }
    const point: ForestPoint = {
      x: resolveAccessor<string | number>(datum, xAccessor, index),
      y: resolveAccessor<number>(datum, yAccessor, index),
    };
    const yMin = readBound(datum, yMinAccessor, index);
    if (yMin !== undefined) {
      point.yMin = yMin;
    }
    const yMax = readBound(datum, yMaxAccessor, index);
    if (yMax !== undefined) {
      point.yMax = yMax;
    }

    if (!isForest) {
      return point;
    }

    // The weight is a fraction of one, and absent is a real answer: a forest
    // plot drawn without weights is a real chart, so nothing is derived here.
    const weight = Number(resolveAccessorOptional<number>(datum, weightAccessor, index));
    if (Number.isFinite(weight)) {
      point.weight = weight;
    }
    // Its own mark makes a row pooled; so does the datum saying so, for a
    // chart that draws every row alike.
    if (isPooledMark || resolveAccessorOptional<boolean>(datum, pooledAccessor, index) === true) {
      point.pooled = true;
    }
    return point;
  });

  // One selector per selection, in the order the rows were built. The trace
  // flattens the list and pairs it one-to-one with the rows, highlighting the
  // same element at each of the three sections a column is read through — so
  // the studies' groups must come before the pooled mark, as they do above.
  const selectors = pooledElements.length > 0 && pooledSelector !== undefined
    ? [scopeSelector(root, selector, panel), scopeSelector(root, pooledSelector, panel)]
    : scopeSelector(root, selector, panel);

  const layer: MaidrLayer = {
    id: generateId(),
    type,
    title,
    selectors,
    orientation,
    axes: buildAxes(axes, format),
    data,
  };

  // Declared only when the caller gave one: the trace deliberately has no
  // default, and a guessed null line would sort every study onto the wrong
  // side of it silently.
  if (isForest && typeof nullValue === 'number' && Number.isFinite(nullValue)) {
    layer.forestOptions = { nullValue };
  }

  return { layer };
}
