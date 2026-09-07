import type { Disposable } from '@type/disposable';
import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { Observable, Observer } from '@type/observable';
import type {
  AudioState,
  AutoplayState,
  BrailleState,
  DescriptionState,
  HighlightState,
  PointerGuidanceState,
  TextState,
  TraceEmptyState,
  TraceState,
} from '@type/state';
import type { Trace } from './plot';
import { TraceType } from '@type/grammar';
import { Constant } from '@util/constant';
import {
  extractXValueFromPoints,
  extractXValueFromValues,
  moveToXValueInPoints,
  moveToXValueInValues,
} from '@util/navigation';
import { resolveOrientation } from '@util/orientation';
import { Svg } from '@util/svg';

export const DEFAULT_SUBPLOT_TITLE = 'unavailable';

const DEFAULT_X_AXIS = 'X';
const DEFAULT_Y_AXIS = 'Y';
const DEFAULT_Z_AXIS = 'Level';

/**
 * Names an axis, falling back when the layer did not really name it.
 *
 * A producer with no label to give writes one of two spellings of "none", and
 * `??` catches only one: `undefined` takes the fallback, but an empty string
 * is a value and passes straight through. Both spellings mean the same thing
 * here, and a blank name announces worse than a generic one — "X is Apples"
 * at least says which axis is being read, where " is Apples" is a sentence
 * with its noun missing. Whitespace counts as blank for the same reason.
 *
 * Exported because `LineTrace` resolves its own z label against a
 * trace-specific fallback rather than reading `this.z`.
 *
 * @param label - The label the layer carried, if any
 * @param fallback - The generic name to use when it carried none
 * @returns The label to announce
 */
export function named(label: string | undefined, fallback: string): string {
  return label?.trim() ? label : fallback;
}

/**
 * Maps internal TraceType identifiers to human-readable chart type labels
 * for display in the chart description modal and other user-facing surfaces.
 */
const CHART_TYPE_LABEL: Record<TraceType, string> = {
  [TraceType.AREA]: 'Area Chart',
  [TraceType.BAR]: 'Bar Chart',
  [TraceType.BUMP]: 'Bump Chart',
  [TraceType.BOX]: 'Box Plot',
  [TraceType.BOXEN]: 'Letter-Value Plot',
  [TraceType.ALLUVIAL]: 'Alluvial Diagram',
  [TraceType.CANDLESTICK]: 'Candlestick Chart',
  [TraceType.CHORD]: 'Chord Diagram',
  [TraceType.SANKEY]: 'Sankey Diagram',
  [TraceType.NETWORK]: 'Network Diagram',
  [TraceType.CANDLESTICK_DELTA]: 'Candlestick Reference Delta',
  [TraceType.CHOROPLETH]: 'Choropleth Map',
  [TraceType.CONTOUR]: 'Contour Plot',
  [TraceType.DIVERGING]: 'Diverging Bar Chart',
  [TraceType.DODGED]: 'Dodged Bar Chart',
  [TraceType.DOT]: 'Dot Plot',
  [TraceType.DUMBBELL]: 'Dumbbell Chart',
  [TraceType.ERROR_BAR]: 'Error Bar Chart',
  [TraceType.FOREST]: 'Forest Plot',
  [TraceType.GANTT]: 'Gantt Chart',
  [TraceType.FUNNEL]: 'Funnel Chart',
  [TraceType.GAUGE]: 'Gauge',
  [TraceType.HEATMAP]: 'Heatmap',
  [TraceType.HEXBIN]: 'Hexbin Plot',
  [TraceType.HISTOGRAM]: 'Histogram',
  [TraceType.LINE]: 'Line Chart',
  [TraceType.LOLLIPOP]: 'Lollipop Chart',
  [TraceType.MOSAIC]: 'Mosaic Plot',
  [TraceType.NORMALIZED]: 'Normalized Stacked Bar Chart',
  [TraceType.NORMALIZED_AREA]: 'Normalized Stacked Area Chart',
  [TraceType.PARALLEL]: 'Parallel Coordinates Plot',
  [TraceType.PIE]: 'Pie Chart',
  [TraceType.POLAR_AREA]: 'Polar Area Chart',
  [TraceType.RADAR]: 'Radar Chart',
  [TraceType.RIDGELINE]: 'Ridgeline Plot',
  [TraceType.SCATTER]: 'Scatter Plot',
  [TraceType.SUNFLOWER]: 'Sunflower Plot',
  [TraceType.SMOOTH]: 'Smooth Line Chart',
  [TraceType.STACKED]: 'Stacked Bar Chart',
  [TraceType.STACKED_AREA]: 'Stacked Area Chart',
  [TraceType.STEP]: 'Step Plot',
  [TraceType.SURVIVAL]: 'Survival Curve',
  [TraceType.ICICLE]: 'Icicle Chart',
  [TraceType.SUNBURST]: 'Sunburst Chart',
  [TraceType.TREE]: 'Tree Diagram',
  [TraceType.PACK]: 'Circle Packing',
  [TraceType.TREEMAP]: 'Treemap',
  [TraceType.VIOLIN_BOX]: 'Violin Box Plot',
  [TraceType.VIOLIN_KDE]: 'Violin Plot',
  [TraceType.MANHATTAN]: 'Manhattan Plot',
  [TraceType.VOLCANO]: 'Volcano Plot',
  [TraceType.WATERFALL]: 'Waterfall Chart',
  [TraceType.WORD_CLOUD]: 'Word Cloud',
};

