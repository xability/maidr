import type { Dimension } from '@model/abstract';
import type { ExtremaTarget } from '@type/extrema';
import type {
  CandlestickPoint,
  CandlestickSelector,
  CandlestickTrend,
  MaidrLayer,
} from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { AudioState, BrailleState, TextState } from '@type/state';
import { AbstractTrace } from '@model/abstract';
import { NavigationService } from '@service/navigation';
import { Orientation } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { MovableGrid } from './movable';

/**
 * Type alias for highlight elements - can be single elements or arrays of elements
 */
type HighlightValue = SVGElement | SVGElement[];

const TREND = 'trend';
const VOLATILITY_PRECISION_MULTIPLIER = 100;

/**
 * Segment types for candlestick data (open, high, low, close)
 */
type CandlestickSegmentType = 'open' | 'high' | 'low' | 'close';
const SECTIONS = ['volatility', 'open', 'high', 'low', 'close'] as const;

type CandlestickNavSegmentType = 'volatility' | CandlestickSegmentType;

export class Candlestick extends AbstractTrace {
  protected readonly supportsExtrema = true;
  protected readonly movable: Movable;

  private readonly candles: CandlestickPoint[];
  private readonly candleValues: number[][];

  private readonly orientation: Orientation;
  // Track navigation state separately from visual highlighting state
  private currentSegmentType: CandlestickNavSegmentType | null = 'open';
  private currentPointIndex: number = 0;

  // Performance optimization: Pre-computed lookup tables
  private readonly sortedSegmentsByPoint: CandlestickNavSegmentType[][];
  private readonly segmentPositionMaps: Map<
    CandlestickNavSegmentType,
    number
  >[];

  private readonly sections: typeof SECTIONS;

  private readonly min: number;
  private readonly max: number;

  protected readonly highlightValues: HighlightValue[][] | null;
  protected highlightCenters:
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null;

  // Service dependency for navigation logic
  protected readonly navigationService: NavigationService;

  /**
   * Creates a new Candlestick instance from a MAIDR layer
   * @param layer - The MAIDR layer containing candlestick data
   */
  constructor(layer: MaidrLayer) {
    super(layer);

    // Initialize navigation service
    this.navigationService = new NavigationService();

    const data = layer.data as CandlestickPoint[];
    this.candles = data.map(candle => ({
      ...candle,
      volatility:
        Math.round(
          (candle.high - candle.low) * VOLATILITY_PRECISION_MULTIPLIER,
        ) / VOLATILITY_PRECISION_MULTIPLIER,
      trend:
        candle.close > candle.open
          ? 'Bull'
          : candle.close < candle.open
            ? 'Bear'
            : 'Neutral',
    }));

    this.orientation = layer.orientation ?? Orientation.VERTICAL;
    this.sections = SECTIONS;

    this.candleValues = this.sections.map(key =>
      this.candles.map(c => c[key]),
    );
    const options = this.orientation === Orientation.HORIZONTAL
      ? { col: this.sections.length - 1 }
      : { row: this.sections.length - 1 };
    this.movable = new MovableGrid<number>(this.candleValues, options);

    this.min = MathUtil.minFrom2D(this.candleValues);
    this.max = MathUtil.maxFrom2D(this.candleValues);

    // Pre-compute sorted segments and position maps for performance
    this.sortedSegmentsByPoint = this.precomputeSortedSegments();
    this.segmentPositionMaps = this.precomputePositionMaps();

    // Initialize navigation state
    this.currentPointIndex = 0;
    this.currentSegmentType = 'close';

    // Initialize visual positioning for highlighting (keep original structure)
    if (this.orientation === Orientation.HORIZONTAL) {
      this.col = 0; // Points to 'open' segment index in sections array
    } else {
      this.row = 0; // Points to 'open' segment index in sections array
    }

    this.highlightValues = this.mapToSvgElements(
      layer.selectors as string | string[] | CandlestickSelector | undefined,
    );
    this.highlightCenters = this.mapSvgElementsToCenters();
  }

