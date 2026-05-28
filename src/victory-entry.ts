/**
 * Public Victory adapter API for MAIDR.
 *
 * Provides a `<MaidrVictory>` wrapper component and a `useVictoryAdapter`
 * hook for making Victory charts accessible through MAIDR's audio
 * sonification, text descriptions, braille output, and keyboard navigation.
 *
 * @remarks
 * Requires React 18 or 19 and Victory as peer dependencies. The adapter
 * introspects the Victory chart's React children to extract data and tags
 * the rendered SVG elements with `data-maidr-victory-*` attributes for
 * highlighting.
 *
 * Supported Victory data components:
 * - `VictoryBar` → bar chart
 * - `VictoryLine` → line chart
 * - `VictoryScatter` → scatter plot
 * - `VictoryStack` → stacked bar chart
 * - `VictoryHistogram` → histogram
 * - `VictoryBoxPlot` → box plot
 * - `VictoryCandlestick` → candlestick chart
 *
 * @example Using the wrapper component
 * ```tsx
 * import { MaidrVictory } from 'maidr/victory';
 * import { VictoryAxis, VictoryBar, VictoryChart } from 'victory';
 *
 * function AccessibleChart() {
 *   return (
 *     <MaidrVictory id="my-chart" title="Revenue by Quarter">
 *       <VictoryChart>
 *         <VictoryAxis label="Quarter" />
 *         <VictoryAxis dependentAxis label="Revenue ($)" />
 *         <VictoryBar
 *           data={[
 *             { x: 'Q1', y: 120 },
 *             { x: 'Q2', y: 200 },
 *             { x: 'Q3', y: 150 },
 *             { x: 'Q4', y: 300 },
 *           ]}
 *         />
 *       </VictoryChart>
 *     </MaidrVictory>
 *   );
 * }
 * ```
 *
 * @example Using the hook with `<Maidr>`
 * ```tsx
 * import { useRef } from 'react';
 * import { Maidr } from 'maidr/react';
 * import { useVictoryAdapter } from 'maidr/victory';
 * import { VictoryChart, VictoryLine } from 'victory';
 *
 * function AccessibleLineChart() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const children = (
 *     <VictoryChart>
 *       <VictoryLine data={[{ x: 1, y: 10 }, { x: 2, y: 20 }]} />
 *     </VictoryChart>
 *   );
 *   const maidrData = useVictoryAdapter({ id: 'trend', title: 'Trend', children }, containerRef);
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
  extractVictoryLayers,
  MaidrVictory,
  toMaidrLayer,
  useVictoryAdapter,
} from './adapters/victory';

export type {
  MaidrVictoryProps,
  VictoryAdapterConfig,
  VictoryComponentType,
  VictoryLayerData,
  VictoryLayerInfo,
} from './adapters/victory';

// Re-export core types that consumers may need alongside the adapter.
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';
