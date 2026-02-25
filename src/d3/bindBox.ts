/**
 * D3 binder for box plots.
 *
 * Extracts data from D3.js-rendered box plot SVG elements and generates
 * the MAIDR JSON schema for accessible box plot interaction.
 */

import type { BoxPoint, Maidr, MaidrLayer } from '../type/grammar';
import type { D3BinderResult, D3BoxConfig } from './types';
import { Orientation, TraceType } from '../type/grammar';
import { generateId, getD3Datum, queryD3Elements, resolveAccessor, resolveAccessorOptional, scopeSelector } from './util';

/**
 * Binds a D3.js box plot to MAIDR, generating the accessible data representation.
 *
 * Box plots in D3 are typically constructed from multiple SVG elements per box
 * (a rect for the IQR, lines for whiskers, a line for the median, and circles
 * for outliers). This binder extracts statistical summary data from D3-bound
 * data on the box group elements.
 *
 * @param svg - The SVG element containing the D3 box plot.
 * @param config - Configuration specifying selectors and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Box(svgElement, {
 *   selector: 'g.box',
 *   title: 'Distribution by Category',
 *   axes: { x: 'Category', y: 'Value' },
 *   fill: 'category',
 *   min: 'whiskerLow',
 *   q1: 'q1',
 *   q2: 'median',
 *   q3: 'q3',
 *   max: 'whiskerHigh',
 *   lowerOutliers: 'lowOutliers',
 *   upperOutliers: 'highOutliers',
 * });
 * ```
 */
export function bindD3Box(svg: Element, config: D3BoxConfig): D3BinderResult {
  const {
    id = generateId(),
    title,
    subtitle,
    caption,
    axes,
    format,
    selector,
    fill: fillAccessor = 'fill',
    min: minAccessor = 'min',
    q1: q1Accessor = 'q1',
    q2: q2Accessor = 'q2',
    q3: q3Accessor = 'q3',
    max: maxAccessor = 'max',
    lowerOutliers: lowerOutliersAccessor = 'lowerOutliers',
    upperOutliers: upperOutliersAccessor = 'upperOutliers',
    orientation = Orientation.VERTICAL,
  } = config;

  const boxGroups = queryD3Elements(svg, selector);

  const data: BoxPoint[] = boxGroups.map(({ element, datum, index }) => {
    // Try to get data from the group element's D3 binding first
    let effectiveDatum = datum;

    // If no data on the group, try to find it on child elements
    if (!effectiveDatum) {
      const firstChild = element.querySelector('rect, line, path');
      if (firstChild) {
        effectiveDatum = getD3Datum(firstChild);
      }
    }

    if (!effectiveDatum) {
      throw new Error(
        `No D3 data bound to box group element at index ${index}. `
        + `Ensure D3's .data() join has been applied to the "${selector}" elements.`,
      );
    }

    // Outlier arrays are optional - use resolveAccessorOptional
    const lowerOutliers = resolveAccessorOptional<number[]>(effectiveDatum, lowerOutliersAccessor, index) ?? [];
    const upperOutliers = resolveAccessorOptional<number[]>(effectiveDatum, upperOutliersAccessor, index) ?? [];

    return {
      fill: resolveAccessor<string>(effectiveDatum, fillAccessor, index),
      lowerOutliers,
      min: resolveAccessor<number>(effectiveDatum, minAccessor, index),
      q1: resolveAccessor<number>(effectiveDatum, q1Accessor, index),
      q2: resolveAccessor<number>(effectiveDatum, q2Accessor, index),
      q3: resolveAccessor<number>(effectiveDatum, q3Accessor, index),
      max: resolveAccessor<number>(effectiveDatum, maxAccessor, index),
      upperOutliers,
    };
  });

  const layerId = generateId();
  const layer: MaidrLayer = {
    id: layerId,
    type: TraceType.BOX,
    title,
    selectors: scopeSelector(svg, selector),
    orientation,
    axes: axes
      ? {
          ...axes,
          ...(format ? { format } : {}),
        }
      : undefined,
    data,
  };

  const maidr: Maidr = {
    id,
    title,
    subtitle,
    caption,
    subplots: [[{ layers: [layer] }]],
  };

  return { maidr, layer };
}