/**
 * The human-readable name of a chart type, as the description dialog writes it.
 *
 * A free function beside the map because two callers need it and only one of
 * them holds a trace: `Figure.getSubplotSummaries` names the layers of panels
 * the reader has not entered, and has nothing but their {@link TraceType}. The
 * map is declared `Record<TraceType, string>`, so every member has an entry and
 * a lookup cannot miss.
 *
 * @param type - The layer's trace type
 * @returns The label, e.g. `Scatter Plot` for {@link TraceType.SCATTER}
 */
export function chartTypeLabel(type: TraceType): string {
  return CHART_TYPE_LABEL[type];
}

/**
 * How many rows a description's data table carries.
 *
 * The dialog paints a hundred at a time, and every row past that is re-rounded
 * by `DescriptionService` on each press of `d` and then held in the Redux
 * store. The traces this bites are the ones written for volume -- a Manhattan
 * plot of a few hundred thousand points, a contour field sampled two thousand
 * times per curve -- where an uncapped table is a full pass over the layer for
 * a table nobody reads to the end.
 *
 * Shared so the traces that cap cannot come to disagree about where the line
 * is. A trace that caps must say so, as a `Table rows` stat: the dialog prints
 * the row count it is given, and a count claiming the whole layer over a table
 * holding a fraction of it is worse than no table.
 */
export const MAX_DESCRIPTION_TABLE_ROWS = 1000;

export interface Dimension {
  rows: number;
  cols: number;
}

/**
 * Display metadata for the rotor's two compare modes. `label` is the rotor
 * unit name announced when cycling modes; `noun` is the phrase used in
 * "No {noun} found ..." boundary messages.
 */
export interface CompareModeInfo {
  lower: { label: string; noun: string };
  higher: { label: string; noun: string };
}

/**
 * Display metadata for a trace-specific rotor "filter" unit — a navigation
 * mode that walks only the points matching some predicate (e.g. only bullish
 * candlesticks). Unlike the two built-in compare units (lower/higher value),
 * a trace can expose any number of filter units.
 *
 * - `key`: stable identifier the trace uses to recognise the unit when the
 *   rotor asks it to move (see {@link AbstractTrace.moveToRotorFilter}).
 * - `label`: the rotor unit name announced when cycling with Alt+Shift+Up/Down.
 * - `noun`: the phrase used in "No {noun} found ..." boundary messages.
 */
export interface RotorFilterUnit {
  key: string;
  label: string;
  noun: string;
}

export interface NearestPoint {
  element: SVGElement;
  row: number;
  col: number;
  centerX: number;
  centerY: number;
}

export abstract class AbstractPlot<State> implements Movable, Observable<State>, Disposable {
  protected readonly observers: Observer<State>[];
  protected isWarning: boolean;

  /**
   * True while {@link AbstractTrace.getStateAt} computes state at a
   * temporarily moved cursor. Enforces (structurally, not just by
   * documentation) that state getters never notify observers.
   */
  protected isComputingStateAt: boolean;

  /**
   * True while a move is being made for something other than the reader.
   * See {@link runSilently}.
   */
  private isSilent: boolean;

  protected constructor() {
    this.observers = new Array<Observer<State>>();
    this.isWarning = false;
    this.isComputingStateAt = false;
    this.isSilent = false;
  }

  /**
   * Runs `action` with this element's observers muted.
   *
   * A cursor move normally *is* the announcement -- `moveToIndex` notifies, and
   * everything downstream of it speaks, brailles and highlights. That is wrong
   * for a move the reader did not make and is not waiting to hear: the
   * description dialog's layer tabs relocate the reader in the chart while the
   * modal is open, and the trace's announcement would land in the same live
   * region the dialog is using, so one of the two is dropped. The caller
   * announces afterwards, once, when the reader is back on the chart.
   *
   * Nesting is safe and the flag is restored on every path, including a throw,
   * because a flag left raised would silence the chart for good.
   *
   * @param action - The moves to make in silence
   */
  public runSilently(action: () => void): void {
    const wasSilent = this.isSilent;
    this.isSilent = true;
    try {
      action();
    } finally {
      this.isSilent = wasSilent;
    }
  }
  protected abstract get dimension(): Dimension;

  public dispose(): void {
    this.observers.length = 0;
  }

  public notifyRotorBounds(): void {
    this.isWarning = true;
    try {
      this.notifyStateUpdate();
    } finally {
      // Restore on every path, as `getStateAt` does: `CommandExecutor` swallows
      // a throw from an observer, and a flag left raised turns every later
      // `state` read into the warning variant.
      this.isWarning = false;
    }
  }

  public get isInitialEntry(): boolean {
    return this.movable.isInitialEntry;
  }

  public set isInitialEntry(value: boolean) {
    this.movable.isInitialEntry = value;
  }

  public get row(): number {
    return this.movable.row;
  }

  public get col(): number {
    return this.movable.col;
  }

  public set row(value: number) {
    this.movable.row = value;
  }

  public set col(value: number) {
    this.movable.col = value;
  }

  /**
   * Gets safe row and column indices to prevent accessing undefined values
   * @returns Object with safe row and column indices
   */
  protected getSafeIndices(): { row: number; col: number } {
    // One read, not two: `dimension` is a getter, and several traces compute
    // it with a scan over every row. Nothing between the two comparisons can
    // change the answer.
    const { rows, cols } = this.dimension;
    const safeRow = this.row >= 0 && this.row < rows ? this.row : 0;
    const safeCol = this.col >= 0 && this.col < cols ? this.col : 0;
    return { row: safeRow, col: safeCol };
  }

  /**
   * Registers an observer to receive state updates.
   * @param observer - The observer to add
   */
  public addObserver(observer: Observer<State>): void {
    this.observers.push(observer);
  }

