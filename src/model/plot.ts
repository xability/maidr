import type { Disposable } from '@type/disposable';
import type { Maidr, MaidrSubplot } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { Observable } from '@type/observable';
import type {
  FigureState,
  HighlightState,
  SubplotState,
  TraceState,
} from '@type/state';
import { Constant } from '@util/constant';
import { AbstractObservableElement } from './abstract';
import { TraceFactory } from './factory';

const DEFAULT_FIGURE_TITLE = 'MAIDR Plot';
const DEFAULT_SUBTITLE = 'unavailable';
const DEFAULT_CAPTION = 'unavailable';

/**
 * Represents a figure containing one or more subplots
 */
export class Figure extends AbstractObservableElement<Subplot, FigureState> {
  public readonly id: string;

  private readonly title: string;
  private readonly subtitle: string;
  private readonly caption: string;

  public readonly subplots: Subplot[][];
  private readonly size: number;

  /**
   * Creates a new Figure instance from MAIDR data
   * @param maidr - The MAIDR data containing figure information and subplots
   */
  public constructor(maidr: Maidr) {
    super();

    this.id = maidr.id;

    this.title = maidr.title ?? DEFAULT_FIGURE_TITLE;
    this.subtitle = maidr.subtitle ?? DEFAULT_SUBTITLE;
    this.caption = maidr.caption ?? DEFAULT_CAPTION;

    const subplots = maidr.subplots as MaidrSubplot[][];
    this.subplots = subplots.map(row =>
      row.map(subplot => new Subplot(subplot)),
    );
    this.size = this.subplots.reduce((sum, row) => sum + row.length, 0);
  }

  /**
   * Cleans up all subplots and releases resources
   */
  public dispose(): void {
    this.subplots.forEach(row => row.forEach(subplot => subplot.dispose()));
    this.subplots.length = 0;
    super.dispose();
  }

  /**
   * Gets the 2D array of subplots
   * @returns The subplots array
   */
  protected get values(): Subplot[][] {
    return this.subplots;
  }

  /**
   * Gets the currently active subplot based on row and column position
   * @returns The active subplot
   */
  public get activeSubplot(): Subplot {
    return this.subplots[this.row][this.col];
  }

  /**
   * Gets the current state of the figure including active subplot
   * @returns The complete figure state
   */
  public get state(): FigureState {
    if (this.isOutOfBounds) {
      return {
        empty: true,
        type: 'figure',
      };
    }

    const currentIndex
      = this.col
        + 1
        + this.subplots.slice(0, this.row).reduce((sum, r) => sum + r.length, 0);

    const activeSubplot = this.activeSubplot;

    return {
      empty: false,
      type: 'figure',
      title: this.title,
      subtitle: this.subtitle,
      caption: this.caption,
      size: this.size,
      index: currentIndex,
      subplot: activeSubplot.getStateWithFigurePosition(this.row, this.col),
      traceTypes: activeSubplot.traceTypes,
      highlight: this.highlight(),
    };
  }

  /**
   * Generates highlight state for the current subplot element
   * @returns The highlight state with SVG element information
   */
  protected highlight(): HighlightState {
    const totalSubplots = document.querySelectorAll('g[id^="axes_"]').length;

    if (totalSubplots <= 1) {
      return {
        empty: true,
        type: 'trace',
        audio: {
          size: this.values[this.row].length,
          index: this.col,
        },
      };
    }

    try {
      const numCols = this.subplots[0]?.length || 1;
      const subplotIndex = this.row * numCols + this.col + 1;
      const subplotSelector = `g[id="axes_${subplotIndex}"]`;
      const subplotElement = document.querySelector(
        subplotSelector,
      ) as SVGElement;

      if (subplotElement) {
        return {
          empty: false,
          elements: subplotElement,
        };
      }

      const allSubplots = document.querySelectorAll('g[id^="axes_"]');
      if (allSubplots.length > 0 && subplotIndex - 1 < allSubplots.length) {
        return {
          empty: false,
          elements: allSubplots[subplotIndex - 1] as SVGElement,
        };
      }
    } catch (error) {
      return {
        empty: true,
        type: 'trace',
        audio: {
          size: this.values[this.row].length,
          index: this.col,
        },
      };
    }

    return {
      empty: true,
      type: 'trace',
      audio: {
        size: this.values[this.row].length,
        index: this.col,
      },
    };
  }

  /**
   * Checks if movement in the specified direction is possible
   * @param direction - The direction to check for movement
   * @returns True if movement is possible, false otherwise
   */
  public isMovable(direction: MovableDirection): boolean {
    switch (direction) {
      case 'UPWARD':
        return this.row < this.subplots.length - 1;
      case 'DOWNWARD':
        return this.row > 0;
      case 'FORWARD':
        return this.col < this.subplots[this.row].length - 1;
      case 'BACKWARD':
        return this.col > 0;
      default:
        return false;
    }
  }

