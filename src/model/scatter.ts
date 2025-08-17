import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import type { AudioState, BrailleState, HighlightState, TextState } from '@type/state';
import type { Dimension } from './abstract';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovablePlane } from './movable';

interface ScatterXPoint {
  x: number;
  y: number[];
}

interface ScatterYPoint {
  x: number[];
  y: number;
}

export class ScatterTrace extends AbstractTrace {
  protected readonly movable: MovablePlane;

  private readonly xPoints: ScatterXPoint[];
  private readonly yPoints: ScatterYPoint[];

  private readonly highlightXValues: SVGElement[][] | null;
  private readonly highlightYValues: SVGElement[][] | null;

  private readonly minX: number;
  private readonly maxX: number;
  private readonly minY: number;
  private readonly maxY: number;

  public constructor(layer: MaidrLayer) {
    super(layer);

    const data = layer.data as ScatterPoint[];

    const sortedByX = [...data].sort((a, b) => a.x - b.x || a.y - b.y);
    this.xPoints = new Array<ScatterXPoint>();
    let currentX: ScatterXPoint | null = null;
    for (const point of sortedByX) {
      if (!currentX || currentX.x !== point.x) {
        currentX = { x: point.x, y: [] };
        this.xPoints.push(currentX);
      }
      currentX.y.push(point.y);
    }

    const sortedByY = [...data].sort((a, b) => a.y - b.y || a.x - b.x);
    this.yPoints = new Array<ScatterYPoint>();
    let currentY: ScatterYPoint | null = null;
    for (const point of sortedByY) {
      if (!currentY || currentY.y !== point.y) {
        currentY = { y: point.y, x: [] };
        this.yPoints.push(currentY);
      }
      currentY.x.push(point.x);
    }

    let [minX, maxX] = [Infinity, -Infinity];
    for (const p of this.xPoints) {
      if (p.x < minX)
        minX = p.x;
      if (p.x > maxX)
        maxX = p.x;
    }
    this.minX = minX;
    this.maxX = maxX;

    let [minY, maxY] = [Infinity, -Infinity];
    for (const p of this.yPoints) {
      if (p.y < minY)
        minY = p.y;
      if (p.y > maxY)
        maxY = p.y;
    }
    this.minY = minY;
    this.maxY = maxY;

    [this.highlightXValues, this.highlightYValues] = this.mapToSvgElements(layer.selectors as string);
    this.movable = new MovablePlane(this.xPoints, this.yPoints);
  }

  public dispose(): void {
    this.movable.dispose();

    this.xPoints.length = 0;
    this.yPoints.length = 0;

    if (this.highlightXValues) {
      this.highlightXValues.forEach(row => row.forEach(el => el.remove()));
      this.highlightXValues.length = 0;
    }
    if (this.highlightYValues) {
      this.highlightYValues.forEach(row => row.forEach(el => el.remove()));
      this.highlightYValues.length = 0;
    }

    super.dispose();
  }

  protected get highlightValues(): SVGElement[][] | null {
    return this.movable.mode === 'col' ? this.highlightXValues : this.highlightYValues;
  }

  protected audio(): AudioState {
    if (this.movable.mode === 'col') {
      const current = this.xPoints[this.col];
      return {
        freq: {
          raw: current.y,
          min: this.minY,
          max: this.maxY,
        },
        panning: {
          y: this.row,
          x: this.col,
          rows: current.y.length,
          cols: this.xPoints.length,
        },
      };
    } else {
      const current = this.yPoints[this.row];
      return {
        freq: {
          raw: current.x,
          min: this.minX,
          max: this.maxX,
        },
        panning: {
          y: this.row,
          x: this.col,
          rows: this.yPoints.length,
          cols: current.x.length,
        },
      };
    }
  }

  protected braille(): BrailleState {
    return this.outOfBoundsState as BrailleState;
  }

  protected text(): TextState {
    if (this.movable.mode === 'col') {
      const current = this.xPoints[this.col];
      return {
        main: { label: this.xAxis, value: current.x },
        cross: { label: this.yAxis, value: current.y },
      };
    } else {
      const current = this.yPoints[this.row];
      return {
        main: { label: this.yAxis, value: current.y },
        cross: { label: this.xAxis, value: current.x },
      };
    }
  }

  protected get dimension(): Dimension {
    return {
      rows: this.yPoints.length,
      cols: this.xPoints.length,
    };
  }

  protected highlight(): HighlightState {
    if (this.highlightValues === null) {
      return this.outOfBoundsState as HighlightState;
    }

    const elements = this.movable.mode === 'col'
      ? this.col < this.highlightValues.length ? this.highlightValues![this.col] : null
      : this.row < this.highlightValues.length ? this.highlightValues![this.row] : null;
    if (!elements) {
      return this.outOfBoundsState as HighlightState;
    }

    return {
      empty: false,
      elements,
    };
  }

  protected hasMultiPoints(): boolean {
    return true;
  }

  private mapToSvgElements(selector?: string): [SVGElement[][], SVGElement[][]] | [null, null] {
    if (!selector) {
      return [null, null];
    }

    const elements = Svg.selectAllElements(selector);
    if (elements.length === 0) {
      return [null, null];
    }

    const xGroups = new Map<number, SVGElement[]>();
    const yGroups = new Map<number, SVGElement[]>();
    elements.forEach((element) => {
      const x = Number.parseFloat(element.getAttribute('x') || '');
      const y = Number.parseFloat(element.getAttribute('y') || '');

      if (!Number.isNaN(x)) {
        if (!xGroups.has(x))
          xGroups.set(x, []);
        xGroups.get(x)!.push(element);
      }

      if (!Number.isNaN(y)) {
        if (!yGroups.has(y))
          yGroups.set(y, []);
        yGroups.get(y)!.push(element);
      }
    });

    const sortedXElements = Array.from(xGroups.entries())
      .sort(([x1], [x2]) => x1 - x2)
      .map(([_, elements]) => elements);
    const sortedYElements = Array.from(yGroups.entries())
      .sort(([y1], [y2]) => y2 - y1)
      .map(([_, elements]) => elements);

    return [sortedXElements, sortedYElements];
  }
}
