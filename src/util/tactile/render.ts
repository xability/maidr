import type { DotRing } from './svgGeometry';
import type { TactileViewport } from './viewport';
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
   * How much of each mark's interior to raise, where the chart put a value in
   * its fill colour rather than in its shape.
   *
   * Absent for the charts where fill is decoration — a bar's colour is its
   * series, not its height — because texturing those would fill in the
   * interiors that tell a hollow mark from the solid focused one.
   */
  shades?: ReadonlyMap<SVGGraphicsElement, number>;
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
   * Pins across an open stroke — a line, a curve, a whisker, an error bar.
   *
   * Two, not one. A single-pin stroke is at the floor of what a fingertip
   * resolves and a diagonal one is below it — the pins touch only at their
   * corners, so a finger sweeping across meets a row of separate bumps and
   * loses the trail on the slightest drift. Every line-like chart is drawn
   * entirely out of these strokes, so at one pin a line plot, a survival
   * curve and a parallel-coordinates plot all arrive as dotted noise.
   *
   * Closed outlines are deliberately left at one pin. Their two edges already
   * bound an interior, and thickening them fills that interior in — which
   * takes away the very thing that tells a hollow mark from a solid one.
   */
  private static readonly STROKE_WEIGHT = 2;

  /**
   * Pins across the focused mark's stroke.
   *
   * Filling is what normally says "this is the one you are on", and it cannot
   * be applied to a mark with no interior: a line, a curve, an error bar, a
   * whisker. On those charts the reader had no tactile answer at all to which
   * mark they were on. A heavier stroke is the answer that works on a shape
   * without an inside, and it stays legible next to the two-pin strokes
   * around it.
   */
  private static readonly FOCUS_STROKE_WEIGHT = 4;

  /**
   * Largest share of the grid a focused mark may fill solid.
   *
   * Past this the fill stops being a cue and becomes the display: a bar zoomed
   * into covers every pin, and a reader's hand meets a featureless plateau
   * with the mark's own edges pushed off the grid. Measured across the example
   * gallery, zooming onto a filled mark routinely raised 65-95% of the pins
   * and left nothing to feel. Beyond this share the mark is drawn as a heavy
   * outline instead — its boundary is what carries the information once the
   * reader is inside it.
   */
  private static readonly MAX_FILL_SHARE = 0.5;

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
   * @param shade - How much of the interior to raise as texture, where the
   * chart encoded a value as fill colour; absent otherwise
   */
  private static drawRing(
    raster: DotRaster,
    ring: DotRing,
    filled: boolean,
    shade?: number,
  ): void {
    const box = this.bounds(ring);
    if (box === null) {
      return;
    }

    const isTiny = box.right - box.left < this.MIN_HOLLOW_SPAN
      && box.bottom - box.top < this.MIN_HOLLOW_SPAN;

    const path = ring.closed && ring.points.length > 2
      ? [...ring.points, ring.points[0]]
      : ring.points;

    // Only open strokes are thickened, and only the focused mark is thickened
    // beyond that. An unfocused closed outline stays one pin so its interior
    // survives, and an unfocused point stays one pin so a cloud of them does
    // not smear into a single mass.
    const weight = filled
      ? this.FOCUS_STROKE_WEIGHT
      : (ring.closed || isTiny ? 1 : this.STROKE_WEIGHT);

    if (filled && ring.closed && !isTiny) {
      if (this.overfills(box, raster)) {
        // Too big to fill: the reader is inside this mark, not looking at it,
        // and a solid field tells them nothing a blank one would not. Its
        // boundary is the only thing left that carries information, so the
        // pins are spent on that.
        raster.strokePath(path, weight);
        return;
      }
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

    if (shade !== undefined && ring.closed && !isTiny && !filled) {
      // The value the chart drew as a colour, as a texture a hand can read.
      // The outline goes on too: the boundary is what says where one cell ends
      // and the next begins, and a texture alone leaves neighbouring cells of
      // similar value running into each other.
      raster.fillDithered([ring.points], shade);
      raster.polyline(path);
      return;
    }

    if (path.length === 1) {
      // A mark with no extent at all. Drawn as a block at the focus weight so
      // it is still findable, and as a single pin otherwise.
      raster.strokePath([path[0], path[0]], weight);
      return;
    }
    raster.strokePath(path, weight);
  }

  /**
   * Reports whether a ring would cover more of the grid than
   * {@link MAX_FILL_SHARE} allows.
   * @param box - The ring's bounding box in dot coordinates
   * @param box.left - Leftmost dot the ring reaches
   * @param box.top - Topmost dot the ring reaches
   * @param box.right - Rightmost dot the ring reaches
   * @param box.bottom - Bottommost dot the ring reaches
   * @param raster - The pin buffer being drawn into
   */
  private static overfills(
    box: { left: number; top: number; right: number; bottom: number },
    raster: DotRaster,
  ): boolean {
    const clippedWidth = Math.min(box.right, raster.width - 1) - Math.max(box.left, 0);
    const clippedHeight = Math.min(box.bottom, raster.height - 1) - Math.max(box.top, 0);
    if (clippedWidth <= 0 || clippedHeight <= 0) {
      return false;
    }
    const share = (clippedWidth * clippedHeight) / (raster.width * raster.height);
    return share > this.MAX_FILL_SHARE;
  }

  /**
   * Renders a scene to a new pin buffer.
   *
   * Every primitive raises pins and none lowers them, so drawing is a union
   * and the order marks are drawn in does not change the result. The focused
   * mark still goes last, for the reader of this code rather than the reader
   * of the display: it is what the frame is about.
   *
   * @param scene - The marks and the focus
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
    const focused = new Set(scene.focused);

    for (const mark of scene.marks) {
      if (focused.has(mark)) {
        continue;
      }
      const shade = scene.shades?.get(mark);
      for (const ring of TactileSvgGeometry.ringsOf(mark, viewport)) {
        this.drawRing(raster, ring, false, shade);
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
