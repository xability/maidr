import type { MaidrLayer } from '@type/maidr';
import type { TextState } from '@type/state';
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

  public hasMultiPoints(): boolean {
    return true;
  }
}
