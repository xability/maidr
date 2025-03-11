import type { NotificationService } from '@service/notification';
import type { Layer } from '@type/maidr';
import type { AudioState, BrailleState, TextState } from '@type/state';
import type { ScatterSeries } from './grammar';
import { AbstractTrace } from '@model/plot';

const TYPE = 'Type';

enum NavMode {
  COL = 'column',
  ROW = 'row',
}

interface ScatterXPoint {
  fill?: string;
  x: number;
  y: number[];
}

interface ScatterYPoint {
  fill?: string;
  x: number[];
  y: number;
}

export class ScatterPlot extends AbstractTrace<number> {
  private mode: NavMode;

  private readonly xPoints: ScatterXPoint[][];
  private readonly xValues: number[][];
  private readonly minY: number[];
  private readonly maxY: number[];

  private readonly yPoints: ScatterYPoint[][];
  private readonly yValues: number[][];
  private readonly minX: number[];
  private readonly maxX: number[];

  public constructor(maidr: Layer) {
    super(maidr);

    this.mode = NavMode.COL;
    const data = maidr.data as ScatterSeries[];

    this.xPoints = new Array<Array<ScatterXPoint>>();
    for (let i = 0; i < data.length; i++) {
      const sorted = data[i].points.sort((a, b) => a.x - b.x || b.y - b.y);
      const series = new Array<ScatterXPoint>();

      for (let curr = 0, last = series.length - 1; curr < sorted.length; curr++) {
        if (curr !== 0 && sorted[curr].x === series[last].x) {
          series[last].y.push(sorted[curr].y);
        } else {
          last = series.push({
            fill: data[i].fill,
            x: sorted[curr].x,
            y: [sorted[curr].y],
          }) - 1;
        }
      }
      this.xPoints.push(series);
    }

    this.yPoints = new Array<Array<ScatterYPoint>>();
    for (let i = 0; i < data.length; i++) {
      const sorted = data[i].points.sort((a, b) => a.y - b.y || b.x - b.x);
      const series = new Array<ScatterYPoint>();

      for (let curr = 0, last = series.length - 1; curr < sorted.length; curr++) {
        if (curr !== 0 && sorted[curr].y === series[last].y) {
          series[last].x.push(sorted[curr].x);
        } else {
          last = series.push({
            fill: data[i].fill,
            x: [sorted[curr].x],
            y: sorted[curr].y,
          }) - 1;
        }
      }

      for (let row = 0; row < series.length; row++) {
        if (!this.yPoints[row]) {
          this.yPoints[row] = new Array<ScatterYPoint>();
        }
        this.yPoints[row].push(series[row]);
      }
    }

    this.xValues = this.xPoints.map(row => row.map(point => point.x));
    this.minX = this.xValues.map(row => Math.min(...row));
    this.maxX = this.xValues.map(row => Math.max(...row));

    this.yValues = this.yPoints.map(row => row.map(point => point.y));
    this.minY = this.yValues[0].map((_, col) => Math.min(...this.yValues.map(row => row[col])));
    this.maxY = this.yValues[0].map((_, col) => Math.max(...this.yValues.map(row => row[col])));
  }

  public toggleNavigation(notification: NotificationService): void {
    if (this.mode === NavMode.COL) {
      this.mode = NavMode.ROW;
    } else {
      this.mode = NavMode.COL;
    }

    [this.row, this.col] = [this.col, this.row];
    this.notifyStateUpdate();

    const message = `Switched to ${this.mode} navigation`;
    notification.notify(message);
  }

  protected get values(): number[][] {
    return this.mode === NavMode.COL ? this.xValues : this.yValues;
  }

  protected audio(): AudioState {
    const isVertical = this.mode === NavMode.COL;

    const min = isVertical ? this.minY[this.row] : this.minX[this.col];
    const max = isVertical ? this.maxY[this.row] : this.maxX[this.col];
    const size = isVertical ? this.xPoints.length : this.yPoints.length;

    const index = isVertical ? this.col : this.row;
    const value = isVertical
      ? this.xPoints[this.row][this.col].y
      : this.yPoints[this.row][this.col].x;

    return {
      min,
      max,
      size,
      index,
      value,
    };
  }

  protected text(): TextState {
    const isVertical = this.mode === NavMode.COL;
    const point = isVertical
      ? this.xPoints[this.row][this.col]
      : this.yPoints[this.row][this.col];
    const fillData = point.fill
      ? { fill: { label: TYPE, value: point.fill } }
      : {};

    return {
      main: { label: this.xAxis, value: point.x },
      cross: { label: this.yAxis, value: point.y },
      ...fillData,
    };
  }

  protected braille(): BrailleState {
    return {
      empty: true,
      type: this.type,
    };
  }

  public get hasMultiPoints(): boolean {
    return true;
  }
}
