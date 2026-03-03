import type { MaidrLayer, ViolinKdePoint } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { AudioState, BrailleState, TextState } from '@type/state';
import type { Dimension } from './abstract';
import type { Trace } from './plot';
import { TraceType } from '@type/grammar';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovableGrid } from './movable';

/**
 * Small adjustment value used to create a safety range when min and max density values
 * are equal. This prevents division by zero errors in interpolation calculations.
 */
const MIN_DENSITY_RANGE = 0.001;

/**
 * Concrete trace for violin KDE (kernel density estimation) layers.
 *
 * Data layout: points[violin][curvePosition] = ViolinKdePoint
 *   - Row index = which violin (categorical group)
 *   - Col index = position along the KDE curve (bottom to top)
 *
 * Navigation:
 *   - Left/Right (FORWARD/BACKWARD) = switch between violins (change row)
 *   - Up/Down (UPWARD/DOWNWARD) = traverse along the curve (change col)
 *
 * Audio:
 *   - Pitch: derived from density values of the reference violin (row 0)
 *     for consistent pitch scaling across all violins
 *   - Volume: derived from the current violin's density at current position,
 *     normalized to 0-1 via volumeScale
 *
 * Extends AbstractTrace directly (no SmoothTrace/LineTrace dependency).
 */
export class ViolinKdeTrace extends AbstractTrace {
  protected readonly supportsExtrema = false;
  protected readonly movable: Movable;

  private readonly points: ViolinKdePoint[][];
  private readonly densityValues: number[][];
  private readonly yValues: number[][];
  protected readonly highlightValues: SVGElement[][] | null;
  protected highlightCenters:
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null;

  private readonly minDensity: number[];
  private readonly maxDensity: number[];

  constructor(layer: MaidrLayer) {
    super(layer);

    this.points = layer.data as ViolinKdePoint[][];

    // Extract density and y values for each violin
    // Falls back to `width` when `density` is absent (legacy format support)
    this.densityValues = this.points.map(row =>
      row.map(point => point.density ?? point.width ?? 0),
    );
    this.yValues = this.points.map(row =>
      row.map(point => Number(point.y)),
    );

    this.minDensity = this.densityValues.map(row => MathUtil.safeMin(row.filter(d => d > 0)));
    this.maxDensity = this.densityValues.map(row => MathUtil.safeMax(row));

    this.highlightValues = this.mapToSvgElements(layer.selectors as string[]);
    this.highlightCenters = this.mapSvgElementsToCenters();
    this.movable = new MovableGrid<ViolinKdePoint>(this.points, { row: 0 });
  }

  public dispose(): void {
    this.points.length = 0;
    this.densityValues.length = 0;
    this.yValues.length = 0;
    this.minDensity.length = 0;
    this.maxDensity.length = 0;
    super.dispose();
  }

  protected get values(): number[][] {
    return this.densityValues;
  }

  protected get dimension(): Dimension {
    return {
      rows: this.points.length,
      cols: this.points[this.row]?.length ?? 0,
    };
  }

  // ── Navigation ──────────────────────────────────────────────────────

  public override isMovable(target: [number, number] | MovableDirection): boolean {
    if (Array.isArray(target)) {
      const [row, col] = target;
      return (
        row >= 0
        && row < this.points.length
        && col >= 0
        && col < (this.points[row]?.length ?? 0)
      );
    }

    // Swapped navigation for violin plots:
    // FORWARD/BACKWARD check row bounds (switch between violins)
    // UPWARD/DOWNWARD check col bounds (traverse along curve)
    switch (target) {
      case 'FORWARD':
        return this.row < this.points.length - 1;
      case 'BACKWARD':
        return this.row > 0;
      case 'UPWARD':
        return this.col < (this.points[this.row]?.length ?? 0) - 1;
      case 'DOWNWARD':
        return this.col > 0;
    }
  }

  protected handleInitialEntry(): void {
    this.isInitialEntry = false;
    this.row = 0;
    this.col = 0;
  }

