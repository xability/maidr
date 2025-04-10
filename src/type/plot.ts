import type { Disposable } from '@type/disposable';
import type { Maidr, MaidrSubplot } from './maidr';
import type { Movable } from './movable';
import type { Observable } from './observable';
import type { FigureState, SubplotState, TraceState } from './state';
import { TraceFactory } from '@model/factory';
import { AbstractObservableElement } from '@model/plot';
import { Constant } from '@util/constant';

const DEFAULT_FIGURE_TITLE = 'MAIDR Plot';
const DEFAULT_SUBTITLE = 'unavailable';
const DEFAULT_CAPTION = 'unavailable';

export enum TraceType {
  BAR = 'bar',
  BOX = 'box',
  DODGED = 'dodged_bar',
  HEATMAP = 'heat',
  HISTOGRAM = 'hist',
  LINE = 'line',
  NORMALIZED = 'stacked_normalized_bar',
  SCATTER = 'point',
  STACKED = 'stacked_bar',
}

export enum Orientation {
  VERTICAL = 'vert',
  HORIZONTAL = 'horz',
}

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
    return {
      empty: false,
      type: 'figure',
      title: this.title,
      subtitle: this.subtitle,
      caption: this.caption,
      size: this.size,
      index: currentIndex,
      subplot: this.activeSubplot.state,
      traceTypes: this.activeSubplot.traceTypes,
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
    };
  }
}

export interface Trace extends Movable, Observable<TraceState>, Disposable {}
