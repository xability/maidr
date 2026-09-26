/**
 * Highlight overlay for the Lightweight Charts adapter.
 *
 * Lightweight Charts draws every pane onto canvases, so there is no element
 * per bar for MAIDR's SVG highlight to find. As the Chart.js and amCharts
 * adapters do, this draws an absolutely positioned box over the chart at the
 * active bar, placed with the chart's own coordinate API:
 * `timeScale().timeToCoordinate()` across and `series.priceToCoordinate()` up
 * and down.
 *
 * Those coordinates are relative to the pane's plot area -- right of the left
 * price scale, below the panes above -- so each is offset by where that area
 * sits in the chart element before it is drawn. The overlay layer itself
 * covers the chart element, so its children are in chart-element pixels.
 */

import type { PixelRect } from '@util/tactile/canvasRaster';
import type { SeriesReading } from './converters';
import type { LwcChart, LwcDataItem } from './types';
import { OVERLAY_ATTRIBUTES, writeOverlayRegions } from '@util/overlayRegions';

/** A box in CSS pixels relative to the chart element's top-left. */
export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Side of the box drawn around a line point. */
const POINT_BOX_SIZE = 14;

/** The narrowest a bar's box is drawn, however far the chart is zoomed out. */
const MIN_BAR_WIDTH = 6;

/**
 * Where a pane's plot area is, in chart-element pixels: right of the left
 * price scale, below the panes above, and the size the chart reports for it.
 * @param chart - The chart
 * @param paneIndex - Which pane
 * @returns The plot area, or null when the pane is not laid out
 */
export function panePlotArea(chart: LwcChart, paneIndex: number): PixelRect | null {
  const pane = chart.panes()[paneIndex];
  const row = pane?.getHTMLElement();
  if (!pane || !row) {
    return null;
  }
  const chartBox = chart.chartElement().getBoundingClientRect();
  const rowBox = row.getBoundingClientRect();
  let leftScale = 0;
  try {
    leftScale = chart.priceScale('left', paneIndex).width();
  } catch {
    // A pane without a left scale: its plot starts at the row's edge.
  }
  const left = rowBox.left - chartBox.left + leftScale;
  const top = rowBox.top - chartBox.top;
  // Not `timeScale().width()`, which is the time axis's width and zero while
  // the axis is hidden.
  const { width, height } = chart.paneSize(paneIndex);
  if (!(width > 0) || !(height > 0)) {
    return null;
  }
  return { left, top, right: left + width, bottom: top + height };
}

/** The distance between neighbouring bars at the chart's current zoom. */
function barSpacing(chart: LwcChart): number {
  const timeScale = chart.timeScale();
  const first = timeScale.logicalToCoordinate(0);
  const second = timeScale.logicalToCoordinate(1);
  if (first === null || second === null) {
    return MIN_BAR_WIDTH;
  }
  return Math.abs(second - first);
}

/** A box spanning two prices at one x, in plot-area pixels. */
function span(x: number, width: number, a: number, b: number): OverlayRect {
  return { left: x - width / 2, top: Math.min(a, b), width, height: Math.abs(a - b) };
}

/**
 * The box one source row is drawn in, in plot-area pixels, or null when the
 * chart cannot place it -- a time off the scale, or a price with no reading.
 */
function itemRect(chart: LwcChart, reading: SeriesReading, item: LwcDataItem): OverlayRect | null {
  const x = chart.timeScale().timeToCoordinate(item.time);
  if (x === null) {
    return null;
  }
  const series = reading.series;
  const width = Math.max(barSpacing(chart) * 0.8, MIN_BAR_WIDTH);

  if (reading.kind === 'candlestick') {
    const high = item.high === undefined ? null : series.priceToCoordinate(item.high);
    const low = item.low === undefined ? null : series.priceToCoordinate(item.low);
    return high === null || low === null ? null : span(x, width, high, low);
  }

  if (item.value === undefined) {
    return null;
  }
  const y = series.priceToCoordinate(item.value);
  if (y === null) {
    return null;
  }

  if (reading.kind === 'bar') {
    const base = series.priceToCoordinate(series.options().base ?? 0);
    // A histogram's base can sit far outside a squeezed volume pane; the clip
    // below brings the box back to the pane's edge.
    return base === null ? span(x, width, y, y) : span(x, width, y, base);
  }

  return {
    left: x - POINT_BOX_SIZE / 2,
    top: y - POINT_BOX_SIZE / 2,
    width: POINT_BOX_SIZE,
    height: POINT_BOX_SIZE,
  };
}

/**
 * The highlight box for one source row, in chart-element pixels and clipped
 * to its pane, or null when none of it is on screen -- a bar scrolled out of
 * view, or a pane not laid out.
 * @param chart - The chart
 * @param reading - The series the row belongs to
 * @param item - The row
 * @returns The box to draw, or null
 */
