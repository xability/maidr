import type { LinePoint, MaidrLayer, SmoothPoint } from '@type/grammar';
import type { AudioState } from '@type/state';
import { Svg } from '@util/svg';
import { LineTrace } from './line';

export class SmoothTrace extends LineTrace {
  public constructor(layer: MaidrLayer) {
    super(layer);
  }

  protected audio(): AudioState {
    const rowYValues = this.lineValues[this.row];
    const col = this.col;

    const getY = (i: number): number =>
      rowYValues[Math.max(0, Math.min(i, rowYValues.length - 1))];

    const prev = col > 0 ? getY(col - 1) : getY(col);
    const curr = getY(col);
    const next = col < rowYValues.length - 1 ? getY(col + 1) : getY(col);

    return {
      min: this.min[this.row],
      max: this.max[this.row],
      size: rowYValues.length,
      index: col,
      value: [prev, curr, next],
      isContinuous: true,
      // Only use groupIndex if there are multiple lines (actual multiline smooth plot)
      ...this.getAudioGroupIndex(),
    };
  }

  // Helper to access data points (since points is private in LineTrace)
  protected getDataPoints(row: number): LinePoint[] {
    return this.points?.[row] || [];
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

      // Use data points directly for highlight circles
      const dataPoints = this.getDataPoints(r) as SmoothPoint[];
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
