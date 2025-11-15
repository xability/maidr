import type { MaidrLayer } from '@type/grammar';
import type { AudioState, TextState } from '@type/state';
import { LineTrace } from './line';

export class SmoothTrace extends LineTrace {
  public constructor(layer: MaidrLayer) {
    super(layer);
  }

  public moveToXValue(xValue: number): boolean {
    if (this.isInitialEntry) {
      this.handleInitialEntry();
    }

    const points = this.points;
    if (!points || !points.length)
      return false;

    const success = this.navigationService.moveToXValueInPoints(
      points,
      xValue,
      this.moveToIndex.bind(this),
    );

    if (success) {
      this.notifyStateUpdate();
    }
    return success;
  }

  protected audio(): AudioState {
    const rowYValues = this.lineValues[this.row];
    const col = this.col;

    const getY = (i: number): number =>
      rowYValues[Math.max(0, Math.min(i, rowYValues.length - 1))];

    const prev = col > 0 ? getY(col - 1) : getY(col);
    const curr = getY(col);
    const next = col < rowYValues.length - 1 ? getY(col + 1) : getY(col);

    return {
      min: this.min[this.row],
      max: this.max[this.row],
      size: rowYValues.length,
      index: col,
      value: [prev, curr, next],
      isContinuous: true,
      // Only use groupIndex if there are multiple lines (actual multiline smooth plot)
      ...this.getAudioGroupIndex(),
    };
  }

  protected text(): TextState {
    const baseText = super.text();

    // Note: Violin plots are handled by ViolinTrace class, not here
    // This method is for regular smooth plots without density data

    return baseText;
  }

  /**
   * Moves to the next data point that meets the comparison criteria in the specified direction.
   * Used for rotor navigation in compare modes (lower/higher value modes) to find
   * the next point with a lower or higher value relative to the current point.
   * For smooth plots, up/down directions are mapped to horizontal movement along the line.
   *
   * @param direction - The direction to search: 'up' or 'right' moves forward (increasing index),
   *                    'down' or 'left' moves backward (decreasing index)
   * @param type - The comparison type: 'lower' finds points with lower values,
   *               'higher' finds points with higher values
   * @returns true if a matching point was found and the position was updated,
   *          false if no matching point was found in the specified direction
   */
  public moveToNextCompareValue(direction: string, type: 'lower' | 'higher'): boolean {
    const currentGroup = this.row;
    if (currentGroup < 0 || currentGroup >= this.lineValues.length) {
      return false;
    }

    const groupValues = this.lineValues[currentGroup];
    if (!groupValues || groupValues.length === 0) {
      return false;
    }

    const currentIndex = this.col;
    // For smooth plots, map up/down to horizontal movement instead of left/right
    const step = (direction === 'up' || direction === 'right') ? 1 : -1;
    let i = currentIndex + step;

    while (i >= 0 && i < groupValues.length) {
      if (this.compareValues(groupValues[i], groupValues[currentIndex], type)) {
        this.col = i;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        return true;
      }
      i += step;
    }

    return false;
  }

  /**
   * Compares two numeric values based on the specified comparison type.
   * Used for navigation in compare modes (lower/higher value modes) to find
   * the next data point that meets the comparison criteria.
   *
   * @param a - The first value to compare
   * @param b - The second value to compare against
   * @param type - The comparison type: 'lower' checks if a < b, 'higher' checks if a > b
   * @returns true if the comparison condition is met (a < b for 'lower', a > b for 'higher'),
   *          false otherwise
   */
  private compareValues(a: number, b: number, type: 'lower' | 'higher'): boolean {
    if (type === 'lower') {
      return a < b;
    }
    if (type === 'higher') {
      return a > b;
    }
    return false;
  }

  /**
   * Handles rotor-based upward movement for smooth plots.
   * For smooth plots, up arrow moves forward (right) along the line.
   *
   * @param _mode - Optional comparison mode ('lower' or 'higher'), not used for smooth plots
   * @returns true to indicate the movement was handled
   */
  public moveUpRotor(_mode?: 'lower' | 'higher'): boolean {
    // For smooth plots, up arrow should move forward (right) along the line
    this.moveOnce('FORWARD');
    return true;
  }

  /**
   * Handles rotor-based downward movement for smooth plots.
   * For smooth plots, down arrow moves backward (left) along the line.
   *
   * @param _mode - Optional comparison mode ('lower' or 'higher'), not used for smooth plots
   * @returns true to indicate the movement was handled
   */
  public moveDownRotor(_mode?: 'lower' | 'higher'): boolean {
    // For smooth plots, down arrow should move backward (left) along the line
    this.moveOnce('BACKWARD');
    return true;
  }

  /**
   * Handles rotor-based leftward movement for smooth plots.
   * For smooth plots, left arrow moves backward along the line.
   *
   * @param _mode - Optional comparison mode ('lower' or 'higher'), not used for smooth plots
   * @returns true to indicate the movement was handled
   */
  public moveLeftRotor(_mode?: 'lower' | 'higher'): boolean {
    // For smooth plots, left arrow should move backward along the line
    this.moveOnce('BACKWARD');
    return true;
  }

  /**
   * Handles rotor-based rightward movement for smooth plots.
   * For smooth plots, right arrow moves forward along the line.
   *
   * @param _mode - Optional comparison mode ('lower' or 'higher'), not used for smooth plots
   * @returns true to indicate the movement was handled
   */
  public moveRightRotor(_mode?: 'lower' | 'higher'): boolean {
    // For smooth plots, right arrow should move forward along the line
    this.moveOnce('FORWARD');
    return true;
  }

  // Use parent class implementation which parses SVG path/polyline to get coordinates
  // SmoothTraceSvgXY handles the case where points have svg_x/svg_y properties
}
