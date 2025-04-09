import type { MaidrLayer } from '@type/maidr';
import type { MovableDirection } from '@type/movable';
import type { AudioState, AutoplayState, HighlightState, TextState } from '@type/state';
import type { ScatterPoint } from './grammar';
import { AbstractTrace } from '@model/plot';

enum NavMode {
  COL = 'column',
  ROW = 'row',
}

interface ScatterXPoint {
  x: number;
  y: number[];
}

interface ScatterYPoint {
  y: number;
  x: number[];
}

export class ScatterPlot extends AbstractTrace<number> {
  private mode: NavMode;

  private readonly xPoints: ScatterXPoint[];
  private readonly yPoints: ScatterYPoint[];

  private readonly xValues: number[];
  private readonly yValues: number[];

  private readonly minX: number;
  private readonly maxX: number;
  private readonly minY: number;
  private readonly maxY: number;

  public constructor(layer: MaidrLayer) {
    super(layer);

    this.mode = NavMode.COL;
    const data = layer.data as ScatterPoint[];

    // Process x-axis grouped points
    const sortedByX = [...data].sort((a, b) => a.x - b.x || a.y - b.y);
    this.xPoints = [];
    let currentX: ScatterXPoint | null = null;
    for (const point of sortedByX) {
      if (!currentX || currentX.x !== point.x) {
        currentX = { x: point.x, y: [] };
        this.xPoints.push(currentX);
      }
      currentX.y.push(point.y);
    }

    // Process y-axis grouped points
    const sortedByY = [...data].sort((a, b) => a.y - b.y || a.x - b.x);
    this.yPoints = [];
    let currentY: ScatterYPoint | null = null;
    for (const point of sortedByY) {
      if (!currentY || currentY.y !== point.y) {
        currentY = { y: point.y, x: [] };
        this.yPoints.push(currentY);
      }
      currentY.x.push(point.x);
    }

    // Calculate axis ranges
    this.xValues = this.xPoints.map(p => p.x);
    this.yValues = this.yPoints.map(p => p.y);

    this.minX = Math.min(...this.xValues);
    this.maxX = Math.max(...this.xValues);
    this.minY = Math.min(...this.yValues);
    this.maxY = Math.max(...this.yValues);
  }

  public dispose(): void {
    this.xPoints.length = 0;
    this.yPoints.length = 0;
    this.xValues.length = 0;
    this.yValues.length = 0;
    super.dispose();
  }

  protected get values(): number[][] {
    return this.mode === NavMode.COL
      ? [this.xValues]
      : [this.yValues];
  }

  protected get brailleValues(): null {
    return null;
  }

  protected audio(): AudioState {
    if (this.mode === NavMode.COL) {
      const current = this.xPoints[this.col];
      return {
        min: this.minY,
        max: this.maxY,
        size: current.y.length,
        index: this.col,
        value: current.y,
      };
    } else {
      const current = this.yPoints[this.row];
      return {
        min: this.minX,
        max: this.maxX,
        size: current.x.length,
        index: this.row,
        value: current.x,
      };
    }
  }

  protected text(): TextState {
    if (this.mode === NavMode.COL) {
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

  protected autoplay(): AutoplayState {
    return {
      UPWARD: this.yValues.length,
      DOWNWARD: this.yValues.length,
      FORWARD: this.xValues.length,
      BACKWARD: this.xValues.length,
    };
  }

  protected highlight(): HighlightState {
    return {
      empty: true,
      type: 'trace',
      traceType: this.type,
    };
  }

  protected hasMultiPoints(): boolean {
    return true;
  }

  private toggleNavigation(): void {
    if (this.mode === NavMode.COL) {
      const currentX = this.xPoints[this.col];
      const midY = currentX.y[Math.floor(currentX.y.length / 2)];
      this.row = this.yValues.indexOf(midY);
      this.mode = NavMode.ROW;
    } else {
      const currentY = this.yPoints[this.row];
      const midX = currentY.x[Math.floor(currentY.x.length / 2)];
      this.col = this.xValues.indexOf(midX);
      this.mode = NavMode.COL;
    }
  }

  public moveOnce(direction: MovableDirection): void {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.notifyStateUpdate();
      return;
    }

    if (!this.isMovable(direction)) {
      this.notifyOutOfBounds();
      return;
    }

    if (this.mode === NavMode.COL) {
      switch (direction) {
        case 'FORWARD':
          this.col++;
          break;
        case 'BACKWARD':
          this.col--;
          break;
        case 'UPWARD':
        case 'DOWNWARD': {
          this.toggleNavigation();
          break;
        }
      }
    } else {
      switch (direction) {
        case 'UPWARD':
          this.row++;
          break;
        case 'DOWNWARD':
          this.row--;
          break;
        case 'FORWARD':
        case 'BACKWARD': {
          this.toggleNavigation();
          break;
        }
      }
    }
    this.notifyStateUpdate();
  }

  public moveToExtreme(direction: MovableDirection): void {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    if (this.mode === NavMode.COL) {
      switch (direction) {
        case 'UPWARD':
          this.toggleNavigation();
          this.row = this.yPoints.length - 1;
          break;
        case 'DOWNWARD':
          this.toggleNavigation();
          this.row = 0;
          break;
        case 'FORWARD':
          this.col = this.xPoints.length - 1;
          break;
        case 'BACKWARD':
          this.col = 0;
          break;
      }
    } else {
      switch (direction) {
        case 'UPWARD':
          this.row = this.yPoints.length - 1;
          break;
        case 'DOWNWARD':
          this.row = 0;
          break;
        case 'FORWARD':
          this.toggleNavigation();
          this.col = this.xPoints.length - 1;
          break;
        case 'BACKWARD':
          this.toggleNavigation();
          this.col = 0;
          break;
      }
    }
    this.notifyStateUpdate();
  }

  public isMovable(target: number | MovableDirection): boolean {
    if (typeof target === 'number') {
      return false;
    }

    if (this.mode === NavMode.COL) {
      switch (target) {
        case 'FORWARD':
          return this.col < this.xPoints.length - 1;
        case 'BACKWARD':
          return this.col > 0;
        case 'UPWARD':
        case 'DOWNWARD':
          return true;
      }
    } else {
      switch (target) {
        case 'UPWARD':
          return this.row < this.yPoints.length - 1;
        case 'DOWNWARD':
          return this.row > 0;
        case 'FORWARD':
        case 'BACKWARD':
          return true;
      }
    }
  }
}