  /**
   * Moves the current position one step in the specified direction
   * @param direction - The direction to move (UPWARD, DOWNWARD, FORWARD, BACKWARD)
   */
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
    this.notifyStateUpdate();
  }

  /**
   * Moves to a specific point in the figure (implementation in subclasses)
   * @param _x - The x coordinate
   * @param _y - The y coordinate
   */
  public moveToPoint(_x: number, _y: number): void {
    // implement in plot classes
    this.notifyStateUpdate();
  }
}

/**
 * Represents a subplot containing one or more traces
 */
export class Subplot extends AbstractObservableElement<Trace, SubplotState> {
  public readonly traces: Trace[][];
  public readonly traceTypes: string[];
  private readonly size: number;

  /**
   * Creates a new Subplot instance from MAIDR subplot data
   * @param subplot - The MAIDR subplot data containing layers
   */
  public constructor(subplot: MaidrSubplot) {
    super();

    this.isInitialEntry = false;

    const layers = subplot.layers;
    this.size = layers.length;
    this.traces = layers.map(layer => [TraceFactory.create(layer)]);
    this.traceTypes = this.traces.flat().map((trace) => {
      const state = trace.state;
      return state.empty ? Constant.EMPTY : state.traceType;
    });
  }

  /**
   * Gets the current row index
   * @returns The row index
   */
  public getRow(): number {
    return this.row;
  }

  /**
   * Gets the number of traces in the subplot
   * @returns The size (number of traces)
   */
  public getSize(): number {
    return this.size;
  }

  /**
   * Cleans up all traces and releases resources
   */
  public dispose(): void {
    this.traces.forEach(row => row.forEach(trace => trace.dispose()));
    this.traces.length = 0;
    super.dispose();
  }

  /**
   * Gets the 2D array of traces
   * @returns The traces array
   */
  protected get values(): Trace[][] {
    return this.traces;
  }

  /**
   * Gets the currently active trace based on row and column position
   * @returns The active trace
   */
  public get activeTrace(): Trace {
    return this.traces[this.row][this.col];
  }

  /**
   * Generates highlight state for the current trace
   * @returns The highlight state with audio information
   */
  protected highlight(): HighlightState {
    return {
      empty: true,
      type: 'trace',
      audio: {
        size: this.values[this.row].length,
        index: this.col,
      },
    };
  }

  /**
   * Moves the current position one step in the specified direction
   * @param direction - The direction to move (UPWARD, DOWNWARD, FORWARD, BACKWARD)
   */
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
    this.notifyStateUpdate();
  }

  /**
   * Gets the current state of the subplot including active trace
   * @returns The complete subplot state
   */
  public get state(): SubplotState {
    if (this.isOutOfBounds) {
      return {
        empty: true,
        type: 'subplot',
      };
    }

    return {
      empty: false,
      type: 'subplot',
      size: this.size,
      index: this.row + 1,
      trace: this.activeTrace.state,
      highlight: this.highlight(),
    };
  }

  /**
   * Moves to a specific point in the subplot (implementation in subclasses)
   * @param _x - The x coordinate
   * @param _y - The y coordinate
   */
  public moveToPoint(_x: number, _y: number): void {
    // implement in plot classes
    this.notifyStateUpdate();
  }

  /**
   * Gets the subplot state with figure position context
   * @param _figureRow - The row position in the figure
   * @param _figureCol - The column position in the figure
   * @returns The subplot state
   */
  public getStateWithFigurePosition(
    _figureRow: number,
    _figureCol: number,
  ): SubplotState {
    return this.state;
  }
}

/**
 * Interface representing a trace with navigation and observation capabilities
 */
export interface Trace extends Movable, Observable<TraceState>, Disposable {
  /**
   * Gets the unique identifier for the trace
   * @returns The trace ID
   */
  getId: () => string;

  /**
   * Gets the current X value from the trace
   * @returns The current X value or null if not available
   */
  getCurrentXValue: () => any;

  /**
   * Moves the trace to the position that matches the given X value
   * @param xValue - The X value to move to
   * @returns True if the position was found and set, false otherwise
   */
  moveToXValue: (xValue: any) => boolean;

  /**
   * Notifies observers that the trace is out of bounds
   */
  notifyOutOfBounds: () => void;

  /**
   * Resets the trace to initial entry state
   */
  resetToInitialEntry: () => void;

  /**
   * Notifies all observers with a specific state
   * @param state - The trace state to send to observers
   */
  notifyObserversWithState: (state: TraceState) => void;
}
