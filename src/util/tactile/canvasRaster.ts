import { DotRaster } from './raster';

/**
 * The pixels of a chart drawn on a canvas, as `getImageData` returns them.
 */
export interface PixelImage {
  /**
   * RGBA, four bytes a pixel, row by row.
   */
  readonly data: Uint8ClampedArray;

  /**
   * Pixels across.
   */
  readonly width: number;

  /**
   * Pixels down.
   */
  readonly height: number;
}

/**
 * A rectangle of pixels in a {@link PixelImage}, right and bottom exclusive.
 */
export interface PixelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Turns a chart drawn on a canvas into pins.
 *
 * A canvas has no shapes to trace, only colours, so this does what the SVG
 * path does by other means: each pin looks at the patch of picture it stands
 * over, decides whether anything is drawn there, and is raised where a drawn
 * thing meets something else -- the page behind it, or a mark of a clearly
 * different colour. Marks come out as outlines, the way the SVG path draws
 * every mark but the focused one, so a hand can trace a bar's edges rather
 * than meet a solid plateau.
 */
export abstract class TactileCanvas {
  private constructor() { /* Prevent instantiation */ }

  /**
   * How far a pixel's colour has to be from the background, on the largest
   * channel, to count as drawn.
   *
   * Enough to leave out the pale grid lines charting libraries draw behind the
   * data -- Chart.js's default grid is a tenth-opacity black, 26 levels off
   * white -- and far below the difference between a mark and the page.
   */
  private static readonly INK_CONTRAST = 48;

  /**
   * Share of a pin's patch that has to be drawn for the pin to count as
   * drawn.
   *
   * Low, because at rest a pin stands over a patch ten pixels across and a
   * line one pixel wide covers a tenth of it: a line is exactly what must not
   * fall through.
   */
  private static readonly MIN_COVERAGE = 0.08;

  /**
   * Share of a patch's width that a line crossing it has to ink to count,
   * whatever share of the patch's area that is.
   */
  private static readonly CROSSING_SHARE = 0.6;

  /**
   * How far apart, on the largest channel, the colours of two touching drawn
   * patches have to be for the join between them to be an edge.
   *
   * Two bars of different series drawn flush against each other, or a
   * stacked segment on the one below it, are only told apart by their colour.
   * Well above the shading an anti-aliased edge leaves on a single colour.
   */
  private static readonly COLOUR_EDGE = 64;

  /**
   * Thickest a drawn run can be, in pins, and still be a stroke rather than a
   * shape, whatever it measures on screen.
   */
  private static readonly STROKE_RUN = 2;

  /**
   * Every nth pixel is looked at when finding the background, which is
   * enough to find the commonest colour of a picture hundreds of pixels
   * across.
   */
  private static readonly BACKGROUND_STRIDE = 7;

  /**
   * The colour of a pixel as it is seen on a white page: transparent pixels
   * show the page through them.
   * @param image - The picture
   * @param index - Byte offset of the pixel
   */
  private static seen(image: PixelImage, index: number): [number, number, number] {
    const alpha = image.data[index + 3] / 255;
    const over = (channel: number): number => channel * alpha + 255 * (1 - alpha);
    return [over(image.data[index]), over(image.data[index + 1]), over(image.data[index + 2])];
  }

  /**
   * Largest difference between two colours on any one channel.
   * @param a - One colour
   * @param b - The other
   */
  private static distance(a: readonly number[], b: readonly number[]): number {
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  }

  /**
   * The picture's commonest colour, which is what the chart is drawn on.
   * @param image - The picture
   */
  public static backgroundOf(image: PixelImage): [number, number, number] {
    const counts = new Map<number, { count: number; colour: [number, number, number] }>();
    let best: { count: number; colour: [number, number, number] } = { count: 0, colour: [255, 255, 255] };
    const pixels = image.width * image.height;
    for (let pixel = 0; pixel < pixels; pixel += this.BACKGROUND_STRIDE) {
      const colour = this.seen(image, pixel * 4);
      // Sixteen levels a channel, so the shading of one colour counts as one.
      const key = ((colour[0] >> 4) << 8) | ((colour[1] >> 4) << 4) | (colour[2] >> 4);
      const entry = counts.get(key) ?? { count: 0, colour };
      entry.count++;
      counts.set(key, entry);
      if (entry.count > best.count) {
        best = entry;
      }
    }
    return best.colour;
  }

