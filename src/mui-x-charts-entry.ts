/**
 * Public MUI X Charts adapter API for MAIDR.
 *
 * Provides a `<MaidrMuiCharts>` wrapper component and a `useMuiChartsAdapter`
 * hook for making MUI X Charts (`@mui/x-charts`) accessible through MAIDR's
 * audio sonification, text descriptions, braille output, and keyboard
 * navigation.
 *
 * @remarks
 * Requires React 18 or 19 and `@mui/x-charts` v9 as peer dependencies. The
 * adapter reads the chart's own `series`, `xAxis`, `yAxis`, `dataset` and
 * `layout` props, and targets the rendered marks through the `data-series`
 * attributes and class names MUI X stamps on them — the chart's SVG is never
 * modified.
 *
 * Supported MUI X chart components:
 * - `BarChart` → bar, dodged bar, stacked bar (and normalized), horizontal bar
 * - `LineChart` → line, area, stacked area (and normalized)
 * - `ScatterChart` → scatter plot (one layer per series)
 * - `PieChart` → pie / doughnut (one layer per ring)
 *
 * @example Using the wrapper component
 * ```tsx
 * import { MaidrMuiCharts } from 'maidr/mui-x-charts';
 * import { LineChart } from '@mui/x-charts/LineChart';
 *
 * function AccessibleChart() {
 *   return (
 *     <MaidrMuiCharts id="temps" title="Average Temperature">
 *       <LineChart
 *         width={500}
 *         height={300}
 *         xAxis={[{ data: [1, 2, 3, 4], label: 'Month' }]}
 *         yAxis={[{ label: 'Temperature (°C)' }]}
 *         series={[{ data: [3, 5, 9, 14], label: 'Seattle' }]}
 *       />
 *     </MaidrMuiCharts>
 *   );
 * }
 * ```
 *
 * @example Using the hook with `<Maidr>`
 * ```tsx
 * import { useRef } from 'react';
 * import { Maidr } from 'maidr/react';
 * import { useMuiChartsAdapter } from 'maidr/mui-x-charts';
 * import { PieChart } from '@mui/x-charts/PieChart';
 *
 * function AccessiblePie() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const children = (
 *     <PieChart
 *       width={400}
 *       height={300}
 *       series={[{ data: [{ id: 0, value: 10, label: 'A' }, { id: 1, value: 20, label: 'B' }] }]}
 *     />
 *   );
 *   const maidrData = useMuiChartsAdapter({ id: 'share', title: 'Share', children }, containerRef);
 *
 *   return (
 *     <Maidr data={maidrData}>
 *       <div ref={containerRef}>{children}</div>
 *     </Maidr>
 *   );
 * }
 * ```
 *
 * @packageDocumentation
 */

export {
  convertMuiChart,
  convertMuiChartsToMaidr,
  detectMuiChartKind,
  findMuiChartElement,
  MaidrMuiCharts,
  muiSeriesId,
  useMuiChartsAdapter,
} from './adapters/mui-x-charts';

export type {
  MaidrMuiChartsProps,
  MuiAxisConfig,
  MuiChartElement,
  MuiChartKind,
  MuiChartProps,
  MuiChartsAdapterConfig,
  MuiConvertedChart,
  MuiSeriesConfig,
} from './adapters/mui-x-charts';

// Re-export core types that consumers may need alongside the adapter.
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';
