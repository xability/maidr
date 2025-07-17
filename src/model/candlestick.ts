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

type CandlestickSegmentType = 'open' | 'high' | 'low' | 'close' | 'volatility';

export class Candlestick extends AbstractTrace<number> {
  private readonly candles: CandlestickPoint[];
  private readonly candleValues: number[][];

  private readonly orientation: Orientation;
  private readonly sections = ['open', 'high', 'low', 'close'] as const;
  private readonly sectionsWithVolatility = ['open', 'high', 'low', 'close', 'volatility'] as const;

  // Track navigation state separately from visual highlighting state
  private currentSegmentType: CandlestickSegmentType = 'open';
  private currentPointIndex: number = 0;

  // Performance optimization: Pre-computed lookup tables
  private readonly sortedSegmentsByPoint: CandlestickSegmentType[][];
  private readonly segmentPositionMaps: Map<CandlestickSegmentType, number>[];

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
    this.currentSegmentType = 'open';

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
   * Calculate volatility for a given candlestick point
   * Volatility = High Price - Low Price
   */
  private getVolatility(pointIndex: number): number {
    const candle = this.candles[pointIndex];
    return candle.high - candle.low;
  }

  /**
   * Pre-compute sorted segments for all candlestick points for O(1) lookup
   */
  private precomputeSortedSegments(): CandlestickSegmentType[][] {
    return this.candles.map((candle) => {
      // Create array of [segmentType, value] pairs
      const segmentPairs: [CandlestickSegmentType, number][]
        = this.sections.map(segmentType => [segmentType, candle[segmentType]]);

      // Sort by value and return just the segment types
      return segmentPairs.sort((a, b) => a[1] - b[1]).map(pair => pair[0]);
    });
  }