  /**
   * Removes an observer from receiving state updates.
   * @param observer - The observer to remove
   */
  public removeObserver(observer: Observer<State>): void {
    const index = this.observers.indexOf(observer);
    if (index !== -1) {
      this.observers.splice(index, 1);
    }
  }

  /**
   * Notifies all registered observers with the current state.
   */
  public notifyStateUpdate(): void {
    if (this.isComputingStateAt) {
      throw new Error(
        'notifyStateUpdate() fired during getStateAt(): state getters must stay side-effect free',
      );
    }
    if (this.isSilent) {
      return;
    }
    const currentState = this.state;
    this.observers.forEach(observer => observer.update(currentState));
  }

  /**
   * Notifies observers that an out-of-bounds condition occurred.
   */
  public notifyOutOfBounds(): void {
    if (this.isSilent) {
      return;
    }
    const outOfBoundsState = this.outOfBoundsState;
    this.observers.forEach(observer => observer.update(outOfBoundsState));
  }

  public moveOnce(direction: MovableDirection): boolean {
    const isMoved = this.movable.moveOnce(direction);
    if (isMoved) {
      this.notifyStateUpdate();
    } else {
      this.notifyOutOfBounds();
    }
    return isMoved;
  }

  public moveToExtreme(direction: MovableDirection): boolean {
    const isMoved = this.movable.moveToExtreme(direction);
    if (isMoved) {
      this.notifyStateUpdate();
    } else {
      this.notifyOutOfBounds();
    }
    return isMoved;
  }

  public moveToIndex(row: number, col: number): boolean {
    const isMoved = this.movable.moveToIndex(row, col);
    if (isMoved) {
      this.notifyStateUpdate();
    } else {
      this.notifyOutOfBounds();
    }
    return isMoved;
  }

  public isMovable(target: [number, number] | MovableDirection): boolean {
    return this.movable.isMovable(target);
  }

  public abstract get state(): State;

  protected abstract get outOfBoundsState(): State;

  protected abstract get movable(): Movable;

  public notifyObserversWithState(state: State): void {
    for (const observer of this.observers) {
      observer.update(state);
    }
  }

  /**
   * Base implementation of navigation in HIGHER and LOWER modes of ROTOR, default is no-op
   * Needs to be implemented in Line, Bar, Heatmap, Candlestick
   */
  public moveToNextCompareValue(
    _direction: 'left' | 'right' | 'up' | 'down',
    _type: 'lower' | 'higher',
  ): boolean {
    // no-op
    this.notifyRotorBounds();
    return false;
  }

  /**
   *
   * @param a Utility function to compare point values for rotor functionality
   * @param b
   * @param type
   * @returns boolean value
   */
  public compare(a: number, b: number, type: 'lower' | 'higher'): boolean {
    if (type === 'lower') {
      return a < b;
    }
    if (type === 'higher') {
      return a > b;
    }
    return false;
  }

  /**
   * Rotor compare search along one row of numeric values.
   *
   * Steps from the current column in the given direction and moves to the
   * first value that satisfies the comparison; reports the rotor boundary
   * when nothing further qualifies. For the traces whose values are a plain
   * numeric grid indexed [row][col]; a trace with a richer layout (the bar's
   * orientation-normalised rows, the candlestick's segments) keeps its own.
   *
   * @param rowValues - The values of the row being searched
   * @param direction - Which way to search
   * @param type - Whether a lower or a higher value is sought
   * @returns True when a matching value was found and moved to
   */
  protected compareSearchAlongRow(
    rowValues: readonly number[],
    direction: 'left' | 'right',
    type: 'lower' | 'higher',
  ): boolean {
    // Establish the entry position on the first move so the compare jump
    // highlights and a subsequent ordinary keypress isn't swallowed by the
    // initial-entry branch of moveOnce.
    if (this.isInitialEntry) {
      this.isInitialEntry = false;
    }

    const current = this.col;
    const step = direction === 'right' ? 1 : -1;
    for (let i = current + step; i >= 0 && i < rowValues.length; i += step) {
      if (this.compare(rowValues[i], rowValues[current], type)) {
        this.col = i;
        this.notifyStateUpdate();
        return true;
      }
    }
    this.notifyRotorBounds();
    return false;
  }

  /**
   * Override left, right, upward and downward navigation functionality in rotor
   */
  /**
   * Moves up in rotor mode, optionally filtering by lower or higher values.
   * @param _mode - Optional mode for filtering (lower or higher)
   * @throws Error always - subclasses must override this method
   */
  public moveUpRotor(_mode?: 'lower' | 'higher'): boolean {
    throw new Error('Move up function is not defined for this trace');
  }

  /**
   * Moves down in rotor mode, optionally filtering by lower or higher values.
   * @param _mode - Optional mode for filtering (lower or higher)
   * @throws Error always - subclasses must override this method
   */
  public moveDownRotor(_mode?: 'lower' | 'higher'): boolean {
    throw new Error('Move down function is not defined for this trace');
  }

  /**
   * Moves left in rotor mode, optionally filtering by lower or higher values.
   * @param _mode - Optional mode for filtering (lower or higher)
   * @throws Error always - subclasses must override this method
   */
  public moveLeftRotor(_mode?: 'lower' | 'higher'): boolean {
    throw new Error('Move left function is not defined for this trace');
  }

  /**
   * Moves right in rotor mode, optionally filtering by lower or higher values.
   * @param _mode - Optional mode for filtering (lower or higher)
   * @throws Error always - subclasses must override this method
   */
  public moveRightRotor(_mode?: 'lower' | 'higher'): boolean {
    throw new Error('Move right function is not defined for this trace');
  }

