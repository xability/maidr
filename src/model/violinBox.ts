import type { BoxPoint, BoxSelector, MaidrLayer, ViolinOptions } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { AudioState, BrailleState, DescriptionState, TextState } from '@type/state';
import type { Dimension } from './abstract';
import { BoxplotSection } from '@type/boxplotSection';
import { Orientation } from '@type/grammar';
import { Constant } from '@util/constant';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovableGrid } from './movable';

/**
 * Concrete trace for violin box (summary statistics) layers.
 *
 * This is the box-plot overlay that sits inside a violin plot, showing
 * configurable summary statistics (median, mean, extrema)
 * controlled by ViolinOptions from the backend.
 * Outliers are excluded — violin plots do not produce outliers.
 *
 * Data layout depends on orientation:
 *   - Vertical: boxValues[section][violinIndex] — row=section, col=violin
 *   - Horizontal: boxValues[violinIndex][section] — row=violin, col=section
 *
 * Navigation:
 *   - FORWARD/BACKWARD = switch between violins (resets to MIN section)
 *   - UPWARD/DOWNWARD = traverse between sections within a violin
 *
 * Extends AbstractTrace directly (no BoxTrace dependency).
 */
export class ViolinBoxTrace extends AbstractTrace {
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
  private readonly violinOptions: ViolinOptions;

  private readonly min: number;
  private readonly max: number;

  /** Cached index of MIN section for quick access during navigation. */
  private readonly minSectionIndex: number;

  constructor(layer: MaidrLayer) {
    super(layer);

    this.violinOptions = layer.violinOptions ?? {};
    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    // For horizontal orientation, reverse points to match visual order
    if (this.orientation === Orientation.HORIZONTAL) {
      this.points = [...(layer.data as BoxPoint[])].reverse();
    } else {
      this.points = layer.data as BoxPoint[];
    }

    // Build sections based on violin options
    const { sections, accessors } = this.buildViolinSections();
    this.sections = sections;
    this.boxValues = this.computeBoxValues(accessors);

    // Compute min/max, filtering NaN values
    const flatValues = this.boxValues.map(row =>
      row.flatMap(cell => (Array.isArray(cell) ? cell : [cell])),
    ).map(row => row.filter(v => !Number.isNaN(v)));
    this.min = MathUtil.minFrom2D(flatValues);
    this.max = MathUtil.maxFrom2D(flatValues);

    this.highlightValues = this.mapToSvgElements(layer.selectors as BoxSelector[]);
    if (this.orientation === Orientation.HORIZONTAL) {
      this.highlightValues?.reverse();
    }
    this.highlightCenters = this.mapSvgElementsToCenters();

    this.movable = new MovableGrid<number[] | number>(this.boxValues, { row: 0 });

    // Cache MIN section index (always 0 since outliers are excluded)
    const minIdx = this.sections.indexOf(BoxplotSection.MIN);
    this.minSectionIndex = minIdx >= 0 ? minIdx : 0;
  }

  /**
   * Build sections and accessors based on ViolinOptions.
   * Always includes: MIN, Q1, Q3.
   * Conditionally adds: Q2 (median), MEAN, MAX based on options.
   * Outliers are excluded — violin plots do not produce outliers.
   */
  private buildViolinSections(): {
    sections: string[];
    accessors: ((p: BoxPoint) => number | number[])[];
  } {
    const sections: string[] = [BoxplotSection.MIN];
    const accessors: ((p: BoxPoint) => number | number[])[] = [
      (p: BoxPoint) => p.min,
    ];

    // Q1 (25%) — always included as core box plot statistic
    sections.push(BoxplotSection.Q1);
    accessors.push((p: BoxPoint) => p.q1);

    // showMedian defaults to true if not specified
    if (this.violinOptions.showMedian !== false) {
      sections.push(BoxplotSection.Q2);
      accessors.push((p: BoxPoint) => p.q2);
    }

    // showMean defaults to false if not specified
    if (this.violinOptions.showMean === true) {
      sections.push(BoxplotSection.MEAN);
      accessors.push((p: BoxPoint) => p.mean ?? Number.NaN);
    }

    // Q3 (75%) — always included as core box plot statistic
    sections.push(BoxplotSection.Q3);
    accessors.push((p: BoxPoint) => p.q3);

    // showExtrema defaults to true
    if (this.violinOptions.showExtrema !== false) {
      sections.push(BoxplotSection.MAX);
      accessors.push((p: BoxPoint) => p.max);
    }

    return { sections, accessors };
  }

