import type { Maidr } from '../../type/grammar';
import type { PlotlyAxis, PlotlyFullLayout, PlotlyGraphDiv } from './types';

/**
 * Detects whether an SVG element lives inside a Plotly container.
 *
 * @param plot - The DOM element that carries the `maidr` attribute.
 * @returns `true` when the element is (or is inside) a Plotly-rendered chart.
 */
export function isPlotlyPlot(plot: HTMLElement): boolean {
  return (
    plot.classList.contains('main-svg')
    || plot.closest('.js-plotly-plot') !== null
  );
}

/**
 * Normalize a Plotly-rendered SVG so that maidr's core logic can treat it
 * the same as a matplotlib SVG.
 *
 * Responsibilities handled here (all Plotly-specific):
 *
 * 1. **Subplot background wrapping** – wrap bglayer `<rect>` elements in
 *    `<g id="axes_…">` groups so maidr can highlight subplots.
 * 2. **Stroke mirroring** – maidr clones elements as hidden backups and
 *    applies stroke to clones; a MutationObserver mirrors those changes
 *    back onto the visible originals.
 * 3. **CSS layout fixes** – Plotly's SVG is `position:absolute` inside a
 *    `position:relative` container; inject overrides so maidr's
 *    `<article>/<figure>` wrapper doesn't collapse.
 * 4. **React-container positioning** – push maidr's react-container below
 *    the chart by observing when it appears and adding padding.
 * 5. **Modebar accessibility** – remove Plotly's toolbar from the tab
 *    order and accessibility tree.
 * 6. **Click-to-focus** – forward clicks on Plotly's overlay SVGs to
 *    maidr's focusable wrapper.
 *
 * @param svg   - The `<svg class="main-svg">` element.
 * @param schema - The parsed MAIDR JSON schema.
 */
export function normalizePlotlySvg(
  svg: SVGSVGElement,
  schema: Maidr,
): void {
  // Resolve the plotly container for scoped queries.
  const plotlyDiv = svg.closest('.js-plotly-plot') as HTMLElement | null;

  wrapSubplotBackgrounds(svg, schema);
  injectPlotlyStyles();
  setupLayoutObserver(svg, plotlyDiv);
  fixModebarTabOrder(plotlyDiv);
  setupClickToFocus(plotlyDiv);
}

// ---------------------------------------------------------------------------
// 1. Subplot background wrapping
// ---------------------------------------------------------------------------

/**
 * Wrap Plotly bglayer rects in `<g>` elements for subplot highlighting.
 *
 * maidr detects multi-subplot figures via `g[id^="axes_"]` and highlights
 * the selected subplot by applying stroke to the first rect/path child.
 * We wrap the *original* Plotly rects (which have visible fill) so the
 * stroke border appears on the filled background.
 *
 * plotly draws NO per-panel background rects with its default styling
 * (`paper_bgcolor === plot_bgcolor`, both opaque), and a panel dropped from
 * the schema (unsupported trace types) leaves an extra rect behind. In both
 * cases positional rect↔panel matching is unsafe, so the association falls
 * back to each panel's axis pair (parsed from the selector id suffix): a
 * transparent rect sized from the panel's computed axis offsets is injected
 * into the `.bglayer` and wrapped instead. The resulting `g[id="axes_…"]`
 * groups also give the core real per-panel geometry for visual ordering and
 * vertical arrow-key direction.
 */
function wrapSubplotBackgrounds(svg: SVGSVGElement, schema: Maidr): void {
  const bglayer = svg.querySelector('.bglayer');
  if (!bglayer || bglayer.hasAttribute('data-maidr')) {
    return;
  }
  bglayer.setAttribute('data-maidr', '1');

  const unique = collectUniqueBgRects(bglayer);
  const panelIds = collectPanelSelectorIds(schema);

  if (panelIds.length > 0) {
    if (unique.length === panelIds.length) {
      // One rendered background rect per panel: associate positionally
      // (both sides are sorted row-major).
      wrapRects(unique, panelIds.map(panel => panel.id));
    } else {
      injectPanelRects(svg, bglayer, panelIds);
    }
  }

  // Mirror stroke changes from hidden clones to visible originals.
  setupStrokeMirror(bglayer as SVGGElement);
}

