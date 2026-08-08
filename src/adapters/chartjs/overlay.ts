/**
 * Highlight overlay for the Chart.js adapter.
 *
 * Chart.js draws into a single `<canvas>` bitmap, so MAIDR's SVG-based
 * `HighlightService` cannot find per-bar DOM elements to highlight. This
 * module compensates by drawing absolute-positioned `<div>` overlays on top
 * of the canvas at the geometry reported by Chart.js for the active element.
 *
 * Coordinates: Chart.js stores element positions in CSS pixels relative to
 * the canvas's top-left. We mount the overlay container inside the same
 * positioned wrapper as the canvas, sized to match the canvas exactly, so
 * Chart.js coordinates can be used directly as CSS `left`/`top` on the
 * overlay children.
 */

import type { ChartJsMetaElement } from './types';

/**
 * Rectangle in CSS pixels relative to the canvas top-left.
 */
export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Default visual style for the highlight rect.
 */
const DEFAULT_HIGHLIGHT_COLOR = 'rgba(255, 140, 0, 0.9)';
const DEFAULT_FILL_COLOR = 'rgba(255, 165, 0, 0.25)';

/**
 * Manages DOM rectangles drawn on top of a Chart.js canvas to provide
 * MAIDR-style highlight feedback for keyboard navigation.
 */
export class HighlightOverlay {
  private readonly container: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly outlineColor: string;
  private readonly fillColor: string;

  /**
   * @param host - Positioned wrapper element that contains the canvas.
   * @param canvas - The Chart.js canvas the overlay aligns to.
   * @param highlightColor - Optional outline color override.
   */
  constructor(
    host: HTMLElement,
    canvas: HTMLCanvasElement,
    highlightColor?: string,
  ) {
    this.canvas = canvas;
    this.outlineColor = highlightColor ?? DEFAULT_HIGHLIGHT_COLOR;
    this.fillColor = highlightColor ? this.toFill(highlightColor) : DEFAULT_FILL_COLOR;

    this.container = document.createElement('div');
    this.container.setAttribute('data-maidr-chartjs-overlay', '');
    this.container.style.position = 'absolute';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = '1';
    this.syncToCanvas();
    host.appendChild(this.container);
  }

  /**
   * Draw one rect per provided geometry. Existing rects are cleared first.
   */
  show(rects: readonly OverlayRect[]): void {
    this.syncToCanvas();
    this.clear();

    for (const rect of rects) {
      const node = document.createElement('div');
      node.setAttribute('data-maidr-chartjs-highlight', '');
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
   * Remove all highlight rects (e.g., on chart resize before recompute).
   */
  clear(): void {
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
  }

  /**
   * Detach overlay from the DOM.
   */
  dispose(): void {
    this.container.remove();
  }

  /**
   * Re-align the overlay rectangle to the current canvas position and size
   * within the shared host. Chart.js may resize the canvas independently of
   * the wrapper, so we read its current offset/size each time.
   */
  private syncToCanvas(): void {
    this.container.style.left = `${this.canvas.offsetLeft}px`;
    this.container.style.top = `${this.canvas.offsetTop}px`;
    this.container.style.width = `${this.canvas.clientWidth}px`;
    this.container.style.height = `${this.canvas.clientHeight}px`;
  }

  /**
   * Derive a low-opacity fill color from an outline color override.
   * Currently a no-op pass-through; users can pass any CSS color string and
   * the fill defaults are applied via opacity layering at render time.
   */
  private toFill(color: string): string {
    return color;
  }
}

/**
 * Convert a Chart.js element (bar, point, etc.) into an overlay rectangle.
 *
 * Element types expose different geometry properties:
 * - Bar: `x`, `y`, `base`, `width`, `height`, `horizontal` (read directly).
 * - Candlestick / OHLC: `x` (center), `width`, `high`/`low` (top/bottom pixel
 *   y), `open`/`close` (body endpoints in pixels).
 * - Matrix (heatmap cell): `x`, `y` (center), `width`, `height`, no `base`.
 * - Point (scatter / line vertex): `x`, `y`, plus an effective radius.
 *
 * Returns `null` if the element does not expose enough geometry to render.
 */
export function elementToOverlayRect(element: ChartJsMetaElement): OverlayRect | null {
  // Chart.js element instances carry additional runtime properties beyond
  // the minimal `ChartJsMetaElement` interface. Access them defensively.
  const el = element as ChartJsMetaElement & {
    base?: number;
    width?: number;
    height?: number;
    horizontal?: boolean;
    radius?: number;
    options?: { radius?: number };
    open?: number;
    high?: number;
    low?: number;
    close?: number;
  };

  if (typeof el.x !== 'number' || typeof el.y !== 'number')
    return null;

  // Bar-shaped element: has a baseline and a box.
  if (
    typeof el.base === 'number'
    && typeof el.width === 'number'
    && typeof el.height === 'number'
  ) {
    if (el.horizontal) {
      const left = Math.min(el.x, el.base);
      const width = Math.abs(el.x - el.base);
      const top = el.y - el.height / 2;
      const height = el.height;
      return { left, top, width, height };
    }
    const top = Math.min(el.y, el.base);
    const height = Math.abs(el.y - el.base);
    const left = el.x - el.width / 2;
    const width = el.width;
    return { left, top, width, height };
  }

  // Candlestick / OHLC element (chartjs-chart-financial). The element exposes
  // pixel-space `high` (top) and `low` (bottom) along with `width` and the
  // body endpoints `open`/`close`. Draw the full candle bbox so the wick is
  // included; the body sits inside this rect naturally. Checked before the
  // matrix branch because some financial elements may also report a height.
  if (
    typeof el.width === 'number'
    && typeof el.high === 'number'
    && typeof el.low === 'number'
  ) {
    const left = el.x - el.width / 2;
    const top = Math.min(el.high, el.low);
    const height = Math.abs(el.low - el.high);
    return { left, top, width: el.width, height };
  }

  // Matrix element (chartjs-chart-matrix). Rectangular heatmap cell with
  // explicit `width`/`height` and no `base` (which is what distinguishes it
  // from a BarElement). The element's `x,y` is the top-left corner of the
  // cell by default (anchorX/anchorY default to `undefined`, which applies
  // no offset). Note: this differs from BarElement/CandlestickElement where
  // `x` is the horizontal center.
  if (
    el.base === undefined
    && typeof el.width === 'number'
    && typeof el.height === 'number'
  ) {
    return {
      left: el.x,
      top: el.y,
      width: el.width,
      height: el.height,
    };
  }

  // Point-shaped element (scatter, line vertex): box around the center.
  const radius = el.options?.radius ?? el.radius ?? 4;
  const size = (radius + 2) * 2;
  return {
    left: el.x - size / 2,
    top: el.y - size / 2,
    width: size,
    height: size,
  };
}
