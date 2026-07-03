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
    // On ragged grids a row change can leave col past the new row's end;
    // clamp it the same way handleInitialEntry does.
    this.col = Math.max(0, Math.min(this.col, this.elements[this.row].length - 1));
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
    // On ragged grids a row change can leave col past the new row's end;
    // clamp it the same way handleInitialEntry does.
    this.col = Math.max(0, Math.min(this.col, this.elements[this.row].length - 1));
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
        && col >= 0 && col < this.elements[row].length;
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

  public handleInitialEntry(): void {
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

  public handleInitialEntry(): void {
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

/**
 * Minimal row/col cursor store for {@link ScatterTrace}.
 *
 * ScatterTrace overrides every public {@link Movable} entry point — moveOnce,
 * moveToExtreme, moveToIndex, isMovable — and drives navigation itself, using
 * this class purely as a position store (row / col / isInitialEntry) exposed
 * through the AbstractPlot accessors. The navigation methods below are required
 * by the Movable interface but are never invoked for scatter; they are inert
 * stubs so that the previously duplicated (and already-diverged) plane
 * navigation logic cannot be "fixed" here with no effect on runtime behavior.
 */
export class MovablePlane extends AbstractMovable implements Disposable {
  /**
   * @param _xPoints - Scatter points grouped by X. Unused; retained so the
   *   existing ScatterTrace call signature stays unchanged.
   * @param _yPoints - Scatter points grouped by Y. Unused.
   */
  public constructor(
    _xPoints: { x: number; y: number[] }[],
    _yPoints: { x: number[]; y: number }[],
  ) {
    super();
  }

  public dispose(): void {
    // No owned resources; ScatterTrace holds the underlying point data.
  }

  public moveOnce(_direction: MovableDirection): boolean {
    return false;
  }

  public moveToExtreme(_direction: MovableDirection): boolean {
    return false;
  }

  public isMovable(_target: [number, number] | MovableDirection): boolean {
    return false;
  }
}
