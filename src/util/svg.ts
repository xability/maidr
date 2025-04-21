import { Color } from './color';
import { Constant } from './constant';

export abstract class Svg {
  private constructor() { /* Prevent instantiation */ }

  private static SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

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

  public static createEmptyElement(type: string = 'rect'): SVGElement {
    const element = document.createElementNS(this.SVG_NAMESPACE, type) as SVGElement;
    element.setAttribute(Constant.FILL, Constant.TRANSPARENT);
    element.setAttribute(Constant.STROKE, Constant.TRANSPARENT);
    element.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
    return element;
  }

  public static createCircleElement(cx: string | number, cy: string | number, style: CSSStyleDeclaration, parent: SVGElement): SVGElement {
    const color = style.stroke || Constant.MAIDR_HIGHLIGHT_COLOR;
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

    parent.insertAdjacentElement(Constant.AFTER_END, element);
    return element;
  }

  public static createHighlightElement(element: SVGElement, fallbackColor: string): SVGElement {
    const clone = element.cloneNode(true) as SVGElement;
    const tag = element.tagName.toLowerCase();
    const originalColor = tag === Constant.POLYLINE
      ? window.getComputedStyle(element).getPropertyValue(Constant.STROKE)
      : window.getComputedStyle(element).getPropertyValue(Constant.FILL);
    const color = this.getHighlightColor(originalColor, fallbackColor);

    clone.setAttribute(Constant.VISIBILITY, Constant.VISIBLE);
    clone.setAttribute(Constant.STROKE, color);
    clone.setAttribute(Constant.FILL, color);
    clone.style.fill = color;
    clone.style.stroke = color;
    if (tag === Constant.POLYLINE) {
      const strokeWidth = window.getComputedStyle(clone).getPropertyValue(Constant.STROKE_WIDTH);
      clone.setAttribute(Constant.STROKE_WIDTH, `${strokeWidth + 2}`);
    }

    element.insertAdjacentElement(Constant.AFTER_END, clone);
    return clone;
  }

  private static getHighlightColor(originalColor: string, fallbackColor: string): string {
    const originalRgb = Color.parse(originalColor);
    if (!originalRgb) {
      return fallbackColor;
    }

    const invertedRgb = Color.invert(originalRgb);
    const contrastRatio = Color.getContrastRatio(originalRgb, invertedRgb);
    if (contrastRatio >= 4.5) {
      return Color.rgbToString(invertedRgb);
    }

    return fallbackColor;
  }
}
