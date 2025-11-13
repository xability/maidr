import type { BoxPoint, BoxSelector, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { XValue } from '@type/navigation';
import { Orientation } from '@type/grammar';
import { Svg } from '@util/svg';
import { BoxTrace } from './box';

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
      const [q1, q3] = isVertical
        ? [
            Svg.createLineElement(iq, 'bottom'),
            Svg.createLineElement(iq, 'top'),
          ]
        : [
            Svg.createLineElement(iq, 'left'),
            Svg.createLineElement(iq, 'right'),
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

