import type { CandlestickPoint, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { AudioState, BrailleState, TextState } from '@type/state';
import { AbstractTrace } from '@model/abstract';
import { Orientation } from '@type/grammar';
import { MathUtil } from '@util/math';

const TREND = 'Trend';

type CandlestickSegmentType = 'open' | 'high' | 'low' | 'close';

export class Candlestick extends AbstractTrace<number> {
  private readonly candles: CandlestickPoint[];
  private readonly candleValues: number[][];

  private readonly orientation: Orientation;
  private readonly sections = ['open', 'high', 'low', 'close'] as const;

  // Track navigation state separately from visual highlighting state
  private currentSegmentType: CandlestickSegmentType = 'open';
  private currentPointIndex: number = 0;

  // Performance optimization: Pre-computed lookup tables
  private readonly sortedSegmentsByPoint: CandlestickSegmentType[][];
  private readonly segmentPositionMaps: Map<CandlestickSegmentType, number>[];

  private readonly min: number;
  private readonly max: number;

  constructor(layer: MaidrLayer) {
    super(layer);

    const data = layer.data as CandlestickPoint[];
    this.candles = data.map((candle) => ({
      ...candle,
      trend:
        candle.close > candle.open
          ? 'Bull'
          : candle.close < candle.open
            ? 'Bear'
            : 'Neutral',
    }));

    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    this.candleValues = this.sections.map((key) =>
      this.candles.map((c) => c[key]),
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
  }

  /**
   * Pre-compute sorted segments for all candlestick points for O(1) lookup
   */
  private precomputeSortedSegments(): CandlestickSegmentType[][] {
    return this.candles.map((candle) => {
      // Create array of [segmentType, value] pairs
      const segmentPairs: [CandlestickSegmentType, number][] =
        this.sections.map((segmentType) => [segmentType, candle[segmentType]]);

      // Sort by value and return just the segment types
      return segmentPairs.sort((a, b) => a[1] - b[1]).map((pair) => pair[0]);
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
   */
  private updateVisualSegmentPosition(): void {
    const segmentIndex = this.sections.indexOf(this.currentSegmentType);
    if (this.orientation === Orientation.HORIZONTAL) {
      this.col = segmentIndex;
    } else {
      this.row = segmentIndex;
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
        // Vertical movement: navigate between segments within the same candlestick (value-sorted)
        const currentSegmentPosition = this.getSegmentPositionInSortedOrder(
          this.currentPointIndex,
          this.currentSegmentType,
        );
        const newSegmentPosition =
          direction === 'UPWARD'
            ? currentSegmentPosition + 1
            : currentSegmentPosition - 1;

        if (
          newSegmentPosition >= 0 &&
          newSegmentPosition < this.sections.length
        ) {
          this.currentSegmentType = this.getSegmentTypeAtSortedPosition(
            this.currentPointIndex,
            newSegmentPosition,
          );
          this.updateVisualSegmentPosition();
        } else {
          this.notifyOutOfBounds();
          return;
        }
        break;
      }

      case 'FORWARD':
      case 'BACKWARD': {
        // Horizontal movement: navigate between candlesticks while preserving segment type
        const newPointIndex =
          direction === 'FORWARD'
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
        const currentSorted =
          this.sortedSegmentsByPoint[this.currentPointIndex];
        this.currentSegmentType = currentSorted[currentSorted.length - 1];
        this.updateVisualSegmentPosition();
        break;
      }
      case 'DOWNWARD': {
        // Move to the lowest value segment in current candlestick
        const currentSortedDown =
          this.sortedSegmentsByPoint[this.currentPointIndex];
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
        const currentSegmentPosition = this.getSegmentPositionInSortedOrder(
          this.currentPointIndex,
          this.currentSegmentType,
        );
        const newSegmentPosition =
          target === 'UPWARD'
            ? currentSegmentPosition + 1
            : currentSegmentPosition - 1;
        return (
          newSegmentPosition >= 0 && newSegmentPosition < this.sections.length
        );
      }

      case 'FORWARD':
      case 'BACKWARD': {
        // Horizontal movement: check if we can move between candlesticks
        const newPointIndex =
          target === 'FORWARD'
            ? this.currentPointIndex + 1
            : this.currentPointIndex - 1;
        return newPointIndex >= 0 && newPointIndex < this.candles.length;
      }
    }
  }

  public dispose(): void {
    this.candles.length = 0;
    super.dispose();
  }

  protected get values(): number[][] {
    return this.candleValues;
  }

  protected audio(): AudioState {
    const value = this.candles[this.currentPointIndex][this.currentSegmentType];

    // set mood: 2 (saw) for Bear, 0 (default sine) for Bull. From AudioPalette.
    const groupIndex =
      this.candles[this.currentPointIndex].trend === 'Bull' ? 0 : 2;

    return {
      min: this.min,
      max: this.max,
      size: this.candles.length,
      index: this.currentPointIndex,
      value,
      groupIndex: groupIndex,
    };
  }

  protected braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: this.candleValues,
      min: this.min,
      max: this.max,
      row: this.row,
      col: this.col,
    };
  }

  protected get highlightValues(): null {
    return null;
  }

  protected text(): TextState {
    const point = this.candles[this.currentPointIndex];
    const crossValue = point[this.currentSegmentType];

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
}