  /**
   * Returns true if this trace supports compare (lower/higher value) navigation.
   * Override to false for trace types that don't use compare modes (e.g., scatter, which is all we
   * currently have).
   */
  public supportsCompareMode(): boolean {
    return true;
  }

  /**
   * Returns the display name for the default data navigation mode.
   * Override to provide a trace-specific name (e.g., "ROW AND COLUMN NAVIGATION" for scatter).
   */
  public dataModeName(): string {
    return Constant.DATA_MODE;
  }

  /**
   * Returns the rotor's compare-mode labels and boundary-message nouns.
   * Override to rename the two compare units for a trace-specific semantic
   * (e.g., the candlestick delta layer uses "above line" / "below line").
   */
  public compareModeInfo(): CompareModeInfo {
    return {
      lower: { label: Constant.LOWER_VALUE_MODE, noun: 'lower value' },
      higher: { label: Constant.HIGHER_VALUE_MODE, noun: 'higher value' },
    };
  }

  /**
   * Moves the active point to the (x, y) pointer location and returns
   * directional guidance toward the nearest data geometry.
   *
   * Combines navigation and guidance into a single call so traces compute
   * `findNearestPoint` only once per pointer event. Default returns null
   * for non-trace contexts.
   *
   * @param _x - Screen-space x position of the pointer/finger
   * @param _y - Screen-space y position of the pointer/finger
   * @returns Guidance state, or null when unavailable
   */
  public moveToPointAndGetPointerGuidance(
    _x: number,
    _y: number,
  ): PointerGuidanceState | null {
    return null;
  }
}

export abstract class AbstractTrace extends AbstractPlot<TraceState> implements Trace {
  protected readonly id: string;
  protected readonly type: TraceType;
  protected readonly title: string;
  /** What this layer is, when the producer named it. See `MaidrLayer.name`. */
  protected readonly name: string | undefined;

  protected readonly xAxis: string;
  protected readonly yAxis: string;
  protected readonly z: string;

  protected readonly layer: MaidrLayer;

  protected constructor(layer: MaidrLayer) {
    super();
    this.layer = layer;
    this.id = layer.id;
    this.type = layer.type;
    this.title = layer.title ?? DEFAULT_SUBPLOT_TITLE;
    // Undefined rather than defaulted: the announcement falls back to naming
    // the trace type, which is the better answer for a figure whose layers
    // differ in kind, and a default here would replace it with a placeholder.
    this.name = layer.name?.trim() || undefined;

    this.xAxis = named(layer.axes?.x?.label, DEFAULT_X_AXIS);
    this.yAxis = named(layer.axes?.y?.label, DEFAULT_Y_AXIS);
    this.z = named(layer.axes?.z?.label, DEFAULT_Z_AXIS);
  }

  /**
   * Cleans up trace resources including values and highlighted SVG elements.
   *
   * Only removes elements MAIDR created (hidden clones, synthetic markers);
   * traces that highlight the chart's original live elements in place (e.g.
   * heatmap cells, line dots) merely drop their references so the visible
   * chart geometry survives focusout and live-data rebuilds.
   */
  public override dispose(): void {
    if (this.highlightValues) {
      this.highlightValues.forEach(row =>
        row.forEach((el) => {
          const elements = Array.isArray(el) ? el : el ? [el] : [];
          elements.forEach((element) => {
            if (Svg.isOwned(element)) {
              element.remove();
            }
          });
        }),
      );
      this.highlightValues.length = 0;
    }

    super.dispose();
  }

  /**
   * Whether the cursor has no point to report.
   *
   * Read from {@link dimension} rather than from any one trace's data,
   * because that is the one shape every trace already answers in. It is also
   * evaluated *at the cursor* — `LineTrace` returns the current series'
   * length as `cols` — so this covers a ragged layer, where one series has
   * points and another has none, and not only a layer that is empty
   * throughout.
   *
   * @returns True when there is nothing at `(row, col)` to describe
   */
  protected get isEmptyAtCursor(): boolean {
    const { rows, cols } = this.dimension;
    return rows <= 0 || cols <= 0;
  }

  /**
   * Gets the current state of the trace including audio, braille, text, and highlight information.
   * @returns The current TraceState
   */
  public get state(): TraceState {
    if (this.isWarning) {
      return {
        empty: true,
        type: 'trace',
        traceType: this.type,
        audio: {
          y: this.row,
          x: this.col,
          rows: this.dimension.rows,
          cols: this.dimension.cols,
        },
        warning: true,
      };
    }
    // Answer "nothing here" rather than describing a point that does not
    // exist. Every populated branch below reaches `points[row][col]` through
    // one accessor or another -- `LineTrace.text` reads `point.z`,
    // `BarTrace`'s reads `point.x` -- and none of them guards the point
    // itself, so an empty series threw a TypeError. That throw leaves trace
    // construction, propagates out of `new Figure(...)`, and takes the whole
    // render with it, so one malformed layer silences a figure that is
    // otherwise fine (#905).
    //
    // Guarded here rather than in each accessor because this is the single
    // funnel they are all reached through, and because a producer can always
    // emit an empty series -- the core cannot assume otherwise.
    if (this.isEmptyAtCursor) {
      return this.outOfBoundsState;
    }
    return {
      empty: false,
      type: 'trace',
      layerId: this.id,
      traceType: this.type,
      plotType: this.type, // Default to traceType for other plot types
      title: this.title,
      name: this.name,
      xAxis: this.xAxis,
      yAxis: this.yAxis,
      z: this.z,
      hasMultiPoints: this.hasMultiPoints,
      audio: this.audio,
      braille: this.braille,
      text: this.text,
      autoplay: this.autoplay,
      highlight: this.highlight,
      // The effective orientation, not the declared one: a trace type that has
      // an orientation is navigated as vertical when the JSON omits it, and
      // the announcement has to say so rather than stay silent.
      orientation: resolveOrientation(this.type, this.layer.orientation),
    };
  }

