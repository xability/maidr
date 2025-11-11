import type { BoxPoint, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import { Orientation } from '@type/grammar';
import { BoxTrace } from './box';

/**
 * ViolinBoxTrace extends BoxTrace to provide violin-specific box plot navigation behavior.
 * When navigating between box plots in violin plots, resets to MIN section (lower point)
 * instead of maintaining the same level.
 */
export class ViolinBoxTrace extends BoxTrace {
  public constructor(layer: MaidrLayer) {
    super(layer);
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
    // Reset to MIN section when entering the box plot
    // For vertical box plots: row 1 = MIN
    // For horizontal box plots: col 1 = MIN
    if (this.orientation === Orientation.VERTICAL) {
      this.row = 1; // MIN section
    } else {
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
        console.log(`[ViolinBoxTrace] Switching box plots: col ${previousCol} -> ${this.col}, resetting row to MIN (1)`);
        this.row = 1;
      }
    } else {
      // Horizontal: row = box plot, col = section
      if (previousRow !== this.row && (direction === 'UPWARD' || direction === 'DOWNWARD')) {
        // Reset to MIN section (col 1) when switching between box plots
        console.log(`[ViolinBoxTrace] Switching box plots: row ${previousRow} -> ${this.row}, resetting col to MIN (1)`);
        this.col = 1;
      }
    }

    this.notifyStateUpdate();
  }
}

