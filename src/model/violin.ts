import type { BoxPoint, BoxSelector, MaidrLayer, SmoothPoint } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { BrailleState, TextState } from '@type/state';
import { Orientation, TraceType } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { BoxTrace } from './box';
import { SmoothTrace } from './smooth';

/**
 * ViolinTrace extends SmoothTrace to provide violin-specific navigation behavior.
 * For violin plots, up/down arrows navigate within a single violin's density curve.
 * Left/right arrows switch between violins within the same KDE layer when available.
 */
export class ViolinTrace extends SmoothTrace {
  private boxPlotLayerData: MaidrLayer | null = null; // Cache for box plot layer data if available

  public constructor(layer: MaidrLayer, allLayers?: MaidrLayer[]) {
    super(layer);
    // Try to find and cache box plot layer data for fill fallback
    // This is a workaround since fill might not be in KDE layer data
    this.cacheBoxPlotLayerData(allLayers);
  }

  /**
   * Try to cache box plot layer data to get fill values as fallback
   */
  private cacheBoxPlotLayerData(allLayers?: MaidrLayer[]): void {
    try {
      // Find the box plot layer in the same subplot
      if (allLayers) {
        const boxLayer = allLayers.find(l => l.type === TraceType.BOX);
        if (boxLayer) {
          this.boxPlotLayerData = boxLayer;
        }
      }
    } catch (e) {
      // Error caching box plot layer - continue without fallback
    }
  }

  protected mapToSvgElements(selectors?: string[]): SVGElement[][] | null {
    
    if (!selectors || selectors.length !== this.lineValues.length) {
      return null;
    }

    const svgElements: SVGElement[][] = [];
    let allFailed = true;
    for (let r = 0; r < selectors.length; r++) {
      
      // For violin plots, try to find the actual rendered element
      let lineElement = Svg.selectElement(selectors[r], false);
      
      // If selector targets defs > path, try to find the use element that references it
      if (!lineElement && selectors[r].includes('defs > path')) {
        // For selectors like "g[id='...'] > defs > path", look for the clipped group containing the use element
        const groupId = selectors[r].match(/g\[id='([^']+)'\]/);
        if (groupId && groupId[1]) {
          const groupElement = document.querySelector(`g[id='${groupId[1]}']`) as SVGElement | null;
          if (groupElement) {
            // Look for the clipped group containing the use element
            const clippedGroup = groupElement.querySelector('g[clip-path]') as SVGElement | null;
            if (clippedGroup) {
              // Find the use element inside the clipped group - this is the actual rendered violin shape
              const useElement = clippedGroup.querySelector('use');
              if (useElement) {
                // Use the use element directly instead of the defs path
                lineElement = useElement as SVGElement;
              }
            } else {
              // Fallback: look for use element and use its parent
              const useElement = groupElement.querySelector('use');
              if (useElement && useElement.parentElement instanceof SVGElement) {
                lineElement = useElement.parentElement as SVGElement;
              }
            }
          }
        }
      }
      
      // If we still don't have a lineElement, the path is in defs and needs special handling
      // For violin plots with paths in defs, we can't directly highlight the defs path
      // Instead, we need to work with the use element or find another approach
      
      // For violin plots, create circle elements for each point (like LineTrace does)
      // This avoids the issue with highlighting defs paths or use elements
      const linePointElements: SVGElement[] = [];
      if (lineElement && lineElement instanceof SVGElement) {
        // Check if this is a path in defs - if so, we need to create circles for highlighting
        if (lineElement.tagName === 'path' && lineElement.closest('defs')) {
          // Create circle elements for each point along the violin curve
          const dataPoints = this.points?.[r] as any[];
          if (dataPoints) {
            for (const pt of dataPoints) {
              if (typeof pt.svg_x === 'number' && typeof pt.svg_y === 'number') {
                // Create a circle element for this point
                const circleElement = Svg.createCircleElement(pt.svg_x, pt.svg_y, lineElement);
                // Override the radius to make it smaller (3px instead of the default)
                circleElement.setAttribute('r', '3');
                linePointElements.push(circleElement);
              }
            }
          }
          if (linePointElements.length > 0) {
            allFailed = false;
          }
        } else if (lineElement.tagName === 'use') {
          // For use elements, try to make them visible and highlightable
          // Make the use element visible and add it to linePointElements
          linePointElements.push(lineElement);
          allFailed = false;
          
          // Also create circles for each point for better visibility
          const dataPoints = this.points?.[r] as any[];
          if (dataPoints) {
            for (const pt of dataPoints) {
              if (typeof pt.svg_x === 'number' && typeof pt.svg_y === 'number') {
                // Create a circle element for this point
                const circleElement = Svg.createCircleElement(pt.svg_x, pt.svg_y, lineElement);
                // Override the radius to make it smaller (3px instead of the default)
                circleElement.setAttribute('r', '3');
                linePointElements.push(circleElement);
              }
            }
          }
          if (linePointElements.length > 0) {
            allFailed = false;
          }
        }
      }

      svgElements.push(linePointElements);
    }

    if (allFailed) {
      return null;
    }
    return svgElements;
  }

