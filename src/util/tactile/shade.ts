/**
 * Reads the shade a chart painted a mark, so a display with two states per pin
 * can still carry a value the chart encoded as a colour.
 *
 * A heatmap, a choropleth, a hexbin and a mosaic put their entire content in
 * fill colour: every cell is the same size and shape, so the geometry that
 * reaches the pins is a lattice and nothing else. Measured across the example
 * gallery, a heatmap spent 819 pins drawing an 8x8 grid and delivered none of
 * its 64 values. That is not a degraded picture — it is a confident, crisp
 * diagram containing no data.
 *
 * Colour cannot be felt, but density can: the darker a mark, the more of its
 * interior is raised. It is coarse — a fingertip separates perhaps four levels
 * — and four levels of a value is the difference between reading a heatmap and
 * reading graph paper.
 */
export abstract class TactileShade {
  private constructor() { /* Prevent instantiation */ }

  /**
   * Coefficients of the Rec. 709 luma formula, which weights the channels the
   * way the eye does. The chart chose its colours to be told apart by eye, so
   * the ordering that matters is the one the eye would have seen.
   */
  private static readonly LUMA = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;

  /**
   * Smallest spread of shade across a trace's marks that counts as carrying a
   * value.
   *
   * Below this the marks are one colour with rounding either side of it — a
   * bar chart where fill is decoration, not data — and texturing them would
   * fill in the interiors that tell a hollow mark from the solid focused one,
   * trading a real cue for a meaningless one.
   */
  private static readonly MIN_SPREAD = 0.15;

  /**
   * Parses a CSS colour into a 0-1 luminance, or null when the mark is not
   * painted at all.
   *
   * Only the `rgb()` and `rgba()` forms browsers hand back from a computed
   * style, plus hex, which is what an SVG attribute usually holds. A fully
   * transparent fill is not a shade — an outlined-only mark has no value to
   * read — and neither is `none`.
   *
   * @param colour - A CSS colour string
   * @returns Luminance from 0 (black) to 1 (white), or null
   */
  public static luminanceOf(colour: string): number | null {
    const text = colour.trim().toLowerCase();
    if (text === '' || text === 'none' || text === 'transparent') {
      return null;
    }

    const functional = /^rgba?\(([^)]+)\)$/.exec(text);
    if (functional !== null) {
      const parts = functional[1].split(/[\s,/]+/).filter(Boolean).map(Number.parseFloat);
      if (parts.length < 3 || parts.slice(0, 3).some(part => !Number.isFinite(part))) {
        return null;
      }
      if (parts.length > 3 && parts[3] === 0) {
        return null;
      }
      return this.luma(parts[0], parts[1], parts[2]);
    }

    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
    if (hex === null) {
      return null;
    }
    const digits = hex[1].length === 3
      ? hex[1].split('').map(digit => digit + digit).join('')
      : hex[1];
    return this.luma(
      Number.parseInt(digits.slice(0, 2), 16),
      Number.parseInt(digits.slice(2, 4), 16),
      Number.parseInt(digits.slice(4, 6), 16),
    );
  }

  /**
   * Luminance of one colour, on a 0-1 scale.
   * @param r - Red channel, 0-255
   * @param g - Green channel, 0-255
   * @param b - Blue channel, 0-255
   */
  private static luma(r: number, g: number, b: number): number {
    const value = (this.LUMA.r * r + this.LUMA.g * g + this.LUMA.b * b) / 255;
    return Math.min(1, Math.max(0, value));
  }

  /**
   * Turns a trace's fill colours into how much of each mark's interior to
   * raise, or null when the colours carry no value.
   *
   * Normalised across the marks actually present rather than against absolute
   * black and white: a heatmap using the pale half of a colour ramp would
   * otherwise come out uniformly blank, and it is the ordering between cells
   * that a reader needs, not the absolute shade.
   *
   * @param colours - One entry per mark, in mark order; null where unpainted
   * @returns Densities from 0 to 1 in the same order, or null when the marks
   * are effectively one colour
   */
  public static densities(colours: readonly (string | null)[]): (number | null)[] | null {
    const luminances = colours.map(colour => (colour === null ? null : this.luminanceOf(colour)));
    const measured = luminances.filter((value): value is number => value !== null);
    if (measured.length < 2) {
      return null;
    }

    const lightest = Math.max(...measured);
    const darkest = Math.min(...measured);
    const spread = lightest - darkest;
    if (spread < this.MIN_SPREAD) {
      return null;
    }

    // Darker means denser: the eye reads a dark cell as more, and a hand reads
    // a crowded one as more, so the two agree and a sighted colleague and a
    // blind reader describe the same chart the same way.
    return luminances.map(value => (value === null ? null : (lightest - value) / spread));
  }
}
