import type { MaidrLayer } from '@type/maidr';
import type { HighlightState, TextState } from '@type/state';
import type { SegmentedPoint } from './grammar';
import { Orientation } from '@type/plot';
import { AbstractBarPlot } from './bar';

const SUM = 'Sum';
const LEVEL = 'Level';
const UNDEFINED = 'undefined';

export class SegmentedPlot extends AbstractBarPlot<SegmentedPoint> {
  public constructor(maidr: MaidrLayer) {
    super(maidr, maidr.data as SegmentedPoint[][]);
    this.createSummaryLevel();
  }

  private createSummaryLevel(): void {
    const summaryValues = new Array<number>();
    const summaryPoints = new Array<SegmentedPoint>();
    for (let i = 0; i < this.values[0].length; i++) {
      const sum = this.values.reduce((sum, row) => sum + row[i], 0);
      summaryValues.push(sum);

      const point
        = this.orientation === Orientation.VERTICAL
          ? {
              x: this.points[0][i].x,
              y: sum,
              fill: SUM,
            }
          : {
              x: sum,
              y: this.points[0][i].y,
              fill: SUM,
            };
      summaryPoints.push(point);
    }
    this.points.push(summaryPoints);
    this.barValues.push(summaryValues);

    const summaryMin = Math.min(...summaryValues);
    const summaryMax = Math.max(...summaryValues);
    this.min.push(summaryMin);
    this.max.push(summaryMax);

    this.brailleValues.push(
      this.createBraille(summaryValues, summaryMin, summaryMax),
    );
  }

  protected text(): TextState {
    return {
      ...super.text(),
      fill: {
        label: LEVEL,
        value: this.points[this.row][this.col].fill ?? UNDEFINED,
      },
    };
  }

  protected highlight(): HighlightState {
    if (this.highlightValues.length === 0 || this.row === this.barValues.length - 1) {
      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
      };
    }

    return {
      empty: false,
      elements: this.highlightValues[this.row][this.col],
    };
  }

  protected hasMultiPoints(): boolean {
    return true;
  }

  protected getSvgElements(selector: string): SVGElement[][] {
    const svgElements = new Array<Array<SVGElement>>();
    if (!selector) {
      return svgElements;
    }

    const domElements = Array.from(document.querySelectorAll<SVGElement>(selector));
    if (domElements.length === 0) {
      return svgElements;
    }

    if (domElements[0] instanceof SVGPathElement) {
      for (let r = 0, domIndex = 0; r < this.barValues.length; r++) {
        const row = new Array<SVGElement>();
        for (let c = 0; c < this.barValues[r].length; c++) {
          if (domIndex >= domElements.length) {
            svgElements.length = 0;
            return svgElements;
          } else if (this.barValues[r][c] === 0) {
            row.push(new SVGElement());
          } else {
            row.push(domElements[domIndex++]);
          }
        }
        svgElements.push(row);
      }
    }

    return svgElements;
  }
}
