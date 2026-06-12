import type { Disposable } from '@type/disposable';
import type { MovableDirection } from '@type/movable';
import type { PlotState, SubplotSummary } from '@type/state';
import type { Figure, Subplot, Trace } from './plot';
import { NavigationService } from '@service/navigation';
import { Scope } from '@type/event';
import { Orientation } from '@type/grammar';
import { isGridNavigable } from '@type/navigation';
import { Constant } from '@util/constant';
import { Stack } from '@util/stack';
import hotkeys from 'hotkeys-js';

/**
 * Build a human-readable plot type string with optional orientation prefix.
 * Returns just the type when orientation is absent/empty (no extra whitespace).
 */
function formatPlotType(plotType: string, orientation?: Orientation | string): string {
  if (!orientation) {
    return plotType;
  }
  if (orientation === Orientation.HORIZONTAL || orientation === 'horz') {
    return `horizontal ${plotType}`;
  }
  if (orientation === Orientation.VERTICAL || orientation === 'vert') {
    return `vertical ${plotType}`;
  }
  return plotType;
}

type Plot = Figure | Subplot | Trace;

/**
 * Snapshot of the navigation state captured before a live data update,
 * used to restore the user's position on the rebuilt model.
 */
interface NavigationSnapshot {
  depth: number;
  figureRow: number;
  figureCol: number;
  figureEntry: boolean;
  subplotRow: number;
  subplotCol: number;
  subplotEntry: boolean;
  traceRow: number;
  traceCol: number;
  traceEntry: boolean;
  /** Per-row subplot counts plus the active subplot's layer count. */
  shape: string;
}

/**
 * Options for {@link Context.replaceFigure}.
 */
export interface ReplaceFigureOptions {
  /**
   * Number of columns the active trace's data shifted left due to a
   * sliding-window trim, so the cursor can stay on the same data point.
   */
  activeColShift?: number;
}

export class Context implements Disposable {
  public readonly id: string;
  public readonly selectorList: string[] = [];

  private readonly plotContext: Stack<Plot>;
  private readonly scopeContext: Stack<Scope>;
  private readonly navigationService: NavigationService;
  // Mutable: replaced in place on live data updates (see replaceFigure).
  private figure: Figure;
  private _instructionContext: Plot;
  private isRotorActive: boolean;

  public constructor(figure: Figure) {
    this.figure = figure;
    this.id = figure.id;

    this.plotContext = new Stack<Plot>();
    this.scopeContext = new Stack<Scope>();
    this.navigationService = new NavigationService();

    this.isRotorActive = false;

    this._instructionContext = this.initializePlotContext(figure);
  }

  /**
   * The plot element whose state drives the initial instruction text.
   */
  public get instructionContext(): Plot {
    return this._instructionContext;
  }

  /**
   * Builds the plot context stack for a fresh figure, pushing the initial
   * scope, and returns the element to use as the instruction context.
   *
   * @param figure - The figure to initialize the stack from
   * @returns The instruction context element
   */
  /**
   * Whether navigation for this figure starts at figure level (multiple
   * subplots) rather than subplot/trace level. Single source of truth for
   * the level discrimination used at construction, instruction resolution,
   * and depth-1 stack restoration.
   */
  private isFigureLevel(figure: Figure): boolean {
    const figureState = figure.state;
    return figureState.empty || figureState.size !== 1;
  }

  private initializePlotContext(figure: Figure): Plot {
    // Set the context to figure level.
    if (this.isFigureLevel(figure)) {
      this.plotContext.push(figure);
      this.scopeContext.push(Scope.SUBPLOT);
      return figure;
    }

    // Set the context to subplot level.
    this.scopeContext.push(Scope.TRACE);
    const subplotState = figure.activeSubplot.state;
    if (subplotState.empty || subplotState.size !== 1) {
      this.plotContext.push(figure.activeSubplot);
      this.plotContext.push(figure.activeSubplot.activeTrace);
      return figure.activeSubplot;
    }

    // Set the context to trace level (single-layer plot)
    this.plotContext.push(figure.activeSubplot.activeTrace);
    return figure.activeSubplot.activeTrace;
  }

