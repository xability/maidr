/**
 * D3 binder for parallel coordinates plots.
 *
 * A parallel coordinates plot draws one `<path>` (or `<polyline>`) per
 * observation across several per-variable scales, and the datum bound to that
 * element is the observation as a whole — `{ mpg: 21, hp: 110, weight: 2600 }`.
 * The layer's rows are the observations and its columns are the axes, so the
 * binder's work is a transpose: each observation becomes a row of points whose
 * `x` is an axis' name and whose `y` is that observation's value on it.
 *
 * The axis order comes from the config, not from the datum. An object's key
 * order is not an axis order, and the chart already has the list — it built one
 * scale per entry of it.
 */

import type { LinePoint, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3ParallelConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessorOptional } from '../util';
import { stampSeriesSelectors } from './line';

/**
 * Reads one dimension off an observation.
 *
 * A missing dimension is an error rather than a gap: the columns are the axes,
 * and an observation short of one would shift every axis after it, announcing
 * each value under the name of the next variable along.
 *
 * @param datum - The observation bound to the path
 * @param dimension - The axis to read
 * @param index - The observation's index within the selection
 * @param read - The user's reader, when they gave one
 * @returns The value on that axis
 * @throws Error when the observation carries no such dimension
 */
function readDimension(
  datum: unknown,
  dimension: string,
  index: number,
  read?: D3ParallelConfig['value'],
): number {
  if (read) {
    return read(datum, dimension, index);
  }
  const record = datum as Record<string, unknown>;
  if (!(dimension in record)) {
    throw new Error(
      `Dimension "${dimension}" not found on the observation at index ${index}. `
      + `Available properties: ${Object.keys(record).join(', ')}. Every `
      + `observation has to carry every dimension — a row short of one would `
      + `announce its remaining values under the wrong axes. Pass a \`value\` `
      + `reader when the numbers are nested, e.g. `
      + `\`value: (d, dimension) => d.values[dimension]\`.`,
    );
  }
  return Number(record[dimension]);
}

/**
 * Binds a D3.js parallel coordinates plot to MAIDR, generating the accessible
 * data representation.
 *
 * Point `selector` at the observation paths — one per row of your data — and
 * list the axes in `dimensions`, in the order they are drawn. `label` names
 * the observation, which is what the trace announces the row as.
 *
 * The trace derives each axis' range from the data itself and sonifies every
 * value against its own axis, so nothing here needs per-axis minima: a car with
 * the best economy and the worst power sounds like exactly that, rather than
 * like the units the two variables happen to be measured in.
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
 * @param svg - The SVG element containing the D3 parallel coordinates plot.
 * @param config - Configuration specifying the selector, dimensions and label.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Parallel(svgElement, {
 *   selector: 'path.observation',
 *   title: 'Car Characteristics',
 *   axes: { x: 'Variable', y: 'Value', fill: 'Car' },
 *   dimensions: ['mpg', 'hp', 'weight'],
 *   label: 'name',
 * });
 * ```
 */
export function bindD3Parallel(svg: Element, config: D3ParallelConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildParallelLayer(svg, config));
}

/**
 * Pure extraction core for parallel coordinates plots. See
 * {@link buildBarLayer} for the single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildParallelLayer(
  root: Element,
  config: D3ParallelConfig,
  panel?: D3PanelScope,
): D3BuiltLayer {
  const { title, axes, format, selector, dimensions, value } = config;

  if (!Array.isArray(dimensions) || dimensions.length === 0) {
    throw new Error(
      `A parallel coordinates plot needs its \`dimensions\`: the axes, in the `
      + `order they are drawn. That order is the order a reader arrows through `
      + `them, and nothing on the datum states it — pass the same list you `
      + `built one scale per.`,
    );
  }

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'observation path');
  }

  const labelAccessor = inferAccessor<string>(
    config,
    'label',
    'name',
    ['label', 'id', 'key', 'group', 'fill'],
    elements[0].datum,
  );

  const data: LinePoint[][] = [];
  const observations: Element[] = [];
  const legend: string[] = [];

  for (const { element, datum, index } of elements) {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }

    const label = resolveAccessorOptional<string>(datum, labelAccessor, index);
    const row: LinePoint[] = dimensions.map((dimension) => {
      const point: LinePoint = {
        x: dimension,
        y: readDimension(datum, dimension, index, value),
      };
      if (label !== undefined && label !== null) {
        point.z = String(label);
      }
      return point;
    });

    data.push(row);
    observations.push(element);
    if (label !== undefined && label !== null) {
      legend.push(String(label));
    }
  }

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.PARALLEL,
    title,
    // One selector per observation. `ParallelTrace` inherits `LineTrace`'s
    // resolution, which pairs the selector list with the rows one for one, so
    // a bare selector matching every path withdraws highlighting entirely.
    selectors: elements.length > 1
      ? stampSeriesSelectors(root, selector, observations, data.length, panel)
      : scopeSelector(root, selector, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer, legend };
}
