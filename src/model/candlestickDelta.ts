import type { ExtremaTarget } from '@type/extrema';
import type { CandlestickTrend, MaidrLayer } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { XValue } from '@type/navigation';
import type {
  AudioState,
  BrailleState,
  DescriptionState,
  TextState,
  TraceState,
} from '@type/state';
import type { CompareModeInfo, Dimension, NearestPoint, RotorFilterUnit } from './abstract';
import { AbstractTrace } from './abstract';
import { MovableGrid } from './movable';

/** OHLC fields a user can compare against a reference line. */
export type CandlestickDeltaField = 'open' | 'high' | 'low' | 'close';

export const CANDLESTICK_DELTA_FIELDS: readonly CandlestickDeltaField[] = [
  'open',
  'high',
  'low',
  'close',
];

/** Rotor unit for browsing only the points above the reference line. */
export const ABOVE_LINE_MODE = 'ABOVE LINE NAVIGATION';
/** Rotor unit for browsing only the points below the reference line. */
export const BELOW_LINE_MODE = 'BELOW LINE NAVIGATION';
/** Rotor unit for jumping between points exactly on the reference line. */
export const ON_LINE_MODE = 'ON LINE NAVIGATION';
/** Default rotor unit for the delta layer. */
export const DELTA_POINT_MODE = 'DELTA POINT NAVIGATION';

/** Stable {@link RotorFilterUnit.key} for the on-line filter. */
const ON_LINE_KEY = 'onLine';

const ABOVE_LINE = 'above line';
const BELOW_LINE = 'below line';
const ON_LINE = 'on line';

/**
 * One matched candle of the virtual delta layer: the shared x value, the
 * reference line value at x, and the candle's four OHLC values. Signed deltas
 * (`fieldValue - reference`) are derived per field inside the trace so the
 * user can navigate open/high/low/close and have the delta recomputed.
 */
export interface CandlestickDeltaCandle {
  /** Shared x value (e.g., date) present in both the candles and the line. */
  x: string;
  /** The reference line value at x. */
  reference: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Configuration captured when the delta layer is activated. */
export interface CandlestickDeltaConfig {
  candles: CandlestickDeltaCandle[];
  referenceLabel: string;
  /** OHLC field the cursor lands on when the layer activates (default close). */
  initialField?: CandlestickDeltaField;
}

/**
 * Rounds a delta to suppress binary floating-point noise (e.g.
 * 0.30000000000000004) so exactly-on-the-line points compare equal to zero.
 *
 * Float noise scales with operand magnitude, so a fixed absolute grid is
 * wrong at both extremes: a fixed `raw * 1e9` round overflows
 * Number.MAX_SAFE_INTEGER for large-priced instruments (e.g. crypto quoted
 * above ~9e6, where the round loses all precision), and a 1e-9 absolute grid
 * over-suppresses genuine tiny deltas on small-priced ones. Instead, snap to
 * zero with a tolerance relative to the operand magnitude — values that agree
 * to ~9 significant figures (typical financial display precision) are treated
 * as "on the line" — then round survivors to 9 significant figures.
 *
 * @param raw - The raw difference between the OHLC value and the reference
 * @param magnitude - The larger operand magnitude, used to scale the tolerance
 *   (defaults to 0, which floors the tolerance at an absolute 1e-9)
 * @returns The cleaned delta
 */
export function roundDelta(raw: number, magnitude: number = 0): number {
  const tolerance = Math.max(Math.abs(magnitude), 1) * 1e-9;
  if (Math.abs(raw) <= tolerance) {
    return 0;
  }
  return Number(raw.toPrecision(9));
}

/**
 * Derives the trend for a signed delta: above the line is bullish, below is
 * bearish, exactly on the line is neutral.
 * @param delta - The signed delta value
 * @returns The corresponding candlestick trend
 */
export function deltaTrend(delta: number): CandlestickTrend {
  if (delta > 0) {
    return 'Bull';
  }
  if (delta < 0) {
    return 'Bear';
  }
  return 'Neutral';
}

/**
 * Signed delta between a candle's field value and the reference at the same x,
 * with float noise suppressed relative to the operand magnitude.
 */
function fieldDelta(fieldValue: number, reference: number): number {
  return roundDelta(
    fieldValue - reference,
    Math.max(Math.abs(fieldValue), Math.abs(reference)),
  );
}

/**
 * Virtual (invisible) trace comparing a candlestick chart against a reference
 * line (e.g. a moving average) from the same subplot.
 *
 * Like a real candlestick, the user navigates left/right between candles and
 * up/down between the four OHLC fields (value-sorted per candle, matching the
 * candle's visual geometry). Each point exposes the signed delta
 * `fieldValue - reference` through the standard BTS pipeline:
 * - Audio: pitch encodes |delta|; the tone glides up for above-line points and
 *   down for below-line points; an exact zero plays a percussive click.
 * - Braille: candlestick-style height encoding of |delta| for the current
 *   field where below-line points carry the bearish dot-8 marker.
 * - Text: "above line" / "below line" / "on line" with the delta magnitude.
 *
 * The layer has no SVG geometry of its own, so it never highlights, and it
 * deliberately omits the volatility section a real candlestick exposes.
 */
export class CandlestickDeltaTrace extends AbstractTrace {
  protected readonly supportsExtrema = true;
  protected readonly movable: Movable;
  protected readonly highlightValues: (SVGElement[] | SVGElement)[][] | null
    = null;

