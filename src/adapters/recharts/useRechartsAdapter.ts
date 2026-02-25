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
 * // Define data outside the component or useMemo to keep a stable reference.
 * const chartData = [{ name: 'Q1', value: 100 }, { name: 'Q2', value: 200 }];
 * const yKeys = ['value'];
 *
 * function MyChart() {
 *   const maidrData = useRechartsAdapter({
 *     id: 'sales-chart',
 *     title: 'Sales by Quarter',
 *     data: chartData,
 *     chartType: 'bar',
 *     xKey: 'name',
 *     yKeys,
 *     xLabel: 'Quarter',
 *     yLabel: 'Revenue',
 *   });
 *
 *   return (
 *     <Maidr data={maidrData}>
 *       <BarChart data={chartData}>
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
 * The result is memoized: it only recomputes when individual config
 * fields change. You do **not** need to stabilize the config object
 * reference — the hook tracks each field independently.
 *
 * @param config - Recharts adapter configuration
 * @returns MaidrData ready to pass to `<Maidr data={...}>`
 */
export function useRechartsAdapter(config: RechartsAdapterConfig): Maidr {
  const {
    id,
    title,
    subtitle,
    caption,
    data,
    chartType,
    xKey,
    yKeys,
    layers,
    xLabel,
    yLabel,
    orientation,
    fillKeys,
    binConfig,
    selectorOverride,
  } = config;

  return useMemo(
    () => convertRechartsToMaidr({
      id,
      title,
      subtitle,
      caption,
      data,
      chartType,
      xKey,
      yKeys,
      layers,
      xLabel,
      yLabel,
      orientation,
      fillKeys,
      binConfig,
      selectorOverride,
    }),
    [id, title, subtitle, caption, data, chartType, xKey, yKeys, layers, xLabel, yLabel, orientation, fillKeys, binConfig, selectorOverride],
  );
}
