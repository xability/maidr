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

  /**
   * Whether an open stroke gets a dot at each end.
   *
   * For the charts whose marks are connectors: a dumbbell's bar joins two
   * values, and the values are its ends. Drawn as a bare line the bar says
   * how far apart they are and nothing about where either one is -- a bar
   * whose ends are two pins apart and a bar with none at all are the same
   * thing under a finger. A dot at each end is the value; the line between is
   * the distance.
   */
  endCaps?: boolean;
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
   * How much longer than it is wide a mark may be and still count as a
   * marker on a point rather than a shape of its own.
   */
  private static readonly MARKER_ASPECT = 3;

  /**
   * Pins across an open stroke — a line, a curve, a whisker, an error bar.
   *
   * One. A stroke is the thinnest thing the grid can draw and that is what it
   * should be: at two pins a diagonal comes out three and four pins wide where
   * the offset copies meet at a bend, so a single line reads as a band and
   * several of them read as one mass. The pins a second pass would spend are
   * worth more as the gap between one strand and the next.
   *
   * What a second pin was buying — a line a finger can follow without losing
   * it — is bought instead by the focused stroke being heavier than everything
   * around it.
   *
   * Dash patterns per series were tried here and taken out again: read on a
   * device they made a multi-line chart harder rather than easier, because a
   * broken line has to be reassembled before it can be followed and every gap
   * is a place to lose it.
   */
  private static readonly STROKE_WEIGHT = 1;

  /**
   * Pins across the focused mark's stroke.
   *
   * Filling is what normally says "this is the one you are on", and it cannot
   * be applied to a mark with no interior: a line, a curve, an error bar, a
   * whisker. On those charts the reader had no tactile answer at all to which
   * mark they were on. A heavier stroke is the answer that works on a shape
   * without an inside, and it stays legible next to the one-pin strokes
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
   * Radius, in pins, of the dot that marks the end of a connector.
   *
   * One: a three-pin cross, the smallest thing that still reads as a knob on
   * the end of a one-pin line rather than as the line continuing. The focused
   * connector's ends use {@link FOCUS_DISC_RADIUS} instead, since its stroke
   * is already wider than this.
   */
  private static readonly END_CAP_RADIUS = 1;

  /**
   * How much of an axis a mark must cover for that axis to count as filled
   * edge to edge.
   *
   * Three quarters. At nine tenths a focused mark a zoom step or two in -- a
   * funnel stage, a boxen box, a stacked segment -- came out as a solid slab
   * over most of the display, which feels no different from the edge of the
   * device and tells the reader nothing but that they are somewhere inside
   * something. Outlined heavily instead, it keeps the shape that says what it
   * is, and the heavy stroke still says it is the one they are on.
   */
  private static readonly FULL_SPAN = 0.75;

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
   * @param endCaps - Whether an open stroke gets a dot at each end
   * @param zoom - The current zoom factor, where 1 fits the whole plot
   * @param ownOutline - Whether the ring is the mark's own outline rather than
   * a box standing in for it
   */
  private static drawRing(
    raster: DotRaster,
    ring: DotRing,
    filled: boolean,
    shade?: number,
    endCaps: boolean = false,
    zoom: number = 1,
    ownOutline: boolean = false,
  ): void {
    const box = this.bounds(ring);
    if (box === null) {
      return;
    }

    const isTiny = box.right - box.left < this.MIN_HOLLOW_SPAN
      && box.bottom - box.top < this.MIN_HOLLOW_SPAN;

    // Whether the mark is a point rather than a shape is decided at the size
    // it has with the whole plot in view, not at the current zoom. A line's
    // vertex, a scatter point, a dot on a dot plot: each is drawn as a
    // standard disc at rest, and it is the same point at every zoom. Measured
    // at the current zoom instead, the marker the chart drew a few pixels
    // across grew with every step -- an ellipse half the display across at the
    // closest zoom, covering the line it marks and saying nothing about it.
    //
    // Only a closed, roughly round or square mark is a marker. An error bar
    // or a sliver of a bar is small at rest too, but its shape is the reading,
    // and zooming in is how a reader gets to feel it.
    const spanX = box.right - box.left;
    const spanY = box.bottom - box.top;
    //
    // Nor is a mark whose own outline is a rectangle square to the axes. That
    // is a short bar in a dense bar chart far more often than it is a square
    // marker, and zooming in on a bar is how a reader gets to its shape. Only
    // its own outline says so: the box highlighting a point on a canvas chart
    // is a rectangle whatever the point is.
    const isMarker = ring.closed
      && spanX / zoom < this.MIN_HOLLOW_SPAN
      && spanY / zoom < this.MIN_HOLLOW_SPAN
      && Math.max(spanX, spanY) <= this.MARKER_ASPECT * Math.max(Math.min(spanX, spanY), Number.EPSILON)
      && !(ownOutline && this.isAxisRectangle(ring.points, box));
    const isPoint = isTiny || isMarker;

    // Each piece of the mark is drawn on its own, so a path the chart drew in
    // several pieces does not come back joined by lines it never drew.
    const pieces = ring.parts ?? [{ points: ring.points, closed: ring.closed }];
    const paths = pieces.map(piece => piece.closed && piece.points.length > 2
      ? [...piece.points, piece.points[0]]
      : piece.points);
    // The closed pieces are filled together, even-odd, so a hole stays a hole
    // and an island is filled as well as the mainland.
    const areas = pieces.filter(piece => piece.closed).map(piece => piece.points);

    // Only the focused mark is thickened. An unfocused outline stays one pin
    // so its interior survives, and an unfocused point stays one pin so a
    // cloud of them does not smear into a single mass.
    const weight = filled ? this.FOCUS_STROKE_WEIGHT : this.STROKE_WEIGHT;

    if (filled && isPoint) {
      // A point, or a mark too small to have an inside. Filling it is not
      // enough to find it: on a line chart the focused vertex sat as a one-pin
      // spur against a two-pin stroke, which under a finger is the same line
      // slightly thicker. A solid disc is the smallest thing that reads as a
      // separate object.
      raster.fillDisc(box.left + (box.right - box.left) / 2, box.top + (box.bottom - box.top) / 2, this.FOCUS_DISC_RADIUS);
      return;
    }

    if (filled && ring.closed && !isTiny) {
      if (this.overfills(box, raster)) {
        // Too big to fill: the reader is inside this mark, not looking at it,
        // and a solid field tells them nothing a blank one would not. Its
        // boundary is the only thing left that carries information, so the
        // pins are spent on that.
        for (const path of paths) {
          raster.strokePath(path, weight);
        }
        return;
      }
      // Fill the interior, then trace the edge. Scan-line filling samples pin
      // centres, so a ring's own far edge falls outside every scan line and
      // would be left lowered — a filled mark whose bottom boundary is simply
      // missing, and a phantom gap between marks that touch in the chart.
      // Stroking after filling costs one pass and makes the mark solid to its
      // real boundary. A piece with no inside -- a box plot's whisker -- is
      // stroked at the focus weight, as it would be on its own.
      raster.fillPolygon(areas);
      pieces.forEach((piece, index) => {
        if (piece.closed) {
          raster.polyline(paths[index]);
        } else {
          raster.strokePath(paths[index], weight);
        }
      });
      return;
    }

    if (shade !== undefined && ring.closed && !isTiny && !filled) {
      // The value the chart drew as a colour, as a texture a hand can read.
      // The outline goes on too: the boundary is what says where one cell ends
      // and the next begins, and a texture alone leaves neighbouring cells of
      // similar value running into each other.
      raster.fillDithered(areas, shade);
      for (const path of paths) {
        raster.polyline(path);
      }
      return;
    }

    if (paths.length === 1 && paths[0].length === 1) {
      const point = paths[0][0];
      // A mark with no extent at all, unfocused: left as the single pin it is,
      // so a cloud of them does not smear into one mass. A connector whose two
      // ends coincide is the exception -- both its values sit on that pin, and
      // a single pin is not a thing a finger finds.
      if (endCaps) {
        raster.fillDisc(point.x, point.y, this.END_CAP_RADIUS);
        return;
      }
      raster.set(point.x, point.y);
      return;
    }
    pieces.forEach((piece, index) => {
      const path = paths[index];
      raster.strokePath(path, weight);
      if (endCaps && !piece.closed && path.length > 0) {
        const radius = filled ? this.FOCUS_DISC_RADIUS : this.END_CAP_RADIUS;
        const first = path[0];
        const last = path[path.length - 1];
        raster.fillDisc(first.x, first.y, radius);
        raster.fillDisc(last.x, last.y, radius);
      }
    });
  }

  /**
   * Whether every point of an outline lies on the edge of its bounding box:
   * a rectangle square to the axes, however densely it was sampled.
   * @param points - The outline
   * @param box - Its bounds
   * @param box.left - Left edge, in dots
   * @param box.top - Top edge, in dots
   * @param box.right - Right edge, in dots
   * @param box.bottom - Bottom edge, in dots
   */
  private static isAxisRectangle(
    points: DotRing['points'],
    box: { left: number; top: number; right: number; bottom: number },
  ): boolean {
    const tolerance = 0.02 * Math.max(box.right - box.left, box.bottom - box.top);
    return points.length >= 4 && points.every(point =>
      Math.min(
        Math.abs(point.x - box.left),
        Math.abs(point.x - box.right),
        Math.abs(point.y - box.top),
        Math.abs(point.y - box.bottom),
      ) <= tolerance);
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
   * Draws the focused mark's rings onto a buffer already holding the rest of
   * the picture, exactly as a focused mark is drawn in a scene.
   *
   * For a chart whose marks are not shapes -- one drawn on a canvas -- where
   * the picture comes from elsewhere and only the focus has an outline.
   *
   * @param raster - The pin buffer to draw into
   * @param rings - The focused mark's rings, in dot coordinates
   * @param zoom - The current zoom factor, where 1 fits the whole plot
   */
  public static drawFocus(raster: DotRaster, rings: readonly DotRing[], zoom: number): void {
    for (const ring of rings) {
      this.drawRing(raster, ring, true, undefined, false, zoom);
    }
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

    const endCaps = scene.endCaps === true;
    for (const mark of scene.marks) {
      if (focused.has(mark)) {
        continue;
      }
      const shade = scene.shades?.get(mark);
      for (const ring of TactileSvgGeometry.ringsOf(mark, viewport)) {
        this.drawRing(raster, ring, false, shade, endCaps, viewport.zoom);
      }
    }

    for (const mark of scene.focused) {
      for (const ring of TactileSvgGeometry.ringsOf(mark, viewport)) {
        this.drawRing(raster, ring, true, undefined, endCaps, viewport.zoom, true);
      }
    }

    return raster;
  }
}
