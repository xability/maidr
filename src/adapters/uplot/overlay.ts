/**
 * Highlight overlay for the uPlot adapter.
 *
 * uPlot draws into one `<canvas>`, so there is no element per mark for MAIDR's
 * highlight service to outline. uPlot does, however, lay a positioned `<div>`
 * (`u.over`) exactly over its plotting area, and `u.valToPos(value, scale)`
 * answers in CSS pixels relative to that div. So the overlay lives inside
 * `u.over` and needs no coordinate conversion at all.
 *
 * The overlay also tells the tactile display where the plot area is (the
 * whole of the layer), which is how a canvas chart is read by pin; see
 * `@util/overlayRegions`. uPlot paints nothing over its data -- its legend
 * and cursor are DOM, not canvas -- so no clean copy of the canvas is kept.
 */

import { OVERLAY_ATTRIBUTES, writeOverlayRegions } from '../../util/overlayRegions';

/** A box in CSS pixels relative to the plotting area's top-left. */
export interface OverlayBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Draws MAIDR's highlight boxes over a uPlot chart's plotting area.
 */
export class UPlotHighlightOverlay {
  private readonly layer: HTMLDivElement;
  private readonly getColor: () => string;

  /**
   * @param over - The instance's `u.over` element
   * @param getColor - Returns the highlight color, read on every draw so a
   *   change in MAIDR's settings shows on the next move
   */
  constructor(over: HTMLElement, getColor: () => string) {
    this.getColor = getColor;

    this.layer = document.createElement('div');
    this.layer.setAttribute('data-maidr-uplot-overlay', '');
    this.layer.setAttribute(OVERLAY_ATTRIBUTES.layer, '');
    this.layer.setAttribute('aria-hidden', 'true');
    Object.assign(this.layer.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      // uPlot clips its marks to the plot; a bar half off the edge is
      // outlined only as far as it is drawn.
      overflow: 'hidden',
      zIndex: '1',
    });
    over.appendChild(this.layer);
    this.syncRegions();
  }

  /**
   * Replaces the drawn highlight with one box per entry.
   *
   * @param boxes - Boxes in plotting-area CSS pixels
   */
  show(boxes: readonly OverlayBox[]): void {
    this.clear();
    this.syncRegions();
    const color = this.getColor();
    for (const box of boxes) {
      this.layer.appendChild(this.createBox(box, color));
    }
  }

  /** Removes every highlight box. */
  clear(): void {
    this.layer.replaceChildren();
  }

  /**
   * Records the plot area -- the whole layer -- for readers of the canvas's
   * pixels. Called on every show, since uPlot resizes the plotting area
   * whenever the chart is resized.
   */
  syncRegions(): void {
    const width = this.layer.clientWidth || this.layer.parentElement?.clientWidth || 0;
    const height = this.layer.clientHeight || this.layer.parentElement?.clientHeight || 0;
    writeOverlayRegions(this.layer, { left: 0, top: 0, right: width, bottom: height });
  }

  /** Detaches the overlay from the chart. */
  dispose(): void {
    this.layer.remove();
  }

  private createBox(box: OverlayBox, color: string): HTMLDivElement {
    const node = document.createElement('div');
    node.setAttribute('data-maidr-uplot-highlight', '');
    node.setAttribute(OVERLAY_ATTRIBUTES.highlight, '');
    Object.assign(node.style, {
      position: 'absolute',
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${Math.max(box.width, 1)}px`,
      height: `${Math.max(box.height, 1)}px`,
      background: `color-mix(in srgb, ${color} 22%, transparent)`,
      outline: `2px solid ${color}`,
      boxSizing: 'border-box',
      pointerEvents: 'none',
    });
    return node;
  }
}