  /**
   * Compute box values array based on section accessors and orientation.
   */
  private computeBoxValues(
    sectionAccessors: ((p: BoxPoint) => number | number[])[],
  ): (number[] | number)[][] {
    if (this.orientation === Orientation.HORIZONTAL) {
      return this.points.map(point =>
        sectionAccessors.map(accessor => accessor(point)),
      );
    }
    // Vertical: [sections][positions]
    return sectionAccessors.map(accessor =>
      this.points.map(point => accessor(point)),
    );
  }

  /**
   * Gets the description state for the violin box trace.
   * @returns The description state containing chart metadata and data table
   */
  public get description(): DescriptionState {
    const stats: DescriptionState['stats'] = [
      { label: 'Number of groups', value: this.points.length },
      { label: 'Sections', value: this.sections.join(', ') },
      { label: 'Min', value: this.min },
      { label: 'Max', value: this.max },
    ];

    const headers = ['Group', ...this.sections];
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;

    const rows: (string | number)[][] = this.points.map((point, pointIdx) => {
      const sectionValues = this.sections.map((_, sectionIdx) => {
        const value = isHorizontal
          ? this.boxValues[pointIdx]?.[sectionIdx]
          : this.boxValues[sectionIdx]?.[pointIdx];
        if (Array.isArray(value)) {
          return value.join(', ');
        }
        return value ?? '';
      });
      return [point.z, ...sectionValues];
    });

    return {
      chartType: 'violin_box',
      title: this.title,
      axes: this.getDescriptionAxes(),
      stats,
      dataTable: { headers, rows },
    };
  }

  public dispose(): void {
    this.points.length = 0;
    this.sections.length = 0;
    super.dispose();
  }

  protected get values(): (number[] | number)[][] {
    return this.boxValues;
  }

  protected get dimension(): Dimension {
    const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    return {
      rows: isHorizontal ? this.boxValues.length : this.boxValues[this.row]?.length ?? 0,
      cols: isHorizontal ? this.boxValues[this.row]?.length ?? 0 : this.boxValues.length,
    };
  }

  // ── Navigation ──────────────────────────────────────────────────────

  protected handleInitialEntry(): void {
    this.isInitialEntry = false;
    const minSectionIndex = this.minSectionIndex;
    if (this.orientation === Orientation.VERTICAL) {
      this.row = Math.min(minSectionIndex, this.boxValues.length - 1);
      this.col = 0;
    } else {
      this.row = 0;
      this.col = Math.min(minSectionIndex, this.boxValues[0]?.length ?? 1);
    }
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

    const minSectionIndex = this.minSectionIndex;

    if (this.orientation === Orientation.VERTICAL) {
      // col = violin index, row = section index
      if (direction === 'FORWARD') {
        this.col += 1;
        this.row = minSectionIndex;
      } else if (direction === 'BACKWARD') {
        this.col -= 1;
        this.row = minSectionIndex;
      } else {
        // UPWARD/DOWNWARD navigate between sections
        return super.moveOnce(direction);
      }
    } else {
      // row = violin index, col = section index
      if (direction === 'UPWARD') {
        this.row += 1;
        this.col = minSectionIndex;
      } else if (direction === 'DOWNWARD') {
        this.row -= 1;
        this.col = minSectionIndex;
      } else {
        // FORWARD/BACKWARD navigate between sections
        return super.moveOnce(direction);
      }
    }

    this.updateVisualPointPosition();
    this.notifyStateUpdate();
    return true;
  }

