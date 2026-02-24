/**
 * React hook for converting Recharts configuration into MAIDR data.
 *
 * Provides a memoized conversion from Recharts adapter config to MaidrData,
 * suitable for passing to the `<Maidr>` component's `data` prop.
 *
 * @example
 * ```tsx
 * import { Maidr } from 'maidr/react';
 * import { useRechartsAdapter } from 'maidr/recharts';
 *
 * function MyChart() {
 *   const data = [{ name: 'Q1', value: 100 }, { name: 'Q2', value: 200 }];
 *
 *   const maidrData = useRechartsAdapter({
 *     id: 'sales-chart',
 *     title: 'Sales by Quarter',
 *     data,
 *     chartType: 'bar',
 *     xKey: 'name',
 *     yKeys: ['value'],
 *     xLabel: 'Quarter',
 *     yLabel: 'Revenue',
 *   });
 *
 *   return (
 *     <Maidr data={maidrData}>
 *       <BarChart data={data}>
 *         <Bar dataKey="value" />
 *       </BarChart>
 *     </Maidr>
 *   );
 * }
 * ```
 */

import type { Maidr } from '@type/grammar';
import type { RechartsAdapterConfig } from './types';
import { useMemo } from 'react';
import { convertRechartsToMaidr } from './converters';

/**
 * Converts Recharts configuration into MAIDR data format.
 *
 * The conversion is memoized based on the config object reference.
 * For stable memoization, keep the config object reference stable
 * (e.g., define it outside the component or use useMemo).
 *
 * @param config - Recharts adapter configuration
 * @returns MaidrData ready to pass to `<Maidr data={...}>`
 */
export function useRechartsAdapter(config: RechartsAdapterConfig): Maidr {
  return useMemo(() => convertRechartsToMaidr(config), [config]);
}
