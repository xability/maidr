import type { BoxPoint, BoxSelector, MaidrLayer } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { AudioState, BrailleState, TextState } from '@type/state';
import type { Dimension } from './abstract';
import type { Trace } from './plot';
import { BoxplotSection } from '@type/boxplotSection';
import { Orientation, TraceType } from '@type/grammar';
import { Constant } from '@util/constant';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovableGrid } from './movable';

/**
 * Concrete implementation of a box plot trace supporting vertical and horizontal orientations.
 * Handles boxplot sections (min, Q1, Q2, Q3, max, outliers) and rotor-based navigation.
 */
export class BoxTrace extends AbstractTrace {
  protected readonly supportsExtrema = false;
  protected readonly movable: Movable;

  private readonly points: BoxPoint[];
  private readonly boxValues: (number[] | number)[][];
  protected readonly highlightValues: (SVGElement[] | SVGElement)[][] | null;
  protected highlightCenters:
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null;

  private readonly orientation: Orientation;
  private readonly sections: string[];

  private readonly min: number;
  private readonly max: number;

  private readonly isViolinBoxPlot: boolean;
  private readonly isMplViolinBoxPlot: boolean;
  private readonly violinShowMeans: boolean;
  private readonly violinShowMedians: boolean;

  constructor(layer: MaidrLayer, isViolinPlot: boolean = false) {
    super(layer);

    /**
     * Violin detection hint.
     *
     * The subplot-level structural detection (BOX + SMOOTH in same subplot)
     * is performed upstream (in `Subplot`) and passed in as `isViolinPlot`.
     * This keeps the trace constructor free from needing access to the full
     * layers array while still enabling violin-specific behavior.
     */
    this.isViolinBoxPlot = isViolinPlot && layer.type === TraceType.BOX;

    /**
     * Distinguish Matplotlib vs Seaborn violin box layers.
     *
     * Python passes a `violinLayer` hint in the schema. For Matplotlib
     * `Axes.violinplot`, this is set to "mpl_violin". We use this hint
     * so that Matplotlib violins expose only min/median/max in text,
     * matching Matplotlib's visual defaults (no quartiles), while Seaborn
     * violins (with inner='box') still expose quartiles.
     */
    const violinLayer = (layer as any).violinLayer as string | undefined;
    this.isMplViolinBoxPlot = this.isViolinBoxPlot && violinLayer === 'mpl_violin';

    const violinOptions = (layer as any).violinOptions as
      | { showMeans?: boolean; showMedians?: boolean; showExtrema?: boolean }
      | undefined;
    this.violinShowMeans = !!(this.isMplViolinBoxPlot && violinOptions?.showMeans);
    this.violinShowMedians = !!(this.isMplViolinBoxPlot && violinOptions?.showMedians);

    this.points = layer.data as BoxPoint[];
    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    // For horizontal orientation, reverse points to match visual order (lower-left start)
    // This ensures points[row] will align with boxValues[row] in the subsequent processing
    if (this.orientation === Orientation.HORIZONTAL) {
      this.points = [...(layer.data as BoxPoint[])].reverse();
    } else {
      this.points = layer.data as BoxPoint[];
    }

    // For regular box plots and Seaborn violins (with visible inner box),
    // expose full Tukey structure including quartiles.
    // For Matplotlib violins, respect showmedians/showmeans flags.
    if (this.isMplViolinBoxPlot) {
      this.sections = [
        BoxplotSection.LOWER_OUTLIER,
        BoxplotSection.MIN,
      ];
      const sectionAccessors: ((p: BoxPoint) => number | number[])[] = [
        (p: BoxPoint) => p.lowerOutliers,
        (p: BoxPoint) => p.min,
      ];

      if (this.violinShowMedians) {
        this.sections.push(BoxplotSection.Q2);
        sectionAccessors.push((p: BoxPoint) => p.q2);
      }

      if (this.violinShowMeans) {
        this.sections.push(BoxplotSection.MEAN);
        sectionAccessors.push((p: BoxPoint) => p.mean ?? Number.NaN);
      }

      this.sections.push(BoxplotSection.MAX);
      this.sections.push(BoxplotSection.UPPER_OUTLIER);
      sectionAccessors.push(
        (p: BoxPoint) => p.max,
        (p: BoxPoint) => p.upperOutliers,
      );

      if (this.orientation === Orientation.HORIZONTAL) {
        this.boxValues = this.points.map(point =>
          sectionAccessors.map(accessor => accessor(point)),
        );
      } else {
        this.boxValues = sectionAccessors.map(accessor =>
          this.points.map(point => accessor(point)),
        );
      }
    } else {
      this.sections = [
        BoxplotSection.LOWER_OUTLIER,
        BoxplotSection.MIN,
        BoxplotSection.Q1,
        BoxplotSection.Q2,
        BoxplotSection.Q3,
        BoxplotSection.MAX,
        BoxplotSection.UPPER_OUTLIER,
      ];

      const sectionAccessors = [
        (p: BoxPoint) => p.lowerOutliers,
        (p: BoxPoint) => p.min,
        (p: BoxPoint) => p.q1,
        (p: BoxPoint) => p.q2,
        (p: BoxPoint) => p.q3,
        (p: BoxPoint) => p.max,
        (p: BoxPoint) => p.upperOutliers,
      ];
      if (this.orientation === Orientation.HORIZONTAL) {
        this.boxValues = this.points.map(point =>
          sectionAccessors.map(accessor => accessor(point)),
        );
      } else {
        this.boxValues = sectionAccessors.map(accessor =>
          this.points.map(point => accessor(point)),
        );
      }
    }

    const flatBoxValues = this.boxValues.map(row =>
      row.flatMap(cell => (Array.isArray(cell) ? cell : [cell])),
    );
    this.min = MathUtil.minFrom2D(flatBoxValues);
    this.max = MathUtil.maxFrom2D(flatBoxValues);

    this.highlightValues = this.mapToSvgElements(
      layer.selectors as BoxSelector[],
    );

    if (this.orientation === Orientation.HORIZONTAL) {
      this.highlightValues?.reverse();
    }

    this.highlightCenters = this.mapSvgElementsToCenters();
    this.movable = new MovableGrid<number[] | number>(this.boxValues, { row: 0 });
  }