  /**
   * The state pushed to observers when navigation leaves the data.
   *
   * Declared as `TraceEmptyState` rather than the whole `TraceState` union
   * because that is what every implementation actually returns — the accessor
   * exists so {@link AbstractPlot.notifyOutOfBounds} has an empty state to
   * push. Narrowing it here is what lets the braille and highlight callers
   * hand the value straight on: those states accept the empty trace shape but
   * not a populated one, so a wider declaration would force each of them to
   * cast, and a cast is exactly what stops the compiler from noticing if an
   * override ever starts returning a populated state.
   * @returns The empty trace state, positioned for out-of-bounds audio panning.
   */
  protected get outOfBoundsState(): TraceEmptyState {
    return {
      empty: true,
      type: 'trace',
      traceType: this.type,
      audio: {
        y: this.row,
        x: this.col,
        rows: this.dimension.rows,
        cols: this.dimension.cols,
      },
    };
  }

  protected get highlight(): HighlightState {
    if (this.highlightValues === null || this.isInitialEntry) {
      return this.outOfBoundsState;
    }

    // A grid position the chart drew no element at reports the same nothing
    // an out-of-bounds cursor does, rather than an undefined element the
    // highlight service would then try to outline.
    const elements = this.highlightValues[this.row]?.[this.col];
    if (!elements) {
      return this.outOfBoundsState;
    }

    return { empty: false, elements };
  }

  /**
   * Get all highlight SVG elements for this trace
   * Used by HighlightService for high contrast mode
   * @returns Array of all SVG elements, or empty array if none
   */
  public getAllHighlightElements(): SVGElement[] {
    if (this.highlightValues === null) {
      return [];
    }

    const elements: SVGElement[] = [];
    for (const row of this.highlightValues) {
      for (const cell of row) {
        if (Array.isArray(cell)) {
          elements.push(...cell);
        } else if (cell) {
          elements.push(cell);
        }
      }
    }
    return elements;
  }

  /**
   * Get all original (visible) SVG elements for this trace.
   * These are the actual rendered elements, not the hidden clones used for highlighting.
   * Used by HighlightService for high contrast mode color changes.
   * @returns Array of all original SVG elements, or empty array if none
   */
  public getAllOriginalElements(): SVGElement[] {
    if (this.highlightValues === null) {
      return [];
    }

    const elements: SVGElement[] = [];
    for (const row of this.highlightValues) {
      for (const cell of row) {
        const cellElements = Array.isArray(cell) ? cell : cell ? [cell] : [];
        for (const element of cellElements) {
          // Live chart geometry held for in-place highlighting -- a heatmap
          // cell, a box part, a bar addressed by its own selector -- IS the
          // original. Its previous sibling is the neighbouring mark, and
          // reading that shifts the whole list by one: the last mark goes
          // missing and whatever precedes the first is styled as data.
          // Ownership is the signal `dispose()` already uses to tell a
          // MAIDR-made clone from the chart's own element.
          if (!Svg.isOwned(element)) {
            elements.push(element);
            continue;
          }

          // The original element is the previous sibling of the hidden clone
          const original = element.previousElementSibling as SVGElement | null;

          // Verify this is actually the paired original element:
          // - Must exist
          // - Must be the same element type (e.g., both are <path>)
          // - Must NOT be hidden (the clone is hidden, original is visible)
          if (
            original
            && original.tagName === element.tagName
            && original.getAttribute('visibility') !== 'hidden'
          ) {
            elements.push(original);
          }
        }
      }
    }
    return elements;
  }

  protected getAudioGroupIndex(): { groupIndex?: number } {
    // Default implementation checks if there are multiple groups/lines
    // Uses this.values.length > 1 as the condition and this.row as the groupIndex
    // Subclasses can override this method if they need different logic
    if (this.values && this.values.length > 1) {
      return { groupIndex: this.row };
    }
    return {};
  }

  protected get autoplay(): AutoplayState {
    // One read for all four limits. `dimension` is a getter -- GanttTrace,
    // HexbinTrace, RidgelineTrace and BoxenTrace each reduce over every row to
    // compute it, and ScatterTrace re-runs its mode branching -- and this runs
    // inside every state computation, so asking four times was three full row
    // scans per keypress for an answer that cannot change between them.
    const { rows, cols } = this.dimension;
    return {
      UPWARD: rows,
      DOWNWARD: rows,
      FORWARD: cols,
      BACKWARD: cols,
    };
  }

  /**
   * Computes the trace state at an arbitrary position without moving the
   * user's cursor or notifying observers. Used by monitor mode to sonify
   * and announce a newly appended point while the user stays put.
   *
   * The state getters read `this.row`/`this.col` internally, so the cursor
   * is moved temporarily and always restored in a finally block — this
   * method is the single owner of that pattern.
   *
   * Re-entrancy hazard: this is only safe because the entire call chain is
   * synchronous (no await points), so timers (e.g. autoplay ticks) cannot
   * interleave before the finally-restore, and state getters never notify
   * observers. If a getter ever becomes async or triggers notifications,
   * callers could observe the temporary cursor.
   *
   * @param row - The row of the position to compute state for
   * @param col - The column of the position to compute state for
   * @returns The trace state at the requested position
   */
  public getStateAt(row: number, col: number): TraceState {
    const previous = {
      row: this.row,
      col: this.col,
      isInitialEntry: this.isInitialEntry,
    };
    this.isComputingStateAt = true;
    try {
      this.isInitialEntry = false;
      this.row = row;
      this.col = col;
      return this.state;
    } finally {
      this.isComputingStateAt = false;
      this.row = previous.row;
      this.col = previous.col;
      this.isInitialEntry = previous.isInitialEntry;
    }
  }

