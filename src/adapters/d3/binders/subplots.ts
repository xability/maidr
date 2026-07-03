/**
 * Multi-panel D3 binders: faceted small multiples and heterogeneous
 * subplot grids.
 *
 * D3 has no declarative facet API — the community idiom is one translated
 * `<g>` per panel inside a single `<svg>`. These binders compose the existing
 * per-type extraction cores (`buildBarLayer`, `buildLineLayer`, …) across
 * panels and assemble a multi-subplot MAIDR figure:
 *
 * - {@link bindD3Facets} — the SAME chart type repeated in every panel
 *   (small multiples), panels discovered via a `panelSelector`.
 * - {@link bindD3Subplots} — DIFFERENT chart types per panel, each with its
 *   own config and DOM root.
 *
 * Panel isolation: MAIDR resolves selectors via page-global
 * `document.querySelector`, so each panel element is stamped with a
 * `data-maidr-panel="<i>"` attribute and every emitted layer selector is
 * prefixed `#<svgId> [data-maidr-panel="<i>"]` — panel A's selector can never
 * match panel B's marks. Panels that are anonymous `<g>` elements are
 * additionally given `id="axes_<svgId>_<i>"` so the MAIDR core can outline
 * the active panel and resolve visual navigation order (same convention the
 * Plotly adapter uses).
 */

import type { Maidr, MaidrLayer, MaidrSubplot } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type {
  D3BuiltLayer,
  D3FacetsConfig,
  D3MultiPanelResult,
  D3PanelChartSpec,
  D3PanelLayout,
  D3SubplotEntry,
  D3SubplotsConfig,
  DataAccessor,
} from '../types';
import { ensureContainerId, PANEL_ATTRIBUTE } from '../selectors';
import { applyMaidrData, generateId, getD3Datum, isMaidrOwned, resolveAccessorOptional } from '../util';
import { buildBarLayer } from './bar';
import { buildBoxLayer } from './box';
import { buildCandlestickLayer } from './candlestick';
import { buildHeatmapLayer } from './heatmap';
import { buildHistogramLayer } from './histogram';
import { buildLineLayer } from './line';
import { buildScatterLayer } from './scatter';
import { buildSegmentedLayer } from './segmented';
import { buildSmoothLayer } from './smooth';

/**
 * Binds a faceted D3 chart (homogeneous small multiples) to MAIDR.
 *
 * Every element matched by `panelSelector` inside the SVG becomes one MAIDR
 * subplot; the per-type binder selected by `chartType` runs with that panel
 * element as its extraction root, so `config.selector` (e.g. `'rect.bar'`)
 * only needs to match marks *within* a panel.
 *
 * Panel display titles come from `panelTitle`, resolved against each panel
 * element's D3-bound `__data__`. When panels were joined with `d3.groups`
 * output (`[key, values]` tuples) or nest-style `{ key, values }` objects,
 * the group key is used automatically; otherwise the fallback is `Panel <n>`.
 *
 * The grid shape follows `layout` when given, else panel geometry (bounding
 * boxes, then `transform="translate(x,y)"`), else a single row in DOM order.
 * Panels are emitted in visual reading order (top-left first).
 *
 * @remarks
 * **Timing — call after D3 has rendered**, exactly like the single-chart
 * binders: panel elements and their marks must exist with `__data__` bound.
 *
 * @param svg - The SVG element containing all panels.
 * @param config - Panel selector, chart type + per-type config, and options.
 * @returns A {@link D3MultiPanelResult} with the multi-subplot MAIDR data.
 *
 * @example
 * ```ts
 * // One <g class="panel"> per cylinder count, each holding rect.bar marks
 * const result = bindD3Facets(svgElement, {
 *   panelSelector: 'g.panel',
 *   chartType: 'bar',
 *   config: {
 *     selector: 'rect.bar',
 *     title: 'MPG by Origin, faceted by Cylinders',
 *     axes: { x: 'Origin', y: 'MPG' },
 *     x: 'origin',
 *     y: 'mpg',
 *   },
 *   panelTitle: d => `cyl = ${d[0]}`, // d3.groups tuple
 * });
 * ```
 */