  /**
   * Helper method to check if this is a violin box plot.
   * Provides a cleaner API and reduces code duplication.
   */
  private isViolin(): boolean {
    return this.isViolinBoxPlot;
  }

  public dispose(): void {
    this.points.length = 0;
    this.sections.length = 0;

    super.dispose();
  }

  public override moveToIndex(row: number, col: number): boolean {
    // No coordinate swap needed - navigation already passes (row, col) matching boxValues structure
    // Vertical: boxValues[section][box] → row=section, col=box
    // Horizontal: boxValues[box][section] → row=box, col=section
    return super.moveToIndex(row, col);
  }

  /**
   * Override moveOnce for violin box plots to reset to bottom point (MIN section)
   * when switching between violins.
   * For vertical: FORWARD/BACKWARD changes violin (col), reset to MIN section (row = 1)
   * For horizontal: UPWARD/DOWNWARD changes violin (row), reset to MIN section (col = 1)
   */
  protected handleInitialEntry(): void {
    // On initial entry, start at the "bottom" of the box:
    // - Vertical: MIN section (row = 1), first violin (col = 0)
    // - Horizontal: MIN section (col = 1), first violin (row = 0)
    this.isInitialEntry = false;
    if (this.orientation === Orientation.VERTICAL) {
      this.row = Math.min(1, this.boxValues.length - 1);
      this.col = 0;
    } else {
      this.row = 0;
      this.col = Math.min(1, this.boxValues[0]?.length ?? 1);
    }
  }

  public override moveOnce(direction: MovableDirection): boolean {
    // Only apply special behavior for violin box plots
    if (!this.isViolin()) {
      // For regular box plots, use parent implementation
      return super.moveOnce(direction);
    }

    // Handle initial entry
    if (this.isInitialEntry) {
      this.handleInitialEntry();
      this.notifyStateUpdate();
      return true;
    }

    // Check if movement is valid
    if (!this.isMovable(direction)) {
      this.notifyOutOfBounds();
      return false;
    }

    // For violin box plots, reset to MIN section when changing violins
    if (this.orientation === Orientation.VERTICAL) {
      // Vertical: col = violin index, row = section index
      // FORWARD/BACKWARD changes violin (col), reset to MIN section (row = 1)
      if (direction === 'FORWARD') {
        this.col += 1;
        this.row = 1; // Reset to MIN section (bottom point)
      } else if (direction === 'BACKWARD') {
        this.col -= 1;
        this.row = 1; // Reset to MIN section (bottom point)
      } else {
        // UPWARD/DOWNWARD navigate between sections (keep current violin)
        return super.moveOnce(direction);
      }
    } else {
      // Horizontal: row = violin index, col = section index
      // UPWARD/DOWNWARD changes violin (row), reset to MIN section (col = 1)
      if (direction === 'UPWARD') {
        this.row += 1;
        this.col = 1; // Reset to MIN section (bottom point)
      } else if (direction === 'DOWNWARD') {
        this.row -= 1;
        this.col = 1; // Reset to MIN section (bottom point)
      } else {
        // FORWARD/BACKWARD navigate between sections (keep current violin)
        return super.moveOnce(direction);
      }
    }

    this.updateVisualPointPosition();
    this.notifyStateUpdate();
    return true;
  }

