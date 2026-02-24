/**
 * D3 binder for histograms.
 *
 * Extracts data from D3.js-rendered histogram SVG elements and generates
 * the MAIDR JSON schema for accessible histogram interaction.
 */

import type { HistogramPoint, Maidr, MaidrLayer } from '../type/grammar';
import type { D3BinderResult, D3HistogramConfig } from './types';
import { TraceType } from '../type/grammar';
import { generateId, queryD3Elements, resolveAccessor, scopeSelector } from './util';

/**
 * Binds a D3.js histogram to MAIDR, generating the accessible data representation.
 *
 * D3 histograms are typically created with `d3.bin()` (or `d3.histogram()` in v5),
 * which produces arrays with `x0` and `x1` properties for bin boundaries. This
 * binder extracts bin data from D3-bound rect elements.
 *
 * @param svg - The SVG element containing the D3 histogram.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * // D3 histogram using d3.bin()
 * const result = bindD3Histogram(svgElement, {
 *   selector: 'rect.bar',
 *   title: 'Age Distribution',
 *   axes: { x: 'Age', y: 'Count' },
 *   x: (d) => `${d.x0}-${d.x1}`,
 *   y: (d) => d.length,
 *   xMin: 'x0',
 *   xMax: 'x1',
 *   yMin: () => 0,
 *   yMax: (d) => d.length,
 * });
 * ```
 */
export function bindD3Histogram(svg: Element, config: D3HistogramConfig): D3BinderResult {
  const {
    id = generateId(),
    title,
    subtitle,
    caption,
    axes,
    format,
    selector,
    x: xAccessor = 'x',
    y: yAccessor = 'y',
    xMin: xMinAccessor = 'x0',
    xMax: xMaxAccessor = 'x1',
    yMin: yMinAccessor = (_d: unknown, _i: number) => 0,
    yMax: yMaxAccessor,
  } = config;

  const elements = queryD3Elements(svg, selector);

  const data: HistogramPoint[] = elements.map(({ datum, index }) => {
    if (!datum) {
      throw new Error(
        `No D3 data bound to element at index ${index}. `
        + `Ensure D3's .data() join has been applied to the "${selector}" elements.`,
      );
    }

    // For D3 bin data, the datum is typically an array with x0/x1 properties.
    // The "y" value is usually the array length (count of items in the bin).
    const xValue = resolveAccessor<string | number>(datum, xAccessor, index);
    const yValue = resolveAccessor<number | string>(datum, yAccessor, index);
    const xMin = resolveAccessor<number>(datum, xMinAccessor, index);
    const xMax = resolveAccessor<number>(datum, xMaxAccessor, index);
    const yMin = resolveAccessor<number>(datum, yMinAccessor, index);
    const yMax = yMaxAccessor
      ? resolveAccessor<number>(datum, yMaxAccessor, index)
      : Number(yValue);

    return {
      x: xValue,
      y: yValue,
      xMin,
      xMax,
      yMin,
      yMax,
    };
  });

  const layerId = generateId();
  const layer: MaidrLayer = {
    id: layerId,
    type: TraceType.HISTOGRAM,
    title,
    selectors: scopeSelector(svg, selector),
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