/** A panel's `g[id="axes_…"]` id together with its parsed axis-pair key. */
interface PanelSelectorId {
  id: string;
  /** Axis-pair key (e.g. `x2y2`) parsed from the id suffix, if present. */
  axisPair: string | null;
}

/**
 * Extracts the subplot selector ids from the schema (row-major order),
 * parsing the trailing axis-pair key the extractor embeds in each id.
 */
function collectPanelSelectorIds(schema: Maidr): PanelSelectorId[] {
  const ids: PanelSelectorId[] = [];
  for (const row of schema.subplots ?? []) {
    for (const cell of row) {
      const sel = cell.selector;
      if (!sel)
        continue;
      const idMatch = sel.match(/id="([^"]+)"/);
      if (!idMatch)
        continue;
      const pairMatch = idMatch[1].match(/_(x\d*y\d*)$/);
      ids.push({ id: idMatch[1], axisPair: pairMatch ? pairMatch[1] : null });
    }
  }
  return ids;
}

/**
 * Wraps each rect in a `<g>` carrying the panel id, in matching order.
 */
function wrapRects(rects: SVGRectElement[], ids: string[]): void {
  const ns = 'http://www.w3.org/2000/svg';
  const count = Math.min(rects.length, ids.length);
  for (let i = 0; i < count; i++) {
    const rect = rects[i];
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('id', ids[i]);
    rect.parentNode!.insertBefore(g, rect);
    g.appendChild(rect);
  }
}

/**
 * Injects one invisible rect per panel (sized from the panel's computed
 * axis `_offset`/`_length`) into the `.bglayer` and wraps each in its
 * `g[id="axes_…"]` group. Used when the rendered background rects cannot be
 * matched to panels positionally.
 */
function injectPanelRects(
  svg: SVGSVGElement,
  bglayer: Element,
  panelIds: PanelSelectorId[],
): void {
  const gd = svg.closest('.js-plotly-plot') as PlotlyGraphDiv | null;
  const layout = gd?._fullLayout;
  if (!layout) {
    console.warn(
      '[maidr] Plotly panel geometry unavailable; skipping subplot highlight wrapping.',
    );
    return;
  }

  const ns = 'http://www.w3.org/2000/svg';
  for (const { id, axisPair } of panelIds) {
    const frame = axisPair ? readPanelFrame(layout, axisPair) : null;
    if (!frame) {
      console.warn(
        `[maidr] Could not resolve plotly panel geometry for "${id}"; skipping its subplot highlight.`,
      );
      continue;
    }
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', String(frame.x));
    rect.setAttribute('y', String(frame.y));
    rect.setAttribute('width', String(frame.width));
    rect.setAttribute('height', String(frame.height));
    rect.setAttribute('fill', 'none');
    rect.setAttribute('pointer-events', 'none');
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('id', id);
    g.appendChild(rect);
    bglayer.appendChild(g);
  }
}

/** Splits an axis-pair key like `x2y2` into its x/y axis ids. */
function splitAxisPair(axisPair: string): [string, string] | null {
  const match = axisPair.match(/^(x\d*)(y\d*)$/);
  return match ? [match[1], match[2]] : null;
}

/**
 * Reads a panel's pixel frame from plotly's computed axis offsets
 * (`xaxis2._offset` is the panel's left edge, `yaxis2._offset` its top).
 */