  /**
   * Pre-computes sorted segments for all candlestick points for O(1) lookup
   * @returns Array of sorted segment types for each candlestick point
   */
  private precomputeSortedSegments(): CandlestickNavSegmentType[][] {
    return this.candles.map((candle) => {
      // Always put 'volatility' first, then sort OHLC by value ascending
      const ohlcSegments: CandlestickSegmentType[] = [
        'low',
        'open',
        'close',
        'high',
      ];
      const sortedOhlc = ohlcSegments
        .map(seg => [seg, candle[seg]] as [CandlestickSegmentType, number])
        .sort((a, b) => a[1] - b[1])
        .map(pair => pair[0]);
      return ['volatility', ...sortedOhlc];
    });
  }

  /**
   * Pre-computes position maps for O(1) lookup of segment positions
   * @returns Array of position maps for each candlestick point
   */
  private precomputePositionMaps(): Map<CandlestickNavSegmentType, number>[] {
    return this.sortedSegmentsByPoint.map((sortedSegments) => {
      const positionMap = new Map<CandlestickNavSegmentType, number>();
      sortedSegments.forEach((segmentType, index) => {
        positionMap.set(segmentType, index);
      });
      return positionMap;
    });
  }

  /**
   * Gets the position index of a segment type in the sorted segments for a point (O(1) lookup)
   * @param pointIndex - Index of the candlestick point
   * @param segmentType - Type of segment to find
   * @returns Position index of the segment in sorted order
   */
  private getSegmentPositionInSortedOrder(
    pointIndex: number,
    segmentType: CandlestickNavSegmentType,
  ): number {
    return this.segmentPositionMaps[pointIndex].get(segmentType) ?? 0;
  }

  /**
   * Gets the segment type at a specific position in the sorted order for a point (O(1) lookup)
   * @param pointIndex - Index of the candlestick point
   * @param position - Position in the sorted order
   * @returns Segment type at the specified position
   */
  private getSegmentTypeAtSortedPosition(
    pointIndex: number,
    position: number,
  ): CandlestickNavSegmentType {
    const sortedSegments = this.sortedSegmentsByPoint[pointIndex];
    return sortedSegments[position] ?? 'open';
  }

  /**
   * Updates visual position for segment highlighting using dynamic value-sorted order
   */
  private updateVisualSegmentPosition(): void {
    // Use the sorted navigation order (with volatility first)
    const navOrder = this.sortedSegmentsByPoint[this.currentPointIndex];
    const dynamicSegmentPosition = navOrder.indexOf(
      this.currentSegmentType ?? 'open',
    );
    if (this.orientation === Orientation.HORIZONTAL) {
      this.col = dynamicSegmentPosition;
    } else {
      this.row = dynamicSegmentPosition;
    }
  }

  /**
   * Updates visual position for point highlighting and segment position
   */
  protected updateVisualPointPosition(): void {
    if (this.orientation === Orientation.HORIZONTAL) {
      this.row = this.currentPointIndex;
    } else {
      this.col = this.currentPointIndex;
    }

    // Also update segment position since candlestick needs both
    this.updateVisualSegmentPosition();
  }

  /**
   * Handles initial entry into the candlestick chart, setting default position
   */
  protected handleInitialEntry(): void {
    this.isInitialEntry = false;
    this.currentPointIndex = Math.max(
      0,
      Math.min(this.currentPointIndex, this.candles.length - 1),
    );
    // Always start at 'close' on initial entry
    this.currentSegmentType = 'close';
    this.updateVisualSegmentPosition();
  }

