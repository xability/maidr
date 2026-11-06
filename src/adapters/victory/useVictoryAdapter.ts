/**
 * React hook that converts Victory chart children into MAIDR data.
 *
 * Unlike config-based adapters, Victory data lives in the rendered SVG and in
 * the React children's props, so this hook introspects `children` and tags the
 * rendered SVG elements (via a container ref) inside a `useLayoutEffect`. It
 * returns the MaidrData ready to pass to the `<Maidr>` component's `data` prop.
 *
 * Multi-panel figures: when `children` contains two or more top-level
 * `<VictoryChart>` components, each chart becomes one MAIDR subplot (arrow
 * keys navigate panels; Enter drills into a panel). By default the panels
 * are arranged as they are drawn, and in a single row in children order when
 * they cannot be measured; pass `layout: { rows, columns }` for row-major grid
 * chunking.
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

import type { Maidr as MaidrData, MaidrSubplot } from '@type/grammar';
import type { RefObject } from 'react';
import type { VictoryAdapterConfig, VictoryLayerInfo, VictoryPanelBox, VictoryPanelLayout, VictorySubplotInfo } from './types';
import { cssEscape, ensureContainerId } from '@adapters/shared/selectorUtil';
import { useLayoutEffect, useRef, useState } from 'react';
import { arrangeByDrawnPosition, computeSubplotGrid, extractVictorySubplots, foldPercentileBands, toMaidrLayer } from './converters';
import { clearTaggedElements, getTaggedElements, PANEL_ATTR, resolvePanelSvgs, tagLayerElements } from './selectors';

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
 * Produces a stable, serialisable fingerprint from the extracted Victory
 * subplot structure.
 *
 * React `children` creates a new object reference on every render, which
 * makes it an unstable dependency for hooks. Instead we compare the
 * JSON-serialisable panel/layer data (plus the grid layout): if the actual
 * chart structure hasn't changed the effect can skip DOM re-tagging.
 */
function subplotFingerprint(subplots: VictorySubplotInfo[], layout?: VictoryPanelLayout): string {
  return JSON.stringify({
    r: layout?.rows ?? null,
    c: layout?.columns ?? null,
    p: subplots.map(s => ({
      title: s.title ?? null,
      layers: s.layers.map(l => ({
        t: l.victoryType,
        d: l.data,
        n: l.dataCount,
      })),
    })),
  });
}

/**
 * Tags the rendered Victory SVG(s) inside `container` and builds the MAIDR
 * subplot grid.
 *
 * Single-panel figures keep the original flat tagging
 * (`data-maidr-victory-<n>` attributes on the container's first svg) and the
 * original `[[{ layers, legend }]]` shape, byte-identical to previous output.
 *
 * Multi-panel figures resolve one svg per panel (bound via each panel's
 * `svgIndex` ordinal among all top-level Victory components, so non-chart
 * Victory siblings such as a standalone scatter or a shared legend cannot
 * shift the binding), stamp each panel svg with
 * `data-maidr-victory-panel="<i>"`, and emit panel-scoped attribute names and
 * selectors so panels can never cross-highlight. Each panel gets its own
 * `claimed` element set so tagging never leaks across panels.
 *
 * Without a `layout`, the panels are put in rows by where their svgs are
 * drawn ({@link arrangeByDrawnPosition}), and in one row in children order
 * when a panel was not laid out, as in a hidden tab; the hook arranges them
 * again when their container changes size.
 *
 * Panels whose charts contain no supported data are dropped (the core model
 * cannot represent an empty subplot inside a grid), but only AFTER grid
 * chunking: every remaining panel keeps the grid cell of the visual CSS
 * arrangement, and only rows left entirely empty are removed (the core cannot
 * represent empty rows; ragged rows navigate fine).
 */
