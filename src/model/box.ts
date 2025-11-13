import type { BoxPoint, BoxSelector, MaidrLayer } from '@type/grammar';
import type { AudioState, BrailleState, TextState } from '@type/state';
import { BoxplotSection } from '@type/boxplotSection';
import { Orientation } from '@type/grammar';
import { Constant } from '@util/constant';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';

export class BoxTrace extends AbstractTrace<number[] | number> {
  protected readonly supportsExtrema = false;

  protected readonly points: BoxPoint[];
  private readonly boxValues: (number[] | number)[][];
  protected readonly highlightValues: (SVGElement[] | SVGElement)[][] | null;
  protected highlightCenters:
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null;

  protected readonly orientation: Orientation;
  protected readonly sections: string[];

  private readonly min: number;
  private readonly max: number;

  constructor(layer: MaidrLayer) {
    super(layer);

    this.orientation = layer.orientation ?? Orientation.VERTICAL;

    // For horizontal orientation, reverse points to match visual order (lower-left start)
    // This ensures points[row] will align with boxValues[row] in the subsequent processing
    if (this.orientation === Orientation.HORIZONTAL) {
      this.points = [...(layer.data as BoxPoint[])].reverse();
    } else {
      this.points = layer.data as BoxPoint[];
    }

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

    const flatBoxValues = this.boxValues.map(row =>
      row.flatMap(cell => (Array.isArray(cell) ? cell : [cell])),
    );
    this.min = MathUtil.minFrom2D(flatBoxValues);
    this.max = MathUtil.maxFrom2D(flatBoxValues);

    // this.row = this.boxValues.length - 1;

    // For horizontal orientation, reverse selectors to match reversed points order
    let selectors = layer.selectors as BoxSelector[] | undefined;
    if (this.orientation === Orientation.HORIZONTAL && selectors) {
      selectors = [...selectors].reverse();
    }

    this.highlightValues = this.mapToSvgElements(selectors);

    this.highlightCenters = this.mapSvgElementsToCenters();
  }

  public dispose(): void {
    this.points.length = 0;
    this.sections.length = 0;

    super.dispose();
  }

  public moveToIndex(row: number, col: number): void {
    // No coordinate swap needed - navigation already passes (row, col) matching boxValues structure
    // Vertical: boxValues[section][box] → row=section, col=box
    // Horizontal: boxValues[box][section] → row=box, col=section
    super.moveToIndex(row, col);
  }

  protected get values(): (number[] | number)[][] {
    return this.boxValues;
  }

  protected audio(): AudioState {
    // const isHorizontal = this.orientation === Orientation.HORIZONTAL;
    const value = this.boxValues[this.row][this.col];
    const index = Array.isArray(value)
      ? value.map(v => v - this.min)
      : value - this.min;

    return {
      min: this.min, // min freq
      max: this.max, // max freq
      value, // value, used for freq
      size: this.max - this.min, // panning size
      index, // position in panning
    };
  }

  protected braille(): BrailleState {
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

  protected text(): TextState {
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

    // Phase 1: Collect all original elements without cloning (prevents nth-child() DOM shifts)
    const originals: Array<{
      lowerOutliers: SVGElement[];
      upperOutliers: SVGElement[];
      min: SVGElement | null;
      max: SVGElement | null;
      iq: SVGElement | null;
      q2: SVGElement | null;
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

      originals.push({
        lowerOutliers: lowerOutliersOriginals,
        upperOutliers: upperOutliersOriginals,
        min: minOriginal,
        max: maxOriginal,
        iq: iqOriginal,
        q2: q2Original,
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
   * Clones an SVG element with hidden visibility and inserts it after the original,
   * or returns an empty element if the original is null.
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

  public set_point(direction: 'left' | 'right' | 'up' | 'down', pointIndex: number): void {
    if (direction === 'left' || direction === 'right') {
      this.col = pointIndex;
    } else {
      this.row = pointIndex;
    }
  }

  /**
   * Handles the behavior of the upward arrow key to move between segments within a box plot (within the scope of ROTOR trace).
   * @returns {boolean} True if the move was successful, false otherwise.
   */
  public moveUpRotor(mode: 'lower' | 'higher'): boolean {
    if (this.orientation === Orientation.VERTICAL) {
      this.moveOnce('UPWARD');
      return true;
    }
    return this.moveToNextCompareValue('up', mode);
  }

  public moveDownRotor(mode: 'lower' | 'higher'): boolean {
    if (this.orientation === Orientation.VERTICAL) {
      this.moveOnce('DOWNWARD');
      return true;
    }
    return this.moveToNextCompareValue('down', mode);
  }

  public moveLeftRotor(mode: 'lower' | 'higher'): boolean {
    if (this.orientation === Orientation.HORIZONTAL) {
      this.moveOnce('BACKWARD');
      return true;
    }
    return this.moveToNextCompareValue('left', mode);
  }

  public moveRightRotor(mode: 'lower' | 'higher'): boolean {
    if (this.orientation === Orientation.HORIZONTAL) {
      this.moveOnce('FORWARD');
      return true;
    }
    return this.moveToNextCompareValue('right', mode);
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
}
