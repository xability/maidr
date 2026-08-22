import type { DotRing } from './svgGeometry';
import type { ClientRect, TactileViewport } from './viewport';
import { DotRaster } from './raster';
import { TactileSvgGeometry } from './svgGeometry';

/**
 * Everything a single tactile frame is drawn from.
 */
export interface TactileScene {
  /**
   * Every mark of the active trace, drawn as an outline.
   */
  marks: readonly SVGGraphicsElement[];

  /**
   * The mark or marks the reader is currently on, drawn filled.
   */
  focused: readonly SVGGraphicsElement[];

  /**
   * The plot's data region, drawn as a border so the reader has an anchor for
   * where the marks sit. Null when the region could not be located.
   */
  dataRegion: ClientRect | null;
}

/**
 * Draws a chart onto a pin buffer.
 *
 * Marks are outlined and the focused mark is filled. That split is what makes
 * the display readable at this size: a field of solid shapes gives a fingertip
 * nothing to distinguish them by, whereas hollow shapes have edges to trace and
 * a single solid one stands out immediately as "the one I am on".
 */
export abstract class TactileRenderer {
  private constructor() { /* Prevent instantiation */ }

  /**
   * Below this size in dots, a shape has no interior left to hollow out, so its
   * outline and its fill are the same pins.
   */
  private static readonly MIN_HOLLOW_SPAN = 3;

  /**
   * Bounding box of a ring in dot coordinates, ignoring points that failed to
   * project.
   * @param ring - The ring to measure
   */
  private static bounds(ring: DotRing): { left: number; top: number; right: number; bottom: number } | null {
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (const point of ring.points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        continue;
      }
      left = Math.min(left, point.x);
      top = Math.min(top, point.y);
      right = Math.max(right, point.x);
      bottom = Math.max(bottom, point.y);
    }

    return Number.isFinite(left) ? { left, top, right, bottom } : null;
  }

  /**
   * Draws one ring, either hollow or solid.
   * @param raster - The pin buffer to draw into
   * @param ring - The ring to draw
   * @param filled - True to fill the interior, false to draw only the edge
   */
  private static drawRing(raster: DotRaster, ring: DotRing, filled: boolean): void {
    const box = this.bounds(ring);
    if (box === null) {
      return;
    }

    const isTiny = box.right - box.left < this.MIN_HOLLOW_SPAN
      && box.bottom - box.top < this.MIN_HOLLOW_SPAN;

    const path = ring.closed && ring.points.length > 2
      ? [...ring.points, ring.points[0]]
      : ring.points;

    if (filled && ring.closed && !isTiny) {
      // Fill the interior, then trace the edge. Scan-line filling samples pin
      // centres, so a ring's own far edge falls outside every scan line and
      // would be left lowered — a filled mark whose bottom boundary is simply
      // missing, and a phantom gap between marks that touch in the chart.
      // Stroking after filling costs one pass and makes the mark solid to its
      // real boundary.
      raster.fillPolygon([ring.points]);
      raster.polyline(path);
      return;
    }

    if (path.length === 1) {
      raster.set(path[0].x, path[0].y);
      return;
    }
    raster.polyline(path);
  }

  /**
   * Draws the border of the plot's data region.
   *
   * Clipped to the buffer rather than skipped when it falls outside, so a
   * zoomed-in reader still meets whichever edges are in view and can tell which
   * part of the chart they are on.
   *
   * @param raster - The pin buffer to draw into
   * @param region - The data region in viewport pixels
   * @param viewport - The active zoom and pan
   */
  private static drawDataRegion(raster: DotRaster, region: ClientRect, viewport: TactileViewport): void {
    const topLeft = viewport.toDot(region.left, region.top);
    const bottomRight = viewport.toDot(region.left + region.width, region.top + region.height);
    if (!Number.isFinite(topLeft.x) || !Number.isFinite(bottomRight.x)) {
      return;
    }

    // A run is only worth drawing when the perpendicular edge is in view; the
    // parallel extent is clamped so a partially visible border still appears.
    const left = Math.max(0, Math.min(topLeft.x, bottomRight.x));
    const right = Math.min(raster.width - 1, Math.max(topLeft.x, bottomRight.x));
    const top = Math.max(0, Math.min(topLeft.y, bottomRight.y));
    const bottom = Math.min(raster.height - 1, Math.max(topLeft.y, bottomRight.y));
    if (left > right || top > bottom) {
      return;
    }

    if (topLeft.x >= 0) {
      raster.vLine(topLeft.x, top, bottom);
    }
    if (bottomRight.x <= raster.width - 1) {
      raster.vLine(bottomRight.x, top, bottom);
    }
    if (topLeft.y >= 0) {
      raster.hLine(left, right, topLeft.y);
    }
    if (bottomRight.y <= raster.height - 1) {
      raster.hLine(left, right, bottomRight.y);
    }
  }

  /**
   * Renders a scene to a new pin buffer.
   *
   * The focused mark is drawn last so its fill covers any outline a
   * neighbouring mark laid over the same pins.
   *
   * @param scene - The marks, the focus and the data region
   * @param viewport - The active zoom and pan
   * @param width - Dots across the display
   * @param height - Dots down the display
   */
  public static render(
    scene: TactileScene,
    viewport: TactileViewport,
    width: number,
    height: number,
  ): DotRaster {
    const raster = new DotRaster(width, height);

    if (scene.dataRegion !== null) {
      this.drawDataRegion(raster, scene.dataRegion, viewport);
    }

    const focused = new Set(scene.focused);

    for (const mark of scene.marks) {
      if (focused.has(mark)) {
        continue;
      }
      for (const ring of TactileSvgGeometry.ringsOf(mark, viewport)) {
        this.drawRing(raster, ring, false);
      }
    }

    for (const mark of scene.focused) {
      for (const ring of TactileSvgGeometry.ringsOf(mark, viewport)) {
        this.drawRing(raster, ring, true);
      }
    }

    return raster;
  }
}