  /**
   * Pre-compute position maps for O(1) lookup of segment positions
   */
  private precomputePositionMaps(): Map<CandlestickSegmentType, number>[] {
    return this.sortedSegmentsByPoint.map((sortedSegments) => {
      const positionMap = new Map<CandlestickSegmentType, number>();
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
    segmentType: CandlestickSegmentType,
  ): number {
    return this.segmentPositionMaps[pointIndex].get(segmentType) ?? 0;
  }

  /**
   * Get the segment type at a specific position in the sorted order for a point (O(1) lookup)
   */
  private getSegmentTypeAtSortedPosition(
    pointIndex: number,
    position: number,
  ): CandlestickSegmentType {
    const sortedSegments = this.sortedSegmentsByPoint[pointIndex];
    return sortedSegments[position] ?? 'open';
  }

  /**
   * Update visual position for segment highlighting
   * Use the dynamic position based on value-sorted order, not fixed section index
   */
  private updateVisualSegmentPosition(): void {
    if (this.currentSegmentType === 'volatility') {
      // Volatility is always at position 4 (bottom-most)
      if (this.orientation === Orientation.HORIZONTAL) {
        this.col = 4;
      } else {
        this.row = 4;
      }
    } else {
      const dynamicSegmentPosition = this.getSegmentPositionInSortedOrder(
        this.currentPointIndex,
        this.currentSegmentType,
      );

      if (this.orientation === Orientation.HORIZONTAL) {
        this.col = dynamicSegmentPosition;
      } else {
        this.row = dynamicSegmentPosition;
      }
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

  /**
   * Override moveOnce to handle segment type preservation and value-based sorting
   */
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
      case 'DOWNWARD': {
        // Vertical movement: navigate between segments within the same candlestick
        if (this.currentSegmentType === 'volatility') {
          // From volatility, move to the appropriate OHLC segment
          if (direction === 'UPWARD') {
            // From volatility (bottom), move to the lowest value OHLC segment
            const sortedSegments = this.sortedSegmentsByPoint[this.currentPointIndex];
            this.currentSegmentType = sortedSegments[0]; // lowest value
            this.updateVisualSegmentPosition();
          } else {
            // Can't go further down from volatility
            this.notifyOutOfBounds();
            return;
          }
        } else {
          // From OHLC segments, navigate within the value-sorted segments or to volatility
          const currentSegmentPosition = this.getSegmentPositionInSortedOrder(
            this.currentPointIndex,
            this.currentSegmentType,
          );
          const newSegmentPosition
            = direction === 'UPWARD'
              ? currentSegmentPosition + 1
              : currentSegmentPosition - 1;

          if (
            newSegmentPosition >= 0
            && newSegmentPosition < this.sections.length
          ) {
            this.currentSegmentType = this.getSegmentTypeAtSortedPosition(
              this.currentPointIndex,
              newSegmentPosition,
            );
            this.updateVisualSegmentPosition();
          } else if (direction === 'DOWNWARD' && newSegmentPosition < 0) {
            // Move to volatility when going down from the lowest OHLC segment
            this.currentSegmentType = 'volatility';
            this.updateVisualSegmentPosition();
          } else {
            this.notifyOutOfBounds();
            return;
          }
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
        // Move to volatility (the bottom-most segment)
        this.currentSegmentType = 'volatility';
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

    // Handle volatility position specially (row/col 4 depending on orientation)
    const volatilityPosition = 4;
    let pointIndex: number;
    let segmentType: CandlestickSegmentType;

    if (this.orientation === Orientation.HORIZONTAL) {
      pointIndex = row;
      if (col === volatilityPosition) {
        segmentType = 'volatility';
      } else {
        // Use navigation service for OHLC segments
        const result = this.navigationService.computeIndexAndSegment(
          row,
          col,
          this.orientation,
          this.sections,
        );
        segmentType = result.segmentType;
      }
    } else {
      pointIndex = col;
      if (row === volatilityPosition) {
        segmentType = 'volatility';
      } else {
        // Use navigation service for OHLC segments
        const result = this.navigationService.computeIndexAndSegment(
          row,
          col,
          this.orientation,
          this.sections,
        );
        segmentType = result.segmentType;
      }
    }

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
        if (this.currentSegmentType === 'volatility') {
          // From volatility, can only move up to OHLC segments, not down
          return target === 'UPWARD';
        } else {
          // From OHLC segments
          const currentSegmentPosition = this.getSegmentPositionInSortedOrder(
            this.currentPointIndex,
            this.currentSegmentType,
          );
          const newSegmentPosition
            = target === 'UPWARD'
              ? currentSegmentPosition + 1
              : currentSegmentPosition - 1;

          // Can move within OHLC segments or down to volatility
          return (
            (newSegmentPosition >= 0 && newSegmentPosition < this.sections.length)
            || (target === 'DOWNWARD' && newSegmentPosition < 0) // Can move down to volatility
          );
        }
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
    const point = this.candles[this.currentPointIndex];
    let value: number;

    if (this.currentSegmentType === 'volatility') {
      value = this.getVolatility(this.currentPointIndex);
    } else {
      value = point[this.currentSegmentType];
    }

    return {
      min: this.min,
      max: this.max,
      size: this.candles.length,
      index: this.currentPointIndex,
      value,
      trend: point.trend,
    };
  }

  protected braille(): BrailleState {
    // Return the braille state with the current candle values and segment type

    // get an array for bear or bull
    const bearOrBull = this.candles.map(candle => candle.trend);

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

    // Create a 2D array structure that matches the navigation:
    // - Rows 0-3 represent value-sorted OHLC positions (0=lowest, 3=highest)
    // - Row 4 represents volatility (static bottom-most position)
    // - Cols represent candlestick points
    // This ensures highlightValues[row][col] works correctly
    const segmentElements: SVGElement[][] = [];

    for (
      let position = 0;
      position < this.sectionsWithVolatility.length;
      position++
    ) {
      segmentElements[position] = [];

      for (let pointIndex = 0; pointIndex < this.candles.length; pointIndex++) {
        // For each candlestick point, assign the corresponding SVG element
        // All segments of a candlestick typically share the same SVG element
        const elementIndex = pointIndex < allElements.length ? pointIndex : 0;
        segmentElements[position][pointIndex] = allElements[elementIndex];
      }
    }

    return segmentElements;
  }

  protected text(): TextState {
    const point = this.candles[this.currentPointIndex];
    let crossValue: number;

    if (this.currentSegmentType === 'volatility') {
      crossValue = this.getVolatility(this.currentPointIndex);
    } else {
      crossValue = point[this.currentSegmentType];
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
      section: this.currentSegmentType,
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
      this.currentSegmentType = 'open'; // Default to open segment
      this.updateVisualPointPosition();
      this.updateVisualSegmentPosition();
      this.notifyStateUpdate();
      return true;
    }
    return false;
  }

  /**
   * Expose text state for testing purposes
   * @returns The current text state
   */
  public getTextState(): TextState {
    return this.text();
  }
}
