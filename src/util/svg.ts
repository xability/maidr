import { Color } from './color';
import { Constant } from './constant';

/**
 * Edge positions for SVG bounding box calculations.
 */
type Edge = 'top' | 'bottom' | 'left' | 'right';

/**
 * Abstract utility class for SVG element manipulation, conversion, and highlighting operations.
 */
export abstract class Svg {
  private constructor() { /* Prevent instantiation */ }

  /**
   * SVG namespace URI for creating SVG elements.
   */
  private static SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

  /**
   * Converts an SVG element to a Base64-encoded JPEG data URL.
   * @param svg - The SVG element to convert
   * @returns A promise resolving to the Base64 data URL, or empty string on error
   */
  public static async toBase64(svg: HTMLElement): Promise<string> {
    try {
      // Serialize and optimize SVG
      const svgString = new XMLSerializer()
        .serializeToString(svg)
        .replace(/>\s+</g, '> <') // Safer whitespace handling
        .replace(/\s{2,}/g, ' ') // Collapse multiple spaces
        .trim();

      // Create SVG data URL with proper encoding
      const encodedSVG = encodeURIComponent(svgString)
        .replace(/'/g, '%27')
        .replace(/"/g, '%22');
      const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodedSVG}`;

      // Create and load image
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load SVG image'));
        img.src = svgDataUrl;
      });

      // Create canvas with proper scaling
      const canvas = document.createElement('canvas');
      [canvas.width, canvas.height] = [img.naturalWidth, img.naturalHeight];

      // Draw to canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Error converting SVG to Base 64: Canvas context unavailable');
        return '';
      }

      // Convert to JPEG with quality setting
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.92);
    } catch (error) {
      console.error('Error converting SVG to Base 64:', error instanceof Error ? error.message : error);
      return '';
    }
  }

  /**
   * Selects all SVG elements matching a query and optionally clones them.
   * @template T - The type of SVG element to select
   * @param query - CSS selector string to query elements
   * @param shouldClone - Whether to clone elements and insert them as hidden copies (default: true)
   * @returns Array of selected (or cloned) SVG elements
   */
  public static selectAllElements<T extends SVGElement>(query: string, shouldClone: boolean = true): T[] {
    return Array
      .from(document.querySelectorAll<T>(query))
      .map((element) => {
        if (!shouldClone) {
          return element;
        }

        const clone = element.cloneNode(true) as T;
        clone.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
        element.insertAdjacentElement(Constant.AFTER_END, clone);
        return clone;
      });
  }

  /**
   * Selects a single SVG element matching a query and optionally clones it.
   * @template T - The type of SVG element to select
   * @param query - CSS selector string to query the element
   * @param shouldClone - Whether to clone the element and insert it as a hidden copy (default: true)
   * @returns The selected (or cloned) SVG element
   */
  public static selectElement<T extends SVGElement>(query: string, shouldClone: boolean = true): T {
    const element = document.querySelector<T>(query);
    if (!shouldClone) {
      return element as T;
    }

    const clone = element?.cloneNode(true) as T;
    clone?.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);

    element?.insertAdjacentElement(Constant.AFTER_END, clone);
    return clone;
  }

  /**
   * Creates an empty, hidden, transparent SVG element of the specified type.
   * @param type - The SVG element type to create (default: 'rect')
   * @returns The newly created SVG element
   */
  public static createEmptyElement(type: string = 'rect'): SVGElement {
    const element = document.createElementNS(this.SVG_NAMESPACE, type) as SVGElement;
    element.setAttribute(Constant.FILL, Constant.TRANSPARENT);
    element.setAttribute(Constant.STROKE, Constant.TRANSPARENT);
    element.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
    return element;
  }

  /**
   * Creates a circle element styled to match the parent element's stroke or fill.
   * @param cx - The x-coordinate of the circle center
   * @param cy - The y-coordinate of the circle center
   * @param parent - The parent SVG element to inherit styling from
   * @returns The newly created circle element
   */
  public static createCircleElement(cx: string | number, cy: string | number, parent: SVGElement): SVGElement {
    const style = window.getComputedStyle(parent);
    const color = style.stroke || style.fill;
    const strokeWidth = style.strokeWidth || '2';
    const radius = Number.parseFloat(strokeWidth) * 2;
    const element = document.createElementNS(this.SVG_NAMESPACE, Constant.CIRCLE) as SVGElement;

    element.setAttribute(Constant.CIRCLE_X, String(cx));
    element.setAttribute(Constant.CIRCLE_Y, String(cy));
    element.setAttribute(Constant.RADIUS, String(radius));
    element.setAttribute(Constant.FILL, color);
    element.setAttribute(Constant.STROKE, color);
    element.setAttribute(Constant.STROKE_WIDTH, strokeWidth);
    element.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);

    parent.parentElement?.insertAdjacentElement(Constant.AFTER_END, element);
    return element;
  }

  /**
   * Creates a line element along a specified edge of an SVG element's bounding box.
   * @param box - The SVG element to create a line along
   * @param edge - The edge position ('top', 'bottom', 'left', or 'right')
   * @returns The newly created line element
   */
  public static createLineElement(box: SVGElement, edge: Edge): SVGElement {
    const svg = box as SVGGraphicsElement;
    const bBox = svg.getBBox();
    let x1: number, y1: number, x2: number, y2: number;
    switch (edge) {
      case 'top':
        [x1, y1, x2, y2] = [bBox.x, bBox.y, bBox.x + bBox.width, bBox.y];
        break;
      case 'bottom':
        [x1, y1, x2, y2] = [bBox.x, bBox.y + bBox.height, bBox.x + bBox.width, bBox.y + bBox.height];
        break;
      case 'left':
        [x1, y1, x2, y2] = [bBox.x, bBox.y, bBox.x, bBox.y + bBox.height];
        break;
      case 'right':
        [x1, y1, x2, y2] = [bBox.x + bBox.width, bBox.y, bBox.x + bBox.width, bBox.y + bBox.height];
        break;
    }

    const style = window.getComputedStyle(box);
    const line = document.createElementNS(this.SVG_NAMESPACE, Constant.LINE) as SVGElement;
    line.setAttribute(Constant.X1, String(x1));
    line.setAttribute(Constant.Y1, String(y1));
    line.setAttribute(Constant.X2, String(x2));
    line.setAttribute(Constant.Y2, String(y2));
    line.setAttribute(Constant.STROKE, style.stroke);
    line.setAttribute(Constant.STROKE_WIDTH, style.strokeWidth || '2');
    line.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);

    box.insertAdjacentElement(Constant.AFTER_END, line);
    return line;
  }

  /**
   * Creates a hidden line element at specified coordinates, styled to match a reference element.
   * Used for data-driven overlay elements in single-path box plots (e.g., Plotly).
   * @param x1 - Start x-coordinate
   * @param y1 - Start y-coordinate
   * @param x2 - End x-coordinate
   * @param y2 - End y-coordinate
   * @param referenceElement - Element to inherit stroke styling from
   * @returns The newly created line element
   */
  public static createPositionedLineElement(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    referenceElement: SVGElement,
  ): SVGElement {
    const style = window.getComputedStyle(referenceElement);
    const line = document.createElementNS(this.SVG_NAMESPACE, Constant.LINE) as SVGElement;
    line.setAttribute(Constant.X1, String(x1));
    line.setAttribute(Constant.Y1, String(y1));
    line.setAttribute(Constant.X2, String(x2));
    line.setAttribute(Constant.Y2, String(y2));
    line.setAttribute(Constant.STROKE, style.stroke || '#000000');
    line.setAttribute(Constant.STROKE_WIDTH, style.strokeWidth || '2');
    line.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);

    referenceElement.insertAdjacentElement(Constant.AFTER_END, line);
    return line;
  }

  /**
   * Minimum opacity value for fill to be considered visible.
   */
  private static readonly MIN_VISIBLE_FILL_OPACITY = 0.01;
  /**
   * Minimum opacity value for stroke to be considered visible.
   */
  private static readonly MIN_VISIBLE_STROKE_OPACITY = 0.01;
  /**
   * Amount to increase stroke width for highlighting line elements.
   */
  private static readonly STROKE_WIDTH_HIGHLIGHT_INCREASE = 2;

  /**
   * Adjusts opacity values to ensure visibility, returning '1' if below threshold.
   * @param value - The opacity value string to adjust
   * @param minThreshold - The minimum threshold for visibility
   * @returns Adjusted opacity value as a string
   */
  private static getAdjustedOpacity(value: string | null, minThreshold: number): string {
    const parsed = value ? Number.parseFloat(value) : Number.NaN;
    if (!Number.isNaN(parsed) && parsed > minThreshold) {
      return parsed.toString();
    }
    return '1';
  }

  /**
   * Creates a highlighted clone of an SVG element with enhanced visibility.
   * @param element - The SVG element to highlight
   * @param fallbackColor - Color to use if original color cannot be determined
   * @returns The highlighted clone element
   */
  public static createHighlightElement(element: SVGElement, fallbackColor: string): SVGElement {
    const clone = element.cloneNode(true) as SVGElement;
    const tag = element.tagName.toLowerCase();
    const isLineElement = tag === Constant.POLYLINE || tag === Constant.LINE;

    const computed = window.getComputedStyle(element);
    const originalColor = isLineElement
      ? computed.getPropertyValue(Constant.STROKE)
      : computed.getPropertyValue(Constant.FILL);
    const color = this.getHighlightColor(originalColor, fallbackColor);

    const fillOpacity = computed.getPropertyValue('fill-opacity');
    const strokeOpacity = computed.getPropertyValue('stroke-opacity');
    clone.style.fillOpacity = this.getAdjustedOpacity(fillOpacity, this.MIN_VISIBLE_FILL_OPACITY);
    clone.style.strokeOpacity = this.getAdjustedOpacity(strokeOpacity, this.MIN_VISIBLE_STROKE_OPACITY);

    clone.setAttribute(Constant.VISIBILITY, Constant.VISIBLE);
    clone.setAttribute(Constant.STROKE, color);
    clone.setAttribute(Constant.FILL, color);
    clone.style.fill = color;
    clone.style.stroke = color;

    if (isLineElement) {
      const strokeWidth = window.getComputedStyle(clone).getPropertyValue(Constant.STROKE_WIDTH);
      const match = strokeWidth.match(/^([0-9.]+)([a-z%]*)$/i);
      if (match) {
        const value = Number.parseFloat(match[1]);
        const unit = match[2] || '';
        clone.setAttribute(Constant.STROKE_WIDTH, `${value + this.STROKE_WIDTH_HIGHLIGHT_INCREASE}${unit}`);
      } else {
        const parsed = Number.parseFloat(strokeWidth);
        const value = Number.isNaN(parsed)
          ? this.STROKE_WIDTH_HIGHLIGHT_INCREASE
          : parsed + this.STROKE_WIDTH_HIGHLIGHT_INCREASE;
        clone.setAttribute(Constant.STROKE_WIDTH, `${value}`);
      }
    }

    element.insertAdjacentElement(Constant.AFTER_END, clone);
    return clone;
  }

  /**
   * Determines an appropriate highlight color based on the original color's luminance.
   * @param originalColor - The original color to base the highlight on
   * @param fallbackColor - Color to use if original cannot be parsed or is dark
   * @returns The computed highlight color string
   */
  private static getHighlightColor(originalColor: string, fallbackColor: string): string {
    const originalRgb = Color.parse(originalColor);
    if (!originalRgb) {
      return fallbackColor;
    }

    const contrastWithWhite = Color.getContrastRatio(originalRgb, Constant.HIGHLIGHT_BASE_COLOR);
    const isLight = contrastWithWhite < Constant.HIGHLIGHT_CONTRAST_RATIO;

    // For dark colors, just use the fallback color
    if (!isLight) {
      return fallbackColor;
    }

    const modifiedRgb = { ...originalRgb };

    // Check if the color is grayscale (R=G=B)
    if (originalRgb.r === originalRgb.g && originalRgb.g === originalRgb.b) {
      // For grayscale, modify all channels uniformly
      modifiedRgb.r = Math.min(Constant.HIGHLIGHT_MAX_COLOR, Math.floor(originalRgb.r * Constant.HIGHLIGHT_COLOR_RATIO));
      modifiedRgb.g = Math.min(Constant.HIGHLIGHT_MAX_COLOR, Math.floor(originalRgb.g * Constant.HIGHLIGHT_COLOR_RATIO));
      modifiedRgb.b = Math.min(Constant.HIGHLIGHT_MAX_COLOR, Math.floor(originalRgb.b * Constant.HIGHLIGHT_COLOR_RATIO));
    } else {
      // For non-grayscale colors, modify only the dominant channel
      if (originalRgb.r >= originalRgb.g && originalRgb.r >= originalRgb.b) {
        modifiedRgb.r = Math.min(Constant.HIGHLIGHT_MAX_COLOR, Math.floor(originalRgb.r * Constant.HIGHLIGHT_COLOR_RATIO));
      } else if (originalRgb.g >= originalRgb.r && originalRgb.g >= originalRgb.b) {
        modifiedRgb.g = Math.min(Constant.HIGHLIGHT_MAX_COLOR, Math.floor(originalRgb.g * Constant.HIGHLIGHT_COLOR_RATIO));
      } else {
        modifiedRgb.b = Math.min(Constant.HIGHLIGHT_MAX_COLOR, Math.floor(originalRgb.b * Constant.HIGHLIGHT_COLOR_RATIO));
      }
    }

    return Color.rgbToString(modifiedRgb);
  }

  /**
   * Calculates a contrasting color (black or white) based on the element's fill color.
   * @param element - The SVG element to analyze
   * @returns '#000' for light backgrounds, '#fff' for dark backgrounds
   */
  public static getContrastingColorForElement(element: SVGElement): string {
    const fill = window.getComputedStyle(element).fill || 'rgb(255,255,255)';
    const rgb = Color.parse(fill);
    if (!rgb)
      return '#000';
    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return luminance > 0.5 ? '#000' : '#fff';
  }

  /**
   * Applies CSS outline styling to highlight a subplot element.
   * @param element - The SVG element to highlight
   * @param color - The color for the outline
   */
  public static setSubplotHighlightCss(element: SVGElement, color: string): void {
    element.style.outline = `4px solid ${color}`;
    element.style.outlineOffset = '3px';
    element.style.borderRadius = '3px';
    element.style.overflow = 'visible';
  }

  /**
   * Removes CSS outline highlighting from a subplot element.
   * @param element - The SVG element to remove highlighting from
   */
  public static removeSubplotHighlightCss(element: SVGElement): void {
    element.style.removeProperty('outline');
    element.style.removeProperty('outline-offset');
    element.style.removeProperty('border-radius');
    element.style.removeProperty('overflow');
  }

  /**
   * Applies SVG stroke highlighting to a subplot with adaptive color based on background.
   * @param group - The SVG group element to highlight
   * @param fallbackColor - Color to use if background color cannot be determined
   * @param figureBgElement - Optional background element to inherit color from
   */
  public static setSubplotHighlightSvgWithAdaptiveColor(group: SVGElement, fallbackColor: string, figureBgElement?: SVGElement): void {
    const bg = group.querySelector('rect, path') as SVGElement | null;
    let originalColor = '';
    if (bg) {
      originalColor = window.getComputedStyle(bg).getPropertyValue('fill');
      if (!originalColor || originalColor === 'none' || originalColor === 'transparent' || originalColor === 'rgba(0, 0, 0, 0)') {
        if (figureBgElement) {
          originalColor = window.getComputedStyle(figureBgElement).getPropertyValue('fill');
        } else {
          originalColor = fallbackColor;
        }
      }
      const highlightColor = this.getHighlightColor(originalColor, fallbackColor);
      bg.setAttribute('stroke', highlightColor);
      bg.setAttribute('stroke-width', '4');
    }
  }

  /**
   * Removes SVG stroke highlighting from a subplot element.
   * @param group - The SVG group element to remove highlighting from
   */
  public static removeSubplotHighlightSvg(group: SVGElement): void {
    const bg = group.querySelector('rect, path') as SVGElement | null;
    if (bg) {
      bg.removeAttribute('stroke');
      bg.removeAttribute('stroke-width');
    }
  }
}
