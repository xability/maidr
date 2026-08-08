import type { JSX } from 'react';
import type { MaidrVictoryProps } from './types';
import { useRef } from 'react';
import { Maidr } from '../../maidr-component';
import { useVictoryAdapter } from './useVictoryAdapter';

/**
 * React component that wraps Victory chart components and provides
 * accessible, non-visual access through MAIDR's audio sonification,
 * text descriptions, braille output, and keyboard navigation.
 *
 * Supports the Victory data components that have MAIDR equivalents:
 * - `VictoryBar` → bar chart
 * - `VictoryLine` → line chart
 * - `VictoryScatter` → scatter plot
 * - `VictoryStack` → stacked bar chart
 * - `VictoryHistogram` → histogram
 * - `VictoryBoxPlot` → box plot
 * - `VictoryCandlestick` → candlestick chart
 *
 * Multi-panel figures: nest two or more `<VictoryChart>` components — each
 * chart becomes one navigable MAIDR subplot. Give each chart a `title` prop
 * to name its panel, and use the `layout` prop for row-major grid chunking
 * (default is a single row in children order).
 *
 * @example
 * ```tsx
 * import { MaidrVictory } from 'maidr/victory';
 * import { VictoryChart, VictoryBar } from 'victory';
 *
 * function AccessibleBarChart() {
 *   return (
 *     <MaidrVictory id="sales" title="Sales by Quarter">
 *       <VictoryChart>
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
 */
export function MaidrVictory({
  id,
  title,
  subtitle,
  caption,
  children,
  layout,
}: MaidrVictoryProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const maidrData = useVictoryAdapter({ id, title, subtitle, caption, children, layout }, containerRef);

  return (
    <Maidr data={maidrData}>
      <div ref={containerRef}>
        {children}
      </div>
    </Maidr>
  );
}
