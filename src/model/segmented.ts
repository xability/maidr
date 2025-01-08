import {AbstractBarPlot, Orientation} from './plot';
import {Maidr, SegmentedPoint} from './grammar';
import {TextState} from './state';

export class SegmentedPlot extends AbstractBarPlot<SegmentedPoint> {
  private readonly globalMin: number;
  private readonly globalMax: number;

  constructor(maidr: Maidr) {
    super(maidr, maidr.data as SegmentedPoint[][]);

    this.globalMin = Math.min(...this.values.flat());
    this.globalMax = Math.max(...this.values.flat());

    this.createSummaryLevel();
  }

  private createSummaryLevel(): void {
    const summaryValues = new Array<number>();
    const summaryPoints = new Array<SegmentedPoint>();
    for (let i = 0; i < this.values[0].length; i++) {
      const sum = this.values.reduce((sum, row) => sum + row[i], 0);
      summaryValues.push(sum);

      const point =
        this.orientation === Orientation.VERTICAL
          ? {
              x: this.points[0][i].x,
              y: sum,
              fill: 'Sum',
            }
          : {
              x: sum,
              y: this.points[0][i].y,
              fill: 'Sum',
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
      this.createBraille(summaryValues, summaryMin, summaryMax)
    );
  }

  protected text(): TextState {
    const fillData = {
      fillLabel: 'Level',
      fillValue: this.points[this.row][this.col].fill ?? 'undefined',
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
