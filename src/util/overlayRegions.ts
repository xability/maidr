/**
 * What a canvas adapter's highlight overlay tells the rest of MAIDR about the
 * chart under it.
 *
 * A chart drawn on a canvas has no elements to measure, so the adapter that
 * drew it is the only thing that knows where its plot area is and where the
 * library has painted a tooltip over the data. The overlay layer carries both
 * as attributes, which is what lets the tactile display read the canvas's
 * pixels without importing an adapter: it crops the picture to the plot area,
 * and treats a tooltip as background rather than as a mark.
 *
 * Coordinates are CSS pixels relative to the overlay layer's own top-left.
 */

/**
 * Marks the overlay layer an adapter draws its highlight into.
 */
export const OVERLAY_LAYER_ATTRIBUTE = 'data-maidr-overlay';

/**
 * Marks each highlight box or outline inside the overlay layer.
 */
export const OVERLAY_HIGHLIGHT_ATTRIBUTE = 'data-maidr-overlay-highlight';

/**
 * Marks a hidden canvas inside the overlay layer holding the chart as it was
 * before anything was painted over the data -- a tooltip -- for readers of
 * the pixels to read in place of the visible one. It covers the overlay
 * layer's box.
 */
export const OVERLAY_CLEAN_CANVAS_ATTRIBUTE = 'data-maidr-clean-canvas';

/**
 * The plot area, as `left top right bottom`.
 */
export const OVERLAY_PLOT_AREA_ATTRIBUTE = 'data-maidr-plot-area';

/**
 * Areas the library has painted over the data, as `left top right bottom`
 * boxes separated by `;`.
 */
export const OVERLAY_EXCLUDE_ATTRIBUTE = 'data-maidr-exclude';

/**
 * A box in overlay coordinates.
 */
export interface OverlayBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Whether a value is a box with four finite edges and some area.
 * @param box - The candidate
 */
function isBox(box: OverlayBox | null | undefined): box is OverlayBox {
  return box !== null && box !== undefined
    && [box.left, box.top, box.right, box.bottom].every(Number.isFinite)
    && box.right > box.left && box.bottom > box.top;
}

/**
 * Writes the plot area and the painted-over areas onto an overlay layer.
 * @param layer - The overlay layer
 * @param plotArea - The plot area, or null when it is not known
 * @param exclude - Areas painted over the data, such as a tooltip
 */
export function writeOverlayRegions(
  layer: HTMLElement,
  plotArea: OverlayBox | null,
  exclude: readonly (OverlayBox | null)[] = [],
): void {
  if (isBox(plotArea)) {
    layer.setAttribute(OVERLAY_PLOT_AREA_ATTRIBUTE, [plotArea.left, plotArea.top, plotArea.right, plotArea.bottom].join(' '));
  } else {
    layer.removeAttribute(OVERLAY_PLOT_AREA_ATTRIBUTE);
  }
  const boxes = exclude.filter(isBox);
  if (boxes.length > 0) {
    layer.setAttribute(
      OVERLAY_EXCLUDE_ATTRIBUTE,
      boxes.map(box => [box.left, box.top, box.right, box.bottom].join(' ')).join(';'),
    );
  } else {
    layer.removeAttribute(OVERLAY_EXCLUDE_ATTRIBUTE);
  }
}

/**
 * Reads one box written by {@link writeOverlayRegions}.
 * @param text - `left top right bottom`
 */
function parseBox(text: string): OverlayBox | null {
  const [left, top, right, bottom] = text.trim().split(/\s+/).map(Number);
  const box = { left, top, right, bottom };
  return isBox(box) ? box : null;
}

/**
 * Reads the plot area and painted-over areas back off an overlay layer, in
 * screen coordinates.
 * @param layer - The overlay layer
 * @returns The plot area, or null when none was written, and the areas to
 * treat as background
 */
export function readOverlayRegions(layer: Element): { plotArea: OverlayBox | null; exclude: OverlayBox[] } {
  const origin = layer.getBoundingClientRect();
  const toScreen = (box: OverlayBox): OverlayBox => ({
    left: box.left + origin.left,
    top: box.top + origin.top,
    right: box.right + origin.left,
    bottom: box.bottom + origin.top,
  });
  const area = parseBox(layer.getAttribute(OVERLAY_PLOT_AREA_ATTRIBUTE) ?? '');
  const exclude = (layer.getAttribute(OVERLAY_EXCLUDE_ATTRIBUTE) ?? '')
    .split(';')
    .map(parseBox)
    .filter(isBox)
    .map(toScreen);
  return { plotArea: area === null ? null : toScreen(area), exclude };
}
