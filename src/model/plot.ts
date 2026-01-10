import type { Disposable } from '@type/disposable';
import type { ExtremaTarget } from '@type/extrema';
import type { Maidr, MaidrSubplot } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { Observable } from '@type/observable';
import type { FigureState, HighlightState, SubplotState, TraceState } from '@type/state';
import type { Dimension } from './abstract';
import { TraceType } from '@type/grammar';
import { Constant } from '@util/constant';
import { Svg } from '@util/svg';
import { AbstractPlot } from './abstract';
import { TraceFactory } from './factory';
import { MovableGrid } from './movable';

const DEFAULT_FIGURE_TITLE = 'MAIDR Plot';
const DEFAULT_SUBTITLE = 'unavailable';
const DEFAULT_CAPTION = 'unavailable';

/**
 * Represents a figure containing one or more subplots
 */
export class Figure extends AbstractPlot<FigureState> implements Movable, Observable<FigureState>, Disposable {
  protected get dimension(): Dimension {
    return {
      rows: this.subplots.length,
      cols: this.subplots[this.row].length,
    };
  }

  public readonly id: string;
  protected readonly movable: Movable;

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

    this.movable = new MovableGrid<Subplot>(this.subplots, { row: this.subplots.length - 1 });
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
      highlight: this.highlight,
    };
  }

  protected get highlight(): HighlightState {
    const totalSubplots = document.querySelectorAll('g[id^="axes_"]').length;

    if (totalSubplots <= 1) {
      return {
        empty: true,
        type: 'trace',
        audio: {
          y: this.row,
          x: this.col,
          rows: this.subplots.length,
          cols: this.subplots[this.row].length,
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
          y: this.row,
          x: this.col,
          rows: this.subplots.length,
          cols: this.subplots[this.row].length,
        },
      };
    }

    return {
      empty: true,
      type: 'trace',
      audio: {
        y: this.row,
        x: this.col,
        rows: this.subplots.length,
        cols: this.subplots[this.row].length,
      },
    };
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

  protected get outOfBoundsState(): FigureState {
    return {
      empty: true,
      type: 'figure',
    };
  }
}

export class Subplot extends AbstractPlot<SubplotState> implements Movable, Observable<SubplotState>, Disposable {
  protected get dimension(): Dimension {
    return {
      rows: this.values.length,
      cols: this.values[this.row].length,
    };
  }

  protected readonly movable: Movable;

  public readonly traces: Trace[][];
  public readonly traceTypes: string[];

  private readonly size: number;
  private readonly highlightValue: SVGElement | null;
  private readonly isViolinPlot: boolean;

  /**
   * Creates a new Subplot instance from MAIDR subplot data
   * @param subplot - The MAIDR subplot data containing layers
   */
  public constructor(subplot: MaidrSubplot) {
    super();

    const layers = subplot.layers;
    this.size = layers.length;

    // Structural detection for violin plots is done once at subplot level:
    // BOX + SMOOTH in the same subplot => violin plot.
    const layerTypes = layers.map(layer => layer.type);
    const hasBox = layerTypes.includes(TraceType.BOX);
    const hasSmooth = layerTypes.includes(TraceType.SMOOTH);
    const isViolinPlot = hasBox && hasSmooth;
    this.isViolinPlot = isViolinPlot;

    // Pass only a minimal hint into the factory; do not leak full layers array.
    this.traces = layers.map(layer => [
      TraceFactory.create(layer, { isViolinPlot }),
    ]);
    this.traceTypes = this.traces.flat().map((trace) => {
      const state = trace.state;
      return state.empty ? Constant.EMPTY : state.traceType;
    });

    this.highlightValue = this.mapToSvgElement(subplot.selector);
    this.movable = new MovableGrid<Trace>(this.traces);
  }

