import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import type { HighlightState, TextState } from '@type/state';
import { Orientation } from '@type/grammar';
import { Svg } from '@util/svg';
import { AbstractBarPlot } from './bar';

const SUM = 'Sum';
const LEVEL = 'Level';
const UNDEFINED = 'undefined';

export class SegmentedPlot extends AbstractBarPlot<SegmentedPoint> {
  public constructor(layer: MaidrLayer) {
    super(layer, layer.data as SegmentedPoint[][]);
    this.createSummaryLevel();
  }

  private createSummaryLevel(): void {
    const summaryValues = new Array<number>();
    const summaryPoints = new Array<SegmentedPoint>();
    for (let i = 0; i < this.barValues[0].length; i++) {
      const sum = this.barValues.reduce((sum, row) => sum + row[i], 0);
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
    if (this.highlightValues === null || this.row === this.barValues.length - 1) {
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

  protected mapToSvgElements(selector?: string): SVGElement[][] {
    if (!selector) {
      return new Array<Array<SVGElement>>();
    }

    const domElements = Svg.selectAllElements(selector);
    if (domElements.length === 0) {
      return new Array<Array<SVGElement>>();
    }

    const svgElements = new Array<Array<SVGElement>>();
    if (domElements[0] instanceof SVGPathElement) {
      for (let r = 0, domIndex = 0; r < this.barValues.length; r++) {
        const row = new Array<SVGElement>();
        for (let c = 0; c < this.barValues[r].length; c++) {
          if (domIndex >= domElements.length) {
            return new Array<Array<SVGElement>>();
          } else if (this.barValues[r][c] === 0) {
            row.push(Svg.createEmptyElement());
          } else {
            row.push(domElements[domIndex++]);
          }
        }
        svgElements.push(row);
      }
    } else if (domElements[0] instanceof SVGRectElement) {
      for (let r = 0; r < this.barValues.length; r++) {
        svgElements.push(new Array<SVGElement>());
      }
      for (let c = 0, domIndex = 0; c < this.barValues[0].length; c++) {
        for (let r = this.barValues.length - 1; r >= 0; r--) {
          if (domIndex >= domElements.length) {
            return new Array<Array<SVGElement>>();
          } else if (this.barValues[r][c] === 0) {
            svgElements[r].push(Svg.createEmptyElement());
          } else {
            svgElements[r].push(domElements[domIndex++]);
          }
        }
      }
    }
    return svgElements;
  }
}
