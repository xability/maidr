import type { MovableDirection } from '@type/movable';
import type { Figure, Subplot, Trace } from '@type/plot';
import type { PlotState } from '@type/state';
import { Constant } from '@util/constant';
import { Stack } from '@util/stack';

type Plot = Figure | Subplot | Trace;

export class ContextService {
  public readonly id: string;
  private readonly context: Stack<Plot>;

  public constructor(figure: Figure) {
    this.id = figure.id;
    this.context = new Stack<Plot>();
    this.context.push(figure);
  }

  public get active(): Plot {
    return this.context.peek()!;
  }

  public get state(): PlotState {
    return this.active.state;
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
    this.context.pop(); // Remove current Trace.
    const currentSubplot = this.active as Subplot;
    currentSubplot.moveOnce(direction);
    this.active.notifyStateUpdate();

    const [traceRow, traceCol] = currentSubplot.position;
    const currentTrace = currentSubplot.traces[traceRow][traceCol];
    this.context.push(currentTrace);
  }

  public enterSubplot(): void {
    const activeState = this.active.state;
    if (activeState.type === 'figure') {
      const [subplotRow, subplotCol] = this.active.position;
      const currentSubplot = (this.active as Figure).subplots[subplotRow][subplotCol];
      this.context.push(currentSubplot);
      this.active.notifyStateUpdate();

      const [traceRow, traceCol] = currentSubplot.position;
      const currentTrace = currentSubplot.traces[traceRow][traceCol];
      this.context.push(currentTrace);
    }
  }

  public exitSubplot(): void {
    this.context.pop(); // Remove current Trace.
    this.context.pop(); // Remove current Subplot.
    this.active.notifyStateUpdate();
  }

  public getInstruction(includeClickPrompt: boolean): string {
    const state = this.state;
    if (state.empty) {
      return `No ${state.type} info available`;
    }

    const clickPrompt = includeClickPrompt ? 'Click to activate.' : Constant.EMPTY;
    switch (state.type) {
      case 'figure':
        return `This is a MAIDR figure containing ${state.size} panels. ${clickPrompt}
        Use arrow keys to navigate subplots and press 'ENTER'.`;

      case 'subplot':
        return `This is a MAIDR subplot containing ${state.size} traces. ${clickPrompt}`;

      case 'trace':
        return `This is a maidr plot of type: ${state.traceType}. ${clickPrompt}
        Use Arrows to navigate data points. Toggle B for Braille, T for Text,
        S for Sonification, and R for Review mode. Use H for Help.`;
    }
  }
}
