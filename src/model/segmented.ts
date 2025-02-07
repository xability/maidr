import type { Maidr, SegmentedPoint } from './grammar';
import type { TextState } from './state';
import { AbstractBarPlot, Orientation } from './plot';

const SUM = 'Sum';
const LEVEL = 'Level';
const UNDEFINED = 'undefined';

export class SegmentedPlot extends AbstractBarPlot<SegmentedPoint> {
  public constructor(maidr: Maidr) {
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
    this.values.push(summaryValues);

    const summaryMin = Math.min(...summaryValues);
    const summaryMax = Math.max(...summaryValues);
    this.min.push(summaryMin);
    this.max.push(summaryMax);

    this.brailleValues.push(
      this.createBraille(summaryValues, summaryMin, summaryMax),
    );
  }

  protected text(): TextState {
    const fillData = {
      fillLabel: LEVEL,
      fillValue: this.points[this.row][this.col].fill ?? UNDEFINED,
    };

    return {
      ...super.text(),
      ...fillData,
    };
  }

  public get hasMultiPoints(): boolean {
    return true;
  }
}