  /**
   * Replaces the underlying figure with a rebuilt model (live data update),
   * preserving the user's navigation position when the figure shape allows.
   *
   * The old figure is disposed *before* `createFigure` runs so that stale
   * highlight clones are removed from the DOM before the new model queries
   * its SVG selectors.
   *
   * Positions are restored silently (no observer notifications) so a data
   * update never announces or sonifies by itself; monitor mode handles
   * user-facing feedback separately.
   *
   * @param createFigure - Factory that builds the replacement figure
   * @param options - Optional position adjustments (e.g. sliding-window shift)
   * @returns The newly created figure
   */
  public replaceFigure(
    createFigure: () => Figure,
    options: ReplaceFigureOptions = {},
  ): Figure {
    const snapshot = this.captureNavigationSnapshot();
    this.figure.dispose();

    const figure = createFigure();
    this.figure = figure;
    this.plotContext.clear();

    if (snapshot !== null && snapshot.shape === this.describeShape(figure)) {
      // Same shape: restore positions and stack depth. The keyboard scope is
      // intentionally left untouched so active modes (e.g. braille) survive
      // the update.
      this.restoreNavigation(figure, snapshot, options);
      this._instructionContext = this.resolveInstructionContext(figure);
    } else {
      // Shape changed (or old model was unreadable): rebuild from scratch,
      // exactly like construction, and realign the keyboard scope.
      this.scopeContext.clear();
      this._instructionContext = this.initializePlotContext(figure);
      hotkeys.setScope(this.scope);
    }

    return figure;
  }

  /**
   * Captures the current navigation positions from the active figure.
   *
   * @returns The snapshot, or null when the old model cannot be read
   */
  private captureNavigationSnapshot(): NavigationSnapshot | null {
    try {
      const figure = this.figure;
      const subplot = figure.activeSubplot;
      const trace = subplot.activeTrace;
      return {
        depth: this.plotContext.size(),
        figureRow: figure.row,
        figureCol: figure.col,
        figureEntry: figure.isInitialEntry,
        subplotRow: subplot.row,
        subplotCol: subplot.col,
        subplotEntry: subplot.isInitialEntry,
        traceRow: trace.row,
        traceCol: trace.col,
        traceEntry: trace.isInitialEntry,
        shape: this.describeShape(figure),
      };
    } catch {
      return null;
    }
  }

  /**
   * Describes the structural shape of a figure (subplot grid and layer
   * counts) for compatibility checks between old and new models.
   *
   * @param figure - The figure to describe
   * @returns A comparable shape signature
   */
  private describeShape(figure: Figure): string {
    // Include trace types so a same-count replacement with different layer
    // types (e.g. bar -> line) resets navigation instead of restoring a
    // position onto an incompatible data structure.
    //
    // Group/series counts within a layer are deliberately NOT included:
    // appendData can add a new series (groupIndex === count), and that must
    // preserve the user's position. Restored indices are clamped into the
    // new bounds, so a differing series count can never land out of range.
    return figure.subplots
      .map(row => row.map(subplot => subplot.traceTypes.join('+')).join(','))
      .join(';');
  }

  /**
   * Restores navigation positions onto the new figure and rebuilds the plot
   * context stack at the same depth the user was at.
   */
  private restoreNavigation(
    figure: Figure,
    snapshot: NavigationSnapshot,
    options: ReplaceFigureOptions,
  ): void {
    const clamp = (value: number, max: number): number =>
      Math.max(0, Math.min(value, max));

    figure.isInitialEntry = snapshot.figureEntry;
    figure.row = clamp(snapshot.figureRow, figure.subplots.length - 1);
    figure.col = clamp(snapshot.figureCol, figure.subplots[figure.row].length - 1);

    const subplot = figure.activeSubplot;
    subplot.isInitialEntry = snapshot.subplotEntry;
    subplot.row = clamp(snapshot.subplotRow, subplot.traces.length - 1);
    subplot.col = clamp(snapshot.subplotCol, subplot.traces[subplot.row].length - 1);

    const trace = subplot.activeTrace;
    if (!snapshot.traceEntry) {
      trace.isInitialEntry = false;
      this.restoreTracePosition(trace, snapshot, options);
    }

    // Rebuild the stack at the depth the user was navigating.
    switch (snapshot.depth) {
      case 3:
        this.plotContext.push(figure);
        this.plotContext.push(subplot);
        this.plotContext.push(trace);
        break;
      case 2:
        this.plotContext.push(subplot);
        this.plotContext.push(trace);
        break;
      default:
        // Depth 1 is ambiguous: a multi-subplot figure starts at figure
        // level, a single-subplot single-layer chart at trace level.
        this.plotContext.push(this.isFigureLevel(figure) ? figure : trace);
        break;
    }
  }

