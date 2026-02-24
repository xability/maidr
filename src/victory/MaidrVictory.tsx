import type { Maidr as MaidrData, MaidrLayer } from '@type/grammar';
import type { MaidrVictoryProps } from './types';
import type { JSX } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
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

  // useLayoutEffect runs synchronously after DOM mutations, before paint.
  // This guarantees Victory's SVG elements exist when we inspect the DOM.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Extract data from Victory component props via React children
    //    introspection (does not require DOM).
    const victoryLayers = extractVictoryLayers(children);
    if (victoryLayers.length === 0) return;

    // 2. Tag rendered SVG elements with data attributes for reliable
    //    CSS-selector-based highlighting.
    const claimed = new Set<Element>();
    const maidrLayers: MaidrLayer[] = victoryLayers.map((layer, index) => {
      const selector = tagLayerElements(container, layer, index, claimed);
      return toMaidrLayer(layer, selector);
    });

    // 3. Build the MAIDR data schema.
    setMaidrData({
      id,
      title,
      subtitle,
      caption,
      subplots: [[{ layers: maidrLayers }]],
    });
  }, [children, id, title, subtitle, caption]);

  return (
    <Maidr data={maidrData}>
      <div ref={containerRef}>
        {children}
      </div>
    </Maidr>
  );
}
