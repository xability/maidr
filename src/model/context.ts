import type { Disposable } from "@type/disposable";
import type { MovableDirection } from "@type/movable";
import type { LayerSwitchTraceState, PlotState } from "@type/state";
import type { Figure, Subplot, Trace } from "./plot";
import { Scope } from "@type/event";
import { Constant } from "@util/constant";
import { Stack } from "@util/stack";
import hotkeys from "hotkeys-js";

type Plot = Figure | Subplot | Trace;

export class Context implements Disposable {
  public readonly id: string;
  public readonly instructionContext: Plot;
  public readonly selectorList: string[] = [];

  private readonly plotContext: Stack<Plot>;
  private readonly scopeContext: Stack<Scope>;
  private readonly figure: Figure;
  private isRotorActive: boolean;

  public constructor(figure: Figure) {
    this.figure = figure;
    this.id = figure.id;

    this.plotContext = new Stack<Plot>();
    this.scopeContext = new Stack<Scope>();

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

  public toggleScope(scope: Scope): void {
    // Clear the scope context and set the new scope
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
      this.plotContext.pop(); // Remove current Trace.
      const activeSubplot = this.active as Subplot;
      const currentTrace = activeSubplot.activeTrace;
      if (!currentTrace) {
        return;
      }
      const currentXValue = currentTrace.getCurrentXValue();
      activeSubplot.moveOnce(direction);
      const newTrace = activeSubplot.activeTrace;
      this.plotContext.push(newTrace);

      if (newTrace.getId() === currentTrace.getId()) {
        newTrace.notifyOutOfBounds();
        activeSubplot.notifyOutOfBounds();
        return;
      }

      newTrace.moveToXValue(currentXValue);
      if (!newTrace.state.empty) {
        const index = activeSubplot.getRow() + 1;
        const size = activeSubplot.getSize();
        const state: LayerSwitchTraceState = {
          ...newTrace.state,
          isLayerSwitch: true,
          index,
          size,
        };
        newTrace.notifyObserversWithState(state);
      } else {
        newTrace.notifyStateUpdate();
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
    if (activeState.type === "figure") {
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

  public getInstruction(includeClickPrompt: boolean): string {
    const state = this.instructionContext.state;
    if (state.empty) {
      return `No ${state.type} info available`;
    }

    const clickPrompt = includeClickPrompt
      ? "Click to activate."
      : Constant.EMPTY;
    switch (state.type) {
      case "figure":
        return `This is a maidr figure containing ${state.size} subplots. ${clickPrompt} Use arrow keys to navigate subplots and press 'ENTER'.`;

      case "subplot":
        return `This is a maidr plot containing ${state.size} layers, and this is layer 1 of ${state.size}: ${state.trace.traceType} plot. ${clickPrompt} Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.`;

      case "trace": {
        // Handle edge case: if plotType is 'multiline' but only 1 group, treat as single line
        let effectivePlotType = state.plotType;
        if (state.plotType === "multiline" && state.groupCount === 1) {
          effectivePlotType = "single line";
        }

        const groupCountText =
          effectivePlotType === "multiline" && state.groupCount
            ? ` with ${state.groupCount} groups`
            : "";
        return `This is a maidr plot of type: ${effectivePlotType}${groupCountText}. ${clickPrompt} Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.`;
      }
    }
  }
}