  // ── Audio ───────────────────────────────────────────────────────────

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

  // ── Text ────────────────────────────────────────────────────────────

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
      main: { label: mainLabel, value: point.z },
      cross: { label: crossLabel, value: crossValue },
      section,
      mainAxis: isHorizontal ? 'y' : 'x',
      crossAxis: isHorizontal ? 'x' : 'y',
    };
  }

  // ── Braille ─────────────────────────────────────────────────────────

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

  // ── Layer switching ─────────────────────────────────────────────────

  /**
   * Returns the violin index for layer switching.
   */
  public getCurrentXValue(): XValue | null {
    if (this.orientation === Orientation.VERTICAL) {
      return this.col >= 0 ? this.col : null;
    }
    return this.row >= 0 ? this.row : null;
  }

  /**
   * Moves to a violin index, resetting to MIN section.
   */
  public moveToXValue(xValue: XValue): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    if (typeof xValue !== 'number') {
      return false;
    }

    const violinIndex = Math.floor(xValue);
    const values = this.values;
    const minSectionIndex = this.minSectionIndex;

    if (this.orientation === Orientation.VERTICAL) {
      const numViolins = values.length > 0 ? values[0].length : 0;
      if (violinIndex < 0 || violinIndex >= numViolins) {
        return false;
      }
      const currentViolin = this.col;
      this.col = violinIndex;
      if (violinIndex !== currentViolin) {
        this.row = minSectionIndex;
      }
    } else {
      if (violinIndex < 0 || violinIndex >= values.length) {
        return false;
      }
      const currentViolin = this.row;
      this.row = violinIndex;
      if (violinIndex !== currentViolin) {
        this.col = minSectionIndex;
      }
    }

    this.updateVisualPointPosition();
    this.notifyStateUpdate();
    return true;
  }

  /**
   * Returns the current Y value from the box plot section.
   */
  public getCurrentYValue(): number | null {
    const values = this.values;
    if (this.orientation === Orientation.VERTICAL) {
      if (this.row >= 0 && this.row < values.length && this.col >= 0) {
        const rowValues = values[this.row];
        if (Array.isArray(rowValues) && this.col < rowValues.length) {
          const value = rowValues[this.col];
          if (Array.isArray(value)) {
            return value.length > 0 ? value[0] : null;
          }
          return typeof value === 'number' ? value : null;
        }
      }
    } else {
      if (this.row >= 0 && this.row < values.length && this.col >= 0) {
        const rowValues = values[this.row];
        if (Array.isArray(rowValues) && this.col < rowValues.length) {
          const value = rowValues[this.col];
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
   * Moves to a specific violin (X) and finds the closest section matching Y value.
   */
  public moveToXAndYValue(xValue: XValue, yValue: number): boolean {
    if (this.isInitialEntry) {
      this.isInitialEntry = false;
    }

    if (typeof xValue !== 'number') {
      return false;
    }

    const violinIndex = Math.floor(xValue);
    const values = this.values;
    const minSectionIndex = this.minSectionIndex;

    if (this.orientation === Orientation.VERTICAL) {
      const numViolins = values.length > 0 ? values[0].length : 0;
      if (violinIndex < 0 || violinIndex >= numViolins) {
        return false;
      }
      this.col = violinIndex;

      // Find section (row) closest to yValue
      let closestRow = minSectionIndex;
      let minDistance = Infinity;
      for (let row = 0; row < values.length; row++) {
        const rowValues = values[row];
        if (Array.isArray(rowValues) && violinIndex < rowValues.length) {
          const value = rowValues[violinIndex];
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
    } else {
      if (violinIndex < 0 || violinIndex >= values.length) {
        return false;
      }
      this.row = violinIndex;

      // Find section (col) closest to yValue
      let closestCol = minSectionIndex;
      let minDistance = Infinity;
      const rowValues = values[violinIndex];
      if (Array.isArray(rowValues)) {
        for (let col = 0; col < rowValues.length; col++) {
          const value = rowValues[col];
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
    }

    this.updateVisualPointPosition();
    this.notifyStateUpdate();
    return true;
  }

  // ── SVG highlight ───────────────────────────────────────────────────

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

    // Phase 1: Collect all original elements without cloning
    const originals: Array<{
      min: SVGElement | null;
      max: SVGElement | null;
      iq: SVGElement | null;
      q2: SVGElement | null;
      mean: SVGElement | null;
    }> = [];

    selectors.forEach((selector) => {
      const minOriginal = Svg.selectElement(selector.min, false);
      const maxOriginal = Svg.selectElement(selector.max, false);
      const iqOriginal = Svg.selectElement(selector.iq, false);
      const q2Original = Svg.selectElement(selector.q2, false);
      const meanOriginal = selector.mean ? Svg.selectElement(selector.mean, false) : null;

      originals.push({
        min: minOriginal,
        max: maxOriginal,
        iq: iqOriginal,
        q2: q2Original,
        mean: meanOriginal,
      });
    });

    // Phase 2: Clone elements
    originals.forEach((original, boxIdx) => {
      const min = this.cloneElementOrEmpty(original.min);
      const max = this.cloneElementOrEmpty(original.max);
      const q2 = this.cloneElementOrEmpty(original.q2);
      const mean = this.cloneElementOrEmpty(original.mean);

      // Create Q1/Q3 line elements from IQ box (same approach as BoxTrace).
      // Check if IQR direction should be reversed (for gridSVG vertical plots
      // where scale(1,-1) Y-flip inverts getBBox top/bottom edges).
      const isIqrReversed = this.layer.domMapping?.iqrDirection === 'reverse';
      const [q1, q3] = original.iq
        ? (isVertical
            ? isIqrReversed
              ? [
                  Svg.createLineElement(original.iq, 'top'),
                  Svg.createLineElement(original.iq, 'bottom'),
                ]
              : [
                  Svg.createLineElement(original.iq, 'bottom'),
                  Svg.createLineElement(original.iq, 'top'),
                ]
            : [
                Svg.createLineElement(original.iq, 'left'),
                Svg.createLineElement(original.iq, 'right'),
              ])
        : [
            Svg.createEmptyElement('line'),
            Svg.createEmptyElement('line'),
          ];

      // Build sections array matching this.sections (no outlier sections)
      const sectionElements: (SVGElement[] | SVGElement)[] = [];

      // MIN
      sectionElements.push(min);

      // Q1 (25%) — always included
      sectionElements.push(q1);

      // Q2 (median) - only if showMedian !== false
      if (this.violinOptions.showMedian !== false) {
        sectionElements.push(q2);
      }

      // MEAN - only if showMean === true
      if (this.violinOptions.showMean === true) {
        sectionElements.push(mean);
      }

      // Q3 (75%) — always included
      sectionElements.push(q3);

      // MAX - only if showExtrema !== false
      if (this.violinOptions.showExtrema !== false) {
        sectionElements.push(max);
      }

      if (isVertical) {
        sectionElements.forEach((section, sectionIdx) => {
          svgElements[sectionIdx][boxIdx] = section;
        });
      } else {
        svgElements.push(sectionElements);
      }
    });

    return svgElements;
  }

  private cloneElementOrEmpty(original: SVGElement | null): SVGElement {
    if (!original) {
      return Svg.createEmptyElement();
    }
    const clone = original.cloneNode(true) as SVGElement;
    clone.setAttribute(Constant.VISIBILITY, Constant.HIDDEN);
    original.insertAdjacentElement(Constant.AFTER_END, clone);
    return clone;
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
   * Disabled for violin box plots.
   */
  public moveToPoint(_x: number, _y: number): void {
    // Disabled for violin box plots
  }

  protected updateVisualPointPosition(): void {
    const { row: safeRow, col: safeCol } = this.getSafeIndices();
    this.row = safeRow;
    this.col = safeCol;
  }
}