export function buildVictorySubplots(
  container: HTMLElement,
  victorySubplots: VictorySubplotInfo[],
  scope: string,
  layout?: VictoryPanelLayout,
  percentileBands?: VictoryAdapterConfig['percentileBands'],
): MaidrSubplot[][] {
  if (victorySubplots.length === 1) {
    const victoryLayers = victorySubplots[0].layers;
    const svg = container.querySelector('svg');
    const claimed = new Set<Element>();
    const maidrLayers = foldPercentileBands(victoryLayers, victoryLayers.map((layer, index) =>
      toMaidrLayer(layer, svg ? tagLayerElements(svg, layer, index, claimed, scope) : undefined)), percentileBands);
    return [[{ layers: maidrLayers, legend: collectLegend(victoryLayers) }]];
  }

  const panelSvgs = resolvePanelSvgs(container, expectedSvgCount(victorySubplots));

  // `null` entries keep an empty panel's grid cell during chunking; they are
  // dropped per row afterwards.
  const entries: (MaidrSubplot | null)[] = victorySubplots.map((info, panelIndex) => {
    // Never emit an empty subplot inside a grid — the core model throws on it.
    if (info.layers.length === 0) {
      console.warn(
        `MAIDR: Victory panel ${panelIndex + 1} contains no supported data `
        + 'components and is omitted from subplot navigation.',
      );
      return null;
    }

    const svg: SVGElement | undefined = panelSvgs[info.svgIndex ?? panelIndex];
    let panelSelector: string | undefined;
    if (svg) {
      svg.setAttribute(PANEL_ATTR, String(panelIndex));
      panelSelector = `${scope}[${PANEL_ATTR}="${panelIndex}"]`;
    }

    const panelScope = panelSelector ? `${panelSelector} ` : undefined;
    const claimed = new Set<Element>();
    const maidrLayers = foldPercentileBands(info.layers, info.layers.map((layer, layerIndex) =>
      toMaidrLayer(layer, svg && panelScope
        ? tagLayerElements(svg, layer, layerIndex, claimed, panelScope, panelIndex)
        : undefined)), percentileBands);

    // The first layer's title is the panel's display name in MAIDR's subplot
    // summaries (there is no subplot-level title field in the grammar).
    maidrLayers[0].title = info.title ?? `Panel ${panelIndex + 1}`;

    return {
      layers: maidrLayers,
      legend: collectLegend(info.layers),
      selector: panelSelector,
    };
  });

  const grid = layout === undefined
    ? arrangeByDrawnPosition(entries, drawnBoxes(victorySubplots, panelSvgs)) ?? computeSubplotGrid(entries)
    : computeSubplotGrid(entries, layout);
  return grid
    .map(row => row.filter((subplot): subplot is MaidrSubplot => subplot !== null))
    .filter(row => row.length > 0);
}

/**
 * How many top-level Victory svgs a multi-panel figure draws. Standalone
 * Victory siblings render their own svgs too, so the count is driven by the
 * highest svg ordinal, not the panel count.
 *
 * @param victorySubplots - The figure's panels
 * @returns The svg count
 */
function expectedSvgCount(victorySubplots: VictorySubplotInfo[]): number {
  return victorySubplots.reduce(
    (max, info, index) => Math.max(max, (info.svgIndex ?? index) + 1),
    0,
  );
}

/**
 * Where each panel's chart is drawn on the page.
 *
 * @param victorySubplots - The figure's panels
 * @param panelSvgs - The figure's top-level Victory svgs
 * @returns One box per panel, or null where it has none
 */
function drawnBoxes(victorySubplots: VictorySubplotInfo[], panelSvgs: SVGElement[]): (VictoryPanelBox | null)[] {
  return victorySubplots.map((info, panelIndex) => drawnBox(panelSvgs[info.svgIndex ?? panelIndex]));
}

/**
 * The rows a multi-panel figure's panels are drawn in, as panel indices, for
 * telling a pass that finds them laid out otherwise from one that finds them
 * where they were.
 *
 * @param container - Where the figure is drawn
 * @param victorySubplots - The figure's panels
 * @returns The rows, or null for one panel or panels not laid out
 */
function drawnArrangement(container: HTMLElement, victorySubplots: VictorySubplotInfo[]): number[][] | null {
  if (victorySubplots.length < 2) {
    return null;
  }
  const panelSvgs = resolvePanelSvgs(container, expectedSvgCount(victorySubplots));
  return arrangeByDrawnPosition(victorySubplots.map((_, panelIndex) => panelIndex), drawnBoxes(victorySubplots, panelSvgs));
}