  /**
   * Restores the trace-level cursor, applying the sliding-window shift and
   * clamping into the new data bounds without notifying observers.
   */
  private restoreTracePosition(
    trace: Trace,
    snapshot: NavigationSnapshot,
    options: ReplaceFigureOptions,
  ): void {
    let row = Math.max(0, snapshot.traceRow);
    let col = Math.max(0, snapshot.traceCol - (options.activeColShift ?? 0));

    // Clamp the row first (column 0 always exists for a non-empty row).
    while (row > 0 && !trace.isMovable([row, 0])) {
      row -= 1;
    }
    trace.row = row;

    // With the row in place, clamp the column against that row's length.
    while (col > 0 && !trace.isMovable([row, col])) {
      col -= 1;
    }
    trace.col = col;
  }

  /**
   * Resolves the instruction context element for a figure, mirroring the
   * choice made at construction time.
   */
  private resolveInstructionContext(figure: Figure): Plot {
    if (this.isFigureLevel(figure)) {
      return figure;
    }
    const subplotState = figure.activeSubplot.state;
    if (subplotState.empty || subplotState.size !== 1) {
      return figure.activeSubplot;
    }
    return figure.activeSubplot.activeTrace;
  }

  public dispose(): void {
    this.plotContext.clear();
    this.scopeContext.clear();
  }

  public get active(): Plot {
    return this.plotContext.peek()!;
  }

  public get state(): PlotState {
    return this.active.state;
  }

  /**
   * Enable or disable rotor navigation for the current context.
   *
   * @param enable - true to enable rotor mode, false to disable
   */
  public setRotorEnabled(enable: boolean): void {
    this.isRotorActive = enable;
    // TODO: emit event / notify observers if needed
  }

  /**
   * Return whether rotor navigation is currently enabled.
   *
   * @returns boolean
   */
  public isRotorEnabled(): boolean {
    return this.isRotorActive;
  }

  /**
   * Returns whether this figure has multiple subplots (facets/multi-panel).
   */
  public get isMultiPanel(): boolean {
    const figureState = this.figure.state;
    return !figureState.empty && figureState.size > 1;
  }

  /**
   * Returns the figure-level title (the top-level plot title).
   */
  public get figureTitle(): string {
    const figureState = this.figure.state;
    if (!figureState.empty) {
      return figureState.title;
    }
    return 'unavailable';
  }

  /**
   * Returns at-a-glance summaries for every subplot in the figure, in visual
   * (top-left first) order. Empty for single-panel figures.
   */
  public getSubplotSummaries(): SubplotSummary[] {
    return this.figure.getSubplotSummaries();
  }

  /**
   * Returns the figure-level subtitle.
   */
  public get figureSubtitle(): string {
    const figureState = this.figure.state;
    if (!figureState.empty) {
      return figureState.subtitle;
    }
    return 'unavailable';
  }

  /**
   * Returns the figure-level caption.
   */
  public get figureCaption(): string {
    const figureState = this.figure.state;
    if (!figureState.empty) {
      return figureState.caption;
    }
    return 'unavailable';
  }

  public toggleScope(scope: Scope): void {
    this.scopeContext.clear();
    this.scopeContext.push(scope);

    hotkeys.setScope(scope);
  }

  public get scope(): Scope {
    const currentScope = this.scopeContext.peek()!;
    return currentScope;
  }

  public isMovable(direction: MovableDirection): boolean {
    return this.active.isMovable(direction);
  }

  public moveOnce(direction: MovableDirection): void {
    this.active.moveOnce(direction);
  }

  public moveToExtreme(direction: MovableDirection): void {
    this.active.moveToExtreme(direction);
  }

  public moveToIndex(row: number, col: number): void {
    this.active.moveToIndex(row, col);
  }

  /**
   * Moves the active plot element to the specified (x, y) point.
   *
   * @param x - The x-coordinate to move to.
   * @param y - The y-coordinate to move to.
   * @remarks
   * This method assumes that `this.active` is a valid object with a `moveToPoint` method.
   * If `this.active` is `null` or does not implement `moveToPoint`, this method will do nothing.
   *
   * Limitations:
   * - If `this.active` is `null` or `undefined`, the method will not perform any action.
   * - If `this.active` does not implement `moveToPoint`, the method will not perform any action.
   */
  public moveToPoint(x: number, y: number): void {
    this.active.moveToPoint(x, y);
  }

