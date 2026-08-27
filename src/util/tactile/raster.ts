/**
 * A monochrome pin buffer sized to a tactile display's graphic area.
 *
 * Every pin is a single bit — raised or lowered. There is no grey, so a
 * renderer targeting this buffer works in outlines and solid fills rather than
 * in shading, and any anti-aliasing it might want has nowhere to go.
 *
 * Coordinates are dot coordinates with the origin at the top-left pin, `x`
 * increasing to the right and `y` increasing downward, matching the order the
 * DotPad hardware itself scans its cells.
 */
export class DotRaster {
  /**
   * Number of pins across.
   */
  public readonly width: number;

  /**
   * Number of pins down.
   */
  public readonly height: number;

  /**
   * One byte per pin, `0` lowered and `1` raised. A byte per pin rather than a
   * packed bitfield keeps the drawing primitives branch-free at the cost of
   * 2.4 KB for a DotPad 320 — a trade worth making for code that runs on every
   * navigation move.
   */
  private readonly pins: Uint8Array;

  /**
   * Creates an all-lowered raster.
   * @param width - Number of pins across
   * @param height - Number of pins down
   */
  public constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pins = new Uint8Array(width * height);
  }

  /**
   * Reports whether a dot coordinate lies inside the buffer.
   * @param x - Dot column
   * @param y - Dot row
   */
  private contains(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /**
   * Raises or lowers a single pin. Coordinates outside the buffer are ignored,
   * so callers may draw shapes that run off the edge without clipping first.
   * @param x - Dot column
   * @param y - Dot row
   * @param on - True to raise the pin, false to lower it
   */
  public set(x: number, y: number, on: boolean = true): void {
    const col = Math.round(x);
    const row = Math.round(y);
    if (!this.contains(col, row)) {
      return;
    }
    this.pins[row * this.width + col] = on ? 1 : 0;
  }

  /**
   * Reads a single pin. Coordinates outside the buffer read as lowered.
   * @param x - Dot column
   * @param y - Dot row
   */
  public get(x: number, y: number): boolean {
    const col = Math.round(x);
    const row = Math.round(y);
    if (!this.contains(col, row)) {
      return false;
    }
    return this.pins[row * this.width + col] === 1;
  }

  /**
   * Lowers every pin.
   */
  public clear(): void {
    this.pins.fill(0);
  }

  /**
   * Reports whether every pin is lowered.
   */
  public isEmpty(): boolean {
    return !this.pins.includes(1);
  }

  /**
   * Number of raised pins. Used to decide whether a frame is worth sending and
   * to pick between outline and fill when a mark is too small for both.
   */
  public get raisedCount(): number {
    let count = 0;
    for (const pin of this.pins) {
      count += pin;
    }
    return count;
  }

  /**
   * Draws a horizontal run of pins.
   * @param x0 - Starting dot column (inclusive)
   * @param x1 - Ending dot column (inclusive)
   * @param y - Dot row
   * @param on - True to raise, false to lower
   */
  public hLine(x0: number, x1: number, y: number, on: boolean = true): void {
    // Clamped to the buffer before looping, not inside `set`. A zoomed-in view
    // projects geometry far outside the display, so an un-clamped run costs one
    // iteration per pin of the *chart* rather than of the *display* — and an
    // endpoint of Infinity, which a path with an out-of-range coordinate
    // produces, never reaches its bound at all: the loop hangs the tab.
    const from = Math.max(0, Math.round(Math.min(x0, x1)));
    const to = Math.min(this.width - 1, Math.round(Math.max(x0, x1)));
    for (let x = from; x <= to; x++) {
      this.set(x, y, on);
    }
  }

  /**
   * Draws a vertical run of pins.
   * @param x - Dot column
   * @param y0 - Starting dot row (inclusive)
   * @param y1 - Ending dot row (inclusive)
   * @param on - True to raise, false to lower
   */
  public vLine(x: number, y0: number, y1: number, on: boolean = true): void {
    // Clamped for the reason given on {@link hLine}.
    const from = Math.max(0, Math.round(Math.min(y0, y1)));
    const to = Math.min(this.height - 1, Math.round(Math.max(y0, y1)));
    for (let y = from; y <= to; y++) {
      this.set(x, y, on);
    }
  }

  /**
   * Draws a straight line between two points using Bresenham's algorithm,
   * one pin thick.
   * @param x0 - Start dot column
   * @param y0 - Start dot row
   * @param x1 - End dot column
   * @param y1 - End dot row
   * @param on - True to raise, false to lower
   */
  public line(x0: number, y0: number, x1: number, y1: number, on: boolean = true): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const endX = Math.round(x1);
    const endY = Math.round(y1);

    // Reject non-finite endpoints up front rather than bounding the loop. A
    // cap sized to the buffer looks like it only stops a NaN, but a zoomed-in
    // view projects geometry far outside the display: a line entering from
    // well off one edge exhausts the cap before it arrives and draws nothing
    // at all, so rect edges and axis lines crossing the view simply vanish.
    if (!Number.isFinite(x) || !Number.isFinite(y)
      || !Number.isFinite(endX) || !Number.isFinite(endY)) {
      return;
    }

    const dx = Math.abs(endX - x);
    const dy = -Math.abs(endY - y);
    const stepX = x < endX ? 1 : -1;
    const stepY = y < endY ? 1 : -1;
    let error = dx + dy;

    // One step per pin along the longer axis is exactly how many Bresenham
    // needs, so this ends the loop rather than truncating the line.
    const steps = Math.max(dx, -dy);
    for (let guard = 0; guard <= steps; guard++) {
      this.set(x, y, on);
      if (x === endX && y === endY) {
        return;
      }
      const doubled = error * 2;
      if (doubled >= dy) {
        error += dy;
        x += stepX;
      }
      if (doubled <= dx) {
        error += dx;
        y += stepY;
      }
    }
  }

  /**
   * Connects a run of points with straight segments.
   * @param points - Points in dot coordinates
   * @param on - True to raise, false to lower
   */
  public polyline(points: readonly { x: number; y: number }[], on: boolean = true): void {
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1];
      const to = points[i];
      this.line(from.x, from.y, to.x, to.y, on);
    }
  }

  /**
   * Connects a run of points with a stroke several pins wide.
   *
   * A one-pin stroke is at the floor of what a fingertip resolves, and a
   * diagonal one is below it: Bresenham steps a shallow diagonal in single
   * pins that touch only at their corners, so a finger sweeping across meets a
   * row of separate bumps rather than a line, and loses the trail whenever it
   * drifts by a pin. Widening the stroke is what turns a run of bumps into
   * something that can be followed.
   *
   * Drawn as repeated offset passes rather than as a thick-line primitive: the
   * grid is binary, so a union of one-pin strokes is exactly a wide stroke,
   * and it costs a few passes over an area the size of a postcard.
   *
   * The offsets are perpendicular to each segment, and only perpendicular. An
   * earlier version offset along both axes at once, on the reasoning that a
   * path may run in any direction and the pass that does not thicken it costs
   * nothing. It costs the width: offsetting a diagonal by a pin in x and again
   * in y lands on four distinct columns per row, so a stroke asked for at two
   * pins arrived at four. A line chart came back as a band a fingertip could
   * not find an edge of, which is most of what a line is for.
   *
   * @param points - Points in dot coordinates
   * @param weight - Pins across the stroke; 1 draws a plain polyline
   * @param on - True to raise, false to lower
   */
  public strokePath(
    points: readonly { x: number; y: number }[],
    weight: number,
    on: boolean = true,
  ): void {
    this.polyline(points, on);
    if (weight <= 1 || points.length < 2) {
      return;
    }

    // Spiralling out from the path, so an even weight grows to one side by the
    // same amount it grows to the other, give or take a pin: 2 is [1], 3 is
    // [1, -1], 4 is [1, -1, 2].
    const offsets: number[] = [];
    for (let step = 1; offsets.length < weight - 1; step++) {
      offsets.push(step);
      if (offsets.length < weight - 1) {
        offsets.push(-step);
      }
    }

    for (const offset of offsets) {
      for (let index = 0; index + 1 < points.length; index++) {
        const from = points[index];
        const to = points[index + 1];
        const [dx, dy] = DotRaster.normalOf(to.x - from.x, to.y - from.y, offset);
        this.polyline([
          { x: from.x + dx, y: from.y + dy },
          { x: to.x + dx, y: to.y + dy },
        ], on);

        // Stitch this segment's offset copy to the next one's. Where the path
        // turns, the two copies sit on different sides of the vertex and would
        // otherwise leave a notch in the stroke exactly where a reader is
        // feeling for the corner.
        if (index + 2 < points.length) {
          const after = points[index + 2];
          const [nextDx, nextDy] = DotRaster.normalOf(after.x - to.x, after.y - to.y, offset);
          this.polyline([
            { x: to.x + dx, y: to.y + dy },
            { x: to.x + nextDx, y: to.y + nextDy },
          ], on);
        }
      }
    }
  }

  /**
   * The offset that widens a segment without lengthening it.
   *
   * Quantised to whichever axis is more nearly perpendicular, because the
   * offset has to land on whole pins: a segment running mostly across is
   * thickened downward, one running mostly up and down is thickened sideways.
   * A segment of no length has no direction to be perpendicular to, and falls
   * to the same side as a horizontal one: the tie goes to `run`, so it is
   * thickened downward.
   *
   * @param run - The segment's extent across
   * @param rise - The segment's extent down
   * @param distance - Pins to offset by, signed
   */
  private static normalOf(run: number, rise: number, distance: number): [number, number] {
    return Math.abs(run) >= Math.abs(rise) ? [0, distance] : [distance, 0];
  }

  /**
   * Fills the interior of one or more closed rings using the even-odd rule.
   *
   * Rings are filled together rather than one at a time so a shape with a hole
   * — a donut wedge, a glyph counter — keeps its hole instead of having it
   * painted over by a later ring.
   *
   * @param rings - Closed rings in dot coordinates; each is an implicitly
   * closed sequence of points
   * @param on - True to raise, false to lower
   */
  public fillPolygon(rings: readonly (readonly { x: number; y: number }[])[], on: boolean = true): void {
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const ring of rings) {
      for (const point of ring) {
        if (!Number.isFinite(point.y)) {
          continue;
        }
        top = Math.min(top, point.y);
        bottom = Math.max(bottom, point.y);
      }
    }
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
      return;
    }

    const first = Math.max(0, Math.round(top));
    const last = Math.min(this.height - 1, Math.round(bottom));

    for (let y = first; y <= last; y++) {
      // Sample on the pin centre so a ring edge that lands exactly on a row
      // boundary does not count twice.
      const scanY = y + 0.5;
      const crossings: number[] = [];

      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const from = ring[i];
          const to = ring[(i + 1) % ring.length];
          // Both coordinates are checked, not just the one the scan line is
          // compared against: an edge with a finite `y` and a non-finite `x`
          // still crosses the row, and the crossing it contributes would be
          // the value that runs the fill off the end of the buffer.
          if (!Number.isFinite(from.y) || !Number.isFinite(to.y)) {
            continue;
          }
          if ((from.y <= scanY) === (to.y <= scanY)) {
            continue;
          }
          if (!Number.isFinite(from.x) || !Number.isFinite(to.x)) {
            continue;
          }
          const t = (scanY - from.y) / (to.y - from.y);
          crossings.push(from.x + t * (to.x - from.x));
        }
      }

      if (crossings.length < 2) {
        continue;
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        this.hLine(crossings[i], crossings[i + 1], y, on);
      }
    }
  }

  /**
   * Ordered-dither thresholds, one per pin position in a repeating 4x4 tile.
   *
   * A Bayer matrix rather than a random or a clustered pattern. Its raised pins
   * spread as evenly as the density allows, which is what a fingertip reads as
   * "how crowded is this" — clustered dots read instead as a pattern of blobs,
   * and a random one reads as noise whose density is hard to judge against the
   * cell beside it.
   */
  private static readonly DITHER: readonly (readonly number[])[] = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  /**
   * Fills rings with a texture whose crowding stands for a value.
   *
   * The pin grid has two states, so a value a chart drew as a colour has
   * nowhere else to go. Density is the substitute a hand can read: a heatmap
   * cell, a choropleth region, a hexbin cell and a mosaic tile are all the
   * same size and shape as their neighbours, so without this the display
   * carries their lattice and none of their numbers.
   *
   * @param rings - Closed rings in dot coordinates
   * @param density - How much of the interior to raise, 0 to 1
   */
  public fillDithered(
    rings: readonly (readonly { x: number; y: number }[])[],
    density: number,
  ): void {
    const level = Math.round(Math.min(1, Math.max(0, density)) * 16);
    if (level <= 0) {
      return;
    }
    if (level >= 16) {
      this.fillPolygon(rings);
      return;
    }

    // Filled into a scratch buffer and then transferred through the dither, so
    // the even-odd rule that gives a ring its holes is applied once, by the
    // code that already knows how, rather than reimplemented per pin.
    const solid = new DotRaster(this.width, this.height);
    solid.fillPolygon(rings);
    const tile = DotRaster.DITHER;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (solid.get(x, y) && tile[y % 4][x % 4] < level) {
          this.set(x, y);
        }
      }
    }
  }

  /**
   * Raises a filled disc.
   *
   * For a mark with no interior of its own — a scatter point, a line's vertex
   * — where the focus has to read as a separate object rather than as a
   * thickening of the stroke it sits on.
   *
   * @param cx - Centre, in dot coordinates
   * @param cy - Centre, in dot coordinates
   * @param radius - Radius in pins
   */
  public fillDisc(cx: number, cy: number, radius: number): void {
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || radius <= 0) {
      return;
    }
    const first = Math.max(0, Math.round(cy - radius));
    const last = Math.min(this.height - 1, Math.round(cy + radius));
    for (let y = first; y <= last; y++) {
      const span = Math.sqrt(Math.max(0, radius * radius - (y - cy) * (y - cy)));
      this.hLine(cx - span, cx + span, y);
    }
  }

  /**
   * Reports whether two rasters hold identical pin states. Used to skip a
   * transmission when a navigation move did not change the picture.
   * @param other - The raster to compare against
   */
  public equals(other: DotRaster): boolean {
    if (other.width !== this.width || other.height !== this.height) {
      return false;
    }
    for (let i = 0; i < this.pins.length; i++) {
      if (this.pins[i] !== other.pins[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Copies the buffer.
   */
  public clone(): DotRaster {
    const copy = new DotRaster(this.width, this.height);
    copy.pins.set(this.pins);
    return copy;
  }

  /**
   * Renders the buffer as text, one character per pin, for tests and debugging.
   * @param raised - Character for a raised pin
   * @param lowered - Character for a lowered pin
   */
  public toString(raised: string = 'O', lowered: string = '.'): string {
    const rows: string[] = [];
    for (let y = 0; y < this.height; y++) {
      let row = '';
      for (let x = 0; x < this.width; x++) {
        row += this.get(x, y) ? raised : lowered;
      }
      rows.push(row);
    }
    return rows.join('\n');
  }
}