/**
 * Where a panel's chart is drawn on the page.
 *
 * @param svg - The panel's svg, when it has one
 * @returns Its box, or null when it has none or was not laid out
 */
function drawnBox(svg: SVGElement | undefined): VictoryPanelBox | null {
  if (svg === undefined) {
    return null;
  }
  const { top, left, height } = svg.getBoundingClientRect();
  return height > 0 ? { top, left, height } : null;
}

/**
 * Converts Victory chart children into MAIDR data, tagging the rendered SVG
 * elements inside `containerRef` for highlight integration.
 *
 * @param config       - Chart metadata, optional multi-panel layout, and the
 *                       Victory children to introspect
 * @param containerRef - Ref to the DOM node wrapping the rendered Victory SVG(s)
 * @returns MaidrData ready to pass to `<Maidr data={...}>`
 */
export function useVictoryAdapter(
  config: VictoryAdapterConfig,
  containerRef: RefObject<HTMLDivElement | null>,
): MaidrData {
  const { id, title, subtitle, caption, children, layout, percentileBands } = config;
  // Compared by content: an inline option literal is a new object every render.
  const bandsKey = JSON.stringify(percentileBands ?? null);
  // Primitive layout deps: an inline `layout` object literal would re-run the
  // effect on every render.
  const layoutRows = layout?.rows;
  const layoutColumns = layout?.columns;
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
    // MaidrVictory charts on one page cannot cross-highlight wherever a selector
    // is read. Idempotent per chart.
    const scope = `#${cssEscape(ensureContainerId(container, 'mv'))} `;
    const panelLayout: VictoryPanelLayout | undefined
      = layoutRows !== undefined || layoutColumns !== undefined
        ? { rows: layoutRows, columns: layoutColumns }
        : undefined;

    let frameId = 0;

    const applyTags = (): void => {
      frameId = 0;

      // Extract data from Victory component props via React children
      // introspection (pure computation, does not require the DOM).
      const victorySubplots = extractVictorySubplots(children);
      // The figure's metadata is part of what gets published, so a change to
      // it alone must republish too.
      const fp = JSON.stringify([
        id ?? null,
        title ?? null,
        subtitle ?? null,
        caption ?? null,
        bandsKey,
        subplotFingerprint(victorySubplots, panelLayout),
        // The rows the panels are drawn in, which decide the grid when no
        // layout does: a pass that finds them laid out otherwise republishes.
        panelLayout === undefined ? drawnArrangement(container, victorySubplots) : null,
      ]);

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
      const subplots = buildVictorySubplots(container, victorySubplots, scope, panelLayout, percentileBands);
      taggedElementsRef.current = getTaggedElements(container);

      // Selector strings are stable (`#<id> [data-maidr-victory-N]`), so update
      // React state only when the underlying layer data actually changes —
      // re-tagging live nodes after a Victory node swap needs no re-render and
      // must never trigger a render loop.
      if (fp === prevFingerprintRef.current)
        return;
      prevFingerprintRef.current = fp;

      const hasLayers = subplots.some(row => row.some(subplot => subplot.layers.length > 0));
      setMaidrData(hasLayers
        ? { id, title, subtitle, caption, subplots }
        // Preserve metadata even when no supported Victory components are found.
        : { id, title, subtitle, caption, subplots: [[{ layers: [] }]] });
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

    // Without a layout, the grid is the rows the charts are drawn in, and the
    // container changes size when those can change: a figure read in a tab
    // not shown yet is laid out when the tab is shown, and a page that wraps
    // its charts at another width lays them out again. Read once, the first
    // stayed one row in children order for good.
    const arranged = panelLayout === undefined && extractVictorySubplots(children).length > 1;
    const resizeObserver = arranged && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (!frameId)
            frameId = requestAnimationFrame(applyTags);
        })
      : null;
    resizeObserver?.observe(container);

    return () => {
      observer.disconnect();
      resizeObserver?.disconnect();
      if (frameId)
        cancelAnimationFrame(frameId);
    };
    // `percentileBands` is read through `bandsKey`, which changes with its content.
  }, [children, id, title, subtitle, caption, layoutRows, layoutColumns, bandsKey]);

  return maidrData;
}
