import type { MaidrLayer, SmoothPoint } from '@type/grammar';
import { Svg } from '@util/svg';
import { SmoothTrace } from './smooth';

/**
 * Represents a smooth trace with SVG coordinates for rendering data points using svg_x and svg_y values.
 */
export class SmoothTraceSvgXY extends SmoothTrace {
  /**
   * Creates a new SmoothTraceSvgXY instance for a given layer.
   * @param layer - The MAIDR layer containing smooth trace data with SVG coordinates
   */
  public constructor(layer: MaidrLayer) {
    super(layer);
  }

  /**
   * Maps data points to SVG circle elements using svg_x and svg_y coordinates from the data.
   * @param selectors - Optional array of CSS selectors for line elements
   * @returns Array of SVG element arrays for each line, or null if selectors are invalid or all mappings failed
   */
  protected mapToSvgElements(selectors?: string[]): SVGElement[][] | null {
    if (!selectors || selectors.length !== this.lineValues.length) {
      return null;
    }

    const svgElements: SVGElement[][] = [];
    let allFailed = true;
    for (let r = 0; r < selectors.length; r++) {
      const lineElement = Svg.selectElement(selectors[r], false);
      if (!lineElement) {
        svgElements.push([]);
        continue;
      }

      // Use svg_x/svg_y from data points
      const dataPoints = this.points?.[r] as SmoothPoint[];
      const linePointElements: SVGElement[] = [];
      for (const pt of dataPoints) {
        if (typeof pt.svg_x === 'number' && typeof pt.svg_y === 'number') {
          linePointElements.push(Svg.createCircleElement(pt.svg_x, pt.svg_y, lineElement));
        }
      }

      if (linePointElements.length > 0) {
        allFailed = false;
      }
      svgElements.push(linePointElements);
    }

    if (allFailed) {
      return null;
    }
    return svgElements;
  }
}
