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
   * Radius, in pins, of the disc that stands for a focused mark too small to
   * have an inside.
   *
   * Two pins across is the floor for something a fingertip registers as its
   * own object rather than as a thickening of whatever it is sitting on.
   */
  private static readonly FOCUS_DISC_RADIUS = 2;

  /**
   * How much of an axis a mark must cover for that axis to count as filled
   * edge to edge.
   */
  private static readonly FULL_SPAN = 0.9;

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

    if (filled && isTiny) {
      // A point, or a mark too small to have an inside. Filling it is not
      // enough to find it: on a line chart the focused vertex sat as a one-pin
      // spur against a two-pin stroke, which under a finger is the same line
      // slightly thicker. A solid disc is the smallest thing that reads as a
      // separate object.
      raster.fillDisc(box.left + (box.right - box.left) / 2, box.top + (box.bottom - box.top) / 2, this.FOCUS_DISC_RADIUS);
      return;
    }

    if (path.length === 1) {
      // A mark with no extent at all, unfocused: left as the single pin it is,
      // so a cloud of them does not smear into one mass.
      raster.set(path[0].x, path[0].y);
      return;
    }
    raster.strokePath(path, weight);
  }

  /**
   * Reports whether a ring has run off the grid, so that filling it would
   * leave the reader inside a shape with no reachable boundary.
   *
   * The test is whether an edge is actually off the grid, not how much of an
   * axis the mark covers. Those come apart on the commonest chart there is: a
   * trace is mapped onto the pins by the extent of all its marks, so a bar
   * chart's tallest bar spans nearly the whole height by construction, at rest,
   * with nothing zoomed into. Measuring the span outlined that bar — the single
   * mark a reader is likeliest to land on — and left them with no solid shape
   * among the hollow ones anywhere on the display.
   *
   * A mark whose top and bottom are both still on the grid can be filled and
   * read, however tall it is. One whose edges have gone past it cannot, and is
   * given a heavy outline instead: the sides still in view are the only thing
   * left that says where it is.
   *
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
    if (box.left < 0 || box.top < 0
      || box.right > raster.width - 1 || box.bottom > raster.height - 1) {
      return true;
    }

    // Or it fits, and is the whole display. A mark can cover the grid without
    // any edge leaving it, and filling that raises every pin: a gauge came back
    // from the audit as 2204 of 2400 pins with nothing to feel but the edge of
    // the device. Both axes have to be covered — a bar chart's tallest bar
    // covers one of them by construction, and is exactly the mark that must
    // stay filled.
    return (box.right - box.left) / raster.width > this.FULL_SPAN
      && (box.bottom - box.top) / raster.height > this.FULL_SPAN;
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
