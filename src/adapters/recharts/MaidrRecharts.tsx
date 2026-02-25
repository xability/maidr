/**
 * Convenience wrapper component that combines Recharts adapter + Maidr component.
 *
 * Accepts Recharts-style configuration props and automatically converts
 * the data into MAIDR format, wrapping the children with the `<Maidr>` component.
 *
 * @example
 * ```tsx
 * import { MaidrRecharts } from 'maidr/recharts';
 * import { BarChart, Bar, XAxis, YAxis } from 'recharts';
 *
 * function AccessibleBarChart() {
 *   const data = [
 *     { name: 'Q1', revenue: 100 },
 *     { name: 'Q2', revenue: 200 },
 *     { name: 'Q3', revenue: 150 },
 *   ];
 *
 *   return (
 *     <MaidrRecharts
 *       id="sales-chart"
 *       title="Sales by Quarter"
 *       data={data}
 *       chartType="bar"
 *       xKey="name"
 *       yKeys={['revenue']}
 *       xLabel="Quarter"
 *       yLabel="Revenue ($)"
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
 */

import type { JSX } from 'react';
import type { MaidrRechartsProps } from './types';
import { useMemo } from 'react';
import { Maidr } from '../../maidr-component';
import { convertRechartsToMaidr } from './converters';

/**
 * Wrapper component that makes Recharts charts accessible via MAIDR.
 *
 * This component extracts data configuration from props, converts it to
 * MAIDR's data format, and renders the Recharts children inside a `<Maidr>`
 * component for audio sonification, text descriptions, braille output,
 * and keyboard navigation.
 */
export function MaidrRecharts({
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
  children,
}: MaidrRechartsProps): JSX.Element {
  const maidrData = useMemo(
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
    }),
    [id, title, subtitle, caption, data, chartType, xKey, yKeys, layers, xLabel, yLabel, orientation, fillKeys, binConfig],
  );

  return (
    <Maidr data={maidrData}>
      {children}
    </Maidr>
  );
}