export function bindD3Facets(svg: Element, config: D3FacetsConfig): D3MultiPanelResult {
  const { panelSelector, panelTitle, layout } = config;

  // Skip MAIDR-owned hidden clones: while the chart is focused, the core
  // keeps a hidden copy of highlighted geometry next to the originals, and
  // those copies can match panelSelector on a live-data rebind.
  const panels = Array.from(svg.querySelectorAll(panelSelector))
    .filter(panel => !isMaidrOwned(panel));
  if (panels.length === 0) {
    throw new Error(
      `bindD3Facets: no panel elements found for panelSelector "${panelSelector}". `
      + `Each facet panel should be a container element (typically a translated `
      + `<g>) inside the SVG, created before the binder runs.`,
    );
  }

  const grid = arrangePanels(panels, layout);
  const { id = generateId(), title, subtitle, caption, autoApply } = config.config;

  const { subplots, layers } = buildPanelGrid(
    svg,
    grid.map(row => row.map(panelEl => ({ panelEl, spec: config }))),
    (panelEl, index) => resolvePanelTitle(panelEl, panelTitle, index),
  );

  const maidr: Maidr = { id, title, subtitle, caption, subplots };
  applyMaidrData(svg, maidr, autoApply);
  return { maidr, layers };
}

/**
 * Binds a heterogeneous grid of D3 charts (one SVG, several independently
 * drawn panels of possibly different chart types) to MAIDR.
 *
 * Each entry names a chart type, its binder config, and the panel's DOM
 * `root` (an element or a CSS selector resolved against `container`). The
 * matching per-type binder runs against that root and the resulting layer
 * becomes one MAIDR subplot.
 *
 * Pass `subplots` as a 2D array for an explicit row-major grid (ragged rows
 * allowed), or as a flat array arranged via `layout` / geometry inference —
 * see {@link D3PanelLayout}.
 *
 * @param container - The SVG (or wrapping element) containing all panels.
 * @param spec - Figure-level fields plus the panel entries.
 * @returns A {@link D3MultiPanelResult} with the multi-subplot MAIDR data.
 *
 * @example
 * ```ts
 * const result = bindD3Subplots(svgElement, {
 *   title: 'Sales Overview',
 *   subplots: [[
 *     { chartType: 'bar', root: 'g.revenue', config: { selector: 'rect.bar', title: 'Revenue' } },
 *     { chartType: 'line', root: 'g.trend', config: { selector: 'path.line', title: 'Trend' } },
 *   ]],
 * });
 * ```
 */
export function bindD3Subplots(container: Element, spec: D3SubplotsConfig): D3MultiPanelResult {
  const { id = generateId(), title, subtitle, caption, autoApply, layout } = spec;

  const grid = arrangeEntries(container, spec.subplots, layout);

  const { subplots, layers } = buildPanelGrid(
    container,
    grid.map(row => row.map(({ root, entry }) => ({ panelEl: root, spec: entry }))),
    (_panelEl, index, layerTitle) => layerTitle ?? `Panel ${index + 1}`,
  );

  const maidr: Maidr = { id, title, subtitle, caption, subplots };
  applyMaidrData(container, maidr, autoApply);
  return { maidr, layers };
}

/** One cell of the resolved panel grid: the extraction root + what to bind. */
interface PanelCell {
  panelEl: Element;
  spec: D3PanelChartSpec;
}

/**
 * Shared assembly for both multi-panel binders: stamps panels, runs the
 * per-type builder for each cell, applies panel titles, and produces the
 * `MaidrSubplot[][]` grid plus the flat layer list.
 *
 * @param container - The outer SVG/container that anchors all selectors.
 * @param grid - Row-major grid of panel cells (visual reading order).
 * @param titleFor - Resolves the panel display title; receives the panel
 *                   element, its running index, and the layer title the
 *                   builder produced from the cell's own config.
 */
