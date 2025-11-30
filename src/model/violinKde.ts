import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { AudioState, TextState } from '@type/state';
import type { Trace } from './plot';
import { Svg } from '@util/svg';
import { SmoothTrace } from './smooth';

/**
 * Small adjustment value used to create a safety range when min and max density values
 * are equal. This prevents division by zero errors in interpolation calculations.
 */
const MIN_DENSITY_RANGE = 0.001;

/**
 * Specialized trace for violin plot KDE layers.
 * Overrides navigation so that:
 * - Left/Right arrows switch between violins (row changes)
 * - Up/Down arrows traverse along the curve (col changes)
 */
export class ViolinKdeTrace extends SmoothTrace {
  public constructor(layer: MaidrLayer) {
    super(layer);
  }

  public isMovable(direction: MovableDirection): boolean {
    // Swapped navigation for violin plots:
    // - FORWARD/BACKWARD check row bounds (switch between violins)
    // - UPWARD/DOWNWARD check col bounds (traverse along curve)
    switch (direction) {
      case 'FORWARD':
        return this.row < this.points.length - 1;
      case 'BACKWARD':
        return this.row > 0;
      case 'UPWARD':
        return this.col < this.points[this.row].length - 1;
      case 'DOWNWARD':
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

    // Swapped navigation for violin plots:
    // - FORWARD/BACKWARD (Left/Right) switch between violins (change row)
    // - UPWARD/DOWNWARD (Up/Down) traverse along the curve (change col)
    switch (direction) {
      case 'FORWARD':
        // Move to next violin (next row)
        if (this.row < this.points.length - 1) {
          const nextRow = this.row + 1;
          this.row = nextRow;
          // Reset to bottom point (col = 0) when switching to a new violin
          this.col = 0;
          this.notifyStateUpdate();
        } else {
          this.notifyOutOfBounds();
        }
        break;

      case 'BACKWARD':
        // Move to previous violin (previous row)
        if (this.row > 0) {
          const prevRow = this.row - 1;
          this.row = prevRow;
          // Reset to bottom point (col = 0) when switching to a new violin
          this.col = 0;
          this.notifyStateUpdate();
        } else {
          this.notifyOutOfBounds();
        }
        break;

      case 'UPWARD':
      case 'DOWNWARD':
        // Move along the curve of the current violin (change col)
        if (direction === 'UPWARD') {
          if (this.col < this.points[this.row].length - 1) {
            this.col += 1;
            this.notifyStateUpdate();
          } else {
            this.notifyOutOfBounds();
          }
        } else {
          // DOWNWARD
          if (this.col > 0) {
            this.col -= 1;
            this.notifyStateUpdate();
          } else {
            this.notifyOutOfBounds();
          }
        }
        break;
    }
  }

  /**
   * Maps selectors to SVG elements for violin KDE layers.
   * Supports both old format (single pattern selector) and new format (one selector per violin).
   * Each selector corresponds to one row in the points array.
   */
  protected mapToSvgElements(selectors?: string[]): SVGElement[][] | null {
    if (!selectors || selectors.length === 0) {
      return null;
    }

    const elementsByViolin: SVGElement[][] = [];
    let allFailed = true;

    // Handle both formats:
    // 1. New format: one selector per violin (selectors.length === points.length)
    // 2. Old format: single pattern selector (selectors.length === 1)
    const isNewFormat = selectors.length === this.points.length;

    for (let r = 0; r < this.points.length; r++) {
      const violinElements: SVGElement[] = [];
      const dataPoints = this.points[r] as LinePoint[];

      // Get the selector for this violin
      let selector: string | undefined;
      if (isNewFormat) {
        // New format: use the selector at index r
        selector = selectors[r];
      } else {
        // Old format: use the single pattern selector (will match all violins)
        selector = selectors[0];
      }

      if (!selector) {
        elementsByViolin.push([]);
        continue;
      }

      // Try to find the SVG element(s) using the selector
      // Selector format: "g[id='...'] path, g[id='...'] use" (matches both path and use)
      const matchedElements = Svg.selectAllElements(selector, false);

      let primaryElement: SVGElement | null = null;

      if (matchedElements.length > 0) {
        // Filter to get <use> elements first (the rendered ones)
        const useElements = matchedElements.filter(el => el instanceof SVGUseElement);
        const pathElements = matchedElements.filter(el => el instanceof SVGPathElement);

        // Prefer <use> elements, fall back to <path>
        const candidates = useElements.length > 0 ? useElements : pathElements;

        if (candidates.length > 0) {
          // For new format (one selector per violin), should only be one element
          // For old format (pattern selector), select element at index r
          primaryElement = candidates[isNewFormat ? 0 : (r < candidates.length ? r : 0)];
        }
      }

      // If no element found, skip this violin (no hardcoded fallback)
      if (!primaryElement) {
        elementsByViolin.push([]);
        continue;
      }

      if (primaryElement && dataPoints) {
        // Use the data points (which have svg_x/svg_y) to create circle elements for highlighting
        for (const point of dataPoints) {
          // Check for svg_x/svg_y first (from SmoothPoint), then fall back to x/y
          let x: number;
          let y: number;

          if ('svg_x' in point && 'svg_y' in point) {
            x = (point as any).svg_x;
            y = (point as any).svg_y;
          } else if (typeof point.x === 'number' && typeof point.y === 'number') {
            x = point.x;
            y = point.y;
          } else {
            continue;
          }

          if (!Number.isNaN(x) && !Number.isNaN(y)) {
            violinElements.push(
              Svg.createCircleElement(x, y, primaryElement!),
            );
          }
        }

        if (violinElements.length > 0) {
          allFailed = false;
        }
      }

      elementsByViolin.push(violinElements);
    }

    return allFailed ? null : elementsByViolin;
  }

  /**
   * Override text() to format display for violin KDE layers:
   * - X axis: Shows actual X coordinate value (categorical label if available, otherwise rounded numeric)
   * - Y axis: Shows numeric value rounded to 4 decimal places
   * - Volume: X-axis difference between points on the same Y value (width of violin at that Y level), rounded to 4 decimals, shown in fill field
   */
  protected override text(): TextState {
    const currentPoint = this.points[this.row][this.col];
    const currentXValue = currentPoint.x;
    const currentYValue = Number(currentPoint.y);
    const currentRow = this.points[this.row];

    // Get volume (width) from pre-calculated value in point data
    // The backend calculates width in data coordinates using the original numeric X coordinates
    const currentPointWithWidth = currentPoint as any;
    let volume: number | undefined;

    // Check if width is pre-calculated and stored in the point data
    if (typeof currentPointWithWidth.width === 'number' && !Number.isNaN(currentPointWithWidth.width)) {
      volume = currentPointWithWidth.width;
    } else {
      // Fallback: Calculate from SVG coordinates if width not available
      // This should not happen if backend is working correctly
      const yTolerance = 0.01;
      const currentPointWithSvg = currentPoint as any;
      const currentSvgY = typeof currentPointWithSvg.svg_y === 'number' ? currentPointWithSvg.svg_y : null;

      const svgXAtSameY: number[] = [];
      for (const point of currentRow) {
        const pointWithSvg = point as any;
        const pointY = Number(point.y);
        const pointSvgY = typeof pointWithSvg.svg_y === 'number' ? pointWithSvg.svg_y : null;

        let yMatches = false;
        if (currentSvgY !== null && pointSvgY !== null) {
          yMatches = Math.abs(pointSvgY - currentSvgY) <= 1.0;
        } else {
          yMatches = Math.abs(pointY - currentYValue) <= yTolerance;
        }

        if (yMatches && typeof pointWithSvg.svg_x === 'number' && !Number.isNaN(pointWithSvg.svg_x)) {
          svgXAtSameY.push(pointWithSvg.svg_x);
        }
      }

      if (svgXAtSameY.length >= 2) {
        const minSvgX = Math.min(...svgXAtSameY);
        const maxSvgX = Math.max(...svgXAtSameY);
        volume = Math.abs(maxSvgX - minSvgX);
      }
    }

    // Round to 4 decimal places
    const roundTo4 = (num: number): number => Math.round(num * 10000) / 10000;
    const roundedYValue = roundTo4(currentYValue);
    const roundedVolume = volume !== undefined && volume > 0 ? roundTo4(volume) : undefined;

    // Format X value: Always show categorical label, never numeric coordinate
    // For violin plots, the backend now extracts categorical labels and stores them as strings
    // Each row represents a different category/violin, and all points in a row have the same X label
    let xDisplayValue: number | string;
    if (typeof currentXValue === 'string') {
      // Already a categorical label string - use it directly
      xDisplayValue = currentXValue;
    } else {
      // If still numeric (fallback), try to get from first point in row
      // All points in a row should have the same X value
      const firstPointInRow = currentRow[0];
      if (firstPointInRow && typeof firstPointInRow.x === 'string') {
        xDisplayValue = firstPointInRow.x;
      } else {
        // Last resort: use row index as fallback
        xDisplayValue = `Category ${this.row}`;
      }
    }

    const textState: TextState = {
      // X axis: Show categorical label only (never show numeric coordinate)
      main: { label: this.xAxis, value: xDisplayValue },
      // Y axis: Show numeric value rounded to 4 decimals (no volume)
      cross: { label: this.yAxis, value: roundedYValue },
    };

    // Add volume in fill field if available
    if (roundedVolume !== undefined) {
      textState.fill = { label: 'volume', value: String(roundedVolume) };
    }

    return textState;
  }

  /**
   * Violin KDE layers use consistent density values from first violin for pitch (like smooth plots).
   * Override audio() to:
   * - Use density values from first violin (row 0) for pitch - consistent audio across all violins
   * - Calculate volumeScale from current position's density (0-1 normalized range) - volume varies by position
   */
  protected override audio(): AudioState {
    // Always use the first violin (row 0) for density values for consistent pitch across violins
    // This ensures audio doesn't change when switching between violins (like smooth plots)
    const referenceRowIndex = 0;
    const referenceRowPoints = this.points[referenceRowIndex];

    // If first violin doesn't exist, fall back to parent implementation
    if (!referenceRowPoints || referenceRowPoints.length === 0) {
      return super.audio();
    }

    // Extract density values from reference violin (row 0) for consistent pitch
    const referenceDensityValues = referenceRowPoints.map((point: any) => {
      // Try density property first, then fall back to width
      return point.density ?? point.width ?? 0;
    });

    // Calculate min/max density for reference violin
    const referenceDensityMin = Math.min(...referenceDensityValues.filter(d => d > 0));
    const referenceDensityMax = Math.max(...referenceDensityValues);

    // Safety check: if min === max, add a small range to avoid division by zero
    const safeDensityMin = referenceDensityMin === referenceDensityMax
      ? Math.max(0, referenceDensityMin - MIN_DENSITY_RANGE)
      : referenceDensityMin;
    const safeDensityMax = referenceDensityMin === referenceDensityMax
      ? referenceDensityMax + MIN_DENSITY_RANGE
      : referenceDensityMax;

    // Use current column position, but clamp to reference row bounds
    const safeIndex = Math.min(this.col, referenceDensityValues.length - 1);

    const getDensity = (i: number): number =>
      referenceDensityValues[Math.max(0, Math.min(i, referenceDensityValues.length - 1))];

    // Use reference violin's density values for pitch (consistent across violins)
    const prevDensity = safeIndex > 0 ? getDensity(safeIndex - 1) : getDensity(safeIndex);
    const currDensity = getDensity(safeIndex);
    const nextDensity = safeIndex < referenceDensityValues.length - 1 ? getDensity(safeIndex + 1) : getDensity(safeIndex);

    // Calculate volumeScale from CURRENT position's density (allows volume to vary)
    // Get density from the actual current position where user is navigating
    const currentRowPoints = this.points[this.row];
    const currentCol = Math.min(this.col, currentRowPoints.length - 1);
    const currentPoint = currentRowPoints[currentCol];

    let volumeScale = 1.0; // Default to full volume
    if (currentPoint) {
      const currentPointAny = currentPoint as any;
      const currentDensity = currentPointAny.density ?? currentPointAny.width ?? 0;

      // Calculate min/max density for current violin to normalize volume
      const currentDensityValues = currentRowPoints.map((point: any) => {
        return point.density ?? point.width ?? 0;
      });
      const currentDensityMin = Math.min(...currentDensityValues.filter(d => d > 0));
      const currentDensityMax = Math.max(...currentDensityValues);

      // Normalize current density to 0-1 range for volumeScale
      if (currentDensityMax > 0 && typeof currentDensity === 'number' && currentDensity > 0) {
        const safeCurrentMax = currentDensityMin === currentDensityMax
          ? currentDensityMax + MIN_DENSITY_RANGE
          : currentDensityMax;
        volumeScale = currentDensity / safeCurrentMax;
      }
    }

    // Return audio state using reference violin's density for pitch (consistent audio)
    const audioState: AudioState = {
      min: safeDensityMin,
      max: safeDensityMax,
      size: referenceDensityValues.length,
      index: safeIndex,
      value: [prevDensity, currDensity, nextDensity],
      isContinuous: true,
      // Use volumeScale from current position - volume can vary by position
      volumeScale,
      // Don't include groupIndex for violin plots - audio should be same format for all violins
    };

    return audioState;
  }

  /**
   * Override to return the row index (which violin) for layer switching.
   * For violin KDE layers, row represents the violin index (numeric).
   *
   * @returns The violin index (row index) as a number, representing which violin
   *          is currently active. Returns null if the position is invalid.
   */
  public getCurrentXValue(): number | null {
    // For ViolinKdeTrace: row = which violin (numeric index)
    return this.row >= 0 && this.row < this.points.length ? this.row : null;
  }

  /**
   * Override moveToXValue to reset to bottom point (col = 0) when moving to a different violin.
   * This ensures that when navigating to a new violin, we start from the bottom of the curve.
   */
  public moveToXValue(xValue: number): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    const points = this.points;
    if (!points || !points.length) {
      return false;
    }

    // Check if xValue is a valid violin index (row)
    const violinIndex = Math.floor(xValue);
    if (violinIndex < 0 || violinIndex >= points.length) {
      return false;
    }

    // Store current violin to check if we're moving to a different one
    const currentViolin = this.row;

    // Move to the violin (row)
    this.row = violinIndex;

    // If we moved to a different violin, reset to bottom point (col = 0)
    // Otherwise, preserve the current column position
    if (violinIndex !== currentViolin) {
      this.col = 0; // Reset to bottom point
    } else {
      // Same violin - ensure column is within bounds
      const maxCol = points[violinIndex]?.length ? points[violinIndex].length - 1 : 0;
      this.col = Math.min(this.col, maxCol);
    }

    this.updateVisualPointPosition();
    this.notifyStateUpdate();
    return true;
  }

