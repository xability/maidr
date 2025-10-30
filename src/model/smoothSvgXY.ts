import type { MaidrLayer, SmoothPoint } from '@type/grammar';
import { Svg } from '@util/svg';
import { SmoothTrace } from './smooth';

export class SmoothTraceSvgXY extends SmoothTrace {
  public constructor(layer: MaidrLayer) {
    super(layer);
  }

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