function buildPanelGrid(
  container: Element,
  grid: PanelCell[][],
  titleFor: (panelEl: Element, index: number, layerTitle?: string) => string,
): { subplots: MaidrSubplot[][]; layers: MaidrLayer[] } {
  clearPanelStamps(container);
  const containerId = ensureContainerId(container);

  let panelIndex = 0;
  const layers: MaidrLayer[] = [];
  const subplots: MaidrSubplot[][] = grid.map(row => row.map((cell) => {
    const index = panelIndex++;
    cell.panelEl.setAttribute(PANEL_ATTRIBUTE, String(index));

    const panelScope: D3PanelScope = { container, panelIndex: index };
    let built: D3BuiltLayer;
    try {
      built = buildPanelLayer(cell.panelEl, cell.spec, panelScope);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`D3 multi-panel bind failed in panel ${index}: ${message}`);
    }

    // The FIRST layer's title is the panel's display name in the core's
    // subplot navigation summaries — there is no subplot-level title field.
    built.layer.title = titleFor(cell.panelEl, index, built.layer.title);
    layers.push(built.layer);

    // Deliberately NO subplot-level `selector`: the core deep-clones whatever
    // it matches into a hidden copy, and for a stamped panel that clone would
    // carry the copied `axes_*` id — the active-panel outline would then be
    // drawn inside the invisible clone. With the selector absent, the core
    // anchors axes lookup and panel geometry on the first layer selector's
    // first match (an original mark inside the original panel), the same
    // convention the known-good examples/facet_barplot.html uses.
    return {
      ...(built.legend && built.legend.length > 0 ? { legend: built.legend } : {}),
      layers: [built.layer],
    };
  }));

  stampAxesIdsIfClean(grid.flat().map(cell => cell.panelEl), containerId);

  return { subplots, layers };
}

/** Dispatches a panel cell to the matching per-type extraction core. */
function buildPanelLayer(root: Element, spec: D3PanelChartSpec, panel: D3PanelScope): D3BuiltLayer {
  switch (spec.chartType) {
    case 'bar':
      return buildBarLayer(root, spec.config, panel);
    case 'box':
      return buildBoxLayer(root, spec.config, panel);
    case 'candlestick':
      return buildCandlestickLayer(root, spec.config, panel);
    case 'heatmap':
      return buildHeatmapLayer(root, spec.config, panel);
    case 'histogram':
      return buildHistogramLayer(root, spec.config, panel);
    case 'line':
      return buildLineLayer(root, spec.config, panel);
    case 'scatter':
      return buildScatterLayer(root, spec.config, panel);
    case 'segmented':
      return buildSegmentedLayer(root, spec.config, panel);
    case 'smooth':
      return buildSmoothLayer(root, spec.config, panel);
  }
}

/**
 * Resolves a facet panel's display title.
 *
 * Priority: the user's `panelTitle` accessor — function accessors are always
 * invoked (with an `undefined` datum when the panel was appended without a
 * D3 data join, so index-only accessors like `(_d, i) => keys[i]` keep
 * working), while string-key accessors require a bound datum; then automatic
 * detection of the `d3.groups` tuple (`[key, values]`) or nest-style
 * (`{ key, values }`) shapes; finally the positional fallback `Panel <n>`.
 */
function resolvePanelTitle(
  panelEl: Element,
  accessor: DataAccessor<string> | undefined,
  index: number,
): string {
  const datum = getD3Datum(panelEl);
  const hasDatum = datum !== undefined && datum !== null;
  if (accessor !== undefined && (typeof accessor === 'function' || hasDatum)) {
    const value = resolveAccessorOptional<string>(datum, accessor, index);
    if (value !== undefined && value !== null) {
      return String(value);
    }
  } else if (hasDatum) {
    if (Array.isArray(datum) && datum.length === 2) {
      return String(datum[0]);
    }
    if (typeof datum === 'object' && 'key' in (datum as Record<string, unknown>)) {
      return String((datum as Record<string, unknown>).key);
    }
  }
  return `Panel ${index + 1}`;
}

/** Removes stale panel stamps so rebinding after a data update is idempotent. */
function clearPanelStamps(container: Element): void {
  for (const el of Array.from(container.querySelectorAll(`[${PANEL_ATTRIBUTE}]`))) {
    el.removeAttribute(PANEL_ATTRIBUTE);
  }
}

