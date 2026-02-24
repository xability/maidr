/**
 * CSS selector generation for amCharts 5 SVG elements.
 *
 * amCharts 5 uses a Canvas-based renderer by default. When SVG output is
 * available (e.g. exported SVG or a custom SVG renderer), this module
 * attempts to build CSS selectors that map each data point to its
 * corresponding SVG element so MAIDR can highlight it during navigation.
 *
 * If the chart container does not contain queryable SVG children, the
 * functions here return `undefined` and MAIDR will simply skip visual
 * highlighting for that layer.
 */

import type { AmXYSeries } from './types';

/**
 * Attempt to build a CSS selector string for the SVG elements of a
 * column (bar) series.
 *
 * amCharts 5 column series expose individual column sprites that may
 * reference real DOM nodes when rendering to SVG/Canvas with accessible
 * DOM overlays.
 *
 * @returns A CSS selector string, or `undefined` if no SVG elements
 *          are found.
 */
export function buildColumnSelector(
  series: AmXYSeries,
  containerEl: HTMLElement,
): string | undefined {
  // Strategy 1: series.columns contains sprites with .dom references.
  const columns = series.columns;
  if (columns && columns.values.length > 0) {
    const first = columns.values[0];
    if (first?.dom) {
      return buildSelectorFromSprites(columns.values, containerEl);
    }
  }

  // Strategy 2: look for rect or path elements inside an amCharts
  // series group identified by a data attribute or role.
  const uid = series.uid;
  if (uid != null) {
    const candidate = `[data-am-id="${uid}"] rect, [data-am-id="${uid}"] path`;
    if (containerEl.querySelector(candidate))
      return candidate;
  }

  return undefined;
}

/**
 * Attempt to build a CSS selector string for a line series.
 *
 * Line series typically render a single `<path>` for the stroke.
 * MAIDR line traces use an array of selectors (one per line group),
 * but individual point highlighting relies on bullets.
 */
export function buildLineSelector(
  series: AmXYSeries,
  containerEl: HTMLElement,
): string | undefined {
  // Try bullet sprites first (for individual point highlighting).
  const bullets = series.bullets;
  if (bullets && bullets.values.length > 0) {
    const first = bullets.values[0];
    const sprite = first?.sprite;
    if (sprite?.dom) {
      return buildSelectorFromBullets(bullets.values, containerEl);
    }
  }

  // Fallback: try the stroke path.
  const strokes = series.strokes;
  if (strokes && strokes.values.length > 0) {
    const first = strokes.values[0];
    if (first?.dom) {
      return selectorForElement(first.dom, containerEl);
    }
  }

  return undefined;
}

/**
 * Attempt to build a CSS selector string for scatter (bullet) series.
 */
export function buildScatterSelector(
  series: AmXYSeries,
  containerEl: HTMLElement,
): string | undefined {
  return buildLineSelector(series, containerEl);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a single CSS selector that matches all sprite DOM elements
 * using a shared parent + tag strategy.
 */
function buildSelectorFromSprites(
  sprites: Array<{ dom?: SVGElement }>,
  container: HTMLElement,
): string | undefined {
  const doms = sprites.map(s => s.dom).filter(Boolean) as SVGElement[];
  if (doms.length === 0)
    return undefined;
  return buildCommonSelector(doms, container);
}

function buildSelectorFromBullets(
  bullets: Array<{ sprite?: { dom?: SVGElement } }>,
  container: HTMLElement,
): string | undefined {
  const doms = bullets
    .map(b => b.sprite?.dom)
    .filter(Boolean) as SVGElement[];
  if (doms.length === 0)
    return undefined;
  return buildCommonSelector(doms, container);
}

/**
 * Given a set of SVG elements, find a common parent and produce a
 * CSS selector that matches exactly those elements.
 */
function buildCommonSelector(
  elements: SVGElement[],
  _container: HTMLElement,
): string | undefined {
  if (elements.length === 0)
    return undefined;

  const first = elements[0];
  const parent = first.parentElement;
  if (!parent)
    return undefined;

  // Use the parent's id if available.
  const parentId = parent.id || parent.getAttribute('data-am-id');
  const tag = first.tagName.toLowerCase();

  if (parentId) {
    return `#${CSS.escape(parentId)} > ${tag}`;
  }

  // Fallback: use the element's tag plus class.
  const cls = first.getAttribute('class');
  if (cls) {
    return `${tag}.${CSS.escape(cls.split(' ')[0])}`;
  }

  return undefined;
}

/**
 * Build a selector for a single SVG element.
 */
function selectorForElement(
  el: SVGElement,
  _container: HTMLElement,
): string | undefined {
  if (el.id)
    return `#${CSS.escape(el.id)}`;
  const cls = el.getAttribute('class');
  if (cls)
    return `${el.tagName.toLowerCase()}.${CSS.escape(cls.split(' ')[0])}`;
  return undefined;
}