  public override moveOnce(direction: MovableDirection): boolean {
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
      case 'FORWARD':
        this.row += 1;
        this.col = 0; // Reset to bottom when switching violins
        this.notifyStateUpdate();
        return true;

      case 'BACKWARD':
        this.row -= 1;
        this.col = 0;
        this.notifyStateUpdate();
        return true;

      case 'UPWARD':
        this.col += 1;
        this.notifyStateUpdate();
        return true;

      case 'DOWNWARD':
        this.col -= 1;
        this.notifyStateUpdate();
        return true;
    }
  }

  // ── Audio ───────────────────────────────────────────────────────────

  protected get audio(): AudioState {
    // Use the first violin (row 0) for reference density => consistent pitch across violins
    const referenceRow = 0;
    const refDensity = this.densityValues[referenceRow];

    if (!refDensity || refDensity.length === 0) {
      // Fallback: empty audio
      return {
        freq: { min: 0, max: 1, raw: 0 },
        panning: { y: this.row, x: this.col, rows: this.points.length, cols: this.points[this.row]?.length ?? 0 },
      };
    }

    const positiveRef = refDensity.filter(d => d > 0);
    if (positiveRef.length === 0) {
      return {
        freq: { min: 0, max: 1, raw: 0 },
        panning: { y: this.row, x: this.col, rows: this.points.length, cols: this.points[this.row]?.length ?? 0 },
      };
    }

    const refMin = Math.min(...positiveRef);
    const refMax = Math.max(...refDensity);

    // Safety: if min===max, widen range to avoid division by zero
    const safeMin = refMin === refMax ? Math.max(0, refMin - MIN_DENSITY_RANGE) : refMin;
    const safeMax = refMin === refMax ? refMax + MIN_DENSITY_RANGE : refMax;

    // Clamp col to reference row bounds for pitch
    const safeCol = Math.min(this.col, refDensity.length - 1);
    const getDensity = (i: number): number =>
      refDensity[Math.max(0, Math.min(i, refDensity.length - 1))];

    const prevDensity = safeCol > 0 ? getDensity(safeCol - 1) : getDensity(safeCol);
    const currDensity = getDensity(safeCol);
    const nextDensity = safeCol < refDensity.length - 1 ? getDensity(safeCol + 1) : getDensity(safeCol);

    // Volume from current violin's density (varies per violin)
    const currentRowDensity = this.densityValues[this.row];
    let volumeScale = 1.0;
    if (currentRowDensity && currentRowDensity.length > 0) {
      const currentCol = Math.min(this.col, currentRowDensity.length - 1);
      const currentDensity = currentRowDensity[currentCol];
      const currentMax = Math.max(...currentRowDensity);

      if (currentMax > 0 && currentDensity > 0) {
        const currentMin = Math.min(...currentRowDensity.filter(d => d > 0));
        const safeCurrentMax = currentMin === currentMax
          ? currentMax + MIN_DENSITY_RANGE
          : currentMax;
        volumeScale = currentDensity / safeCurrentMax;
      }
    }

    return {
      freq: {
        min: safeMin,
        max: safeMax,
        raw: [prevDensity, currDensity, nextDensity],
      },
      panning: {
        y: this.row,
        x: this.col,
        rows: this.points.length,
        cols: this.points[this.row]?.length ?? 0,
      },
      isContinuous: true,
      volumeScale,
    };
  }

  // ── Text ────────────────────────────────────────────────────────────

  protected get text(): TextState {
    const currentPoint = this.points[this.row][this.col];
    const roundTo4 = (num: number): number => Math.round(num * 10000) / 10000;

    // X label: categorical label for the violin
    let xDisplayValue: number | string;
    if (typeof currentPoint.x === 'string') {
      xDisplayValue = currentPoint.x;
    } else {
      // Fallback: try first point in row (all points in a row share same x label)
      const firstInRow = this.points[this.row][0];
      xDisplayValue = typeof firstInRow?.x === 'string'
        ? firstInRow.x
        : `Violin ${this.row + 1}`;
    }

    const roundedY = roundTo4(Number(currentPoint.y));
    const textState: TextState = {
      main: { label: this.xAxis, value: xDisplayValue },
      cross: { label: this.yAxis, value: roundedY },
    };

    // Volume (width) in fill field if available
    const roundedWidth = currentPoint.width !== undefined && currentPoint.width > 0
      ? roundTo4(currentPoint.width)
      : undefined;
    if (roundedWidth !== undefined) {
      textState.fill = { label: 'volume', value: String(roundedWidth) };
    }

    return textState;
  }

  // ── Braille ─────────────────────────────────────────────────────────

  protected get braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: this.densityValues,
      min: this.minDensity,
      max: this.maxDensity,
      row: this.row,
      col: this.col,
    };
  }

  // ── Layer switching ─────────────────────────────────────────────────

  /**
   * Returns the violin index (row) for layer switching.
   */
  public getCurrentXValue(): XValue | null {
    return this.row >= 0 && this.row < this.points.length ? this.row : null;
  }

  /**
   * Moves to the specified violin, resetting to bottom of curve.
   */
  public moveToXValue(xValue: XValue): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    if (typeof xValue !== 'number') {
      return false;
    }

    const violinIndex = Math.floor(xValue);
    if (violinIndex < 0 || violinIndex >= this.points.length) {
      return false;
    }

    const currentViolin = this.row;
    this.row = violinIndex;

    if (violinIndex !== currentViolin) {
      this.col = 0;
    } else {
      const maxCol = this.points[violinIndex]?.length ? this.points[violinIndex].length - 1 : 0;
      this.col = Math.min(this.col, maxCol);
    }

    this.updateVisualPointPosition();
    this.notifyStateUpdate();
    return true;
  }

  /**
   * Returns the current Y value for cross-layer Y preservation.
   */
  public getCurrentYValue(): number | null {
    const rowYValues = this.yValues[this.row];
    if (!rowYValues || rowYValues.length === 0) {
      return null;
    }
    if (this.col >= 0 && this.col < rowYValues.length) {
      return rowYValues[this.col];
    }
    return null;
  }

  /**
   * Moves to a specific violin (X) and closest Y position on the KDE curve.
   */
  public moveToXAndYValue(xValue: XValue, yValue: number): boolean {
    if (typeof xValue !== 'number') {
      return false;
    }

    const violinIndex = Math.floor(xValue);
    if (violinIndex < 0 || violinIndex >= this.yValues.length) {
      return false;
    }

    this.row = violinIndex;
    const rowYValues = this.yValues[this.row];

    if (!rowYValues || rowYValues.length === 0) {
      this.col = 0;
      this.updateVisualPointPosition();
      this.notifyStateUpdate();
      return true;
    }

    // Find closest Y value
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
   * Handles layer switching from the violin box layer.
   * Preserves both violin position (X) and Y value when switching.
   */
  public onSwitchFrom(previousTrace: Trace): boolean {
    const prevState = previousTrace.state;
    const prevType = prevState.empty ? null : prevState.traceType;

    // Only handle switching from violin box layer
    if (prevType !== TraceType.VIOLIN_BOX) {
      return false;
    }

    const xValue = previousTrace.getCurrentXValue();

    if (previousTrace.getCurrentYValue) {
      const yValue = previousTrace.getCurrentYValue();
      if (yValue !== null && xValue !== null) {
        const handled = this.moveToXAndYValue(xValue, yValue);
        if (handled) {
          this.isInitialEntry = false;
        }
        return handled;
      }
    }

    // Fallback: just set X position
    if (xValue !== null) {
      const success = this.moveToXValue(xValue);
      if (success) {
        this.isInitialEntry = false;
      }
      return success;
    }

    return false;
  }

  // ── SVG highlight ───────────────────────────────────────────────────

  protected mapToSvgElements(selectors?: string[]): SVGElement[][] | null {
    if (!selectors || selectors.length === 0) {
      return null;
    }

    const elementsByViolin: SVGElement[][] = [];
    let allFailed = true;

    // Support: one selector per violin (selectors.length === points.length)
    // or single pattern selector (selectors.length === 1)
    const isOnePerViolin = selectors.length === this.points.length;

    for (let r = 0; r < this.points.length; r++) {
      const violinElements: SVGElement[] = [];
      const dataPoints = this.points[r];

      const selector = isOnePerViolin ? selectors[r] : selectors[0];
      if (!selector) {
        elementsByViolin.push([]);
        continue;
      }

      const matchedElements = Svg.selectAllElements(selector, false);
      // Resolve primary element: prefer <use> reference elements, fall back to <path> geometry
      const useElements = matchedElements.filter(el => el instanceof SVGUseElement);
      const pathElements = matchedElements.filter(el => el instanceof SVGPathElement);
      const candidates = useElements.length > 0 ? useElements : pathElements;
      const primaryElement = candidates.length > 0
        ? candidates[isOnePerViolin ? 0 : (r < candidates.length ? r : 0)]
        : null;

      if (primaryElement && dataPoints) {
        for (const point of dataPoints) {
          // Use SVG viewport coordinates when available (from backend)
          const x = point.svg_x;
          const y = point.svg_y;
          if (x !== undefined && y !== undefined && !Number.isNaN(x) && !Number.isNaN(y)) {
            violinElements.push(Svg.createCircleElement(x, y, primaryElement));
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

  protected mapSvgElementsToCenters():
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null {
    if (!this.highlightValues) {
      return null;
    }

    const centers: { x: number; y: number; row: number; col: number; element: SVGElement }[] = [];
    for (let row = 0; row < this.highlightValues.length; row++) {
      for (let col = 0; col < this.highlightValues[row].length; col++) {
        const element = this.highlightValues[row][col];
        if (element) {
          const bbox = element.getBoundingClientRect();
          centers.push({
            x: bbox.x + bbox.width / 2,
            y: bbox.y + bbox.height / 2,
            row,
            col,
            element,
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

  protected updateVisualPointPosition(): void {
    const { row: safeRow, col: safeCol } = this.getSafeIndices();
    this.row = safeRow;
    this.col = safeCol;
  }
}
