import type { Disposable } from '@type/disposable';
import type { Maidr, MaidrSubplot } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { Observable } from '@type/observable';
import type { FigureState, HighlightState, SubplotState, TraceState } from '@type/state';
import { Constant } from '@util/constant';
import { Svg } from '@util/svg';
import { AbstractPlot } from './abstract';
import { TraceFactory } from './factory';
import { MovableGrid } from './movable';

const DEFAULT_FIGURE_TITLE = 'MAIDR Plot';
const DEFAULT_SUBTITLE = 'unavailable';
const DEFAULT_CAPTION = 'unavailable';

export class Figure extends AbstractPlot<FigureState> implements Movable, Observable<FigureState>, Disposable {
  public readonly id: string;
  protected readonly movable: Movable;

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

    this.movable = new MovableGrid<Subplot>(this.subplots, { row: this.subplots.length - 1 });
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

  protected get outOfBoundsState(): FigureState {
    return {
      empty: true,
      type: 'figure',
      audio: {
        row: this.row,
        col: this.col,
        totalRows: this.subplots.length,
        totalCols: this.subplots[this.row].length,
      },
    };
  }
}

export class Subplot extends AbstractPlot<SubplotState> implements Movable, Observable<SubplotState>, Disposable {
  protected readonly movable: Movable;

  public readonly traces: Trace[][];
  public readonly traceTypes: string[];

  private readonly size: number;
  private readonly highlightValue: SVGElement | null;

  public constructor(subplot: MaidrSubplot) {
    super();

    const layers = subplot.layers;
    this.size = layers.length;

    this.traces = layers.map(layer => [TraceFactory.create(layer)]);
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

  protected get values(): Trace[][] {
    return this.traces;
  }

  public get activeTrace(): Trace {
    return this.traces[this.row][this.col];
  }

  public get state(): SubplotState {
    return {
      empty: false,
      type: 'subplot',
      size: this.size,
      index: this.row + 1,
      trace: this.activeTrace.state,
      highlight: this.highlight(),
    };
  }

  protected get outOfBoundsState(): SubplotState {
    return {
      empty: true,
      type: 'subplot',
      audio: {
        row: this.row,
        col: this.col,
        totalRows: this.traces.length,
        totalCols: this.traces[this.row].length,
      },
    };
  }

  private highlight(): HighlightState {
    if (this.highlightValue === null) {
      return this.outOfBoundsState as HighlightState;
    }

    return {
      empty: false,
      elements: this.highlightValue,
    };
  }

  private mapToSvgElement(selector?: string): SVGElement | null {
    return selector ? Svg.selectElement(selector) ?? null : null;
  }
}

export interface Trace extends Movable, Observable<TraceState>, Disposable {}