/**
 * Stamps `id="axes_<containerId>_<i>"` on panel elements so the MAIDR core
 * can outline the active panel and resolve visual navigation order (it keys
 * off `g[id^="axes_"]` groups — the matplotlib/Plotly convention).
 *
 * Applied only when it cannot clobber user state: every panel must be a
 * `<g>` element whose id is either absent or already an `axes_*` id (from a
 * previous bind, keeping rebinds stable). When stamping is skipped only the
 * visual active-panel outline is lost: the core still resolves visual
 * ordering and vertical arrow direction by measuring each panel's rendered
 * geometry through the first element matched by the subplot's first layer
 * selector (`resolveSubplotLayout`'s panel-geometry fallback), which the
 * emitted `#<svgId> [data-maidr-panel="<i>"] …` selectors satisfy.
 */
function stampAxesIdsIfClean(panels: Element[], containerId: string): void {
  const clean = panels.every(
    panel => panel.localName === 'g' && (!panel.id || panel.id.startsWith('axes_')),
  );
  if (!clean) {
    return;
  }
  panels.forEach((panel, index) => {
    if (!panel.id) {
      panel.id = `axes_${containerId}_${index}`;
    }
  });
}

/**
 * Arranges facet panel elements into a row-major grid per the explicit
 * `layout` (which always wins) or geometry inference.
 */
function arrangePanels(panels: Element[], layout?: D3PanelLayout): Element[][] {
  if (layout === 'row') {
    return [panels.slice()];
  }
  if (layout === 'column') {
    return panels.map(panel => [panel]);
  }
  if (layout && typeof layout === 'object') {
    return chunkIntoRows(panels, layout);
  }
  return clusterByGeometry(panels);
}

/**
 * Resolves subplot entries (2D or flat) into a grid of `{ root, entry }`
 * cells, applying `layout` / geometry inference for flat arrays.
 */
function arrangeEntries(
  container: Element,
  entries: D3SubplotEntry[][] | D3SubplotEntry[],
  layout?: D3PanelLayout,
): { root: Element; entry: D3SubplotEntry }[][] {
  if (entries.length === 0) {
    throw new Error('bindD3Subplots: `subplots` must contain at least one entry.');
  }

  if (Array.isArray(entries[0])) {
    // Explicit 2D grid: preserve the user's shape (ragged rows allowed).
    const rows = entries as D3SubplotEntry[][];
    const grid = rows.map((row, rowIndex) => {
      if (row.length === 0) {
        throw new Error(
          `bindD3Subplots: row ${rowIndex} of \`subplots\` is empty. `
          + `Every row of the grid must contain at least one panel.`,
        );
      }
      return row.map(entry => ({ root: resolveRoot(container, entry.root), entry }));
    });
    assertUniqueRoots(grid.flat());
    return grid;
  }

  const flat = (entries as D3SubplotEntry[]).map(entry => ({
    root: resolveRoot(container, entry.root),
    entry,
  }));
  assertUniqueRoots(flat);

  if (layout === 'row') {
    return [flat];
  }
  if (layout === 'column') {
    return flat.map(cell => [cell]);
  }
  if (layout && typeof layout === 'object') {
    return chunkIntoRows(flat, layout);
  }

  // Geometry inference: cluster the roots, then map back to their entries.
  const cellByRoot = new Map(flat.map(cell => [cell.root, cell]));
  return clusterByGeometry(flat.map(cell => cell.root))
    .map(row => row.map(root => cellByRoot.get(root)!));
}

/**
 * Rejects subplot entries whose `root` resolves to the same panel element.
 *
 * Without this guard duplicates degrade silently instead of erroring: the
 * geometry-inference path deduplicates the shared element (dropping one
 * entry's chart entirely), and on every layout path the second panel stamp
 * overwrites the first, leaving the first subplot with dead selectors and no
 * highlighting.
 */