export function highlightRect(
  chart: LwcChart,
  reading: SeriesReading,
  item: LwcDataItem,
): OverlayRect | null {
  const area = panePlotArea(chart, reading.paneIndex);
  const rect = itemRect(chart, reading, item);
  if (!area || !rect) {
    return null;
  }
  const left = Math.max(area.left, area.left + rect.left);
  const top = Math.max(area.top, area.top + rect.top);
  const right = Math.min(area.right, area.left + rect.left + rect.width);
  // A flat bar (a zero reading, or a candle whose high is its low) still gets
  // a sliver, so the reader can see where it is.
  const bottom = Math.min(area.bottom, area.top + rect.top + Math.max(rect.height, 2));
  if (right <= left || bottom <= top) {
    return null;
  }
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * The boxes drawn over a Lightweight Charts chart to show the reader's
 * position to anyone watching the screen.
 */
export class HighlightOverlay {
  private readonly container: HTMLDivElement;
  private readonly host: HTMLElement;
  private readonly target: HTMLElement;
  private readonly getColor: () => string;

  /** The chart drawn onto one canvas, for readers of the pixels; see {@link captureClean}. */
  private clean: HTMLCanvasElement | null = null;

  /** Watches for a reader of the pixels arriving; see {@link captureClean}. */
  private readonly readerObserver: MutationObserver | null = null;

  /**
   * @param host - The positioned wrapper holding the chart
   * @param target - The chart element the overlay covers
   * @param getColor - Returns the highlight color, read at every draw
   * @param onReader - Called when a reader of the pixels arrives, so the copy
   * it needs is taken then rather than at the next move
   */
  public constructor(host: HTMLElement, target: HTMLElement, getColor: () => string, onReader?: () => void) {
    this.host = host;
    this.target = target;
    this.getColor = getColor;

    this.container = document.createElement('div');
    this.container.setAttribute('data-maidr-lightweight-charts-overlay', '');
    // Read by the tactile display, which draws canvas charts from the pixels
    // and needs these to know where the focused point is.
    this.container.setAttribute(OVERLAY_ATTRIBUTES.layer, '');
    this.container.style.position = 'absolute';
    this.container.style.pointerEvents = 'none';
    // Above the chart's own canvases, which Lightweight Charts stacks itself.
    this.container.style.zIndex = '3';
    this.syncToTarget();
    host.appendChild(this.container);

    if (onReader !== undefined && typeof MutationObserver !== 'undefined') {
      this.readerObserver = new MutationObserver(() => {
        if (this.clean === null && this.container.hasAttribute(OVERLAY_ATTRIBUTES.pixelReader)) {
          onReader();
        }
      });
      this.readerObserver.observe(this.container, { attributes: true, attributeFilter: [OVERLAY_ATTRIBUTES.pixelReader] });
    }
  }

  /**
   * Keeps a copy of the whole chart on one canvas for readers of the pixels
   * -- the tactile display; see `@util/overlayRegions`.
   *
   * Lightweight Charts gives every pane and every axis a canvas of its own, so
   * on a chart of two panes no single canvas covers enough of it to be read
   * as the chart. The copy is the chart as one picture, without the crosshair.
   * It is taken only while something reads the pixels, so a chart nobody
   * reads that way does not pay for a screenshot per move.
   *
   * @param screenshot - Draws the chart onto a new canvas
   */
  public captureClean(screenshot: () => HTMLCanvasElement): void {
    if (!this.container.hasAttribute(OVERLAY_ATTRIBUTES.pixelReader)) {
      this.clean?.remove();
      this.clean = null;
      return;
    }
    let source: HTMLCanvasElement;
    try {
      source = screenshot();
    } catch (error) {
      console.warn('[MAIDR Lightweight Charts] chart could not be copied for the tactile display', error);
      return;
    }
    if (source.width <= 0 || source.height <= 0) {
      return;
    }
    source.setAttribute(OVERLAY_ATTRIBUTES.cleanCanvas, '');
    source.setAttribute('aria-hidden', 'true');
    source.style.display = 'none';
    this.clean?.remove();
    this.clean = source;
    // `clear` empties the container, so the copy goes first and is skipped.
    this.container.prepend(source);
  }

  /**
   * Draws one box per rect, replacing what was there.
   * @param rects - Boxes in chart-element pixels
   */
  public show(rects: readonly OverlayRect[]): void {
    this.syncToTarget();
    this.clear();

    const color = this.getColor();
    const fill = `color-mix(in srgb, ${color} 22%, transparent)`;
    for (const rect of rects) {
      const node = document.createElement('div');
      node.setAttribute('data-maidr-lightweight-charts-highlight', '');
      node.setAttribute(OVERLAY_ATTRIBUTES.highlight, '');
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
   * Records the focused pane's plot area for readers of the canvas's pixels;
   * see `@util/overlayRegions`.
   * @param plotArea - The plot area in chart-element pixels, or null
   */
  public setPlotArea(plotArea: PixelRect | null): void {
    writeOverlayRegions(this.container, plotArea);
  }

  /** Removes every box. */
  public clear(): void {
    for (const node of Array.from(this.container.children)) {
      if (node !== this.clean) {
        node.remove();
      }
    }
  }

  /** Detaches the overlay. */
  public dispose(): void {
    this.readerObserver?.disconnect();
    this.container.remove();
  }

  /**
   * Lays the overlay over the chart element again. The chart resizes on its
   * own, so where it is is read at every draw rather than remembered.
   */
  private syncToTarget(): void {
    const hostBox = this.host.getBoundingClientRect();
    const box = this.target.getBoundingClientRect();
    this.container.style.left = `${box.left - hostBox.left}px`;
    this.container.style.top = `${box.top - hostBox.top}px`;
    this.container.style.width = `${box.width}px`;
    this.container.style.height = `${box.height}px`;
  }
}