  /**
   * Whether a pixel is drawn, rather than the background showing.
   * @param image - The picture
   * @param index - Byte offset of the pixel
   * @param background - The background colour
   */
  public static isInk(image: PixelImage, index: number, background: readonly number[]): boolean {
    return this.distance(this.seen(image, index), background) > this.INK_CONTRAST;
  }

  /**
   * Draws a picture onto a pin buffer.
   *
   * @param image - The chart's pixels
   * @param cellOf - The patch of pixels a pin stands over, or null where the
   * pin is outside the picture
   * @param width - Dots across the display
   * @param height - Dots down the display
   * @param masks - Areas of the picture to read as background: something the
   * library painted over the data, such as a tooltip
   * @param strokePixels - Thickest a drawn run can be, in the picture's own
   * pixels, and still be a line rather than a shape
   * @returns The pins, raised along the edges of what is drawn
   */
  public static render(
    image: PixelImage,
    cellOf: (x: number, y: number) => PixelRect | null,
    width: number,
    height: number,
    masks: readonly PixelRect[] = [],
    strokePixels: number = 0,
  ): DotRaster {
    const background = this.backgroundOf(image);
    const drawn = new Uint8Array(width * height);
    // A pin wholly under a mask is unknown rather than empty: what is behind
    // a tooltip is not the page, and taking it for the page drew the edge of
    // every mark the tooltip crossed, and the tooltip's own outline with them.
    const hidden = new Uint8Array(width * height);
    const colours: ([number, number, number] | null)[] = Array.from({ length: width * height }, () => null);

    // How many pixels one pin stands over, each way; the same for every pin.
    let pinWidth = 0;
    let pinHeight = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = cellOf(x, y);
        if (cell === null) {
          continue;
        }
        pinWidth = cell.right - cell.left;
        pinHeight = cell.bottom - cell.top;
        const sample = this.sampleCell(image, cell, background, masks);
        if (sample === 'hidden') {
          hidden[y * width + x] = 1;
        } else if (sample !== null) {
          drawn[y * width + x] = 1;
          colours[y * width + x] = sample;
        }
      }
    }

    // How far a drawn run reaches through each pin, across and down, so a
    // stroke can be told from a shape.
    const across = this.runs(drawn, width, height, 1, 0);
    const down = this.runs(drawn, width, height, 0, 1);

    // A drawn pin is raised where it meets something else. A neighbour off
    // the grid does not count: a mark the window cuts through is not ended by
    // the edge of the display, and outlining that edge would draw a boundary
    // the chart does not have.
    const raster = new DotRaster(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const colour = colours[index];
        if (drawn[index] === 0 || colour === null) {
          continue;
        }
        // A line drawn a few pixels wide is a few pins wide once zoomed, and
        // outlined like a shape it arrived as two parallel lines -- one for
        // each side of the stroke -- where the chart drew one. A run that thin
        // is raised whole, measured on screen so it stays a line at every
        // zoom; a bar, far wider, keeps its hollow outline.
        const thin = Math.min(across[index], down[index]) <= this.STROKE_RUN
          || Math.min(across[index] * pinWidth, down[index] * pinHeight) <= strokePixels;
        if (thin) {
          raster.set(x, y);
          continue;
        }
        const neighbours: [number, number][] = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        const edge = neighbours.some(([nx, ny]) => {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || hidden[ny * width + nx] === 1) {
            return false;
          }
          const other = colours[ny * width + nx];
          return other === null || this.distance(colour, other) > this.COLOUR_EDGE;
        });
        if (edge) {
          raster.set(x, y);
        }
      }
    }
    return raster;
  }

  /**
   * The length, in pins, of the drawn run through each pin along one
   * direction.
   *
   * A run that reaches the edge of the grid carries on past it, off the part
   * of the chart in view, and is counted as long: measured as far as the
   * edge, a mark the window cuts through looked thin along the whole edge of
   * the display and was raised there.
   * @param drawn - One per pin, 1 where something is drawn
   * @param width - Pins across
   * @param height - Pins down
   * @param dx - Step across, 0 or 1
   * @param dy - Step down, -1, 0 or 1
   */
  private static runs(drawn: Uint8Array, width: number, height: number, dx: number, dy: number): Uint16Array {
    const lengths = new Uint16Array(width * height);
    const visited = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (drawn[index] === 0 || visited[index] === 1) {
          continue;
        }
        // Back to the start of this run, then along it.
        let sx = x;
        let sy = y;
        while (sx - dx >= 0 && sy - dy >= 0 && sy - dy < height && drawn[(sy - dy) * width + (sx - dx)] === 1) {
          sx -= dx;
          sy -= dy;
        }
        const run: number[] = [];
        let cx = sx;
        let cy = sy;
        for (; cx < width && cy >= 0 && cy < height && drawn[cy * width + cx] === 1; cx += dx, cy += dy) {
          run.push(cy * width + cx);
        }
        const cut = sx - dx < 0 || sy - dy < 0 || sy - dy >= height
          || cx >= width || cy < 0 || cy >= height;
        const length = cut ? 0xFFFF : run.length;
        for (const member of run) {
          lengths[member] = length;
          visited[member] = 1;
        }
      }
    }
    return lengths;
  }

  /**
   * Whether a pixel falls in any of the masked areas.
   * @param masks - Areas to read as background
   * @param x - Pixel column
   * @param y - Pixel row
   */
  public static masked(masks: readonly PixelRect[], x: number, y: number): boolean {
    return masks.some(mask => x >= mask.left && x < mask.right && y >= mask.top && y < mask.bottom);
  }

  /**
   * What a pin stands over: the dominant drawn colour, null when too little
   * of its patch is drawn, or `hidden` when all of it is masked.
   *
   * @param image - The picture
   * @param cell - The pin's patch, in pixels
   * @param background - The background colour
   * @param masks - Areas to read as background
   */
  private static sampleCell(
    image: PixelImage,
    cell: PixelRect,
    background: readonly number[],
    masks: readonly PixelRect[],
  ): [number, number, number] | 'hidden' | null {
    // At close zoom a pin stands over less than a pixel; it then reads the
    // pixel it is over.
    let left = Math.floor(cell.left);
    let top = Math.floor(cell.top);
    let right = Math.max(left + 1, Math.ceil(cell.right));
    let bottom = Math.max(top + 1, Math.ceil(cell.bottom));
    left = Math.max(0, left);
    top = Math.max(0, top);
    right = Math.min(image.width, right);
    bottom = Math.min(image.height, bottom);
    if (left >= right || top >= bottom) {
      return null;
    }

    let total = 0;
    let inked = 0;
    const tally = new Map<number, { count: number; colour: [number, number, number] }>();
    for (let py = top; py < bottom; py++) {
      for (let px = left; px < right; px++) {
        if (this.masked(masks, px, py)) {
          continue;
        }
        total++;
        const index = (py * image.width + px) * 4;
        const colour = this.seen(image, index);
        if (this.distance(colour, background) <= this.INK_CONTRAST) {
          continue;
        }
        inked++;
        const key = ((colour[0] >> 5) << 6) | ((colour[1] >> 5) << 3) | (colour[2] >> 5);
        const entry = tally.get(key) ?? { count: 0, colour };
        entry.count++;
        tally.set(key, entry);
      }
    }
    if (total === 0) {
      return 'hidden';
    }
    // Or enough pixels to cross the patch: a hairline on a high-density
    // canvas is two pixels wide in a patch twenty-six across, under the share
    // above, and at rest it fell through every pin it crossed.
    const crossing = this.CROSSING_SHARE * Math.min(right - left, bottom - top);
    if (inked / total < this.MIN_COVERAGE && inked < Math.max(2, crossing)) {
      return null;
    }
    let dominant: { count: number; colour: [number, number, number] } | null = null;
    for (const entry of tally.values()) {
      if (dominant === null || entry.count > dominant.count) {
        dominant = entry;
      }
    }
    return dominant?.colour ?? null;
  }
}
