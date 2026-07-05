import type { ExtremaTarget } from '@type/extrema';
import type { CandlestickTrend, MaidrLayer } from '@type/grammar';
import type { Movable } from '@type/movable';
import type { XValue } from '@type/navigation';
import type {
  AudioState,
  BrailleState,
  DescriptionState,
  TextState,
} from '@type/state';
import type { CompareModeInfo, Dimension, NearestPoint } from './abstract';
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
/** Default rotor unit for the delta layer. */
export const DELTA_POINT_MODE = 'DELTA POINT NAVIGATION';

const ABOVE_LINE = 'above line';
const BELOW_LINE = 'below line';
const ON_LINE = 'on line';

/**
 * One point of the virtual delta layer: a candlestick OHLC value matched by
 * x value against a reference line point, with their signed difference.
 */
export interface CandlestickDeltaPoint {
  /** Shared x value (e.g., date) present in both the candles and the line. */
  x: string;
  /** The chosen OHLC value at x. */
  fieldValue: number;
  /** The reference line value at x. */
  reference: number;
  /** fieldValue - reference, rounded to suppress float noise. */
  delta: number;
  /** 'Bull' above the line, 'Bear' below, 'Neutral' exactly on it. */
  trend: CandlestickTrend;
}

/** Configuration captured when the user confirms the F7 dialog. */
export interface CandlestickDeltaConfig {
  points: CandlestickDeltaPoint[];
  field: CandlestickDeltaField;
  referenceLabel: string;
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
 * Virtual (invisible) trace comparing one OHLC field of a candlestick chart
 * against a reference line (e.g. a moving average) from the same subplot.
 *
 * Each point is `field value - reference value` at a shared x value, exposed
 * through the standard BTS pipeline:
 * - Audio: pitch encodes |delta|, stereo pan encodes x, and the bull/bear
 *   candlestick timbres encode direction; an exact zero plays a click.
 * - Braille: candlestick-style height encoding of |delta| where below-line
 *   points carry the bearish dot-8 marker.
 * - Text: "above line" / "below line" / "on line" with the delta magnitude.
 *
 * The layer has no SVG geometry of its own, so it never highlights.
 */
export class CandlestickDeltaTrace extends AbstractTrace {
  protected readonly supportsExtrema = true;
  protected readonly movable: Movable;
  protected readonly highlightValues: (SVGElement[] | SVGElement)[][] | null
    = null;

  private readonly deltaPoints: CandlestickDeltaPoint[];
  /** Signed deltas; single row (the layer is a 1 x N series). */
  private readonly deltaValues: number[][];
  /** |delta| per point — the braille height source, cached for stable identity. */
  private readonly absDeltaValues: number[][];
  private readonly trends: CandlestickTrend[];
  private readonly brailleMin: number[];
  private readonly brailleMax: number[];
  private readonly maxAbsDelta: number;

  private readonly field: CandlestickDeltaField;
  private readonly referenceLabel: string;

  public constructor(layer: MaidrLayer, config: CandlestickDeltaConfig) {
    super(layer);

    this.deltaPoints = config.points;
    this.field = config.field;
    this.referenceLabel = config.referenceLabel;

    this.deltaValues = [this.deltaPoints.map(point => point.delta)];
    this.absDeltaValues = [
      this.deltaPoints.map(point => Math.abs(point.delta)),
    ];
    this.trends = this.deltaPoints.map(point => point.trend);

    this.maxAbsDelta = this.absDeltaValues[0].reduce(
      (max, value) => Math.max(max, value),
      0,
    );
    this.brailleMin = [0];
    this.brailleMax = [this.maxAbsDelta];

    this.movable = new MovableGrid<number>(this.deltaValues);
  }

  public dispose(): void {
    this.deltaPoints.length = 0;
    this.deltaValues.length = 0;
    this.absDeltaValues.length = 0;
    this.trends.length = 0;
    super.dispose();
  }

  protected get values(): number[][] {
    return this.deltaValues;
  }

  protected get dimension(): Dimension {
    return { rows: 1, cols: this.deltaPoints.length };
  }

  /** The OHLC field this layer compares against the reference line. */
  public get comparedField(): CandlestickDeltaField {
    return this.field;
  }

  /** Human-readable name of the reference line this layer compares against. */
  public get reference(): string {
    return this.referenceLabel;
  }

  /** Number of matched (candle, reference) points in this layer. */
  public get size(): number {
    return this.deltaPoints.length;
  }

  /**
   * Moves the cursor to a point index without notifying observers. Used on
   * activation to align the delta layer with the candle the user was on.
   * @param index - The point index to position the cursor at
   */
  public setInitialPosition(index: number): void {
    if (index < 0 || index >= this.deltaPoints.length) {
      return;
    }
    this.isInitialEntry = false;
    this.row = 0;
    this.col = index;
  }

