import type { Maidr as MaidrData, MaidrLayer } from '@type/grammar';
import type { MaidrVictoryProps } from './types';
import type { JSX } from 'react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Maidr } from '../maidr-component';
import { extractVictoryLayers, toMaidrLayer } from './adapter';
import { tagLayerElements } from './selectors';

/**
 * Builds a minimal valid {@link MaidrData} object with no layers.
 * Used as the initial value before Victory elements have rendered.
 */
function emptyMaidrData(id: string): MaidrData {
  return { id, subplots: [[{ layers: [] }]] };
}

/**
 * React component that wraps Victory chart components and provides
 * accessible, non-visual access through MAIDR's audio sonification,
 * text descriptions, braille output, and keyboard navigation.
 *
 * Supports all Victory data components that have MAIDR equivalents:
 * - `VictoryBar` → bar chart
 * - `VictoryLine` → line chart
 * - `VictoryArea` → line chart (filled)
 * - `VictoryScatter` → scatter plot
 * - `VictoryPie` → bar chart (categorical data)
 * - `VictoryBoxPlot` → box plot
 * - `VictoryCandlestick` → candlestick chart
 * - `VictoryHistogram` → histogram
 * - `VictoryGroup` → dodged/grouped bar chart
 * - `VictoryStack` → stacked bar chart
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
}: MaidrVictoryProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [maidrData, setMaidrData] = useState<MaidrData>(() => emptyMaidrData(id));

  // Extract data from Victory component props (pure computation, no DOM).
  // Memoized so that the useLayoutEffect only re-runs when Victory data
  // actually changes rather than on every parent re-render.
  const victoryLayers = useMemo(() => extractVictoryLayers(children), [children]);

  // useLayoutEffect runs synchronously after DOM mutations, before paint.
  // This guarantees Victory's SVG elements exist when we inspect the DOM
  // for selector tagging.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || victoryLayers.length === 0) return;

    // Tag rendered SVG elements with data attributes for reliable
    // CSS-selector-based highlighting.
    const claimed = new Set<Element>();
    const maidrLayers: MaidrLayer[] = victoryLayers.map((layer, index) => {
      const selector = tagLayerElements(container, layer, index, claimed);
      return toMaidrLayer(layer, selector);
    });

    // Build the MAIDR data schema.
    setMaidrData({
      id,
      title,
      subtitle,
      caption,
      subplots: [[{
        layers: maidrLayers,
        legend: victoryLayers.find(l => l.legend)?.legend,
      }]],
    });
  }, [victoryLayers, id, title, subtitle, caption]);

  return (
    <Maidr data={maidrData}>
      <div ref={containerRef}>
        {children}
      </div>
    </Maidr>
  );
}
