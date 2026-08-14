/**
 * React hook for binding D3.js-rendered charts to MAIDR.
 *
 * Unlike other adapters (recharts, google-charts) that convert configuration
 * data synchronously, the D3 adapter must read from a DOM element *after* D3
 * has rendered into it. This hook runs the appropriate binder inside a
 * `useEffect`, so it executes once the referenced SVG is committed to the DOM.
 *
 * **Draw D3 in a ref callback, not a `useEffect`.** This hook's bind effect
 * runs after the SVG is committed, but *before* the owner component's own
 * `useEffect`s — so a `useEffect(..., [data])` draw would run after the bind
 * on the empty SVG and throw "No elements found …". A ref callback draws
 * during the commit phase (before the bind) and re-fires on remount. Prefer
 * {@link MaidrD3}, which wires the `<Maidr>` swap for you.
 *
 * @example
 * ```tsx
 * import { useCallback, useRef } from 'react';
 * import { Maidr } from 'maidr/react';
 * import { useD3Adapter } from 'maidr/react';
 *
 * function AccessibleBarChart({ data }) {
 *   const svgRef = useRef<SVGSVGElement>(null);
 *
 *   // 1. Draw the D3 chart in a ref callback (commit phase, before the bind).
 *   const attachSvg = useCallback((node: SVGSVGElement | null) => {
 *     svgRef.current = node;
 *     if (!node) return;
 *     // ... d3 drawing code using `node` ...
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
 *   if (!maidrData) return <svg ref={attachSvg} />;
 *   return (
 *     <Maidr data={maidrData}>
 *       <svg ref={attachSvg} />
 *     </Maidr>
 *   );
 * }
 * ```
 */

import type { RefObject } from 'react';
import type { Maidr } from '../../type/grammar';
import type {
  D3BinderResult,
  D3FacetsConfig,
  D3MultiPanelResult,
  D3PanelChartSpec,
  D3SubplotsConfig,
} from './types';
import { useEffect, useRef, useState } from 'react';
import { bindD3Area } from './binders/area';
import { bindD3Bar, bindD3Dot, bindD3Funnel, bindD3Lollipop } from './binders/bar';
import { bindD3Box } from './binders/box';
import { bindD3Boxen } from './binders/boxen';
import { bindD3Candlestick } from './binders/candlestick';
import { bindD3Dumbbell } from './binders/dumbbell';
import { bindD3ErrorBar, bindD3Forest } from './binders/errorBar';
import { bindD3Alluvial, bindD3Chord, bindD3Sankey } from './binders/flow';
import { bindD3Gantt } from './binders/gantt';
import { bindD3Gauge } from './binders/gauge';
import { bindD3Heatmap } from './binders/heatmap';
import { bindD3Histogram } from './binders/histogram';
import { bindD3Bump, bindD3Line, bindD3Radar } from './binders/line';
import { bindD3Network } from './binders/network';
import { bindD3Pie, bindD3PolarArea } from './binders/pie';
import { bindD3Manhattan, bindD3Scatter, bindD3Volcano } from './binders/scatter';
import { bindD3Mosaic, bindD3Segmented } from './binders/segmented';
import { bindD3Smooth } from './binders/smooth';
import { bindD3Facets, bindD3Subplots } from './binders/subplots';
import { bindD3Icicle, bindD3Sunburst, bindD3Treemap } from './binders/treemap';
import { bindD3Waterfall } from './binders/waterfall';
import { bindD3WordCloud } from './binders/wordCloud';

/**
 * Discriminated union describing which binder to run and the config to pass it.
 *
 * The `chartType` field narrows the associated `config` to the correct
 * binder-specific type. This is what `useD3Adapter` and `<MaidrD3>` consume.
 *
 * Besides the single-chart types, `'facets'` (homogeneous small
 * multiples) and `'subplots'` (heterogeneous panel grids) select the
 * multi-panel binders.
 */