  public resetToInitialEntry(): void {
    this.isInitialEntry = true;
    this.row = 0;
    this.col = 0;
  }

  protected get hasMultiPoints(): boolean {
    return false;
  }

  protected abstract get audio(): AudioState;

  protected abstract get braille(): BrailleState;

  protected abstract get text(): TextState;

  public abstract get description(): DescriptionState;

  /**
   * Returns a human-readable label for this trace's chart type
   * (e.g., 'Bar Chart', 'Scatter Plot') for display in the description modal.
   * Falls back to the raw layer type if no mapping is registered.
   */
  protected getChartTypeLabel(): string {
    return chartTypeLabel(this.layer.type);
  }

  /**
   * How this layer names itself in the description dialog's layer tabs.
   *
   * The producer's `name` when there is one, and the chart-type label
   * otherwise — the same fallback order `TextService.layerIdentity` uses for
   * the spoken layer-switch announcement, so a tab and the announcement single
   * out the same layer by the same name. The two differ only in register: the
   * announcement says "point plot" where the dialog says "Scatter Plot",
   * because that written form is what the dialog's own Chart Type line has
   * always shown and a tab sitting above it should agree with it.
   */
  public get layerLabel(): string {
    return this.name ?? this.getChartTypeLabel();
  }

  /**
   * Which way this chart is drawn, or undefined for a type that has no
   * orientation to speak of.
   *
   * Entering the chart already announces it -- "This is a maidr plot of type:
   * horizontal bar" -- but the description dialog said only "Chart Type: Bar
   * Chart", and for the box, violin and boxen families the orientation also
   * silently reverses the order of the rows in the table underneath, because
   * their constructors reverse the groups when the chart is horizontal. A
   * reader comparing the table with what they walked had no way to know why
   * the two disagreed.
   *
   * Exposed here, and read once by the description service, rather than pushed
   * as a stat by each of the thirty-odd traces that has one. Named apart from
   * the bar and distribution families' own `orientation` fields, which hold the
   * declared* value and default it to vertical for every type -- including the
   * ones that have no orientation at all.
   *
   * @returns `horizontal` or `vertical`, or undefined when the type has no
   * orientation to report.
   */
  public get orientationLabel(): string | undefined {
    return resolveOrientation(this.type, this.layer.orientation);
  }

  /**
   * Builds the axes object for the description state, carrying only the axes
   * the layer actually authored a label for. Subclasses should call this
   * instead of constructing the axes object inline so charts without a real
   * z dimension don't surface the placeholder default.
   *
   * Every axis is gated, not just z. `xAxis` and `yAxis` fall back to the
   * literal `'X'` and `'Y'` when the JSON authors no label -- legal, and
   * common in adapter-generated specs -- and the dialog rendered that as
   * "X: X", a line that says nothing twice. The figure-level branch of the
   * description already showed only authored labels
   * ({@link DescriptionService.getFigureAxes}), so gating here is what makes
   * the two levels of the same dialog follow one rule.
   *
   * Blankness is tested with `trim()`, the same rule {@link named} applies
   * when it decides whether to substitute the fallback in the first place. A
   * whitespace-only z label is truthy but blank, so the untrimmed guard used
   * to pass it through and then print the `'Level'` placeholder the guard
   * existed to keep out.
   */
  protected getDescriptionAxes(): DescriptionState['axes'] {
    return {
      ...(this.layer.axes?.x?.label?.trim() && { x: this.xAxis }),
      ...(this.layer.axes?.y?.label?.trim() && { y: this.yAxis }),
      ...(this.layer.axes?.z?.label?.trim() && { z: this.z }),
    };
  }

  protected abstract override get dimension(): Dimension;

  /**
   * `highlightValues[row][col]`, or `null` for the whole trace when it
   * highlights nothing.
   *
   * A single cell may also be `null`, meaning the chart drew no element
   * there. That is a narrower claim than the trace-wide `null`: the rest of
   * the grid still highlights, and only this position falls back to the
   * out-of-bounds state. A Google Charts calendar is the case it exists for
   * -- its first and last columns are ragged, so a handful of grid positions
   * have no rect at all while every other day does (#1174).
   */
  protected abstract get highlightValues():
    | (SVGElement[] | SVGElement | null)[][]
    | null;

  /**
   * Get available extrema targets for the current navigation context
   * @returns Array of extrema targets that can be navigated to
   * Default implementation returns empty array (no extrema support)
   */
  public getExtremaTargets(): ExtremaTarget[] {
    return []; // Default: no extrema support
  }

  /**
   * Base implementation for navigateToExtrema
   * Subclasses must override to provide actual implementation
   * @param _target The extrema target to navigate to
   */
  public navigateToExtrema(_target: ExtremaTarget): void {
    if (this.supportsExtrema) {
      throw new Error('Extrema navigation not implemented by this plot type');
    }
    // No-op if extrema navigation is not supported
  }

  /**
   * Common post-navigation cleanup that should be called by subclasses
   * after they update their internal state
   */
  protected finalizeNavigation(): void {
    // Ensure we're not in initial entry state after navigation
    if (this.isInitialEntry) {
      this.isInitialEntry = false;
    }

    // Update visual positioning
    this.updateVisualPointPosition();

    // Notify observers of state change
    this.notifyStateUpdate();
  }

