/**
 * Victory charting library adapter for MAIDR.
 *
 * Provides the `<MaidrVictory>` component that wraps Victory chart components
 * and automatically adds accessible, non-visual access through audio
 * sonification, text descriptions, braille output, and keyboard navigation.
 *
 * @remarks
 * Requires `victory` and React 18+ as peer dependencies.
 *
 * @example
 * ```tsx
 * import { MaidrVictory } from 'maidr/victory';
 * import { VictoryChart, VictoryBar, VictoryAxis } from 'victory';
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
 * @packageDocumentation
 */
export { MaidrVictory } from './MaidrVictory';
export type { MaidrVictoryProps } from './types';
