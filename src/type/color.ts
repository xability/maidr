/**
 * RGB color representation with red, green, and blue components.
 */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * RGB color with an alpha component from 0 (transparent) to 1 (opaque).
 */
export interface Rgba extends Rgb {
  a: number;
}