  /**
   * Returns true if this trace supports intersection navigation mode.
   * Opt-in per trace type: override to return true (possibly conditionally,
   * e.g. based on data shape) for trace types that expose point intersections
   * between series. Intersection navigation is a trace-level capability — it
   * has no meaning at the figure or subplot level, which is why it lives on
   * AbstractTrace rather than AbstractPlot.
   */
  public supportsIntersectionMode(): boolean {
    return false;
  }

  /**
   * Returns true if this trace supports point-by-point navigation mode.
   * Opt-in per trace type: override to return true for traces that expose
   * individual data points navigable in reading order (left/right) and
   * column-major order (up/down). Currently only ScatterTrace.
   */
  public supportsPointMode(): boolean {
    return false;
  }

  /**
   * Move to the next point intersection (right arrow in intersection rotor mode).
   * Default is a no-op returning false; subclasses that advertise
   * {@link supportsIntersectionMode} must override to provide real behavior.
   */
  public moveToNextIntersection(): boolean {
    return false;
  }

  /**
   * Move to the previous point intersection (left arrow in intersection rotor mode).
   * Default is a no-op returning false; subclasses that advertise
   * {@link supportsIntersectionMode} must override to provide real behavior.
   */
  public moveToPrevIntersection(): boolean {
    return false;
  }

  /**
   * Notifies the trace that the rotor is entering or leaving INTERSECTION_MODE.
   * Default is a no-op; line-style traces don't need to track mode state
   * because their state output is unchanged by the rotor mode. Traces whose
   * audio/text output differs in intersection mode (e.g. ScatterTrace, which
   * normally plays the whole x-column as a chord and must instead focus a
   * single point) override this to flip an internal flag.
   * @param _enabled True when entering intersection mode, false when leaving.
   */
  public setIntersectionMode(_enabled: boolean): void {
    // Default no-op
  }

  /**
   * Trace-specific rotor filter units appended to the rotor cycle after the
   * built-in data/compare/grid/intersection modes. Each unit restricts
   * navigation to points matching a predicate (e.g. only bullish candles).
   * Default: none. Override to opt in (e.g. {@link Candlestick} exposes
   * bullish/bearish/neutral units). The returned list is treated as
   * read-only by the rotor service.
   */
  public getRotorFilterUnits(): readonly RotorFilterUnit[] {
    return [];
  }

  /**
   * Moves within an active rotor filter unit along the filtered axis.
   *
   * Called by {@link RotorNavigationService} when the current rotor mode is
   * one of this trace's {@link getRotorFilterUnits}. Filter units navigate a
   * single axis, so only `left`/`right` are dispatched here — the service
   * announces `up`/`down` as unavailable without calling the model (matching
   * intersection mode). Implementations should move to the nearest point
   * matching the unit identified by `key` and notify observers, returning
   * true; when no such point exists they should call {@link notifyRotorBounds}
   * and return false.
   *
   * Default is a no-op that reports bounds, so a trace advertising a filter
   * unit but forgetting to implement movement fails safe (announces "no
   * point found") rather than moving unexpectedly.
   * @param _key - The {@link RotorFilterUnit.key} of the active unit
   * @param _direction - The direction to search
   * @returns True if the cursor moved, false otherwise
   */
  public moveToRotorFilter(
    _key: string,
    _direction: 'left' | 'right',
  ): boolean {
    this.notifyRotorBounds();
    return false;
  }

  /**
   * Default implementation for updating visual point position
   * Subclasses can override if they need custom positioning logic
   */
  protected updateVisualPointPosition(): void {
    // Default implementation - subclasses should override if needed
  }

  /**
   * Checks if this plot supports extrema navigation.
   * @returns True if extrema navigation is supported
   */
  public supportsExtremaNavigation(): boolean {
    return this.supportsExtrema;
  }
  protected abstract get values(): (Element | number | number[])[][];

  /**
   * Abstract property that subclasses must implement to indicate extrema support
   */
  protected abstract readonly supportsExtrema: boolean;

  /**
   * Base implementation for getting current X value
   * Subclasses can override if they have different data structures
   */
  public getCurrentXValue(): XValue | null {
    // Handle traces with points array (BarTrace, LineTrace)
    if (this.hasPointsArray()) {
      const points = this.getPointsArray();
      if (this.isValidPointsArray(points)) {
        return extractXValueFromPoints(
          points,
          this.row,
          this.col,
        );
      }
    }

    // Handle traces with values array (generic fallback)
    if (this.hasValuesArray()) {
      const values = this.values;
      if (this.isValidValuesArray(values)) {
        return extractXValueFromValues(
          values as any,
          this.row,
          this.col,
        );
      }
    }

    return null;
  }

  /**
   * Moves to a specific X value in the trace.
   * @param xValue - The X value to navigate to
   * @returns True if the move was successful, false otherwise
   */
  public moveToXValue(xValue: XValue): boolean {
    // Handle traces with points array (BarTrace, LineTrace)
    if (this.hasPointsArray()) {
      const points = this.getPointsArray();
      if (this.isValidPointsArray(points)) {
        return moveToXValueInPoints(
          points,
          xValue,
          this.moveToIndex.bind(this),
          this.row,
        );
      }
    }

    // Handle traces with values array (generic fallback)
    if (this.hasValuesArray()) {
      const values = this.values;
      if (this.isValidValuesArray(values)) {
        return moveToXValueInValues(
          values as any,
          xValue,
          this.moveToIndex.bind(this),
        );
      }
    }

    return false;
  }

