import type { MovableDirection } from '@type/movable';
import type { Figure, Subplot, Trace } from '@type/plot';
import type { PlotState } from '@type/state';
import { Scope } from '@type/event';
import { Constant } from '@util/constant';
import { Stack } from '@util/stack';
import hotkeys from 'hotkeys-js';

type Plot = Figure | Subplot | Trace;

export class ContextService {
  public readonly id: string;
  private readonly instructionContext: Plot;

  private readonly plotContext: Stack<Plot>;
  private readonly scopeContext: Stack<Scope>;

  public constructor(figure: Figure) {
    this.id = figure.id;

    this.plotContext = new Stack<Plot>();
    this.scopeContext = new Stack<Scope>();

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

    // Set the context to trace level.
    this.instructionContext = figure.activeSubplot.activeTrace;
    this.plotContext.push(figure.activeSubplot.activeTrace);
  }

  public get active(): Plot {
    return this.plotContext.peek()!;
  }

  public get state(): PlotState {
    return this.active.state;
  }

  public toggleScope(scope: Scope): void {
    if (!this.scopeContext.removeLast(scope)) {
      this.scopeContext.push(scope);
    }
    hotkeys.setScope(this.scope);
  }

  public get scope(): Scope {
    return this.scopeContext.peek()!;
  }

  public isMovable(target: number | MovableDirection): boolean {
    return this.active.isMovable(target);
  };

  public moveOnce(direction: MovableDirection): void {
    this.active.moveOnce(direction);
  }

  public moveToExtreme(direction: MovableDirection): void {
    this.active.moveToExtreme(direction);
  }

  public moveToIndex(index: number): void {
    this.active.moveToIndex(index);
  }

  public stepTrace(direction: MovableDirection): void {
    this.plotContext.pop(); // Remove current Trace.
    const activeSubplot = this.active as Subplot;
    activeSubplot.moveOnce(direction);
    this.active.notifyStateUpdate();
    this.plotContext.push(activeSubplot.activeTrace);
  }

  public enterSubplot(): void {
    const activeState = this.active.state;
    if (activeState.type === 'figure') {
      const activeFigure = this.active as Figure;
      this.plotContext.push(activeFigure.activeSubplot);
      this.active.notifyStateUpdate();
      this.plotContext.push(activeFigure.activeSubplot.activeTrace);
      this.toggleScope(Scope.TRACE);
    }
  }

  public exitSubplot(): void {
    if (this.plotContext.size() > 2) {
      this.plotContext.pop(); // Remove current Trace.
      this.plotContext.pop(); // Remove current Subplot.
      this.active.notifyStateUpdate();
      this.toggleScope(Scope.TRACE);
    }
  }

  public getInstruction(includeClickPrompt: boolean): string {
    const state = this.instructionContext.state;
    if (state.empty) {
      return `No ${state.type} info available`;
    }

    const clickPrompt = includeClickPrompt ? 'Click to activate.' : Constant.EMPTY;
    switch (state.type) {
      case 'figure':
        return `This is a MAIDR figure containing ${state.size} subplots. ${clickPrompt}
        Use arrow keys to navigate subplots and press 'ENTER'.`;

      case 'subplot':
        return `This is a MAIDR subplot containing ${state.size} layers, and
        this is layer 1 of ${state.size}: ${state.trace.traceType} plot. ${clickPrompt}
        Use Arrows to navigate data points. Toggle B for Braille, T for Text,
        S for Sonification, and R for Review mode.`;

      case 'trace':
        return `This is a maidr plot of type: ${state.traceType}. ${clickPrompt}
        Use Arrows to navigate data points. Toggle B for Braille, T for Text,
        S for Sonification, and R for Review mode.`;
    }
  }
}
