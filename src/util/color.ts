import type { Rgb } from '@type/color';

/**
 * Abstract utility class for color parsing, manipulation, and contrast calculations.
 */
export abstract class Color {
  private constructor() { /* Prevent instantiation */ }

  /**
   * Parses a color string in hex or rgb(a) format and returns RGB values.
   * @param color - Color string in hex (#fff, #ffffff) or rgb/rgba format
   * @returns RGB object with r, g, b properties, or null if parsing fails
   */
  public static parse(color: string): Rgb | null {
    // Remove whitespace and lowercase
    const c = color.replace(/\s/g, '').toLowerCase();

    // Handle hex format
    if (/^#(?:[a-f0-9]{3}){1,2}$/.test(c)) {
      let hex = c.substring(1).split('');
      if (hex.length === 3) {
        hex = [hex[0], hex[0], hex[1], hex[1], hex[2], hex[2]];
      }
      return {
        r: Number.parseInt(hex[0] + hex[1], 16),
        g: Number.parseInt(hex[2] + hex[3], 16),
        b: Number.parseInt(hex[4] + hex[5], 16),
      };
    }

    // Handle rgb(a) format
    const rgbMatch = c.match(/^rgba?\((\d+),(\d+),(\d+)(?:,\d*(?:\.\d*)?)?\)$/);
    if (rgbMatch) {
      return {
        r: Number.parseInt(rgbMatch[1], 10),
        g: Number.parseInt(rgbMatch[2], 10),
        b: Number.parseInt(rgbMatch[3], 10),
      };
    }

    return null;
  }

  /**
   * Inverts an RGB color by subtracting each channel from 255.
   * @param rgb - The RGB color to invert
   * @returns The inverted RGB color
   */
  public static invert(rgb: Rgb): Rgb {
    return {
      r: 255 - rgb.r,
      g: 255 - rgb.g,
      b: 255 - rgb.b,
    };
  }

  /**
   * Calculates the WCAG contrast ratio between two RGB colors.
   * @param rgb1 - The first RGB color
   * @param rgb2 - The second RGB color
   * @returns The contrast ratio between the two colors (1 to 21)
   */
  public static getContrastRatio(rgb1: Rgb, rgb2: Rgb): number {
    const l1 = this.calculateLuminance(rgb1);
    const l2 = this.calculateLuminance(rgb2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  /**
   * Calculates the relative luminance of an RGB color using the WCAG formula.
   * @param rgb - The RGB color to calculate luminance for
   * @returns The relative luminance value (0 to 1)
   */
  private static calculateLuminance(rgb: Rgb): number {
    const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
      const channel = c / 255;
      return channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /**
   * Converts an RGB object to a CSS rgb() string format.
   * @param rgb - The RGB color to convert
   * @returns CSS rgb() string representation
   */
  public static rgbToString(rgb: Rgb): string {
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }

  public static isEqual(color1: string, color2: string): boolean {
    const rgb1 = this.parse(color1);
    const rgb2 = this.parse(color2);
    if (!rgb1 || !rgb2) {
      return false;
    }
    return rgb1.r === rgb2.r && rgb1.g === rgb2.g && rgb1.b === rgb2.b;
  }
}
