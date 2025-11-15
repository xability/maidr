import type { BoxSelector, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { AudioState, BrailleState, TextState, TraceState } from '@type/state';
import { Orientation, TraceType } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { BoxTrace } from './box';
import { SmoothTrace } from './smooth';

/**
 * Radius (in pixels) for circle elements used to highlight points on violin plots.
 * These circles are created when the violin shape is defined in SVG defs and need
 * visual highlighting elements.
 */
const VIOLIN_HIGHLIGHT_CIRCLE_RADIUS = 3;

/**
 * Number of decimal places to use when formatting Y values and density values
 * for display in violin plots. This ensures consistent precision in text output.
 */
const VIOLIN_VALUE_DECIMAL_PLACES = 4;

/**
 * Small adjustment value used to create a safety range when min and max density values
 * are equal. This prevents division by zero errors in interpolation calculations by
 * ensuring there's always a non-zero range between min and max values.
 */
const MIN_DENSITY_RANGE = 0.001;

/**
 * Label text for the density field in violin plot text descriptions.
 * This represents the "volume" or width of the violin at a given Y level,
 * which corresponds to the density value in the KDE distribution.
 */
const VIOLIN_DENSITY_LABEL = 'Volume';

/**
 * ViolinTrace extends SmoothTrace to provide violin-specific navigation behavior.
 * For violin plots, up/down arrows navigate within a single violin's density curve.
 * Left/right arrows switch between violins within the same KDE layer when available.
 */
export class ViolinTrace extends SmoothTrace {
  /**
   * ID of the box plot layer in the same subplot, if available.
   * This is used to retrieve fill values as a fallback when not available in KDE layer data.
   * Stored as minimal state (identifier only) rather than caching the full layer data.
   */
  private readonly boxPlotLayerId: string | null;

  public constructor(layer: MaidrLayer, allLayers?: MaidrLayer[]) {
    super(layer);
    // Store only the box plot layer ID for on-demand retrieval
    // This follows architectural guidelines by minimizing persistent state in Model classes
    const boxLayer = allLayers?.find(l => l.type === TraceType.BOX);
    this.boxPlotLayerId = boxLayer?.id ?? null;
  }

  /**
   * Creates highlight circle elements for all points in a given row and adds them to the provided array.
   * Each circle is created at the point's SVG coordinates with the configured highlight radius.
   *
   * @param rowIndex - The index of the row (violin) to create circles for
   * @param parentElement - The parent SVG element to use as a reference for styling
   * @param circleElements - Array to which the created circle elements will be added
   * @returns The number of circle elements created
   */
  private createHighlightCirclesForRow(
    rowIndex: number,
    parentElement: SVGElement,
    circleElements: SVGElement[],
  ): number {
    const dataPoints = this.points?.[rowIndex] as any[];
    if (!dataPoints) {
      return 0;
    }

    let count = 0;
    for (const pt of dataPoints) {
      if (typeof pt.svg_x === 'number' && typeof pt.svg_y === 'number') {
        const circleElement = Svg.createCircleElement(pt.svg_x, pt.svg_y, parentElement);
        circleElement.setAttribute('r', String(VIOLIN_HIGHLIGHT_CIRCLE_RADIUS));
        circleElements.push(circleElement);
        count++;
      }
    }
    return count;
  }

  /**
   * Attempts to retrieve the box plot layer data from the subplot on-demand.
   * Since traces don't have direct access to their parent subplot, this method
   * currently returns null. This follows architectural guidelines by avoiding
   * persistent state caching in Model classes.
   *
   * @returns The box plot layer data if available, or null if not accessible.
   */
  private retrieveBoxPlotLayerFromSubplot(): MaidrLayer | null {
    // Traces don't have direct access to their parent subplot or other layers.
    // To retrieve the box plot layer on-demand, we would need access to the subplot
    // or a way to query layers by ID. For now, return null to follow architectural
    // guidelines of not caching full layer data as instance state.
    // In practice, the fill value should be available in the KDE layer data,
    // making this fallback rarely needed.
    return null;
  }

  /**
   * Retrieves the fill value from box plot layer data as a fallback.
   * This is used when the fill value is not available in the KDE layer data.
   *
   * @param boxPlotLayer - The box plot layer data to retrieve the fill value from.
   *                       If null, returns null (no fallback available).
   * @param rowIndex - The row index (violin index) to get the fill value for.
   * @returns The fill value as a string, or null if not available.
   */
  private getFillValueFromBoxPlotLayer(boxPlotLayer: MaidrLayer | null, rowIndex: number): string | null {
    if (!boxPlotLayer) {
      return null;
    }

    try {
      const boxData = boxPlotLayer.data as any;
      if (Array.isArray(boxData) && boxData.length > rowIndex) {
        const boxPoint = boxData[rowIndex];
        if (boxPoint && typeof boxPoint === 'object' && boxPoint.fill) {
          return String(boxPoint.fill);
        }
      }
    } catch (e) {
      // Error accessing box plot layer data - return null
    }

    return null;
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
          const circlesCreated = this.createHighlightCirclesForRow(r, lineElement, linePointElements);
          if (circlesCreated > 0) {
            allFailed = false;
          }
        } else if (lineElement.tagName === 'use') {
          // For use elements, try to make them visible and highlightable
          // Make the use element visible and add it to linePointElements
          linePointElements.push(lineElement);
          allFailed = false;

          // Also create circles for each point for better visibility
          this.createHighlightCirclesForRow(r, lineElement, linePointElements);
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

  /**
   * Moves the trace position once in the specified direction.
   *
   * For violin plots, navigation behavior differs from standard smooth plots:
   * - FORWARD/BACKWARD: Switch between violins (rows), resetting to bottom of density curve (col = 0)
   * - UPWARD/DOWNWARD: Navigate along the density curve within the current violin (col movement)
   *
   * @param direction - The direction to move: 'UPWARD', 'DOWNWARD', 'FORWARD', or 'BACKWARD'
   */
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

  /**
   * Checks if the trace can move in the specified direction or to the specified position.
   *
   * For violin plots, movement validation differs from standard smooth plots:
   * - FORWARD/BACKWARD: Checks if there are more violins to navigate to
   * - UPWARD/DOWNWARD: Checks if movement along the density curve is possible within the current violin
   *
   * @param target - Either a direction ('UPWARD', 'DOWNWARD', 'FORWARD', 'BACKWARD') or
   *                 an array of [row, col] coordinates for array-based movements
   * @returns true if movement is possible in the specified direction/position, false otherwise
   */
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
      case 'UPWARD': {
        // Up arrow: check if we can move forward (increase column) along density curve
        const canMoveUp = this.col < this.lineValues[this.row].length - 1;
        return canMoveUp;
      }
      case 'DOWNWARD': {
        // Down arrow: check if we can move backward (decrease column) along density curve
        const canMoveDown = this.col > 0;
        return canMoveDown;
      }
      default: {
        // Handle array-based movements (for compatibility)
        const superMovable = super.isMovable(direction);
        return superMovable;
      }
    }
  }

  /**
   * Handles Fn+Up rotor movement for layer switching in violin plots.
   *
   * In violin plots, Fn+Up/Down is used to switch between BOX and KDE layers,
   * rather than navigating within the current layer. This method delegates
   * the layer switching to the subplot by calling notifyOutOfBounds().
   *
   * Note: Returns true to indicate the request was handled (by delegating to subplot),
   * not that the move was successful within this trace. The actual layer switching
   * is performed by the subplot in response to the out-of-bounds notification.
   *
   * @param _mode - Optional mode parameter (not used in violin plots)
   * @returns true to indicate the request was handled by delegating to subplot
   */
  public moveUpRotor(_mode?: 'lower' | 'higher'): boolean {
    // Fn+Up switches between BOX and KDE layers within a violin
    // Let the subplot handle layer switching by not handling UPWARD
    // This allows Fn+Up/Down to switch between BOX and KDE layers
    // Regular Up/Down navigates along the density curve
    this.notifyOutOfBounds(); // Let subplot handle layer switching
    return true;
  }

  /**
   * Handles Fn+Down rotor movement for layer switching in violin plots.
   *
   * In violin plots, Fn+Up/Down is used to switch between BOX and KDE layers,
   * rather than navigating within the current layer. This method delegates
   * the layer switching to the subplot by calling notifyOutOfBounds().
   *
   * Note: Returns true to indicate the request was handled (by delegating to subplot),
   * not that the move was successful within this trace. The actual layer switching
   * is performed by the subplot in response to the out-of-bounds notification.
   *
   * @param _mode - Optional mode parameter (not used in violin plots)
   * @returns true to indicate the request was handled by delegating to subplot
   */
  public moveDownRotor(_mode?: 'lower' | 'higher'): boolean {
    // Fn+Down switches between BOX and KDE layers within a violin
    // Let the subplot handle layer switching by not handling DOWNWARD
    // This allows Fn+Up/Down to switch between BOX and KDE layers
    // Regular Up/Down navigates along the density curve
    this.notifyOutOfBounds(); // Let subplot handle layer switching
    return true;
  }

  /**
   * Handles Fn+Left rotor movement for switching between violins.
   *
   * In violin plots, Fn+Left/Right is used to switch between violins (BACKWARD/FORWARD),
   * rather than navigating within the current violin. This method delegates to moveOnce('BACKWARD').
   *
   * @param _mode - Optional mode parameter (not used in violin plots)
   * @returns true to indicate the request was handled
   */
  public moveLeftRotor(_mode?: 'lower' | 'higher'): boolean {
    // Left arrow switches between violin layers (BACKWARD)
    this.moveOnce('BACKWARD');
    return true;
  }

  /**
   * Handles Fn+Right rotor movement for switching between violins.
   *
   * In violin plots, Fn+Left/Right is used to switch between violins (BACKWARD/FORWARD),
   * rather than navigating within the current violin. This method delegates to moveOnce('FORWARD').
   *
   * @param _mode - Optional mode parameter (not used in violin plots)
   * @returns true to indicate the request was handled
   */
  public moveRightRotor(_mode?: 'lower' | 'higher'): boolean {
    // Right arrow switches between violin layers (FORWARD)
    this.moveOnce('FORWARD');
    return true;
  }

  protected audio(): AudioState {
    // For violin plots, use density values for pitch (frequency)
    // Higher density = higher pitch, lower density = lower pitch
    const rowPoints = this.points[this.row];
    const col = this.col;

    // Extract density values for the current violin (row)
    const densityValues = rowPoints.map((point) => {
      return point.density ?? 0;
    });

    // Calculate min/max density for this violin
    const densityMin = MathUtil.safeMin(densityValues);
    const densityMax = MathUtil.safeMax(densityValues);

    // Safety check: if min === max, add a small range to avoid division by zero in interpolation
    // Ensure we don't go negative if min is 0
    const safeDensityMin = densityMin === densityMax
      ? Math.max(0, densityMin - MIN_DENSITY_RANGE)
      : densityMin;
    const safeDensityMax = densityMin === densityMax
      ? densityMax + MIN_DENSITY_RANGE
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
      } else if (rowPoints && rowPoints.length > 0) {
        // Then try the first point in the row
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

      // If still no value, try to get it from the box plot layer data as a fallback
      // This is a workaround since the fill might not be in the KDE layer data
      // Note: We can't access the box plot layer data here without state, so this fallback
      // is only available if the layer data is passed in. In practice, the fill value
      // should be available in the KDE layer data, making this fallback rarely needed.
      // Following architectural guidelines, we don't cache the full layer data here.
      if (!xValue && this.boxPlotLayerId) {
        // Attempt to retrieve box plot layer data on-demand from the subplot
        // Since traces don't have direct access to their parent subplot, this fallback
        // may not be available. The fill value should typically be in the KDE layer data.
        const boxPlotLayer = this.retrieveBoxPlotLayerFromSubplot();
        if (boxPlotLayer) {
          const fallbackValue = this.getFillValueFromBoxPlotLayer(boxPlotLayer, this.row);
          if (fallbackValue) {
            xValue = fallbackValue;
          }
        }
      }

      // Exclude 'fill' from baseText to avoid duplicate "Group" display
      // We only need main, cross, and density for violin plots
      // Explicitly construct the object without fill property
      // Format y value and density to specified decimal places as strings to preserve precision
      const yValue = typeof point.y === 'number' ? point.y : Number(point.y);
      const densityValue = typeof point.density === 'number' ? point.density : Number(point.density);
      const formattedYValue = yValue.toFixed(VIOLIN_VALUE_DECIMAL_PLACES);
      const formattedDensity = densityValue.toFixed(VIOLIN_VALUE_DECIMAL_PLACES);

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
          label: VIOLIN_DENSITY_LABEL,
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
   * Override state getter to set plotType to 'kde' for violin plots.
   * This ensures the text display shows "kde plot" instead of "multiline plot".
   */
  public get state(): TraceState {
    const baseState = super.state;
    if (baseState.empty) {
      return baseState;
    }

    // Override plotType to 'kde' for violin plots
    return {
      ...baseState,
      plotType: 'kde',
    };
  }

  /**
   * Override to return the row index (which violin) for layer switching.
   * This allows switching from KDE to BOX layer while preserving the violin position.
   *
   * @returns The violin index (row index) as a number, representing which violin
   *          is currently active. Returns null if the position is invalid.
   */
  public getCurrentXValue(): XValue | null {
    // For ViolinTrace: row = which violin
    return this.row;
  }

  /**
   * Get the current Y value from the KDE curve.
   * This is used when switching to box plot layer to preserve the Y level.
   *
   * @returns The current Y value from the KDE curve at the current position (row, col).
   *          Returns null if the position is invalid or if no valid Y value can be determined.
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
   *
   * @param xValue - The X value to move to. For violin plots, this must be a numeric index
   *                 representing the violin (row) index. String values are not supported as
   *                 violin plots use numeric indices to identify violins.
   * @returns true if the move was successful, false if xValue is a string (not supported)
   *          or if the numeric index is out of bounds
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
    // Violin plots use numeric indices only - string XValue types are intentionally not supported
    // This is by design: violin plots identify violins by numeric index, not by string labels
    return false;
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
 *
 * This class handles the box plot layer within violin plots, which consist of two layers:
 * 1. A KDE (kernel density estimation) layer represented by ViolinTrace
 * 2. A box plot layer represented by this ViolinBoxTrace class
 *
 * Key differences from standard BoxTrace:
 * - When navigating between box plots (violins), automatically resets to MIN section
 *   instead of maintaining the same section level across violins
 * - Q1/Q3 mapping is reversed: Q1 is at the bottom and Q3 at the top of the IQR box
 *   (opposite of regular boxplots) to match violin plot conventions
 * - Supports seamless layer switching with ViolinTrace via getCurrentXValue() and
 *   moveToXValue() methods, preserving violin position when switching between KDE and BOX layers
 * - Initializes at the first violin (index 0) and MIN section (index 1) by default
 *
 * Relationship with ViolinTrace:
 * - Both classes work together to provide complete violin plot navigation
 * - ViolinTrace handles the KDE/density curve layer (smooth violin shape)
 * - ViolinBoxTrace handles the box plot statistics layer (min, Q1, median, Q3, max)
 * - Layer switching (Fn+Up/Down) allows users to switch between these two layers
 * - When switching layers, the violin position (X value) is preserved via getCurrentXValue()
 * - When switching from KDE to BOX, the Y level is preserved via getCurrentYValue() and
 *   moveToXAndYValue() finds the closest matching section
 */
export class ViolinBoxTrace extends BoxTrace {
  /**
   * Creates a new ViolinBoxTrace instance for a violin plot's box layer.
   *
   * @param layer - The MAIDR layer data containing box plot information for the violin plot.
   *                This includes box plot statistics (min, Q1, median, Q3, max) and selectors
   *                for SVG elements representing each section of the box plot.
   */
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
   *
   * This method overrides the base BoxTrace implementation to handle the reversed
   * Q1/Q3 positioning in violin plots. Unlike standard boxplots where Q1 is at the
   * top and Q3 at the bottom, violin plots have Q1 at the bottom and Q3 at the top
   * of the IQR box. This matches the domMapping: { iqrDirection: "reverse" } set
   * in the Python side payload.
   *
   * The method maps box plot selectors to their corresponding SVG elements, organizing
   * them by section (lowerOutliers, min, q1, q2, q3, max, upperOutliers) and by violin
   * (box plot index). The structure differs based on orientation:
   * - For vertical plots: organized by section (row) then violin (column)
   * - For horizontal plots: organized by violin (row) then section (column)
   *
   * @param selectors - Array of BoxSelector objects, each containing CSS selectors
   *                    for the SVG elements representing different sections of a box plot
   *                    (lowerOutliers, min, q1, q2, q3, max, upperOutliers). The length
   *                    must match the number of violins (this.points.length).
   *
   * @returns A 2D array structure mapping sections and violins to their SVG elements.
   *          - For vertical orientation: [section][violin] = SVGElement[] | SVGElement
   *          - For horizontal orientation: [violin][section] = SVGElement[] | SVGElement
   *          Returns null if selectors is null/undefined or if the length doesn't match
   *          the number of points (violins).
   */
  protected mapToSvgElements(
    selectors: BoxSelector[],
  ): (SVGElement[] | SVGElement)[][] | null {
    if (!selectors) {
      return null;
    }
    if (selectors.length !== this.points.length) {
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
            Svg.createLineElement(iq, 'top'), // Q3 (75%) = top edge
          ]
        : [
            Svg.createLineElement(iq, 'left'), // Q1 (25%) = left boundary
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
   *
   * @returns The violin index (X value) as a number. For vertical box plots, returns the column index.
   *          For horizontal box plots, returns the row index. Returns null if the position is invalid.
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
   *
   * @returns The current Y value from the box plot section at the current position.
   *          For outliers (arrays), returns the first value. Returns null if the position
   *          is invalid or if the value cannot be determined.
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
   *
   * @param xValue - The violin index (X value) to move to. Must be a numeric index.
   *                 String values fall back to parent implementation.
   * @returns true if the move was successful (valid violin index), false otherwise
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
   *
   * @param xValue - The violin index (X value) to move to. Must be a numeric index.
   *                 String values are not supported.
   * @param yValue - The Y value to find the closest matching box plot section for
   * @returns true if the move was successful (valid violin index and closest section found),
   *          false if xValue is not a number or if the violin index is out of bounds
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
   * This is called when switching between box plots in violin plots to ensure
   * consistent starting position when navigating between violins.
   *
   * For vertical box plots, sets row to 1 (MIN section index).
   * For horizontal box plots, sets col to 1 (MIN section index).
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

  /**
   * Moves the trace position once in the specified direction.
   *
   * For ViolinBoxTrace, navigation behavior includes automatic reset to MIN section
   * when switching between box plots (violins):
   * - FORWARD/BACKWARD: Switch between violins (vertical: col, horizontal: row), reset to MIN section
   * - UPWARD/DOWNWARD: Navigate within box plot sections (vertical: row, horizontal: col)
   *
   * @param direction - The direction to move: 'UPWARD', 'DOWNWARD', 'FORWARD', or 'BACKWARD'
   */
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
