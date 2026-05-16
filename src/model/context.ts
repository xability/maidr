import type { Disposable } from '@type/disposable';
import type { MovableDirection } from '@type/movable';
import type { PlotState, SubplotSummary } from '@type/state';
import type { Figure, Subplot, Trace } from './plot';
import { DEFAULT_SUBPLOT_TITLE } from '@model/abstract';
import { NavigationService } from '@service/navigation';
import { Scope } from '@type/event';
import { Orientation } from '@type/grammar';
import { isGridNavigable } from '@type/navigation';
import { Constant } from '@util/constant';
import { Stack } from '@util/stack';
import hotkeys from 'hotkeys-js';
import { DEFAULT_CAPTION, DEFAULT_FIGURE_TITLE, DEFAULT_SUBTITLE } from './plot';

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

export class Context implements Disposable {
  public readonly id: string;
  public readonly instructionContext: Plot;
  public readonly selectorList: string[] = [];

  private readonly plotContext: Stack<Plot>;
  private readonly scopeContext: Stack<Scope>;
  private readonly navigationService: NavigationService;
  private readonly figure: Figure;
  private isRotorActive: boolean;

  public constructor(figure: Figure) {
    this.figure = figure;
    this.id = figure.id;

    this.plotContext = new Stack<Plot>();
    this.scopeContext = new Stack<Scope>();
    this.navigationService = new NavigationService();

    this.isRotorActive = false;

    // Set the context to figure level.
    const figureState = figure.state;
    if (figureState.empty || figureState.size !== 1) {
      this.instructionContext = figure;
      this.plotContext.push(figure);
      this.scopeContext.push(Scope.SUBPLOT);
      return;
    }

    // Set the context to subplot level.
    this.scopeContext.push(Scope.TRACE);
    const subplotState = figure.activeSubplot.state;
    if (subplotState.empty || subplotState.size !== 1) {
      this.instructionContext = figure.activeSubplot;
      this.plotContext.push(figure.activeSubplot);
      this.plotContext.push(figure.activeSubplot.activeTrace);
      return;
    }

    // Set the context to trace level (single-layer plot)
    this.instructionContext = figure.activeSubplot.activeTrace;
    this.plotContext.push(figure.activeSubplot.activeTrace);
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
   * Returns the figure-level title (the top-level plot title), or the
   * unavailable placeholder when the figure has no state. Use
   * {@link isAuthoredTitle} to distinguish an authored title from the
   * model's default substitutions.
   */
  public get figureTitle(): string {
    const figureState = this.figure.state;
    if (!figureState.empty) {
      return figureState.title;
    }
    return DEFAULT_SUBPLOT_TITLE;
  }

  /**
   * Returns true when the given title came from the MAIDR JSON, i.e. it is
   * not a placeholder default substituted by the Figure or Trace models
   * when the JSON omits `title`. Encapsulates the model's internal default
   * constants so callers (commands, services) can avoid importing them.
   *
   * Empty / whitespace-only strings are also treated as unauthored, since
   * announcing a bare label like "Title is " is not useful.
   *
   * Known limitation: a title authored as the exact placeholder string
   * (e.g. "MAIDR Plot" or "unavailable") will be filtered out. The sentinel
   * defaults are deliberately uncommon strings to minimize collision risk.
   * @param {string} title - The title string to check.
   */
  public isAuthoredTitle(title: string): boolean {
    return (
      title.trim() !== ''
      && title !== DEFAULT_FIGURE_TITLE
      && title !== DEFAULT_SUBPLOT_TITLE
    );
  }

  /**
   * Returns true when the given subtitle came from the MAIDR JSON, i.e. it
   * is not the placeholder default the Figure model substitutes when the
   * JSON omits `subtitle`. Same empty-string and collision caveats apply
   * as {@link isAuthoredTitle}.
   * @param {string} subtitle - The subtitle string to check.
   */
  public isAuthoredSubtitle(subtitle: string): boolean {
    return subtitle.trim() !== '' && subtitle !== DEFAULT_SUBTITLE;
  }

  /**
   * Returns true when the given caption came from the MAIDR JSON, i.e. it
   * is not the placeholder default the Figure model substitutes when the
   * JSON omits `caption`. Same empty-string and collision caveats apply
   * as {@link isAuthoredTitle}.
   * @param {string} caption - The caption string to check.
   */
  public isAuthoredCaption(caption: string): boolean {
    return caption.trim() !== '' && caption !== DEFAULT_CAPTION;
  }

  /**
   * Returns at-a-glance summaries for every subplot in the figure, in visual
   * (top-left first) order. Empty for single-panel figures.
   */
  public getSubplotSummaries(): SubplotSummary[] {
    return this.figure.getSubplotSummaries();
  }

  /**
   * Returns the figure-level subtitle, or the unavailable placeholder when
   * the figure has no state. Use {@link isAuthoredSubtitle} to distinguish
   * an authored subtitle from the model's default substitution.
   */
  public get figureSubtitle(): string {
    const figureState = this.figure.state;
    if (!figureState.empty) {
      return figureState.subtitle;
    }
    return DEFAULT_SUBTITLE;
  }

  /**
   * Returns the figure-level caption, or the unavailable placeholder when
   * the figure has no state. Use {@link isAuthoredCaption} to distinguish
   * an authored caption from the model's default substitution.
   */
  public get figureCaption(): string {
    const figureState = this.figure.state;
    if (!figureState.empty) {
      return figureState.caption;
    }
    return DEFAULT_CAPTION;
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
