import {AbstractPlot, Orientation} from './plot';
import {AudioState, TextState} from './state';
import {Maidr, SegmentPoint} from './grammar';

export class SegmentedPlot extends AbstractPlot {
  private readonly points: SegmentPoint[][];
  private readonly orientation: Orientation;

  private readonly globalMin: number;
  private readonly globalMax: number;

  private readonly min: number[];
  private readonly max: number[];

  constructor(maidr: Maidr) {
    super(maidr);

    this.points = maidr.data as SegmentPoint[][];
    this.orientation =
      maidr.orientation === Orientation.HORIZONTAL
        ? Orientation.HORIZONTAL
        : Orientation.VERTICAL;

    this.values = this.points.map(row =>
      row.map(point =>
        this.orientation === Orientation.VERTICAL
          ? Number(point.y)
          : Number(point.x)
      )
    );

    this.globalMin = Math.min(...this.values.flat());
    this.globalMax = Math.max(...this.values.flat());

    this.min = this.values.map(row => Math.min(...row));
    this.max = this.values.map(row => Math.max(...row));

    this.brailleValues = this.toBraille(this.values);
    this.createSummaryLevel();
  }

  private createSummaryLevel(): void {
    const summaryValues = new Array<number>();
    const summaryPoints = new Array<SegmentPoint>();
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

  protected audio(): AudioState {
    const isVertical = this.orientation === Orientation.VERTICAL;

    const min = isVertical ? this.min[this.col] : this.min[this.row];
    const max = isVertical ? this.max[this.col] : this.max[this.row];

    const size = isVertical ? this.values[this.row].length : this.values.length;
    const index = isVertical ? this.col : this.row;
    const value = isVertical
      ? this.values[this.row][this.col]
      : this.values[this.col][this.row];

    return {
      min,
      max,
      size,
      index,
      value,
    };
  }

  protected text(): TextState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const point = isVertical
      ? this.points[this.row][this.col]
      : this.points[this.col][this.row];

    const mainLabel = isVertical ? this.xAxis : this.yAxis;
    const mainValue = isVertical ? point.x : point.y;

    const crossLabel = isVertical ? this.yAxis : this.xAxis;
    const crossValue = isVertical ? point.y : point.x;

    const fillData = {fillLabel: 'Level', fillValue: point.fill ?? 'undefined'};

    return {
      mainLabel,
      mainValue,
      crossLabel,
      crossValue,
      ...fillData,
    };
  }

  protected toBraille(data: number[][]): string[][] {
    const braille = [];

    for (let row = 0; row < data.length; row++) {
      braille.push(this.createBraille(data[row], this.min[row], this.max[row]));
    }

    return braille;
  }

  protected createBraille(data: number[], min: number, max: number): string[] {
    const braille = new Array<string>();

    const range = (max - min) / 4;
    const low = min + range;
    const medium = low + range;
    const high = medium + range;

    for (let i = 0; i < data.length; i++) {
      if (data[i] === 0) {
        braille.push(' ');
      } else if (data[i] <= low) {
        braille.push('⣀');
      } else if (data[i] <= medium) {
        braille.push('⠤');
      } else if (data[i] <= high) {
        braille.push('⠒');
      } else {
        braille.push('⠉');
      }
    }

    return braille;
  }

  public get hasMultiPoints(): boolean {
    return true;
  }
}
