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
    // Always return a 2D array with both X and Y values
    // This ensures this.values[this.row] always exists
    // The navigation logic in moveOnce and isMovable handles the mode-specific behavior
    const result = [this.xValues, this.yValues];

    // Safety check: ensure row is within bounds for the current mode
    if (this.mode === NavMode.COL) {
      // In COL mode, row should be 0 since we navigate through xValues
      if (this.row !== 0) {
        this.row = 0;
      }
    } else {
      // In ROW mode, row should be within yPoints bounds
      if (this.row < 0 || this.row >= this.yPoints.length) {
        this.row = 0;
      }
    }

    return result;
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
      audio: {
        index: 0,
        size: 0,
        groupIndex: 0,
      },
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
        audio: {
          index: 0,
          size: 0,
          groupIndex: 0,
        },
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
        audio: {
          index: 0,
          size: 0,
          groupIndex: 0,
        },
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

  protected handleInitialEntry(): void {
    this.isInitialEntry = false;
    // For scatter plots, start in COL mode with row=0, col=0
    this.row = 0;
    this.col = 0;
    this.mode = NavMode.COL;
  }

  /**
   * Toggles between COL and ROW navigation modes while maintaining logical position mapping
   */
  private toggleNavigation(): void {
    if (this.mode === NavMode.COL) {
      // Switch from COL to ROW mode
      const currentXPoint = this.xPoints[this.col];
      const middleYValue = currentXPoint.y[Math.floor(currentXPoint.y.length / 2)];
      const targetRow = this.yValues.indexOf(middleYValue);

      // Safety check: ensure the calculated row is valid
      if (targetRow === -1 || targetRow >= this.yPoints.length) {
        this.row = 0; // Use 0 as fallback
      } else {
        this.row = targetRow; // Use the calculated row to maintain logical connection
      }

      this.mode = NavMode.ROW;
    } else {
      // Switch from ROW to COL mode
      const currentYPoint = this.yPoints[this.row];
      const middleXValue = currentYPoint.x[Math.floor(currentYPoint.x.length / 2)];
      const targetCol = this.xValues.indexOf(middleXValue);

      // Safety check: ensure the calculated col is valid
      if (targetCol === -1 || targetCol >= this.xPoints.length) {
        this.col = 0;
      } else {
        this.col = targetCol;
      }

      this.mode = NavMode.COL;
      this.row = 0; // Set to 0 for COL mode since values[0] = xValues
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
          this.row = this.yPoints.length - 1; // Go to last Y coordinate
          break;
        case 'DOWNWARD':
          this.toggleNavigation();
          this.row = 0; // Go to first Y coordinate
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
          this.row = this.yPoints.length - 1; // Go to last Y coordinate
          break;
        case 'DOWNWARD':
          this.row = 0; // Go to first Y coordinate
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
        case 'FORWARD': {
          const forwardResult = this.col < this.xPoints.length - 1;
          return forwardResult;
        }
        case 'BACKWARD': {
          const backwardResult = this.col > 0;
          return backwardResult;
        }
        case 'UPWARD':
        case 'DOWNWARD':
          return true;
      }
    } else {
      switch (target) {
        case 'UPWARD': {
          const upwardResult = this.row < this.yPoints.length - 1;
          return upwardResult;
        }
        case 'DOWNWARD': {
          const downwardResult = this.row > 0;
          return downwardResult;
        }
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
