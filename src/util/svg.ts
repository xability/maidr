import { Color } from './color';
import { Constant } from './constant';

type Edge = 'top' | 'bottom' | 'left' | 'right';

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

  public static createHighlightElement(element: SVGElement, fallbackColor: string): SVGElement {
    const clone = element.cloneNode(true) as SVGElement;
    const tag = element.tagName.toLowerCase();
    const isLineElement = tag === Constant.POLYLINE || tag === Constant.LINE;
    const originalColor = isLineElement
      ? window.getComputedStyle(element).getPropertyValue(Constant.STROKE)
      : window.getComputedStyle(element).getPropertyValue(Constant.FILL);
    const color = this.getHighlightColor(originalColor, fallbackColor);

    clone.setAttribute(Constant.VISIBILITY, Constant.VISIBLE);
    clone.setAttribute(Constant.STROKE, color);
    clone.setAttribute(Constant.FILL, color);
    clone.style.fill = color;
    clone.style.stroke = color;
    if (isLineElement) {
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
