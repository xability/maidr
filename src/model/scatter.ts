import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { AudioState, AutoplayState, BrailleState, HighlightState, TextState } from '@type/state';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';

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

export class ScatterTrace extends AbstractTrace<number> {
  private mode: NavMode;

  private readonly xPoints: ScatterXPoint[];
  private readonly yPoints: ScatterYPoint[];

  private readonly xValues: number[];
  private readonly yValues: number[];

  private readonly highlightXValues: SVGElement[][] | null;
  private readonly highlightYValues: SVGElement[][] | null;

  private readonly minX: number;
  private readonly maxX: number;
  private readonly minY: number;
  private readonly maxY: number;

  public constructor(layer: MaidrLayer) {
    super(layer);

    this.mode = NavMode.COL;
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

    this.xValues = this.xPoints.map(p => p.x);
    this.yValues = this.yPoints.map(p => p.y);

    this.minX = MathUtil.safeMin(this.xValues);
    this.maxX = MathUtil.safeMax(this.xValues);
    this.minY = MathUtil.safeMin(this.yValues);
    this.maxY = MathUtil.safeMax(this.yValues);

    [this.highlightXValues, this.highlightYValues] = this.mapToSvgElements(layer.selectors as string);
  }

  public dispose(): void {
    this.xPoints.length = 0;
    this.yPoints.length = 0;

    this.xValues.length = 0;
    this.yValues.length = 0;

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

  protected get values(): number[][] {
    return this.mode === NavMode.COL ? [this.xValues] : [this.yValues];
  }

  protected get highlightValues(): SVGElement[][] | null {
    return this.mode === NavMode.COL ? this.highlightXValues : this.highlightYValues;
  }

  protected getAudioGroupIndex(): { groupIndex?: number } {
    // Rationale for returning empty object instead of groupIndex:
    // 
    // Scatterplots fundamentally differ from other plot types in their grouping semantics:
    // - Bar/Line plots: groupIndex represents different series/categories with distinct audio tones
    // - Heatmaps: groupIndex can represent different data dimensions
    // - Scatterplots: Each point represents an individual observation, not a group
    //
    // Using groupIndex for scatterplots would cause different audio tones for what should be
    // conceptually similar data points, potentially confusing users who expect consistent
    // audio feedback when exploring point-by-point data.
    //
    // Future enhancement: When scatterplots support explicit multi-series data (e.g., different
    // colors/shapes for distinct categories), this method should be updated to return the
    // appropriate groupIndex for true categorical distinctions.
    return {};
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
        // Only use groupIndex if there are multiple x-points (actual groups)
        ...this.getAudioGroupIndex(),
      };
    } else {
      const current = this.yPoints[this.row];
      return {
        min: this.minX,
        max: this.maxX,
        size: current.x.length,
        index: this.row,
        value: current.x,
        // Only use groupIndex if there are multiple y-points (actual groups)
        ...this.getAudioGroupIndex(),
      };
    }
  }

  protected braille(): BrailleState {
    return {
      empty: true,
      type: 'trace',
      traceType: this.type,
    };
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

  public get autoplay(): AutoplayState {
    return {
      UPWARD: this.yValues.length,
      DOWNWARD: this.yValues.length,
      FORWARD: this.xValues.length,
      BACKWARD: this.xValues.length,
    };
  }

  protected highlight(): HighlightState {
    if (this.highlightValues === null) {
      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
      };
    }

    const elements = this.mode === NavMode.COL
      ? this.col < this.highlightValues.length ? this.highlightValues![this.col] : null
      : this.row < this.highlightValues.length ? this.highlightValues![this.row] : null;
    if (!elements) {
      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
      };
    }

    return {
      empty: false,
      elements,
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

  public isMovable(target: [number, number] | MovableDirection): boolean {
    if (Array.isArray(target)) {
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
