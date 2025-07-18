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
      highlight: this.highlight(),
    };
  }

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
      const subplotElement = document.querySelector(subplotSelector) as SVGElement;

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

  public getStateWithFigurePosition(_figureRow: number, _figureCol: number): SubplotState {
    return this.state;
  }
}

export interface Trace extends Movable, Observable<TraceState>, Disposable {
  /**
   * Get the current X value from the trace
   * @returns The current X value or null if not available
   */
  getCurrentXValue: () => any;

  /**
   * Move the trace to the position that matches the given X value
   * @param xValue The X value to move to
   * @returns true if the position was found and set, false otherwise
   */
  moveToXValue: (xValue: any) => boolean;
}

export interface TraceWithProperties {
  isInitialEntry: boolean;
  row: number;
  col: number;
}
