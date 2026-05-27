/**
 * Highlight overlay for the amCharts 5 adapter.
 *
 * amCharts 5 renders into an HTML5 `<canvas>` (no per-element SVG nodes), so
 * MAIDR's SVG-based `HighlightService` cannot find data-point elements to
 * highlight. This module compensates the same way the Chart.js adapter does:
 * it draws absolute-positioned `<div>` rectangles on top of the chart at the
 * pixel geometry of the active data point.
 *
 * Coordinates: amCharts `Sprite.toGlobal()` returns a point relative to the
 * root container, which fills `root.dom`. We mount the overlay container over
 * `root.dom`, so `toGlobal()` output can be used directly as CSS `left`/`top`
 * on the overlay children.
 */

import type { NavTarget } from './navmap';
import type { AmPoint, AmRoot, AmSprite } from './types';

/**
 * Rectangle in CSS pixels relative to the overlay container (root.dom) top-left.
 */
export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const DEFAULT_HIGHLIGHT_COLOR = 'rgba(255, 140, 0, 0.9)';
const DEFAULT_FILL_COLOR = 'rgba(255, 165, 0, 0.25)';

/** Side length of the box drawn around a line/scatter point. */
const POINT_BOX_SIZE = 14;

/**
 * Manages DOM rectangles drawn over an amCharts 5 chart to provide
 * MAIDR-style highlight feedback during keyboard navigation.
 */
export class HighlightOverlay {
  private readonly container: HTMLDivElement;
  private readonly rootDom: HTMLElement;
  private readonly outlineColor: string;
  private readonly fillColor: string;

  /**
   * @param host - Positioned wrapper element that contains `root.dom`.
   * @param rootDom - The amCharts root DOM element the overlay aligns to.
   * @param highlightColor - Optional outline color override.
   */
  public constructor(
    host: HTMLElement,
    rootDom: HTMLElement,
    highlightColor?: string,
  ) {
    this.rootDom = rootDom;
    this.outlineColor = highlightColor ?? DEFAULT_HIGHLIGHT_COLOR;
    this.fillColor = highlightColor ?? DEFAULT_FILL_COLOR;

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

    for (const rect of rects) {
      const node = document.createElement('div');
      node.setAttribute('data-maidr-amcharts-highlight', '');
      node.style.position = 'absolute';
      node.style.left = `${rect.left}px`;
      node.style.top = `${rect.top}px`;
      node.style.width = `${Math.max(rect.width, 1)}px`;
      node.style.height = `${Math.max(rect.height, 1)}px`;
      node.style.background = this.fillColor;
      node.style.outline = `2px solid ${this.outlineColor}`;
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
 * rectangle in root-container pixels. Returns `null` when geometry is not
 * available (e.g., the sprite has not been laid out yet), in which case the
 * caller should clear the overlay.
 *
 * `root` is accepted for API symmetry with future axis-based fallbacks; the
 * current implementation reads geometry directly off the dataItem sprites.
 */
export function dataItemToOverlayRect(
  target: NavTarget,
  _root: AmRoot,
): OverlayRect | null {
  if (target.kind === 'point') {
    return pointRect(target);
  }
  return columnRect(target);
}

/**
 * Rectangle for a column-shaped data point (bar / segmented / histogram /
 * heatmap cell). Reads the column graphics sprite's local box and maps both
 * corners to global (root-container) coordinates via `toGlobal`.
 */
function columnRect(target: NavTarget): OverlayRect | null {
  const sprite = readColumnSprite(target);
  if (!sprite || !sprite.toGlobal)
    return null;

  const x = sprite.x?.();
  const y = sprite.y?.();
  const w = sprite.width?.();
  const h = sprite.height?.();
  if (x == null || y == null || w == null || h == null)
    return null;

  const topLeft = sprite.toGlobal({ x, y });
  const bottomRight = sprite.toGlobal({ x: x + w, y: y + h });

  return {
    left: Math.min(topLeft.x, bottomRight.x),
    top: Math.min(topLeft.y, bottomRight.y),
    width: Math.abs(bottomRight.x - topLeft.x),
    height: Math.abs(bottomRight.y - topLeft.y),
  };
}

/**
 * Rectangle for a line/scatter point: a small box centered on the point.
 * Prefers the dataItem's `point` (converted via the series), falling back to
 * the first bullet sprite's position.
 */
function pointRect(target: NavTarget): OverlayRect | null {
  const global = readPointGlobal(target);
  if (!global)
    return null;

  return {
    left: global.x - POINT_BOX_SIZE / 2,
    top: global.y - POINT_BOX_SIZE / 2,
    width: POINT_BOX_SIZE,
    height: POINT_BOX_SIZE,
  };
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
 */
function readPointGlobal(target: NavTarget): AmPoint | null {
  const point = target.dataItem.get('point') as AmPoint | undefined;
  if (point && target.series.toGlobal) {
    return target.series.toGlobal(point);
  }

  const bulletSprite = target.dataItem.bullets?.[0]?.sprite;
  if (
    bulletSprite?.x
    && bulletSprite.y
    && bulletSprite.toGlobal
  ) {
    return bulletSprite.toGlobal({ x: bulletSprite.x(), y: bulletSprite.y() });
  }

  return null;
}
