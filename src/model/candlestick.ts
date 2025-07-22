import type { CandlestickPoint, CandlestickTrend, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { AudioState, BrailleState, TextState } from '@type/state';
import { AbstractTrace } from '@model/abstract';
import { NavigationService } from '@service/navigation';
import { Orientation } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';

const TREND = 'Trend';

type CandlestickSegmentType = 'open' | 'high' | 'low' | 'close';
type CandlestickNavSegmentType = 'volatility' | CandlestickSegmentType;

export class Candlestick extends AbstractTrace<number> {
  private readonly candles: CandlestickPoint[];
  private readonly candleValues: number[][];

  private readonly orientation: Orientation;
  private readonly sections = ['volatility', 'open', 'high', 'low', 'close'] as const;

  // Track navigation state separately from visual highlighting state
  private currentSegmentType: CandlestickNavSegmentType | null = 'open';
  private currentPointIndex: number = 0;

  // Performance optimization: Pre-computed lookup tables
  private readonly sortedSegmentsByPoint: CandlestickNavSegmentType[][];
  private readonly segmentPositionMaps: Map<CandlestickNavSegmentType, number>[];

  private readonly min: number;
  private readonly max: number;

  protected readonly highlightValues: SVGElement[][] | null;

  // Service dependency for navigation logic
  protected readonly navigationService: NavigationService;


  constructor(layer: MaidrLayer) {
    super(layer);

    // Initialize navigation service
    this.navigationService = new NavigationService();

    const data = layer.data as CandlestickPoint[];
    this.candles = data.map(candle => ({
      ...candle,
      volatility: candle.high - candle.low,
      trend:
        candle.close > candle.open
          ? 'Bull'
          : candle.close < candle.open
            ? 'Bear'
            : 'Neutral',
    }));

    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    this.candleValues = this.sections.map(key =>
      this.candles.map(c => c[key]),
    );

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

    const selectors = typeof layer.selectors === 'string' ? layer.selectors : '';
    this.highlightValues = this.mapToSvgElements(selectors);
  }

  /**
   * Pre-compute sorted segments for all candlestick points for O(1) lookup
   */
  private precomputeSortedSegments(): CandlestickNavSegmentType[][] {
    return this.candles.map((candle) => {
      // Always put 'volatility' first, then sort OHLC by value ascending
      const ohlcSegments: CandlestickSegmentType[] = ['low', 'open', 'close', 'high'];
      const sortedOhlc = ohlcSegments
        .map(seg => [seg, candle[seg]] as [CandlestickSegmentType, number])
        .sort((a, b) => a[1] - b[1])
        .map(pair => pair[0]);
      return ['volatility', ...sortedOhlc];
    });
  }

  /**
   * Pre-compute position maps for O(1) lookup of segment positions
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
   * Get the position index of a segment type in the sorted segments for a point (O(1) lookup)
   */
  private getSegmentPositionInSortedOrder(
    pointIndex: number,
    segmentType: CandlestickNavSegmentType,
  ): number {
    return this.segmentPositionMaps[pointIndex].get(segmentType) ?? 0;
  }

  /**
   * Get the segment type at a specific position in the sorted order for a point (O(1) lookup)
   */
  private getSegmentTypeAtSortedPosition(
    pointIndex: number,
    position: number,
  ): CandlestickNavSegmentType {
    const sortedSegments = this.sortedSegmentsByPoint[pointIndex];
    return sortedSegments[position] ?? 'open';
  }

  /**
   * Update visual position for segment highlighting
   * Use the dynamic position based on value-sorted order, not fixed section index
   */
  private updateVisualSegmentPosition(): void {
    // Use the sorted navigation order (with volatility first)
    const navOrder = this.sortedSegmentsByPoint[this.currentPointIndex];
    const dynamicSegmentPosition = navOrder.indexOf(this.currentSegmentType ?? 'open');
    if (this.orientation === Orientation.HORIZONTAL) {
      this.col = dynamicSegmentPosition;
    } else {
      this.row = dynamicSegmentPosition;
    }
  }

  /**
   * Update visual position for point highlighting
   */
  private updateVisualPointPosition(): void {
    if (this.orientation === Orientation.HORIZONTAL) {
      this.row = this.currentPointIndex;
    } else {
      this.col = this.currentPointIndex;
    }
  }

  protected handleInitialEntry(): void {
    this.isInitialEntry = false;
    this.currentPointIndex = Math.max(0, Math.min(this.currentPointIndex, this.candles.length - 1));
    // Always start at 'close' on initial entry
    this.currentSegmentType = 'close';
    this.updateVisualSegmentPosition();
  }

  /**
   * Override moveOnce to handle segment type preservation and value-based sorting
   */
  public moveOnce(direction: MovableDirection): void {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.notifyStateUpdate();
      return;
    }

    // Remove boundary re-entry logic: when at boundary, do nothing
    // Instead, just do not move if not movable
    if (!this.isMovable(direction)) {
      this.notifyOutOfBounds();
      return;
    }

    switch (direction) {
      case 'UPWARD':
      case 'DOWNWARD': {
        // Vertical movement: navigate between segments within the same candlestick (value-sorted)
        const navOrder = this.sortedSegmentsByPoint[this.currentPointIndex];
        const currentSegmentPosition = navOrder.indexOf(this.currentSegmentType ?? 'open');
        const newSegmentPosition = direction === 'UPWARD'
          ? currentSegmentPosition + 1
          : currentSegmentPosition - 1;
        if (newSegmentPosition >= 0 && newSegmentPosition < navOrder.length) {
          this.currentSegmentType = navOrder[newSegmentPosition];
          this.updateVisualSegmentPosition();
        } else {
          // If we hit a boundary, do not move, just notify
          this.notifyOutOfBounds();
          return;
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
          return;
        }
        break;
      }
    }

    this.notifyStateUpdate();
  }

  public override moveToExtreme(direction: MovableDirection): void {
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
  }

  public moveToIndex(row: number, col: number): void {
    // Delegate navigation logic to service and only handle data state updates
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    // Use navigation service to compute the mapping
    const { pointIndex, segmentType } = this.navigationService.computeIndexAndSegment(
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
  }

  /**
   * Override isMovable to handle custom navigation boundaries for value-based sorting
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
        const currentSegmentPosition = navOrder.indexOf(this.currentSegmentType ?? 'open');
        const newSegmentPosition = target === 'UPWARD'
          ? currentSegmentPosition + 1
          : currentSegmentPosition - 1;
        return (
          newSegmentPosition >= 0 && newSegmentPosition < navOrder.length
        );
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

  public dispose(): void {
    this.navigationService.dispose();
    this.candles.length = 0;
    super.dispose();
  }

  protected get values(): number[][] {
    return this.candleValues;
  }

  protected audio(): AudioState {
    let value: number;
    if (this.currentSegmentType === 'volatility') {
      value = this.candles[this.currentPointIndex].volatility;
    } else if (this.currentSegmentType) {
      value = this.candles[this.currentPointIndex][this.currentSegmentType];
    } else {
      value = this.candles[this.currentPointIndex].open;
    }

    return {
      min: this.min,
      max: this.max,
      size: this.candles.length,
      index: this.currentPointIndex,
      value,
      trend: this.candles[this.currentPointIndex].trend,
    };
  }

  protected braille(): BrailleState {
    // Return the braille state with the current candle values and segment type

    // get an array for bear or bull
    const bearOrBull = this.candles.map(candle => candle.trend);

    // Set row to value-sorted index of current segment for current candle
    const valueSortedRow = this.getSegmentPositionInSortedOrder(
      this.currentPointIndex,
      this.currentSegmentType ?? this.sections[0],
    );
    this.row = valueSortedRow;
    // Print segment types and their values for the current candle as a readable string
    const segmentValuesStr = this.sections.map(seg => `${seg}: ${this.candles[this.currentPointIndex][seg]}`).join(', ');
    console.log(
      `[Candlestick] braille() debug: row=${this.row}, col=${this.col}, currentSegmentType=${this.currentSegmentType}, currentPointIndex=${this.currentPointIndex}, segments=[${segmentValuesStr}]`
    );
    console.log('[Candlestick] braille() called:', {
      id: this.id,
      row: this.row,
      col: this.col,
      currentSegmentType: this.currentSegmentType,
      currentPointIndex: this.currentPointIndex
    });

    return {
      empty: false,
      id: this.id,
      values: this.candleValues,
      min: this.min,
      max: this.max,
      row: this.row,
      col: this.col,
      custom: bearOrBull,
    };
  }

  protected mapToSvgElements(selector: string): SVGElement[][] | null {
    if (!selector) {
      return null;
    }

    const allElements = Svg.selectAllElements(selector);

    // Create a 2D array structure that matches the dynamic value-sorted navigation:
    // - Rows represent value-sorted positions (0=lowest, 3=highest)
    // - Cols represent candlestick points
    // This ensures highlightValues[dynamicRow][col] works correctly
    const segmentElements: SVGElement[][] = [];

    for (
      let sortedPosition = 0;
      sortedPosition < this.sections.length;
      sortedPosition++
    ) {
      segmentElements[sortedPosition] = [];

      for (let pointIndex = 0; pointIndex < this.candles.length; pointIndex++) {
        // For each candlestick point, assign the corresponding SVG element
        // All segments of a candlestick typically share the same SVG element
        const elementIndex = pointIndex < allElements.length ? pointIndex : 0;
        segmentElements[sortedPosition][pointIndex] = allElements[elementIndex];
      }
    }

    return segmentElements;
  }

  protected text(): TextState {
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
   * Gets the current candlestick trend for audio palette selection.
   * This provides raw data that services can use for business logic.
   *
   * @returns The trend of the current candlestick point
   */
  public getCurrentTrend(): CandlestickTrend {
    return this.candles[this.currentPointIndex].trend;
  }

  /**
   * Get the current X value from the candlestick trace
   * @returns The current X value or null if not available
   */
  public getCurrentXValue(): XValue | null {
    if (this.currentPointIndex >= 0 && this.currentPointIndex < this.candles.length) {
      return this.candles[this.currentPointIndex].value;
    }
    return null;
  }

  /**
   * Move the candlestick to the position that matches the given X value
   * @param xValue The X value to move to
   * @returns true if the position was found and set, false otherwise
   */
  public moveToXValue(xValue: XValue): boolean {
    const targetIndex = this.candles.findIndex(candle => candle.value === xValue);
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
}