  protected get audio(): AudioState {
    const { col } = this.getSafeIndices();
    const point = this.deltaPoints[col];

    return {
      freq: {
        min: 0,
        // Guard the all-zero-deltas case: raw is then always 0 and takes the
        // click path, but interpolate() must never see min === max.
        max: this.maxAbsDelta > 0 ? this.maxAbsDelta : 1,
        raw: Math.abs(point.delta),
      },
      panning: {
        x: col,
        y: 0,
        rows: 1,
        cols: this.deltaPoints.length,
      },
      trend: point.trend,
      zeroClick: true,
    };
  }

  protected get braille(): BrailleState {
    // Height encodes |delta| over [0, max |delta|]; the custom trends add the
    // bearish dot-8 marker for below-line points (see CandlestickBrailleEncoder).
    // Must stay side-effect free and return stable array references — the
    // braille cache compares `values` by identity.
    return {
      empty: false,
      id: this.id,
      values: this.absDeltaValues,
      min: this.brailleMin,
      max: this.brailleMax,
      row: 0,
      col: this.getSafeIndices().col,
      custom: this.trends,
    };
  }

  protected get text(): TextState {
    const point = this.deltaPoints[this.getSafeIndices().col];
    const position
      = point.delta > 0 ? ABOVE_LINE : point.delta < 0 ? BELOW_LINE : ON_LINE;

    // Verbose: "Date is 2019-11-05, close delta is 1.25, position is above line"
    // Terse:   "2019-11-05, close 1.25, above line"
    return {
      main: { label: this.xAxis, value: point.x },
      cross: { label: 'delta', value: Math.abs(point.delta) },
      section: this.field,
      z: { label: 'position', value: position },
      mainAxis: 'x',
      crossAxis: 'y',
    };
  }

  public get description(): DescriptionState {
    const aboveCount = this.deltaPoints.filter(p => p.delta > 0).length;
    const belowCount = this.deltaPoints.filter(p => p.delta < 0).length;
    const onLineCount = this.deltaPoints.length - aboveCount - belowCount;
    const signedDeltas = this.deltaValues[0];
    const maxDelta = signedDeltas.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY);
    const minDelta = signedDeltas.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);

    const stats: DescriptionState['stats'] = [
      { label: 'Reference line', value: this.referenceLabel },
      { label: 'Compared value', value: this.field },
      { label: 'Number of points', value: this.deltaPoints.length },
      { label: 'Points above line', value: aboveCount },
      { label: 'Points below line', value: belowCount },
      { label: 'Points on line', value: onLineCount },
      { label: 'Delta range', value: `${minDelta} to ${maxDelta}` },
    ];

    const headers = [
      this.xAxis,
      this.field,
      this.referenceLabel,
      'Delta',
      'Position',
    ];
    const rows: (string | number)[][] = this.deltaPoints.map(point => [
      point.x,
      point.fieldValue,
      point.reference,
      point.delta,
      point.delta > 0 ? ABOVE_LINE : point.delta < 0 ? BELOW_LINE : ON_LINE,
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
    return this.deltaPoints[this.col]?.x ?? null;
  }

  public override moveToXValue(xValue: XValue): boolean {
    const index = this.deltaPoints.findIndex(point => point.x === xValue);
    if (index === -1) {
      return false;
    }
    return this.moveToIndex(0, index);
  }

  /**
   * Gets available X values for the Go To search combobox.
   * @returns Array of X values in point order
   */
  public getAvailableXValues(): XValue[] {
    return this.deltaPoints.map(point => point.x);
  }

  public override getExtremaTargets(): ExtremaTarget[] {
    if (this.deltaPoints.length === 0) {
      return [];
    }

    const signedDeltas = this.deltaValues[0];
    const maxDelta = signedDeltas.reduce((a, b) => Math.max(a, b));
    const minDelta = signedDeltas.reduce((a, b) => Math.min(a, b));

    const targets: ExtremaTarget[] = [];
    signedDeltas.forEach((delta, index) => {
      if (delta === maxDelta) {
        targets.push(this.buildExtremaTarget('max', index));
      }
    });
    signedDeltas.forEach((delta, index) => {
      if (delta === minDelta) {
        targets.push(this.buildExtremaTarget('min', index));
      }
    });
    return targets;
  }

  private buildExtremaTarget(type: 'max' | 'min', index: number): ExtremaTarget {
    const point = this.deltaPoints[index];
    return {
      label: `${type === 'max' ? 'Max' : 'Min'} Delta at ${point.x}`,
      value: point.delta,
      pointIndex: index,
      segment: this.field,
      type,
      navigationType: 'point',
      xValue: point.x,
    };
  }

  public override navigateToExtrema(target: ExtremaTarget): void {
    if (target.pointIndex < 0 || target.pointIndex >= this.deltaPoints.length) {
      return;
    }
    this.row = 0;
    this.col = target.pointIndex;
    this.finalizeNavigation();
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

    const step = direction === 'right' ? 1 : -1;
    for (
      let i = this.col + step;
      i >= 0 && i < this.deltaPoints.length;
      i += step
    ) {
      const delta = this.deltaPoints[i].delta;
      if (type === 'higher' ? delta > 0 : delta < 0) {
        this.isInitialEntry = false;
        this.row = 0;
        this.col = i;
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
