import type { NotificationService } from '@service/notification';
import type { MaidrLayer } from '@type/maidr';
import type { AudioState, BrailleState, TextState } from '@type/state';
import type { ScatterSeries } from './grammar';
import { AbstractTrace } from '@model/plot';
import { Orientation } from '@type/plot';
import { Constant } from '@util/constant';

const TYPE = 'Type';

enum NavMode {
  COL = 'column',
  ROW = 'row',
}

interface ScatterXPoint {
  fill?: string;
  x: number;
  y: number[];
  element?: Element;
}

interface ScatterYPoint {
  fill?: string;
  x: number[];
  y: number;
  element?: Element;
}

export class ScatterPlot extends AbstractTrace<number> {
  private mode: NavMode;
  private readonly orientation: Orientation;

  private readonly xPoints: ScatterXPoint[][];
  private readonly xValues: number[][];
  private readonly xElements: ScatterXPoint[];
  private readonly minY: number[];
  private readonly maxY: number[];

  private readonly yPoints: ScatterYPoint[][];
  private readonly yValues: number[][];
  private readonly yElements: ScatterYPoint[];
  private readonly minX: number[];
  private readonly maxX: number[];

  public constructor(layer: MaidrLayer) {
    super(layer);
    // layer.selector = 'g#PathCollection_1 > g > use';
    // todo: I can't get the selector to update from the html

    this.mode = NavMode.COL;
    const data = layer.data as ScatterSeries[];
    this.orientation = layer.orientation ?? Orientation.HORIZONTAL;

    this.xPoints = new Array<Array<ScatterXPoint>>();
    for (let i = 0; i < data.length; i++) {
      const sorted = data[i].points.sort((a, b) => a.x - b.x || b.y - b.y);
      const series = new Array<ScatterXPoint>();

      for (
        let curr = 0, last = series.length - 1;
        curr < sorted.length;
        curr++
      ) {
        if (curr !== 0 && sorted[curr].x === series[last].x) {
          series[last].y.push(sorted[curr].y);
        } else {
          last
            = series.push({
              fill: data[i].fill,
              x: sorted[curr].x,
              y: [sorted[curr].y],
            }) - 1;
        }
      }
      this.xPoints.push(series);
    }

    // visual highlighting
    // note: this doesn't handle multi plots. To do that we'd have to do a for on layer.selector[i]
    this.xElements = new Array<ScatterXPoint>();
    if (layer.selector) {
      const elements: SVGUseElement[] = Array.from(
        document.querySelectorAll(layer.selector),
      );
      const groups: Map<number, ScatterXPoint> = new Map();

      // we group the html elements by x then y attributes
      elements.forEach((el) => {
        const xAttr = el.getAttribute('x');
        const yAttr = el.getAttribute('y');
        if (xAttr === null || yAttr === null) {
          return;
        }

        const x = Number.parseFloat(xAttr);
        const y = Number.parseFloat(yAttr);
        const fill = el.style.fill || el.getAttribute('fill') || undefined;

        if (!groups.has(x)) {
          groups.set(x, {
            x,
            y: [],
            fill,
            element: el,
          });
        }

        groups.get(x)!.y.push(y);
      });

      this.xElements = Array.from(groups.values()).sort(
        (a, b) => a.x - b.x || a.y[0] - b.y[0],
      );
    }

    this.yPoints = new Array<Array<ScatterYPoint>>();
    for (let i = 0; i < data.length; i++) {
      const sorted = data[i].points.sort((a, b) => a.y - b.y || b.x - b.x);
      const series = new Array<ScatterYPoint>();

      for (
        let curr = 0, last = series.length - 1;
        curr < sorted.length;
        curr++
      ) {
        if (curr !== 0 && sorted[curr].y === series[last].y) {
          series[last].x.push(sorted[curr].x);
        } else {
          last
            = series.push({
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
    this.yElements = new Array<ScatterYPoint>();
    if (layer.selector) {
      // visual highlighting
      // sort the html elements by y then x attributes
      // and filter out dups of x and y
      const elements: SVGUseElement[] = Array.from(
        document.querySelectorAll(layer.selector),
      );
      const yGroups: Map<number, ScatterYPoint> = new Map();

      // we group the html elements by y then x attributes
      elements.forEach((el) => {
        const xAttr = el.getAttribute('x');
        const yAttr = el.getAttribute('y');
        if (xAttr === null || yAttr === null)
          return;

        const x = Number.parseFloat(xAttr);
        const y = Number.parseFloat(yAttr);
        if (Number.isNaN(x) || Number.isNaN(y))
          return;

        const fill = el.style.fill || el.getAttribute('fill') || undefined;

        if (!yGroups.has(y)) {
          yGroups.set(y, {
            y,
            x: [],
            fill,
            element: el,
          });
        }

        yGroups.get(y)!.x.push(x);
      });

      this.yElements = Array.from(yGroups.values()).sort(
        (a, b) => a.y - b.y || a.x[0] - b.x[0],
      );
    }

    this.xValues = this.xPoints.map(row => row.map(point => point.x));
    this.minX = this.xValues.map(row => Math.min(...row));
    this.maxX = this.xValues.map(row => Math.max(...row));

    this.yValues = this.yPoints.map(row => row.map(point => point.y));
    this.minY = this.yValues[0].map((_, col) =>
      Math.min(...this.yValues.map(row => row[col])),
    );
    this.maxY = this.yValues[0].map((_, col) =>
      Math.max(...this.yValues.map(row => row[col])),
    );
  }

  public notifyStateUpdate(): void {
    super.notifyStateUpdate();
    if (this.xElements.length > 0) {
      this.UpdateRect();
    }
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

  public UpdateRect(): void {
    // clear old points
    document.querySelectorAll('.highlight_point').forEach(e => e.remove());

    // this is a horrible hack, but I can't figure out how to pass the id through
    // Saairam help pls
    const id = window.maidr.id;

    // bound offset
    const chartBounds = document.getElementById(id)?.getBoundingClientRect();
    if (!chartBounds) {
      return;
    }

    // and create new
    const svgs = 'http://www.w3.org/2000/svg';
    if (this.orientation === Orientation.HORIZONTAL) {
      const elems = this.xElements[this.col];
      for (let i = 0; i < elems.y.length; i++) {
        const point = document.createElementNS(svgs, 'circle');
        point.setAttribute('class', 'highlight_point');
        point.setAttribute('r', '6');
        point.setAttribute('fill', 'none');
        point.setAttribute('stroke', Constant.DEFAULT_HIGHLIGHT_COLOR);
        point.setAttribute('stroke-width', '3');
        point.setAttribute('cx', elems.x.toString());
        point.setAttribute('cy', elems.y[i].toString());
        document.getElementById(id)?.appendChild(point);
      }
    } else {
      const elems = this.yElements[this.row];
      for (let i = 0; i < elems.x.length; i++) {
        const point = document.createElementNS(svgs, 'circle');
        point.setAttribute('class', 'highlight_point');
        point.setAttribute('r', '6');
        point.setAttribute('fill', 'none');
        point.setAttribute('stroke', Constant.DEFAULT_HIGHLIGHT_COLOR);
        point.setAttribute('stroke-width', '3');
        point.setAttribute('cx', elems.x[i].toString());
        point.setAttribute('cy', elems.y.toString());
        document.getElementById(id)?.appendChild(point);
      }
    }
  }
}