  public moveOnce(direction: MovableDirection): void {
    
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.notifyStateUpdate();
      return;
    }

    if (direction === 'FORWARD' || direction === 'BACKWARD') {
      const nextRow = direction === 'FORWARD' ? this.row + 1 : this.row - 1;
      const lastRowIndex = this.lineValues.length - 1;
      if (nextRow < 0 || nextRow > lastRowIndex) {
        this.notifyOutOfBounds();
        return;
      }

      this.row = nextRow;
      // Reset to bottom of KDE curve (col = 0) when switching between violins
      // This matches the behavior of ViolinBoxTrace which resets to MIN section
      this.col = 0;
      this.updateVisualPointPosition();
      this.notifyStateUpdate();
      return;
    }

    if (!this.isMovable(direction)) {
      this.notifyOutOfBounds();
      return;
    }

    // For violin plots, up/down arrows navigate along the smooth violin curve (density curve)
    // This moves along the density curve within a violin (col movement)
    switch (direction) {
      case 'UPWARD':
        // Up arrow moves forward along the density curve (increase column)
        this.col += 1;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        break;
      case 'DOWNWARD':
        // Down arrow moves backward along the density curve (decrease column)
        this.col -= 1;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        break;
    }
  }

  public isMovable(target: [number, number] | MovableDirection): boolean {
    // Handle array-based movements
    if (Array.isArray(target)) {
      return super.isMovable(target);
    }

    const direction = target;
    
    if (direction === 'FORWARD' || direction === 'BACKWARD') {
      if (direction === 'FORWARD') {
        return this.row < this.lineValues.length - 1;
      }
      return this.row > 0;
    }

    // For violin plots, up/down arrows navigate along the density curve within a violin
    switch (direction) {
      case 'UPWARD':
        // Up arrow: check if we can move forward (increase column) along density curve
        const canMoveUp = this.col < this.lineValues[this.row].length - 1;
        return canMoveUp;
      case 'DOWNWARD':
        // Down arrow: check if we can move backward (decrease column) along density curve
        const canMoveDown = this.col > 0;
        return canMoveDown;
      default:
        // Handle array-based movements (for compatibility)
        const superMovable = super.isMovable(direction);
        return superMovable;
    }
  }

  public moveUpRotor(_mode?: 'lower' | 'higher'): boolean {
    // Fn+Up switches between BOX and KDE layers within a violin
    // Let the subplot handle layer switching by not handling UPWARD
    // This allows Fn+Up/Down to switch between BOX and KDE layers
    // Regular Up/Down navigates along the density curve
    this.notifyOutOfBounds(); // Let subplot handle layer switching
    return true;
  }

  public moveDownRotor(_mode?: 'lower' | 'higher'): boolean {
    // Fn+Down switches between BOX and KDE layers within a violin
    // Let the subplot handle layer switching by not handling DOWNWARD
    // This allows Fn+Up/Down to switch between BOX and KDE layers
    // Regular Up/Down navigates along the density curve
    this.notifyOutOfBounds(); // Let subplot handle layer switching
    return true;
  }

  public moveLeftRotor(_mode?: 'lower' | 'higher'): boolean {
    // Left arrow switches between violin layers (BACKWARD)
    this.moveOnce('BACKWARD');
    return true;
  }

  public moveRightRotor(_mode?: 'lower' | 'higher'): boolean {
    // Right arrow switches between violin layers (FORWARD)
    this.moveOnce('FORWARD');
    return true;
  }

  protected audio() {
    // For violin plots, use density values for pitch (frequency)
    // Higher density = higher pitch, lower density = lower pitch
    const rowPoints = this.points[this.row];
    const col = this.col;

    // Extract density values for the current violin (row)
    const densityValues = rowPoints.map(point => {
      const violinPoint = point as SmoothPoint & { density?: number };
      return violinPoint.density ?? 0;
    });

    // Calculate min/max density for this violin
    const densityMin = MathUtil.safeMin(densityValues);
    const densityMax = MathUtil.safeMax(densityValues);
    
    // Safety check: if min === max, add a small range to avoid division by zero in interpolation
    // Ensure we don't go negative if min is 0
    const safeDensityMin = densityMin === densityMax 
      ? Math.max(0, densityMin - 0.001) 
      : densityMin;
    const safeDensityMax = densityMin === densityMax 
      ? densityMax + 0.001 
      : densityMax;

    const getDensity = (i: number): number =>
      densityValues[Math.max(0, Math.min(i, densityValues.length - 1))];

    const prevDensity = col > 0 ? getDensity(col - 1) : getDensity(col);
    const currDensity = getDensity(col);
    const nextDensity = col < densityValues.length - 1 ? getDensity(col + 1) : getDensity(col);

    return {
      min: safeDensityMin,
      max: safeDensityMax,
      size: densityValues.length,
      index: col,
      value: [prevDensity, currDensity, nextDensity],
      isContinuous: true,
      // Don't include groupIndex for violin plots - audio should be same format for all violins
      // This matches regular KDE plots which don't have groupIndex
    };
  }

  /**
   * Override to prevent groupIndex from being included in audio.
   * This ensures the audio format is the same for all violins and matches regular KDE plots.
   */
  protected getAudioGroupIndex(): { groupIndex?: number } {
    // Return empty object - no groupIndex for violin plots
    // This makes the audio format consistent across all violins, matching regular KDE plots
    return {};
  }

  /**
   * Override to ensure we start at the bottom of the KDE curve (col = 0) and first violin (row = 0).
   * This matches the behavior of ViolinBoxTrace which starts at MIN section.
   */
  protected handleInitialEntry(): void {
    super.handleInitialEntry();
    // Start at the first violin (row = 0) and bottom of KDE curve (col = 0)
    this.row = 0;
    this.col = 0;
  }

  protected braille(): BrailleState {
    // Ensure braille is properly displayed for violin plots
    // ViolinTrace inherits lineValues, min, max from LineTrace, so this should work
    return {
      empty: false,
      id: this.id,
      values: this.lineValues,
      min: this.min,
      max: this.max,
      row: this.row,
      col: this.col,
    };
  }

  protected text(): TextState {
    const point = this.points[this.row][this.col];
    const baseText = super.text();

    // For violin plots, display X axis (violin/category), Y value, and density (volume)
    if (point.density !== undefined && point.density !== null) {
      // Get the X axis value (violin/category name) from the fill property
      // Try multiple approaches to find the fill value
      let xValue = '';
      const rowPoints = this.points[this.row];
      
      // First try the current point
      if ((point as any).fill) {
        xValue = String((point as any).fill);
      }
      // Then try the first point in the row
      else if (rowPoints && rowPoints.length > 0) {
        const firstPoint = rowPoints[0] as any;
        if (firstPoint.fill) {
          xValue = String(firstPoint.fill);
        }
      }
      // Try any point in the row
      if (!xValue && rowPoints) {
        for (const p of rowPoints) {
          const pAny = p as any;
          if (pAny.fill) {
            xValue = String(pAny.fill);
            break;
          }
        }
      }
      // Last resort: check the layer's original data structure
      if (!xValue && this.layer.data) {
        const layerData = this.layer.data as any;
        if (Array.isArray(layerData) && layerData[this.row]) {
          const rowData = layerData[this.row];
          if (Array.isArray(rowData) && rowData.length > 0) {
            const firstPointData = rowData[0];
            if (firstPointData && typeof firstPointData === 'object') {
              // Check all possible property names
              if ('fill' in firstPointData && firstPointData.fill) {
                xValue = String(firstPointData.fill);
              } else if ('Fill' in firstPointData && firstPointData.Fill) {
                xValue = String(firstPointData.Fill);
              } else if ('FILL' in firstPointData && firstPointData.FILL) {
                xValue = String(firstPointData.FILL);
              }
            }
          }
        }
      }
      
      // If still no value, get it from the cached box plot layer data
      // This is a workaround since the fill might not be in the KDE layer data
      if (!xValue && this.boxPlotLayerData) {
        try {
          const boxData = this.boxPlotLayerData.data as any;
          if (Array.isArray(boxData) && boxData.length > this.row) {
            const boxPoint = boxData[this.row];
            if (boxPoint && typeof boxPoint === 'object' && boxPoint.fill) {
              xValue = String(boxPoint.fill);
            }
          }
        } catch (e) {
          // Error accessing box plot layer data - continue without fallback
        }
      }
      
      // Exclude 'fill' from baseText to avoid duplicate "Group" display
      // We only need main, cross, and density for violin plots
      // Explicitly construct the object without fill property
      // Format y value and density to 4 decimal places as strings to preserve precision
      const yValue = typeof point.y === 'number' ? point.y : Number(point.y);
      const densityValue = typeof point.density === 'number' ? point.density : Number(point.density);
      const formattedYValue = yValue.toFixed(4);
      const formattedDensity = densityValue.toFixed(4);
      
      const textState: TextState = {
        main: {
          label: this.xAxis,
          value: xValue,
        },
        cross: {
          label: this.yAxis,
          value: formattedYValue,
        },
        density: {
          label: 'Volume',
          value: formattedDensity,
        },
        // Include other optional fields from baseText if they exist (range, section)
        ...(baseText.range !== undefined && { range: baseText.range }),
        ...(baseText.section !== undefined && { section: baseText.section }),
      };
      return textState;
    }

    // For non-violin plots, also exclude fill to avoid duplicates
    // Explicitly construct the object without fill property
    const result: TextState = {
      main: baseText.main,
      cross: baseText.cross,
      ...(baseText.range !== undefined && { range: baseText.range }),
      ...(baseText.section !== undefined && { section: baseText.section }),
      ...(baseText.density !== undefined && { density: baseText.density }),
    };
    return result;
  }

  /**
   * Override to return the row index (which violin) for layer switching.
   * This allows switching from KDE to BOX layer while preserving the violin position.
   */
  public getCurrentXValue(): XValue | null {
    // For ViolinTrace: row = which violin
    return this.row;
  }

  /**
   * Get the current Y value from the KDE curve.
   * This is used when switching to box plot layer to preserve the Y level.
   */
  public getCurrentYValue(): number | null {
    const rowPoints = this.points[this.row];
    const rowYValues = this.lineValues[this.row];
    
    if (!rowPoints || rowPoints.length === 0 || !rowYValues || rowYValues.length === 0) {
      return null;
    }
    
    if (this.col >= 0 && this.col < rowYValues.length) {
      const yValue = rowYValues[this.col];
      return typeof yValue === 'number' ? yValue : null;
    }
    
    return null;
  }

  /**
   * Override to handle layer switching from ViolinBoxTrace.
   * When switching from BOX layer, the X value will be the violin index (column from box plot).
   * Set the row to match that violin index.
   */
  public moveToXValue(xValue: XValue): boolean {
    // If xValue is a number, it's likely the violin index from ViolinBoxTrace
    if (typeof xValue === 'number') {
      // Check if this is a valid violin index (row index)
      if (xValue >= 0 && xValue < this.lineValues.length) {
        this.row = Math.floor(xValue);
        // Reset to start of density curve (col = 0) when switching layers
        this.col = 0;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        return true;
      }
    }
    // Fall back to parent implementation for other cases (only if xValue is a number)
    if (typeof xValue === 'number') {
      return super.moveToXValue(xValue);
    }
    // Violin plots use numeric indices, so string values are not supported
    return false;
  }

  /**
   * Move to a specific violin (X value) and find the closest point on the KDE curve
   * with the given Y value. This is used when switching from box plot layer to preserve Y level.
   */
  public moveToXAndYValue(xValue: XValue, yValue: number): boolean {
    // First set the violin (row) from X value
    if (typeof xValue !== 'number') {
      return false;
    }

    const violinIndex = Math.floor(xValue);
    if (violinIndex < 0 || violinIndex >= this.lineValues.length) {
      return false;
    }

    this.row = violinIndex;
    const rowPoints = this.points[this.row];
    const rowYValues = this.lineValues[this.row];

    if (!rowPoints || rowPoints.length === 0 || !rowYValues || rowYValues.length === 0) {
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
}

/**
 * ViolinBoxTrace extends BoxTrace to provide violin-specific box plot navigation behavior.
 * When navigating between box plots in violin plots, resets to MIN section (lower point)
 * instead of maintaining the same level.
 */
export class ViolinBoxTrace extends BoxTrace {
  public constructor(layer: MaidrLayer) {
    super(layer);
    // Ensure we start at the first violin when the trace is created
    // For vertical: col = violin index (0 = first violin), row = section (1 = MIN)
    // For horizontal: row = violin index (0 = first violin), col = section (1 = MIN)
    if (this.orientation === Orientation.VERTICAL) {
      this.col = 0; // First violin
      this.row = 1; // MIN section
    } else {
      this.row = 0; // First violin
      this.col = 1; // MIN section
    }
  }

  /**
   * Override mapToSvgElements to fix Q1/Q3 mapping for violin plots.
   * In violin plots, Q1 should be at the bottom and Q3 at the top of the IQR box.
   */
  protected mapToSvgElements(
    selectors: BoxSelector[],
  ): (SVGElement[] | SVGElement)[][] | null {
    if (!selectors || selectors.length !== this.points.length) {
      return null;
    }

    const isVertical = this.orientation === Orientation.VERTICAL;
    const svgElements = new Array<Array<SVGElement[] | SVGElement>>();

    if (isVertical) {
      for (let i = 0; i < this.sections.length; i++) {
        svgElements.push(Array.from({ length: selectors.length }));
      }
    }

    selectors.forEach((selector, boxIdx) => {
      const lowerOutliers = selector.lowerOutliers.flatMap(s =>
        Svg.selectAllElements(s),
      );
      const upperOutliers = selector.upperOutliers.flatMap(s =>
        Svg.selectAllElements(s),
      );

      const min = Svg.selectElement(selector.min) ?? Svg.createEmptyElement();
      const max = Svg.selectElement(selector.max) ?? Svg.createEmptyElement();

      const iq = Svg.selectElement(selector.iq) ?? Svg.createEmptyElement();
      const q2 = Svg.selectElement(selector.q2) ?? Svg.createEmptyElement();

      // For violin plots: Q1 is at bottom, Q3 is at top (opposite of regular boxplots)
      // This matches the domMapping: { iqrDirection: "reverse" } in the payload
      // The domMapping is set in the Python side to indicate this behavior
      const [q1, q3] = isVertical
        ? [
            Svg.createLineElement(iq, 'bottom'), // Q1 (25%) = bottom edge
            Svg.createLineElement(iq, 'top'),    // Q3 (75%) = top edge
          ]
        : [
            Svg.createLineElement(iq, 'left'),  // Q1 (25%) = left boundary
            Svg.createLineElement(iq, 'right'), // Q3 (75%) = right boundary
          ];
      const sections = [lowerOutliers, min, q1, q2, q3, max, upperOutliers];

      if (isVertical) {
        sections.forEach((section, sectionIdx) => {
          svgElements[sectionIdx][boxIdx] = section;
        });
      } else {
        svgElements.push(sections);
      }
    });

    return svgElements;
  }

  /**
   * Override to return the column index (which violin) for layer switching.
   * This allows switching from BOX to KDE layer while preserving the violin position.
   */
  public getCurrentXValue(): XValue | null {
    // For vertical box plots: col = which violin
    // For horizontal box plots: row = which violin
    if (this.orientation === Orientation.VERTICAL) {
      return this.col;
    } else {
      return this.row;
    }
  }

  /**
   * Get the current Y value from the box plot.
   * This is used when switching to KDE layer to preserve the Y level.
   */
  public getCurrentYValue(): number | null {
    const values = this.values;
    if (this.orientation === Orientation.VERTICAL) {
      // For vertical: row = section index, col = violin index
      if (this.row >= 0 && this.row < values.length && this.col >= 0) {
        const rowValues = values[this.row];
        if (Array.isArray(rowValues) && this.col < rowValues.length) {
          const value = rowValues[this.col];
          // Handle arrays (outliers) - use first value or median
          if (Array.isArray(value)) {
            return value.length > 0 ? value[0] : null;
          }
          return typeof value === 'number' ? value : null;
        }
      }
    } else {
      // For horizontal: row = violin index, col = section index
      if (this.row >= 0 && this.row < values.length && this.col >= 0) {
        const rowValues = values[this.row];
        if (Array.isArray(rowValues) && this.col < rowValues.length) {
          const value = rowValues[this.col];
          // Handle arrays (outliers) - use first value or median
          if (Array.isArray(value)) {
            return value.length > 0 ? value[0] : null;
          }
          return typeof value === 'number' ? value : null;
        }
      }
    }
    return null;
  }

  /**
   * Override to handle layer switching from ViolinTrace.
   * When switching from KDE layer, the X value will be the violin index (row from violin trace).
   * Set the column to match that violin index.
   */
  public moveToXValue(xValue: XValue): boolean {
    // If xValue is a number, it's likely the violin index from ViolinTrace
    if (typeof xValue === 'number') {
      const violinIndex = Math.floor(xValue);
      const values = this.values;
      if (this.orientation === Orientation.VERTICAL) {
        // For vertical: col = which violin, values[0] is the first section row
        // Number of violins = length of any section row
        const numViolins = values.length > 0 ? values[0].length : 0;
        if (violinIndex >= 0 && violinIndex < numViolins) {
          this.col = violinIndex;
          // Reset to MIN section (row 1) when switching layers
          this.row = 1;
          this.updateVisualPointPosition();
          this.notifyStateUpdate();
          return true;
        }
      } else {
        // For horizontal: row = which violin, values.length = number of violins
        if (violinIndex >= 0 && violinIndex < values.length) {
          this.row = violinIndex;
          // Reset to MIN section (col 1) when switching layers
          this.col = 1;
          this.updateVisualPointPosition();
          this.notifyStateUpdate();
          return true;
        }
      }
    }
    // Fall back to parent implementation for other cases
    return super.moveToXValue(xValue);
  }

  /**
   * Move to a specific violin (X value) and find the closest box plot section
   * with the given Y value. This is used when switching from KDE layer to preserve Y level.
   */
  public moveToXAndYValue(xValue: XValue, yValue: number): boolean {
    // First set the violin from X value
    if (typeof xValue !== 'number') {
      return false;
    }

    const violinIndex = Math.floor(xValue);
    const values = this.values;

    if (this.orientation === Orientation.VERTICAL) {
      // For vertical: col = which violin, row = section index
      const numViolins = values.length > 0 ? values[0].length : 0;
      if (violinIndex < 0 || violinIndex >= numViolins) {
        return false;
      }

      this.col = violinIndex;

      // Find the section (row) with the closest Y value
      let closestRow = 1; // Default to MIN section
      let minDistance = Infinity;

      for (let row = 0; row < values.length; row++) {
        const rowValues = values[row];
        if (Array.isArray(rowValues) && violinIndex < rowValues.length) {
          const value = rowValues[violinIndex];
          
          // Handle arrays (outliers) - check all values in the array
          if (Array.isArray(value)) {
            for (const v of value) {
              if (typeof v === 'number') {
                const distance = Math.abs(v - yValue);
                if (distance < minDistance) {
                  minDistance = distance;
                  closestRow = row;
                }
              }
            }
          } else if (typeof value === 'number') {
            const distance = Math.abs(value - yValue);
            if (distance < minDistance) {
              minDistance = distance;
              closestRow = row;
            }
          }
        }
      }

      this.row = closestRow;
      this.updateVisualPointPosition();
      this.notifyStateUpdate();
      return true;
    } else {
      // For horizontal: row = which violin, col = section index
      if (violinIndex < 0 || violinIndex >= values.length) {
        return false;
      }

      this.row = violinIndex;

      // Find the section (col) with the closest Y value
      let closestCol = 1; // Default to MIN section
      let minDistance = Infinity;

      const rowValues = values[violinIndex];
      if (Array.isArray(rowValues)) {
        for (let col = 0; col < rowValues.length; col++) {
          const value = rowValues[col];
          
          // Handle arrays (outliers) - check all values in the array
          if (Array.isArray(value)) {
            for (const v of value) {
              if (typeof v === 'number') {
                const distance = Math.abs(v - yValue);
                if (distance < minDistance) {
                  minDistance = distance;
                  closestCol = col;
                }
              }
            }
          } else if (typeof value === 'number') {
            const distance = Math.abs(value - yValue);
            if (distance < minDistance) {
              minDistance = distance;
              closestCol = col;
            }
          }
        }
      }

      this.col = closestCol;
      this.updateVisualPointPosition();
      this.notifyStateUpdate();
      return true;
    }
  }

  /**
   * Reset to MIN section (lower point) of the box plot.
   * This is called when switching between box plots in violin plots.
   */
  public resetToMin(): void {
    if (this.orientation === Orientation.VERTICAL) {
      this.row = 1; // MIN section
    } else {
      this.col = 1; // MIN section
    }
    this.updateVisualPointPosition();
  }

  protected handleInitialEntry(): void {
    super.handleInitialEntry();
    // Ensure we start at the first violin (col = 0 for vertical, row = 0 for horizontal)
    // and MIN section (row = 1 for vertical, col = 1 for horizontal)
    if (this.orientation === Orientation.VERTICAL) {
      this.col = 0; // First violin
      this.row = 1; // MIN section
    } else {
      this.row = 0; // First violin
      this.col = 1; // MIN section
    }
  }

  public moveOnce(direction: MovableDirection): void {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.notifyStateUpdate();
      return;
    }

    // Track previous position to detect when switching between box plots
    const previousCol = this.col;
    const previousRow = this.row;

    if (!this.isMovable(direction)) {
      this.notifyOutOfBounds();
      return;
    }

    // Handle the movement
    switch (direction) {
      case 'UPWARD':
        this.row += 1;
        break;
      case 'DOWNWARD':
        this.row -= 1;
        break;
      case 'FORWARD':
        this.col += 1;
        break;
      case 'BACKWARD':
        this.col -= 1;
        break;
    }

    // If we switched between box plots, reset to MIN section
    // For vertical box plots: FORWARD/BACKWARD change col (box plot), reset row to MIN (row 1)
    // For horizontal box plots: UPWARD/DOWNWARD change row (box plot), reset col to MIN (col 1)
    if (this.orientation === Orientation.VERTICAL) {
      // Vertical: col = box plot, row = section
      if (previousCol !== this.col && (direction === 'FORWARD' || direction === 'BACKWARD')) {
        // Reset to MIN section (row 1) when switching between box plots
        this.row = 1;
      }
    } else {
      // Horizontal: row = box plot, col = section
      if (previousRow !== this.row && (direction === 'UPWARD' || direction === 'DOWNWARD')) {
        // Reset to MIN section (col 1) when switching between box plots
        this.col = 1;
      }
    }

    this.notifyStateUpdate();
  }
}