  /**
   * Moves navigation position one step in the specified direction
   * @param direction - Direction to move (UPWARD, DOWNWARD, FORWARD, BACKWARD)
   */
  public moveOnce(direction: MovableDirection): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.notifyStateUpdate();
      return true;
    }

    if (!this.isMovable(direction)) {
      this.notifyOutOfBounds();
      return false;
    }

    switch (direction) {
      case 'UPWARD':
      case 'DOWNWARD': {
        // Vertical movement: navigate between segments within the same candlestick (value-sorted)
        const navOrder = this.sortedSegmentsByPoint[this.currentPointIndex];
        const currentSegmentPosition = navOrder.indexOf(
          this.currentSegmentType ?? 'open',
        );
        if (currentSegmentPosition === -1) {
          this.notifyOutOfBounds();
          return false;
        }
        const newSegmentPosition
          = direction === 'UPWARD'
            ? currentSegmentPosition + 1
            : currentSegmentPosition - 1;
        if (newSegmentPosition >= 0 && newSegmentPosition < navOrder.length) {
          this.currentSegmentType = navOrder[newSegmentPosition];
          this.updateVisualSegmentPosition();
        } else {
          this.notifyOutOfBounds();
          return false;
        }
        break;
      }

      case 'FORWARD':
      case 'BACKWARD': {
        // Horizontal movement: navigate between candlesticks while preserving segment type
        const newPointIndex
          = direction === 'FORWARD'
            ? this.currentPointIndex + 1
            : this.currentPointIndex - 1;

        if (newPointIndex >= 0 && newPointIndex < this.candles.length) {
          this.currentPointIndex = newPointIndex;
          this.updateVisualPointPosition();
          this.updateVisualSegmentPosition();
        } else {
          this.notifyOutOfBounds();
          return false;
        }
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

    switch (direction) {
      case 'UPWARD': {
        // Move to the highest value segment in current candlestick
        const currentSorted
          = this.sortedSegmentsByPoint[this.currentPointIndex];
        this.currentSegmentType = currentSorted[currentSorted.length - 1];
        this.updateVisualSegmentPosition();
        break;
      }
      case 'DOWNWARD': {
        // Move to the lowest value segment in current candlestick
        const currentSortedDown
          = this.sortedSegmentsByPoint[this.currentPointIndex];
        this.currentSegmentType = currentSortedDown[0];
        this.updateVisualSegmentPosition();
        break;
      }
      case 'FORWARD': {
        // Move to the last candlestick (rightmost)
        this.currentPointIndex = this.candles.length - 1;
        this.updateVisualPointPosition();
        this.updateVisualSegmentPosition();
        break;
      }
      case 'BACKWARD': {
        // Move to the first candlestick (leftmost)
        this.currentPointIndex = 0;
        this.updateVisualPointPosition();
        this.updateVisualSegmentPosition();
        break;
      }
    }

    this.notifyStateUpdate();
    return true;
  }

  public moveToIndex(row: number, col: number): boolean {
    // Delegate navigation logic to service and only handle data state updates
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    // Use navigation service to compute the mapping
    const { pointIndex, segmentType }
      = this.navigationService.computeIndexAndSegment(
        row,
        col,
        this.orientation,
        this.sections,
      );

    // Update Core Model state
    this.currentPointIndex = pointIndex;
    this.currentSegmentType = segmentType;
    this.row = row;
    this.col = col;

    this.updateVisualSegmentPosition();
    this.updateVisualPointPosition();
    this.notifyStateUpdate();
    return true;
  }

  /**
   * Checks if movement to the target position or direction is possible
   * @param target - Target position array or movement direction
   * @returns True if movement is possible, false otherwise
   */
  public isMovable(target: [number, number] | MovableDirection): boolean {
    if (Array.isArray(target)) {
      // For direct position targeting, use parent logic
      return super.isMovable(target);
    }

    if (this.isInitialEntry) {
      return true;
    }

    switch (target) {
      case 'UPWARD':
      case 'DOWNWARD': {
        // Vertical movement: check if we can move between segments within the same candlestick
        const navOrder = this.sortedSegmentsByPoint[this.currentPointIndex];
        const currentSegmentPosition = navOrder.indexOf(
          this.currentSegmentType ?? 'open',
        );
        const newSegmentPosition
          = target === 'UPWARD'
            ? currentSegmentPosition + 1
            : currentSegmentPosition - 1;
        return newSegmentPosition >= 0 && newSegmentPosition < navOrder.length;
      }

      case 'FORWARD':
      case 'BACKWARD': {
        // Horizontal movement: check if we can move between candlesticks
        const newPointIndex
          = target === 'FORWARD'
            ? this.currentPointIndex + 1
            : this.currentPointIndex - 1;
        return newPointIndex >= 0 && newPointIndex < this.candles.length;
      }
    }
  }

  /**
   * Cleans up resources and disposes of the candlestick instance
   */
  public dispose(): void {
    this.navigationService.dispose();
    this.candles.length = 0;
    super.dispose();
  }

  /**
   * Gets the 2D array of candlestick values
   * @returns Array of candlestick values for all segments
   */
  protected get values(): number[][] {
    return this.candleValues;
  }

  protected get audio(): AudioState {
    let value: number;
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    if (this.currentSegmentType === 'volatility') {
      value = this.candles[this.currentPointIndex].volatility;
    } else if (this.currentSegmentType) {
      value = this.candles[this.currentPointIndex][this.currentSegmentType];
    } else {
      value = this.candles[this.currentPointIndex].open;
    }

    return {
      freq: {
        min: this.min,
        max: this.max,
        raw: value,
      },
      panning: {
        x: isHorizontal ? this.row : this.col,
        y: isHorizontal ? this.col : this.row,
        rows: isHorizontal ? this.candleValues.length : this.candleValues[this.row].length,
        cols: isHorizontal ? this.candleValues[this.row].length : this.candleValues.length,
      },
      trend: this.candles[this.currentPointIndex].trend,
    };
  }

  protected get braille(): BrailleState {
    // Return the braille state with the current candle values and segment type

    // get an array for bear or bull
    const bearOrBull = this.candles.map(candle => candle.trend);

    // Set row to the position in navigation order (volatility first, then value-sorted OHLC) for the current segment of the current candle
    const valueSortedRow = this.getSegmentPositionInSortedOrder(
      this.currentPointIndex,
      this.currentSegmentType ?? this.sections[0],
    );
    this.row = valueSortedRow;

    // Compute per-row min/max for all segments (including volatility)
    const perRowMin = this.candleValues.map(row => Math.min(...row));
    const perRowMax = this.candleValues.map(row => Math.max(...row));

    return {
      empty: false,
      id: this.id,
      values: this.candleValues, // includes volatility and OHLC
      min: perRowMin,
      max: perRowMax,
      row: this.row,
      col: this.col,
      custom: bearOrBull,
    };
  }

  /**
   * Collects SVG elements matching the provided selectors
   * @param selector - CSS selector(s) to match elements
   * @returns Array of matched SVG elements
   */
  private collectElements(selector?: string | string[]): SVGElement[] {
    if (!selector)
      return [];
    const selectorArray = Array.isArray(selector) ? selector : [selector];
    const elements: SVGElement[] = [];
    for (const sel of selectorArray) {
      elements.push(...Svg.selectAllElements(sel));
    }
    return elements;
  }

  /**
   * Gets an element at the specified index from an array, or null if out of bounds
   * @param array - Array of SVG elements
   * @param index - Index to retrieve
   * @returns SVG element at index or null
   */
  private getElementAt(array: SVGElement[], index: number): SVGElement | null {
    return index < array.length ? array[index] : null;
  }

  /**
   * Maps candlestick selectors to 2D array of SVG elements for highlighting
   * @param selectors - CSS selectors or structured candlestick selectors
   * @returns 2D array of SVG elements or null if no selectors provided
   */
  protected mapToSvgElements(
    selectors: string | string[] | CandlestickSelector | undefined,
  ): HighlightValue[][] | null {
    if (!selectors) {
      return null;
    }

    // Legacy: a single selector for all elements
    if (typeof selectors === 'string' || Array.isArray(selectors)) {
      const selectorString = Array.isArray(selectors)
        ? selectors[0] || ''
        : selectors;
      const allElements = Svg.selectAllElements(selectorString);

      const segmentElements: HighlightValue[][] = [];
      for (let pos = 0; pos < this.sections.length; pos++) {
        segmentElements[pos] = [];
        for (
          let pointIndex = 0;
          pointIndex < this.candles.length;
          pointIndex++
        ) {
          const elementIndex = pointIndex < allElements.length ? pointIndex : 0;
          segmentElements[pos][pointIndex] = allElements[elementIndex];
        }
      }
      return segmentElements;
    }

    // Structured selectors
    const cs = selectors as CandlestickSelector;
    const N = this.candles.length;

    const bodies = this.collectElements(cs.body);
    let highs = this.collectElements(cs.wickHigh);
    let lows = this.collectElements(cs.wickLow);
    // Fallback to a single combined wick if provided
    if (highs.length === 0 || lows.length === 0) {
      const combined = this.collectElements(cs.wick);
      if (combined.length > 0) {
        if (highs.length === 0)
          highs = combined;
        if (lows.length === 0)
          lows = combined;
      }
    }
    const opens = this.collectElements(cs.open);
    const closes = this.collectElements(cs.close);
    // Volatility will be composed from [wickHigh, body, wickLow]; no direct selectors used

    const derivedOpen: SVGElement[] = Array.from({ length: N }, () =>
      Svg.createEmptyElement());
    const derivedClose: SVGElement[] = Array.from({ length: N }, () =>
      Svg.createEmptyElement());
    const derivedVolatility: SVGElement[] = Array.from({ length: N }, () =>
      Svg.createEmptyElement());

    for (let i = 0; i < N; i++) {
      // Open (explicit otherwise derive from body using data)
      let openEl = this.getElementAt(opens, i);
      if (!openEl) {
        const body = this.getElementAt(bodies, i);
        if (body) {
          const { open, close } = this.candles[i];
          const edge: 'top' | 'bottom'
            = close > open ? 'bottom' : close < open ? 'top' : 'bottom';
          openEl = Svg.createLineElement(body, edge);
        } else {
          openEl = Svg.createEmptyElement();
        }
      }
      derivedOpen[i] = openEl;

      // Close (explicit otherwise derive from body using data)
      let closeEl = this.getElementAt(closes, i);
      if (!closeEl) {
        const body = this.getElementAt(bodies, i);
        if (body) {
          const { open, close } = this.candles[i];
          const edge: 'top' | 'bottom'
            = close > open ? 'top' : close < open ? 'bottom' : 'top';
          closeEl = Svg.createLineElement(body, edge);
        } else {
          closeEl = Svg.createEmptyElement();
        }
      }
      derivedClose[i] = closeEl;

      // Volatility: composed later as [high, body, low]; no single element here
      derivedVolatility[i] = Svg.createEmptyElement();
    }

    // Build 2D array in value-sorted navigation order per point
    const segmentElements: HighlightValue[][] = Array.from(
      { length: this.sections.length },
      () => Array.from({ length: N }, () => Svg.createEmptyElement()),
    );

    for (let pointIndex = 0; pointIndex < N; pointIndex++) {
      const navOrder = this.sortedSegmentsByPoint[pointIndex]; // ['volatility', ...sorted OHLC]
      for (let pos = 0; pos < navOrder.length; pos++) {
        const seg = navOrder[pos];
        let el: HighlightValue;
        switch (seg) {
          case 'volatility':
            {
              const parts: SVGElement[] = [];
              const body = this.getElementAt(bodies, pointIndex);
              const hi = this.getElementAt(highs, pointIndex) ?? body;
              const lo = this.getElementAt(lows, pointIndex) ?? body;
              if (hi)
                parts.push(hi);
              if (body)
                parts.push(body);
              if (lo)
                parts.push(lo);
              const unique = Array.from(new Set(parts));
              el = unique.length > 0 ? unique : [Svg.createEmptyElement()];
            }
            break;
          case 'open':
            el = derivedOpen[pointIndex];
            break;
          case 'close':
            el = derivedClose[pointIndex];
            break;
          case 'high':
            el
              = this.getElementAt(highs, pointIndex)
              ?? this.getElementAt(bodies, pointIndex)
              ?? Svg.createEmptyElement();
            break;
          case 'low':
            el
              = this.getElementAt(lows, pointIndex)
              ?? this.getElementAt(bodies, pointIndex)
              ?? Svg.createEmptyElement();
            break;
          default:
            el = Svg.createEmptyElement();
        }
        segmentElements[pos][pointIndex] = el;
      }
    }

    return segmentElements;
  }

  protected get text(): TextState {
    const point = this.candles[this.currentPointIndex];
    let crossValue: number;
    if (this.currentSegmentType === 'volatility') {
      crossValue = point.volatility;
    } else if (this.currentSegmentType) {
      crossValue = point[this.currentSegmentType];
    } else {
      crossValue = point.open;
    }

    return {
      main: {
        label:
          this.orientation === Orientation.HORIZONTAL ? this.yAxis : this.xAxis,
        value: point.value,
      },
      cross: {
        label:
          this.orientation === Orientation.HORIZONTAL ? this.xAxis : this.yAxis,
        value: crossValue,
      },
      section: this.currentSegmentType ?? 'open',
      fill: { label: TREND, value: point.trend },
    };
  }

  /**
   * Gets the current candlestick trend for audio palette selection
   * @returns The trend of the current candlestick point
   */
  public getCurrentTrend(): CandlestickTrend {
    return this.candles[this.currentPointIndex].trend;
  }

  /**
   * Gets the current X value from the candlestick trace
   * @returns The current X value or null if not available
   */
  public getCurrentXValue(): XValue | null {
    if (
      this.currentPointIndex >= 0
      && this.currentPointIndex < this.candles.length
    ) {
      return this.candles[this.currentPointIndex].value;
    }
    return null;
  }

  /**
   * Moves the candlestick to the position that matches the given X value
   * @param xValue - The X value to move to
   * @returns True if the position was found and set, false otherwise
   */
  public moveToXValue(xValue: XValue): boolean {
    const targetIndex = this.candles.findIndex(
      candle => candle.value === xValue,
    );
    if (targetIndex !== -1) {
      this.currentPointIndex = targetIndex;
      this.currentSegmentType = 'close'; // Default to close segment
      this.updateVisualPointPosition();
      this.updateVisualSegmentPosition();
      this.notifyStateUpdate();
      return true;
    }
    return false;
  }

  /**
   * Gets available X values for navigation
   * @returns Array of X values
   */
  public getAvailableXValues(): XValue[] {
    return this.candles.map(candle => candle.value);
  }

  /**
   * Gets extrema targets for the current candlestick trace with labels and descriptions
   * @returns Array of extrema targets for navigation
   */
  public getExtremaTargets(): ExtremaTarget[] {
    const targets: ExtremaTarget[] = [];
    const currentSegment = this.currentSegmentType ?? 'open';

    // Only add extrema for the current segment
    if (currentSegment === 'volatility') {
      // For volatility, find all max and min values (there could be multiple)
      const volatilityValues = this.candles.map((c, index) => ({
        value: c.volatility,
        index,
      }));
      // Find all maximum values (there could be multiple candles with the same max volatility)
      const maxVolatility = Math.max(...volatilityValues.map(v => v.value));
      const maxVolatilityIndices = volatilityValues
        .filter(v => v.value === maxVolatility)
        .map(v => v.index);

      // Find all minimum values
      const minVolatility = Math.min(...volatilityValues.map(v => v.value));
      const minVolatilityIndices = volatilityValues
        .filter(v => v.value === minVolatility)
        .map(v => v.index);

      // Add all max volatility targets
      maxVolatilityIndices.forEach((index, _count) => {
        const candle = this.candles[index];
        targets.push({
          label: `Max Volatility at ${candle.value}`,
          value: candle.volatility,
          pointIndex: index,
          segment: 'volatility',
          type: 'max',
          navigationType: 'point',
        });
      });

      // Add all min volatility targets
      minVolatilityIndices.forEach((index, _count) => {
        const candle = this.candles[index];
        targets.push({
          label: `Min Volatility at ${candle.value}`,
          value: candle.volatility,
          pointIndex: index,
          segment: 'volatility',
          type: 'min',
          navigationType: 'point',
        });
      });
    } else {
      // For OHLC segments, find all min and max values
      const segmentValues = this.candles.map((c, index) => ({
        value: c[currentSegment],
        index,
        xValue: c.value,
      }));
      // Find all maximum values
      const maxValue = Math.max(...segmentValues.map(v => v.value));
      const maxIndices = segmentValues
        .filter(v => v.value === maxValue)
        .map(v => v.index);

      // Find all minimum values
      const minValue = Math.min(...segmentValues.map(v => v.value));
      const minIndices = segmentValues
        .filter(v => v.value === minValue)
        .map(v => v.index);

      // Add all max targets
      maxIndices.forEach((index, _count) => {
        const candle = this.candles[index];
        const segmentLabel
          = currentSegment.charAt(0).toUpperCase() + currentSegment.slice(1);
        targets.push({
          label: `Max ${segmentLabel} at ${candle.value}`,
          value: candle[currentSegment],
          pointIndex: index,
          segment: currentSegment,
          type: 'max',
          navigationType: 'point',
        });
      });

      // Add all min targets
      minIndices.forEach((index, _count) => {
        const candle = this.candles[index];
        const segmentLabel
          = currentSegment.charAt(0).toUpperCase() + currentSegment.slice(1);
        targets.push({
          label: `Min ${segmentLabel} at ${candle.value}`,
          value: candle[currentSegment],
          pointIndex: index,
          segment: currentSegment,
          type: 'min',
          navigationType: 'point',
        });
      });
    }

    return targets;
  }

  /**
   * Navigates to a specific extrema target
   * @param target - The extrema target to navigate to
   */
  public navigateToExtrema(target: ExtremaTarget): void {
    // Update the current point index
    this.currentPointIndex = target.pointIndex;

    // Update the current segment type
    this.currentSegmentType = target.segment as CandlestickNavSegmentType;

    // Use common finalization method
    this.finalizeExtremaNavigation();
  }

  /**
   * Moves to the next value in the specified direction that matches the comparison type
   * @param direction - Direction to search (left or right)
   * @param type - Comparison type (lower or higher)
   * @returns True if a matching value was found and moved to
   */
  public moveToNextCompareValue(direction: 'left' | 'right', type: 'lower' | 'higher'): boolean {
    const currentGroup = this.row;
    if (currentGroup < 0 || currentGroup >= this.candles.length) {
      return false;
    }
    const currentSegment = this.currentSegmentType ?? 'open';

    const segmentValues = this.candles.map((c, index) => ({
      value: c[currentSegment],
      index,
      xValue: c.value,
    }));

    const currentIndex = this.col;
    const step = direction === 'right' ? 1 : -1;
    let i = currentIndex + step;
    while (i >= 0 && i < segmentValues.length) {
      if (this.compare(segmentValues[i].value, segmentValues[currentIndex].value, type)) {
        this.col = i;
        this.currentPointIndex = i;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        return true;
      }
      i += step;
    }
    this.notifyRotorBounds();
    return false;
  }

  /**
   * Moves upward between segments within a candle in rotor mode
   * @returns True if the move was successful
   */
  public moveUpRotor(): boolean {
    this.moveOnce('UPWARD');
    return true;
  }

  /**
   * Moves downward between segments within a candle in rotor mode
   * @returns True if the move was successful
   */
  public moveDownRotor(): boolean {
    this.moveOnce('DOWNWARD');
    return true;
  }

  /**
   * Maps SVG elements to their center coordinates for click navigation
   * @returns Array of center coordinates with row/col indices or null
   */
  protected mapSvgElementsToCenters():
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null {
    const svgElements: (SVGElement | SVGElement[])[][] | null = this.highlightValues;

    if (!svgElements) {
      return null;
    }

    const centers: {
      x: number;
      y: number;
      row: number;
      col: number;
      element: SVGElement;
    }[] = [];
    for (let row = 0; row < svgElements.length; row++) {
      for (let col = 0; col < svgElements[row].length; col++) {
        const element = svgElements[row][col];
        const targetElement = Array.isArray(element) ? element[0] : element;
        if (targetElement) {
          const bbox = targetElement.getBoundingClientRect();
          centers.push({
            x: bbox.x + bbox.width / 2,
            y: bbox.y + bbox.height / 2,
            row,
            col,
            element: targetElement,
          });
        }
      }
    }

    return centers;
  }

  /**
   * Finds the nearest candlestick point to the given coordinates
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Nearest point information or null
   */
  public findNearestPoint(
    x: number,
    y: number,
  ): { element: SVGElement; row: number; col: number } | null {
    // loop through highlightCenters to find nearest point
    if (!this.highlightCenters) {
      return null;
    }

    let nearestDistance = Infinity;
    let nearestIndex = -1;

    for (let i = 0; i < this.highlightCenters.length; i++) {
      const center = this.highlightCenters[i];
      const distance = Math.hypot(center.x - x, center.y - y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    if (nearestIndex === -1) {
      return null;
    }

    return {
      element: this.highlightCenters[nearestIndex].element,
      row: this.highlightCenters[nearestIndex].row,
      col: this.highlightCenters[nearestIndex].col,
    };
  }

  protected get dimension(): Dimension {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    return {
      rows: isHorizontal ? this.candleValues.length : this.candleValues[this.row].length,
      cols: isHorizontal ? this.candleValues[this.row].length : this.candleValues.length,
    };
  }
}