function readPanelFrame(
  layout: PlotlyFullLayout,
  axisPair: string,
): { x: number; y: number; width: number; height: number } | null {
  const pair = splitAxisPair(axisPair);
  if (!pair)
    return null;
  const xAxis = getLayoutAxis(layout, pair[0]);
  const yAxis = getLayoutAxis(layout, pair[1]);
  if (
    xAxis?._offset == null || xAxis._length == null
    || yAxis?._offset == null || yAxis._length == null
  ) {
    return null;
  }
  return {
    x: xAxis._offset,
    y: yAxis._offset,
    width: xAxis._length,
    height: yAxis._length,
  };
}

/** Resolves `'x2'` → `layout.xaxis2`, `'y'` → `layout.yaxis`, etc. */
function getLayoutAxis(layout: PlotlyFullLayout, axisId: string): PlotlyAxis | undefined {
  const name = `${axisId.charAt(0)}axis${axisId.slice(1)}`;
  return layout[name] as PlotlyAxis | undefined;
}

/**
 * Collects the panel background `<rect>` elements of a Plotly `.bglayer`,
 * deduplicated by position and sorted row-major (top-left first).
 *
 * Shared by the normalizer (to wrap rects in `<g id="axes_…">` groups) and
 * the extractor (to verify that the kept-panel count matches the rendered
 * background count before emitting subplot selectors).
 */