  /**
   * Type guard to check if trace has points array.
   * @returns True if points array exists
   */
  private hasPointsArray(): boolean {
    return 'points' in this && this.points !== undefined;
  }

  /**
   * Type guard to check if trace has values array.
   * @returns True if values array exists
   */
  private hasValuesArray(): boolean {
    return 'values' in this && this.values !== undefined;
  }

  /**
   * Safely gets the points array with proper typing.
   * @returns The points array
   */
  private getPointsArray(): any[] {
    return (this as any).points;
  }

  /**
   * Validates points array structure.
   * @param points - The points array to validate
   * @returns True if valid, false otherwise
   */
  private isValidPointsArray(points: any[]): boolean {
    return Array.isArray(points) && points.length > 0;
  }

  /**
   * Validates values array structure.
   * @param values - The values array to validate
   * @returns True if valid, false otherwise
   */
  private isValidValuesArray(values: any[][]): boolean {
    return Array.isArray(values) && values.length > 0;
  }

  /**
   * Gets the unique identifier for this trace.
   * @returns The trace ID
   */
  public getId(): string {
    return this.id;
  }

  /**
   * The trace's chart type. Lightweight alternative to reading
   * `state.traceType`, which eagerly computes the full audio/braille/text/
   * highlight state just to expose this one string.
   */
  public get traceType(): TraceType {
    return this.type;
  }

  /** @see Trace.level */
  public get level(): 'trace' {
    return 'trace';
  }

  protected abstract findNearestPoint(
    x: number,
    y: number,
  ): NearestPoint | null;

  /**
   * Moves the active point to the pointer location and returns directional
   * guidance toward the nearest data geometry in a single call.
   *
   * Combining both operations avoids running `findNearestPoint` twice per
   * `pointermove` event — important on dense plots where the scan is the
   * hot path.
   *
   * @param x - Screen-space x position of the pointer/finger
   * @param y - Screen-space y position of the pointer/finger
   * @returns Guidance state relative to nearest point, or null when unavailable
   */
  public override moveToPointAndGetPointerGuidance(
    x: number,
    y: number,
  ): PointerGuidanceState | null {
    const nearest = this.findNearestPoint(x, y);
    if (!nearest) {
      return null;
    }

    const onCurve = this.isPointInBounds(x, y, nearest);
    this.moveToNearest(x, y, nearest, onCurve);

    if (onCurve) {
      return { onCurve: true };
    }

    // Fields describe where the curve center sits relative to the cursor.
    // Screen-space: y grows downward, so a smaller y is higher on screen —
    // `y < centerY` puts the curve center below the cursor. The vertical
    // tie-break collapses to 'above'; at single-pixel precision the user
    // can't perceive the difference, and forcing strict inequality avoids
    // a third "centered" state that pitch mapping would need to handle.
    // Horizontally we DO distinguish ties: heatmap centers are computed
    // pixel integers users can hit exactly, and panning left at the moment
    // the cursor crosses centerX would be a misleading directional cue.
    return {
      onCurve: false,
      distancePx: Math.hypot(nearest.centerX - x, nearest.centerY - y),
      curveVertical: y < nearest.centerY ? 'below' : 'above',
      curveHorizontal: x === nearest.centerX
        ? 'center'
        : x < nearest.centerX ? 'right' : 'left',
    };
  }

  /**
   * Moves the trace to the nearest point when the pointer is within its
   * bounds and the trace is not already focused on that point.
   *
   * `onCurve` is intentionally non-optional: the caller has already paid
   * the cost of {@link isPointInBounds} to assemble guidance state, and
   * forcing subclasses to accept the value makes the contract explicit so a
   * future override cannot silently recompute (or worse, ignore) it.
   *
   * Subclasses override this to customise hover-driven navigation:
   * - Box / ViolinBox no-op the move while still surfacing guidance.
   * - Scatter switches into column navigation mode before delegating.
   */
  protected moveToNearest(
    _x: number,
    _y: number,
    nearest: NearestPoint,
    onCurve: boolean,
  ): void {
    if (!onCurve) {
      return;
    }
    // A fresh trace parks its cursor on (0, 0) with nothing announced and the
    // highlight withheld, so pointing at that first mark is an entry rather
    // than a repeat: it has to move, notify and clear the entry flag exactly
    // as the first arrow key does.
    if (!this.isInitialEntry && this.row === nearest.row && this.col === nearest.col) {
      return;
    }
    this.moveToIndex(nearest.row, nearest.col);
  }

  /**
   * Checks if the specified coordinates are within bounds of the element.
   * @param x - The x-coordinate
   * @param y - The y-coordinate
   * @param element - Object containing the SVG element and its position
   * @param element.element - The SVG element to check bounds against
   * @param element.row - The row position of the element
   * @param element.col - The column position of the element
   * @returns True if the point is in bounds, false otherwise
   */
  public isPointInBounds(
    x: number,
    y: number,
    {
      element,
      row: _row,
      col: _col,
    }: NearestPoint,
  ): boolean {
    // check if x y is within r distance of the bounding box of the element
    const bbox = element.getBoundingClientRect();
    let r: number = 12;
    // if plot type is heatmap bar stacked or histogram, use 0
    if (
      this.type === TraceType.HEATMAP
      || this.type === TraceType.BAR
      || this.type === TraceType.STACKED
      || this.type === TraceType.HISTOGRAM
    ) {
      r = 0;
    }
    const isInbounds
      = x >= bbox.x - r
        && x <= bbox.x + bbox.width + r
        && y >= bbox.y - r
        && y <= bbox.y + bbox.height + r;
    return isInbounds;
  }
}
