/**
 * React hook for binding D3.js-rendered charts to MAIDR.
 *
 * Unlike other adapters (recharts, google-charts) that convert configuration
 * data synchronously, the D3 adapter must read from a DOM element *after* D3
 * has rendered into it. This hook runs the appropriate binder inside a
 * `useEffect`, so it executes once the referenced SVG is committed to the DOM.
 *
 * @example
 * ```tsx
 * import { useRef, useEffect } from 'react';
 * import { Maidr } from 'maidr/react';
 * import { useD3Adapter } from 'maidr/react';
 *
 * function AccessibleBarChart({ data }) {
 *   const svgRef = useRef<SVGSVGElement>(null);
 *
 *   // 1. Draw the D3 chart into svgRef.current
 *   useEffect(() => {
 *     // ... d3 drawing code using svgRef.current ...
 *   }, [data]);
 *
 *   // 2. Bind the rendered SVG to a MAIDR data structure
 *   const { maidrData } = useD3Adapter(
 *     svgRef,
 *     {
 *       chartType: 'bar',
 *       config: {
 *         selector: 'rect.bar',
 *         title: 'Sales',
 *         axes: { x: 'Quarter', y: 'Revenue' },
 *       },
 *     },
 *     [data], // re-bind whenever the D3 chart changes
 *   );
 *
 *   if (!maidrData) return <svg ref={svgRef} />;
 *   return (
 *     <Maidr data={maidrData}>
 *       <svg ref={svgRef} />
 *     </Maidr>
 *   );
 * }
 * ```
 */

import type { RefObject } from 'react';
import type { Maidr } from '../../type/grammar';
import type {
  D3BarConfig,
  D3BinderResult,
  D3BoxConfig,
  D3CandlestickConfig,
  D3HeatmapConfig,
  D3HistogramConfig,
  D3LineConfig,
  D3ScatterConfig,
  D3SegmentedConfig,
  D3SmoothConfig,
} from './types';
import { useEffect, useRef, useState } from 'react';
import { bindD3Bar } from './binders/bar';
import { bindD3Box } from './binders/box';
import { bindD3Candlestick } from './binders/candlestick';
import { bindD3Heatmap } from './binders/heatmap';
import { bindD3Histogram } from './binders/histogram';
import { bindD3Line } from './binders/line';
import { bindD3Scatter } from './binders/scatter';
import { bindD3Segmented } from './binders/segmented';
import { bindD3Smooth } from './binders/smooth';

/**
 * Discriminated union describing which binder to run and the config to pass it.
 *
 * The `chartType` field narrows the associated `config` to the correct
 * binder-specific type. This is what `useD3Adapter` and `<MaidrD3>` consume.
 */
export type D3AdapterSpec
  = | { chartType: 'bar'; config: D3BarConfig }
    | { chartType: 'box'; config: D3BoxConfig }
    | { chartType: 'candlestick'; config: D3CandlestickConfig }
    | { chartType: 'heatmap'; config: D3HeatmapConfig }
    | { chartType: 'histogram'; config: D3HistogramConfig }
    | { chartType: 'line'; config: D3LineConfig }
    | { chartType: 'scatter'; config: D3ScatterConfig }
    | { chartType: 'segmented'; config: D3SegmentedConfig }
    | { chartType: 'smooth'; config: D3SmoothConfig };

/** The set of chart-type keys accepted by the D3 React adapter. */
export type D3ChartType = D3AdapterSpec['chartType'];

/**
 * Result returned by {@link useD3Adapter}.
 */
export interface UseD3AdapterResult {
  /** MAIDR data extracted from the SVG, or `null` until the first bind completes. */
  maidrData: Maidr | null;
  /** Error thrown by the binder, or `null` when the last bind succeeded. */
  error: Error | null;
}

/**
 * Dispatches to the appropriate binder based on the spec's `chartType`.
 * Kept internal so the hook and the component both pay a single switch.
 *
 * Always forces `autoApply: false` so the binders do not write a
 * `maidr-data` attribute while React is also driving the schema via
 * {@link Maidr}. The user's own `autoApply` (if any) is intentionally
 * ignored in the React path.
 */
function runBinder(svg: Element, spec: D3AdapterSpec): D3BinderResult {
  switch (spec.chartType) {
    case 'bar':
      return bindD3Bar(svg, { ...spec.config, autoApply: false });
    case 'box':
      return bindD3Box(svg, { ...spec.config, autoApply: false });
    case 'candlestick':
      return bindD3Candlestick(svg, { ...spec.config, autoApply: false });
    case 'heatmap':
      return bindD3Heatmap(svg, { ...spec.config, autoApply: false });
    case 'histogram':
      return bindD3Histogram(svg, { ...spec.config, autoApply: false });
    case 'line':
      return bindD3Line(svg, { ...spec.config, autoApply: false });
    case 'scatter':
      return bindD3Scatter(svg, { ...spec.config, autoApply: false });
    case 'segmented':
      return bindD3Segmented(svg, { ...spec.config, autoApply: false });
    case 'smooth':
      return bindD3Smooth(svg, { ...spec.config, autoApply: false });
  }
}

/**
 * Binds a D3.js-rendered SVG to a {@link Maidr} data structure.
 *
 * The hook reads `svgRef.current` inside a `useEffect`, which means:
 *
 * - It runs **after** React commits the SVG to the DOM.
 * - It does **not** automatically detect when D3 mutates the SVG. Pass the
 *   values that drive your D3 drawing as `deps` so the hook re-binds when
 *   your chart changes.
 *
 * @param svgRef - Ref pointing to the SVG element containing the rendered chart.
 * @param spec   - Discriminated union of chart type + binder-specific config.
 * @param deps   - Values that should trigger re-binding. Defaults to `[]`
 *                 (bind once on mount). Include your chart's data here to
 *                 keep MAIDR in sync with live D3 updates.
 * @returns Object with `maidrData` (the extracted MAIDR schema, or `null`
 *          until the first successful bind) and `error` (the most recent
 *          binder error, or `null` on success).
 */
export function useD3Adapter(
  svgRef: RefObject<SVGElement | null>,
  spec: D3AdapterSpec,
  deps?: React.DependencyList,
): UseD3AdapterResult {
  const [maidrData, setMaidrData] = useState<Maidr | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Keep the latest spec in a ref so the effect can always read the current
  // spec without forcing callers to memoize it. The user controls re-runs
  // via `deps`, not via object identity of `spec`.
  const specRef = useRef(spec);
  specRef.current = spec;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    try {
      const result = runBinder(svg, specRef.current);
      setMaidrData(result.maidr);
      setError(null);
    } catch (err) {
      const asError = err instanceof Error ? err : new Error(String(err));
      console.error('[MaidrD3] Binder failed:', asError);
      setMaidrData(null);
      setError(asError);
    }
  }, deps ?? []);

  return { maidrData, error };
}
