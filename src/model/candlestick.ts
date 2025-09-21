import type { ExtremaTarget } from '@type/extrema';
import type {
  CandlestickPoint,
  CandlestickSelector,
  CandlestickTrend,
  MaidrLayer,
} from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { AudioState, BrailleState, TextState } from '@type/state';
import { AbstractTrace } from '@model/abstract';
import { NavigationService } from '@service/navigation';
import { Orientation } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';

// Type alias for highlight elements - can be single elements or arrays of elements
type HighlightValue = SVGElement | SVGElement[];

const TREND = 'trend';
const VOLATILITY_PRECISION_MULTIPLIER = 100;

type CandlestickSegmentType = 'open' | 'high' | 'low' | 'close';
type CandlestickNavSegmentType = 'volatility' | CandlestickSegmentType;

export class Candlestick extends AbstractTrace<number> {
  protected readonly supportsExtrema = true;

  private readonly candles: CandlestickPoint[];
  private readonly candleValues: number[][];

  private readonly orientation: Orientation;
  private readonly sections = [
    'volatility',
    'open',
    'high',
    'low',
    'close',
  ] as const;

  // Track navigation state separately from visual highlighting state
  private currentSegmentType: CandlestickNavSegmentType | null = 'open';
  private currentPointIndex: number = 0;

  // Performance optimization: Pre-computed lookup tables
  private readonly sortedSegmentsByPoint: CandlestickNavSegmentType[][];
  private readonly segmentPositionMaps: Map<
    CandlestickNavSegmentType,
    number
  >[];

  private readonly min: number;
  private readonly max: number;

  protected readonly highlightValues: HighlightValue[][] | null;
  protected highlightCenters:
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null;

  // Service dependency for navigation logic
  protected readonly navigationService: NavigationService;

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

    this.highlightValues = this.mapToSvgElements(
      layer.selectors as string | string[] | CandlestickSelector | undefined,
    );
    this.highlightCenters = this.mapSvgElementsToCenters();
  }

  /**
   * Pre-compute sorted segments for all candlestick points for O(1) lookup
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
   * Update visual position for point highlighting
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
        const navOrder = this.sortedSegmentsByPoint[this.currentPointIndex];
        const currentSegmentPosition = navOrder.indexOf(
          this.currentSegmentType ?? 'open',
        );
        if (currentSegmentPosition === -1) {
          this.notifyOutOfBounds();
          return;
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

  private getElementAt(array: SVGElement[], index: number): SVGElement | null {
    return index < array.length ? array[index] : null;
  }

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
    if (
      this.currentPointIndex >= 0
      && this.currentPointIndex < this.candles.length
    ) {
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
   * Get available X values for navigation
   * @returns Array of X values
   */
  public getAvailableXValues(): XValue[] {
    return this.candles.map(candle => candle.value);
  }

  /**
   * Get extrema targets for the current candlestick trace
   * Returns multiple extrema targets with better labels and descriptions
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
   * Navigate to a specific extrema target
   * @param target The extrema target to navigate to
   */
  public navigateToExtrema(target: ExtremaTarget): void {
    // Update the current point index
    this.currentPointIndex = target.pointIndex;

    // Update the current segment type
    this.currentSegmentType = target.segment as CandlestickNavSegmentType;

    // Use common finalization method
    this.finalizeExtremaNavigation();
  }

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
}
