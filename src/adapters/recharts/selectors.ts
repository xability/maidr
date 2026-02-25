/**
 * CSS selectors for Recharts SVG elements.
 *
 * Recharts renders SVG with specific class names that follow the pattern
 * `.recharts-{component}-{element}`. These selectors target the individual
 * data point elements that MAIDR uses for visual highlighting during
 * keyboard navigation.
 *
 * SVG structure reference (Recharts v2.x):
 *
 * BarChart:
 *   g.recharts-bar > g.recharts-bar-rectangles > g.recharts-bar-rectangle > path.recharts-rectangle
 *
 * LineChart:
 *   g.recharts-line > g.recharts-line-dots > circle.recharts-line-dot
 *
 * AreaChart:
 *   g.recharts-area > g.recharts-area-dots > circle.recharts-area-dot
 *
 * ScatterChart:
 *   g.recharts-scatter > g.recharts-scatter-symbol > svg.recharts-symbols
 *
 * PieChart:
 *   g.recharts-pie > g.recharts-pie-sector > path.recharts-sector
 *
 * RadarChart:
 *   g.recharts-radar > g.recharts-radar-dots > circle.recharts-radar-dot
 *
 * FunnelChart:
 *   g.recharts-trapezoids > g.recharts-funnel-trapezoid > path.recharts-trapezoid
 *
 * ## Multi-series limitation
 *
 * Recharts renders axes, grids, and series as sibling `<g>` elements inside
 * a shared surface layer. Because they all share the same tag, CSS positional
 * pseudo-classes (`:nth-child`, `:nth-of-type`) cannot reliably distinguish
 * between series when non-series siblings are interspersed.
 *
 * For **single-series** charts the class selector is unambiguous and
 * highlighting works out of the box.
 *
 * For **multi-series** charts the adapter returns `undefined` for selectors,
 * which disables visual highlighting while preserving audio, text, and braille.
 * To enable highlighting for multi-series charts, add a custom `className` to
 * each Recharts component (e.g. `<Bar className="revenue" />`) and pass the
 * resulting selector via the `selectorOverride` config option.
 */

import type { RechartsChartType } from './types';

/**
 * Returns the CSS selector string for individual data point elements
 * of the given Recharts chart type.
 *
 * Returns `undefined` when `seriesIndex` is provided, because CSS alone
 * cannot reliably target a specific series in Recharts' SVG structure.
 * See the module-level documentation for details.
 *
 * @param chartType - The Recharts chart type
 * @param seriesIndex - When set, indicates a multi-series chart — returns undefined
 * @returns CSS selector string, or undefined for multi-series targeting
 */
export function getRechartsSelector(
  chartType: RechartsChartType,
  seriesIndex?: number,
): string | undefined {
  // Multi-series positional targeting is unreliable with CSS alone.
  // Return undefined to gracefully disable highlighting.
  if (seriesIndex != null) {
    return undefined;
  }

  switch (chartType) {
    case 'bar':
    case 'stacked_bar':
    case 'dodged_bar':
    case 'normalized_bar':
    case 'histogram':
      return '.recharts-bar-rectangle';
    case 'line':
      return '.recharts-line-dot';
    case 'area':
      return '.recharts-area-dot';
    case 'scatter':
      return '.recharts-scatter-symbol';
    case 'pie':
      return '.recharts-pie-sector';
    case 'radar':
      return '.recharts-radar-dot';
    case 'funnel':
      return '.recharts-funnel-trapezoid';
  }
}