export type D3AdapterSpec
  = | D3PanelChartSpec
    | { chartType: 'facets'; config: D3FacetsConfig }
    | { chartType: 'subplots'; config: D3SubplotsConfig };

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
function runBinder(svg: Element, spec: D3AdapterSpec): D3BinderResult | D3MultiPanelResult {
  switch (spec.chartType) {
    case 'alluvial':
      return bindD3Alluvial(svg, { ...spec.config, autoApply: false });
    case 'area':
      return bindD3Area(svg, { ...spec.config, autoApply: false });
    case 'bar':
      return bindD3Bar(svg, { ...spec.config, autoApply: false });
    case 'box':
      return bindD3Box(svg, { ...spec.config, autoApply: false });
    case 'boxen':
      return bindD3Boxen(svg, { ...spec.config, autoApply: false });
    case 'bump':
      return bindD3Bump(svg, { ...spec.config, autoApply: false });
    case 'candlestick':
      return bindD3Candlestick(svg, { ...spec.config, autoApply: false });
    case 'chord':
      return bindD3Chord(svg, { ...spec.config, autoApply: false });
    case 'dot':
      return bindD3Dot(svg, { ...spec.config, autoApply: false });
    case 'dumbbell':
      return bindD3Dumbbell(svg, { ...spec.config, autoApply: false });
    case 'errorBar':
      return bindD3ErrorBar(svg, { ...spec.config, autoApply: false });
    case 'forest':
      return bindD3Forest(svg, { ...spec.config, autoApply: false });
    case 'funnel':
      return bindD3Funnel(svg, { ...spec.config, autoApply: false });
    case 'gantt':
      return bindD3Gantt(svg, { ...spec.config, autoApply: false });
    case 'gauge':
      return bindD3Gauge(svg, { ...spec.config, autoApply: false });
    case 'heatmap':
      return bindD3Heatmap(svg, { ...spec.config, autoApply: false });
    case 'histogram':
      return bindD3Histogram(svg, { ...spec.config, autoApply: false });
    case 'icicle':
      return bindD3Icicle(svg, { ...spec.config, autoApply: false });
    case 'line':
      return bindD3Line(svg, { ...spec.config, autoApply: false });
    case 'lollipop':
      return bindD3Lollipop(svg, { ...spec.config, autoApply: false });
    case 'manhattan':
      return bindD3Manhattan(svg, { ...spec.config, autoApply: false });
    case 'mosaic':
      return bindD3Mosaic(svg, { ...spec.config, autoApply: false });
    case 'network':
      return bindD3Network(svg, { ...spec.config, autoApply: false });
    case 'pie':
      return bindD3Pie(svg, { ...spec.config, autoApply: false });
    case 'polarArea':
      return bindD3PolarArea(svg, { ...spec.config, autoApply: false });
    case 'radar':
      return bindD3Radar(svg, { ...spec.config, autoApply: false });
    case 'sankey':
      return bindD3Sankey(svg, { ...spec.config, autoApply: false });
    case 'scatter':
      return bindD3Scatter(svg, { ...spec.config, autoApply: false });
    case 'segmented':
      return bindD3Segmented(svg, { ...spec.config, autoApply: false });
    case 'smooth':
      return bindD3Smooth(svg, { ...spec.config, autoApply: false });
    case 'sunburst':
      return bindD3Sunburst(svg, { ...spec.config, autoApply: false });
    case 'treemap':
      return bindD3Treemap(svg, { ...spec.config, autoApply: false });
    case 'volcano':
      return bindD3Volcano(svg, { ...spec.config, autoApply: false });
    case 'waterfall':
      return bindD3Waterfall(svg, { ...spec.config, autoApply: false });
    case 'wordCloud':
      return bindD3WordCloud(svg, { ...spec.config, autoApply: false });
    case 'facets':
      return bindD3Facets(svg, withFacetsAutoApplyOff(spec.config));
    case 'subplots':
      return bindD3Subplots(svg, { ...spec.config, autoApply: false });
  }
}

/**
 * Forces `autoApply: false` on a facets config's inner per-type config
 * (where the figure-level fields live). The switch re-narrows each arm so
 * the `chartType` ↔ `config` correlation survives the spread.
 */
function withFacetsAutoApplyOff(cfg: D3FacetsConfig): D3FacetsConfig {
  switch (cfg.chartType) {
    case 'alluvial':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'area':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'bar':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'box':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'boxen':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'bump':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'candlestick':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'chord':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'dot':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'dumbbell':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'errorBar':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'forest':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'funnel':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'gantt':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'gauge':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'heatmap':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'histogram':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'icicle':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'line':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'lollipop':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'manhattan':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'mosaic':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'network':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'pie':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'polarArea':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'radar':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'sankey':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'scatter':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'segmented':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'smooth':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'sunburst':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'treemap':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'volcano':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'waterfall':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
    case 'wordCloud':
      return { ...cfg, config: { ...cfg.config, autoApply: false } };
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