  private readonly candles: CandlestickDeltaCandle[];
  private readonly referenceLabel: string;
  private readonly initialField: CandlestickDeltaField;

  /** Signed deltas per field, indexed [field][candle]. */
  private readonly deltaByField: Record<CandlestickDeltaField, number[]>;
  /** |delta| per field — the braille height source, cached for stable identity. */
  private readonly absDeltaByField: Record<CandlestickDeltaField, number[]>;
  /** Braille `values` wrappers ([absDelta row]) per field, cached for identity. */
  private readonly brailleValuesByField: Record<CandlestickDeltaField, number[][]>;
  /** Per-field trend arrays — the braille dot-8 source, cached for identity. */
  private readonly trendByField: Record<CandlestickDeltaField, CandlestickTrend[]>;
  /** Per-field braille max ([maxAbs]) arrays, cached for identity. */
  private readonly brailleMaxByField: Record<CandlestickDeltaField, number[]>;
  private readonly brailleMin: number[] = [0];

  /** OHLC fields sorted ascending by value for each candle (low..high). */
  private readonly sortedFieldsByPoint: CandlestickDeltaField[][];
  /** Static-order signed delta grid (fields x candles); backs the movable. */
  private readonly deltaGrid: number[][];
  /** Largest |delta| across every field — audio's shared pitch ceiling. */
  private readonly maxAbsDelta: number;
  /** Cached on-line rotor unit; always offered (see getRotorFilterUnits). */
  private readonly onLineUnits: readonly RotorFilterUnit[] = [
    { key: ON_LINE_KEY, label: ON_LINE_MODE, noun: 'point on the line' },
  ];

  private currentPointIndex = 0;
  private currentField: CandlestickDeltaField;

