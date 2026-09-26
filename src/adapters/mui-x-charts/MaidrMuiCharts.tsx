import type { JSX } from 'react';
import type { MaidrMuiChartsProps } from './types';
import { useRef } from 'react';
import { Maidr } from '../../maidr-component';
import { useMuiChartsAdapter } from './useMuiChartsAdapter';

/**
 * React component that wraps an MUI X chart and provides accessible,
 * non-visual access through MAIDR's audio sonification, text descriptions,
 * braille output, and keyboard navigation.
 *
 * Reads the chart's own props, so the data is written once:
 * - `<BarChart>` → bar chart; several series → dodged bars; series sharing a
 *   `stack` → stacked bars; `layout="horizontal"` → horizontal bars
 * - `<LineChart>` → line chart; `area` series → area chart; series sharing a
 *   `stack` → stacked area chart
 * - `<ScatterChart>` → scatter plot, one layer per series
 * - `<PieChart>` → pie chart (a doughnut is the same component with an
 *   `innerRadius`)
 *
 * @example
 * ```tsx
 * import { MaidrMuiCharts } from 'maidr/mui-x-charts';
 * import { BarChart } from '@mui/x-charts/BarChart';
 *
 * function AccessibleBarChart() {
 *   return (
 *     <MaidrMuiCharts id="sales" title="Sales by Quarter">
 *       <BarChart
 *         width={500}
 *         height={300}
 *         xAxis={[{ data: ['Q1', 'Q2', 'Q3', 'Q4'], label: 'Quarter' }]}
 *         yAxis={[{ label: 'Revenue ($)' }]}
 *         series={[{ data: [120, 200, 150, 300], label: 'Revenue' }]}
 *       />
 *     </MaidrMuiCharts>
 *   );
 * }
 * ```
 */
export function MaidrMuiCharts({
  id,
  title,
  subtitle,
  caption,
  children,
  chartType,
}: MaidrMuiChartsProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const maidrData = useMuiChartsAdapter({ id, title, subtitle, caption, children, chartType }, containerRef);

  return (
    <Maidr data={maidrData}>
      <div ref={containerRef}>
        {children}
      </div>
    </Maidr>
  );
}