function assertUniqueRoots(cells: { root: Element; entry: D3SubplotEntry }[]): void {
  const firstIndexByRoot = new Map<Element, number>();
  cells.forEach(({ root }, index) => {
    const first = firstIndexByRoot.get(root);
    if (first !== undefined) {
      throw new Error(
        `bindD3Subplots: subplot entries ${first} and ${index} resolve to the `
        + `same panel root element. Each subplot must have its own container `
        + `element — check for duplicate \`root\` selectors.`,
      );
    }
    firstIndexByRoot.set(root, index);
  });
}

/**
 * Resolves an entry's `root` (element or selector) against the container.
 * MAIDR-owned hidden clones are skipped so a live-data rebind can never
 * mistake the core's highlight copies for a panel root.
 */
function resolveRoot(container: Element, root: Element | string): Element {
  if (typeof root !== 'string') {
    return root;
  }
  const resolved = Array.from(container.querySelectorAll(root))
    .find(candidate => !isMaidrOwned(candidate));
  if (!resolved) {
    throw new Error(
      `bindD3Subplots: no element found for panel root selector "${root}" `
      + `inside the container. Panel roots must exist before the binder runs.`,
    );
  }
  return resolved;
}

/**
 * Chunks items row-major into a grid with the requested column count
 * (or `ceil(count / rows)` columns when only `rows` is given). The final
 * row may be shorter; it is never empty.
 */
function chunkIntoRows<T>(items: T[], layout: { rows?: number; columns?: number }): T[][] {
  const columns = layout.columns
    ?? (layout.rows ? Math.ceil(items.length / layout.rows) : items.length);
  const size = Math.max(1, columns);
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

/**
 * Infers the grid from panel geometry, emitting rows in visual reading order
 * (top row first, left-to-right within a row):
 *
 * 1. Bounding-box centers, clustered by y with a tolerance of half the
 *    median panel height.
 * 2. When bounding boxes are unavailable (all zero — e.g. jsdom, detached
 *    nodes), `transform="translate(x,y)"` values with a small tolerance.
 * 3. When neither yields positions, a single row in DOM order.
 */
function clusterByGeometry(panels: Element[]): Element[][] {
  const rects = panels.map(panel => panel.getBoundingClientRect());
  const hasBoxes = rects.some(
    rect => rect.width > 0 || rect.height > 0 || rect.left !== 0 || rect.top !== 0,
  );

  let positions: { el: Element; x: number; y: number }[];
  let tolerance: number;

  if (hasBoxes) {
    positions = panels.map((el, i) => ({
      el,
      x: rects[i].left + rects[i].width / 2,
      y: rects[i].top + rects[i].height / 2,
    }));
    const heights = rects
      .map(rect => rect.height)
      .filter(height => height > 0)
      .sort((a, b) => a - b);
    tolerance = heights.length > 0 ? heights[Math.floor(heights.length / 2)] / 2 : 1;
  } else {
    const translates = panels.map(panel => parseTranslate(panel.getAttribute('transform')));
    if (translates.every(translate => translate === null)) {
      return [panels.slice()];
    }
    positions = panels.map((el, i) => ({
      el,
      x: translates[i]?.x ?? 0,
      y: translates[i]?.y ?? 0,
    }));
    tolerance = 0.5;
  }

  const sorted = positions.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { el: Element; x: number; y: number }[][] = [];
  for (const position of sorted) {
    const currentRow = rows[rows.length - 1];
    if (currentRow && Math.abs(position.y - currentRow[0].y) <= tolerance) {
      currentRow.push(position);
    } else {
      rows.push([position]);
    }
  }
  return rows.map(row => row.slice().sort((a, b) => a.x - b.x).map(position => position.el));
}

/** Parses the x/y of a `translate(x[, y])` transform, or `null` when absent. */
function parseTranslate(transform: string | null): { x: number; y: number } | null {
  if (!transform) {
    return null;
  }
  const match = /translate\(\s*(-?[\d.]+(?:e[-+]?\d+)?)(?:[\s,]+(-?[\d.]+(?:e[-+]?\d+)?))?\s*\)/i.exec(transform);
  if (!match) {
    return null;
  }
  return { x: Number(match[1]), y: Number(match[2] ?? 0) };
}
