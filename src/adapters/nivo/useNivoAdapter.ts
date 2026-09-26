/**
 * React hook that converts a Nivo chart's props into MAIDR data.
 *
 * The data is read from the props the chart is rendered with, so it exists
 * from the first render. The highlight selectors need the rendered SVG, which
 * Nivo draws after mount — and a `Responsive*` chart only once it has
 * measured its parent — so they are resolved in a `useLayoutEffect`, and
 * resolved again by a `MutationObserver` once a tagged mark is replaced, or
 * while any are still missing and the chart has drawn something new. The same
 * observer keeps MAIDR's highlight copies on marks Nivo moves in place.
 *
 * @example
 * ```tsx
 * import { useRef } from 'react';
 * import { Maidr } from 'maidr/react';
 * import { useNivoAdapter } from 'maidr/nivo';
 * import { Bar } from '@nivo/bar';
 *
 * function AccessibleChart() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const props = { data, keys: ['sales'], indexBy: 'quarter', width: 600, height: 400 };
 *   const maidrData = useNivoAdapter({ id: 'sales', title: 'Sales', type: 'bar', props }, containerRef);
 *
 *   return (
 *     <Maidr data={maidrData}>
 *       <div ref={containerRef}><Bar {...props} /></div>
 *     </Maidr>
 *   );
 * }
 * ```
 */

import type { Maidr as MaidrData } from '@type/grammar';
import type { RefObject } from 'react';
import type { NivoAdapterConfig, NivoLayerInfo } from './types';
import { cssEscape, ensureContainerId } from '@adapters/shared/selectorUtil';
import { useLayoutEffect, useRef, useState } from 'react';
import { assembleNivoFigure, extractNivoLayers, nivoToMaidr } from './converters';
import {
  clearTaggedElements,
  drawnSignature,
  GEOMETRY_ATTRIBUTES,
  getTaggedElements,
  resolveNivoSelectors,
  syncHighlightCopies,
} from './selectors';

/**
 * Builds the MAIDR data for a chart rendered inside `container`, tagging the
 * marks Nivo does not stamp itself.
 *
 * @param container - The element the chart is rendered in
 * @param config - The chart's metadata, type and props
 * @param scope - The chart's scope prefix, e.g. `'#chart '`
 * @param layers - The chart's layers, when already extracted from `config`
 * @returns The data, and whether every layer's marks were found
 */
export function buildNivoData(
  container: HTMLElement,
  config: NivoAdapterConfig,
  scope: string,
  layers: NivoLayerInfo[] = extractNivoLayers(config.type, config.props),
): { data: MaidrData; complete: boolean } {
  clearTaggedElements(container);
  const selectors = resolveNivoSelectors(container, layers, scope);
  return {
    data: assembleNivoFigure(config, layers, selectors),
    complete: selectors.every(selector => selector !== undefined),
  };
}

/**
 * Converts a Nivo chart's props into MAIDR data, naming the rendered marks
 * inside `containerRef` for highlighting.
 *
 * @param config - Chart metadata, the Nivo chart type, and its props
 * @param containerRef - Ref to the DOM node wrapping the rendered Nivo chart
 * @returns MaidrData ready to pass to `<Maidr data={...}>`
 */
export function useNivoAdapter(
  config: NivoAdapterConfig,
  containerRef: RefObject<HTMLDivElement | null>,
): MaidrData {
  const { id, title, subtitle, caption, type, props } = config;
  // Read on the first render without a DOM, so the chart announces from the
  // start; the layout effect adds the selectors before the first paint.
  const [maidrData, setMaidrData] = useState<MaidrData>(() => nivoToMaidr(config));
  const publishedRef = useRef<string>(JSON.stringify(maidrData));
  // What the last full pass read, whether it found every mark, and what the
  // chart had drawn when it looked. Kept across effect re-runs: a parent
  // re-render hands the chart a new `props` object with the same content,
  // which must not churn the DOM.
  const passRef = useRef<{ input: string; complete: boolean; tagged: Element[]; drawn: string }>({
    input: '',
    complete: false,
    tagged: [],
    drawn: '',
  });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container)
      return;

    // Scope every selector to this chart's own container, so two charts on a
    // page never cross-highlight (the model resolves selectors page-wide).
    const scope = `#${cssEscape(ensureContainerId(container, 'mn'))} `;
    const current: NivoAdapterConfig = { id, title, subtitle, caption, type, props };
    const layers = extractNivoLayers(type, props);
    const input = JSON.stringify([id, title, subtitle, caption, layers]);
    let frameId = 0;
    let resolvePending = false;
    let syncPending = false;

    const apply = (): void => {
      const pass = passRef.current;
      const drawn = drawnSignature(container);
      // Nothing to redo when the same chart was read before, every tagged
      // mark is still the one Nivo is showing, and either every mark was
      // found or the chart has drawn nothing new since the pass that missed
      // some. A layer that can never resolve (a canvas chart, a pie laid out
      // by value) then stops costing anything once the chart has settled.
      if (
        pass.input === input
        && pass.tagged.every(el => el.isConnected)
        && (pass.complete || pass.drawn === drawn)
      ) {
        return;
      }

      const { data, complete } = buildNivoData(container, current, scope, layers);
      passRef.current = { input, complete, tagged: getTaggedElements(container), drawn };

      const published = JSON.stringify(data);
      if (published === publishedRef.current)
        return;
      publishedRef.current = published;
      setMaidrData(data);
    };

    const onFrame = (): void => {
      frameId = 0;
      if (resolvePending)
        apply();
      if (syncPending)
        syncHighlightCopies(container);
      resolvePending = false;
      syncPending = false;
    };

    apply();

    // Child-list changes: try again once a tagged mark has been swapped out,
    // or while marks are missing and the chart has drawn something new.
    // Attribute changes to a mark's geometry: Nivo moved it in place, so
    // carry the move over to MAIDR's copies of it — only worth doing while
    // the plot is focused and such copies exist. Tagging writes no geometry
    // attribute, and the sync writes only on a change, so neither wakes the
    // observer for good.
    const observer = new MutationObserver((records) => {
      if (records.some(record => record.type === 'childList'))
        resolvePending = true;
      if (!syncPending && records.some(record => record.type === 'attributes')
        && container.querySelector('[data-maidr-owned]')) {
        syncPending = true;
      }
      if ((resolvePending || syncPending) && !frameId)
        frameId = requestAnimationFrame(onFrame);
    });
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [...GEOMETRY_ATTRIBUTES],
    });

    return () => {
      observer.disconnect();
      if (frameId)
        cancelAnimationFrame(frameId);
    };
  }, [containerRef, id, title, subtitle, caption, type, props]);

  return maidrData;
}
