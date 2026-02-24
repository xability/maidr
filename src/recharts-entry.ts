/**
 * Public Recharts adapter API for MAIDR.
 *
 * Provides a `<MaidrRecharts>` wrapper component and a `useRechartsAdapter`
 * hook for making Recharts charts accessible through MAIDR's audio
 * sonification, text descriptions, braille output, and keyboard navigation.
 *
 * @remarks
 * Requires React 18 or 19 and Recharts as peer dependencies.
 * The adapter converts Recharts data into MAIDR's internal schema and
 * generates CSS selectors that target Recharts' SVG elements for highlighting.
 *
 * @example Using the wrapper component
 * ```tsx
 * import { MaidrRecharts } from 'maidr/recharts';
 * import { BarChart, Bar, XAxis, YAxis } from 'recharts';
 *
 * const data = [
 *   { name: 'Q1', revenue: 100 },
 *   { name: 'Q2', revenue: 200 },
 * ];
 *
 * function AccessibleChart() {
 *   return (
 *     <MaidrRecharts
 *       id="sales"
 *       title="Sales by Quarter"
 *       data={data}
 *       chartType="bar"
 *       xKey="name"
 *       yKeys={['revenue']}
 *       xLabel="Quarter"
 *       yLabel="Revenue"
 *     >
 *       <BarChart data={data} width={400} height={300}>
 *         <XAxis dataKey="name" />
 *         <YAxis />
 *         <Bar dataKey="revenue" fill="#8884d8" />
 *       </BarChart>
 *     </MaidrRecharts>
 *   );
 * }
 * ```
 *
 * @example Using the hook with `<Maidr>`
 * ```tsx
 * import { Maidr } from 'maidr/react';
 * import { useRechartsAdapter } from 'maidr/recharts';
 * import { LineChart, Line, XAxis, YAxis } from 'recharts';
 *
 * function AccessibleLineChart() {
 *   const data = [{ x: 1, y: 10 }, { x: 2, y: 20 }];
 *
 *   const maidrData = useRechartsAdapter({
 *     id: 'line-chart',
 *     title: 'Trend',
 *     data,
 *     chartType: 'line',
 *     xKey: 'x',
 *     yKeys: ['y'],
 *     xLabel: 'Time',
 *     yLabel: 'Value',
 *   });
 *
 *   return (
 *     <Maidr data={maidrData}>
 *       <LineChart data={data} width={400} height={300}>
 *         <XAxis dataKey="x" />
 *         <YAxis />
 *         <Line dataKey="y" dot />
 *       </LineChart>
 *     </Maidr>
 *   );
 * }
 * ```
 *
 * @packageDocumentation
 */
export {
  convertRechartsToMaidr,
  getRechartsSelector,
  MaidrRecharts,
  useRechartsAdapter,
} from './adapters/recharts';

export type {
  MaidrRechartsProps,
  RechartsAdapterConfig,
  RechartsChartType,
  RechartsLayerConfig,
} from './adapters/recharts';

// Re-export core types that consumers may need alongside the adapter
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';
