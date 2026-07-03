/**
 * React hook that converts Victory chart children into MAIDR data.
 *
 * Unlike config-based adapters, Victory data lives in the rendered SVG and in
 * the React children's props, so this hook introspects `children` and tags the
 * rendered SVG elements (via a container ref) inside a `useLayoutEffect`. It
 * returns the MaidrData ready to pass to the `<Maidr>` component's `data` prop.
 *
 * @example
 * ```tsx
 * import { useRef } from 'react';
 * import { Maidr } from 'maidr/react';
 * import { useVictoryAdapter } from 'maidr/victory';
 * import { VictoryChart, VictoryBar } from 'victory';
 *
 * function AccessibleChart() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const children = (
 *     <VictoryChart>
 *       <VictoryBar data={[{ x: 'Q1', y: 120 }, { x: 'Q2', y: 200 }]} />
 *     </VictoryChart>
 *   );
 *   const maidrData = useVictoryAdapter({ id: 'sales', title: 'Sales', children }, containerRef);
 *
 *   return (
 *     <Maidr data={maidrData}>
 *       <div ref={containerRef}>{children}</div>
 *     </Maidr>
 *   );
 * }
 * ```
 */

import type { Maidr as MaidrData, MaidrLayer } from '@type/grammar';
import type { RefObject } from 'react';
import type { VictoryAdapterConfig, VictoryLayerInfo } from './types';
import { cssEscape, ensureContainerId } from '@adapters/shared/selectorUtil';
import { useLayoutEffect, useRef, useState } from 'react';
import { extractVictoryLayers, toMaidrLayer } from './converters';
import { clearTaggedElements, getTaggedElements, tagLayerElements } from './selectors';

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
 * Converts Victory chart children into MAIDR data, tagging the rendered SVG
 * elements inside `containerRef` for highlight integration.
 *
 * @param config       - Chart metadata and the Victory children to introspect
 * @param containerRef - Ref to the DOM node wrapping the rendered Victory SVG
 * @returns MaidrData ready to pass to `<Maidr data={...}>`
 */
export function useVictoryAdapter(
  config: VictoryAdapterConfig,
  containerRef: RefObject<HTMLDivElement | null>,
): MaidrData {
  const { id, title, subtitle, caption, children } = config;
  const prevFingerprintRef = useRef<string>('');
  // Elements tagged by the most recent full pass. Hoisted to a component-level
  // ref so it survives effect re-runs (an unrelated parent re-render recreates
  // `children` and re-runs the effect). It lets `applyTags` and the observer
  // distinguish a Victory node swap (previously-tagged node now detached →
  // re-tag) from unrelated DOM changes such as highlight clones (no re-tag).
  const taggedElementsRef = useRef<Element[]>([]);
  const [maidrData, setMaidrData] = useState<MaidrData>(() => ({
    id,
    title,
    subtitle,
    caption,
    subplots: [[{ layers: [] }]],
  }));

  // useLayoutEffect runs synchronously after DOM mutations, before paint, so
  // Victory's SVG already exists when we inspect the DOM for selector tagging.
  //
  // Victory re-renders some marks after mount — notably line/area marks, whose
  // `<path>` lives in an async `<g clip-path>` container that Victory replaces
  // *after* our initial tag pass (bars have no such wrapper, so their tags
  // stick). A MutationObserver re-applies the `data-maidr-victory-*` attributes
  // when a tagged node is detached, so the selectors still resolve to the live
  // nodes when a trace is constructed on focus-in.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container)
      return;

    // Scope every emitted selector to this chart's own container so two or more
    // MaidrVictory charts on one page cannot cross-highlight (the model resolves
    // selectors via page-global document.querySelector). Idempotent per chart.
    const scope = `#${cssEscape(ensureContainerId(container, 'mv'))} `;

    let frameId = 0;

    const applyTags = (): void => {
      frameId = 0;

      // Extract data from Victory component props via React children
      // introspection (pure computation, does not require the DOM).
      const victoryLayers = extractVictoryLayers(children);
      const fp = layerFingerprint(victoryLayers);

      // Fast path: when the layer data is unchanged AND every previously-tagged
      // node is still connected, the existing data-maidr-victory-* attributes
      // (and thus the selectors) remain valid — skip the O(n) DOM clear and
      // re-tag entirely. This prevents a parent re-render (which recreates the
      // `children` reference and re-runs this effect) from churning the DOM.
      if (
        fp === prevFingerprintRef.current
        && taggedElementsRef.current.length > 0
        && taggedElementsRef.current.every(el => el.isConnected)
      ) {
        return;
      }

      // Full pass: (re)apply tags to the current Victory nodes.
      clearTaggedElements(container);
      const claimed = new Set<Element>();
      const maidrLayers: MaidrLayer[] = victoryLayers.map((layer, index) =>
        toMaidrLayer(layer, tagLayerElements(container, layer, index, claimed, scope)));
      taggedElementsRef.current = getTaggedElements(container);

      // Selector strings are stable (`#<id> [data-maidr-victory-N]`), so update
      // React state only when the underlying layer data actually changes —
      // re-tagging live nodes after a Victory node swap needs no re-render and
      // must never trigger a render loop.
      if (fp === prevFingerprintRef.current)
        return;
      prevFingerprintRef.current = fp;

      setMaidrData(victoryLayers.length === 0
        // Preserve metadata even when no supported Victory components are found.
        ? { id, title, subtitle, caption, subplots: [[{ layers: [] }]] }
        : {
            id,
            title,
            subtitle,
            caption,
            subplots: [[{ layers: maidrLayers, legend: collectLegend(victoryLayers) }]],
          });
    };

    // Initial synchronous tag pass.
    applyTags();

    // Re-tag only when a previously-tagged node was detached (Victory swapped it
    // out). Ignoring pure additions (e.g. highlight clones) avoids churn and the
    // risk of mis-tagging cloned data elements during navigation. We observe
    // childList/subtree only; our own tagging mutates attributes, so re-tagging
    // never re-triggers the observer.
    const observer = new MutationObserver(() => {
      if (frameId)
        return;
      if (taggedElementsRef.current.length === 0 || taggedElementsRef.current.every(el => el.isConnected))
        return;
      frameId = requestAnimationFrame(applyTags);
    });
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frameId)
        cancelAnimationFrame(frameId);
    };
  }, [children, id, title, subtitle, caption]);

  return maidrData;
}
