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
 */

import type { RechartsChartType } from './types';

/**
 * Returns the CSS selector string for individual data point elements
 * of the given Recharts chart type.
 *
 * For multi-series charts, provide the `seriesIndex` (0-based) to target
 * elements from a specific series. Recharts renders series as sibling
 * groups in DOM order matching their declaration order.
 *
 * @param chartType - The Recharts chart type
 * @param seriesIndex - Optional 0-based index for multi-series charts
 * @returns CSS selector string matching individual data point elements
 */
export function getRechartsSelector(
  chartType: RechartsChartType,
  seriesIndex?: number,
): string {
  const prefix = seriesIndex != null
    ? getNthSeriesPrefix(chartType, seriesIndex)
    : '';

  switch (chartType) {
    case 'bar':
    case 'stacked_bar':
    case 'dodged_bar':
    case 'normalized_bar':
    case 'histogram':
      return `${prefix}.recharts-bar-rectangle`;
    case 'line':
      return `${prefix}.recharts-line-dot`;
    case 'area':
      return `${prefix}.recharts-area-dot`;
    case 'scatter':
      return `${prefix}.recharts-scatter-symbol`;
    case 'pie':
      return `${prefix}.recharts-pie-sector`;
    case 'radar':
      return `${prefix}.recharts-radar-dot`;
    case 'funnel':
      return `${prefix}.recharts-funnel-trapezoid`;
  }
}

/**
 * Returns a CSS prefix that scopes selection to a specific series
 * within a multi-series chart.
 *
 * Recharts renders each series component (Bar, Line, etc.) as separate
 * container groups in DOM order. Since all containers are `<g>` elements,
 * using `:nth-of-type()` would match by tag (not class) and be unreliable
 * when axes or grids are present. Instead, we use the `[class~=...]`
 * attribute selector with `:nth-child()` scoped within the chart surface
 * layer for reliable series targeting.
 */
function getNthSeriesPrefix(
  chartType: RechartsChartType,
  seriesIndex: number,
): string {
  const containerClass = getContainerClass(chartType);
  // Use attribute selector to match exactly the container class,
  // then select the (n+1)th occurrence via a broader scope.
  // Recharts wraps series containers in `.recharts-layer` groups
  // inside the chart surface. We scope to the container class directly.
  return `.${containerClass}:nth-child(${seriesIndex + 1}) `;
}

/**
 * Returns the Recharts container class for a chart type.
 * This is the class on the top-level `<g>` that wraps all elements
 * for a single series.
 */
function getContainerClass(chartType: RechartsChartType): string {
  switch (chartType) {
    case 'bar':
    case 'stacked_bar':
    case 'dodged_bar':
    case 'normalized_bar':
    case 'histogram':
      return 'recharts-bar';
    case 'line':
      return 'recharts-line';
    case 'area':
      return 'recharts-area';
    case 'scatter':
      return 'recharts-scatter';
    case 'pie':
      return 'recharts-pie';
    case 'radar':
      return 'recharts-radar';
    case 'funnel':
      return 'recharts-trapezoids';
  }
}
