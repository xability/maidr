import type { Disposable } from '@type/disposable';
import type { Maidr, MaidrSubplot } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { Observable } from '@type/observable';
import type { FigureState, HighlightState, SubplotState, TraceState } from '@type/state';
import { Constant } from '@util/constant';
import { AbstractObservableElement } from './abstract';
import { TraceFactory } from './factory';

const DEFAULT_FIGURE_TITLE = 'MAIDR Plot';
const DEFAULT_SUBTITLE = 'unavailable';
const DEFAULT_CAPTION = 'unavailable';

export class Figure extends AbstractObservableElement<Subplot, FigureState> {
  public readonly id: string;

  private readonly title: string;
  private readonly subtitle: string;
  private readonly caption: string;

  public readonly subplots: Subplot[][];
  private readonly size: number;

  public constructor(maidr: Maidr) {
    super();

    this.id = maidr.id;

    this.title = maidr.title ?? DEFAULT_FIGURE_TITLE;
    this.subtitle = maidr.subtitle ?? DEFAULT_SUBTITLE;
    this.caption = maidr.caption ?? DEFAULT_CAPTION;

    const subplots = maidr.subplots as MaidrSubplot[][];
    this.subplots = subplots.map(row => row.map(subplot => new Subplot(subplot)));
    this.size = this.subplots.reduce((sum, row) => sum + row.length, 0);
  }

  public dispose(): void {
    this.subplots.forEach(row => row.forEach(subplot => subplot.dispose()));
    this.subplots.length = 0;
    super.dispose();
  }

  protected get values(): Subplot[][] {
    return this.subplots;
  }

  public get activeSubplot(): Subplot {
    return this.subplots[this.row][this.col];
  }

  public get state(): FigureState {
    if (this.isOutOfBounds) {
      return {
        empty: true,
        type: 'figure',
      };
    }

    const currentIndex = this.col + 1 + this.subplots.slice(0, this.row)
      .reduce((sum, r) => sum + r.length, 0);

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
      highlight: this.highlight(), // Figure determines which subplot to highlight
    };
  }

  protected highlight(): HighlightState {
    // Check if this is a multi-plot scenario (more than one subplot)
    const totalSubplots = document.querySelectorAll('g[id^="axes_"]').length;

    if (totalSubplots <= 1) {
      // No highlighting needed for single plot
      return {
        empty: true,
        type: 'trace',
        audio: {
          size: this.values[this.row].length,
          index: this.col,
        },
      };
    }

    // For multi-plot scenarios, find the subplot container element
    try {
      // Calculate the subplot index based on the figure's current position
      const subplotIndex = this.row + 1; // 1-based index
      const subplotSelector = `g[id="axes_${subplotIndex}"]`;

      const subplotElement = document.querySelector(subplotSelector) as SVGElement;

      if (subplotElement) {
        return {
          empty: false,
          elements: subplotElement,
        };
      }

      // Fallback: try to find by position in the subplot grid
      const allSubplots = document.querySelectorAll('g[id^="axes_"]');

      if (allSubplots.length > 0 && this.row < allSubplots.length) {
        return {
          empty: false,
          elements: allSubplots[this.row] as SVGElement,
        };
      }
    } catch (error) {
      // No subplot element found
      return {
        empty: true,
        type: 'trace',
        audio: {
          size: this.values[this.row].length,
          index: this.col,
        },
      };
    }

    // No subplot element found
    return {
      empty: true,
      type: 'trace',
      audio: {
        size: this.values[this.row].length,
        index: this.col,
      },
    };
  }
}

export class Subplot extends AbstractObservableElement<Trace, SubplotState> {
  public readonly traces: Trace[][];
  public readonly traceTypes: string[];
  private readonly size: number;

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

  public dispose(): void {
    this.traces.forEach(row => row.forEach(trace => trace.dispose()));
    this.traces.length = 0;
    super.dispose();
  }

  protected get values(): Trace[][] {
    return this.traces;
  }

  public get activeTrace(): Trace {
    return this.traces[this.row][this.col];
  }

  protected highlight(): HighlightState {
    // Subplot highlighting is now managed by the Figure
    // This method only handles trace-level highlighting
    return {
      empty: true,
      type: 'trace',
      audio: {
        size: this.values[this.row].length,
        index: this.col,
      },
    };
  }

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

  // Add a method to get state with figure position for highlighting
  public getStateWithFigurePosition(_figureRow: number, _figureCol: number): SubplotState {
    return this.state; // Simplified since Figure now manages highlighting
  }
}

export interface Trace extends Movable, Observable<TraceState>, Disposable { }
