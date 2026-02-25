import type { Maidr as MaidrData, MaidrLayer } from '@type/grammar';
import type { JSX } from 'react';
import type { MaidrVictoryProps, VictoryLayerInfo } from './types';
import { useLayoutEffect, useRef, useState } from 'react';
import { Maidr } from '../maidr-component';
import { extractVictoryLayers, toMaidrLayer } from './adapter';
import { clearTaggedElements, tagLayerElements } from './selectors';

/**
 * Collects all legend labels across layers that define them.
 */
function collectLegend(layers: VictoryLayerInfo[]): string[] | undefined {
  const allLabels: string[] = [];
  for (const layer of layers) {
    if (layer.legend)
      allLabels.push(...layer.legend);
  }
  return allLabels.length > 0 ? allLabels : undefined;
}

/**
 * Produces a stable, serialisable fingerprint from extracted Victory layers.
 *
 * React `children` creates a new object reference on every render, which
 * makes it an unstable dependency for hooks. Instead we compare the
 * JSON-serialisable layer data: if the actual chart data hasn't changed
 * the effect can skip DOM re-tagging.
 */
function layerFingerprint(layers: VictoryLayerInfo[]): string {
  return JSON.stringify(layers.map(l => ({
    t: l.victoryType,
    d: l.data,
    n: l.dataCount,
  })));
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
  const prevFingerprintRef = useRef<string>('');
  const [maidrData, setMaidrData] = useState<MaidrData>(() => ({
    id,
    title,
    subtitle,
    caption,
    subplots: [[{ layers: [] }]],
  }));

  // useLayoutEffect runs synchronously after DOM mutations, before paint.
  // This guarantees Victory's SVG elements exist when we inspect the DOM
  // for selector tagging.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container)
      return;

    // Extract data from Victory component props via React children
    // introspection (pure computation, does not require DOM).
    const victoryLayers = extractVictoryLayers(children);

    // Skip DOM re-tagging when the underlying data hasn't changed.
    // This avoids redundant work when the parent re-renders with the
    // same chart data (children reference changes but content is equal).
    const fp = layerFingerprint(victoryLayers);
    if (fp === prevFingerprintRef.current)
      return;
    prevFingerprintRef.current = fp;

    // Clear stale data-maidr-victory-* attributes from a previous tagging
    // pass to avoid ghost selectors.
    clearTaggedElements(container);

    if (victoryLayers.length === 0) {
      // Preserve metadata (title, subtitle, caption) even when no
      // supported Victory data components are found.
      setMaidrData({
        id,
        title,
        subtitle,
        caption,
        subplots: [[{ layers: [] }]],
      });
      return;
    }

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
        legend: collectLegend(victoryLayers),
      }]],
    });
  });

  return (
    <Maidr data={maidrData}>
      <div ref={containerRef}>
        {children}
      </div>
    </Maidr>
  );
}