  protected get values(): (number[] | number)[][] {
    return this.boxValues;
  }

  protected get audio(): AudioState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const value = this.boxValues[this.row][this.col];
    const index = isHorizontal ? this.col : this.row;

    const panning = Array.isArray(value)
      ? value.length === 0 ? index : value[value.length - 1] - this.min
      : Number.isNaN(value) ? index : value - this.min;
    return {
      freq: {
        min: this.min,
        max: this.max,
        raw: this.boxValues[this.row][this.col],
      },
      panning: {
        x: isHorizontal ? panning : this.row,
        y: isHorizontal ? this.row : panning,
        rows: isHorizontal ? this.boxValues.length : this.max - this.min,
        cols: isHorizontal ? this.max - this.min : this.boxValues.length,
      },
    };
  }

  protected get braille(): BrailleState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const row = isHorizontal ? this.row : this.col;
    const col = isHorizontal ? this.col : this.row;

    return {
      empty: false,
      id: this.id,
      values: this.points,
      min: this.min,
      max: this.max,
      row,
      col,
    };
  }

  protected get text(): TextState {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const point = isHorizontal ? this.points[this.row] : this.points[this.col];

    const mainLabel = isHorizontal ? this.yAxis : this.xAxis;
    const section = isHorizontal
      ? this.sections[this.col]
      : this.sections[this.row];

    const crossLabel = isHorizontal ? this.xAxis : this.yAxis;
    const crossValue = this.boxValues[this.row][this.col];

    return {
      main: { label: mainLabel, value: point.fill },
      cross: { label: crossLabel, value: crossValue },
      section,
    };
  }

  protected get dimension(): Dimension {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    return {
      rows: isHorizontal ? this.boxValues.length : this.boxValues[this.row].length,
      cols: isHorizontal ? this.boxValues[this.row].length : this.boxValues.length,
    };
  }

  private mapToSvgElements(
    selectors: BoxSelector[] | undefined,
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

    // Phase 1: Collect all original elements without cloning (prevents nth-child() DOM shifts)
    const originals: Array<{
      lowerOutliers: SVGElement[];
      upperOutliers: SVGElement[];
      min: SVGElement | null;
      max: SVGElement | null;
      iq: SVGElement | null;
      q2: SVGElement | null;
      mean: SVGElement | null;
    }> = [];

    selectors.forEach((selector) => {
      const lowerOutliersOriginals = selector.lowerOutliers?.flatMap(s =>
        Svg.selectAllElements(s, false),
      ) ?? [];
      const upperOutliersOriginals = selector.upperOutliers?.flatMap(s =>
        Svg.selectAllElements(s, false),
      ) ?? [];

      const minOriginal = Svg.selectElement(selector.min, false);
      const maxOriginal = Svg.selectElement(selector.max, false);
      const iqOriginal = Svg.selectElement(selector.iq, false);
      const q2Original = Svg.selectElement(selector.q2, false);
      const meanOriginal = Svg.selectElement((selector as any).mean, false);

      originals.push({
        lowerOutliers: lowerOutliersOriginals,
        upperOutliers: upperOutliersOriginals,
        min: minOriginal,
        max: maxOriginal,
        iq: iqOriginal,
        q2: q2Original,
        mean: meanOriginal,
      });
    });

    // Phase 2: Clone and create elements from originals (DOM queries complete)
    originals.forEach((original, boxIdx) => {
      const lowerOutliers = original.lowerOutliers.map((el) => {
        const clone = el.cloneNode(true) as SVGElement;
        clone.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
        el.insertAdjacentElement(Constant.AFTER_END, clone);
        return clone;
      });
      const upperOutliers = original.upperOutliers.map((el) => {
        const clone = el.cloneNode(true) as SVGElement;
        clone.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
        el.insertAdjacentElement(Constant.AFTER_END, clone);
        return clone;
      });

      const min = this.cloneElementOrEmpty(original.min);
      const max = this.cloneElementOrEmpty(original.max);
      const q2 = this.cloneElementOrEmpty(original.q2);
      const mean = this.cloneElementOrEmpty(original.mean);

      // Only create line elements if iq selector exists and element was found
      // If iq is empty/missing, create empty line elements instead
      // Check if IQR direction should be reversed (for Base R vertical boxplots)
      const isIqrReversed = this.layer.domMapping?.iqrDirection === 'reverse';
      const [q1, q3] = original.iq
        ? (isVertical
            ? isIqrReversed
              ? [
                  Svg.createLineElement(original.iq, 'top'), // Q1 (25%) = top edge (reversed)
                  Svg.createLineElement(original.iq, 'bottom'), // Q3 (75%) = bottom edge (reversed)
                ]
              : [
                  Svg.createLineElement(original.iq, 'bottom'), // Q1 (25%) = bottom edge (default)
                  Svg.createLineElement(original.iq, 'top'), // Q3 (75%) = top edge (default)
                ]
            : [
                Svg.createLineElement(original.iq, 'left'), // Q1 (25%) = left boundary
                Svg.createLineElement(original.iq, 'right'), // Q3 (75%) = right boundary
              ])
        : [
            Svg.createEmptyElement('line'), // Empty line element for Q1
            Svg.createEmptyElement('line'), // Empty line element for Q3
          ];

      const sections = this.isMplViolinBoxPlot
        ? (() => {
            const s: (SVGElement[] | SVGElement)[] = [
              lowerOutliers,
              min,
            ];
            if (this.violinShowMedians) {
              s.push(q2);
            }
            if (this.violinShowMeans) {
              s.push(mean);
            }
            s.push(max, upperOutliers);
            return s;
          })()
        : [lowerOutliers, min, q1, q2, q3, max, upperOutliers];

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
   * Clones an SVG element with hidden visibility or returns an empty element.
   * @param original - The original SVG element to clone or null
   * @returns The cloned element or an empty element
   */
  private cloneElementOrEmpty(original: SVGElement | null): SVGElement {
    if (!original) {
      return Svg.createEmptyElement();
    }
    const clone = original.cloneNode(true) as SVGElement;
    clone.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
    original.insertAdjacentElement(Constant.AFTER_END, clone);
    return clone;
  }

  /**
   * Moves to the next boxplot section that matches the comparison criteria.
   * @param direction - The direction to move (left, right, up, or down)
   * @param type - The comparison type (lower or higher)
   * @returns True if a target was found, false otherwise
   */
  public moveToNextCompareValue(direction: 'left' | 'right' | 'up' | 'down', type: 'lower' | 'higher'): boolean {
    const currentGroup = this.row;
    if (currentGroup < 0 || currentGroup >= this.boxValues.length) {
      return false;
    }
    let values: any[] = [];
    let currentIndex = 0;

    if (direction === 'left' || direction === 'right') {
      values = this.boxValues[this.row];
      currentIndex = this.col;
    } else {
      values = this.boxValues.map(box => box[this.col]);
      currentIndex = this.row;
    }
    if (values.length <= 0) {
      return false;
    }

    const step = direction === 'right' || direction === 'up' ? 1 : -1;
    let i = currentIndex + step;

    while (i >= 0 && i < values.length) {
      const current_value = values[currentIndex];
      const next_value = values[i];
      if (Array.isArray(next_value) || Array.isArray(current_value)) {
        return true;
      }

      if (this.compare(next_value, current_value, type)) {
        this.set_point(direction, i);
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        return true;
      }
      i += step;
    }

    return false;
  }

  /**
   * Sets the current point based on direction and index.
   * @param direction - The direction of movement (left, right, up, or down)
   * @param pointIndex - The index to set
   */
  public set_point(direction: 'left' | 'right' | 'up' | 'down', pointIndex: number): void {
    if (direction === 'left' || direction === 'right') {
      this.col = pointIndex;
    } else {
      this.row = pointIndex;
    }
  }

  /**
   * Moves upward in rotor mode within boxplot segments.
   * @param mode - The comparison mode (lower or higher)
   * @returns True if the move was successful, false otherwise
   */
  public moveUpRotor(mode: 'lower' | 'higher'): boolean {
    if (this.orientation === Orientation.VERTICAL) {
      this.moveOnce('UPWARD');
      return true;
    }
    return this.moveToNextCompareValue('up', mode);
  }

  /**
   * Moves downward in rotor mode within boxplot segments.
   * @param mode - The comparison mode (lower or higher)
   * @returns True if the move was successful, false otherwise
   */
  public moveDownRotor(mode: 'lower' | 'higher'): boolean {
    if (this.orientation === Orientation.VERTICAL) {
      this.moveOnce('DOWNWARD');
      return true;
    }
    return this.moveToNextCompareValue('down', mode);
  }

  /**
   * Moves left in rotor mode within boxplot segments.
   * @param mode - The comparison mode (lower or higher)
   * @returns True if the move was successful, false otherwise
   */
  public moveLeftRotor(mode: 'lower' | 'higher'): boolean {
    if (this.orientation === Orientation.HORIZONTAL) {
      this.moveOnce('BACKWARD');
      return true;
    }
    return this.moveToNextCompareValue('left', mode);
  }

  /**
   * Moves right in rotor mode within boxplot segments.
   * @param mode - The comparison mode (lower or higher)
   * @returns True if the move was successful, false otherwise
   */
  public moveRightRotor(mode: 'lower' | 'higher'): boolean {
    if (this.orientation === Orientation.HORIZONTAL) {
      this.moveOnce('FORWARD');
      return true;
    }
    return this.moveToNextCompareValue('right', mode);
  }

  /**
   * Maps SVG elements to their center coordinates for proximity detection.
   * @returns Array of center points with element references or null if no elements exist
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
   * Finds the nearest boxplot element at the specified coordinates.
   * @param x - The x-coordinate
   * @param y - The y-coordinate
   * @returns Object containing the element and its position, or null if not found
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

  /**
   * Moves to the nearest point at the specified coordinates (disabled for boxplots).
   * @param _x - The x-coordinate
   * @param _y - The y-coordinate
   */
  public moveToPoint(_x: number, _y: number): void {
    // Exceptions:
    // temp: don't run for boxplot. remove when boxplot is fixed

    // const nearest = this.findNearestPoint(x, y);
    // if (nearest) {
    // if (this.isPointInBounds(x, y, nearest)) {
    /// / don't move if we're already there
    // if (this.row === nearest.row && this.col === nearest.col) {
    // return;
    // }
    // this.moveToIndex(nearest.row, nearest.col);
    // }
    // }
  }

  /**
   * Override to return the violin index (numeric) for layer switching.
   * For violin box plots (vertical): col represents violin index.
   * For violin box plots (horizontal): row represents violin index.
   * Only applicable for violin box plots.
   *
   * @returns The violin index as a number for violin box plots. For vertical box plots, returns the column index.
   *          For horizontal box plots, returns the row index. For regular box plots, returns the parent implementation
   *          result (which may be a string or number). Returns null if the position is invalid.
   */
  public getCurrentXValue(): XValue | null {
    // Only applicable for violin box plots
    if (!this.isViolin()) {
      // Not a violin box plot, use parent implementation
      return super.getCurrentXValue();
    }

    // For vertical box plots: col = which violin
    // For horizontal box plots: row = which violin
    if (this.orientation === Orientation.VERTICAL) {
      return this.col >= 0 ? this.col : null;
    } else {
      return this.row >= 0 ? this.row : null;
    }
  }

  /**
   * Override moveToXValue for violin box plots to reset to bottom point (MIN section)
   * when moving to a different violin.
   * For vertical: sets col (violin index) and resets row to 1 (MIN section)
   * For horizontal: sets row (violin index) and resets col to 1 (MIN section)
   */
  public moveToXValue(xValue: XValue): boolean {
    // Only apply special behavior for violin box plots
    if (!this.isViolin()) {
      // For regular box plots, use parent implementation
      return super.moveToXValue(xValue);
    }

    // Handle initial entry
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    // xValue must be a number (violin index)
    if (typeof xValue !== 'number') {
      return false;
    }

    const violinIndex = Math.floor(xValue);
    const values = this.values;

    if (this.orientation === Orientation.VERTICAL) {
      // For vertical: col = violin index, row = section index
      const numViolins = values.length > 0 ? values[0].length : 0;
      if (violinIndex < 0 || violinIndex >= numViolins) {
        return false;
      }

      // Store current violin to check if we're moving to a different one
      const currentViolin = this.col;

      // Move to the violin (col)
      this.col = violinIndex;

      // If we moved to a different violin, reset to MIN section (row = 1, bottom point)
      // Otherwise, preserve the current section (row)
      if (violinIndex !== currentViolin) {
        this.row = 1; // Reset to MIN section (bottom point)
      }

      this.updateVisualPointPosition();
      this.notifyStateUpdate();
      return true;
    } else {
      // For horizontal: row = violin index, col = section index
      if (violinIndex < 0 || violinIndex >= values.length) {
        return false;
      }

      // Store current violin to check if we're moving to a different one
      const currentViolin = this.row;

      // Move to the violin (row)
      this.row = violinIndex;

      // If we moved to a different violin, reset to MIN section (col = 1, bottom point)
      // Otherwise, preserve the current section (col)
      if (violinIndex !== currentViolin) {
        this.col = 1; // Reset to MIN section (bottom point)
      }

      this.updateVisualPointPosition();
      this.notifyStateUpdate();
      return true;
    }
  }

  /**
   * Get the current Y value from the box plot.
   * This is used when switching to KDE layer to preserve the Y level.
   * Only applicable for violin box plots.
   *
   * @returns The current Y value from the box plot section at the current position.
   *          For outliers (arrays), returns the first value. Returns null if the position
   *          is invalid, if the value cannot be determined, or if this is not a violin box plot.
   */
  public getCurrentYValue(): number | null {
    // Only applicable for violin box plots
    if (!this.isViolin()) {
      return null;
    }

    const values = this.values;
    if (this.orientation === Orientation.VERTICAL) {
      // For vertical: row = section index, col = violin index
      if (this.row >= 0 && this.row < values.length && this.col >= 0) {
        const rowValues = values[this.row];
        if (Array.isArray(rowValues) && this.col < rowValues.length) {
          const value = rowValues[this.col];
          // Handle arrays (outliers) - use first value
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
          // Handle arrays (outliers) - use first value
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
   * Move to a specific violin (X value) and find the closest box plot section
   * with the given Y value. This is used when switching from KDE layer to preserve Y level.
   * Only applicable for violin box plots.
   *
   * @param xValue - The violin index (X value) to move to. Must be a numeric index.
   *                 String values are not supported.
   * @param yValue - The Y value to find the closest matching box plot section for
   * @returns true if the move was successful (valid violin index and closest section found),
   *          false if xValue is not a number, if the violin index is out of bounds,
   *          or if this is not a violin box plot
   */
  public moveToXAndYValue(xValue: XValue, yValue: number): boolean {
    // Only applicable for violin box plots
    if (!this.isViolin()) {
      return false;
    }

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
   * Handle switching from another trace.
   * Implements special handling for switching from violin KDE layer
   * to preserve both violin position (X) and Y value.
   * Only applicable for violin box plots.
   *
   * @param previousTrace - The trace we're switching from
   * @returns true if handled (switching from violin KDE to violin box), false otherwise
   */
  public onSwitchFrom(previousTrace: Trace): boolean {
    // Only applicable for violin box plots
    if (!this.isViolin()) {
      return false; // Not a violin box plot, use default behavior
    }

    // Check if switching from violin KDE layer (SMOOTH type)
    // Since we're in violin box plot, if switching from SMOOTH type in same subplot, it's the violin KDE
    const prevTraceAny = previousTrace as any;
    const prevTraceType = prevTraceAny.type || prevTraceAny.state?.traceType;

    const isFromViolinKdeLayer = prevTraceType === 'smooth';

    if (!isFromViolinKdeLayer) {
      return false; // Don't handle - use default behavior
    }

    // Get X and Y values from KDE layer
    const xValue = previousTrace.getCurrentXValue();

    if (previousTrace.getCurrentYValue) {
      const yValue = previousTrace.getCurrentYValue();

      if (yValue !== null && xValue !== null && this.moveToXAndYValue) {
        // Use moveToXAndYValue to preserve both violin position and Y level
        const handled = this.moveToXAndYValue(xValue, yValue);
        if (handled) {
          // We've explicitly positioned the trace; skip initial-entry behavior
          this.isInitialEntry = false;
        }
        return handled;
      }
    }

    // Fallback: if Y value extraction failed, just set X position
    // BoxTrace extends AbstractTrace which has moveToXValue
    if (xValue !== null) {
      const success = this.moveToXValue(xValue);
      if (success) {
        this.isInitialEntry = false;
      }
      return success; // Return true if move was successful
    }

    return false; // Let context handle default behavior
  }
}
