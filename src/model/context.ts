import type { Disposable } from '@type/disposable';
import type { MovableDirection } from '@type/movable';
import type { PlotState } from '@type/state';
import type { Figure, Subplot, Trace } from './plot';
import { NavigationService } from '@service/navigation';
import { Scope } from '@type/event';
import { Constant } from '@util/constant';
import { Stack } from '@util/stack';
import hotkeys from 'hotkeys-js';

/**
 * Union type representing different plot hierarchy levels
 */
type Plot = Figure | Subplot | Trace;

/**
 * Context manager for maintaining navigation state across plot hierarchy levels
 */
export class Context implements Disposable {
  public readonly id: string;
  private readonly instructionContext: Plot;

  private readonly plotContext: Stack<Plot>;
  private readonly scopeContext: Stack<Scope>;
  private readonly navigationService: NavigationService;
  private readonly figure: Figure;
  private isRotorActive: boolean;

  /**
   * Creates a new Context instance for managing plot navigation state
   * @param figure - The root figure to initialize context from
   */
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

  /**
   * Cleans up resources and disposes of the context
   */
  public dispose(): void {
    this.plotContext.clear();
    this.scopeContext.clear();
  }

  /**
   * Gets the currently active plot element in the context
   * @returns The active plot (Figure, Subplot, or Trace)
   */
  public get active(): Plot {
    return this.plotContext.peek()!;
  }

  /**
   * Gets the state of the currently active plot
   * @returns Current plot state
   */
  public get state(): PlotState {
    return this.active.state;
  }

  /**
   * Enables or disables rotor navigation for the current context
   * @param enable - True to enable rotor mode, false to disable
   */
  public setRotorEnabled(enable: boolean): void {
    this.isRotorActive = enable;
    // TODO: emit event / notify observers if needed
  }

  /**
   * Checks whether rotor navigation is currently enabled
   * @returns True if rotor is enabled, false otherwise
   */
  public isRotorEnabled(): boolean {
    return this.isRotorActive;
  }

  /**
   * Toggles the navigation scope to the specified level
   * @param scope - The scope to switch to
   */
  public toggleScope(scope: Scope): void {
    // Clear the scope context and set the new scope
    this.scopeContext.clear();
    this.scopeContext.push(scope);

    hotkeys.setScope(scope);
  }

  /**
   * Gets the current navigation scope
   * @returns The current scope level
   */
  public get scope(): Scope {
    const currentScope = this.scopeContext.peek()!;
    return currentScope;
  }

  /**
   * Checks if movement in the specified direction is possible
   * @param direction - Direction to check
   * @returns True if movement is possible
   */
  public isMovable(direction: MovableDirection): boolean {
    return this.active.isMovable(direction);
  }

  /**
   * Moves the active plot element one step in the specified direction
   * @param direction - Direction to move
   */
  public moveOnce(direction: MovableDirection): void {
    this.active.moveOnce(direction);
  }

  /**
   * Moves the active plot element to an extreme position in the specified direction
   * @param direction - Direction to move to extreme
   */
  public moveToExtreme(direction: MovableDirection): void {
    this.active.moveToExtreme(direction);
  }

  /**
   * Moves the active plot element to a specific row and column index
   * @param row - Row index to move to
   * @param col - Column index to move to
   */
  public moveToIndex(row: number, col: number): void {
    this.active.moveToIndex(row, col);
  }

  /**
   * Moves the active plot element to the specified (x, y) point
   * @param x - The x-coordinate to move to
   * @param y - The y-coordinate to move to
   */
  public moveToPoint(x: number, y: number): void {
    this.active.moveToPoint(x, y);
  }

  /**
   * Steps through traces in multi-layer plots while preserving X position
   * @param direction - Direction to step through traces
   */
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

  /**
   * Enters subplot navigation mode from figure level
   */
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

  /**
   * Exits subplot navigation mode and returns to figure level
   */
  public exitSubplot(): void {
    if (this.plotContext.size() > 2) {
      this.plotContext.pop(); // Remove current Trace.
      this.plotContext.pop(); // Remove current Subplot.
      this.active.notifyStateUpdate();
      this.toggleScope(Scope.SUBPLOT);
    }
  }

  /**
   * Generates instruction text for the current context level
   * @param includeClickPrompt - Whether to include click activation prompt
   * @returns Instruction text for the user
   */
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

      case 'subplot':
        return `This is a maidr plot containing ${state.size} layers, and
        this is layer 1 of ${state.size}: ${state.trace.traceType} plot. ${clickPrompt}
        Use Arrows to navigate data points. Toggle B for Braille, T for Text,
        S for Sonification, and R for Review mode.`;

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

        return `This is a maidr plot of type: ${effectivePlotType}${groupCountText}. ${clickPrompt} Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.`;
      }
    }
  }
}