  /**
   * Get the current Y value from the KDE curve.
   * This is used when switching to box plot layer to preserve the Y level.
   *
   * @returns The current Y value from the KDE curve at the current position (row, col).
   *          Returns null if the position is invalid or if no valid Y value can be determined.
   */
  public getCurrentYValue(): number | null {
    const rowYValues = this.lineValues[this.row];

    if (!rowYValues || rowYValues.length === 0) {
      return null;
    }

    if (this.col >= 0 && this.col < rowYValues.length) {
      const yValue = rowYValues[this.col];
      return typeof yValue === 'number' ? yValue : null;
    }

    return null;
  }

  /**
   * Move to a specific violin (X value) and find the closest point on the KDE curve
   * with the given Y value. This is used when switching from box plot layer to preserve Y level.
   *
   * @param xValue - The violin index (X value) to move to. Must be a numeric index.
   *                 String values are not supported as violin plots use numeric indices.
   * @param yValue - The Y value to find the closest matching point for on the KDE curve
   * @returns true if the move was successful (valid violin index and Y value found),
   *          false if xValue is not a number or if the violin index is out of bounds
   */
  public moveToXAndYValue(xValue: any, yValue: number): boolean {
    // First set the violin (row) from X value
    if (typeof xValue !== 'number') {
      return false;
    }

    const violinIndex = Math.floor(xValue);
    if (violinIndex < 0 || violinIndex >= this.lineValues.length) {
      return false;
    }

    this.row = violinIndex;
    const rowYValues = this.lineValues[this.row];

    if (!rowYValues || rowYValues.length === 0) {
      this.col = 0;
      this.updateVisualPointPosition();
      this.notifyStateUpdate();
      return true;
    }

    // Find the point with the closest Y value
    let closestIndex = 0;
    let minDistance = Math.abs(rowYValues[0] - yValue);

    for (let i = 1; i < rowYValues.length; i++) {
      const distance = Math.abs(rowYValues[i] - yValue);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }

    this.col = closestIndex;
    this.updateVisualPointPosition();
    this.notifyStateUpdate();
    return true;
  }