  public stepTrace(direction: MovableDirection): void {
    if (this.plotContext.size() > 1) {
      const previousTrace = this.active as Trace;
      this.plotContext.pop(); // Remove current Trace.
      const activeSubplot = this.active as Subplot;

      const newTrace = this.navigationService.stepTraceInSubplot(activeSubplot, direction);

      if (newTrace) {
        this.plotContext.push(newTrace);
      } else if (previousTrace) {
        // Restore previous trace on failure to avoid corrupting the stack
        this.plotContext.push(previousTrace);
      }
    } else {
      const onlySubplot = this.figure.subplots[0][0];
      const activeTrace = this.active as Trace;
      activeTrace.notifyOutOfBounds();
      onlySubplot.notifyOutOfBounds(); // For UI feedback
    }
  }

  public enterSubplot(): void {
    const activeState = this.active.state;
    if (activeState.type === 'figure') {
      const activeFigure = this.active as Figure;
      this.plotContext.push(activeFigure.activeSubplot);
      const trace = activeFigure.activeSubplot.activeTrace;
      trace.resetToInitialEntry();
      this.plotContext.push(trace);
      this.toggleScope(Scope.TRACE);
    }
  }

  public exitSubplot(): void {
    if (this.plotContext.size() > 2) {
      this.plotContext.pop(); // Remove current Trace.
      this.plotContext.pop(); // Remove current Subplot.
      this.active.notifyStateUpdate();
      this.toggleScope(Scope.SUBPLOT);
    }
  }

  /**
   * Enters grid cell mode to navigate points within the current cell.
   * Only works when the active trace supports grid navigation and is in grid mode.
   * @returns true if successfully entered cell mode, false if no points in cell
   */
  public enterGridCell(): boolean {
    const activeTrace = this.active;
    if (isGridNavigable(activeTrace) && activeTrace.supportsGridMode()) {
      if (activeTrace.enterGridCell()) {
        this.toggleScope(Scope.GRID_CELL);
        return true;
      }
    }
    return false;
  }

  /**
   * Exits grid cell mode and returns to grid navigation.
   */
  public exitGridCell(): void {
    const activeTrace = this.active;
    if (isGridNavigable(activeTrace) && activeTrace.isInCellMode()) {
      activeTrace.exitGridCell();
      this.toggleScope(Scope.TRACE);
    }
  }

  /**
   * Moves to the previous point within the current grid cell.
   */
  public moveCellPointLeft(): void {
    const activeTrace = this.active;
    if (isGridNavigable(activeTrace) && activeTrace.isInCellMode()) {
      activeTrace.moveCellPointLeft();
    }
  }

  /**
   * Moves to the next point within the current grid cell.
   */
  public moveCellPointRight(): void {
    const activeTrace = this.active;
    if (isGridNavigable(activeTrace) && activeTrace.isInCellMode()) {
      activeTrace.moveCellPointRight();
    }
  }

  public getInstruction(includeClickPrompt: boolean): string {
    const state = this.instructionContext.state;
    if (state.empty) {
      return `No ${state.type} info available`;
    }

    const clickPrompt = includeClickPrompt
      ? 'Click to activate.'
      : Constant.EMPTY;
    switch (state.type) {
      case 'figure':
        return `This is a maidr figure containing ${state.size} subplots. ${clickPrompt}
        Use arrow keys to navigate subplots and press 'ENTER'.`;

      case 'subplot': {
        const subplotTraceOrientation = !state.trace.empty ? state.trace.orientation : undefined;
        const subplotPlotType = formatPlotType(state.trace.traceType, subplotTraceOrientation);
        return `This is a maidr plot containing ${state.size} layers, and
        this is layer 1 of ${state.size}: ${subplotPlotType} plot. ${clickPrompt}
        Use Arrows to navigate data points. Toggle B for Braille, T for Text,
        S for Sonification, and R for Review mode.`;
      }

      case 'trace': {
        // Handle edge case: if plotType is 'multiline' but only 1 group, treat as single line
        let effectivePlotType = state.plotType;

        if (state.plotType === 'multiline' && state.groupCount === 1) {
          effectivePlotType = 'single line';
        }

        const groupCountText
          = effectivePlotType === 'multiline' && state.groupCount
            ? ` with ${state.groupCount} groups`
            : '';

        const displayType = formatPlotType(effectivePlotType, state.orientation);

        return `This is a maidr plot of type: ${displayType}${groupCountText}. ${clickPrompt} Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.`;
      }
    }
  }
}
