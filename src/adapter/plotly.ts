import type { Maidr } from '../type/grammar';

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
 */
function wrapSubplotBackgrounds(svg: SVGSVGElement, schema: Maidr): void {
  const bglayer = svg.querySelector('.bglayer');
  if (!bglayer || bglayer.hasAttribute('data-maidr')) {
    return;
  }
  bglayer.setAttribute('data-maidr', '1');

  // Deduplicate rects by position and sort row-major.
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

  // Extract selector IDs from schema (row-major order).
  const selectorIds: string[] = [];
  const subplots = schema.subplots ?? [];
  for (const row of subplots) {
    for (const cell of row) {
      const sel = cell.selector;
      if (sel) {
        const m = sel.match(/id="([^"]+)"/);
        if (m)
          selectorIds.push(m[1]);
      }
    }
  }

  // Wrap each unique rect in a <g> with the subplot ID.
  const ns = 'http://www.w3.org/2000/svg';
  const count = Math.min(unique.length, selectorIds.length);
  for (let i = 0; i < count; i++) {
    const rect = unique[i];
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('id', selectorIds[i]);
    rect.parentNode!.insertBefore(g, rect);
    g.appendChild(rect);
  }

  // Mirror stroke changes from hidden clones to visible originals.
  setupStrokeMirror(bglayer as SVGGElement);
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

const OBSERVER_KEY = '__maidr_observers__';

/**
 * Stores a MutationObserver reference on a DOM element so it can be
 * disconnected later (e.g. when the Controller disposes).
 */
function storeMutationObserver(el: Element, observer: MutationObserver): void {
  const stored = (el as unknown as Record<string, MutationObserver[]>)[OBSERVER_KEY] ?? [];
  stored.push(observer);
  (el as unknown as Record<string, MutationObserver[]>)[OBSERVER_KEY] = stored;
}

/**
 * Disconnects all MAIDR MutationObservers stored on a DOM element.
 * Call this during disposal to prevent memory leaks.
 */
export function disconnectPlotlyObservers(root: Element): void {
  const elements = root.querySelectorAll(`[${OBSERVER_KEY}]`);
  for (const el of [root, ...elements]) {
    const stored = (el as unknown as Record<string, MutationObserver[]>)[OBSERVER_KEY];
    if (stored) {
      for (const observer of stored) {
        observer.disconnect();
      }
      delete (el as unknown as Record<string, MutationObserver[]>)[OBSERVER_KEY];
    }
  }
}
