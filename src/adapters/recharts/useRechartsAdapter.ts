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

/** The charts already told to name a ridgeline's drawn key, so each is told once. */
const askedForPlottedKey = new Set<string>();

/**
 * Says, once per chart, that a ridgeline given through this hook without
 * `ridgelineConfig.plottedKey` is read in the order its groups first appear.
 *
 * `<MaidrRecharts>` reads the key off the chart's `<Area dataKey>` and lists
 * the ridges bottom first, as they are drawn; this hook reads nothing off the
 * chart, so without the key the first group is read as the lowest ridge,
 * which the recipe draws at the top.
 *
 * @param id - The chart's id
 */
function askForPlottedKey(id: string): void {
  if (askedForPlottedKey.has(id)) {
    return;
  }
  askedForPlottedKey.add(id);
  console.warn(
    `[maidr/recharts] Ridgeline "${id}" has no ridgelineConfig.plottedKey, so its ridges are `
    + 'read in the order their groups first appear in data, the first as the lowest. Set it to '
    + 'the key the <Area>s draw, and they are read bottom first, as drawn.',
  );
}

/**
 * Converts Recharts configuration into MAIDR data format.
 *
 * The result is memoized: it only recomputes when individual config
 * fields change. You do **not** need to stabilize the config object
 * reference itself — the hook destructures it and tracks each field
 * independently. However, fields that are arrays or objects (`data`,
 * `yKeys`, `layers`, `subplots`, `fillKeys`, `binConfig`) are compared
 * by reference. Define them outside the component or wrap them in
 * `useMemo` to avoid unnecessary recomputation on every render: each
 * recomputation is a new object for `<Maidr>`, which then forgets the point
 * a reader who stepped away from the chart would come back to. `dotSeries`
 * is compared by its content, so it can be written inline.
 *
 * In subplot mode (`subplots` set), the hook — unlike `<MaidrRecharts>` —
 * does NOT wrap your charts in panel container divs. You must render each
 * panel's chart inside a container matching the generated panel scope
 * (`<div className="maidr-panel-<row>-<col>">`, row-major grid positions)
 * or set `panelSelector` on each panel config to your own unique selector.
 *
 * It reads nothing out of your chart's own elements either, which
 * `<MaidrRecharts>` does: `stepDirection`, `categoryAxisReversed`,
 * `categoryAxisReversedPerPanel`, `pieAngles` and `dotSeries` are derived
 * there from the `<Line>`, `<Area>`, `<Radar>`, `<Pie>` and
 * `<XAxis reversed>` inside its children. Through this hook they are yours to
 * state, and every field of the config is forwarded — a field left out of the
 * rebuilt object below is one silently discarded from a caller's config.
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
    categoryAxisReversed,
    categoryAxisReversedPerPanel,
    stepDirection,
    pieAngles,
    dotSeries,
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
    ridgelineConfig,
    hexbinConfig,
    boxenConfig,
    selectorOverride,
  } = config;
  if (chartType === 'ridgeline' && ridgelineConfig !== undefined && ridgelineConfig.plottedKey === undefined) {
    askForPlottedKey(id);
  }
  // Serialised, as `<MaidrRecharts>` serialises what it reads off its
  // children: the list is usually written inline, a new array on every
  // render, and a new MAIDR object makes `<Maidr>` forget the place a reader
  // who stepped away would come back to.
  const dotSeriesKey = dotSeries === undefined ? undefined : JSON.stringify(dotSeries);

  return useMemo(
    () => convertRechartsToMaidr({
      id,
      title,
      subtitle,
      caption,
      data,
      chartType,
      categoryAxisReversed,
      categoryAxisReversedPerPanel,
      stepDirection,
      pieAngles,
      dotSeries: dotSeriesKey === undefined
        ? undefined
        : (JSON.parse(dotSeriesKey) as (string | null)[]),
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
      ridgelineConfig,
      hexbinConfig,
      boxenConfig,
      selectorOverride,
    }),
    [id, title, subtitle, caption, data, chartType, categoryAxisReversed, categoryAxisReversedPerPanel, stepDirection, pieAngles, dotSeriesKey, xKey, yKeys, layers, subplots, columns, xLabel, yLabel, orientation, fillKeys, binConfig, flowConfig, volcanoConfig, errorConfig, forestConfig, survivalConfig, prCurveConfig, percentileBandConfig, waterfallConfig, ganttConfig, gaugeConfig, parallelConfig, ridgelineConfig, hexbinConfig, boxenConfig, selectorOverride],
  );
}
