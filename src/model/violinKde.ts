import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { AudioState, TextState } from '@type/state';
import type { MovableDirection } from '@type/movable';
import { Constant } from '@util/constant';
import { Svg } from '@util/svg';
import { SmoothTrace } from './smooth';

const SVG_PATH_LINE_POINT_REGEX = /[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;

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
          // Use the same column index if valid, otherwise use the last column
          const maxCol = this.points[nextRow].length - 1;
          this.row = nextRow;
          this.col = Math.min(this.col, maxCol);
          this.notifyStateUpdate();
        } else {
          this.notifyOutOfBounds();
        }
        break;

      case 'BACKWARD':
        // Move to previous violin (previous row)
        if (this.row > 0) {
          const prevRow = this.row - 1;
          // Use the same column index if valid, otherwise use the last column
          const maxCol = this.points[prevRow].length - 1;
          this.row = prevRow;
          this.col = Math.min(this.col, maxCol);
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
      
      // Fallback: if selector didn't match, try finding by group ID pattern
      if (!primaryElement && isNewFormat) {
        const groupIdMatch = selector.match(/g\[id=['"]([^'"]+)['"]\]/);
        if (groupIdMatch) {
          const groupId = groupIdMatch[1];
          const groupElement = document.querySelector(`g[id='${groupId}']`);
          if (groupElement) {
            const useEl = groupElement.querySelector('use');
            const pathEl = groupElement.querySelector('defs > path');
            primaryElement = (useEl || pathEl) as SVGElement;
          }
        }
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
    if (typeof currentPointWithWidth.width === 'number' && !isNaN(currentPointWithWidth.width)) {
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
        let pointY = Number(point.y);
        let pointSvgY = typeof pointWithSvg.svg_y === 'number' ? pointWithSvg.svg_y : null;
        
        let yMatches = false;
        if (currentSvgY !== null && pointSvgY !== null) {
          yMatches = Math.abs(pointSvgY - currentSvgY) <= 1.0;
        } else {
          yMatches = Math.abs(pointY - currentYValue) <= yTolerance;
        }
        
        if (yMatches && typeof pointWithSvg.svg_x === 'number' && !isNaN(pointWithSvg.svg_x)) {
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
      volumeScale: volumeScale,
      // Don't include groupIndex for violin plots - audio should be same format for all violins
    };

    return audioState;
  }
}


