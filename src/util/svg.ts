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

  public static createEmptyElement(type: string = 'rect'): SVGElement {
    const element = document.createElementNS(this.SVG_NAMESPACE, type) as SVGElement;
    element.setAttribute(Constant.FILL, Constant.TRANSPARENT);
    element.setAttribute(Constant.STROKE, Constant.TRANSPARENT);
    element.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
    return element;
  }

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

    const fillOpacity = window.getComputedStyle(element).getPropertyValue('fill-opacity');
    const strokeOpacity = window.getComputedStyle(element).getPropertyValue('stroke-opacity');

    const parsedFillOpacity = fillOpacity ? Number.parseFloat(fillOpacity) : NaN;
    if (!Number.isNaN(parsedFillOpacity) && parsedFillOpacity > 0 && parsedFillOpacity !== 1) {
      clone.setAttribute('fill-opacity', fillOpacity);
      clone.style.fillOpacity = fillOpacity;
    } else {
      clone.removeAttribute('fill-opacity');
      clone.style.fillOpacity = '1';
    }

    const parsedStrokeOpacity = strokeOpacity ? Number.parseFloat(strokeOpacity) : NaN;
    if (!Number.isNaN(parsedStrokeOpacity) && parsedStrokeOpacity > 0 && parsedStrokeOpacity !== 1) {
      clone.setAttribute('stroke-opacity', strokeOpacity);
      clone.style.strokeOpacity = strokeOpacity;
    } else {
      clone.removeAttribute('stroke-opacity');
      clone.style.strokeOpacity = '1';
    }

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

  public static getContrastingColorForElement(element: SVGElement): string {
    const fill = window.getComputedStyle(element).fill || 'rgb(255,255,255)';
    const rgb = Color.parse(fill);
    if (!rgb)
      return '#000';
    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    return luminance > 0.5 ? '#000' : '#fff';
  }

  public static setSubplotHighlightCss(element: SVGElement, color: string): void {
    element.style.outline = `4px solid ${color}`;
    element.style.outlineOffset = '3px';
    element.style.borderRadius = '3px';
    element.style.overflow = 'visible';
  }

  public static removeSubplotHighlightCss(element: SVGElement): void {
    element.style.removeProperty('outline');
    element.style.removeProperty('outline-offset');
    element.style.removeProperty('border-radius');
    element.style.removeProperty('overflow');
  }

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

  public static removeSubplotHighlightSvg(group: SVGElement): void {
    const bg = group.querySelector('rect, path') as SVGElement | null;
    if (bg) {
      bg.removeAttribute('stroke');
      bg.removeAttribute('stroke-width');
    }
  }
}
