import type { Disposable } from '@type/disposable';
import type { Maidr, MaidrLayer, MaidrSubplot, SmoothPoint } from '@type/grammar';
import { TraceType } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { Observable } from '@type/observable';
import type {
  FigureState,
  HighlightState,
  SubplotState,
  TraceState,
} from '@type/state';
import { Constant } from '@util/constant';
import { AbstractObservableElement } from './abstract';
import { TraceFactory } from './factory';

const DEFAULT_FIGURE_TITLE = 'MAIDR Plot';
const DEFAULT_SUBTITLE = 'unavailable';
const DEFAULT_CAPTION = 'unavailable';

function isViolinSmoothLayer(layer: MaidrLayer): boolean {
  if (layer.type !== TraceType.SMOOTH) {
    return false;
  }

  const data = layer.data as SmoothPoint[][];
  if (!Array.isArray(data) || data.length === 0) {
    return false;
  }

  return data.some(
    row =>
      Array.isArray(row)
      && row.some(
        point => point && typeof point === 'object' && typeof point.density === 'number',
      ),
  );
}

function normalizeSmoothSelectors(selectors: MaidrLayer['selectors']): string[] {
  if (!selectors) {
    return [];
  }
  if (Array.isArray(selectors)) {
    return selectors.filter((selector): selector is string => typeof selector === 'string');
  }
  return typeof selectors === 'string' ? [selectors] : [];
}

function createCombinedViolinLayer(group: MaidrLayer[]): MaidrLayer {
  if (group.length === 1) {
    return group[0];
  }

  const [first] = group;
  const combinedData: SmoothPoint[][] = [];
  const combinedSelectors: string[] = [];

  for (const layer of group) {
    const layerData = layer.data as SmoothPoint[][];
    if (Array.isArray(layerData)) {
      layerData.forEach(row => combinedData.push(row));
    }
    const selectors = normalizeSmoothSelectors(layer.selectors);
    selectors.forEach(selector => combinedSelectors.push(selector));
  }

  if (combinedSelectors.length < combinedData.length) {
    const filler = combinedSelectors[combinedSelectors.length - 1] ?? '';
    while (combinedSelectors.length < combinedData.length) {
      combinedSelectors.push(filler);
    }
  } else if (combinedSelectors.length > combinedData.length) {
    combinedSelectors.length = combinedData.length;
  }

  return {
    ...first,
    id: `${first.id}-combined`,
    data: combinedData,
    selectors: combinedSelectors,
  };
}

function combineViolinSmoothLayers(layers: MaidrLayer[]): MaidrLayer[] {
  const processedLayers: MaidrLayer[] = [];
  let pendingGroup: MaidrLayer[] = [];

  const flushPending = () => {
    if (pendingGroup.length === 0) {
      return;
    }
    processedLayers.push(createCombinedViolinLayer(pendingGroup));
    pendingGroup = [];
  };

  for (const layer of layers) {
    if (isViolinSmoothLayer(layer)) {
      pendingGroup.push(layer);
    } else {
      flushPending();
      processedLayers.push(layer);
    }
  }

  flushPending();
  return processedLayers;
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
    this.subplots = subplots.map(row =>
      row.map(subplot => new Subplot(subplot)),
    );
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

    const currentIndex
      = this.col
        + 1
        + this.subplots.slice(0, this.row).reduce((sum, r) => sum + r.length, 0);

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
      const subplotElement = document.querySelector(
        subplotSelector,
      ) as SVGElement;

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

  public isMovable(direction: MovableDirection): boolean {
    switch (direction) {
      case 'UPWARD':
        return this.row < this.subplots.length - 1;
      case 'DOWNWARD':
        return this.row > 0;
      case 'FORWARD':
        return this.col < this.subplots[this.row].length - 1;
      case 'BACKWARD':
        return this.col > 0;
      default:
        return false;
    }
  }

  public moveOnce(direction: MovableDirection): void {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.notifyStateUpdate();
      return;
    }

    if (!this.isMovable(direction)) {
      this.notifyOutOfBounds();
      return;
    }

    switch (direction) {
      case 'UPWARD':
        this.row += 1;
        break;
      case 'DOWNWARD':
        this.row -= 1;
        break;
      case 'FORWARD':
        this.col += 1;
        break;
      case 'BACKWARD':
        this.col -= 1;
        break;
    }
    this.notifyStateUpdate();
  }

  public moveToPoint(_x: number, _y: number): void {
    // implement in plot classes
    this.notifyStateUpdate();
  }
}

export class Subplot extends AbstractObservableElement<Trace, SubplotState> {
  public readonly traces: Trace[][];
  public readonly traceTypes: string[];
  private readonly size: number;

  public constructor(subplot: MaidrSubplot) {
    super();

    this.isInitialEntry = false;

    const originalLayers = subplot.layers;
    const layers = combineViolinSmoothLayers(originalLayers);
    this.size = layers.length;
    // Pass all layers to factory so it can detect violin plot box plots
    this.traces = layers.map(layer => [TraceFactory.create(layer, layers)]);
    this.traceTypes = this.traces.flat().map((trace) => {
      const state = trace.state;
      return state.empty ? Constant.EMPTY : state.traceType;
    });
  }

  public getRow(): number {
    return this.row;
  }

  public getSize(): number {
    return this.size;
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

  public moveOnce(direction: MovableDirection): void {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.notifyStateUpdate();
      return;
    }

    if (!this.isMovable(direction)) {
      this.notifyOutOfBounds();
      return;
    }

    // Track previous position to detect trace switching
    const previousCol = this.col;
    const previousRow = this.row;

    switch (direction) {
      case 'UPWARD':
        this.row += 1;
        break;
      case 'DOWNWARD':
        this.row -= 1;
        break;
      case 'FORWARD':
        this.col += 1;
        break;
      case 'BACKWARD':
        this.col -= 1;
        break;
    }

    // If we switched traces (col changed) and the new trace is a ViolinBoxTrace,
    // reset its position to MIN when navigating between box plots in violin plots
    if (previousCol !== this.col && (direction === 'FORWARD' || direction === 'BACKWARD')) {
      const newTrace = this.activeTrace;
      // Check if it's a ViolinBoxTrace by checking if it has the resetToMin method
      if (newTrace && typeof (newTrace as any).resetToMin === 'function') {
        (newTrace as any).resetToMin();
      }
    }

    this.notifyStateUpdate();
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

  public moveToPoint(_x: number, _y: number): void {
    // implement in plot classes
    this.notifyStateUpdate();
  }

  public getStateWithFigurePosition(
    _figureRow: number,
    _figureCol: number,
  ): SubplotState {
    return this.state;
  }
}

export interface Trace extends Movable, Observable<TraceState>, Disposable {
  getId: () => string;
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

  /**
   * Notify observers that the trace is out of bounds
   */
  notifyOutOfBounds: () => void;

  /**
   * Reset the trace to initial entry state
   * This sets isInitialEntry to true and position to (0, 0)
   */
  resetToInitialEntry: () => void;
  notifyObserversWithState: (state: TraceState) => void;
}
