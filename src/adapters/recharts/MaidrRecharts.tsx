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

import type { JSX, ReactNode } from 'react';
import type { MaidrRechartsProps, RechartsSubplotConfig } from './types';
import { Children, useMemo } from 'react';
import { Maidr } from '../../maidr-component';
import { convertRechartsToMaidr, normalizeRechartsSubplotGrid } from './converters';
import { getPanelClassName } from './selectors';

/**
 * Renders the multi-panel grid for subplot mode.
 *
 * Children-order contract: pass exactly one Recharts chart per panel, in
 * ROW-MAJOR order matching the `subplots` grid — the 1st child is panel
 * [0][0] (top-left), the 2nd is [0][1], and so on row by row. Each child is
 * wrapped in a generated `div.maidr-panel-<row>-<col>`; the adapter's
 * highlight selectors are scoped to that class, so a mismatched order means
 * a panel's narration would highlight a different panel's marks.
 *
 * Each grid row renders as a flex row so the visual layout matches the
 * config grid shape (MAIDR announces panels in visual reading order).
 */
function renderPanelGrid(
  subplots: RechartsSubplotConfig[] | RechartsSubplotConfig[][],
  columns: number | undefined,
  children: ReactNode,
): JSX.Element {
  const grid = normalizeRechartsSubplotGrid(subplots, columns);
  const childArray = Children.toArray(children);
  const panelCount = grid.reduce((count, row) => count + row.length, 0);
  if (childArray.length !== panelCount) {
    console.warn(
      `MaidrRecharts: expected ${panelCount} children (one chart per subplot panel, in row-major order), got ${childArray.length}`,
    );
  }

  // Flat child index of each row's first panel (row-major order).
  const rowOffsets: number[] = [];
  grid.reduce((offset, row) => {
    rowOffsets.push(offset);
    return offset + row.length;
  }, 0);

  return (
    <>
      {grid.map((row, rowIndex) => (
        <div key={rowIndex} style={{ display: 'flex' }}>
          {row.map((_, colIndex) => (
            <div key={colIndex} className={getPanelClassName(rowIndex, colIndex)}>
              {childArray[rowOffsets[rowIndex] + colIndex]}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * Wrapper component that makes Recharts charts accessible via MAIDR.
 *
 * This component extracts data configuration from props, converts it to
 * MAIDR's data format, and renders the Recharts children inside a `<Maidr>`
 * component for audio sonification, text descriptions, braille output,
 * and keyboard navigation.
 *
 * In subplot mode (`subplots` prop set) the children must be one Recharts
 * chart per panel in row-major grid order; each is wrapped in a generated
 * `.maidr-panel-<row>-<col>` div used to scope highlighting to that panel.
 * See {@link renderPanelGrid} for the full children-order contract.
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
  subplots,
  columns,
  xLabel,
  yLabel,
  orientation,
  fillKeys,
  binConfig,
  selectorOverride,
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
      subplots,
      columns,
      xLabel,
      yLabel,
      orientation,
      fillKeys,
      binConfig,
      selectorOverride,
    }),
    [id, title, subtitle, caption, data, chartType, xKey, yKeys, layers, subplots, columns, xLabel, yLabel, orientation, fillKeys, binConfig, selectorOverride],
  );

  return (
    <Maidr data={maidrData}>
      {subplots ? renderPanelGrid(subplots, columns, children) : children}
    </Maidr>
  );
}
