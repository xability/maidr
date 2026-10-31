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
import type { MaidrRechartsProps, RechartsPieAngles, RechartsSubplotConfig } from './types';
import { Children, useMemo } from 'react';
import { Maidr } from '../../maidr-component';
import { Orientation } from '../../type/grammar';
import { areaDataKeyFor, categoryAxisReversedFor, categoryAxisReversedPerPanelFor, dotSeriesFor, firstPlaceFor, pieAnglesFor, stepDirectionFor } from './childProps';
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
  stepDirection,
  pieAngles,
  dotSeries,
  firstPlace,
  fillKeys,
  binConfig,
  flowConfig,
  volcanoConfig,
  errorConfig,
  forestConfig,
  survivalConfig,
  prCurveConfig,
  percentileBandConfig,
  waterfallConfig,
  ganttConfig,
  gaugeConfig,
  parallelConfig,
  ridgelineConfig,
  hexbinConfig,
  boxenConfig,
  selectorOverride,
  children,
}: MaidrRechartsProps): JSX.Element {
  // Read out of the chart subtree on every render, and cheaply: each walk is
  // depth-first and stops at the first element it wants. What must NOT be a
  // dependency of the conversion below is `children` itself — the parent
  // builds a fresh element tree every time it renders, so its identity is
  // never stable and the memo would never hold. These three scalars are the
  // whole of what the schema takes from it, so they are what it depends on;
  // the per-panel answers travel as their serialised form for the same reason.
  //
  // Simple and composed mode read the one chart's axes; subplot mode reads
  // each panel's own, since a panel is its own chart with its own axes and
  // the walk would otherwise stop at whichever axis it met first. Each panel
  // is asked with its own orientation, since a panel may override the grid's
  // and that is what decides which axis its categories are on.
  const categoryAxisReversed = subplots
    ? undefined
    : categoryAxisReversedFor(children, orientation === Orientation.HORIZONTAL);
  const perPanel = subplots
    ? categoryAxisReversedPerPanelFor(
        children,
        normalizeRechartsSubplotGrid(subplots, columns).flat(),
        orientation,
      )
    : undefined;
  // Serialised rather than joined so an empty grid stays empty: `''.split(',')`
  // is `['']`, which would claim a panel that is not there.
  const perPanelKey = perPanel === undefined ? undefined : JSON.stringify(perPanel);
  // The convention is on the `<Line type>` the chart already declares, so a
  // step chart need not say it twice. An explicit one still wins, which is how
  // the reading is corrected when the walk finds a curve that is not the one
  // meant. Subplot mode abstains for the same reason the axis walk does above
  // -- one verdict would read the first panel's curve onto every other -- so a
  // grid of step charts declares the convention, on the panel or on the grid.
  const resolvedStepDirection = subplots
    ? stepDirection
    : (stepDirection ?? stepDirectionFor(children));
  // The angles are on the `<Pie>` the chart already declares, read the same
  // way and with the same abstention in subplot mode. Serialised for the memo
  // for the reason the per-panel answers are.
  const resolvedPieAngles = subplots
    ? pieAngles
    : (pieAngles ?? pieAnglesFor(children));
  const pieAnglesKey = resolvedPieAngles === undefined ? undefined : JSON.stringify(resolvedPieAngles);
  // Which series draw their dots, read off the `<Line>`, `<Area>` or
  // `<Radar>` elements the chart declares: on a chart of several series, each
  // series' dots are named by their place among those. Simple mode only, the
  // one mode that builds a layer of several such series, and serialised for
  // the memo as the other answers are.
  const resolvedDotSeries = subplots || layers
    ? dotSeries
    : (dotSeries ?? dotSeriesFor(children, chartType));
  const dotSeriesKey = resolvedDotSeries === undefined ? undefined : JSON.stringify(resolvedDotSeries);
  // The key a ridgeline's `<Area>`s draw, which places each ridge on the page,
  // and whether its `<YAxis>` is reversed, which turns the page over (the walk
  // `categoryAxisReversedFor` makes for a horizontal chart reads just that).
  // Simple mode only, as the others are, and never over what the config gives.
  const readsRidgeline = chartType === 'ridgeline' && !subplots;
  const ridgelinePlottedKey = readsRidgeline && ridgelineConfig?.plottedKey === undefined
    ? areaDataKeyFor(children)
    : undefined;
  const ridgelineAxisReversed = readsRidgeline && ridgelineConfig?.plottedAxisReversed === undefined
    && categoryAxisReversedFor(children, true);
  // Where a bump chart draws first place is on the `<YAxis reversed>` it
  // already declares, read the same way and with the same abstention.
  const resolvedFirstPlace = subplots
    ? firstPlace
    : (firstPlace ?? firstPlaceFor(children));

  const maidrData = useMemo(
    () => convertRechartsToMaidr({
      categoryAxisReversed,
      categoryAxisReversedPerPanel: perPanelKey === undefined
        ? undefined
        : (JSON.parse(perPanelKey) as boolean[]),
      stepDirection: resolvedStepDirection,
      pieAngles: pieAnglesKey === undefined
        ? undefined
        : (JSON.parse(pieAnglesKey) as RechartsPieAngles),
      dotSeries: dotSeriesKey === undefined
        ? undefined
        : (JSON.parse(dotSeriesKey) as (string | null)[]),
      firstPlace: resolvedFirstPlace,
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
      flowConfig,
      volcanoConfig,
      errorConfig,
      forestConfig,
      survivalConfig,
      prCurveConfig,
      percentileBandConfig,
      waterfallConfig,
      ganttConfig,
      gaugeConfig,
      parallelConfig,
      ridgelineConfig: ridgelineConfig === undefined
        ? undefined
        : {
            ...ridgelineConfig,
            ...(ridgelinePlottedKey === undefined ? {} : { plottedKey: ridgelinePlottedKey }),
            ...(ridgelineAxisReversed ? { plottedAxisReversed: true } : {}),
          },
      hexbinConfig,
      boxenConfig,
      selectorOverride,
    }),
    // The three facts read out of `children` stand in for it, so a chart that
    // flips `reversed` is still picked up while a parent re-render that only
    // rebuilds the same subtree is not.
    [id, title, subtitle, caption, data, chartType, xKey, yKeys, layers, subplots, columns, xLabel, yLabel, orientation, categoryAxisReversed, perPanelKey, resolvedStepDirection, pieAnglesKey, dotSeriesKey, resolvedFirstPlace, fillKeys, binConfig, flowConfig, volcanoConfig, errorConfig, forestConfig, survivalConfig, prCurveConfig, percentileBandConfig, waterfallConfig, ganttConfig, gaugeConfig, parallelConfig, ridgelineConfig, ridgelinePlottedKey, ridgelineAxisReversed, hexbinConfig, boxenConfig, selectorOverride],
  );

  return (
    <Maidr data={maidrData}>
      {subplots ? renderPanelGrid(subplots, columns, children) : children}
    </Maidr>
  );
}