  public constructor(layer: MaidrLayer, config: CandlestickDeltaConfig) {
    super(layer);

    this.candles = config.candles;
    this.referenceLabel = config.referenceLabel;
    this.initialField = config.initialField ?? 'close';
    this.currentField = this.initialField;

    const byField = (
      build: (field: CandlestickDeltaField) => number[],
    ): Record<CandlestickDeltaField, number[]> => ({
      open: build('open'),
      high: build('high'),
      low: build('low'),
      close: build('close'),
    });

    this.deltaByField = byField(field =>
      this.candles.map(candle => fieldDelta(candle[field], candle.reference)),
    );
    this.absDeltaByField = byField(field =>
      this.deltaByField[field].map(Math.abs),
    );
    this.brailleValuesByField = {
      open: [this.absDeltaByField.open],
      high: [this.absDeltaByField.high],
      low: [this.absDeltaByField.low],
      close: [this.absDeltaByField.close],
    };
    this.trendByField = {
      open: this.deltaByField.open.map(deltaTrend),
      high: this.deltaByField.high.map(deltaTrend),
      low: this.deltaByField.low.map(deltaTrend),
      close: this.deltaByField.close.map(deltaTrend),
    };
    this.brailleMaxByField = {
      open: [maxOf(this.absDeltaByField.open)],
      high: [maxOf(this.absDeltaByField.high)],
      low: [maxOf(this.absDeltaByField.low)],
      close: [maxOf(this.absDeltaByField.close)],
    };

    this.maxAbsDelta = CANDLESTICK_DELTA_FIELDS.reduce(
      (max, field) => Math.max(max, this.brailleMaxByField[field][0]),
      0,
    );
    this.sortedFieldsByPoint = this.candles.map((candle) => {
      // Sort by the candle's price so up/down matches the candle geometry
      // (low at the bottom, high at the top); a stable tiebreak keeps the
      // order deterministic when two OHLC values coincide.
      return [...CANDLESTICK_DELTA_FIELDS].sort((a, b) => {
        const diff = candle[a] - candle[b];
        return diff !== 0
          ? diff
          : CANDLESTICK_DELTA_FIELDS.indexOf(a) - CANDLESTICK_DELTA_FIELDS.indexOf(b);
      });
    });

    this.deltaGrid = CANDLESTICK_DELTA_FIELDS.map(field =>
      this.deltaByField[field],
    );
    this.movable = new MovableGrid<number>(this.deltaGrid);
  }

  public dispose(): void {
    this.candles.length = 0;
    super.dispose();
  }

  protected get values(): number[][] {
    return this.deltaGrid;
  }

  protected get dimension(): Dimension {
    return { rows: CANDLESTICK_DELTA_FIELDS.length, cols: this.candles.length };
  }

  /** The OHLC field the cursor is currently comparing. */
  public get comparedField(): CandlestickDeltaField {
    return this.currentField;
  }

  /** Human-readable name of the reference line this layer compares against. */
  public get reference(): string {
    return this.referenceLabel;
  }

  /** Number of matched (candle, reference) points in this layer. */
  public get size(): number {
    return this.candles.length;
  }

  /** Signed delta of the current field at the current candle. */
  private get currentDelta(): number {
    return this.deltaByField[this.currentField][this.currentPointIndex] ?? 0;
  }

  /**
   * Syncs the movable's row/col to the current field/candle. Row is the
   * field's value-sorted position (0 = lowest .. 3 = highest), matching the
   * candlestick's segment layout; col is the candle index.
   */
  private updateVisualPosition(): void {
    const navOrder = this.sortedFieldsByPoint[this.currentPointIndex];
    this.row = Math.max(0, navOrder.indexOf(this.currentField));
    this.col = this.currentPointIndex;
  }

  private handleInitialEntry(): void {
    this.isInitialEntry = false;
    this.currentPointIndex = Math.max(
      0,
      Math.min(this.currentPointIndex, this.candles.length - 1),
    );
    this.currentField = this.initialField;
    this.updateVisualPosition();
  }

  /**
   * Moves the cursor to a candle index without notifying observers. Used on
   * activation to align the delta layer with the candle the user was on while
   * preserving the x position across on/off toggles.
   * @param index - The candle index to position the cursor at
   */
  public setInitialPosition(index: number): void {
    if (index < 0 || index >= this.candles.length) {
      return;
    }
    this.isInitialEntry = false;
    this.currentPointIndex = index;
    this.currentField = this.initialField;
    this.updateVisualPosition();
  }

  public override moveOnce(direction: MovableDirection): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.notifyStateUpdate();
      return true;
    }

    switch (direction) {
      case 'UPWARD':
      case 'DOWNWARD': {
        const navOrder = this.sortedFieldsByPoint[this.currentPointIndex];
        const pos = navOrder.indexOf(this.currentField);
        const newPos = direction === 'UPWARD' ? pos + 1 : pos - 1;
        if (newPos < 0 || newPos >= navOrder.length) {
          this.notifyOutOfBounds();
          return false;
        }
        this.currentField = navOrder[newPos];
        this.updateVisualPosition();
        break;
      }
      case 'FORWARD':
      case 'BACKWARD': {
        const newIndex
          = direction === 'FORWARD'
            ? this.currentPointIndex + 1
            : this.currentPointIndex - 1;
        if (newIndex < 0 || newIndex >= this.candles.length) {
          this.notifyOutOfBounds();
          return false;
        }
        this.currentPointIndex = newIndex;
        this.updateVisualPosition();
        break;
      }
    }