  public dispose(): void {
    this.traces.forEach(row => row.forEach(trace => trace.dispose()));
    this.traces.length = 0;
    super.dispose();
  }

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
   * Override moveOnce to avoid "initial entry" no-op behavior for layer navigation.
   *
   * For violin subplots, the MovableGrid is only used to step between layers
   * (traces), not between data points. We don't want the first MOVE_UP/DOWN
   * to be eaten by handleInitialEntry; instead, the first PageUp/PageDown
   * should actually switch layers.
   *
   * For non-violin plots, we delegate directly to the base implementation to
   * preserve existing behavior.
   */
  public override moveOnce(direction: MovableDirection): boolean {
    // Only customize behavior for violin subplots
    if (!this.isViolinPlot) {
      return super.moveOnce(direction);
    }

    // For violin subplots, clear initial-entry state on first move so the
    // first PageUp/PageDown actually switches layers.
    if (this.isInitialEntry) {
      this.isInitialEntry = false;
    }
    return super.moveOnce(direction);
  }

  public get state(): SubplotState {
    return {
      empty: false,
      type: 'subplot',
      size: this.size,
      index: this.row + 1,
      trace: this.activeTrace.state,
      highlight: this.highlight,
    };
  }

  protected get outOfBoundsState(): SubplotState {
    return {
      empty: true,
      type: 'subplot',
    };
  }

  private get highlight(): HighlightState {
    if (this.highlightValue === null) {
      return {
        empty: true,
        type: 'trace',
        audio: {
          y: this.row,
          x: this.col,
          rows: this.values.length,
          cols: this.values[this.row].length,
        },
      };
    }

    return {
      empty: false,
      elements: this.highlightValue,
    };
  }

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

  private mapToSvgElement(selector?: string): SVGElement | null {
    return selector ? Svg.selectElement(selector) ?? null : null;
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
   * Get the current Y value from the trace.
   * Optional method implemented by traces that support Y value preservation during layer switching.
   * @returns The current Y value or null if not available
   */
  getCurrentYValue?: () => number | null;

  /**
   * Move to a specific X value and find the closest position with the given Y value.
   * Optional method implemented by traces that support preserving both X and Y values during layer switching.
   * @param xValue The X value to move to
   * @param yValue The Y value to find the closest matching position for
   * @returns true if the move was successful, false otherwise
   */
  moveToXAndYValue?: (xValue: any, yValue: number) => boolean;

  /**
   * Notify observers that the trace is out of bounds
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

  /**
   * Get all highlight SVG elements for this trace
   * Used by HighlightService for high contrast mode
   * @returns Array of all SVG elements, or empty array if none
   */
  getAllHighlightElements: () => SVGElement[];
  getAllOriginalElements: () => SVGElement[];

  /**
   * Handle switching from another trace.
   * Called by Context when switching layers. Traces can implement this
   * to handle special layer switching behavior (e.g., preserving Y values).
   *
   * IMPORTANT CONTRACT:
   * - If this method returns true, it MUST have modified the trace position appropriately.
   * - If this method returns false, it MUST NOT modify the trace position at all.
   *   The Context will then apply default behavior (moveToXValue) after this returns.
   *
   * @param previousTrace - The trace we're switching from
   * @returns true if this trace handled the switch (and modified position),
   *          false to use default behavior (position must remain unchanged)
   */
  onSwitchFrom?: (previousTrace: Trace) => boolean;

  /**
   * Moves the trace to a specific point based on x and y coordinates.
   * @param x - The x coordinate
   * @param y - The y coordinate
   */
  moveToPoint: (x: number, y: number) => void;

  /**
   * Gets extrema targets for navigation.
   * Optional method implemented by traces that support extrema navigation.
   * @returns Array of extrema targets
   */
  getExtremaTargets?: () => ExtremaTarget[];

  /**
   * Navigate to a specific extrema target.
   * Optional method implemented by traces that support extrema navigation.
   * @param target - The extrema target to navigate to
   */
  navigateToExtrema?: (target: ExtremaTarget) => void;
}
