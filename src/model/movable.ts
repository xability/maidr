import type { Disposable } from '@type/disposable';
import type { Coordinate, Movable, MovableDirection, Node } from '@type/movable';

interface MovableOptions {
  isInitialEntry?: boolean;
  row?: number;
  col?: number;
}

abstract class AbstractMovable implements Movable {
  public isInitialEntry: boolean;

  public row: number;
  public col: number;

  protected constructor(options?: MovableOptions) {
    this.isInitialEntry = options?.isInitialEntry ?? true;
    this.row = options?.row ?? 0;
    this.col = options?.col ?? 0;
  }

  public moveToIndex(row: number, col: number): boolean {
    if (!this.isMovable([row, col])) {
      return false;
    }

    this.row = row;
    this.col = col;
    this.isInitialEntry = false;
    return true;
  }

  public abstract moveOnce(direction: MovableDirection): boolean;

  public abstract moveToExtreme(direction: MovableDirection): boolean;

  public abstract isMovable(target: [number, number] | MovableDirection): boolean;
}

export class MovableGrid<Element> extends AbstractMovable {
  private readonly elements: Element[][];

  public constructor(elements: Element[][], options?: MovableOptions) {
    super(options);
    this.elements = elements;
  }

  public moveOnce(direction: MovableDirection): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      return true;
    }

    if (!this.isMovable(direction)) {
      return false;
    }

    switch (direction) {
      case 'UPWARD':
        this.row += 1;
        break;
      case 'DOWNWARD':
        this.row -= 1;
        break;
      case 'FORWARD':
        this.col += 1;
        break;
      case 'BACKWARD':
        this.col -= 1;
        break;
    }
    return true;
  }

  public moveToExtreme(direction: MovableDirection): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    switch (direction) {
      case 'UPWARD':
        this.row = this.elements.length - 1;
        break;

      case 'DOWNWARD':
        this.row = 0;
        break;

      case 'FORWARD':
        this.col = this.elements[this.row].length - 1;
        break;

      case 'BACKWARD':
        this.col = 0;
        break;
    }
    return true;
  }

  public moveToIndex(row: number, col: number): boolean {
    if (!this.isMovable([row, col])) {
      return false;
    }

    this.row = row;
    this.col = col;
    this.isInitialEntry = false;
    return true;
  }

  public isMovable(target: [number, number] | MovableDirection): boolean {
    if (Array.isArray(target)) {
      const [row, col] = target;
      return row >= 0 && row < this.elements.length
        && col >= 0 && col < this.elements[this.row].length;
    }

    switch (target) {
      case 'UPWARD':
        return this.row < this.elements.length - 1;
      case 'DOWNWARD':
        return this.row > 0;
      case 'FORWARD':
        return this.col < this.elements[this.row].length - 1;
      case 'BACKWARD':
        return this.col > 0;
    }
  }

  private handleInitialEntry(): void {
    this.isInitialEntry = false;
    this.row = Math.max(0, Math.min(this.row, this.elements.length - 1));
    this.col = Math.max(0, Math.min(this.col, this.elements[this.row].length - 1));
  }
}

export class MovableGraph extends AbstractMovable {
  private readonly graph: (Node | null)[][];

  public constructor(graph: (Node | null)[][], options?: MovableOptions) {
    super(options);
    this.graph = graph;
  }

  public moveOnce(direction: MovableDirection): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      return true;
    }

    const node = this.graph[this.row]?.[this.col];
    if (!node) {
      return false;
    }

    let nextNode: Coordinate | null = null;
    switch (direction) {
      case 'UPWARD':
        nextNode = node.up;
        break;

      case 'DOWNWARD':
        nextNode = node.down;
        break;

      case 'FORWARD':
        nextNode = node.right;
        break;

      case 'BACKWARD':
        nextNode = node.left;
        break;
    }
    if (!nextNode) {
      return false;
    }

    this.row = nextNode.row;
    this.col = nextNode.col;
    return true;
  }

  public moveToExtreme(direction: MovableDirection): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    const node = this.graph[this.row]?.[this.col];
    if (!node) {
      return false;
    }

    let extremeNode: Coordinate | null = null;
    switch (direction) {
      case 'UPWARD':
        extremeNode = node.top;
        break;

      case 'DOWNWARD':
        extremeNode = node.bottom;
        break;

      case 'FORWARD':
        extremeNode = node.end;
        break;

      case 'BACKWARD':
        extremeNode = node.start;
        break;
    }
    if (!extremeNode) {
      return false;
    }

    this.row = extremeNode.row;
    this.col = extremeNode.col;
    return true;
  }

  public isMovable(target: [number, number] | MovableDirection): boolean {
    if (Array.isArray(target)) {
      const [r, c] = target;
      return this.graph[r]?.[c] !== null && this.graph[r]?.[c] !== undefined;
    }

    const node = this.graph[this.row]?.[this.col];
    if (!node) {
      return false;
    }

    switch (target) {
      case 'UPWARD':
        return node.up !== null;
      case 'DOWNWARD':
        return node.down !== null;
      case 'FORWARD':
        return node.right !== null;
      case 'BACKWARD':
        return node.left !== null;
    }
  }

  private handleInitialEntry(): void {
    this.isInitialEntry = false;

    if (this.isMovable([0, 0])) {
      this.row = 0;
      this.col = 0;
    } else {
      this.row = -1;
      this.col = -1;
    }
  }
}

export class MovablePlane extends AbstractMovable implements Disposable {
  public mode: 'row' | 'col';

  private readonly xPoints: { x: number; y: number[] }[];
  private readonly yPoints: { x: number[]; y: number }[];

  private readonly xValues: number[];
  private readonly yValues: number[];

  public constructor(xPoints: { x: number; y: number[] }[], yPoints: { x: number[]; y: number }[]) {
    super();

    this.mode = 'col';

    this.xPoints = xPoints;
    this.yPoints = yPoints;

    this.xValues = xPoints.map(point => point.x);
    this.yValues = yPoints.map(point => point.y);
  }

  public dispose(): void {
    this.xValues.length = 0;
    this.yValues.length = 0;
  }

  public moveOnce(direction: MovableDirection): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      return true;
    }

    if (!this.isMovable(direction)) {
      return false;
    }

    if (this.mode === 'col') {
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
    return true;
  }

  public moveToExtreme(direction: MovableDirection): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    if (this.mode === 'col') {
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
    return true;
  }

  public isMovable(target: [number, number] | MovableDirection): boolean {
    if (Array.isArray(target)) {
      return false;
    }

    if (this.mode === 'col') {
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

  private toggleNavigation(): void {
    if (this.mode === 'col') {
      const currentX = this.xPoints[this.col];
      const midY = currentX.y[Math.floor(currentX.y.length / 2)];
      this.row = this.yValues.indexOf(midY);
      this.mode = 'row';
    } else {
      const currentY = this.yPoints[this.row];
      const midX = currentY.x[Math.floor(currentY.x.length / 2)];
      this.col = this.xValues.indexOf(midX);
      this.mode = 'col';
    }
  }

  private handleInitialEntry(): void {
    this.isInitialEntry = false;

    if (this.mode === 'col') {
      this.col = Math.max(0, Math.min(this.col, this.xPoints.length - 1));
      this.row = Math.max(0, Math.min(this.row, this.xPoints[this.col].y.length - 1));
    } else {
      this.row = Math.max(0, Math.min(this.row, this.yPoints.length - 1));
      this.col = Math.max(0, Math.min(this.col, this.yPoints[this.row].x.length - 1));
    }
  }
}