export function collectUniqueBgRects(bglayer: Element): SVGRectElement[] {
  const bgRects = Array.from(bglayer.querySelectorAll<SVGRectElement>(':scope > rect'));
  const seen = new Set<string>();
  const unique: SVGRectElement[] = [];
  for (const rect of bgRects) {
    const key = `${rect.getAttribute('x')},${rect.getAttribute('y')}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(rect);
    }
  }
  unique.sort((a, b) => {
    const ay = Number.parseFloat(a.getAttribute('y') ?? '0');
    const by = Number.parseFloat(b.getAttribute('y') ?? '0');
    if (Math.abs(ay - by) > 1)
      return ay - by;
    return (
      Number.parseFloat(a.getAttribute('x') ?? '0')
      - Number.parseFloat(b.getAttribute('x') ?? '0')
    );
  });
  return unique;
}

/**
 * maidr clones each `<g id="axes_…">` as a hidden backup and applies
 * stroke to the clone.  This observer mirrors stroke/stroke-width
 * changes from hidden clones back to the visible originals so the
 * user sees the highlight.
 */
function setupStrokeMirror(bglayer: SVGGElement): void {
  const observer = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      if (mut.type !== 'attributes')
        continue;
      const target = mut.target as SVGElement;
      const hiddenGroup = target.closest(
        'g[id^="axes_"][visibility="hidden"]',
      );
      if (!hiddenGroup)
        continue;

      const visibleGroup = bglayer.querySelector(
        `g[id="${hiddenGroup.id}"]:not([visibility])`,
      );
      if (!visibleGroup)
        continue;

      const visibleRect = visibleGroup.querySelector('rect');
      if (!visibleRect)
        continue;

      const stroke = target.getAttribute('stroke');
      if (stroke) {
        visibleRect.setAttribute('stroke', stroke);
        visibleRect.setAttribute(
          'stroke-width',
          target.getAttribute('stroke-width') ?? '4',
        );
      } else {
        visibleRect.removeAttribute('stroke');
        visibleRect.removeAttribute('stroke-width');
      }
    }
  });

  observer.observe(bglayer, {
    attributes: true,
    attributeFilter: ['stroke', 'stroke-width'],
    subtree: true,
  });

  // Store reference for disposal.
  storeMutationObserver(bglayer, observer);
}

// ---------------------------------------------------------------------------
// 2. CSS layout fixes
// ---------------------------------------------------------------------------

/**
 * Inject CSS overrides so maidr's `<article>/<figure>` wrapper doesn't
 * collapse inside Plotly's absolutely-positioned SVG container.
 *
 * Scoped to `[data-maidr-auto]` to avoid affecting non-MAIDR plotly charts.
 */
function injectPlotlyStyles(): void {
  if (document.querySelector('style[data-maidr-plotly]')) {
    return;
  }
  const style = document.createElement('style');
  style.setAttribute('data-maidr-plotly', '1');
  style.textContent = `
    .js-plotly-plot[data-maidr-auto] .svg-container { overflow: visible !important; }
    .js-plotly-plot .svg-container article[id^="maidr-article"] {
      position: relative !important;
      width: 100% !important;
    }
    .js-plotly-plot .svg-container article[id^="maidr-article"] > figure {
      position: relative !important;
      width: 100% !important;
    }
    .js-plotly-plot[data-maidr-auto] { overflow: visible !important; }
    .js-plotly-plot .svg-container:focus-within {
      outline: 2px solid #4A90D9;
      outline-offset: 2px;
    }
    figure[id^="maidr-figure"] > div[tabindex="0"]:focus {
      outline: none !important;
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// 3. React-container positioning
// ---------------------------------------------------------------------------

/**
 * After maidr wraps the SVG, it remains `position:absolute` (Plotly
 * default) so the react-container renders at y=0, hidden behind the
 * chart.  Watch for the react-container to appear and push it below
 * the chart with padding-top.
 *
 * @param svg        - The main-svg element.
 * @param plotlyDiv  - The `.js-plotly-plot` container (for scoped queries).
 */
function setupLayoutObserver(svg: SVGSVGElement, plotlyDiv: HTMLElement | null): void {
  const scope = plotlyDiv ?? document;

  // Guard: install the layout observer at most once per chart. `normalizePlotlySvg`
  // re-runs on every maidr-attribute change; without this each re-init would spawn
  // another rAF polling loop and article MutationObserver that never get cleaned up.
  const guardEl = plotlyDiv ?? svg;
  if (guardEl.hasAttribute('data-maidr-layout-observer')) {
    return;
  }
  guardEl.setAttribute('data-maidr-layout-observer', '1');

  function fix(): void {
    const rc = scope.querySelector<HTMLElement>(
      'div[id^="react-container-"]',
    );
    if (rc && svg) {
      const h
        = svg.getAttribute('height')
          ?? String(svg.getBoundingClientRect().height);
      if (h) {
        rc.style.paddingTop = `${Number.parseFloat(h)}px`;
        requestAnimationFrame(() => {
          try {
            window.dispatchEvent(new Event('resize'));
          } catch {
            // ignore
          }
        });
      }
    }
  }

  function observe(): void {
    // Bail if the chart SVG has left the document — otherwise the rAF loop would
    // spin forever (retaining svg/plotlyDiv via closure) when the article that
    // it polls for never appears.
    if (!svg.isConnected) {
      return;
    }
    const article = scope.querySelector(
      'article[id^="maidr-article"]',
    );
    if (!article) {
      requestAnimationFrame(observe);
      return;
    }
    const observer = new MutationObserver(() => fix());
    observer.observe(article, {
      childList: true,
      subtree: true,
    });

    // Store reference for disposal.
    storeMutationObserver(article, observer);
  }

  // Defer until maidr has created its article wrapper.
  requestAnimationFrame(observe);
}

// ---------------------------------------------------------------------------
// 4. Modebar accessibility
// ---------------------------------------------------------------------------

/**
 * Remove Plotly's modebar (toolbar) from the tab order and accessibility
 * tree so Tab goes directly to maidr's focusable div.
 *
 * @param plotlyDiv - The `.js-plotly-plot` container (for scoped queries).
 */
function fixModebarTabOrder(plotlyDiv: HTMLElement | null): void {
  const scope = plotlyDiv ?? document;
  const modebar = scope.querySelector('.modebar-container');
  if (!modebar)
    return;

  modebar.setAttribute('aria-hidden', 'true');
  modebar.setAttribute('tabindex', '-1');

  const focusable = modebar.querySelectorAll<HTMLElement>(
    'a, button, input, [tabindex]',
  );
  for (const el of focusable) {
    el.setAttribute('tabindex', '-1');
  }
}

// ---------------------------------------------------------------------------
// 5. Click-to-focus delegation
// ---------------------------------------------------------------------------

/**
 * Plotly renders overlay SVGs that capture mouse events.  After maidr
 * wraps `svg.main-svg`, these overlays are siblings outside the wrapper.
 * Forward clicks to maidr's focusable div.
 *
 * @param plotlyDiv - The `.js-plotly-plot` container (for scoped queries).
 */
function setupClickToFocus(plotlyDiv: HTMLElement | null): void {
  const container = plotlyDiv
    ?? document.querySelector('.js-plotly-plot')
    ?? document.querySelector('.svg-container');
  if (!container)
    return;

  // Guard: install the capture click listener at most once per container.
  // `normalizePlotlySvg` re-runs on every maidr-attribute change; the anonymous
  // listener below cannot be removed, so without this it would accumulate.
  if (container.hasAttribute('data-maidr-click-focus'))
    return;
  container.setAttribute('data-maidr-click-focus', '1');

  container.addEventListener(
    'click',
    () => {
      const wrapper = container.querySelector<HTMLElement>(
        'figure[id^="maidr-figure"] > div[tabindex="0"]',
      );
      if (wrapper)
        wrapper.focus();
    },
    true,
  );
}

// ---------------------------------------------------------------------------
// MutationObserver disposal tracking
// ---------------------------------------------------------------------------

/**
 * WeakMap to track MutationObservers attached to DOM elements.
 * Using WeakMap ensures observers are automatically cleaned up when
 * elements are garbage collected, and avoids the issue of storing
 * JS properties that can't be queried via CSS selectors.
 */
const observerRegistry = new WeakMap<Element, MutationObserver[]>();

/**
 * Tracks all elements that have observers registered, so we can
 * iterate them during disposal. WeakSet would lose references.
 */
const trackedElements = new Set<Element>();

/**
 * Stores a MutationObserver reference on a DOM element so it can be
 * disconnected later (e.g. when the Controller disposes).
 */
function storeMutationObserver(el: Element, observer: MutationObserver): void {
  // Release observers whose element has left the DOM so the strong
  // `trackedElements` Set doesn't pin detached nodes against GC across SPA
  // re-renders (these observers are page-lifetime, not per-focus-session).
  pruneDisconnectedObservers();

  const stored = observerRegistry.get(el) ?? [];
  stored.push(observer);
  observerRegistry.set(el, stored);
  trackedElements.add(el);
}

/**
 * Disconnects and forgets observers whose host element is no longer attached to
 * the document, keeping {@link trackedElements} bounded over the page lifetime.
 */
function pruneDisconnectedObservers(): void {
  for (const el of trackedElements) {
    if (el.isConnected)
      continue;
    const observers = observerRegistry.get(el);
    if (observers) {
      for (const observer of observers) {
        observer.disconnect();
      }
      observerRegistry.delete(el);
    }
    trackedElements.delete(el);
  }
}

/**
 * Disconnects all MAIDR MutationObservers associated with a DOM element
 * and its descendants. Call this during disposal to prevent memory leaks.
 */
export function disconnectPlotlyObservers(root: Element): void {
  // Disconnect observers on root
  const rootObservers = observerRegistry.get(root);
  if (rootObservers) {
    for (const observer of rootObservers) {
      observer.disconnect();
    }
    observerRegistry.delete(root);
    trackedElements.delete(root);
  }

  // Disconnect observers on any tracked descendants
  for (const el of trackedElements) {
    if (root.contains(el)) {
      const observers = observerRegistry.get(el);
      if (observers) {
        for (const observer of observers) {
          observer.disconnect();
        }
        observerRegistry.delete(el);
      }
      trackedElements.delete(el);
    }
  }
}
