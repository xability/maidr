/**
 * Highlight overlay for the amCharts 5 adapter.
 *
 * amCharts 5 renders into an HTML5 `<canvas>` (no per-element SVG nodes), so
 * MAIDR's SVG-based `HighlightService` cannot find data-point elements to
 * highlight. This module compensates the same way the Chart.js adapter does:
 * it draws absolute-positioned `<div>` rectangles on top of the chart at the
 * pixel geometry of the active data point.
 *
 * Geometry: we read the element's screen box via am5 `Sprite.globalBounds()`
 * (CSS px relative to the root container, which fills `root.dom`) and clip it
 * to the plot area, so the box hugs the *visible* bar even when the value axis
 * baseline (value 0) sits outside the clipped plot.
 *
 * Color: the box uses MAIDR's configured highlight color, supplied by a
 * provider read at draw time so a settings change is reflected on the next
 * navigation.
 */

import type { NavTarget } from './navmap';
import type { AmBounds, AmPoint, AmSprite } from './types';

/**
 * Rectangle in CSS pixels relative to the overlay container (root.dom) top-left.
 */
export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Side length of the box drawn around a line/scatter point. */
const POINT_BOX_SIZE = 14;

/**
 * Manages DOM rectangles drawn over an amCharts 5 chart to provide
 * MAIDR-style highlight feedback during keyboard navigation.
 */
export class HighlightOverlay {
  private readonly container: HTMLDivElement;
  private readonly rootDom: HTMLElement;
  private readonly getColor: () => string;

  /**
   * @param host - Positioned wrapper element that contains `root.dom`.
   * @param rootDom - The amCharts root DOM element the overlay aligns to.
   * @param getColor - Returns the current highlight color (read at draw time).
   */
  public constructor(
    host: HTMLElement,
    rootDom: HTMLElement,
    getColor: () => string,
  ) {
    this.rootDom = rootDom;
    this.getColor = getColor;

    this.container = document.createElement('div');
    this.container.setAttribute('data-maidr-amcharts-overlay', '');
    this.container.style.position = 'absolute';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = '1';
    this.syncToRoot();
    host.appendChild(this.container);
  }

  /**
   * Draw one rect per provided geometry. Existing rects are cleared first.
   */
  public show(rects: readonly OverlayRect[]): void {
    this.syncToRoot();
    this.clear();

    const color = this.getColor();
    const fill = `color-mix(in srgb, ${color} 22%, transparent)`;

    for (const rect of rects) {
      const node = document.createElement('div');
      node.setAttribute('data-maidr-amcharts-highlight', '');
      node.style.position = 'absolute';
      node.style.left = `${rect.left}px`;
      node.style.top = `${rect.top}px`;
      node.style.width = `${Math.max(rect.width, 1)}px`;
      node.style.height = `${Math.max(rect.height, 1)}px`;
      node.style.background = fill;
      node.style.outline = `2px solid ${color}`;
      node.style.boxSizing = 'border-box';
      node.style.pointerEvents = 'none';
      this.container.appendChild(node);
    }
  }

  /**
   * Remove all highlight rects (e.g., on resize before recompute).
   */
  public clear(): void {
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
  }

  /**
   * Detach the overlay from the DOM.
   */
  public dispose(): void {
    this.container.remove();
  }

  /**
   * Re-align the overlay container to the current `root.dom` position and size
   * within the shared host. amCharts resizes its canvas independently, so we
   * read the current offset/size each time.
   */
  private syncToRoot(): void {
    this.container.style.left = `${this.rootDom.offsetLeft}px`;
    this.container.style.top = `${this.rootDom.offsetTop}px`;
    this.container.style.width = `${this.rootDom.clientWidth}px`;
    this.container.style.height = `${this.rootDom.clientHeight}px`;
  }
}

/**
 * Convert a navigation target (an am5 series + dataItem) into an overlay
 * rectangle in root-container pixels, clipped to the plot area. Returns `null`
 * when geometry is unavailable or fully outside the plot, in which case the
 * caller should clear the overlay.
 */
export function dataItemToOverlayRect(
  target: NavTarget,
  plotBounds: AmBounds | null,
): OverlayRect | null {
  const rect = target.kind === 'point' ? pointRect(target) : columnRect(target);
  if (!rect) {
    return null;
  }
  return plotBounds ? intersectRect(rect, plotBounds) : rect;
}

/**
 * Rectangle for a column-shaped data point (bar / segmented / histogram /
 * heatmap cell), read directly from the column graphics sprite's global box.
 */
function columnRect(target: NavTarget): OverlayRect | null {
  const sprite = readColumnSprite(target);
  const bounds = sprite?.globalBounds?.();
  return bounds ? boundsToRect(bounds) : null;
}

/**
 * Rectangle for a line/scatter point: a small box centered on the point.
 */
function pointRect(target: NavTarget): OverlayRect | null {
  const center = readPointGlobal(target);
  if (!center) {
    return null;
  }
  return {
    left: center.x - POINT_BOX_SIZE / 2,
    top: center.y - POINT_BOX_SIZE / 2,
    width: POINT_BOX_SIZE,
    height: POINT_BOX_SIZE,
  };
}

/** Normalize an am5 bounds object to an OverlayRect. */
function boundsToRect(b: AmBounds): OverlayRect {
  return {
    left: Math.min(b.left, b.right),
    top: Math.min(b.top, b.bottom),
    width: Math.abs(b.right - b.left),
    height: Math.abs(b.bottom - b.top),
  };
}

/** Intersect a rect with the plot bounds; `null` if it collapses (offscreen). */
function intersectRect(rect: OverlayRect, bounds: AmBounds): OverlayRect | null {
  const plotLeft = Math.min(bounds.left, bounds.right);
  const plotRight = Math.max(bounds.left, bounds.right);
  const plotTop = Math.min(bounds.top, bounds.bottom);
  const plotBottom = Math.max(bounds.top, bounds.bottom);

  const left = Math.max(rect.left, plotLeft);
  const top = Math.max(rect.top, plotTop);
  const right = Math.min(rect.left + rect.width, plotRight);
  const bottom = Math.min(rect.top + rect.height, plotBottom);

  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { left, top, width, height };
}

/**
 * Resolve the column graphics sprite for a dataItem. amCharts exposes it as
 * the `graphics` (or legacy `column`) data-item property.
 */
function readColumnSprite(target: NavTarget): AmSprite | undefined {
  const graphics = target.dataItem.get('graphics') ?? target.dataItem.get('column');
  return graphics as AmSprite | undefined;
}

/**
 * Resolve the global (root-container) coordinates of a line/scatter point.
 * Prefers the first bullet sprite's bounds center, falling back to the
 * dataItem's `point` converted via the series.
 */
function readPointGlobal(target: NavTarget): AmPoint | null {
  const bulletBounds = target.dataItem.bullets?.[0]?.sprite?.globalBounds?.();
  if (bulletBounds) {
    return {
      x: (bulletBounds.left + bulletBounds.right) / 2,
      y: (bulletBounds.top + bulletBounds.bottom) / 2,
    };
  }

  const point = target.dataItem.get('point') as AmPoint | undefined;
  if (point && target.series.toGlobal) {
    return target.series.toGlobal(point);
  }

  return null;
}
