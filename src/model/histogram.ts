import type { HistogramPoint, MaidrLayer } from '@type/grammar';
import type { TextState } from '@type/state';
import { Orientation } from '@type/grammar';
import { AbstractBarPlot } from './bar';

/**
 * Represents a histogram plot with binned data points
 */
export class Histogram extends AbstractBarPlot<HistogramPoint> {
  /**
   * Creates a new Histogram instance from a MAIDR layer
   * @param layer - The MAIDR layer containing histogram data
   */
  public constructor(layer: MaidrLayer) {
    super(layer, [layer.data as HistogramPoint[]]);
  }

  /**
   * Generates text state for the current histogram bin including range information
   * @returns The text state with bin range data
   */
  protected text(): TextState {
    const isVertical = this.orientation === Orientation.VERTICAL;
    const point = this.points[this.row][this.col];

    const min = isVertical ? point.xMin : point.yMin;
    const max = isVertical ? point.xMax : point.yMax;

    return {
      ...super.text(),
      range: { min, max },
    };
  }

  /**
   * Histogram specific implementation of moving to the next higher/lower value
   * @param direction indicates the direction of search- left (before the current value) and right (after)
   * @param type indicates the value to look for
   * @returns boolean (true: if target was found, false: else)
   */
  protected override moveToNextCompareValue(direction: 'left' | 'right', type: 'lower' | 'higher'): boolean {
    const currentGroup = this.row;
    if (currentGroup < 0 || currentGroup >= this.barValues.length) {
      return false;
    }

    const groupValues = this.barValues[currentGroup];
    if (!groupValues || groupValues.length === 0) {
      return false;
    }

    const currentIndex = this.col;
    const step = direction === 'right' ? 1 : -1;
    let i = currentIndex + step;

    while (i >= 0 && i < groupValues.length) {
      if (this.compare(groupValues[i], groupValues[currentIndex], type)) {
        this.col = i;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        return true;
      }
      i += step;
    }

    return false;
  }
}