  /**
   * Handle switching from another trace.
   * Implements special handling for switching from violin box plot layer
   * to preserve both violin position (X) and Y value.
   *
   * @param previousTrace - The trace we're switching from
   * @returns true if handled (switching from violin box plot), false otherwise
   */
  public onSwitchFrom(previousTrace: Trace): boolean {
    // Check if switching from violin box plot
    const prevTraceAny = previousTrace as any;
    const prevLayer = prevTraceAny.layer;
    const prevTraceType = prevTraceAny.type || prevTraceAny.state?.traceType;

    const isFromViolinBoxPlot = prevTraceType === 'box' && prevLayer?.violinLayer === 'box';

    if (!isFromViolinBoxPlot) {
      return false; // Don't handle - use default behavior
    }

    // Get X and Y values from box plot
    const xValue = previousTrace.getCurrentXValue();
    const getCurrentYValueFn = (prevTraceAny as any).getCurrentYValue;

    if (typeof getCurrentYValueFn === 'function') {
      const yValue = getCurrentYValueFn.call(prevTraceAny);

      if (yValue !== null && xValue !== null) {
        // Use moveToXAndYValue to preserve both violin position and Y level
        return this.moveToXAndYValue(xValue, yValue);
      }
    }

    // Fallback: if Y value extraction failed, just set X position
    // ViolinKdeTrace extends SmoothTrace which has moveToXValue
    if (xValue !== null) {
      const success = this.moveToXValue(xValue as number);
      return success; // Return true if move was successful
    }

    return false; // Let context handle default behavior
  }
}