    this.notifyStateUpdate();
    return true;
  }

  public override moveToExtreme(direction: MovableDirection): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    const navOrder = this.sortedFieldsByPoint[this.currentPointIndex];
    switch (direction) {
      case 'UPWARD':
        this.currentField = navOrder[navOrder.length - 1];
        break;
      case 'DOWNWARD':
        this.currentField = navOrder[0];
        break;
      case 'FORWARD':
        this.currentPointIndex = this.candles.length - 1;
        break;
      case 'BACKWARD':
        this.currentPointIndex = 0;
        break;
    }
    this.updateVisualPosition();
    this.notifyStateUpdate();
    return true;
  }

  public override isMovable(target: [number, number] | MovableDirection): boolean {
    if (Array.isArray(target)) {
      return super.isMovable(target);
    }
    if (this.isInitialEntry) {
      return true;
    }
    switch (target) {
      case 'UPWARD':
      case 'DOWNWARD': {
        const navOrder = this.sortedFieldsByPoint[this.currentPointIndex];
        const pos = navOrder.indexOf(this.currentField);
        const newPos = target === 'UPWARD' ? pos + 1 : pos - 1;
        return newPos >= 0 && newPos < navOrder.length;
      }
      case 'FORWARD':
      case 'BACKWARD': {
        const newIndex
          = target === 'FORWARD'
            ? this.currentPointIndex + 1
            : this.currentPointIndex - 1;
        return newIndex >= 0 && newIndex < this.candles.length;
      }
    }
  }

  public override moveToIndex(row: number, col: number): boolean {
    if (col < 0 || col >= this.candles.length) {
      this.notifyOutOfBounds();
      return false;
    }
    // Braille flattens the four OHLC fields into a single row for the current
    // field (see the braille getter — always row 0), so an incoming `row`
    // carries no field information. This is the layer's only index-navigation
    // source (it has no SVG geometry to hover), so preserve the compared field
    // and move along the candle axis only — matching how Left/Right (moveOnce)
    // behaves, rather than silently snapping to the candle's lowest field.
    void row;
    this.isInitialEntry = false;
    this.currentPointIndex = col;
    this.updateVisualPosition();
    this.notifyStateUpdate();
    return true;
  }

  public override getStateAt(row: number, col: number): TraceState {
    const previous = {
      pointIndex: this.currentPointIndex,
      field: this.currentField,
    };
    this.isComputingStateAt = true;
    try {
      const safeCol = col >= 0 && col < this.candles.length ? col : 0;
      const navOrder = this.sortedFieldsByPoint[safeCol];
      const safeRow = row >= 0 && row < navOrder.length ? row : 0;
      this.currentPointIndex = safeCol;
      this.currentField = navOrder[safeRow];
      return super.getStateAt(row, col);
    } finally {
      this.isComputingStateAt = false;
      this.currentPointIndex = previous.pointIndex;
      this.currentField = previous.field;
    }
  }

  protected get audio(): AudioState {
    const delta = this.currentDelta;
    const panning = {
      x: this.currentPointIndex,
      y: this.row,
      rows: CANDLESTICK_DELTA_FIELDS.length,
      cols: this.candles.length,
    };
    const freq = {
      min: 0,
      // Guard the all-zero-deltas case: raw is then always 0 and takes the
      // click path, but interpolate() must never see min === max.
      max: this.maxAbsDelta > 0 ? this.maxAbsDelta : 1,
      raw: Math.abs(delta),
    };

    if (delta === 0) {
      return { freq, panning, zeroClick: true };
    }
    // Above the line rises, below the line falls; pitch still encodes |delta|.
    return { freq, panning, glide: delta > 0 ? 'up' : 'down' };
  }

  protected get braille(): BrailleState {
    // Height encodes |delta| over [0, max |delta| for this field]; the custom
    // trends add the bearish dot-8 marker for below-line points (see
    // CandlestickBrailleEncoder). Must stay side-effect free and return stable
    // array references — the braille cache compares `values` by identity.
    return {
      empty: false,
      id: this.id,
      values: this.brailleValuesByField[this.currentField],
      min: this.brailleMin,
      max: this.brailleMaxByField[this.currentField],
      row: 0,
      col: this.currentPointIndex,
      custom: this.trendByField[this.currentField],
    };
  }

  protected get text(): TextState {
    const delta = this.currentDelta;
    const position
      = delta > 0 ? ABOVE_LINE : delta < 0 ? BELOW_LINE : ON_LINE;

    // Verbose: "Date is 2019-11-05, close delta is 1.25, position is above line"
    // Terse:   "2019-11-05, close 1.25, above line"
    return {
      main: { label: this.xAxis, value: this.candles[this.currentPointIndex].x },
      cross: { label: 'delta', value: Math.abs(delta) },
      section: this.currentField,
      z: { label: 'position', value: position },
      mainAxis: 'x',
      crossAxis: 'y',
    };
  }

  public get description(): DescriptionState {
    const field = this.currentField;
    const deltas = this.deltaByField[field];
    const aboveCount = deltas.filter(d => d > 0).length;
    const belowCount = deltas.filter(d => d < 0).length;
    const onLineCount = deltas.length - aboveCount - belowCount;
    const maxDelta = deltas.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY);
    const minDelta = deltas.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);

    const stats: DescriptionState['stats'] = [
      { label: 'Reference line', value: this.referenceLabel },
      { label: 'Compared value', value: field },
      { label: 'Number of points', value: this.candles.length },
      { label: 'Points above line', value: aboveCount },
      { label: 'Points below line', value: belowCount },
      { label: 'Points on line', value: onLineCount },
      { label: 'Delta range', value: `${minDelta} to ${maxDelta}` },
    ];

    const headers = [
      this.xAxis,
      field,
      this.referenceLabel,
      'Delta',
      'Position',
    ];
    const rows: (string | number)[][] = this.candles.map((candle, index) => [
      candle.x,
      candle[field],
      candle.reference,
      deltas[index],
      deltas[index] > 0 ? ABOVE_LINE : deltas[index] < 0 ? BELOW_LINE : ON_LINE,
    ]);

    return {
      chartType: this.getChartTypeLabel(),
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, rows },
    };
  }

  public override getCurrentXValue(): XValue | null {
    return this.candles[this.currentPointIndex]?.x ?? null;
  }

  public override moveToXValue(xValue: XValue): boolean {
    const index = this.candles.findIndex(candle => candle.x === xValue);
    if (index === -1) {
      return false;
    }
    this.isInitialEntry = false;
    this.currentPointIndex = index;
    this.updateVisualPosition();
    this.notifyStateUpdate();
    return true;
  }

  /**
   * Gets available X values for the Go To search combobox.
   * @returns Array of X values in candle order
   */
  public getAvailableXValues(): XValue[] {
    return this.candles.map(candle => candle.x);
  }

  public override getExtremaTargets(): ExtremaTarget[] {
    if (this.candles.length === 0) {
      return [];
    }

    const field = this.currentField;
    const deltas = this.deltaByField[field];
    const maxDelta = deltas.reduce((a, b) => Math.max(a, b));
    const minDelta = deltas.reduce((a, b) => Math.min(a, b));

    const targets: ExtremaTarget[] = [];
    deltas.forEach((delta, index) => {
      if (delta === maxDelta) {
        targets.push(this.buildExtremaTarget('max', index));
      }
    });
    deltas.forEach((delta, index) => {
      if (delta === minDelta) {
        targets.push(this.buildExtremaTarget('min', index));
      }
    });
    return targets;
  }

  private buildExtremaTarget(type: 'max' | 'min', index: number): ExtremaTarget {
    const candle = this.candles[index];
    return {
      label: `${type === 'max' ? 'Max' : 'Min'} Delta at ${candle.x}`,
      value: this.deltaByField[this.currentField][index],
      pointIndex: index,
      segment: this.currentField,
      type,
      navigationType: 'point',
      xValue: candle.x,
    };
  }

  public override navigateToExtrema(target: ExtremaTarget): void {
    if (target.pointIndex < 0 || target.pointIndex >= this.candles.length) {
      return;
    }
    this.isInitialEntry = false;
    this.currentPointIndex = target.pointIndex;
    if (CANDLESTICK_DELTA_FIELDS.includes(target.segment as CandlestickDeltaField)) {
      this.currentField = target.segment as CandlestickDeltaField;
    }
    this.updateVisualPosition();
    this.notifyStateUpdate();
  }

  public override dataModeName(): string {
    return DELTA_POINT_MODE;
  }

  public override compareModeInfo(): CompareModeInfo {
    // The rotor's two compare units become sign filters for this layer:
    // 'higher' walks points above the reference line, 'lower' below it.
    return {
      lower: { label: BELOW_LINE_MODE, noun: 'point below the line' },
      higher: { label: ABOVE_LINE_MODE, noun: 'point above the line' },
    };
  }

  public override moveToNextCompareValue(
    direction: 'left' | 'right' | 'up' | 'down',
    type: 'lower' | 'higher',
  ): boolean {
    if (direction !== 'left' && direction !== 'right') {
      this.notifyRotorBounds();
      return false;
    }

    // Establish the entry position on the first move so a compare jump made as
    // the very first action starts from a settled cursor, mirroring
    // Candlestick.moveToRotorFilter / moveOnce / moveToExtreme.
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    const deltas = this.deltaByField[this.currentField];
    const step = direction === 'right' ? 1 : -1;
    for (
      let i = this.currentPointIndex + step;
      i >= 0 && i < this.candles.length;
      i += step
    ) {
      const delta = deltas[i];
      if (type === 'higher' ? delta > 0 : delta < 0) {
        this.isInitialEntry = false;
        this.currentPointIndex = i;
        this.updateVisualPosition();
        this.notifyStateUpdate();
        return true;
      }
    }

    this.notifyRotorBounds();
    return false;
  }

  /**
   * Always exposes the "on line" rotor filter unit, completing the fixed
   * above-line / on-line / below-line trichotomy alongside the two compare
   * units. It is intentionally NOT gated on a zero being present: gating on
   * the current field made the unit flicker in and out as the user moved
   * between OHLC fields, and gating on any field would silently hide the
   * category for the (common) real-world case where no candle sits exactly on
   * a moving average. A present-but-empty unit announces "no point on the
   * line", which is the honest, predictable result — mirroring how the
   * above/below compare units are always offered even when empty.
   * @returns The on-line filter unit
   */
  public override getRotorFilterUnits(): readonly RotorFilterUnit[] {
    return this.onLineUnits;
  }

  /**
   * Jumps to the previous/next candle whose current-field delta is exactly
   * zero (on the reference line), preserving the current field. On-line
   * filtering runs along the candle axis; the rotor service handles up/down
   * (announcing them as unavailable) and dispatches only left/right here.
   * @param key - The active filter unit key
   * @param direction - The direction to search
   * @returns True if a matching candle was found and moved to
   */
  public override moveToRotorFilter(
    key: string,
    direction: 'left' | 'right',
  ): boolean {
    if (key !== ON_LINE_KEY) {
      this.notifyRotorBounds();
      return false;
    }

    // Settle the cursor if this filter jump is the user's first action, so the
    // search starts from the entry candle (mirrors Candlestick.moveToRotorFilter).
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    const deltas = this.deltaByField[this.currentField];
    const step = direction === 'right' ? 1 : -1;
    for (
      let i = this.currentPointIndex + step;
      i >= 0 && i < this.candles.length;
      i += step
    ) {
      if (deltas[i] === 0) {
        this.isInitialEntry = false;
        this.currentPointIndex = i;
        this.updateVisualPosition();
        this.notifyStateUpdate();
        return true;
      }
    }

    this.notifyRotorBounds();
    return false;
  }

  protected findNearestPoint(_x: number, _y: number): NearestPoint | null {
    // Virtual layer: no SVG geometry to hover.
    return null;
  }
}

/**
 * Max of a numeric array without the spread-argument RangeError that
 * `Math.max(...arr)` hits on very large arrays; returns 0 for an empty array.
 */
function maxOf(values: number[]): number {
  return values.reduce((max, value) => Math.max(max, value), 0);
}
